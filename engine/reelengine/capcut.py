"""`capcut --project <dir> --out <dir>`: the edit for CapCut, as video.mp4 without burned captions plus captions.srt.

CapCut imports .srt captions officially (Captions > Add captions). Writing CapCut's own project files is not done:
that format is undocumented and current versions reject drafts made by other programs.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from . import captions as capmod, project as projmod, render
from .proto import EngineError, progress

VIDEO_NAME = "video.mp4"
SRT_NAME = "captions.srt"


def _stamp(seconds: float) -> str:
    ms = max(0, round(seconds * 1000))
    h, rest = divmod(ms, 3_600_000)
    m, rest = divmod(rest, 60_000)
    s, ms = divmod(rest, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(cues: list) -> str:
    """SubRip text from caption cues ({s, e, t}); empty or backwards cues are left out."""
    blocks = []
    for cue in cues:
        text = " ".join(str(cue.get("t", "")).split())
        if not text or cue["e"] <= cue["s"]:
            continue
        blocks.append(f"{len(blocks) + 1}\n{_stamp(cue['s'])} --> {_stamp(cue['e'])}\n{text}\n")
    return "\n".join(blocks)


def _cues(project_dir: Path) -> list:
    proj = projmod.load(project_dir)
    tl = projmod.timeline(project_dir, proj)
    cap = proj.get("captions") or {}
    return capmod.build_cues(tl.words_out, cap, capmod.hidden_set(tl, cap))


def run(project_dir: Path, out_dir: Path) -> dict:
    project_dir, out_dir = Path(project_dir), Path(out_dir)
    if out_dir.exists() and any(out_dir.iterdir()):
        raise EngineError("OUT_NOT_EMPTY", f"{out_dir} is not empty", "Pick an empty folder for the CapCut files.")
    out_dir.mkdir(parents=True, exist_ok=True)
    cues = _cues(project_dir)
    (out_dir / SRT_NAME).write_text(to_srt(cues), encoding="utf-8")
    try:
        result = render.run(project_dir, verify=False, clean_dir=out_dir)
    except Exception:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise
    video = out_dir / VIDEO_NAME
    Path(result["file"]).replace(video)
    for leftover in out_dir.iterdir():
        if leftover.name not in (VIDEO_NAME, SRT_NAME):
            shutil.rmtree(leftover) if leftover.is_dir() else leftover.unlink()
    progress("capcut", 100, "Ready for CapCut", force=True)
    return {"video": str(video), "srt": str(out_dir / SRT_NAME), "cues": len(cues)}
