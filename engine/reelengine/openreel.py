"""`openreel --project <dir> --out <dir>`: the edit as an OpenReel Video "portable edit" (github.com/Augani/
openreel-video, MIT), so the person can keep cutting it on a real timeline.

OpenReel's portable edit (`openreel-edit` v2, packages/core/src/editing/portable-project.ts) refers to media by
file name and size; the person imports the files in `media/` first, then the edit, and OpenReel links them.
What goes in:

- every take, once: upright, mirror fixed, HDR tone-mapped, framed the way Matcha Momentum Generator frames it, with the
  per-take auto colour fix and the colour filter baked in (a phone's HDR HEVC .mov is what browsers play worst);
- one clip per kept span of the cut, pointing at its take with the ORIGINAL source times, so a cut can be
  opened up again in OpenReel;
- every still picture card as the PNG Matcha Momentum Generator drew (picture style, tilt and border included), at the
  same place and time;
- the captions as OpenReel subtitles, plus captions.srt.

Not carried over: zooms, music, sound effects, the voice loudness pass and moving b-roll cards. OpenReel has
its own tools for those. Coordinates follow OpenReel's video engine (video-engine.ts): a clip is fitted to the
canvas ("contain"), then scaled, then moved by `position` in pixels from the canvas centre.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from . import autocolor, broll, captions as capmod, capcut, looks, project as projmod, render, tools
from .proto import EngineError, log, progress

FORMAT, VERSION = "openreel-edit", 2
STAGE = "openreel"
MEDIA = "media"
HOW_TO = "HOW TO OPEN.txt"


def contain(sw: float, sh: float, cw: float, ch: float) -> tuple[float, float]:
    """OpenReel's resolveCanvasFitDimensions for fitMode contain (canvas-fit.ts)."""
    if sw / sh <= cw / ch:
        return ch * sw / sh, ch
    return cw, cw * sh / sw


def placed(x: float, y: float, w: float, h: float, cw: int, ch: int) -> dict:
    """The OpenReel transform that draws a w x h image with its top-left at (x, y) on a cw x ch canvas."""
    fw, _ = contain(w, h, cw, ch)
    s = w / fw
    return {"position": {"x": round(x + w / 2 - cw / 2, 2), "y": round(y + h / 2 - ch / 2, 2)},
            "scale": {"x": round(s, 6), "y": round(s, 6)}, "rotation": 0, "anchor": {"x": 0.5, "y": 0.5},
            "opacity": 1, "fitMode": "contain"}


FULL_FRAME = {"position": {"x": 0, "y": 0}, "scale": {"x": 1, "y": 1}, "rotation": 0,
              "anchor": {"x": 0.5, "y": 0.5}, "opacity": 1, "fitMode": "cover"}


def clip(cid: str, media_id: str, track: str, start: float, src_in: float, src_out: float, transform: dict,
         volume: float = 1.0) -> dict:
    return {"id": cid, "mediaId": media_id, "trackId": track, "startTime": round(start, 3),
            "duration": round(src_out - src_in, 3), "inPoint": round(src_in, 3), "outPoint": round(src_out, 3),
            "effects": [], "audioEffects": [], "transform": transform, "volume": volume, "keyframes": []}


def track(tid: str, name: str, kind: str, clips: list, role: str = "general") -> dict:
    return {"id": tid, "name": name, "type": kind, "role": role, "locked": False, "hidden": False,
            "muted": False, "solo": False, "clips": clips, "transitions": []}


def probe_media(path: Path) -> dict:
    """OpenReel media metadata for a file we wrote (duration, size, codec, audio)."""
    out = tools.text_run([tools.ffprobe(), "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
                         60, "openreel probe")
    info = json.loads(out.stdout or "{}")
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), {})
    num, den = (v.get("avg_frame_rate") or "0/1").split("/")
    fps = float(num) / float(den) if float(den or 0) else 0.0
    return {"duration": round(float((info.get("format") or {}).get("duration") or 0.0), 3),
            "width": int(v.get("width") or 0), "height": int(v.get("height") or 0), "frameRate": round(fps, 3),
            "codec": str(v.get("codec_name") or ""), "sampleRate": int(a.get("sample_rate") or 0),
            "channels": int(a.get("channels") or 0), "fileSize": path.stat().st_size,
            "hasVideo": bool(v), "hasAudio": bool(a)}


