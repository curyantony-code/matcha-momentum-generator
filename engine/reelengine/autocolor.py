"""Auto colour: each take measured once, then its exposure and white balance gently fixed so takes match.

Runs per take, right after the reframe and before the look (looks.py), so a creative filter starts from
a corrected picture. Same file in, same numbers out: the measurement reads keyframes of the source at a
fixed small size, and the correction is a pure function of those numbers (`correction`). Measurements
are cached in work/autocolor.json, keyed by the source's size and modification time.

Only `look.autoColor: true` turns it on. An HDR take (an iPhone's Dolby Vision) is measured after the same tone
map the render gives it; on its own it is left as the tone map made it, and with a house look it is matched too.

The house look (Library/house-look.json): the measured light of one take the person liked. When it is set, every
take of every video is matched to it, so they all look like one series: the average brightness exactly, then the
contrast range (10th to 90th percentile of luma), the saturation and the colour cast, each within safe limits.
That is mean-and-spread matching per channel (Reinhard's colour transfer, in the video's own YUV), done with
ffmpeg's eq and lutyuv so it stays cheap and the same numbers always give the same picture. Without a house look
the take is only pulled back into a well-exposed band and its cast partly fixed, as before.
"""
from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path
from typing import Optional

from . import tools
from .proto import EngineError, log

# Exposure: average luma, as a share of the TV range (16-235). Inside the band a take is left as shot
# (a well-exposed iPhone take measured 0.62); outside it, it is pulled back to the nearest edge.
LUMA_LOW, LUMA_HIGH = 0.48, 0.66
GAMMA_MIN, GAMMA_MAX = 0.8, 1.45

# White balance, in 8-bit chroma steps around 128. Skin pulls V up and U down, so "neutral" for a
# face-to-camera take sits a little warm (the same iPhone take: U -7, V +5); only the cast beyond that
# is corrected, and only part of it.
REF_U, REF_V = -6.0, 5.0
CAST_DEAD_ZONE = 2.0
CAST_SHARE = 0.6
CAST_MAX = 8.0

# Matching to the house look: how far each part may move a take (a bad take is helped, never turned into
# something else), and the differences too small to touch.
HOUSE_CONTRAST = (0.85, 1.2)
HOUSE_SATURATION = (0.85, 1.25)
HOUSE_DEAD_ZONE = 0.03          # a contrast or saturation within 3 % of the house look is left alone
HOUSE_CAST_SHARE = 0.8
HOUSE_CAST_MAX = 10.0
HOUSE_FILE = "house-look.json"
HOUSE_KEYS = ("y", "u", "v", "lo", "hi", "sat")

SAMPLE_FRAMES = 60             # keyframes read per take
_STAT = re.compile(r"lavfi\.signalstats\.(YAVG|UAVG|VAVG|YLOW|YHIGH|SATAVG)=([\d.]+)")
_OUT = {"YAVG": "y", "UAVG": "u", "VAVG": "v", "YLOW": "lo", "YHIGH": "hi", "SATAVG": "sat"}


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _ratio(want: float, have: float, lo_hi: tuple) -> Optional[float]:
    """want/have within limits, or None when it is within the dead zone (or cannot be measured)."""
    if have <= 0 or want <= 0:
        return None
    r = want / have
    return None if abs(r - 1.0) <= HOUSE_DEAD_ZONE else round(_clamp(r, *lo_hi), 3)


def house_correction(stats: dict, house: dict) -> Optional[str]:
    """The chain that makes one take look like the house look: its cast first, then brightness, contrast and
    saturation in one eq. None when it already matches."""
    parts = []
    du = round(_clamp((float(stats["u"]) - float(house["u"])) * HOUSE_CAST_SHARE, -HOUSE_CAST_MAX, HOUSE_CAST_MAX), 1)
    dv = round(_clamp((float(stats["v"]) - float(house["v"])) * HOUSE_CAST_SHARE, -HOUSE_CAST_MAX, HOUSE_CAST_MAX), 1)
    du, dv = (0.0 if abs(du) <= CAST_DEAD_ZONE else du), (0.0 if abs(dv) <= CAST_DEAD_ZONE else dv)
    if du or dv:
        parts.append("format=yuv420p,lutyuv=" + ":".join(
            f"{ch}='clip(val-({d:.1f}),16,240)'" for ch, d in (("u", du), ("v", dv)) if d))
    eq = []
    luma = _clamp((float(stats["y"]) - 16.0) / 219.0, 0.03, 0.97)
    target = _clamp((float(house["y"]) - 16.0) / 219.0, 0.03, 0.97)
    if abs(luma - target) > 0.01:
        eq.append(f"gamma={_clamp(math.log(luma) / math.log(target), GAMMA_MIN, GAMMA_MAX):.3f}")
    contrast = _ratio(float(house["hi"]) - float(house["lo"]), float(stats["hi"]) - float(stats["lo"]), HOUSE_CONTRAST)
    if contrast:
        eq.append(f"contrast={contrast:.3f}")
    saturation = _ratio(float(house["sat"]), float(stats["sat"]), HOUSE_SATURATION)
    if saturation:
        eq.append(f"saturation={saturation:.3f}")
    if eq:
        parts.append("eq=" + ":".join(eq))
    return ",".join(parts) or None


