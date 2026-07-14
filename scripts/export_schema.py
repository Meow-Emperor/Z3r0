import subprocess
import sys
from pathlib import Path


ROOT_PATH = Path(__file__).resolve().parents[1]


def main() -> int:
    completed = subprocess.run(
        [sys.executable, "-m", "scripts.schema_export"],
        cwd=ROOT_PATH,
        check=False,
    )
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
