"""Evaluate aligned boolean masks from a separate reference namespace."""
import argparse
import json

import numpy as np

from tads_flood.evaluation import mask_metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prediction", required=True, help="Boolean .npy prediction mask")
    parser.add_argument("--reference", required=True, help="Independent aligned boolean .npy reference")
    parser.add_argument("--valid", required=True, help="Boolean independent-reference valid mask")
    args = parser.parse_args()
    masks = [np.load(path, allow_pickle=False) for path in (args.prediction, args.reference, args.valid)]
    print(json.dumps(mask_metrics(*masks), indent=2))


if __name__ == "__main__":
    main()

