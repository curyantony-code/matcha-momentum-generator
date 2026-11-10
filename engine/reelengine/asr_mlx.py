"""Whisper on the Apple Silicon GPU (mlx-whisper, MIT), behind the same small surface transcribe.py
uses from faster-whisper: `model.transcribe(samples, ...) -> (segments, info)`, where each segment has
start, end, text, words (word, start, end, probability), no_speech_prob and avg_logprob.

Measured 2026-11-02 on an M3 Max, a 62 s take: large-v3-turbo here 2.5 s, faster-whisper small.en on the
CPU 7.2 s. The turbo model also writes down flubs and retakes as said ("back out of wrong") where
small.en tidied them into the line the speaker meant, and the cut needs to see retakes.

Decoding is greedy at temperature 0 only (no sampling fallback), so the same audio gives the same words.
mlx-whisper has no voice-activity filter; the no_speech/avg_logprob check in transcribe.py drops
segments whisper invents over silence. PyTorch is not needed: it is only used to convert models.
"""
from __future__ import annotations

import importlib.util
import platform
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

REQUIRED_FILES = ("config.json",)
WEIGHT_FILES = ("weights.safetensors", "weights.npz")


def available() -> bool:
    """True on an Apple Silicon Mac with mlx-whisper installed."""
    return (sys.platform == "darwin" and platform.machine() == "arm64"
            and importlib.util.find_spec("mlx_whisper") is not None)


def model_present(path: Path) -> bool:
    return all((path / f).exists() for f in REQUIRED_FILES) and any((path / f).exists() for f in WEIGHT_FILES)


@dataclass(frozen=True)
class Word:
    word: str
    start: float
    end: float
    probability: float


@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    text: str
    words: list = field(default_factory=list)
    no_speech_prob: float = 0.0
    avg_logprob: float = 0.0


@dataclass(frozen=True)
class Info:
    language: Optional[str]


def to_segments(result: dict) -> list:
    """mlx-whisper's result dict as Segment objects."""
    out = []
    for s in result.get("segments") or []:
        words = [Word(str(w.get("word", "")), float(w.get("start", 0.0)), float(w.get("end", 0.0)),
                      float(w.get("probability", 0.0))) for w in s.get("words") or []]
        out.append(Segment(float(s.get("start", 0.0)), float(s.get("end", 0.0)), str(s.get("text", "")), words,
                           float(s.get("no_speech_prob", 0.0)), float(s.get("avg_logprob", 0.0))))
    return out


class MlxWhisper:
    """Loads lazily on the first transcribe (mlx-whisper caches the model between calls)."""

    def __init__(self, path: Path):
        import mlx_whisper   # noqa: F401 - fail here, at load, when the package is missing
        self.path = str(path)
        self.hf_tokenizer = None    # transcribe._tokenizer_fn: no Hugging Face tokenizer here

    def transcribe(self, samples, language: Optional[str] = None, initial_prompt: Optional[str] = None,
                   condition_on_previous_text: bool = False, **_ignored):
        """Same call as faster-whisper's; beam_size, vad_filter and hotwords have no mlx equivalent."""
        import mlx_whisper
        import numpy as np
        result = mlx_whisper.transcribe(
            np.asarray(samples, dtype=np.float32), path_or_hf_repo=self.path, language=language,
            word_timestamps=True, temperature=0.0, condition_on_previous_text=condition_on_previous_text,
            initial_prompt=initial_prompt, verbose=None)
        return to_segments(result), Info(result.get("language") or language)