def media_item(mid: str, path: Path, kind: str) -> dict:
    meta = probe_media(path)
    return {"id": mid, "name": path.name, "type": kind, "metadata": meta,
            "sourceFile": {"name": path.name, "size": path.stat().st_size, "lastModified": int(path.stat().st_mtime * 1000)}}


def _take_chain(proj: dict, src: dict, fix: str, W: int, H: int, face) -> str:
    chain = ((render.HDR_CHAIN + ",") if src.get("hdr") and "zscale" in tools.filters() else "")
    chain += render.reframe_filter(src, W, H, face, False) + fix
    grade = looks.filter_chain(proj.get("look"))
    return chain + ("," + grade if grade else "") + ",format=yuv420p"


def write_take(project_dir: Path, proj: dict, src: dict, path: Path, out: Path, fix: str, face) -> Path:
    """The whole take, framed and graded like the edit, as H.264 + AAC an editor in a browser plays."""
    W, H = int(proj["format"]["width"]), int(proj["format"]["height"])
    tools.text_run([tools.ffmpeg(), "-y", "-nostdin", "-hide_banner", "-loglevel", "error",
                    *render.no_rotate_args(src), "-i", str(path), "-vf", _take_chain(proj, src, fix, W, H, face),
                    "-c:v", "libx264", "-preset", render.FINAL_PRESET, "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", str(out)],
                   max(600, float(src.get("duration") or 60) * 20), "openreel take")
    return out


def _subtitles(cues: list, cap: dict) -> list:
    style = cap.get("style") or {}
    size = float(style.get("size") or 105)
    box = bool(style.get("box"))
    sub_style = {"fontFamily": str(style.get("font") or "Montserrat SemiBold"), "fontSize": round(size * 0.55, 1),
                 "color": str(style.get("color") or "#FFFFFF"),
                 "backgroundColor": str(style.get("outlineColor") or "#000000") if box else "rgba(0,0,0,0)",
                 "position": "bottom" if float(style.get("position") or 0.75) >= 0.6 else "center"}
    return [{"id": f"sub{i + 1}", "text": " ".join(str(c["t"]).split()), "startTime": round(c["s"], 3),
             "endTime": round(c["e"], 3), "style": sub_style}
            for i, c in enumerate(cues) if c["e"] > c["s"] and str(c.get("t", "")).strip()]


def _pictures(project_dir: Path, proj: dict, tl, media_dir: Path, slug: str) -> tuple[list, list]:
    """[(png in media/, layer)] for every still picture card, drawn exactly as the render draws it."""
    if not proj.get("broll"):
        return [], []
    ctx = render.make_ctx(project_dir, proj, tl, False, tools.root_dir(None), project_dir / "work" / "render")
    ctx.window = None
    layers = list(broll.build_layers(ctx) or [])
    stills, skipped = [], []
    for layer in layers:
        if layer.kind != "image":
            skipped.append(Path(layer.path).name)
            continue
        dest = media_dir / f"{slug}-picture-{len(stills) + 1:02d}.png"
        shutil.copyfile(layer.path, dest)
        stills.append((dest, layer))
    return stills, skipped


def run(project_dir: Path, out_dir: Path) -> dict:
    project_dir, out_dir = Path(project_dir).resolve(), Path(out_dir)
    if out_dir.exists() and any(out_dir.iterdir()):
        raise EngineError("OUT_NOT_EMPTY", f"{out_dir} is not empty", "Pick an empty folder for the OpenReel files.")
    media_dir = out_dir / MEDIA
    media_dir.mkdir(parents=True, exist_ok=True)
    try:
        return _write(project_dir, out_dir, media_dir)
    except Exception:
        shutil.rmtree(out_dir, ignore_errors=True)
        raise


