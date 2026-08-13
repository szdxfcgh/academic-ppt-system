from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def image_signature(path: Path, size: tuple[int, int] = (64, 36)) -> np.ndarray:
    image = Image.open(path).convert("L").resize(size).filter(ImageFilter.GaussianBlur(radius=2.5))
    return np.asarray(image, dtype=np.float64) / 255.0


def structural_similarity(a: np.ndarray, b: np.ndarray) -> float:
    c1, c2 = 0.01**2, 0.03**2
    mean_a, mean_b = a.mean(), b.mean()
    var_a, var_b = a.var(), b.var()
    covariance = ((a - mean_a) * (b - mean_b)).mean()
    return float(((2 * mean_a * mean_b + c1) * (2 * covariance + c2)) / ((mean_a**2 + mean_b**2 + c1) * (var_a + var_b + c2)))


def rolling_similarity(paths: list[Path], window: int = 5) -> list[dict]:
    signatures = [image_signature(path) for path in paths]
    results = []
    for start in range(0, max(0, len(signatures) - window + 1)):
        block = signatures[start : start + window]
        pairs = [structural_similarity(block[i], block[i + 1]) for i in range(len(block) - 1)]
        results.append({"slides": [start + 1, start + window], "mean_ssim": round(sum(pairs) / len(pairs), 5)})
    return results


def inspect_layouts(layout_dir: Path) -> dict:
    slides = []
    for path in sorted(layout_dir.glob("slide-*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        shapes = payload.get("shapes") or payload.get("elements") or []
        slides.append({"slide": len(slides) + 1, "shape_count": len(shapes)})
    return {"slides": slides, "average_shapes": round(sum(item["shape_count"] for item in slides) / len(slides), 2) if slides else 0}
