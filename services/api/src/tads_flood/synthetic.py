"""Computed geographic training assessment: always synthetic, never real evidence."""
from datetime import datetime, timedelta, timezone
import json

import numpy as np
from rasterio.io import MemoryFile
from shapely.geometry import LineString, Point, box, mapping

from .geo import metric_grid, to_wgs84
from .models import AssessmentRequest
from .pipeline import PreparedBundle
from .providers import CatalogScene


def encode_tiff(grid, arrays):
    arrays = np.asarray(arrays, dtype="float32")
    with MemoryFile() as mem:
        with mem.open(driver="GTiff", width=grid.width, height=grid.height, count=len(arrays),
                      dtype="float32", crs=f"EPSG:{grid.epsg}", transform=grid.transform) as dataset:
            dataset.write(arrays)
        return mem.read()


def synthetic_bundle():
    request = AssessmentRequest(bbox=(85.25, 27.85, 85.27, 27.87), event_date="2026-08-26", mode="synthetic")
    grid = metric_grid(request.bbox)
    before = np.full((grid.height, grid.width), 10 ** (-10 / 10), dtype="float32")
    after = before.copy()
    r1, r2 = int(grid.height * .4), int(grid.height * .62)
    c1, c2 = int(grid.width * .44), int(grid.width * .56)
    after[r1:r2, c1:c2] = 10 ** (-22 / 10)
    after[5:10, 5:10] = 10 ** (-2 / 10)
    valid = np.ones_like(before)
    shadow = np.zeros_like(before)
    x0, y0, x1, y1 = grid.bounds
    x = lambda f: x0 + (x1 - x0) * f
    y = lambda f: y0 + (y1 - y0) * f
    features = []
    def feature(identifier, geometry, tags):
        features.append({"type": "Feature", "id": identifier, "geometry": mapping(to_wgs84(geometry, grid.epsg)), "properties": tags})
    feature("training-road-west", LineString([(x(.08), y(.5)), (x(.44), y(.5))]), {"highway": "secondary"})
    feature("training-bridge", LineString([(x(.44), y(.5)), (x(.56), y(.5))]), {"highway": "secondary", "bridge": "yes"})
    feature("training-road-east", LineString([(x(.56), y(.5)), (x(.94), y(.5))]), {"highway": "secondary"})
    feature("training-village-west", Point(x(.12), y(.5)), {"place": "village", "name": "Training settlement West"})
    feature("training-village-east", Point(x(.78), y(.5)), {"place": "village", "name": "Training settlement East"})
    feature("training-village-unsnapped", Point(x(.12), y(.95)), {"place": "hamlet", "name": "Training settlement Unknown"})
    feature("training-hospital", Point(x(.91), y(.5)), {"amenity": "hospital", "name": "Training hospital"})
    feature("training-building", box(x(.47), y(.47), x(.5), y(.5)), {"building": "yes"})
    raw_osm = json.dumps({"type": "FeatureCollection", "features": features}, sort_keys=True).encode()
    btime = datetime(2026, 8, 20, 0, tzinfo=timezone.utc)
    atime = btime + timedelta(days=12)
    bundle = PreparedBundle(
        encode_tiff(grid, [before, valid, shadow]), encode_tiff(grid, [after, valid, shadow]),
        CatalogScene("synthetic-radar-before", btime, 42, "VV", "ASCENDING"),
        CatalogScene("synthetic-radar-after", atime, 42, "VV", "ASCENDING"),
        raw_osm, features, datetime(2026, 8, 25, tzinfo=timezone.utc),
        dem=encode_tiff(grid, [np.full_like(before, 100), valid]), mode="synthetic")
    return request, bundle
