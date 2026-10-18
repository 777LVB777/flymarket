#!/usr/bin/env python3
"""Build the Trading page's pnl.json from Phase 2 job files.

Input is a Phase 2 run directory as flyshi-research's
repro/mushroom_body/run_real_market_experiment.py writes it: manifest.json,
chains.json, comparator.json, parts/real_<arm>_<chain>.json and, once all 120 jobs
are done, verdict.json. The job files hold each test market's action, price and
outcome. Decision times come from the market file named in manifest.json (looked
for next to the run directory, or given with --market-file).

Arms, on the held-out test markets only (40 chains x 180):
  circuit  the profit arm, learning on      parts/real_profit_<cc>.json
  off      the learning_off arm             parts/real_learning_off_<cc>.json
  price    the frozen price-only comparator (comparator.json): YES when its
           forecast is above the price, NO when below, abstain when equal
           (margin 0, the circuit's own decision margin)
The null_permuted job files are never opened.

Per market, one share at the decision-time price with no fee and no spread, as in
real_market.gross_pnl: YES earns outcome - price and stakes the price, NO earns
price - outcome and stakes 1 - price, ABSTAIN earns and stakes nothing. A win is
YES on a market that resolved YES, or NO on one that resolved NO. Each market is
dated by the UTC day of its decision time.

Output: status, unit, as_of, note and, per arm, a label and daily totals
{date, pnl, stake, wins, losses, abstain}. No market ID, price or per-market row.

Blinding: a folder that looks like real Phase 2 output is refused, before any job
file is opened, unless --i-have-the-verdict is given. A folder counts as fake only
if it holds a FAKE_PHASE2_DATA file and shows no sign of the real run. Nothing
printed is a result: only counts, dates and the outcome of the checks.

  python3 tools/make_pnl.py RUN_DIR --status demo --out pnl.json
  python3 tools/make_pnl.py RUN_DIR --status final --i-have-the-verdict --out pnl.json
"""

from __future__ import annotations

import argparse
import bisect
import hashlib
import json
import math
import os
import re
import sys
import tempfile
import traceback
from datetime import datetime, timezone
from pathlib import Path

#: site arm -> job-file arm; the price arm is computed from comparator.json
JOB_ARMS = {"circuit": "profit", "off": "learning_off"}
SITE_ARMS = ("circuit", "off", "price")
LABELS = {"circuit": "Learning circuit", "off": "Learning switched off", "price": "Price-only forecast"}
FAKE_MARKER = "FAKE_PHASE2_DATA"
#: the real run's market file (docs/records/phase2_build_signoff.md); its run directory is phase2_<sha12>
REAL_MARKET_FILE_SHA256 = "0777ae92f0dd6b950e1a0e3495c72c3a89280b421265f2a53cdac3c3b9e2c686"
RUN_DIR_NAME = re.compile(r"^phase2_[0-9a-f]{12}$")
MARKET_FORMAT = "flyshi.simulator.Market/v1"
CHAINS_FORMAT = "flyshi.phase2.chains/v1"
RAW = "raw_price"
CALIBRATED = "isotonic_calibrated_price"
#: the circuit's decision margin in the locked configuration; the price-only trader uses the same
PRICE_MARGIN = 0.0
ACTIONS = ("YES", "NO", "ABSTAIN")
#: preregistered test window: decision time in [2026-03-08, 2026-09-01) UTC
FIRST_DAY, LAST_DAY = "2026-03-08", "2026-08-31"
DECIMALS = 6
GROSS_LABEL = "gross, before fees and spread, not achievable as stated"
NOTES = {
    "final": ("Simulated trades on the held-out Phase 2 test markets, replayed offline; daily totals by decision "
              "date (UTC). One share per market at the decision-time price, " + GROSS_LABEL + ". Price-only: the "
              "frozen price-only comparator buys YES when its forecast is above the price and NO when below. "
              "Reported only: the preregistered verdict does not use these numbers."),
    "demo": "DEMO values computed from fake job files to show the layout. Not a result.",
}
RAW_NOTE = " The comparator kept the raw price, so the price-only trader never trades."


