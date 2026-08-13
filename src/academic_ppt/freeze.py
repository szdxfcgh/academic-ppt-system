from __future__ import annotations

from pathlib import Path

from .inventory import verify_unchanged
from .util import read_json, sha256, utc_now


def build_manifest(run_dir: Path) -> dict:
    source = read_json(run_dir / "source_manifest.json")
    qa = read_json(run_dir / "qa.json")
    score = read_json(run_dir / "score.json")
    if verify_unchanged(source):
        raise RuntimeError("Source drift detected")
    if qa["status"] != "PASS" or not score["recommend_release"]:
        raise RuntimeError("QA or score gate did not pass")
    artifact_paths = [run_dir / "output.pptx", *sorted((run_dir / "renders").glob("slide-*.png"))]
    return {
        "schema_version": "1.0",
        "run_id": run_dir.name,
        "frozen_at": utc_now(),
        "artifacts": [{"path": str(path), "sha256": sha256(path), "size": path.stat().st_size} for path in artifact_paths],
        "source_manifest_hash": sha256(run_dir / "source_manifest.json"),
        "qa_hash": sha256(run_dir / "qa.json"),
        "score_hash": sha256(run_dir / "score.json"),
        "powerpoint_desktop_status": "POWERPOINT_DESKTOP_NOT_VERIFIED",
    }
