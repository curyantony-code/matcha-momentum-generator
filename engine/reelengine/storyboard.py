"""`storyboard --project <dir>`: the edit as scenes to approve before the full-quality render.

Each scene is a stretch of the cut that ends on a sentence: what is said, what pops up (text cards, pictures,
animations), and a still taken from the newest preview, which already shows the cut, captions and pictures.
Written to work/storyboard/. Reads the project; never changes it.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from . import project as projmod, render, tools
from .proto import progress

MIN_SCENE = 2.0       # seconds: a shorter sentence joins the next one
MAX_SCENE = 7.0       # seconds: a longer run is split even without a full stop
STILL_WIDTH = 360
STILL_TIMEOUT = 60.0
SENTENCE_END = (".", "?", "!")
OUT_REL = Path("work") / "storyboard"


def _text(word: dict) -> str:
    return str(word["w"]).strip()


def _scene(words: list) -> dict:
    return {"t0": words[0]["s"], "t1": words[-1]["e"], "ids": [w["id"] for w in words],
            "text": " ".join(_text(w) for w in words)}


def group_scenes(words_out: list, min_len: float = MIN_SCENE, max_len: float = MAX_SCENE) -> list:
    """Kept words in output time -> scenes, each ending on a sentence once it is long enough."""
    scenes, current = [], []
    for word in words_out:
        if current and word["e"] - current[0]["s"] > max_len:
            scenes.append(_scene(current))
            current = []
        current.append(word)
        if _text(word).endswith(SENTENCE_END) and word["e"] - current[0]["s"] >= min_len:
            scenes.append(_scene(current))
            current = []
    if current:
        scenes.append(_scene(current))
    return scenes


ANIMATION_NAMES = {"big-quote": "Quote", "list-reveal": "List", "stat-count-up": "Count-up", "logo-pop": "Logo",
                   "typing-terminal": "Typing"}
ANIMATION_FILE = re.compile(r"anim-(.+)-\d+\.(?:mov|webm|mp4)$")


def _animation(asset: str, project_dir: Optional[Path]) -> Optional[tuple]:
    """(template, params) of a rendered animation, from its .anim.json sidecar or else its file name."""
    found = ANIMATION_FILE.search(Path(asset).name)
    if not found:
        return None
    if project_dir is not None:
        side = Path(project_dir) / re.sub(r"\.(mov|webm|mp4)$", ".anim.json", asset)
        try:
            data = json.loads(side.read_text(encoding="utf-8"))
            if data.get("kind") == "reelstudio-animation" and isinstance(data.get("template"), str):
                return data["template"], data.get("params") or {}
        except (OSError, ValueError):
            pass
    return found.group(1), {}


def overlay_label(item: dict, project_dir: Optional[Path] = None) -> str:
    params = item.get("params") or {}
    asset = str(item.get("asset") or "")
    if item.get("treatment") == "text-pop" and not asset:
        return f"Text card: {params.get('text', '')}".strip()
    anim = _animation(asset, project_dir) if asset else None
    if anim:
        template, aparams = anim
        name = ANIMATION_NAMES.get(template, template.replace("-", " ").capitalize())
        words = aparams.get("text") or ", ".join(str(i) for i in aparams.get("items") or [])
        return f"{name}: {words}" if words else name
    if item.get("treatment") == "animation":
        return "Animation"
    return f"Picture: {Path(asset or 'picture').name}"


def place_overlays(scenes: list, broll: list, words_by_id: dict, project_dir: Optional[Path] = None) -> list:
    """New scenes, each with the overlays that start in it (or in the gap just before it), in start order."""
    timed = sorted(((words_by_id[b["anchor"]["from"]]["s"], overlay_label(b, project_dir)) for b in broll
                    if b.get("anchor", {}).get("from") in words_by_id), key=lambda x: x[0])
    placed = []
    for i, scene in enumerate(scenes):
        end = scenes[i + 1]["t0"] if i + 1 < len(scenes) else float("inf")
        start = scene["t0"] if i else float("-inf")
        placed.append({**scene, "overlays": [label for t, label in timed if start <= t < end]})
    return placed


def _still(video: Path, at: float, dst: Path) -> bool:
    cmd = [tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{at:.3f}", "-i", video,
           "-frames:v", "1", "-vf", f"scale={STILL_WIDTH}:-2", "-q:v", "4", dst]
    tools.text_run(cmd, STILL_TIMEOUT, "storyboard still", check=False)
    return dst.is_file()


def run(project_dir: Path, video: Optional[Path] = None) -> dict:
    project_dir = Path(project_dir)
    proj = projmod.load(project_dir)
    tl = projmod.timeline(project_dir, proj)
    scenes = place_overlays(group_scenes(tl.words_out), proj.get("broll") or [], {w["id"]: w for w in tl.words_out},
                            project_dir)
    out = project_dir / OUT_REL
    out.parent.mkdir(parents=True, exist_ok=True)
    # Built in a folder of its own, then swapped in: the app can ask for the storyboard twice at once (two screens
    # opening), and two runs clearing and recreating the same folder crashed the second one.
    build = Path(tempfile.mkdtemp(prefix=f"{out.name}.", dir=out.parent))
    video = Path(video) if video else render.latest_render(project_dir)
    for i, scene in enumerate(scenes, start=1):
        progress("storyboard", 100 * i / max(1, len(scenes)), "Laying out your scenes")
        still = build / f"scene-{i:02d}.jpg"
        has_still = bool(video and video.is_file()) and _still(video, (scene["t0"] + scene["t1"]) / 2, still)
        scene["still"] = str(OUT_REL / still.name) if has_still else None
        scene["n"] = i
    result = {"video": str(video) if video and video.is_file() else None, "scenes": scenes}
    projmod.write_json(build / "storyboard.json", result)
    _swap_in(build, out)
    return result


def _swap_in(build: Path, out: Path) -> None:
    """Replaces `out` with `build`. If another run swaps its own in at the same moment, the newest one wins and
    nothing is left half-written (both runs built the same storyboard from the same project)."""
    old = out.with_name(f"{out.name}.old.{os.getpid()}")
    try:
        if out.exists():
            os.replace(out, old)
        os.replace(build, out)
    except OSError:
        shutil.rmtree(build, ignore_errors=True)       # the other run's storyboard is in place: keep it
    finally:
        shutil.rmtree(old, ignore_errors=True)