class Refused(Exception):
    """A blinding or provenance rule says no (exit 2)."""


class Bad(Exception):
    """The input is incomplete or inconsistent (exit 1)."""


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load(path: Path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        raise Bad(f"cannot read {path.name} ({type(e).__name__})") from None


def real_signs(run_dir: Path, manifest: dict) -> list:
    """Why the folder looks like real Phase 2 output. Reads names and the manifest only."""
    signs = []
    if RUN_DIR_NAME.match(run_dir.name):
        signs.append(f"it is named like a real run directory, phase2_<market file sha12> ({run_dir.name})")
    if manifest.get("market_file_sha256") == REAL_MARKET_FILE_SHA256:
        signs.append("its manifest names the real market file (sha256 0777ae92f0dd...)")
    if not (run_dir / FAKE_MARKER).is_file():
        signs.append(f"it has no {FAKE_MARKER} file")
    return signs


def find_market_file(run_dir: Path, manifest: dict, given) -> Path:
    want, named = manifest.get("market_file_sha256"), manifest.get("market_file")
    if not (isinstance(want, str) and isinstance(named, str) and named):
        raise Bad("manifest.json names no market file and SHA-256")
    named = Path(named)
    candidates = [given] if given else [named, run_dir.parent / named.name, run_dir / named.name]
    tried = []
    for path in dict.fromkeys(Path(p).expanduser() for p in candidates):
        if path.is_file():
            if sha256(path) == want:
                return path
            tried.append(str(path))
    if tried:
        raise Bad(f"{', '.join(tried)}: not the market file of manifest.json (SHA-256 differs)")
    raise Bad(f"market file {named.name} not found next to the run directory; pass --market-file")


def utc_day(stamp) -> str:
    """The UTC calendar day of an ISO 8601 time; a time without an offset is UTC."""
    try:
        v = stamp.strip()
        if v.endswith("Z"):
            v = v[:-1] + "+00:00"
        elif len(v) >= 3 and v[-3] in "+-" and v[-2:].isdigit():
            v += ":00"
        if "." in v:  # Python 3.9 reads exactly 3 or 6 fractional digits
            head, _, rest = v.partition(".")
            digits = len(rest) - len(rest.lstrip("0123456789"))
            v = head + "." + rest[:digits].ljust(6, "0")[:6] + rest[digits:]
        t = datetime.fromisoformat(v)
    except (AttributeError, TypeError, ValueError):
        raise Bad("a test market's decision time is not an ISO 8601 time") from None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc).date().isoformat()


def interp(x: float, xs: list, ys: list) -> float:
    """numpy.interp: linear between the points, the end value beyond them."""
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    j = bisect.bisect_right(xs, x) - 1
    if x == xs[j]:
        return ys[j]
    return (ys[j + 1] - ys[j]) / (xs[j + 1] - xs[j]) * (x - xs[j]) + ys[j]


def price_forecaster(comparator):
    """FrozenComparator.predict for one price."""
    choice = comparator.get("choice") if isinstance(comparator, dict) else None
    if choice == RAW:
        return lambda q: q
    if choice != CALIBRATED:
        raise Bad("comparator.json has no known choice")
    cal = comparator.get("calibrator") or {}
    try:
        xs = [float(v) for v in cal["centres"]]
        ys = [float(v) for v in cal["values"]]
    except (KeyError, TypeError, ValueError):
        raise Bad("comparator.json has no calibrator centres and values") from None
    if not xs or len(xs) != len(ys) or any(b <= a for a, b in zip(xs, xs[1:])) \
            or any(b < a for a, b in zip(ys, ys[1:])) or not all(map(math.isfinite, xs + ys)):
        raise Bad("comparator.json's calibrator is not a monotone map on increasing centres")
    return lambda q: interp(q, xs, ys)


def price_action(forecast: float, quote: float) -> str:
    if forecast - quote > PRICE_MARGIN:
        return "YES"
    if forecast - quote < -PRICE_MARGIN:
        return "NO"
    return "ABSTAIN"


