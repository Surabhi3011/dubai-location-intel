"""AI site memos.

Facts in -> memo out. Only computed facts are sent to the model; every number in a memo must
exist in its facts (fact-check). Memos that fail are regenerated once, then replaced by a
rule-based template. Generated memos are cached by input hash so unchanged communities are free.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path

import pandas as pd

from dli.aggregate.build import Tables

MODEL = "claude-sonnet-5-5"
DISCLAIMER = "AI-generated from public data, not investment advice."
TEMPLATE_DISCLAIMER = "Rule-based summary generated from public data, not investment advice."

SYSTEM_PROMPT = """You write one-page location memos for real estate analysts about communities in Dubai.

You receive a JSON object of facts computed from Dubai Land Department transactions, Ejari rent
aggregates, the DLD project register and OpenStreetMap. Write a memo in Markdown, at most 350 words,
with exactly these sections:

**Summary** - one sentence.
**Strengths** - three bullets, each tied to a number from the facts.
**Risks** - three bullets, each tied to a number from the facts.
**Compared with peers** - two or three sentences comparing against the two peer communities in the facts.
**Questions to investigate** - three short bullets.

Rules:
- Use only numbers that appear in the facts, copied exactly as given (you may drop trailing ".0").
  Do not compute new numbers (no differences, ratios or sums of your own), do not round differently,
  and do not mention any year, count or figure that is not in the facts.
