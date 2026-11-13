#!/usr/bin/env python3
"""Build the Results page's results.json from the two preregistered verdict files.

Inputs (both committed, aggregates only, in flyshi-research):
  Phase 1  repro/mushroom_body/results/synthetic_market_a325e6b206/verdict_phase1.json
  Phase 2  repro/real_market/results/phase2_0777ae92f0dd/verdict.json

Output: aggregates only. For each Phase 1 signal strength and for Phase 2: both paired
Brier improvements with their 95% CIs, the MDE (where the verdict reports one), the
pass flag, the null-control outcome and the counts; for Phase 2 also the reported-only
gross P&L per arm (total and per-market 95% CI). No market ID, price or per-market
row is read or written. Every number on the site's Results page comes from this file.

  python3 tools/make_results.py --research ~/Projects/flyshi-research --out results.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import tempfile
from pathlib import Path

PHASE1 = "repro/mushroom_body/results/synthetic_market_a325e6b206/verdict_phase1.json"
PHASE2 = "repro/real_market/results/phase2_0777ae92f0dd/verdict.json"
STRENGTHS = ("0.0", "0.4", "0.8", "1.0")
CI_KEYS = ("estimate", "lower", "upper", "confidence_level", "n_resamples", "resampling_unit")
NO_MDE = "not reported: the Phase 1 verdict has no realised MDE"


class Bad(Exception):
    pass


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ci(c: dict, what: str) -> dict:
    if not isinstance(c, dict) or any(k not in c for k in CI_KEYS):
        raise Bad(f"{what}: not a bootstrap interval")
    out = {k: c[k] for k in CI_KEYS}
    for k in ("estimate", "lower", "upper"):
        if not (isinstance(out[k], (int, float)) and math.isfinite(out[k])):
            raise Bad(f"{what}: {k} is not a finite number")
    if not out["lower"] <= out["estimate"] <= out["upper"]:
        raise Bad(f"{what}: the estimate is outside its interval")
    return out


def phase1(v: dict) -> dict:
    if v.get("arms_evaluated") != ["profit", "learning_off"]:
        raise Bad("phase 1: unexpected arms")
    rows = []
    for s in STRENGTHS:
        x = v["strengths"][s]
        sens = x.get("sensitivity_excluding_ignited") or {}
        n_test = sens.get("n_test_markets")
        train = v["ignited_training_presentations"]["profit"]["by_strength"][s]["training_decisions"]
        if not isinstance(n_test, int) or not isinstance(train, int):
            raise Bad(f"phase 1 strength {s}: no test or training count")
        rows.append({
            "strength": float(s),
            "role": x["role"],
            "vs_price": ci(x["profit_improvement_vs_market"], f"phase 1 {s} vs market"),
            "vs_price_label": x["comparison_labels"]["profit_improvement_vs_market"],
            "vs_learning_off": ci(x["profit_improvement_vs_learning_off"], f"phase 1 {s} vs learning_off"),
            "vs_learning_off_label": x["comparison_labels"]["profit_improvement_vs_learning_off"],
            "mde": None,
            "passes": bool(x["passes"]),
            "reading": v["readings"][s],
            "n_test_markets": n_test,
            "n_training_decisions": train,
        })
    nc = v["null_control"]
    return {
        "name": "Simulated markets (Phase 1)",
        "comparator": v["market_comparator"],
        "success": bool(v["success"]),
        "signal_requirement": v["signal_requirement"],
        "reading": v["readings"]["overall"],
        "null_control": {"strength": nc["strength"], "passes": bool(nc["passes"]),
                         "interpretation": nc["interpretation"]},
        "mde_note": NO_MDE,
        "strengths": rows,
    }


def phase2(v: dict) -> dict:
    g, r, comp = v["gate"], v["realised"], v["comparator"]
    per_arm = v["gross_pnl"]["per_arm"]
    n = v["n_test_markets"]
    for arm, a in per_arm.items():
        if a["markets"] != n or a["trades"] + a["abstentions"] != n:
            raise Bad(f"phase 2 {arm}: trades and abstentions do not add up to the test markets")
    nc = g["null_improvement_vs_comparator"]
    return {
        "name": "Real markets (Phase 2)",
        "success": bool(v["success"]),
        "gate_passes": bool(v["gate_passes"]),
        "reading": v["readings"]["overall"],
        "comparator": {"choice": comp["choice"], "n_train": comp["n_train"],
                       "cv_brier_raw": comp["cv_brier_raw"], "cv_brier_calibrated": comp["cv_brier_calibrated"]},
        "vs_comparator": ci(g["profit_improvement_vs_comparator"], "phase 2 vs comparator"),
        "vs_comparator_label": v["readings"]["comparisons"]["vs_comparator"],
        "vs_comparator_mde": r["vs_comparator"]["mde"],
        "vs_learning_off": ci(g["profit_improvement_vs_learning_off"], "phase 2 vs learning_off"),
        "vs_learning_off_label": v["readings"]["comparisons"]["vs_learning_off"],
        "vs_learning_off_mde": r["vs_learning_off"]["mde"],
        "both_lower_bounds_above_zero": bool(g["both_lower_bounds_above_zero"]),
        "null_control": {"passes": bool(v["null_control"]["passes"]),
                         "interpretation": v["null_control"]["interpretation"],
                         "vs_comparator": ci(nc, "phase 2 null vs comparator")},
        "brier": {k: v["brier_test"][k] for k in ("profit", "learning_off", "null_permuted", "comparator")},
        "n_test_markets": n,
        "decisions": {arm: {"trades": a["trades"], "abstentions": a["abstentions"]} for arm, a in per_arm.items()},
        "gross_pnl": {"label": v["gross_pnl"]["label"], "note": v["gross_pnl"]["note"],
                      "per_arm": {arm: {"total": a["total"], "per_market": ci(a["per_market_ci"], f"phase 2 {arm} gross P&L")}
                                  for arm, a in per_arm.items()}},
    }


def write(out: Path, payload: dict) -> None:
    fd, tmp = tempfile.mkstemp(prefix=f".{out.name}.", suffix=".partial", dir=str(out.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, indent=1) + "\n")
        os.chmod(tmp, 0o644)
        os.replace(tmp, out)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--research", type=Path, required=True, help="the flyshi-research checkout")
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args(argv)
    root = a.research.expanduser().resolve()
    try:
        p1, p2 = root / PHASE1, root / PHASE2
        v1, v2 = json.loads(p1.read_text()), json.loads(p2.read_text())
        payload = {
            "sources": {"phase1": {"path": PHASE1, "sha256": sha256(p1)},
                        "phase2": {"path": PHASE2, "sha256": sha256(p2)}},
            "note": "Paired per-market Brier improvements of the trained (profit) arm; positive favours training. "
                    "95% percentile bootstrap intervals, resampled by market.",
            "phase1": phase1(v1),
            "phase2": phase2(v2),
        }
    except (OSError, ValueError, KeyError, TypeError, Bad) as e:
        print(f"make_results: ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    write(a.out.expanduser().resolve(), payload)
    print(f"make_results: wrote {a.out} from {PHASE1} and {PHASE2}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
