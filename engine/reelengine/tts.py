"""Stories voice engine: Kokoro text-to-speech (optional extra `tts`) plus word timing.

    story-voice-model  download / check the two Kokoro files (resumable, SHA-256 pinned)
    story-voices       the English voices the model offers
    story-voice        lines.json -> vo.wav + timing.json (the WAV is transcribed for word times)
    story-align        their own recording + lines.json -> timing.json (fuzzy, in-order line matching)

kokoro-onnx is imported lazily and only where a voice is made: the package is an optional add-on, never
bundled (docs/stories-contract.md section 1). The pure parts (trim, join, windows, matching) take plain
arrays and word lists so tests can run them without a model.
"""
from __future__ import annotations

import difflib
import hashlib
import importlib.util
import json
import os
import re
import tempfile
import urllib.error
import wave
from pathlib import Path
from typing import Callable, Optional

from . import transcribe
from .proto import EngineError, log, progress

RELEASE_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
MODEL_FILE = "kokoro-v1.0.onnx"
VOICES_FILE = "voices-v1.0.bin"
# name -> (bytes, sha256), measured from the v1.0 release
MODEL_FILES = {
    MODEL_FILE: (325532387, "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5"),
    VOICES_FILE: (28214398, "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"),
}

SAMPLE_RATE = 24000
LEAD = 0.12                 # silence before the first line
GAP = 0.18                  # between lines
STOP_GAP = 0.12             # extra after a line that ends in a full stop
TRIM_THRESHOLD = 0.012      # amplitude below which the edges of a line are silence
TRIM_PAD = 0.03             # seconds of the edge kept so a word is never clipped
PEAK_DB = -1.0
MIN_SPEED, MAX_SPEED = 0.5, 2.0
VOICE_SLACK = 0.2           # seconds a spoken word may lead its line window (under the 0.18 s gap + trim pad)
ALIGN_MIN_SCORE = 0.6       # share of a line's words that must be heard to call the line found
ALIGN_FUZZY = 0.8           # two words are "the same" at this similarity

# English voices of the v1.0 pack, used for the list when the voices file is not on disk yet.
_FALLBACK_VOICES = ("af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore", "af_nicole",
                    "af_nova", "af_river", "af_sarah", "af_sky", "am_adam", "am_echo", "am_eric",
                    "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa",
                    "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable",
                    "bm_george", "bm_lewis")


# --- the model files ----------------------------------------------------------------------------

def package_missing() -> bool:
    return importlib.util.find_spec("kokoro_onnx") is None


def _file_ok(path: Path, size: int, sha: str) -> bool:
    return path.exists() and path.stat().st_size == size and transcribe._sha256(path) == sha


def _have_bytes(folder: Path, name: str, size: int) -> int:
    final = folder / name
    if final.exists():
        return min(size, final.stat().st_size)
    part = folder / (name + ".part")
    return min(size, part.stat().st_size) if part.exists() else 0


def model_installed(folder: Path) -> bool:
    """Both files in place with the pinned size (the SHA-256 was checked when they were renamed)."""
    return all((folder / n).exists() and (folder / n).stat().st_size == sz for n, (sz, _) in MODEL_FILES.items())


def model_status(folder: Path) -> dict:
    """VoiceModelStatus: nothing is downloaded or hashed here."""
    folder = Path(folder)
    total = sum(sz for sz, _ in MODEL_FILES.values())
    got = sum(_have_bytes(folder, n, sz) for n, (sz, _) in MODEL_FILES.items())
    return {"installed": model_installed(folder), "downloaded": got, "total": total,
            "packageMissing": package_missing()}


def _fetch_verified(folder: Path, name: str, size: int, sha: str, on_bytes) -> None:
    target = folder / name
    part = folder / (name + ".part")
    if part.exists() and part.stat().st_size > size:
        part.unlink()                           # longer than the file can be: never resumable
    for attempt in range(2):
        try:
            transcribe._fetch_part(f"{RELEASE_URL}/{name}", part, size, on_bytes)
        except (urllib.error.URLError, OSError) as exc:
            raise EngineError("OFFLINE", f"download of {name} failed: {exc}",
                              "The download stopped. Check your internet connection and try again; "
                              "it will pick up where it left off.")
        got = part.stat().st_size if part.exists() else 0
        if got != size:
            raise EngineError("DOWNLOAD_INCOMPLETE", f"{name}: got {got} of {size} bytes",
                              "The download didn't finish. Please try again; it will pick up where it left off.")
        if transcribe._sha256(part) == sha:
            os.replace(part, target)
            return
        part.unlink(missing_ok=True)            # right length, wrong bytes: start the file again
        if attempt == 0:
            log(f"# {name}: checksum mismatch; downloading it again")
    raise EngineError("DOWNLOAD_CORRUPT", f"{name}: sha256 mismatch after two downloads",
                      "The voice model downloaded with errors. Please try again.")


