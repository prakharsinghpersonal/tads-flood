import numpy as np
import pytest

from tads_flood.evaluation import mask_metrics


def test_independent_mask_metrics_known_confusion_counts():
    p = np.array([1, 1, 0, 0, 1], dtype=bool)
    r = np.array([1, 0, 1, 0, 0], dtype=bool)
    valid = np.array([1, 1, 1, 1, 0], dtype=bool)
    value = mask_metrics(p, r, valid)
    assert value["valid_cells"] == 4
    assert value["iou"] == pytest.approx(1 / 3)
    assert value["precision"] == .5 and value["recall"] == .5 and value["f1"] == .5


def test_no_reference_coverage_is_not_perfect_score():
    value = mask_metrics(np.array([False]), np.array([False]), np.array([False]))
    assert value["iou"] is None and value["valid_cells"] == 0


def test_empty_positive_masks_do_not_inflate_iou():
    value = mask_metrics(np.array([False]), np.array([False]), np.array([True]))
    assert value["iou"] is None


def test_unaligned_or_numeric_reference_rejected():
    with pytest.raises(ValueError):
        mask_metrics(np.array([True]), np.array([True, False]), np.array([True]))
    with pytest.raises(ValueError):
        mask_metrics(np.array([1]), np.array([1]), np.array([1]))
