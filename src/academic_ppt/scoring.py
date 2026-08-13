from __future__ import annotations


WEIGHTS = {
    "content_storyline": 14,
    "academic_accuracy": 14,
    "information_selection": 8,
    "page_expression": 8,
    "visual_design": 10,
    "graphic_expression": 8,
    "data_visualization": 10,
    "authentic_evidence": 8,
    "cross_slide_consistency": 5,
    "visual_rhythm": 5,
    "engineering_quality": 6,
    "presentation_usability": 4,
}


def calculate(run_id: str, assessments: dict[str, dict]) -> dict:
    dimensions = []
    numerator = denominator = covered = 0.0
    hard_fail = False
    for key, weight in WEIGHTS.items():
        item = assessments.get(key, {"status": "N/A", "fraction": 0, "evidence": "not assessed"})
        status = item["status"]
        fraction = float(item.get("fraction", 0))
        if status != "N/A":
            denominator += weight
            covered += weight
            numerator += weight * max(0, min(1, fraction))
        if status == "FAIL" and item.get("hard_fail", False):
            hard_fail = True
        dimensions.append({"id": key, "weight": weight, "status": status, "score": round(weight * fraction, 2) if status != "N/A" else 0, "evidence": item.get("evidence", "")})
    coverage = covered / sum(WEIGHTS.values())
    normalized = round(100 * numerator / denominator, 2) if denominator else 0
    if coverage < 0.85:
        grade = "UNRATED"
    elif normalized >= 90:
        grade = "S"
    elif normalized >= 80:
        grade = "A"
    elif normalized >= 70:
        grade = "B"
    elif normalized >= 60:
        grade = "C"
    else:
        grade = "D"
    status_map = {item["id"]: item["status"] for item in dimensions}
    recommend = normalized >= 80 and not hard_fail and status_map["academic_accuracy"] == "PASS" and status_map["engineering_quality"] == "PASS" and status_map["authentic_evidence"] != "FAIL"
    return {"run_id": run_id, "dimensions": dimensions, "coverage": round(coverage, 4), "normalized_score": normalized, "grade": grade, "recommend_release": recommend}