def is_house(v: object) -> bool:
    return isinstance(v, dict) and all(isinstance(v.get(k), (int, float)) for k in HOUSE_KEYS)


def correction(stats: Optional[dict], house: Optional[dict] = None) -> Optional[str]:
    """The filter chain that fixes one take, from its averages {y, u, v, lo, hi, sat} in 8-bit, or None if it
    needs nothing. With a house look, the take is matched to it; without, it is only put right."""
    if not stats:
        return None
    if is_house(house) and is_house(stats):
        return house_correction(stats, house)
    parts = []
    luma = _clamp((float(stats["y"]) - 16.0) / 219.0, 0.03, 0.97)
    if not LUMA_LOW <= luma <= LUMA_HIGH:
        target = LUMA_LOW if luma < LUMA_LOW else LUMA_HIGH
        gamma = _clamp(math.log(luma) / math.log(target), GAMMA_MIN, GAMMA_MAX)
        parts.append(f"eq=gamma={gamma:.3f}")
    du = _cast(float(stats["u"]) - 128.0 - REF_U)
    dv = _cast(float(stats["v"]) - 128.0 - REF_V)
    if du or dv:
        parts.append("format=yuv420p,lutyuv=" + ":".join(
            f"{ch}='clip(val-({d:.1f}),16,240)'" for ch, d in (("u", du), ("v", dv)) if d))
    return ",".join(parts) or None


def _cast(d: float) -> float:
    if abs(d) <= CAST_DEAD_ZONE:
        return 0.0
    return round(_clamp(d * CAST_SHARE, -CAST_MAX, CAST_MAX), 1)


def parse_stats(text: str) -> Optional[dict]:
    """Average of the per-frame signalstats lines ffmpeg's metadata filter printed: brightness and cast (YAVG,
    UAVG, VAVG, always), and the contrast range and saturation (YLOW, YHIGH, SATAVG) when present."""
    sums = {k: 0.0 for k in _OUT}
    counts = {k: 0 for k in _OUT}
    for key, val in _STAT.findall(text or ""):
        sums[key] += float(val)
        counts[key] += 1
    if not all(counts[k] for k in ("YAVG", "UAVG", "VAVG")):
        return None
    out = {_OUT[k]: round(sums[k] / counts[k], 2) for k in _OUT if counts[k]}
    return {**out, "frames": counts["YAVG"]}


def measure(ffmpeg: str, path: Path, hdr: bool = False) -> Optional[dict]:
    """Average luma and chroma of a take's keyframes, at a fixed small size, in 8-bit. An HDR take is measured
    after the render's own tone map, so the numbers describe the picture the viewer sees."""
    from .render import HDR_CHAIN       # render imports this module; imported here to keep that one-way
    tone = f"{HDR_CHAIN}," if hdr else ""
    out = tools.text_run(
        [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-skip_frame", "nokey", "-i", str(path),
         "-vf", f"{tone}scale=160:-2,format=yuv420p,signalstats,metadata=mode=print:file=-",
         "-frames:v", str(SAMPLE_FRAMES), "-an", "-f", "null", "-"], 300, "auto colour", check=False)
    return parse_stats(out.stdout)


def _key(path: Path, hdr: bool = False) -> str:
    st = os.stat(path)
    return f"{st.st_size}:{st.st_mtime_ns}" + (":hdr" if hdr else "")


FIX_KEY = "_autoColorFix"       # render-only key on a COPY of the source; never saved


def enabled(proj: dict) -> bool:
    return (proj.get("look") or {}).get("autoColor") is True


