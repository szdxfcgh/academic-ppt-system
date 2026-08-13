from __future__ import annotations

from pathlib import Path
from typing import Iterable

from .util import sha256, utc_now


SENSITIVE_SUFFIXES = {".key", ".pem", ".p12", ".pfx"}
SENSITIVE_NAMES = {".env", "credentials.json", "secrets.json"}


def iter_sources(paths: Iterable[str]) -> Iterable[Path]:
    for raw in paths:
        root = Path(raw).expanduser().resolve()
        if root.is_file():
            yield root
        elif root.is_dir():
            for path in sorted(root.rglob("*")):
                if path.is_file():
                    yield path


def build_inventory(paths: Iterable[str]) -> dict:
    files = []
    for path in iter_sources(paths):
        stat = path.stat()
        sensitive = path.name.lower() in SENSITIVE_NAMES or path.suffix.lower() in SENSITIVE_SUFFIXES
        files.append(
            {
                "path": str(path),
                "sha256": sha256(path),
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
                "sensitive_candidate": sensitive,
                "usage": "EXCLUDED_SENSITIVE" if sensitive else "REVIEW_REQUIRED",
            }
        )
    return {"schema_version": "1.0", "generated_at": utc_now(), "files": files}


def verify_unchanged(manifest: dict) -> list[dict]:
    drift = []
    for item in manifest.get("files", []):
        path = Path(item["path"])
        if not path.exists():
            drift.append({"path": str(path), "reason": "MISSING"})
            continue
        stat = path.stat()
        current = {"sha256": sha256(path), "size": stat.st_size, "mtime_ns": stat.st_mtime_ns}
        expected = {key: item[key] for key in current}
        if current != expected:
            drift.append({"path": str(path), "reason": "CHANGED", "expected": expected, "current": current})
    return drift