def _write(project_dir: Path, out_dir: Path, media_dir: Path) -> dict:
    proj = projmod.load(project_dir)
    words = projmod.load_transcript(project_dir, proj)["words"]
    tl = projmod.timeline(project_dir, proj, words)
    if not tl.segments:
        raise EngineError("EMPTY_CUT", "the cut is empty", "There's nothing left in the edit. Undo the last change.")
    W, H = int(proj["format"]["width"]), int(proj["format"]["height"])
    slug = projmod.slugify(proj.get("title") or "edit", "edit")
    src_meta = {s["id"]: s for s in proj["sources"]}
    src_paths = {s["id"]: projmod.source_path(project_dir, s) for s in proj["sources"]}
    fixes = autocolor.for_project(project_dir / "work", tools.ffmpeg(), proj, src_meta, src_paths)
    faces = render.source_faces(project_dir, proj)

    used = [sid for sid in dict.fromkeys(seg.source for seg in tl.segments)]
    media, takes = [], {}
    for n, sid in enumerate(used, 1):
        progress(STAGE, 5 + 60 * (n - 1) / len(used), "Getting your takes ready for OpenReel", force=True)
        out = write_take(project_dir, proj, src_meta[sid], src_paths[sid], media_dir / f"{slug}-take{n}.mp4",
                         f",{fixes[sid]}" if sid in fixes else "", faces.get(sid))
        takes[sid] = f"take{n}"
        media.append(media_item(takes[sid], out, "video"))
    durations = {m["id"]: m["metadata"]["duration"] for m in media}

    video_clips = []
    for i, seg in enumerate(tl.segments):
        mid = takes[seg.source]
        src_out = min(seg.src_end, durations[mid])
        if src_out - seg.src_start < 0.001:
            continue
        video_clips.append(clip(f"cut{i + 1}", mid, "video", seg.out_start, seg.src_start, src_out, FULL_FRAME))

    progress(STAGE, 70, "Placing your pictures", force=True)
    stills, skipped = _pictures(project_dir, proj, tl, media_dir, slug)
    picture_clips = []
    for k, (png, layer) in enumerate(stills, 1):
        mid = f"picture{k}"
        media.append(media_item(mid, png, "image"))
        length = max(0.05, layer.t1 - layer.t0)
        picture_clips.append(clip(f"pic{k}", mid, "pictures", layer.t0, 0.0, length,
                                  placed(layer.x, layer.y, layer.w, layer.h, W, H), volume=0))

    cap = proj.get("captions") or {}
    cues = capmod.build_cues(tl.words_out, cap, capmod.hidden_set(tl, cap)) if cap.get("enabled", True) else []
    (out_dir / capcut.SRT_NAME).write_text(capcut.to_srt(cues), encoding="utf-8")

    tracks = [track("video", "Video", "video", video_clips, "dialogue")]
    if picture_clips:
        tracks.append(track("pictures", "Pictures", "image", picture_clips))
    edit = {"format": FORMAT, "version": VERSION, "project": {
        "id": f"matcha-momentum-generator-{proj.get('id') or slug}"[:200].replace(" ", "-"), "name": proj.get("title") or "Matcha Momentum Generator edit",
        "settings": {"width": W, "height": H, "frameRate": float(proj["format"].get("fps") or 30),
                     "sampleRate": 48000, "channels": 2},
        "media": media,
        "timeline": {"tracks": tracks, "subtitles": _subtitles(cues, cap), "markers": [],
                     "duration": round(tl.duration, 3)},
        "textClips": []}}
    edit_file = out_dir / f"{slug}.openreel-edit.json"
    edit_file.write_text(json.dumps(edit, indent=1), encoding="utf-8")
    (out_dir / HOW_TO).write_text(how_to(edit_file.name, len(media)), encoding="utf-8")
    if skipped:
        log(f"# openreel: {len(skipped)} moving picture card(s) left out")
    progress(STAGE, 100, "Ready for OpenReel", force=True)
    return {"folder": str(out_dir), "edit": str(edit_file), "srt": str(out_dir / capcut.SRT_NAME),
            "takes": len(takes), "cuts": len(video_clips), "pictures": len(picture_clips),
            "subtitles": len(edit["project"]["timeline"]["subtitles"]), "skipped": len(skipped)}


def how_to(edit_name: str, files: int) -> str:
    return (
        "Open this edit in OpenReel Video (free, https://openreel.video or the desktop app)\n\n"
        "1. Make a new project, portrait 1080 x 1920.\n"
        f"2. Import all {files} files from the \"media\" folder (drag them into the Assets panel).\n"
        f"3. Open the AI Editor panel, then \"Edit JSON & reusable presets\", and import {edit_name}.\n"
        "   OpenReel links each clip to the file with the same name and size. If it asks to relink,\n"
        "   point it at the files in \"media\".\n\n"
        "What you get: every cut as its own clip (drag its edges to bring back what was cut), your\n"
        "pictures on their own track, and your captions as subtitles. captions.srt is a copy of the\n"
        "captions for any other editor.\n\n"
        "Not included: zooms, music and sound effects. Add those in OpenReel.\n"
    )
