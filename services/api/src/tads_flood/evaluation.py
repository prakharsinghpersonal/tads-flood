"""Independent masked evaluation. Never imported by the live inference pipeline."""
import numpy as np


def mask_metrics(prediction, reference, valid):
    prediction, reference, valid = map(np.asarray, (prediction, reference, valid))
    if prediction.shape != reference.shape or prediction.shape != valid.shape:
        raise ValueError("Evaluation masks must have the same aligned shape")
    if any(value.dtype != bool for value in (prediction, reference, valid)):
        raise ValueError("Evaluation requires explicit boolean masks")
    count = int(valid.sum())
    if not count:
        return {"valid_cells": 0, "iou": None, "precision": None, "recall": None,
                "f1": None, "warning": "No independent valid reference coverage"}
    p, r = prediction[valid], reference[valid]
    tp, fp, fn, tn = (int((p & r).sum()), int((p & ~r).sum()), int((~p & r).sum()), int((~p & ~r).sum()))
    divide = lambda numerator, denominator: numerator / denominator if denominator else None
    return {"valid_cells": count, "true_positive": tp, "false_positive": fp,
            "false_negative": fn, "true_negative": tn, "iou": divide(tp, tp + fp + fn),
            "precision": divide(tp, tp + fp), "recall": divide(tp, tp + fn),
            "f1": divide(2 * tp, 2 * tp + fp + fn),
            "warning": "Reference coverage must be independent of threshold selection and inference inputs"}
