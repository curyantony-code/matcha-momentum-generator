"""Colour filters for the whole picture. Same project in, same video out: each name maps to one fixed chain.

The chain runs after pictures and animations are placed and before captions are burned in, so captions keep
the colours the person picked. Only names known here are used; anything else is ignored.

Two sets of names:
- Matcha Momentum Generator's own (FILTERS below): none, warm, cool, vivid, film, faded, mono.
- OpenReel Video's 30 colour presets (data/openreel_looks.json, imported from its filter-presets.ts, MIT,
  Augustus Otu and Contributors, by scripts/import_openreel_looks.py), named by their OpenReel ids such as
  "cinematic-teal-orange". Each effect is translated with OpenReel's own pixel maths (its shaders):
  brightness adds to RGB, contrast pivots at mid grey, saturation mixes with luma, hue rotates, so ffmpeg's
  eq and hue match them closely. Vignette, grain, blur and sharpen are ffmpeg's own versions, close but not
  pixel-identical. The noise filter's seed is fixed, so grain is the same on every render.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Optional

FILTERS = {
    "none": None,
    "warm": "colorbalance=rs=0.06:gs=0.02:bs=-0.06:rm=0.04:bm=-0.04,eq=saturation=1.06",
    "cool": "colorbalance=rs=-0.05:bs=0.07:rm=-0.03:bm=0.05,eq=saturation=0.97",
    "vivid": "eq=saturation=1.3:contrast=1.06",
    "film": "curves=preset=medium_contrast,eq=saturation=0.82,colorbalance=rs=0.03:bh=-0.04",
    "faded": "eq=contrast=0.88:brightness=0.03:saturation=0.8",
    "mono": "hue=s=0,eq=contrast=1.08",
}

OPENREEL_FILE = Path(__file__).with_name("data") / "openreel_looks.json"
NOISE_SEED = 7


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, float(x)))


def _effect(e: dict) -> Optional[str]:
    """One OpenReel effect as an ffmpeg filter (None if it does nothing)."""
    t, p = e.get("type"), e.get("params") or {}
    if t == "brightness":
        return f"eq=brightness={_clamp(p.get('value', 0), -1, 1):.3f}"
    if t == "contrast":
        return f"eq=contrast={_clamp(p.get('value', 1), 0, 2):.3f}"
    if t == "saturation":
        return f"eq=saturation={_clamp(p.get('value', 1), 0, 3):.3f}"
    if t == "hue":
        return f"hue=h={_clamp(p.get('rotation', 0), -360, 360):g}"
    if t == "blur":
        r = _clamp(p.get("radius", 0), 0, 20)
        return f"gblur=sigma={r:.2f}" if r > 0 else None
    if t == "sharpen":
        a = _clamp(p.get("amount", 0), 0, 3)
        return f"unsharp=5:5:{a * 2:.2f}:5:5:0" if a > 0 else None
    if t == "vignette":
        a = _clamp(p.get("amount", 0), 0, 1)
        return f"vignette=angle={0.2 + a * 0.9:.3f}" if a > 0 else None
    if t == "grain":
        strength = int(round(_clamp(p.get("amount", 0), 0, 1) * 40))
        if strength <= 0:
            return None
        if p.get("colored"):
            return f"noise=alls={strength}:allf=t:all_seed={NOISE_SEED}"
        return f"noise=c0s={strength}:c0f=t:c0_seed={NOISE_SEED}"
    return None


@lru_cache(maxsize=1)
def openreel_filters() -> dict:
    """{OpenReel preset id: ffmpeg chain}. Empty if the data file is missing."""
    try:
        presets = json.loads(OPENREEL_FILE.read_text(encoding="utf-8"))["presets"]
    except (OSError, ValueError, KeyError):
        return {}
    out = {}
    for p in presets:
        parts = [f for f in (_effect(e) for e in p.get("effects") or []) if f]
        out[str(p["id"])] = ",".join(parts) or None
    return out


def known(name: str) -> bool:
    return name in FILTERS or name in openreel_filters()


def filter_chain(look: Optional[dict]) -> Optional[str]:
    """The ffmpeg filter chain for a project's `look`, or None for no filter."""
    name = (look or {}).get("filter")
    if not isinstance(name, str):
        return None
    if name in FILTERS:
        return FILTERS[name]
    return openreel_filters().get(name)
