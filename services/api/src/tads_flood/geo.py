"""Metric grids and georeferenced candidate masks, with explicit limitations."""
from dataclasses import dataclass
import math

import numpy as np
from pyproj import CRS, Transformer
from rasterio.features import shapes
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely import transform as transform_geometry

from .errors import PipelineError

METHOD_VERSION = "sar-change-baseline-v1"


@dataclass(frozen=True)
class MetricGrid:
    epsg: int
    bounds: tuple[float, float, float, float]
    width: int
    height: int

    @property
    def transform(self):
        return from_bounds(*self.bounds, self.width, self.height)

    @property
    def pixel_area_m2(self):
        return abs(self.transform.a * self.transform.e)


def metric_grid(bbox, *, resolution_m=20.0, max_side=1024):
    west, south, east, north = bbox
    if not (-80 <= south < north <= 84):
        raise PipelineError("unsupported_projection", "The prototype supports UTM latitudes -80 to 84 degrees.")
    if resolution_m <= 0 or max_side < 2:
        raise ValueError("Invalid grid budget")
    lon, lat = (west + east) / 2, (south + north) / 2
    zone = min(60, max(1, int((lon + 180) // 6) + 1))
    epsg = (32600 if lat >= 0 else 32700) + zone
    transformer = Transformer.from_crs(4326, epsg, always_xy=True)
    # Densified bounds preserve projected curvature instead of just two corners.
    bounds = transformer.transform_bounds(west, south, east, north, densify_pts=21)
    w, h = bounds[2] - bounds[0], bounds[3] - bounds[1]
    effective_resolution = max(resolution_m, w / max_side, h / max_side)
    return MetricGrid(epsg, bounds, min(max_side, max(2, math.ceil(w / effective_resolution))),
                      min(max_side, max(2, math.ceil(h / effective_resolution))))


@dataclass
class RadarRaster:
    backscatter: np.ndarray
    valid: np.ndarray
    transform: object
    crs: CRS


def read_radar_tiff(raw: bytes, expected_grid: MetricGrid):
    try:
        with MemoryFile(raw) as mem, mem.open() as dataset:
            if dataset.crs is None or dataset.count < 2:
                raise PipelineError("invalid_raster", "Radar response needs a CRS, VV band and data mask.")
            if dataset.width != expected_grid.width or dataset.height != expected_grid.height:
                raise PipelineError("grid_mismatch", "Radar dimensions do not match the requested grid.")
            if dataset.crs.to_epsg() != expected_grid.epsg or not dataset.transform.almost_equals(expected_grid.transform):
                raise PipelineError("grid_mismatch", "Radar CRS or alignment differs from the requested grid.")
            backscatter = dataset.read(1)
            valid = (dataset.read(2) > 0) & (dataset.read_masks(1) > 0)
            valid &= np.isfinite(backscatter) & (backscatter > 0)
            if dataset.count >= 3:
                valid &= dataset.read(3) == 0
            return RadarRaster(backscatter, valid, dataset.transform, CRS.from_user_input(dataset.crs))
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError("invalid_raster", "Provider did not return a readable georeferenced radar TIFF.") from exc


def read_aligned_bands(raw: bytes, grid: MetricGrid, count: int):
    try:
        with MemoryFile(raw) as mem, mem.open() as dataset:
            if dataset.crs is None or dataset.crs.to_epsg() != grid.epsg:
                raise PipelineError("grid_mismatch", "Auxiliary raster CRS differs from the radar grid.")
            if dataset.count < count or (dataset.width, dataset.height) != (grid.width, grid.height):
                raise PipelineError("grid_mismatch", "Auxiliary raster dimensions/bands do not match.")
            if not dataset.transform.almost_equals(grid.transform):
                raise PipelineError("grid_mismatch", "Auxiliary raster alignment differs from the radar grid.")
            return dataset.read(list(range(1, count + 1)))
    except PipelineError:
        raise
    except Exception as exc:
        raise PipelineError("invalid_raster", "Auxiliary raster cannot be read.") from exc


@dataclass
class ChangeResult:
    flood: np.ndarray
    disturbance: np.ndarray
    valid: np.ndarray
    polygons: object
    disturbance_polygons: object
    valid_polygons: object
    warnings: list[str]
    valid_fraction: float
    area_m2: float | None


def _polygonize(mask, transform):
    if not mask.any():
        from shapely.geometry import GeometryCollection
        return GeometryCollection()
    pieces = [shape(geometry) for geometry, value in shapes(mask.astype("uint8"), mask=mask, transform=transform) if value == 1]
    if len(pieces) > 20000:
        raise PipelineError("geometry_budget_exceeded", "Candidate mask is too fragmented for the prototype budget.")
    return unary_union(pieces)


def detect_change(before: RadarRaster, after: RadarRaster, grid: MetricGrid,
                  *, dem=None, optical=None, drop_db=3.0, water_db=-16.0,
                  brightening_db=6.0, slope_limit_degrees=30.0):
    if before.backscatter.shape != after.backscatter.shape or before.transform != after.transform or before.crs != after.crs:
        raise PipelineError("grid_mismatch", "Radar scenes must be co-registered before comparison.")
    thresholds = (drop_db, water_db, brightening_db, slope_limit_degrees)
    if not all(math.isfinite(x) for x in thresholds) or drop_db <= 0 or brightening_db <= 0:
        raise ValueError("Invalid thresholds")
    valid = before.valid & after.valid
    warnings = ["Candidate exposure is not confirmed damage, bridge failure or road closure.",
                "Backscatter-change scores are heuristic, not calibrated flood probabilities."]
    if dem is not None:
        if dem.shape != valid.shape:
            raise PipelineError("grid_mismatch", "DEM dimensions differ from the radar grid.")
        dem_valid = np.isfinite(dem)
        dy, dx = np.gradient(dem, abs(grid.transform.e), abs(grid.transform.a))
        slope = np.degrees(np.arctan(np.hypot(dx, dy)))
        valid &= dem_valid & np.isfinite(slope) & (slope <= slope_limit_degrees)
        warnings.append("Steep DEM slopes are masked; full radar layover/shadow modeling is not implemented.")
    else:
        warnings.append("DEM unavailable; terrain-shadow and steep-slope uncertainty is unresolved.")
    with np.errstate(divide="ignore", invalid="ignore"):
        b = 10 * np.log10(before.backscatter)
        a = 10 * np.log10(after.backscatter)
    with np.errstate(invalid="ignore"):
        flood = valid & (b > water_db) & (a <= water_db) & (b - a >= drop_db)
        disturbance = valid & (a - b >= brightening_db)
    if optical is not None:
        # Optical bands are B03, B08, B11, SCL, dataMask; only clear classes
        # corroborate candidates. Cloud-covered cells remain SAR-only.
        if optical.shape != (5, *valid.shape):
            raise PipelineError("grid_mismatch", "Optical bands must match the radar grid.")
        green, nir, swir, scl, mask = optical
        clear = (mask > 0) & np.isin(scl.astype(int), [4, 5, 6])
        with np.errstate(divide="ignore", invalid="ignore"):
            mndwi = (green - swir) / (green + swir)
        # Explicitly flag contradictions; do not silently turn missing optical
        # coverage into a wet/dry decision or erase the SAR baseline.
        contradiction = flood & clear & np.isfinite(mndwi) & (mndwi < 0)
        warnings.append(f"Clear optical coverage fraction: {clear.mean():.3f}; SAR candidates contradicted by optical: {int(contradiction.sum())} cells.")
    else:
        warnings.append("Optical corroboration unavailable; candidate results are SAR-only.")
    fraction = float(valid.mean())
    if fraction == 0:
        warnings.append("No valid jointly covered radar cells; exposure and access are unknown.")
    warnings.append("Brightening is a candidate disturbance layer, not validated debris segmentation.")
    return ChangeResult(flood, disturbance, valid, _polygonize(flood, grid.transform),
                        _polygonize(disturbance, grid.transform), _polygonize(valid, grid.transform),
                        warnings, fraction, float(flood.sum() * grid.pixel_area_m2) if fraction else None)


def to_wgs84(geometry, epsg):
    transformer = Transformer.from_crs(epsg, 4326, always_xy=True)
    return transform_geometry(geometry, transformer.transform, interleaved=False)


def to_metric(geometry, epsg):
    transformer = Transformer.from_crs(4326, epsg, always_xy=True)
    return transform_geometry(geometry, transformer.transform, interleaved=False)


def geometry_features(geometry, grid, *, kind, evidence_id, source_id):
    if geometry.is_empty:
        return []
    components = list(geometry.geoms) if hasattr(geometry, "geoms") else [geometry]
    return [{"type": "Feature", "id": f"{kind}-{i}", "geometry": mapping(to_wgs84(g, grid.epsg)),
             "properties": {"status": "candidate_flood" if kind == "flood" else "candidate_disturbance", "kind": kind, "evidence_ids": [evidence_id],
                            "source_id": source_id, "method_version": METHOD_VERSION,
                            "area_m2": float(g.area)}} for i, g in enumerate(components)]