def score(action: str, quote: float, outcome: int) -> tuple:
    """(pnl, stake, win, loss) of one share at the decision-time price, no fee, no spread."""
    if action == "YES":
        return outcome - quote, quote, outcome == 1, outcome == 0
    if action == "NO":
        return quote - outcome, 1.0 - quote, outcome == 0, outcome == 1
    return 0.0, 0.0, False, False


def _number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def job_rows(path: Path, arm: str, chain: int, ids: list) -> list:
    """(quote, outcome, action) of each test row, checked against chains.json."""
    if not path.is_file():
        raise Bad(f"missing job file parts/{path.name}")
    job = load(path)
    if not isinstance(job, dict) or job.get("arm") != arm or job.get("chain") != chain:
        raise Bad(f"parts/{path.name} is not the job file of {arm}, chain {chain}")
    rows = job.get("test")
    if not isinstance(rows, list) or len(rows) != len(ids):
        raise Bad(f"parts/{path.name}: expected {len(ids)} test rows")
    out = []
    for row, market_id in zip(rows, ids):
        if not isinstance(row, dict) or str(row.get("market_id")) != market_id:
            raise Bad(f"parts/{path.name}: the test markets differ from chains.json")
        q, y, a = row.get("quote"), row.get("outcome"), row.get("action")
        if not (_number(q) and 0.0 <= q <= 1.0 and _number(y) and y in (0, 1) and a in ACTIONS):
            raise Bad(f"parts/{path.name}: a test row has no valid price, outcome or action")
        out.append((float(q), int(y), a))
    return out


def read_chains(run_dir: Path, manifest: dict) -> list:
    chains = load(run_dir / "chains.json")
    if not isinstance(chains, dict) or chains.get("format") != CHAINS_FORMAT:
        raise Bad(f"chains.json is not a {CHAINS_FORMAT} file")
    entries, n, per = chains.get("chains"), chains.get("n_chains"), chains.get("test_per_chain")
    design = manifest.get("design") or {}
    if (design.get("n_chains"), design.get("test_per_chain")) != (n, per):
        raise Bad("chains.json does not match the design in manifest.json")
    if not (isinstance(entries, list) and isinstance(n, int) and isinstance(per, int) and n > 0 and per > 0
            and len(entries) == n):
        raise Bad("chains.json does not list n_chains chains")
    for c, e in enumerate(entries):
        if not isinstance(e, dict) or e.get("chain") != c or not isinstance(e.get("test"), list) \
                or len(e["test"]) != per:
            raise Bad(f"chains.json: chain {c} is out of order or not {per} test markets")
        e["test"] = [str(i) for i in e["test"]]
    every = [i for e in entries for i in e["test"]]
    if len(set(every)) != len(every):
        raise Bad("chains.json: a test market is in two chains")
    return entries


def decision_days(market_file: Path, ids: list) -> dict:
    """market ID -> UTC day of its decision time, for the chains' test markets."""
    payload = load(market_file)
    if not isinstance(payload, dict) or payload.get("format") != MARKET_FORMAT:
        raise Bad(f"{market_file.name} is not a {MARKET_FORMAT} market file")
    times = {}
    for r in payload.get("test") or []:
        meta = r.get("meta") if isinstance(r, dict) else None
        if isinstance(meta, dict):
            times[str(meta.get("market_id"))] = meta.get("decision_time")
    missing = sum(i not in times for i in ids)
    if missing:
        raise Bad(f"{missing} test market(s) of chains.json are not in the market file's test list")
    days = {i: utc_day(times[i]) for i in ids}
    outside = sum(not FIRST_DAY <= d <= LAST_DAY for d in days.values())
    if outside:
        raise Bad(f"{outside} test market(s) were decided outside the test window {FIRST_DAY} to {LAST_DAY}")
    return days


def daily(markets: list, arm: str) -> list:
    acc = {}
    for day, quote, outcome, actions in markets:
        pnl, stake, win, loss = score(actions[arm], quote, outcome)
        d = acc.setdefault(day, ([], [], [0, 0, 0]))
        d[0].append(pnl)
        d[1].append(stake)
        d[2][0] += win
        d[2][1] += loss
        d[2][2] += actions[arm] == "ABSTAIN"
    return [{"date": day, "pnl": _round(math.fsum(p)), "stake": _round(math.fsum(s)),
             "wins": n[0], "losses": n[1], "abstain": n[2]} for day, (p, s, n) in sorted(acc.items())]


