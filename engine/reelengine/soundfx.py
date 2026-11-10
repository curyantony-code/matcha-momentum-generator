"""Sound effects under the edit: a soft pop on each text card, a swish on each animation, a tap on each picture.

The sounds come from earshot's bank (MIT, github.com/Leonxlnx/earshot): pure DSP, rendered by id, the same sound
every time, so the same project still gives the same video. Each sound's loudest moment lands on the word its overlay
is anchored to. Off unless project.soundEffects.enabled. earshot is optional: without it the video renders without
sound effects and says so.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Callable, Optional

from . import tools
from .proto import log

SOUNDS = {"text": "ui_pop/soft", "animation": "swish/soft", "picture": "pro_tap/soft"}
MIN_GAP = 0.6           # seconds between two sounds: closer ones are dropped, so it never gets busy
LEVEL = 0.28            # under the voice (about -11 dB); the bank renders at -1 dBFS
SEED = 1                # one fixed take per sound
MIX_TIMEOUT = 600.0
UNAVAILABLE = "Sound effects need the earshot add-on, so this version has none."


def kind_of(item: dict) -> str:
    asset = str(item.get("asset") or "")
    if item.get("treatment") == "text-pop" and not asset:
        return "text"
    if Path(asset).name.startswith("anim-") or item.get("treatment") == "animation":
        return "animation"
    return "picture"


def plan(proj: dict, words: dict, peak_of: Callable[[str], Optional[float]]) -> list:
    """[{at, sound}] in output seconds, earliest first. `words`: word id -> {"s": output start}; cut words are absent."""
    if not (proj.get("soundEffects") or {}).get("enabled"):
        return []
    starts = sorted((words[b["anchor"]["from"]]["s"], SOUNDS[kind_of(b)]) for b in proj.get("broll") or []
                    if b.get("anchor", {}).get("from") in words)
    events, last = [], None
    for start, sound in starts:
        if last is not None and start - last < MIN_GAP:
            continue
        events.append({"at": max(0.0, start - (peak_of(sound) or 0.0)), "sound": sound})
        last = start
    return events


def render_takes(sounds: list, cache: Path) -> dict:
    """sound id -> (wav, peak seconds), rendered once into `cache`. Raises ImportError without earshot."""
    from earshot.forge.sfx import sfx_render

    cache.mkdir(parents=True, exist_ok=True)
    takes = {}
    for sound in dict.fromkeys(sounds):
        wav = cache / (sound.replace("/", "__") + ".wav")
        meta_file = wav.with_suffix(".peak")
        if not (wav.is_file() and meta_file.is_file()):
            r = sfx_render(sound, out=str(wav), seed=SEED)
            meta_file.write_text(str(float(r["meta"]["peak_s"])), encoding="utf-8")
        takes[sound] = (wav, float(meta_file.read_text(encoding="utf-8")))
    return takes


def mix(ffmpeg: str, base: Path, events: list, out: Path) -> Path:
    """`base` with each event's file ({at, file}) mixed in at its time, under a limiter. Same length as `base`."""
    inputs, chains, labels = ["-i", str(base)], [], ["[0:a]"]
    for i, e in enumerate(events, start=1):
        ms = int(round(e["at"] * 1000))
        inputs += ["-i", str(e["file"])]
        chains.append(f"[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay={ms}|{ms},volume={LEVEL}[s{i}]")
        labels.append(f"[s{i}]")
    graph = ";".join(chains + [f"{''.join(labels)}amix=inputs={len(labels)}:normalize=0:duration=first,"
                               # latency=1: the limiter's look-ahead would otherwise delay the whole track
                               f"alimiter=limit=0.89:level=0:attack=2:release=50:latency=1[out]"])
    tmp = out.with_name(out.stem + ".part.wav")
    tools.text_run([ffmpeg, "-y", "-nostdin", "-hide_banner", "-loglevel", "error", *inputs, "-filter_complex", graph,
                    "-map", "[out]", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", str(tmp)], MIX_TIMEOUT, "sound effects")
    os.replace(tmp, out)
    return out


def apply(ctx, audio: Path, rwork: Path, warnings: list) -> Path:
    """The render's finished soundtrack with the sound effects in, or the soundtrack as it was."""
    if not (ctx.project.get("soundEffects") or {}).get("enabled"):
        return audio
    try:
        takes = render_takes(list(SOUNDS.values()), rwork / "sfx")
    except ImportError:
        warnings.append(UNAVAILABLE)
        return audio
    words = {}
    for b in ctx.project.get("broll") or []:
        wid = b.get("anchor", {}).get("from")
        try:
            words[wid] = {"s": float(ctx.word_out_time(wid))}
        except Exception:   # noqa: BLE001 -- a word that was cut has no time: its sound is skipped
            continue
    events = plan(ctx.project, words, lambda s: takes[s][1] if s in takes else None)
    if not events:
        return audio
    log(f"# sound effects: {len(events)}")
    return mix(ctx.ffmpeg, audio, [{"at": e["at"], "file": takes[e["sound"]][0]} for e in events], rwork / "with_sfx.wav")
