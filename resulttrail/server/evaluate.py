"""Reproducible, fictional review-priority benchmark. No electoral inference."""
from __future__ import annotations

import hashlib
import json
import random
import time
from pathlib import Path

import numpy as np
from sklearn.ensemble import IsolationForest

SEED = 20261026
REGIONS = {"north": (0.58, 0.55), "south": (0.72, 0.35), "central": (0.64, 0.45)}
FAMILIES = ("clean", "normal_extreme", "arithmetic", "contextual")


def make_case(rng: random.Random, region: str, family: str) -> dict:
    turnout, share = REGIONS[region]
    accredited = rng.randint(80, 700)
    rate = min(.92, max(.25, rng.gauss(turnout, .075)))
    if family == "normal_extreme":
        rate = min(.95, max(.15, rng.choice([.19, .91]) + rng.gauss(0, .015)))
    cast = round(accredited * rate)
    rejected = round(cast * min(.12, max(0, rng.gauss(.025, .013))))
    valid = cast - rejected
    a_share = min(.92, max(.08, rng.gauss(share, .075)))
    if family == "contextual":
        a_share = min(.98, max(.02, 1 - share + rng.choice([-.39, .39])))
    a = round(valid * a_share)
    b = valid - a
    if family == "arithmetic":
        valid += rng.choice([-5, 5, 11])
    return {"region": region, "family": family, "accredited": accredited,
            "cast": cast, "valid": valid, "rejected": rejected,
            "party_votes": {"A": a, "B": b}, "review_worthy": family in {"arithmetic", "contextual"},
            "critical": family == "arithmetic"}


def features(case: dict) -> list[float]:
    accredited = case["accredited"]
    cast = case["cast"]
    valid = case["valid"]
    return [accredited / 700, cast / accredited, case["rejected"] / max(cast, 1),
            case["party_votes"]["A"] / max(valid, 1)]


def robust(values: list[float]) -> tuple[float, float]:
    center = float(np.median(values))
    mad = float(np.median(np.abs(np.asarray(values) - center)))
    return center, max(mad * 1.4826, .015)


def metrics(rows: list[dict], ranking: list[int], budget: int) -> dict:
    picked = set(ranking[:budget])
    positives = {i for i, row in enumerate(rows) if row["review_worthy"]}
    critical = {i for i, row in enumerate(rows) if row["critical"]}
    true_pos = len(picked & positives)
    return {"review_budget": budget, "true_positives": true_pos,
            "false_flags": budget - true_pos, "positives": len(positives),
            "precision": round(true_pos / budget, 4),
            "recall": round(true_pos / len(positives), 4),
            "critical_misses": len(critical - picked)}


def evaluate() -> dict:
    rng = random.Random(SEED)
    train = [make_case(rng, region, "clean") for region in REGIONS for _ in range(180)]
    # Holdout families are generated separately; no holdout label informs fitting.
    holdout = [make_case(rng, region, family) for region in REGIONS
               for family, count in (("clean", 60), ("normal_extreme", 12),
                                     ("arithmetic", 12), ("contextual", 16)) for _ in range(count)]
    rng.shuffle(holdout)
    stats = {region: [robust([features(row)[j] for row in train if row["region"] == region])
                      for j in range(4)] for region in REGIONS}
    begin = time.perf_counter()
    model = IsolationForest(n_estimators=128, contamination=.12, random_state=SEED, n_jobs=1)
    model.fit(np.asarray([features(row) for row in train]))
    fit_ms = round((time.perf_counter() - begin) * 1000, 1)
    anomaly = -model.score_samples(np.asarray([features(row) for row in holdout]))
    a_score, b_score, c_score = [], [], []
    for i, row in enumerate(holdout):
        rule = int(sum(row["party_votes"].values()) != row["valid"] or
                   row["valid"] + row["rejected"] != row["cast"] or
                   row["cast"] > row["accredited"])
        z = max(abs((value - center) / scale) for value, (center, scale)
                in zip(features(row)[1:], stats[row["region"]][1:]))
        a_score.append(100 if rule else 0)
        b_score.append(100 if rule else z)
        # The rule priority is fixed. The unsupervised model only reorders non-rule cases.
        c_score.append(100 if rule else z + max(0, (float(anomaly[i]) - .5) * 20))
    budget = len(holdout) // 5
    rankings = {name: sorted(range(len(holdout)), key=lambda i: (-scores[i], i))
                for name, scores in (("A_arithmetic", a_score), ("B_peer", b_score), ("C_peer_plus_isolation_forest", c_score))}
    result = {name: metrics(holdout, ranking, budget) for name, ranking in rankings.items()}
    b, c = result["B_peer"], result["C_peer_plus_isolation_forest"]
    gain = round(c["recall"] - b["recall"], 4)
    gated_on = gain >= .05 and c["critical_misses"] <= b["critical_misses"]
    definition = {"seed": SEED, "generator": "aegisrelay-fictional-v1", "train_rows": len(train),
                  "holdout_rows": len(holdout), "holdout_by_family": {family: sum(row["family"] == family for row in holdout) for family in FAMILIES},
                  "review_budget_fraction": .2, "features": ["relative_accredited", "turnout", "rejected_fraction", "party_A_fraction"],
                  "no_real_election_data": True}
    corpus_hash = hashlib.sha256(json.dumps(holdout, sort_keys=True).encode()).hexdigest()
    return {"dataset": definition, "holdout_sha256": corpus_hash, "fit_ms": fit_ms,
            "results": result, "incremental_recall_gain": gain, "model_gate_passed": gated_on,
            "product_model_enabled": False,
            "limitations": "Fictional generator labels and three invented peer groups; no claim about real election integrity or fraud. Model remains out of product until independent validation."}


def main() -> None:
    report = evaluate()
    path = Path(__file__).resolve().parents[1] / "docs" / "synthetic-evaluation.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(path)
    print(json.dumps(report["results"], indent=2))
    print("Gate passed:", report["model_gate_passed"])


if __name__ == "__main__":
    main()
