"""Pictures, animations and text BEHIND the speaker: the speaker is the foreground.

A layer marked `behind` is left out of the main render, then drawn over the finished picture with the person cut out
of it, frame by frame, so the picture passes behind the head, the hands and the gestures (Vision's person mask covers
the whole body, hands included). Person masks come from macOS Vision (segment.py).

Captions stay on top: when there are behind layers, the main render leaves the captions out and this pass burns them
in last, in the same encode. Without Vision the layers are drawn in front, as before (`masked` False).

One extra pass per video, only over the seconds a layer is on screen: frames of those seconds are read from the
render, the layer's pixels where the person stands are made transparent, and the result is laid over the render.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np

from . import segment
from .proto import log

# a picture with less than this share of itself left visible (the rest is behind the speaker) is reported
MOSTLY_HIDDEN = 0.45
# the person is found in frames this much smaller than the video (then the mask is scaled back up): about 3x faster,
# and the edge is feathered by the upscale anyway
MASK_SCALE = 0.5
WORKERS = 4                     # layers cut out at the same time (Vision and the PNG codecs release the GIL)


@dataclass
class Result:
    drawn: int = 0                       # behind layers laid over the render
    masked: bool = False                 # the person was cut out (False: drawn in front, no Vision)
    stderr: str = ""                     # the final encode's log (libass font choice lives here)
    visible: list = field(default_factory=list)   # [{"t0", "t1", "visible": 0..1}] per layer


def _f(t: float) -> str:
    return f"{t:.3f}"


def _layer_frames(ffmpeg: str, L, fps: float, size: tuple, work: Path) -> Optional[list]:
    """A video layer's frames (RGBA, scaled to `size`), one per output frame of its window, or None for a still."""
    if getattr(L, "kind", "image") != "video":
        return None
    d = work / "src"
    d.mkdir(exist_ok=True)
    subprocess.run([ffmpeg, "-v", "error", "-y", "-i", str(L.path), "-t", _f(L.t1 - L.t0),
                    "-vf", f"fps={fps},scale={size[0]}:{size[1]},format=rgba", str(d / "s%05d.png")], check=True)
    return sorted(d.glob("s*.png"))


def _alpha_union(paths: Optional[list]) -> tuple:
    """The union of every frame's opaque box (x0, y0, x1, y1); the whole first frame when nothing is opaque."""
    from PIL import Image
    box = None
    size = (2, 2)
    for p in paths or []:
        with Image.open(p) as im:
            size = im.size
            b = im.getchannel("A").getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box or (0, 0, size[0], size[1])


def _fade(L, t: float) -> float:
    fi, fo = float(getattr(L, "fade_in", 0) or 0), float(getattr(L, "fade_out", 0) or 0)
    a = 1.0
    if fi > 0:
        a = min(a, max(0.0, (t - L.t0) / fi))
    if fo > 0:
        a = min(a, max(0.0, (L.t1 - t) / fo))
    return a


def _person_mask(frame: Path, size: tuple, draft: bool):
    """The person mask for a (small) frame, scaled to the video's `size`, or None."""
    from PIL import Image
    m = segment.person_mask(frame, "fast" if draft else "balanced")
    if m is None:
        return None
    if (m.shape[1], m.shape[0]) != size:
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize(size, Image.BILINEAR), dtype=np.float32) / 255.0
    return m


