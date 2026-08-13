from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


WEIGHTS = {
    "content_fit": 0.35,
    "evidence_fit": 0.25,
    "rhythm": 0.20,
    "readability": 0.10,
    "editability": 0.10,
}

SIGNATURES = {
    "HERO_FULLBLEED",
    "LIGHT_STATEMENT",
    "SECTION_BREAK",
    "FULLWIDTH_CHART",
    "LEFT_METRIC_RIGHT_CHART",
    "BASELINE_DELTA_OURS",
    "IMAGE_DOMINANT",
    "CENTER_DIAGRAM",
    "ASYMMETRIC_2_1",
    "GRID_3",
    "DENSE_MATRIX",
    "TIMELINE_FLOW",
    "EVIDENCE_BOARD",
}


@dataclass(frozen=True)
class Candidate:
    id: str
    content_fit: float
    evidence_fit: float
    rhythm: float
    readability: float
    editability: float
    complexity: int = 1
    hard_gate: bool = True

    def score(self) -> float:
        return sum(getattr(self, key) * weight for key, weight in WEIGHTS.items())


def select_candidate(candidates: Iterable[Candidate]) -> Candidate:
    valid = [candidate for candidate in candidates if candidate.hard_gate]
    if not valid:
        raise ValueError("No composition candidate satisfies the hard gates")
    unknown = [candidate.id for candidate in valid if candidate.id not in SIGNATURES]
    if unknown:
        raise ValueError(f"Unknown layout signatures: {unknown}")
    return sorted(valid, key=lambda candidate: (-candidate.score(), candidate.complexity, candidate.id))[0]


def rhythm_findings(signatures: list[str], densities: list[str]) -> list[dict]:
    findings: list[dict] = []
    for index in range(1, len(signatures)):
        if signatures[index] == signatures[index - 1]:
            findings.append({"severity": "REVIEW", "rule": "SAME_SIGNATURE_2", "slides": [index, index + 1]})
    for index in range(2, len(signatures)):
        if len(set(signatures[index - 2 : index + 1])) == 1:
            findings.append({"severity": "WARNING", "rule": "SAME_LAYOUT_3", "slides": [index - 1, index, index + 1]})
    unique = len(set(signatures))
    if len(signatures) >= 20 and unique < 6:
        findings.append({"severity": "WARNING", "rule": "SIGNATURE_VARIETY_20", "unique": unique})
    elif len(signatures) >= 15 and unique < 5:
        findings.append({"severity": "WARNING", "rule": "SIGNATURE_VARIETY_15", "unique": unique})
    if len(signatures) >= 15 and len(set(densities)) < 3:
        findings.append({"severity": "WARNING", "rule": "DENSITY_VARIETY", "unique": len(set(densities))})
    return findings
