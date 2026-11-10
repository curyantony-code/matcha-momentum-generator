"""Snap a proposed clip of a long video to natural cut points. Pure logic: no ffmpeg, no files.

Adapted from `scripts/snap_boundaries.py` in claude-shorts by Daniel Agrici (MIT, see THIRD_PARTY.md), for this
engine's transcript words ({s, e, w}). Changed from the original: a silence may only move a cut across empty air, so
it can no longer clip the last word or jump over speech, and the min/max length limits land on whole words.
"""
from __future__ import annotations

from typing import Optional

Word = dict
Silence = tuple

START_WINDOW = 1.5   # seconds searched around a proposed start
END_WINDOW = 3.0     # seconds searched past a proposed end for the end of the sentence
END_PAD = 0.3        # breath kept after the last word
END_TOLERANCE = 0.2  # word timestamps are imprecise by about this much
NEAREST_WORD_WINDOW = 1.0
START_SILENCE_WINDOW = 1.5
END_SILENCE_WINDOW = 2.0
MIN_CLIP = 5.0
MAX_CLIP = 60.0
SENTENCE_END = ".?!"


def _text(word: Word) -> str:
    return str(word["w"]).strip()


def _ends_sentence(word: Word) -> bool:
    return _text(word)[-1:] in tuple(SENTENCE_END)


def _pad(end: float) -> float:
    return round(end + END_PAD, 3)


def parse_silences(stderr: str) -> list:
    """(start, end) pairs from ffmpeg silencedetect output. A silence with no end is left out."""
    found = []
    start: Optional[float] = None
    for line in stderr.split("\n"):
        try:
            if "silence_start:" in line:
                start = float(line.split("silence_start:")[1].split()[0])
            elif "silence_end:" in line and start is not None:
                found.append((start, float(line.split("silence_end:")[1].split()[0])))
                start = None
        except (IndexError, ValueError):
            continue
    return found


def snap_start(words: list, proposed: float, window: float = START_WINDOW) -> float:
    """The nearest word start, preferring a sentence start when one is in range."""
    near = [(i, w) for i, w in enumerate(words) if abs(w["s"] - proposed) <= window]
    if not near:
        return proposed
    sentences = [(i, w) for i, w in near if i == 0 or _ends_sentence(words[i - 1])]
    _, best = min(sentences or near, key=lambda item: abs(item[1]["s"] - proposed))
    return best["s"]


def snap_end(words: list, proposed: float, window: float = END_WINDOW) -> float:
    """The end of the sentence if it finishes soon after `proposed`, else the nearest word end, plus a breath."""
    spoken = [i for i, w in enumerate(words) if w["e"] <= proposed + END_TOLERANCE]
    if not spoken:
        return proposed
    last = spoken[-1]
    if _ends_sentence(words[last]):
        return _pad(words[last]["e"])
    for word in words[last + 1:]:
        if word["s"] > proposed + window:
            break
        if _ends_sentence(word):
            return _pad(word["e"])
    near = [w for w in words if abs(w["e"] - proposed) <= NEAREST_WORD_WINDOW]
    if not near:
        return proposed
    return _pad(min(near, key=lambda w: abs(w["e"] - proposed))["e"])


def _nearest_silence(silences: list, target: float, window: float, low: float, high: float) -> Optional[float]:
    """Midpoint of the silence closest to target, among those strictly between low and high (empty air)."""
    mids = [(s + e) / 2 for s, e in silences]
    usable = [m for m in mids if abs(m - target) < window and low <= m <= high]
    return min(usable, key=lambda m: abs(m - target)) if usable else None


def _start_at_silence(words: list, silences: list, start: float) -> float:
    before = [w["e"] for w in words if w["s"] < start]
    low = max(before) if before else 0.0
    found = _nearest_silence(silences, start, START_SILENCE_WINDOW, low, start)
    return start if found is None else found


def _end_at_silence(words: list, silences: list, end: float) -> float:
    spoken = [w["e"] for w in words if w["e"] <= end]
    low = max(spoken) if spoken else end
    after = [w["s"] for w in words if w["s"] >= low]
    high = min(after) if after else float("inf")
    found = _nearest_silence(silences, end, END_SILENCE_WINDOW, low, high)
    return end if found is None else found


def _hold_length(words: list, start: float, end: float, min_len: float, max_len: float) -> float:
    """Bring the clip inside the length limits, ending after a whole word whenever one fits."""
    if end - start > max_len:
        fits = [w["e"] for w in words if w["s"] >= start and w["e"] + END_PAD <= start + max_len]
        return _pad(max(fits)) if fits else start + max_len
    if end - start < min_len:
        enough = [w["e"] for w in words if w["e"] + END_PAD >= start + min_len]
        return _pad(min(enough)) if enough else start + min_len
    return end


def snap_segment(words: list, silences: list, start: float, end: float, duration: float,
                 min_len: float = MIN_CLIP, max_len: float = MAX_CLIP) -> tuple:
    """(start, end) in seconds of the take, on word boundaries, in silence where there is some to use."""
    new_start = _start_at_silence(words, silences, snap_start(words, start))
    new_end = _end_at_silence(words, silences, snap_end(words, end))
    new_start = max(0.0, new_start)
    new_end = _hold_length(words, new_start, min(duration, new_end), min_len, max_len)
    new_end = min(duration, new_end)
    if new_end - new_start < min_len:  # the video ran out: reach back rather than make a sliver
        new_start = max(0.0, new_end - min_len)
    return round(new_start, 3), round(new_end, 3)


def _seconds(value: object) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def parse_segments(data: object, duration: float) -> list:
    """Validated [{start, end, title?}] from a segments file. Raises ValueError on the first bad entry."""
    segments = data.get("segments") if isinstance(data, dict) else None
    if not isinstance(segments, list) or not segments:
        raise ValueError("segments must be a non-empty list")
    parsed = []
    for i, seg in enumerate(segments):
        start = _seconds(seg.get("start")) if isinstance(seg, dict) else None
        end = _seconds(seg.get("end")) if isinstance(seg, dict) else None
        if start is None or end is None or start < 0 or end <= start or start >= duration:
            raise ValueError(f"segment {i} has bad times")
        title = seg.get("title")
        parsed.append({"start": start, "end": end, **({"title": title} if isinstance(title, str) and title else {})})
    return parsed