def _cut_out(ffmpeg: str, export: Path, L, i: int, fps: float, scale: float, draft: bool, work: Path):
    """One behind layer -> (alpha .mov over [t0, t1], its x, its y, visible share). The speaker is cut out of every
    frame. Only the layer's own box is written (a card is a fraction of the frame), with light PNG compression."""
    from PIL import Image
    frames = work / f"l{i}"
    frames.mkdir()
    fsize = _video_size(ffmpeg, export)
    subprocess.run([ffmpeg, "-v", "error", "-y", "-ss", _f(L.t0), "-t", _f(L.t1 - L.t0), "-i", str(export),
                    "-vf", f"fps={fps},scale=trunc(iw*{MASK_SCALE}/2)*2:-2", "-compression_level", "1",
                    str(frames / "f%05d.png")], check=True)
    size = (max(1, round(L.w * scale)), max(1, round(L.h * scale)))
    x, y = round(L.x * scale), round(L.y * scale)
    vids = _layer_frames(ffmpeg, L, fps, size, frames)
    still = None if vids is not None else Image.open(L.path).convert("RGBA")
    if still is not None and still.size != size:
        still = still.resize(size, Image.LANCZOS)
    out_dir = work / f"o{i}"
    out_dir.mkdir()
    shown, total = 0.0, 0.0
    # where the layer ever has pixels (layer px): a full-frame animation usually draws in a fraction of it
    content = (0, 0, size[0], size[1]) if still is not None else _alpha_union(vids)
    box = None                                   # the layer's box inside the frame (x0, y0, x1, y1), even sizes
    for n, f in enumerate(sorted(frames.glob("f*.png"))):
        if vids is not None:
            if not vids:
                break
            with Image.open(vids[min(n, len(vids) - 1)]) as v:
                card = v.convert("RGBA")
        else:
            card = still
        if box is None:
            x0, y0 = max(0, x + content[0]) // 2 * 2, max(0, y + content[1]) // 2 * 2
            x1 = min(fsize[0], x + content[2])
            y1 = min(fsize[1], y + content[3])
            x1, y1 = x0 + max(2, (x1 - x0) // 2 * 2), y0 + max(2, (y1 - y0) // 2 * 2)
            box = (x0, y0, min(fsize[0], x1), min(fsize[1], y1))
        layer = Image.new("RGBA", (box[2] - box[0], box[3] - box[1]), (0, 0, 0, 0))
        layer.paste(card, (x - box[0], y - box[1]), card)
        a = np.asarray(layer, dtype=np.float32)
        a[..., 3] *= _fade(L, L.t0 + n / fps)
        before = float(a[..., 3].sum())
        mask = _person_mask(f, fsize, draft)
        if mask is not None:
            a[..., 3] *= (1.0 - mask[box[1]:box[3], box[0]:box[2]])
        shown += float(a[..., 3].sum())
        total += before
        Image.fromarray(a.astype(np.uint8), "RGBA").save(out_dir / f.name, compress_level=1)
    mov = work / f"o{i}.mov"
    subprocess.run([ffmpeg, "-v", "error", "-y", "-framerate", _f(fps), "-i", str(out_dir / "f%05d.png"),
                    "-c:v", "qtrle", "-pix_fmt", "argb", str(mov)], check=True)
    bx, by = (box[0], box[1]) if box else (0, 0)
    return mov, bx, by, (shown / total if total else 1.0)


def _video_size(ffmpeg: str, path: Path) -> tuple:
    """(width, height) of a video, read with ffprobe next to ffmpeg (or on PATH)."""
    probe = Path(ffmpeg).with_name("ffprobe")
    exe = str(probe) if probe.exists() else (shutil.which("ffprobe") or "ffprobe")
    out = subprocess.run([exe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                          "-of", "csv=p=0:s=x", str(path)], check=True, capture_output=True, text=True).stdout.strip()
    w, h = out.split("x")[:2]
    return int(w), int(h)


def _graded(k: int, grade: Optional[str]) -> str:
    """The overlay input `k`, colour-graded like the rest of the picture, its alpha kept."""
    if not grade:
        return f"[{k}:v]format=rgba[g{k}]"
    return (f"[{k}:v]format=rgba,split[c{k}][a{k}];[a{k}]alphaextract[m{k}];"
            f"[c{k}]{grade},format=rgba[cc{k}];[cc{k}][m{k}]alphamerge[g{k}]")


def _finish(ffmpeg: str, export: Path, overlays: list, enc_args: list, ass: Optional[str], cwd: Optional[Path],
            grade: Optional[str]) -> str:
    """Lays the overlays over `export`, then the captions on top, in one encode. Returns ffmpeg's log."""
    cmd = [ffmpeg, "-hide_banner", "-loglevel", "info", "-nostdin", "-y", "-i", str(export)]
    chain, cur = [], "0:v"
    for k, (mov, x, y, t0, t1) in enumerate(overlays):
        cmd += ["-itsoffset", _f(t0), "-i", str(mov)]
        chain.append(_graded(k + 1, grade))
        chain.append(f"[{cur}][g{k + 1}]overlay={x}:{y}:eof_action=pass:enable='between(t,{_f(t0)},{_f(t1)})'[b{k}]")
        cur = f"b{k}"
    if ass:
        chain.append(f"[{cur}]subtitles=filename={ass}:fontsdir=fonts[capd]")
        cur = "capd"
    chain.append(f"[{cur}]format=yuv420p[vout]")
    part = export.with_name(export.stem + ".behind.mp4")
    cmd += ["-filter_complex", ";".join(chain), "-map", "[vout]", "-map", "0:a?", "-c:a", "copy", *enc_args,
            "-movflags", "+faststart", str(part)]
    p = subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=str(cwd) if cwd else None)
    os.replace(part, export)
    return p.stderr or ""


def apply(ffmpeg: str, export: Path, layers: list, fps: float, scale: float, enc_args: list, draft: bool,
          ass: Optional[str] = None, cwd: Optional[Path] = None, grade: Optional[str] = None) -> Result:
    """Lays every `behind` layer over `export` with the person cut out, then burns `ass` (captions, a file name
    relative to `cwd`) on top. The captions are always burned, even when the layers fail."""
    res = Result(masked=segment.available())
    if not layers and not ass:
        return res
    work = Path(tempfile.mkdtemp(prefix="behind-"))
    try:
        overlays = []
        try:
            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=max(1, min(WORKERS, len(layers)))) as pool:
                done = list(pool.map(lambda iL: _cut_out(ffmpeg, export, iL[1], iL[0], fps, scale, draft, work),
                                     enumerate(layers)))
            for L, (mov, x, y, vis) in zip(layers, done):
                overlays.append((mov, x, y, L.t0, L.t1))
                res.visible.append({"t0": round(L.t0, 3), "t1": round(L.t1, 3), "visible": round(vis, 3)})
        except (subprocess.CalledProcessError, OSError, ValueError) as e:
            log(f"# pictures behind the speaker skipped: {e}")
            overlays, res.visible = [], []
        res.stderr = _finish(ffmpeg, export, overlays, enc_args, ass, cwd, grade)
        res.drawn = len(overlays)
        return res
    finally:
        shutil.rmtree(work, ignore_errors=True)
