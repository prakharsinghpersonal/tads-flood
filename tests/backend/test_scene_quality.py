from datetime import date, datetime, timezone
from dataclasses import replace

import pytest

from tads_flood.scene_quality import RadarScene, validate_pair, candidate_water_cells


BEFORE = RadarScene("before", datetime(2026, 8, 20, tzinfo=timezone.utc), 15, "VV", "grid-a")
AFTER = RadarScene("after", datetime(2026, 8, 28, tzinfo=timezone.utc), 15, "VV", "grid-a")
EVENT = date(2026, 8, 26)


def test_compatible_pair_brackets_event():
    validate_pair(BEFORE, AFTER, EVENT)


@pytest.mark.parametrize("changes", [
    {"relative_orbit": 16}, {"polarization": "VH"}, {"grid_id": "grid-b"},
    {"acquired_at": datetime(2026, 8, 25, tzinfo=timezone.utc)},
    {"acquired_at": datetime(2026, 8, 28)},
])
def test_incompatible_scenes_rejected(changes):
    with pytest.raises(ValueError):
        validate_pair(BEFORE, replace(AFTER, **changes), EVENT)


def test_water_baseline_preserves_nodata_and_excludes_permanent_water():
    values = candidate_water_cells([-10, -20, -10, -10], [-20, -22, -9, -20], [True, True, True, False])
    assert values == [True, False, False, None]


def test_nonfinite_pixels_are_unknown():
    assert candidate_water_cells([float("nan")], [-20], [True]) == [None]


def test_all_nodata_not_called_dry():
    assert candidate_water_cells([-10], [-20], [False]) == [None]


def test_array_mismatch_rejected():
    with pytest.raises(ValueError):
        candidate_water_cells([1, 2], [1], [True])