def download_model(folder: Path) -> dict:
    """Fetch both files into folder, resuming `<file>.part` with HTTP Range."""
    folder = Path(folder)
    total = sum(sz for sz, _ in MODEL_FILES.values())
    folder.mkdir(parents=True, exist_ok=True)
    progress("download", 0, "Getting ready to download the voice", force=True)
    done = 0
    downloaded = False
    for name, (size, sha) in MODEL_FILES.items():
        if _file_ok(folder / name, size, sha):
            done += size
            continue
        downloaded = True

        def on_bytes(got, _done=done):
            progress("download", (_done + got) / total * 100,
                     f"Downloading the voice ({(_done + got) / 1e6:.0f} of {total / 1e6:.0f} MB)")
        _fetch_verified(folder, name, size, sha, on_bytes)
        done += size
    progress("download", 100, "The voice is ready", force=True)
    return {**model_status(folder), "downloaded": total, "path": str(folder), "didDownload": downloaded}


# --- voices -------------------------------------------------------------------------------------

def voice_label(vid: str) -> str:
    region = "US" if vid[0] == "a" else "UK"
    gender = "female" if vid[1:2] == "f" else "male"
    return f"{vid.split('_', 1)[-1].title()} ({region}, {gender})"


def _voice_ids(folder: Path) -> list:
    path = Path(folder) / VOICES_FILE
    if path.exists():
        try:
            import numpy as np
            with np.load(path) as pack:
                return list(pack.keys())
        except Exception as exc:  # noqa: BLE001 - a bad file falls back to the known list
            log(f"# could not read {path.name}: {exc}")
    return list(_FALLBACK_VOICES)


def list_voices(folder: Path) -> dict:
    ids = [v for v in _voice_ids(folder) if v[:1] in ("a", "b") and len(v) > 3]
    return {"voices": [{"id": v, "label": voice_label(v)} for v in ids]}


# --- audio: trim, join, normalise ---------------------------------------------------------------

def trim_silence(samples, rate: int = SAMPLE_RATE):
    """Cut the quiet edges, keeping TRIM_PAD of each so nothing is clipped."""
    import numpy as np
    loud = np.flatnonzero(np.abs(samples) > TRIM_THRESHOLD)
    if loud.size == 0:
        return samples[:0]
    pad = int(TRIM_PAD * rate)
    return samples[max(0, int(loud[0]) - pad):min(len(samples), int(loud[-1]) + 1 + pad)]


def gap_after(text: str) -> float:
    return GAP + (STOP_GAP if text.rstrip().endswith(".") else 0.0)


def join_lines(clips: list, texts: list, rate: int = SAMPLE_RATE) -> tuple:
    """(samples, [{start, end}]): LEAD of silence, then each clip with its gap."""
    import numpy as np
    parts, windows, t = [np.zeros(int(LEAD * rate), dtype=np.float32)], [], LEAD
    for i, clip in enumerate(clips):
        windows.append({"start": round(t, 3), "end": round(t + len(clip) / rate, 3)})
        parts.append(np.asarray(clip, dtype=np.float32))
        t += len(clip) / rate
        if i < len(clips) - 1:
            gap = gap_after(texts[i])
            parts.append(np.zeros(int(gap * rate), dtype=np.float32))
            t += int(gap * rate) / rate
    return np.concatenate(parts), windows


def normalise(samples, peak_db: float = PEAK_DB):
    import numpy as np
    peak = float(np.abs(samples).max()) if len(samples) else 0.0
    if peak < 1e-6:
        return samples
    return (samples * (10 ** (peak_db / 20) / peak)).astype(np.float32)


def write_wav(path: Path, samples, rate: int = SAMPLE_RATE) -> None:
    import numpy as np
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2")
    tmp = path.with_name(path.name + ".part")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    os.replace(tmp, path)


# --- lines and timing ---------------------------------------------------------------------------