- If a fact is null, the data is insufficient: say so plainly instead of guessing.
- Write AED amounts as given, e.g. "AED 1,250,000" or "1,840 AED/sqft".
- Neutral, analytical tone. No hype, no recommendations to buy or sell.
- Do not add a title or footer; the app adds them."""


def _num(v, nd=1):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    return round(float(v), nd)


def build_facts(t: Tables) -> dict[str, dict]:
    k = t.community_kpis
    act = k[k.active & k.psf_12m.notna()].copy()
    city = t.city_kpis
    w = t.windows
    facts: dict[str, dict] = {}
    for _, r in act.iterrows():
        others = act[act.community_id != r.community_id]
        distance = (others.psf_12m - r.psf_12m).abs() / r.psf_12m + (others.sector != r.sector) * 0.25
        peers = others.assign(d=distance).nsmallest(2, "d")
        facts[r.community_id] = {
            "community": r.community_name,
            "also_known_as": (r.get("rent_sources") if isinstance(r.get("rent_sources"), list) else None),
            "period": f"{w.w12_start:%b %Y} to {(w.w12_end - pd.DateOffset(days=1)):%b %Y}",
            "data_through": f"{w.data_end:%d %b %Y}",
            "sales_12m": int(r.sales_12m),
            "sales_change_12m_pct": _num(r.sales_change_12m),
            "sales_value_12m_aed": int(r.value_12m) if pd.notna(r.value_12m) else None,
            "median_price_aed": _num(r.price_12m, 0),
            "median_price_per_sqft_aed": _num(r.psf_12m, 0),
            "dubai_median_price_per_sqft_aed": _num(city["psf"]["value"], 0),
            "price_per_sqft_change_12m_pct": _num(r.psf_change_12m),
            "price_per_sqft_change_3m_pct": _num(r.psf_change_3m),
            "offplan_share_pct": _num(r.offplan_share_12m),
            "median_annual_rent_aed": _num(r.rent_median, 0),
            "gross_yield_pct": _num(r.yield_pct, 2),
            "rent_contracts_12m": int(r.rent_contracts_12m) if r.rent_contracts_12m else None,
            "nearest_station": r.nearest_station,
            "nearest_station_distance_m": _num(r.metro_dist_m, 0),
            "amenities_in_community": {c: int(r[f"n_{c}"]) for c in
                                       ["school", "healthcare", "retail", "park", "restaurant"] if f"n_{c}" in r},
            "active_projects": int(r.projects_active),
            "units_in_pipeline": int(r.units_pipeline),
            "units_completing_next_24m": int(r.units_next_24m),
            "delayed_projects": int(r.projects_delayed),
            "location_score": _num(r.location_score, 0),
            "location_score_limited_data": bool(r.limited_data),
            "rank_price_per_sqft": f"{int(r.rank_psf_12m)} of {int(k.active.sum())}" if pd.notna(r.rank_psf_12m) else None,
            "peers": [
                {
                    "community": p.community_name,
                    "median_price_per_sqft_aed": _num(p.psf_12m, 0),
                    "gross_yield_pct": _num(p.yield_pct, 2),
                    "price_per_sqft_change_12m_pct": _num(p.psf_change_12m),
                    "sales_12m": int(p.sales_12m),
                }
                for _, p in peers.iterrows()
            ],
        }
    return facts


# ---------- fact check ----------

_NUM_RE = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(%|M\b|[Kk]\b|bn\b|million\b|billion\b)?")


def _fact_numbers(obj) -> set[float]:
    out: set[float] = set()

    def walk(v):
        if isinstance(v, bool) or v is None:
            return
        if isinstance(v, (int, float)):
            out.add(round(abs(float(v)), 2))
        elif isinstance(v, str):
            for m in _NUM_RE.finditer(v):
                out.add(round(float(m.group(1).replace(",", "") + ("." + m.group(2) if m.group(2) else "")), 2))
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(obj)
    return out


def fact_check(memo: str, facts: dict) -> list[float]:
    """Return numbers in the memo that do not match any fact (with formatting tolerance)."""
    known = _fact_numbers(facts)
    allowed_small = {1, 2, 3, 12, 24}  # section counts and the windows named in the facts
    bad = []
    for m in _NUM_RE.finditer(memo):
        value = float(m.group(1).replace(",", "") + ("." + m.group(2) if m.group(2) else ""))
        unit = m.group(3) or ""
        scale = {"M": 1e6, "million": 1e6, "K": 1e3, "k": 1e3, "bn": 1e9, "billion": 1e9}.get(unit, 1)
        v = value * scale
        if v in allowed_small:
            continue
        if any(abs(v - f) <= max(0.051, 0.0051 * f if scale > 1 else 0.051) for f in known):
            continue
        bad.append(v)
    return bad


# ---------- writers ----------

def template_memo(f: dict) -> str:
    def fmt(v, suffix=""):
        return "insufficient data" if v is None else f"{v:,.0f}{suffix}" if abs(v) >= 100 else f"{v}{suffix}"

    psf, city = f["median_price_per_sqft_aed"], f["dubai_median_price_per_sqft_aed"]
    rel = "above" if psf and city and psf > city else "below"
    peers = "; ".join(f"{p['community']} at {fmt(p['median_price_per_sqft_aed'])} AED/sqft" for p in f["peers"])
    return "\n".join([
        (f"**Summary** - {f['community']} recorded {fmt(f['sales_12m'])} sales in {f['period']} at a median "
         f"{fmt(psf)} AED/sqft, {rel} the Dubai median of {fmt(city)} AED/sqft."),
        "",
        "**Strengths**",
        f"- Price momentum: {fmt(f['price_per_sqft_change_12m_pct'], '%')} change in median price per sqft over 12 months.",
        f"- Gross rental yield: {fmt(f['gross_yield_pct'], '%')}.",
        f"- Nearest station: {f['nearest_station'] or 'n/a'} at {fmt(f['nearest_station_distance_m'])} m.",
        "",
        "**Risks**",
        f"- Supply: {fmt(f['units_completing_next_24m'])} units due to complete in the next 24 months.",
        f"- Off-plan share of sales: {fmt(f['offplan_share_pct'], '%')}.",
        f"- 3-month price change: {fmt(f['price_per_sqft_change_3m_pct'], '%')}.",
        "",
        f"**Compared with peers** - Closest peers by price: {peers}.",
        "",
        "**Questions to investigate**",
        "- How do service charges and building age vary across projects here?",
        "- Which projects drive the off-plan share, and what are their handover dates?",
        "- How do achieved rents compare with asking rents today?",
    ])


def _hash(facts: dict) -> str:
    return hashlib.sha256((SYSTEM_PROMPT + MODEL + json.dumps(facts, sort_keys=True)).encode()).hexdigest()[:16]


def _claude_memo(client, facts: dict) -> str | None:
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=4000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium"},
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": "Facts:\n```json\n" + json.dumps(facts, indent=1) + "\n```"}],
    )
    if response.stop_reason != "end_turn":
        return None
    return "".join(b.text for b in response.content if b.type == "text").strip()


def generate(t: Tables, cache_path: Path, max_new: int = 200, use_ai: bool = True) -> dict:
    """Returns {community_id: {memo, source, generated_for, model?}} and updates the cache file."""
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    facts = build_facts(t)
    client = None
    if use_ai and os.environ.get("ANTHROPIC_API_KEY"):
        import anthropic

        client = anthropic.Anthropic()

    out, new = {}, 0
    for cid, f in facts.items():
        h = _hash(f)
        hit = cache.get(cid)
        if hit and hit.get("hash") == h and hit.get("source") == "ai":
            out[cid] = hit
            continue
        memo, source = None, "template"
        if client and new < max_new:
            new += 1
            for _ in range(2):  # generate, regenerate once on fact-check failure
                draft = _claude_memo(client, f)
                if draft and not fact_check(draft, f):
                    memo, source = draft, "ai"
                    break
        if memo is None:
            memo = template_memo(f)
        out[cid] = {"hash": h, "source": source, "model": MODEL if source == "ai" else None,
                    "data_through": f["data_through"], "memo": memo, "disclaimer": DISCLAIMER if source == "ai" else TEMPLATE_DISCLAIMER}
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    return out
