"""Noded metric road graph with candidate exposure and bounded snapping.

Geometry-only noding cannot reproduce every OSM node/turn-restriction semantic.
The result preserves this limitation instead of claiming operational routing.
"""
from dataclasses import dataclass

from shapely.geometry import LineString, Point, mapping, shape
from shapely.ops import substring
from shapely.strtree import STRtree

from .errors import PipelineError
from .geo import to_metric, to_wgs84, METHOD_VERSION
from .models import Node, RoadEdge, GraphLocation, IsolationRequest

EXCLUDED_HIGHWAYS = {"footway", "path", "steps", "cycleway", "bridleway", "pedestrian", "proposed", "construction"}


@dataclass
class RoadPart:
    asset_id: str
    part: int
    geometry: object
    properties: dict
    cuts: set

    @property
    def grade(self):
        def flag(key):
            return str(self.properties.get(key, "no")).lower() not in ("no", "false", "0", "none", "")
        return (str(self.properties.get("layer", "0")), flag("bridge"), flag("tunnel"))


def normalize_features(features):
    records = []
    for index, feature in enumerate(features):
        if not isinstance(feature, dict) or feature.get("type") != "Feature" or not feature.get("geometry"):
            raise PipelineError("invalid_geometry", "Infrastructure must contain valid GeoJSON features.")
        try:
            geometry = shape(feature["geometry"])
        except Exception as exc:
            raise PipelineError("invalid_geometry", "Infrastructure geometry cannot be parsed.") from exc
        if geometry.is_empty or not geometry.is_valid:
            raise PipelineError("invalid_geometry", "Infrastructure geometry is empty or invalid.")
        properties = dict(feature.get("properties") or {})
        tags = properties.pop("tags", {})
        if isinstance(tags, list):
            tags = dict(tags)
        if isinstance(tags, dict):
            properties.update(tags)
        identifier = feature.get("id", properties.get("osm_id"))
        if identifier is None:
            raise PipelineError("missing_asset_id", "Infrastructure needs stable source identifiers.")
        records.append((str(identifier), geometry, properties))
    return records


def _intersection_points(geometry):
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Point":
        return [geometry]
    if geometry.geom_type in ("LineString", "LinearRing"):
        return [Point(geometry.coords[0]), Point(geometry.coords[-1])]
    if hasattr(geometry, "geoms"):
        return [point for item in geometry.geoms for point in _intersection_points(item)]
    return []