def read_lines(path: Path) -> list:
    """lines.json: [{"shown", "spoken"}] -> the same with `spoken` falling back to `shown`."""
    try:
        raw = json.loads(Path(path).read_text("utf-8"))
    except (OSError, ValueError) as exc:
        raise EngineError("BAD_LINES", f"cannot read {path}: {exc}",
                          "I couldn't read the lines of this story. Please try again.")
    if not isinstance(raw, list) or not raw:
        raise EngineError("BAD_LINES", "lines.json is empty or not a list", "This story has no lines yet.")
    out = []
    for item in raw:
        shown = str(item.get("shown", "")) if isinstance(item, dict) else str(item)
        spoken = str(item.get("spoken", "")) if isinstance(item, dict) else ""
        out.append({"shown": shown, "spoken": spoken.strip() or shown})
    return out


def text_hash(lines: list) -> str:
    return hashlib.sha256("\n".join(l["shown"] for l in lines).encode("utf-8")).hexdigest()[:16]


def assign_words(words: list, starts: list, slack: float = 0.0) -> list:
    """TimedWords: each word goes to the last line that has started by the word's start (words in a gap
    belong to the line before; words before the first line to line 0). `slack`: a word may start this much
    before its line does (the recogniser's times run a little early)."""
    out = []
    for w in words:
        line = 0
        for i, s in enumerate(starts):
            if w["s"] >= s - slack - 1e-6:
                line = i
        out.append({"w": w["w"], "s": round(float(w["s"]), 3), "e": round(float(w["e"]), 3), "line": line})
    return out


def build_timing(lines: list, windows: list, words: list, duration: float, slack: float = 0.0) -> dict:
    return {"duration": round(float(duration), 3), "lines": windows,
            "words": assign_words(words, [w["start"] for w in windows], slack), "textHash": text_hash(lines)}


def write_timing(path: Path, timing: dict) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    tmp.write_text(json.dumps(timing, ensure_ascii=False, separators=(",", ":")), "utf-8")
    os.replace(tmp, path)


# --- hearing the audio --------------------------------------------------------------------------

def transcribe_words(audio: Path, language: Optional[str]) -> tuple:
    """(words [{w, s, e}], seconds): the engine's own transcription of any audio file. Tests replace this."""
    name = transcribe.default_model()
    transcribe.require_model(name)
    with tempfile.TemporaryDirectory(prefix="story-asr-") as tmp:
        wav = transcribe.extract_audio(Path(audio), Path(tmp) / "audio.wav")
        from . import audio_env
        duration = len(audio_env.read_wav(wav)) / audio_env.SR
        progress("transcribe", 72, "Listening to the voice", force=True)
        model, _dev, _compute = transcribe.load_model(name)
        words, _segs, _lang = transcribe._transcribe_one(model, wav, language, None, duration, 75, 95)
    return [{"w": w["w"], "s": w["s"], "e": w["e"]} for w in words], duration


# --- finding lines in a transcript --------------------------------------------------------------

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


def tokens(text: str) -> list:
    return [t.lower() for t in _TOKEN_RE.findall(text)]


def _same(a: str, b: str) -> bool:
    return a == b or difflib.SequenceMatcher(None, a, b).ratio() >= ALIGN_FUZZY


def _in_order_matches(want: list, heard: list) -> list:
    """Indexes into heard of an in-order (LCS) match of want, with fuzzy word equality."""
    n, m = len(want), len(heard)
    table = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            table[i][j] = (table[i + 1][j + 1] + 1 if _same(want[i], heard[j])
                           else max(table[i + 1][j], table[i][j + 1]))
    hits, i, j = [], 0, 0
    while i < n and j < m:
        if _same(want[i], heard[j]):
            hits.append(j)
            i, j = i + 1, j + 1
        elif table[i + 1][j] >= table[i][j + 1]:
            i += 1
        else:
            j += 1
    return hits