def with_fixes(src_meta: dict, fixes: dict) -> dict:
    """A copy of the sources with each take's fix attached under FIX_KEY (the originals are untouched)."""
    return {sid: ({**meta, FIX_KEY: fixes[sid]} if sid in fixes else meta) for sid, meta in src_meta.items()}


def fix_of(src: Optional[dict]) -> str:
    """The fix to append to a take's picture chain: ',<chain>' or ''."""
    chain = (src or {}).get(FIX_KEY)
    return f",{chain}" if chain else ""


def house_look(root: Optional[Path] = None) -> Optional[dict]:
    """The person's house look (Library/house-look.json), or None when it is not set or unreadable."""
    f = Path(root or tools.root_dir()) / "Library" / HOUSE_FILE
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    stats = data.get("stats") if isinstance(data, dict) else None
    return stats if is_house(stats) else None


def take_stats(work: Path, ffmpeg: str, sid: str, path: Path, hdr: bool = False) -> Optional[dict]:
    """One take's measurement, from work/autocolor.json when it is fresh and complete, else measured now (and
    saved). An old cache without the contrast range and saturation is measured again."""
    cache_file = Path(work) / "autocolor.json"
    try:
        cache = json.loads(cache_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    key = _key(path, hdr)
    hit = cache.get(sid)
    if isinstance(hit, dict) and hit.get("key") == key and is_house(hit.get("stats")):
        return hit["stats"]
    stats = measure(ffmpeg, path, hdr)
    if stats is not None:
        _write_cache(cache_file, {**cache, sid: {"key": key, "stats": stats}})
    return stats


def _write_cache(cache_file: Path, data: dict) -> None:
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache_file.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    os.replace(tmp, cache_file)


def set_house_look(project_dir: Path, root: Optional[Path] = None, source: Optional[str] = None) -> dict:
    """Make one take of this video the house look (its first take unless `source` names another)."""
    from . import project as projmod
    project_dir = Path(project_dir)
    proj = projmod.load(project_dir)
    srcs = [s for s in proj.get("sources") or [] if not source or s.get("id") == source]
    if not srcs:
        raise EngineError("NO_SOURCE", f"no take {source!r}", "That video has no take to take the colour from.")
    s = srcs[0]
    stats = take_stats(project_dir / "work", tools.ffmpeg(), s["id"], projmod.source_path(project_dir, s), bool(s.get("hdr")))
    if not is_house(stats):
        raise EngineError("NO_MEASURE", "could not measure the take", "I could not measure the colour of that video. Try another one.")
    house = {"stats": {k: stats[k] for k in HOUSE_KEYS}, "from": {"project": proj.get("title") or project_dir.name, "source": s["id"]}}
    f = Path(root or tools.root_dir()) / "Library" / HOUSE_FILE
    f.parent.mkdir(parents=True, exist_ok=True)
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(house, indent=1), encoding="utf-8")
    os.replace(tmp, f)
    return house


def for_project(work: Path, ffmpeg: str, proj: dict, src_meta: dict, src_paths: dict,
                root: Optional[Path] = None) -> dict:
    """{source id: filter chain} for the takes that need fixing; empty when auto colour is off. With a house
    look (Library/house-look.json under `root`), every take is matched to it."""
    if not enabled(proj) or "signalstats" not in tools.filters():
        return {}
    house = house_look(root)
    cache_file = Path(work) / "autocolor.json"
    try:
        cache = json.loads(cache_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        cache = {}
    fixes, fresh = {}, dict(cache)
    for sid, path in src_paths.items():
        hdr = bool((src_meta.get(sid) or {}).get("hdr"))
        if hdr and house is None:
            continue                     # the tone map sets its light; only a house look changes it
        key = _key(path, hdr)
        hit = cache.get(sid)
        stats = hit["stats"] if isinstance(hit, dict) and hit.get("key") == key else None
        if stats is not None and house is not None and not is_house(stats):
            stats = None                 # an old measurement, from before the contrast range and saturation
        if stats is None:
            stats = measure(ffmpeg, path, hdr)
            if stats is None:
                log(f"# auto colour: no measurement for {sid}, left as shot")
                continue
            fresh = {**fresh, sid: {"key": key, "stats": stats}}
        chain = correction(stats, house)
        if chain:
            fixes[sid] = chain
    if fresh != cache:
        _write_cache(cache_file, fresh)
    return fixes
