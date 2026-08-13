from __future__ import annotations

import argparse
import json
import platform
import shutil
import sys
from pathlib import Path

import yaml

from .inventory import build_inventory
from .util import repo_root, write_json


PAUSED = "M0_5_COMPLETE_AWAITING_ARCHITECTURE_APPROVAL"


def _project(path: str) -> dict:
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="academic-ppt")
    sub = parser.add_subparsers(dest="command", required=True)
    env = sub.add_parser("environment")
    env_sub = env.add_subparsers(dest="action", required=True)
    env_sub.add_parser("check")
    inventory = sub.add_parser("inventory")
    inventory.add_argument("project")
    for name in ("plan", "build"):
        command = sub.add_parser(name)
        command.add_argument("project")
    for name in ("qa", "score", "freeze"):
        command = sub.add_parser(name)
        command.add_argument("run_id")
    benchmark = sub.add_parser("benchmark")
    benchmark.add_argument("benchmark_id")
    args = parser.parse_args(argv)

    if args.command == "environment":
        print(json.dumps({"python": sys.executable, "python_version": platform.python_version(), "node": shutil.which("node"), "git": shutil.which("git"), "status": PAUSED}, ensure_ascii=False, indent=2))
        return 0
    if args.command == "inventory":
        project = _project(args.project)
        manifest = build_inventory(project["source_paths"])
        output = repo_root() / "work" / f"inventory-{project['project_id']}" / "source_manifest.json"
        write_json(output, manifest)
        print(output)
        return 0
    print(json.dumps({"status": PAUSED, "command": args.command, "message": "Large-scale integration is stopped after M0.5 pending user approval."}, ensure_ascii=False))
    return 6


if __name__ == "__main__":
    raise SystemExit(main())