def _round(v: float) -> float:
    return round(v, DECIMALS) + 0.0  # + 0.0 turns -0.0 into 0.0


def check_totals(markets: list, arms: dict) -> None:
    """Every arm's days add up to its per-market totals and cover the same markets each day."""
    per_day = {}
    for day, *_ in markets:
        per_day[day] = per_day.get(day, 0) + 1
    dates = sorted(per_day)
    slack = len(dates) * 0.5 * 10 ** -DECIMALS + 1e-9
    for arm, days in arms.items():
        if [d["date"] for d in days] != dates:
            raise Bad(f"{arm}: the days are not the test markets' decision days")
        if any(d["wins"] + d["losses"] + d["abstain"] != per_day[d["date"]] for d in days):
            raise Bad(f"{arm}: a day's wins, losses and abstentions do not add up to its markets")
        scored = [score(a[arm], q, y) for _, q, y, a in markets]
        trades = sum(a[arm] != "ABSTAIN" for *_, a in markets)
        if sum(d["wins"] + d["losses"] for d in days) != trades \
                or sum(d["abstain"] for d in days) != len(markets) - trades:
            raise Bad(f"{arm}: wins and losses do not add up to the trades")
        for k, key in ((0, "pnl"), (1, "stake")):
            if abs(math.fsum(d[key] for d in days) - math.fsum(s[k] for s in scored)) > slack:
                raise Bad(f"{arm}: the daily {key} does not add up to the per-market total")


def check_verdict(run_dir: Path, markets: list, status: str) -> str:
    """The circuit and off arms against the preregistered verdict's own gross P&L."""
    path = run_dir / "verdict.json"
    if not path.is_file():
        if status == "final":
            raise Refused("there is no verdict.json in the run directory: final numbers come after the verdict")
        return "no verdict.json to compare with"
    verdict = load(path)
    per_arm = ((verdict.get("gross_pnl") or {}).get("per_arm") or {}) if isinstance(verdict, dict) else {}
    for arm, job_arm in JOB_ARMS.items():
        v = per_arm.get(job_arm) or {}
        total = math.fsum(score(a[arm], q, y)[0] for _, q, y, a in markets)
        trades = sum(a[arm] != "ABSTAIN" for *_, a in markets)
        if not (v.get("markets") == len(markets) and v.get("trades") == trades
                and v.get("abstentions") == len(markets) - trades
                and _number(v.get("total")) and abs(v["total"] - total) <= 1e-6):
            raise Bad(f"the {arm} arm does not match verdict.json's gross P&L of {job_arm}")
    return "the circuit and off arms match verdict.json's gross P&L (total, trades, abstentions)"


