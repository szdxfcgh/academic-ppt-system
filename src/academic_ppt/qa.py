from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

from .composition import rhythm_findings
from .util import read_json, sha256, utc_now
from .visual_metrics import rolling_similarity


def package_findings(pptx: Path) -> dict:
    with zipfile.ZipFile(pptx) as archive:
        names = archive.namelist()
        rels = [name for name in names if name.endswith(".rels")]
        external = []
        for name in rels:
            text = archive.read(name).decode("utf-8", errors="ignore")
            if 'TargetMode="External"' in text:
                external.append(name)
        slides = [name for name in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)]
        notes = [name for name in names if re.fullmatch(r"ppt/notesSlides/notesSlide\d+\.xml", name)]
        vba = [name for name in names if name.lower().endswith("vbaproject.bin")]
        ole = [name for name in names if name.startswith("ppt/embeddings/") and not name.lower().endswith((".xlsx", ".xls"))]
    return {"slides": len(slides), "notes": len(notes), "external_relationship_parts": external, "vba": vba, "ole": ole, "sha256": sha256(pptx)}


def run_qa(run_dir: Path) -> dict:
    plan = read_json(run_dir / "layout_plan.json")
    pptx = run_dir / "output.pptx"
    renders = sorted((run_dir / "renders").glob("slide-*.png"))
    signatures = [slide["selected_signature"] for slide in plan["slides"]]
    densities = [slide["density"] for slide in plan["slides"]]
    warnings = rhythm_findings(signatures, densities)
    rolling = rolling_similarity(renders) if len(renders) >= 5 else []
    warnings.extend({"severity": "WARNING", "rule": "BLURRED_SSIM_5", **item} for item in rolling if item["mean_ssim"] >= 0.88)
    package = package_findings(pptx)
    hard = []
    if package["external_relationship_parts"]:
        hard.append({"rule": "EXTERNAL_RELATIONSHIP", "parts": package["external_relationship_parts"]})
    if package["vba"]:
        hard.append({"rule": "VBA_PRESENT"})
    if package["ole"]:
        hard.append({"rule": "OLE_PRESENT"})
    if package["slides"] != len(plan["slides"]):
        hard.append({"rule": "SLIDE_COUNT_MISMATCH", "expected": len(plan["slides"]), "actual": package["slides"]})
    if len(renders) != len(plan["slides"]):
        hard.append({"rule": "RENDER_COUNT_MISMATCH", "expected": len(plan["slides"]), "actual": len(renders)})
    return {
        "schema_version": "1.0",
        "run_id": run_dir.name,
        "generated_at": utc_now(),
        "status": "FAIL" if hard else "PASS",
        "hard_failures": hard,
        "warnings": warnings,
        "package": package,
        "slides": [{"slide": index + 1, "render": str(path), "review": "PENDING_HUMAN"} for index, path in enumerate(renders)],
    }
