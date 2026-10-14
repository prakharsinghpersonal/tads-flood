"""Bounded official-data clients. No user-supplied URLs and no reference layers."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
import re
import time

import httpx
import pyarrow.parquet as parquet
from pyproj import CRS
from shapely import from_wkb, transform as transform_geometry
from shapely.geometry import mapping
from pyproj import Transformer

from .errors import PipelineError
from .geo import MetricGrid
from .scene_quality import RadarScene, validate_pair

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
CATALOG_URL = "https://sh.dataspace.copernicus.eu/catalog/v1/search"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"
PRODUCTS_URL = "https://catalogue.dataspace.copernicus.eu/odata/v1/Products"
OSM_URL = "https://api.heigit.org/ohsome-api/v2-rc/extraction/features.parquet"


def request_bytes(client, method, url, *, cancelled=lambda: False, max_bytes=48_000_000, **kwargs):
    for attempt in range(3):
        if cancelled():
            raise PipelineError("job_cancelled", "Job was cancelled.")
        try:
            with client.stream(method, url, **kwargs) as response:
                if response.status_code in (401, 403):
                    raise PipelineError("provider_auth_denied", "Data provider denied access; check server-side credentials and quota.")
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < 2:
                        time.sleep(.25 * (2 ** attempt))
                        continue
                    raise PipelineError("provider_unavailable", "Provider remains unavailable after bounded retries.", retryable=True)
                if response.status_code >= 400:
                    raise PipelineError("provider_request_rejected", "Provider rejected the documented data request.")
                length = response.headers.get("content-length")
                if length and int(length) > max_bytes:
                    raise PipelineError("provider_size_limit", "Provider response exceeds the prototype byte budget.")
                pieces, size = [], 0
                for piece in response.iter_bytes():
                    if cancelled():
                        raise PipelineError("job_cancelled", "Job was cancelled.")
                    size += len(piece)
                    if size > max_bytes:
                        raise PipelineError("provider_size_limit", "Provider response exceeds the prototype byte budget.")
                    pieces.append(piece)
                return b"".join(pieces)
        except httpx.RequestError as exc:
            if attempt == 2:
                raise PipelineError("provider_network_error", "Provider could not be reached after bounded retries.", retryable=True) from exc
            time.sleep(.25 * (2 ** attempt))
    raise PipelineError("provider_unavailable", "Provider request did not complete.", retryable=True)


def safe_json(raw):
    try:
        return json.loads(raw)
    except (ValueError, TypeError) as exc:
        raise PipelineError("provider_format_error", "Provider response is not valid JSON.") from exc


@dataclass(frozen=True)
class CatalogScene:
    product_id: str
    acquired_at: datetime
    relative_orbit: int
    polarization: str
    orbit_direction: str
    polarization_code: str = "DV"

    def __post_init__(self):
        if not 1 <= self.relative_orbit <= 175 or self.acquired_at.tzinfo is None:
            raise ValueError("Radar scene needs valid explicit relative orbit and timezone")


def select_radar_pair(features, event_date):
    """Require explicit relative-orbit metadata; never guess orbit from names."""
    scenes = []
    for feature in features:
        properties = feature.get("properties", {})
        orbit = properties.get("sat:relative_orbit", properties.get("s1:relative_orbit", properties.get("relativeOrbitNumber")))
        polarization = properties.get("s1:polarization")
        if orbit is None or polarization not in ("DV", "SV", "VV"):
            continue
        try:
            timestamp = datetime.fromisoformat(properties["datetime"].replace("Z", "+00:00"))
            if timestamp.tzinfo is None:
                continue
            scenes.append(CatalogScene(str(feature["id"]), timestamp, int(orbit), "VV",
                                       str(properties.get("sat:orbit_state", "")).upper(), polarization))
        except (KeyError, ValueError, TypeError):
            continue
    event_start = datetime.combine(event_date, datetime.min.time(), tzinfo=timezone.utc)
    before = [s for s in scenes if s.acquired_at < event_start]
    after = [s for s in scenes if s.acquired_at >= event_start]
    pairs = [(b, a) for b in before for a in after
             if b.relative_orbit == a.relative_orbit and b.polarization == a.polarization
             and b.orbit_direction == a.orbit_direction and b.orbit_direction in ("ASCENDING", "DESCENDING")]
    if not pairs:
        raise PipelineError("no_compatible_radar_pair", "No before/after pair with explicit matching orbit metadata is available.")
    return min(pairs, key=lambda pair: ((event_start - pair[0].acquired_at).total_seconds()
                                      + (pair[1].acquired_at - event_start).total_seconds(),
                                      pair[0].product_id, pair[1].product_id))


class CDSEProvider:
    def __init__(self, settings, *, client=None, cancelled=lambda: False):
        self.settings, self.cancelled = settings, cancelled
        self.client = client or httpx.Client(timeout=httpx.Timeout(90, connect=10), follow_redirects=False)
        self._owns_client = client is None
        self._token = None
        self._expires = 0

    def close(self):
        if self._owns_client:
            self.client.close()

    def token(self):
        if self._token and time.monotonic() < self._expires:
            return self._token
        if not self.settings.cdse_client_id or not self.settings.cdse_client_secret:
            raise PipelineError("satellite_not_configured", "Configure CDSE client credentials on the server.")
        raw = request_bytes(self.client, "POST", TOKEN_URL, cancelled=self.cancelled, max_bytes=64000,
            data={"grant_type": "client_credentials", "client_id": self.settings.cdse_client_id,
                  "client_secret": self.settings.cdse_client_secret})
        data = safe_json(raw)
        if not isinstance(data.get("access_token"), str):
            raise PipelineError("provider_auth_format", "Provider did not return an access token.")
        self._token = data["access_token"]
        self._expires = time.monotonic() + max(1, min(float(data.get("expires_in", 300)) - 30, 3600))
        return self._token

    def catalog(self, bbox, start, end, collection="sentinel-1-grd"):
        features, cursor = [], None
        for page in range(6):
            body = {"bbox": list(bbox), "datetime": f"{start.isoformat()}/{end.isoformat()}",
                    "collections": [collection], "limit": 100}
            if cursor is not None:
                body["next"] = cursor
            result = safe_json(request_bytes(self.client, "POST", CATALOG_URL, cancelled=self.cancelled,
                max_bytes=8_000_000, json=body, headers={"Authorization": "Bearer " + self.token()}))
            batch = result.get("features")
            if not isinstance(batch, list):
                raise PipelineError("provider_format_error", "Satellite catalogue did not return features.")
            features.extend(batch)
            cursor = result.get("context", {}).get("next")
            if cursor is None:
                return features
        raise PipelineError("catalogue_budget_exceeded", "Satellite catalogue exceeds the pagination budget.")

    def pair(self, request):
        event = datetime.combine(request.event_date, datetime.min.time(), tzinfo=timezone.utc)
        features = self.catalog(request.bbox, event - timedelta(days=24), event + timedelta(days=18))
        features = self.enrich_orbits(features, event)
        return select_radar_pair(features, request.event_date)

    def enrich_orbits(self, features, event):
        """Resolve omitted relative orbit by exact product name, never a formula.

        https://documentation.dataspace.copernicus.eu/APIs/OData.html
        """
        result = [dict(feature, properties=dict(feature.get("properties", {}))) for feature in features]
        def distance(feature):
            try:
                acquired = datetime.fromisoformat(feature["properties"]["datetime"].replace("Z", "+00:00"))
                return abs((acquired - event).total_seconds())
            except (KeyError, TypeError, ValueError):
                return float("inf")
        lookups = 0
        for feature in sorted(result, key=distance):
            properties = feature["properties"]
            if any(properties.get(key) is not None for key in ("sat:relative_orbit", "s1:relative_orbit", "relativeOrbitNumber")):
                continue
            identifier = str(feature.get("id", ""))
            if not re.fullmatch(r"S1[ABC]_IW_GRDH_1S[DS]V_\d{8}T\d{6}_\d{8}T\d{6}_\d{6}_[0-9A-F]{6}_[0-9A-F]{4}(?:\.SAFE)?", identifier):
                continue
            if lookups >= 32:
                raise PipelineError("orbit_metadata_budget_exceeded", "Orbit metadata exceeds the 32-product lookup budget; use a smaller area/date scope.")
            lookups += 1
            name = identifier if identifier.endswith(".SAFE") else identifier + ".SAFE"
            raw = request_bytes(self.client, "GET", PRODUCTS_URL, cancelled=self.cancelled, max_bytes=256000,
                params={"$filter": f"Collection/Name eq 'SENTINEL-1' and Name eq '{name}'", "$expand": "Attributes", "$top": 2})
            rows = safe_json(raw).get("value", [])
            if not isinstance(rows, list) or len(rows) != 1 or rows[0].get("Name") != name:
                continue
            product = rows[0]
            attributes = {item.get("Name"): item.get("Value") for item in product.get("Attributes", [])}
            try:
                acquired = datetime.fromisoformat(properties["datetime"].replace("Z", "+00:00"))
                actual = datetime.fromisoformat(product["ContentDate"]["Start"].replace("Z", "+00:00"))
                if abs((acquired - actual).total_seconds()) > 1 or attributes.get("operationalMode") != "IW":
                    raise PipelineError("scene_metadata_mismatch", "Exact product metadata does not match the selected radar scene.")
                polarization = {"VV&VH": "DV", "VV": "SV"}.get(attributes.get("polarisationChannels"))
                direction = str(attributes.get("orbitDirection", "")).lower()
                if properties.get("s1:polarization") not in (None, polarization) or properties.get("sat:orbit_state") not in (None, direction):
                    raise PipelineError("scene_metadata_mismatch", "Catalogue polarization or orbit direction conflicts with product metadata.")
                properties.update({"sat:relative_orbit": int(attributes["relativeOrbitNumber"]),
                                   "s1:polarization": polarization, "sat:orbit_state": direction})
            except (KeyError, TypeError, ValueError):
                continue
        return result

    def process(self, grid: MetricGrid, *, data_type, script, acquired_at=None, orbit_direction=None, polarization_code="DV"):
        data = {"type": data_type}
        if acquired_at is not None:
            start, end = acquired_at - timedelta(seconds=1), acquired_at + timedelta(seconds=1)
            data["dataFilter"] = {"timeRange": {"from": start.isoformat(), "to": end.isoformat()}}
        if data_type == "sentinel-1-grd":
            data["dataFilter"].update(acquisitionMode="IW", polarization=polarization_code, orbitDirection=orbit_direction)
            data["processing"] = {"backCoeff": "GAMMA0_TERRAIN", "orthorectify": True,
                                  "demInstance": "COPERNICUS_30", "speckleFilter": {"type": "LEE", "windowSizeX": 5, "windowSizeY": 5}}
        body = {"input": {"bounds": {"bbox": list(grid.bounds), "properties": {
                    "crs": f"http://www.opengis.net/def/crs/EPSG/0/{grid.epsg}"}}, "data": [data]},
                "output": {"width": grid.width, "height": grid.height,
                           "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}]},
                "evalscript": script}
        return request_bytes(self.client, "POST", PROCESS_URL, cancelled=self.cancelled,
                             json=body, headers={"Authorization": "Bearer " + self.token(), "Accept": "image/tiff"})

    def radar(self, grid, scene):
        script = '''//VERSION=3
function setup(){return {input:["VV","dataMask","shadowMask"],output:{bands:3,sampleType:"FLOAT32"}};}
function evaluatePixel(s){return [s.VV,s.dataMask,s.shadowMask];}'''
        return self.process(grid, data_type="sentinel-1-grd", script=script,
                            acquired_at=scene.acquired_at, orbit_direction=scene.orbit_direction, polarization_code=scene.polarization_code)

    def dem(self, grid):
        script = '''//VERSION=3
function setup(){return {input:["DEM","dataMask"],output:{bands:2,sampleType:"FLOAT32"}};}
function evaluatePixel(s){return [s.DEM,s.dataMask];}'''
        return self.process(grid, data_type="dem", script=script)

    def optical(self, grid, request):
        event = datetime.combine(request.event_date, datetime.min.time(), tzinfo=timezone.utc)
        features = self.catalog(request.bbox, event, event + timedelta(days=10), "sentinel-2-l2a")
        clear = [f for f in features if float(f.get("properties", {}).get("eo:cloud_cover", 100)) <= 30]
        if not clear:
            return None, None
        chosen = min(clear, key=lambda f: (f["properties"]["eo:cloud_cover"], f["properties"]["datetime"]))
        acquired = datetime.fromisoformat(chosen["properties"]["datetime"].replace("Z", "+00:00"))
        script = '''//VERSION=3
function setup(){return {input:["B03","B08","B11","SCL","dataMask"],output:{bands:5,sampleType:"FLOAT32"}};}
function evaluatePixel(s){return [s.B03,s.B08,s.B11,s.SCL,s.dataMask];}'''
        return self.process(grid, data_type="sentinel-2-l2a", script=script, acquired_at=acquired), (str(chosen["id"]), acquired)


def decode_osm_parquet(raw, *, max_features=10000):
    try:
        parquet_file = parquet.ParquetFile(BytesIO(raw))
        if parquet_file.metadata.num_rows > max_features:
            raise PipelineError("osm_budget_exceeded", "OSM extraction exceeds the feature budget.")
        table = parquet_file.read()
        metadata = json.loads((table.schema.metadata or {}).get(b"geo", b"{}"))
        column = metadata.get("primary_column", "geometry")
        specification = metadata.get("columns", {}).get(column, {})
        if specification.get("encoding", "WKB") != "WKB":
            raise PipelineError("osm_encoding_unsupported", "OSM extraction must use WKB GeoParquet geometry.")
        if "crs" in specification and specification["crs"] is None:
            raise PipelineError("osm_crs_unknown", "OSM extraction has an unknown CRS.")
        crs = CRS.from_user_input(specification.get("crs", "OGC:CRS84"))
        if table.num_rows > max_features:
            raise PipelineError("osm_budget_exceeded", "OSM extraction exceeds the feature budget.")
        transformer = Transformer.from_crs(crs, 4326, always_xy=True)
        features = []
        for row in table.to_pylist():
            geometry = from_wkb(row.pop(column))
            if crs != CRS.from_user_input("OGC:CRS84"):
                geometry = transform_geometry(geometry, transformer.transform, interleaved=False)
            identifier = row.get("id", row.get("osm_id"))
            if identifier is None:
                raise PipelineError("missing_asset_id", "OSM extraction lacks stable feature identifiers.")
            tags = row.get("tags", {})
            if isinstance(tags, list):
                tags = dict(tags)
            timestamp = row.get("timestamp")
            features.append({"type": "Feature", "id": f"{row.get('osm_type', row.get('type', 'osm'))}/{identifier}",
                             "geometry": mapping(geometry), "properties": {"tags": tags,
                             **({"source_timestamp": timestamp.isoformat() if hasattr(timestamp, "isoformat") else timestamp} if timestamp else {})}})
        return features
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError("osm_format_error", "Historical OSM extraction cannot be decoded as GeoParquet.") from exc


class OhsomeProvider:
    def __init__(self, settings, *, client=None, cancelled=lambda: False):
        self.settings, self.cancelled = settings, cancelled
        self.client = client or httpx.Client(timeout=httpx.Timeout(90, connect=10), follow_redirects=False)
        self._owns_client = client is None

    def close(self):
        if self._owns_client:
            self.client.close()

    def extract(self, request):
        if not self.settings.ohsome_api_key:
            raise PipelineError("historical_osm_not_configured", "Configure a server-side ohsome v2 API key.")
        snapshot = request.event_date - timedelta(days=1)
        raw = request_bytes(self.client, "POST", OSM_URL, cancelled=self.cancelled,
            headers={"authorization": self.settings.ohsome_api_key}, json={"aoi": list(request.bbox),
            "time": snapshot.isoformat(), "clip": False,
            "filter": "highway=* or building=* or amenity=hospital or amenity=clinic or place=village or place=hamlet or place=town or place=city"})
        features = decode_osm_parquet(raw)
        for feature in features:
            timestamp = feature["properties"].get("source_timestamp")
            if timestamp:
                value = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                if value.date() >= request.event_date:
                    raise PipelineError("post_event_osm_rejected", "Extraction includes an OSM version from the event or later.")
        return raw, features, datetime.combine(snapshot, datetime.min.time(), tzinfo=timezone.utc)