def write(out: Path, payload: dict) -> None:
    """Atomic: the file appears under its name only when complete."""
    fd, tmp = tempfile.mkstemp(prefix=f".{out.name}.", suffix=".partial", dir=str(out.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, separators=(",", ":")) + "\n")
        os.chmod(tmp, out.stat().st_mode & 0o777 if out.exists() else 0o644)
        os.replace(tmp, out)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def run(args) -> list:
    run_dir = args.run_dir.expanduser().resolve()
    missing = [n for n in ("manifest.json", "chains.json", "comparator.json", "parts") if not (run_dir / n).exists()]
    if missing:
        raise Bad(f"{run_dir} is not a Phase 2 run directory (no {', '.join(missing)})")
    out = args.out.expanduser().resolve()
    if not out.parent.is_dir():
        raise Bad(f"{out.parent} is not a directory")
    if run_dir == out or run_dir in out.parents:
        raise Bad("--out is inside the run directory, which is never written to")
    manifest = load(run_dir / "manifest.json")
    if not isinstance(manifest, dict):
        raise Bad("manifest.json is not a JSON object")
    signs = real_signs(run_dir, manifest)
    if signs and not args.i_have_the_verdict:
        raise Refused(f"{run_dir} looks like real Phase 2 output:\n"
                      + "".join(f"  - {s}\n" for s in signs)
                      + "No job file was opened. Run this only after the preregistered verdict, "
                        "adding --i-have-the-verdict.")
    if args.status == "final" and not signs:
        raise Refused(f"{run_dir} is marked as fake data ({FAKE_MARKER}): fake data goes out only as --status demo")
    if args.status == "demo" and signs:
        raise Refused("real Phase 2 output goes out only as --status final")

    for key, name in (("chains_sha256", "chains.json"), ("comparator_sha256", "comparator.json")):
        if sha256(run_dir / name) != manifest.get(key):
            raise Bad(f"{name} does not match manifest.json ({key})")
    market_file = find_market_file(run_dir, manifest, args.market_file)
    if market_file.resolve() == out:
        raise Bad("--out is the market file")
    chains = read_chains(run_dir, manifest)
    days = decision_days(market_file, [i for e in chains for i in e["test"]])
    comparator = load(run_dir / "comparator.json")
    forecast = price_forecaster(comparator)
    raw = comparator["choice"] == RAW

    markets = []  # (day, quote, outcome, {site arm: action}), in chain order
    for e in chains:
        rows = {arm: job_rows(run_dir / "parts" / f"real_{job_arm}_{e['chain']:02d}.json", job_arm, e["chain"],
                              e["test"])
                for arm, job_arm in JOB_ARMS.items()}
        if any([r[:2] for r in rows[arm]] != [r[:2] for r in rows["circuit"]] for arm in rows):
            raise Bad(f"chain {e['chain']}: the job files disagree on a test market's price or outcome")
        for k, market_id in enumerate(e["test"]):
            quote, outcome, _ = rows["circuit"][k]
            actions = {arm: rows[arm][k][2] for arm in rows}
            actions["price"] = price_action(forecast(quote), quote)
            markets.append((days[market_id], quote, outcome, actions))

    arms = {arm: daily(markets, arm) for arm in SITE_ARMS}
    check_totals(markets, arms)
    verdict_line = check_verdict(run_dir, markets, args.status)
    dates = [d["date"] for d in arms["circuit"]]
    payload = {"status": args.status, "unit": "units", "as_of": dates[-1],
               "note": NOTES[args.status] + (RAW_NOTE if raw else ""),
               "arms": {arm: {"label": LABELS[arm], "days": arms[arm]} for arm in SITE_ARMS}}
    write(out, payload)
    return [f"read {2 * len(chains)} job files (profit, learning_off; null_permuted not opened), comparator.json "
            f"and the decision times in {market_file.name}",
            f"{len(markets)} test markets on {len(dates)} decision days, {dates[0]} to {dates[-1]} (UTC)",
            "checks passed: each arm's days add up to its per-market totals and cover the same markets each day",
            verdict_line,
            *(["the comparator kept the raw price: the price-only trader never trades"] if raw else []),
            f"wrote {out} (status {args.status})"]


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0], epilog=__doc__.split("\n\n", 1)[1],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("run_dir", type=Path,
                   help="Phase 2 run directory (manifest.json, chains.json, comparator.json, parts/)")
    p.add_argument("--status", required=True, choices=("final", "demo"))
    p.add_argument("--out", required=True, type=Path, help="where to write the JSON (it is never printed)")
    p.add_argument("--market-file", type=Path, help="the market file manifest.json names, if not next to RUN_DIR")
    p.add_argument("--i-have-the-verdict", action="store_true",
                   help="the preregistered verdict is out; required for real Phase 2 output")
    return p


def main(argv=None) -> int:
    args = parser().parse_args(argv)
    try:
        lines = run(args)
    except Refused as e:
        print(f"make_pnl: REFUSED: {e}", file=sys.stderr)
        return 2
    except Bad as e:
        print(f"make_pnl: ERROR: {e}", file=sys.stderr)
        return 1
    except Exception as e:  # the message could quote a price or an outcome: name the line only
        here = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == __file__]
        print(f"make_pnl: ERROR: {type(e).__name__} at line {here[-1].lineno if here else '?'} "
              "(message withheld: it could contain data)", file=sys.stderr)
        return 1
    for line in lines:
        print(f"make_pnl: {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