def build_road_graph(features, epsg, exposure_geometry, valid_geometry, *, source_id,
                     evidence_id, snap_distance_m=200.0, max_roads=5000):
    records = normalize_features(features)
    roads, locations, buildings = [], [], []
    for asset_id, geometry, properties in records:
        metric = to_metric(geometry, epsg)
        # A hospital can also be a building: routing and exposure are separate
        # roles, so classifying it as a facility must not discard its footprint.
        if "building" in properties and metric.geom_type in ("Polygon", "MultiPolygon"):
            buildings.append((asset_id, metric, geometry, properties))
        if "highway" in properties:
            if properties["highway"] in EXCLUDED_HIGHWAYS or properties.get("access") in ("no", "private"):
                continue
            parts = list(metric.geoms) if metric.geom_type == "MultiLineString" else [metric]
            for index, line in enumerate(parts):
                if line.geom_type != "LineString" or line.length <= 0:
                    continue
                cuts = {0.0, float(line.length)}
                cuts.update(float(line.project(Point(x, y))) for x, y, *_ in line.coords)
                roads.append(RoadPart(asset_id, index, line, properties, cuts))
        elif properties.get("amenity") in ("hospital", "clinic"):
            locations.append((asset_id, metric.centroid, "facility", geometry, properties))
        elif properties.get("place") in ("village", "hamlet", "town", "city"):
            locations.append((asset_id, metric.centroid, "settlement", geometry, properties))
    if len(roads) > max_roads or len(locations) > 2000:
        raise PipelineError("graph_budget_exceeded", "Infrastructure graph exceeds the prototype budget.")
    tree = STRtree([road.geometry for road in roads]) if roads else None
    for i, road in enumerate(roads):
        for j in tree.query(road.geometry):
            j = int(j)
            if j <= i:
                continue
            other = roads[j]
            for point in _intersection_points(road.geometry.intersection(other.geometry)):
                a, b = float(road.geometry.project(point)), float(other.geometry.project(point))
                both_endpoints = min(a, road.geometry.length - a) < .01 and min(b, other.geometry.length - b) < .01
                if road.grade == other.grade or both_endpoints:
                    road.cuts.add(a)
                    other.cuts.add(b)
    # Snap to the nearest line and split there, rather than snapping a rural
    # settlement to a distant source-way endpoint.
    snapped = {}
    for asset_id, point, kind, geometry, properties in locations:
        if not roads:
            snapped[(kind, asset_id)] = None
            continue
        road = roads[int(tree.nearest(point))]
        if road.geometry.distance(point) > snap_distance_m:
            snapped[(kind, asset_id)] = None
        else:
            distance = float(road.geometry.project(point))
            road.cuts.add(distance)
            snapped[(kind, asset_id)] = (road.geometry.interpolate(distance), road)

    # Different-grade crossing points use distinct keys except for actual common
    # endpoints, which connect bridge approaches. This is a geometric approximation.
    endpoints = {}
    for road in roads:
        for coord in (road.geometry.coords[0], road.geometry.coords[-1]):
            key = tuple(round(v, 3) for v in coord[:2])
            endpoints.setdefault(key, set()).add(road.grade)
    node_ids, node_points = {}, {}
    def node_for(point, road):
        xy = (round(point.x, 3), round(point.y, 3))
        grade = None if len(endpoints.get(xy, set())) > 1 else road.grade
        key = (xy, grade)
        if key not in node_ids:
            node_id = f"n{len(node_ids)}"
            node_ids[key] = node_id
            node_points[node_id] = point
        return node_ids[key]

    edge_features, edges, unknown_edges, exposed_assets = [], [], set(), set()
    for road in roads:
        distances = sorted(road.cuts)
        for index, (start, end) in enumerate(zip(distances, distances[1:])):
            if end - start < .01:
                continue
            segment = substring(road.geometry, start, end)
            if segment.geom_type != "LineString":
                continue
            edge_id = f"{road.asset_id}:{road.part}:{index}"
            known_fraction = segment.intersection(valid_geometry).length / segment.length
            exposed_length = float(segment.intersection(exposure_geometry).length)
            candidate = exposed_length > 1.0
            status = "candidate_blocked" if candidate else "not_exposed"
            if known_fraction < .95:
                status = "unknown"
                unknown_edges.add(edge_id)
            if candidate:
                exposed_assets.add(road.asset_id)
            from_node = node_for(Point(segment.coords[0]), road)
            to_node = node_for(Point(segment.coords[-1]), road)
            oneway = str(road.properties.get("oneway", "no")).lower()
            directed = oneway in ("yes", "true", "1", "-1", "reverse") or road.properties.get("junction") == "roundabout"
            if oneway in ("-1", "reverse"):
                from_node, to_node = to_node, from_node
            edges.append(RoadEdge(edge_id=edge_id, from_node=from_node, to_node=to_node,
                                  length_m=float(segment.length), directed=directed,
                                  candidate_blocked=candidate, evidence_ids=[evidence_id] if candidate else []))
            edge_features.append({"type": "Feature", "id": edge_id,
                "geometry": mapping(to_wgs84(segment, epsg)), "properties": {
                    "asset_id": road.asset_id, "status": status, "exposed_length_m": exposed_length,
                    "length_m": float(segment.length),
                    "valid_fraction": float(known_fraction), "candidate_blocked": candidate,
                    "evidence_ids": [evidence_id], "source_id": source_id, "method_version": METHOD_VERSION,
                    "highway": road.properties.get("highway"), "bridge": road.properties.get("bridge", "no")}})
    if len(edges) > 30000:
        raise PipelineError("graph_budget_exceeded", "Noded road graph exceeds the prototype budget.")
    settlements, facilities, point_features = [], [], []
    for asset_id, point, kind, geometry, properties in locations:
        snap = snapped[(kind, asset_id)]
        node_id = None
        if snap is not None:
            # Preserve the selected line's grade at coincident bridge/road nodes.
            point_on_road, chosen_road = snap
            xy = (round(point_on_road.x, 3), round(point_on_road.y, 3))
            grade = None if len(endpoints.get(xy, set())) > 1 else chosen_road.grade
            node_id = node_ids.get((xy, grade))
        location = GraphLocation(location_id=asset_id, node_id=node_id)
        (facilities if kind == "facility" else settlements).append(location)
        point_features.append({"type": "Feature", "id": asset_id, "geometry": mapping(to_wgs84(point, epsg)),
            "properties": {"kind": kind, "name": str(properties.get("name", asset_id)),
                           "node_id": node_id, "source_id": source_id,
                           "amenity": properties.get("amenity"),
                           "evidence_ids": [evidence_id], "method_version": METHOD_VERSION}})
    building_features = []
    for asset_id, metric, original, properties in buildings:
        overlap = float(metric.intersection(exposure_geometry).area)
        known_fraction = metric.intersection(valid_geometry).area / metric.area if metric.area > 0 else 0.0
        if overlap > 0:
            exposed_assets.add(asset_id)
        status = "unknown" if known_fraction < .95 else "exposed" if overlap > 0 else "not_exposed"
        building_features.append({"type": "Feature", "id": asset_id, "geometry": mapping(original),
            "properties": {"status": status, "exposed_area_m2": overlap,
                           "source_id": source_id, "evidence_ids": [evidence_id], "method_version": METHOD_VERSION}})
    graph = IsolationRequest(nodes=[Node(node_id=n) for n in node_points], edges=edges,
                              settlements=settlements, facilities=facilities)
    return graph, edge_features, building_features, point_features, unknown_edges, len(exposed_assets)
