"""`clip --project <long video> --segments <file> --out-root <dir>`: cut chosen moments into their own projects.

Each moment becomes a normal project, so the rest of the pipeline (transcribe, analyze, autocut, render) applies
unchanged. Choosing the moments is not done here: the engine never calls an LLM (see docs/architecture.md).
"""
from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

from . import clipsnap, init as initmod, project as projmod, tools
from .proto import EngineError, progress

SILENCE_NOISE_DB = -35
SILENCE_MIN_SECONDS = 0.3
SECONDS_PER_MEDIA_SECOND = 2.0  # generous limit for scanning or encoding one second of video
MIN_TIMEOUT = 120.0
MAX_NAME_TRIES = 1000


def _timeout(seconds: float) -> float:
    return max(MIN_TIMEOUT, seconds * SECONDS_PER_MEDIA_SECOND)


def _detect_silences(path: Path, duration: float) -> list:
    graph = f"silencedetect=noise={SILENCE_NOISE_DB}dB:d={SILENCE_MIN_SECONDS}"
    cmd = [tools.ffmpeg(), "-hide_banner", "-nostats", "-i", path, "-vn", "-af", graph, "-f", "null", "-"]
    return clipsnap.parse_silences(tools.text_run(cmd, _timeout(duration), "silence scan").stderr)


def _extract(path: Path, start: float, end: float, dst: Path) -> None:
    # Re-encoded, because stream copy can only start on a keyframe and would lose the snapped start.
    cmd = [tools.ffmpeg(), "-hide_banner", "-y", "-ss", f"{start:.3f}", "-i", path, "-t", f"{end - start:.3f}",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-b:a", "192k",
           "-movflags", "+faststart", dst]
    tools.text_run(cmd, _timeout(end - start), "clip extract")


def _read_segments(segments_file: Path, duration: float) -> list:
    try:
        return clipsnap.parse_segments(json.loads(Path(segments_file).read_text(encoding="utf-8")), duration)
    except (OSError, ValueError) as exc:
        raise EngineError("BAD_SEGMENTS", f"{segments_file}: {exc}",
                          "I couldn't read which moments to cut. Please try again.")


def _free_folder(root: Path, name: str) -> Path:
    """A project folder nobody uses. Names stay plain letters, digits and dashes: they become the project's slug."""
    if not (root / name).exists():
        return root / name
    for i in range(2, MAX_NAME_TRIES):
        if not (root / f"{name}-{i}").exists():
            return root / f"{name}-{i}"
    raise EngineError("IO", f"no free folder for {name}", "I couldn't save your clip. Please try again.")


def _make_projects(cuts: list, out_root: Path, slug: str) -> list:
    """One project per cut. If any fails, the ones made in this run are removed again."""
    folders = []
    try:
        made = []
        for i, cut in enumerate(cuts, start=1):
            folder = _free_folder(out_root, f"{slug}-clip-{i:02d}")
            folders.append(folder)
            result = initmod.run(folder, cut["title"], [cut["file"]])
            made.append({"project": result["project"], "title": cut["title"], "start": cut["start"], "end": cut["end"]})
        return made
    except Exception:
        for folder in folders:
            shutil.rmtree(folder, ignore_errors=True)
        raise


def run(project_dir: Path, segments_file: Path, out_root: Path, source_id: str = "s1") -> dict:
    project_dir = Path(project_dir)
    out_root = Path(out_root)
    proj = projmod.load(project_dir)
    source = next((s for s in proj["sources"] if s["id"] == source_id), None)
    if source is None:
        raise EngineError("BAD_SOURCE", f"no source {source_id}", "I couldn't find that video in the project.")
    media = project_dir / source["path"]
    segments = _read_segments(segments_file, source["duration"])
    transcript = projmod.load_transcript(project_dir, proj)
    words = [w for w in transcript["words"] if w.get("source") == source_id]
    if not words:
        raise EngineError("NO_WORDS", f"no words for {source_id}",
                          "This video needs its words written out first. Please transcribe it.")

    progress("clip", 5, "Finding the quiet moments", force=True)
    silences = _detect_silences(media, source["duration"])
    work = project_dir / "work"
    work.mkdir(parents=True, exist_ok=True)
    # All cuts first, then all projects: a failure leaves nothing half made. The folder is unique to this run.
    temp_dir = Path(tempfile.mkdtemp(dir=work, prefix="clips-"))
    try:
        cuts = []
        for i, seg in enumerate(segments, start=1):
            progress("clip", 10 + 80 * (i - 1) / len(segments), f"Cutting clip {i} of {len(segments)}", force=True)
            start, end = clipsnap.snap_segment(words, silences, seg["start"], seg["end"], source["duration"])
            temp = temp_dir / f"clip-{i:02d}.mp4"
            _extract(media, start, end, temp)
            title = seg.get("title") or f"{proj.get('title', 'Clip')} {i}"
            cuts.append({"file": temp, "title": title, "start": start, "end": end})
        made = _make_projects(cuts, out_root, proj["slug"])
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
    progress("clip", 100, "Your clips are ready", force=True)
    return {"clips": made}
