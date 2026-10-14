"""Run the combined reproducible checks after installing both lockfiles."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(command, cwd=ROOT):
    print("Running: " + " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", action="store_true", help="Also run installed Playwright Chromium tests")
    args = parser.parse_args()
    steps = [[sys.executable, "-m", "pip", "check"], [sys.executable, "-m", "pytest"],
             [sys.executable, "scripts/export_contracts.py"], ["git", "diff", "--exit-code", "--", "contracts/"]]
    try:
        for command in steps:
            run(command)
        for script in ["typecheck", "test", "build", "check:secrets"]:
            run(["npm", "run", script], ROOT / "apps/web")
        if args.browser:
            run(["npm", "run", "test:e2e"], ROOT / "apps/web")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Workspace check failed. Resolve the command above before releasing.", file=sys.stderr)
        return 1
    print("Requested workspace checks passed. Live-data and model release gates are separate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
