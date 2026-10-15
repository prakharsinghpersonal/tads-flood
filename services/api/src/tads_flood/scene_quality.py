"""Reject incompatible observations before any pixel-level change estimate."""
from dataclasses import dataclass
from datetime import datetime, timezone
from math import isfinite


@dataclass(frozen=True)
class RadarScene:
    product_id: str
    acquired_at: datetime
    relative_orbit: int
    polarization: str
    grid_id: str


def validate_pair(before: RadarScene, after: RadarScene, event_date):
    for scene in (before, after):
        if scene.acquired_at.tzinfo is None:
            raise ValueError("Timezone-aware scene timestamp required")
    event_start = datetime.combine(event_date, datetime.min.time(), tzinfo=timezone.utc)
    if not before.acquired_at < event_start <= after.acquired_at:
        raise ValueError("Scene pair must bracket the event date")
    if before.relative_orbit != after.relative_orbit:
        raise ValueError("Relative orbit mismatch")
    if before.polarization != after.polarization:
        raise ValueError("Polarization mismatch")
    if before.grid_id != after.grid_id:
        raise ValueError("Raster alignment/grid mismatch")


def candidate_water_cells(before_db, after_db, valid, *, drop_db=3.0, water_db=-16.0):
    """Tiny transparent baseline for tests, not validated flood/debris inference.

    Returns None on invalid cells. A newly dark, decreased-backscatter cell is a
    candidate, never a calibrated probability or confirmed flood. Permanent water
    below the absolute threshold before the event is excluded in this toy rule.
    """
    if not (len(before_db) == len(after_db) == len(valid)):
        raise ValueError("Array lengths differ")
    if not isfinite(drop_db) or drop_db <= 0 or not isfinite(water_db):
        raise ValueError("Invalid baseline thresholds")
    return [None if not ok or not isfinite(b) or not isfinite(a)
            else bool(b > water_db and a <= water_db and b - a >= drop_db)
            for b, a, ok in zip(before_db, after_db, valid)]

