"""Fictional, pre-review queue ranking smoke test; never an election-integrity model."""
from __future__ import annotations

import hashlib
import json
import random
from collections import Counter
from pathlib import Path

from evaluate import REGIONS, features, make_case, robust

SEED = 20261030
KINDS = {"clean": 130, "normal_extreme": 30, "arithmetic": 30,
         "contextual": 40, "transcription": 35, "duplicate_conflict": 20,
         "material_change": 15}
CRITICAL = {"arithmetic", "transcription", "duplicate_conflict"}
POSITIVES = CRITICAL | {"contextual", "material_change"}


def corpus() -> tuple[list[dict], list[dict]]:
    rng = random.Random(SEED)
    train = [make_case(rng, region, "clean") for region in REGIONS for _ in range(180)]
    rows = []
    for region in REGIONS:
        for kind, count in KINDS.items():
            for _ in range(count):
                case = make_case(rng, region, kind if kind in {"clean", "normal_extreme", "arithmetic", "contextual"} else "clean")
                # These are observations available on receipt, not reviewer decisions.
                # They are generated separately from labels and can miss or falsely flag.
                case["kind"] = kind
                case["image_declared"] = rng.random() < .72
                case["image_verified"] = case["image_declared"] and rng.random() < .94
                case["duplicate_digest_count"] = int(case["image_verified"] and rng.random() < (.68 if kind == "duplicate_conflict" else .025))
                case["version"] = 2 if rng.random() < (.70 if kind == "material_change" else .08) else 1
                # A pre-review OCR discrepancy may be proposed only on verified images.
                # This is a simulated sensor, not a human-confirmed discrepancy.
                case["ocr_provisional_mismatch"] = bool(case["image_verified"] and rng.random() < (.72 if kind == "transcription" else .025))
                case["review_worthy"] = kind in POSITIVES
                case["critical"] = kind in CRITICAL
                rows.append(case)
    rng.shuffle(rows)
    return train, rows


def arithmetic(case: dict) -> bool:
    return (sum(case["party_votes"].values()) != case["valid"] or
            case["valid"] + case["rejected"] != case["cast"] or
            case["cast"] > case["accredited"])


def score_rows(train: list[dict], rows: list[dict]) -> dict[str, list[float]]:
    peer = {region: [robust([features(row)[j] for row in train if row["region"] == region])
                     for j in range(4)] for region in REGIONS}
    result = {name: [] for name in ("arithmetic_only", "arithmetic_peer", "evidence_aware", "no_ocr", "no_duplicates")}
    for row in rows:
        rule = arithmetic(row)
        z = max(abs((value - center) / scale) for value, (center, scale)
                in zip(features(row)[1:], peer[row["region"]][1:]))
        # Rule precedence is absolute; absent images/history contribute zero, never a penalty.
        base = 1000 if rule else min(z, 20)
        ocr = 70 if row["ocr_provisional_mismatch"] else 0
        duplicate = 45 if row["duplicate_digest_count"] else 0
        correction = 10 if row["version"] > 1 else 0
        result["arithmetic_only"].append(1000 if rule else 0)
        result["arithmetic_peer"].append(base)
        result["evidence_aware"].append(base if rule else z + ocr + duplicate + correction)
        result["no_ocr"].append(base if rule else z + duplicate + correction)
        result["no_duplicates"].append(base if rule else z + ocr + correction)
    return result


def metrics(rows: list[dict], scores: list[float], budget: int) -> dict:
    picked = set(sorted(range(len(rows)), key=lambda i: (-scores[i], i))[:budget])
    positives = {i for i, row in enumerate(rows) if row["review_worthy"]}
    true = len(picked & positives)
    categories = {kind: {"total": sum(row["kind"] == kind for row in rows),
                         "selected": sum(i in picked and row["kind"] == kind for i, row in enumerate(rows))}
                  for kind in KINDS}
    regions = {region: {"positives": sum(row["region"] == region and row["review_worthy"] for row in rows),
                        "selected_positives": sum(i in picked and row["region"] == region and row["review_worthy"] for i, row in enumerate(rows))}
               for region in REGIONS}
    return {"precision_at_budget": round(true / budget, 4),
            "recall_at_budget": round(true / len(positives), 4),
            "false_positives": budget - true,
            "critical_misses": sum(i not in picked and row["critical"] for i, row in enumerate(rows)),
            "categories": categories, "regions": regions}


def bootstrap_gain(rows: list[dict], scores: dict[str, list[float]]) -> dict:
    """Stratified synthetic uncertainty, conditional on this generator only."""
    rng = random.Random(SEED + 1)
    groups = {(region, kind): [i for i, row in enumerate(rows)
                               if row["region"] == region and row["kind"] == kind]
              for region in REGIONS for kind in KINDS}
    gains = []
    for _ in range(400):
        chosen = [rng.choice(group) for group in groups.values() for _ in group]
        sample = [rows[i] for i in chosen]
        budget = len(sample) // 5
        base = metrics(sample, [scores["arithmetic_peer"][i] for i in chosen], budget)
        next_ = metrics(sample, [scores["evidence_aware"][i] for i in chosen], budget)
        gains.append(next_["recall_at_budget"] - base["recall_at_budget"])
    gains.sort()
    return {"replicates": len(gains), "strata": "region × scenario",
            "gain_95_percent_interval": [round(gains[10], 4), round(gains[389], 4)],
            "interpretation": "Generator-conditional resampling only; it does not establish field performance."}


def main() -> None:
    train, rows = corpus()
    scores = score_rows(train, rows)
    budget = len(rows) // 5
    results = {name: metrics(rows, values, budget) for name, values in scores.items()}
    baseline, challenger = results["arithmetic_peer"], results["evidence_aware"]
    gain = round(challenger["recall_at_budget"] - baseline["recall_at_budget"], 4)
    subgroup_regression = any(
        challenger["regions"][region]["selected_positives"] < baseline["regions"][region]["selected_positives"]
        for region in REGIONS)
    # The simulated OCR sensor is unavailable in the live app. This corpus is not independent
    # validation and cannot satisfy the release gate, regardless of its numeric score.
    report = {"seed": SEED, "train_rows": len(train), "holdout_rows": len(rows),
              "budget": budget, "by_kind": dict(Counter(row["kind"] for row in rows)),
              "corpus_sha256": hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest(),
              "results": results, "recall_gain": gain,
              "synthetic_bootstrap": bootstrap_gain(rows, scores),
              "numeric_threshold_met_on_simulation": gain >= .05,
              "extra_critical_misses": challenger["critical_misses"] - baseline["critical_misses"],
              "subgroup_regression": subgroup_regression,
              "independent_holdout": False, "verified_ocr_available_in_product": False,
              "reviewer_time_and_decision_accuracy_measured": False,
              "release_gate_passed": False, "product_ranking_enabled": False,
              "limitations": "Fictional generator and simulated pre-review OCR evidence; no independent labels, real reviewer timing, or decision-accuracy study. A duplicate digest is a reconciliation prompt, not an error finding."}
    path = Path(__file__).resolve().parents[1] / "docs" / "review-ranking-evaluation.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"rows": len(rows), "budget": budget, "baseline": baseline["recall_at_budget"],
                      "challenger": challenger["recall_at_budget"], "gain": gain,
                      "release_gate_passed": False}))


if __name__ == "__main__":
    main()