def find_line(want: list, heard: list, cursor: int) -> Optional[tuple]:
    """(first, last) heard indexes of the best in-order match of want at or after cursor, or None."""
    if not want:
        return None
    span = len(want) + max(2, len(want) // 2)
    best, best_score = None, 0.0
    for start in range(cursor, min(len(heard), cursor + max(40, 4 * len(want)))):
        hits = _in_order_matches(want, heard[start:start + span])
        score = len(hits) / len(want)
        if score > best_score + 1e-9:
            best, best_score = (start + hits[0], start + hits[-1]), score
            if score >= 1.0:
                break
    return best if best and best_score >= ALIGN_MIN_SCORE else None


def _spread(found: list, duration: float) -> list:
    """Fill the lines that were not heard: they share the time between their found neighbours."""
    out = [dict(w) if w else None for w in found]
    i = 0
    while i < len(out):
        if out[i] is not None:
            i += 1
            continue
        j = i
        while j < len(out) and out[j] is None:
            j += 1
        lo = out[i - 1]["end"] if i > 0 else 0.0
        hi = out[j]["start"] if j < len(out) else duration
        hi = max(hi, lo)
        step = (hi - lo) / (j - i)
        for k in range(i, j):
            out[k] = {"start": round(lo + step * (k - i), 3), "end": round(lo + step * (k - i + 1), 3)}
        i = j
    return out


def align_lines(lines: list, words: list, duration: float) -> list:
    """Line windows [{start, end}] from a transcript; ALIGN_FAILED when under half the lines are found."""
    heard = [tokens(w["w"])[0] if tokens(w["w"]) else "" for w in words]
    found, cursor = [], 0
    for line in lines:
        hit = find_line(tokens(line["spoken"]), heard, cursor)
        if hit is None:
            found.append(None)
            continue
        found.append({"start": words[hit[0]]["s"], "end": words[hit[1]]["e"]})
        cursor = hit[1] + 1
    got = sum(1 for f in found if f)
    if got * 2 < len(lines):
        raise EngineError("ALIGN_FAILED", f"found {got} of {len(lines)} lines in the recording",
                          "I couldn't match your recording to the lines. Check that you read the lines "
                          "as written, then try again.")
    return _spread(found, duration)


# --- commands -----------------------------------------------------------------------------------

def load_kokoro(folder: Path):
    """The Kokoro engine, imported only here. TTS_MISSING when the add-on is not installed."""
    try:
        from kokoro_onnx import Kokoro
    except ImportError as exc:
        raise EngineError("TTS_MISSING", f"kokoro-onnx is not installed: {exc}",
                          "The voice add-on isn't installed. Add it with: "
                          "pip install kokoro-onnx soundfile (or pip install \"reelengine[tts]\"), "
                          "then try again.")
    folder = Path(folder)
    if not model_installed(folder):
        raise EngineError("TTS_MODEL_MISSING", f"voice model files missing in {folder}",
                          "The voice model isn't downloaded yet. Download it first, then make the voice.")
    return Kokoro(str(folder / MODEL_FILE), str(folder / VOICES_FILE))


def make_synth(folder: Path, voice: str, speed: float) -> Callable[[str], object]:
    """text -> float32 samples at 24 kHz."""
    kokoro = load_kokoro(folder)
    lang = "en-gb" if voice.startswith("b") else "en-us"
    speed = max(MIN_SPEED, min(MAX_SPEED, float(speed)))

    def synth(text: str):
        samples, _rate = kokoro.create(text, voice=voice, speed=speed, lang=lang)
        return samples
    return synth


def run_voice(folder: Path, lines_path: Path, voice: str, speed: float, out: Path, timing_path: Path,
              synth: Optional[Callable] = None) -> dict:
    lines = read_lines(lines_path)
    if synth is None and voice not in _voice_ids(folder):
        # Kokoro would fail with an error of its own: say it plainly instead
        raise EngineError("BAD_VOICE", f"unknown Kokoro voice {voice!r}",
                          "That voice isn't available. Pick another voice and try again.")
    synth = synth or make_synth(folder, voice, speed)
    clips = []
    for i, line in enumerate(lines):
        progress("voice", 2 + 68 * i / len(lines), f"Saying line {i + 1} of {len(lines)}")
        clips.append(trim_silence(synth(line["spoken"])))
    samples, windows = join_lines(clips, [l["spoken"] for l in lines])
    samples = normalise(samples)
    write_wav(Path(out), samples)
    duration = len(samples) / SAMPLE_RATE
    words, _seconds = transcribe_words(Path(out), "en")
    timing = build_timing(lines, windows, words, duration, VOICE_SLACK)
    write_timing(Path(timing_path), timing)
    progress("voice", 100, "The voice is ready", force=True)
    return {"audio": str(out), "timing": str(timing_path), "duration": timing["duration"],
            "lines": len(lines), "words": len(timing["words"]), "textHash": timing["textHash"]}


def run_align(audio: Path, lines_path: Path, timing_path: Path) -> dict:
    lines = read_lines(lines_path)
    words, duration = transcribe_words(Path(audio), None)
    windows = align_lines(lines, words, duration)
    timing = build_timing(lines, windows, words, duration)
    write_timing(Path(timing_path), timing)
    progress("transcribe", 100, "Matched your recording to the lines", force=True)
    return {"audio": str(audio), "timing": str(timing_path), "duration": timing["duration"],
            "lines": len(lines), "words": len(timing["words"]), "textHash": timing["textHash"]}
