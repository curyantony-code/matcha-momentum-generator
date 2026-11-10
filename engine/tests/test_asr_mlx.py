"""Whisper on the Apple Silicon GPU (asr_mlx.py): picked by default when present, CPU small.en otherwise."""
import wave

import numpy as np
import pytest

from reelengine import asr_mlx, audio_env, project as projmod, transcribe

RESULT = {"language": "en", "segments": [
    {"start": 0.0, "end": 1.2, "text": " I look Italian", "no_speech_prob": 0.01, "avg_logprob": -0.2,
     "words": [{"word": " I", "start": 0.0, "end": 0.2, "probability": 0.9},
               {"word": " look", "start": 0.2, "end": 0.5, "probability": 0.95}]},
    {"start": 1.2, "end": 2.0, "text": " um", "words": []},
]}


def test_mlx_results_read_like_faster_whisper_segments():
    segs = asr_mlx.to_segments(RESULT)
    assert [s.text for s in segs] == [" I look Italian", " um"]
    assert segs[0].words[1].word == " look" and segs[0].words[1].end == 0.5 and segs[0].words[1].probability == 0.95
    assert segs[0].no_speech_prob == 0.01 and segs[0].avg_logprob == -0.2
    assert segs[1].words == [] and segs[1].no_speech_prob == 0.0
    assert asr_mlx.to_segments({}) == []


def test_an_mlx_model_is_present_with_its_config_and_weights(tmp_path, monkeypatch):
    monkeypatch.setenv("REELENGINE_MODELS", str(tmp_path))
    d = tmp_path / transcribe.MLX_MODEL
    d.mkdir()
    (d / "config.json").write_text("{}")
    assert not transcribe.model_present(transcribe.MLX_MODEL)
    (d / "weights.safetensors").write_bytes(b"x")
    assert transcribe.model_present(transcribe.MLX_MODEL)
    assert not transcribe.model_present("small.en")      # the CPU layout is checked as before


def test_the_gpu_model_is_the_default_only_on_a_mac_that_has_it(monkeypatch):
    monkeypatch.delenv("REELENGINE_MODEL", raising=False)
    monkeypatch.setattr(asr_mlx, "available", lambda: True)
    monkeypatch.setattr(transcribe, "model_present", lambda name: True)
    assert transcribe.default_model() == transcribe.MLX_MODEL
    monkeypatch.setattr(transcribe, "model_present", lambda name: name != transcribe.MLX_MODEL)
    assert transcribe.default_model() == "small.en"      # not downloaded yet
    monkeypatch.setattr(transcribe, "model_present", lambda name: True)
    monkeypatch.setattr(asr_mlx, "available", lambda: False)
    assert transcribe.default_model() == "small.en"      # not Apple Silicon, or mlx-whisper missing
    monkeypatch.setenv("REELENGINE_MODEL", "base.en")
    assert transcribe.default_model() == "base.en"


@pytest.fixture
def project(tmp_path, monkeypatch):
    pdir = tmp_path / "p"
    (pdir / "media").mkdir(parents=True)
    with wave.open(str(pdir / "media" / "take.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
        w.writeframes(np.zeros(16000, dtype=np.int16).tobytes())
    proj = projmod.new_project("Day 1")
    proj["sources"] = [{"id": "s1", "path": "media/take.wav", "duration": 1.0}]
    projmod.save(pdir, proj)
    monkeypatch.setattr(transcribe, "require_model", lambda name: tmp_path)
    monkeypatch.setattr(transcribe, "model_present", lambda name: True)
    monkeypatch.setattr(transcribe, "extract_audio", lambda sp, wav: (wav.parent.mkdir(parents=True, exist_ok=True),
                                                                     wav.write_bytes((pdir / "media" / "take.wav").read_bytes())))
    monkeypatch.setattr(audio_env, "refine_words", lambda words, *a, **k: words)
    monkeypatch.setenv("REELENGINE_VOCAB", "0")
    return pdir


class Model:
    hf_tokenizer = None

    def __init__(self, dev):
        self.dev = dev


def _loader(loaded):
    def load(name, prefer=None):
        loaded.append(name)
        dev = "mlx" if transcribe.is_mlx(name) else "cpu"
        return Model(dev), dev, "float16" if dev == "mlx" else "int8"
    return load


def _one(fail_on_gpu):
    def one(model, wav, lang, prompt, dur, p0, p1, hotwords=None):
        if model.dev == "mlx" and fail_on_gpu:
            raise RuntimeError("[metal] command buffer failed")
        return [{"s": 0.1, "e": 0.4, "w": "hi", "p": 0.9, "_seg": 0}], [{"s": 0.1, "e": 0.4, "text": "hi", "n": 1}], "en"
    return one


def test_a_new_project_on_this_mac_is_heard_on_the_gpu(project, monkeypatch):
    loaded = []
    monkeypatch.setattr(asr_mlx, "available", lambda: True)
    monkeypatch.setattr(transcribe, "load_model", _loader(loaded))
    monkeypatch.setattr(transcribe, "_transcribe_one", _one(False))
    r = transcribe.run(project)
    assert (r["model"], r["device"]) == (transcribe.MLX_MODEL, "mlx")


def test_a_gpu_failure_falls_back_to_the_cpu_model(project, monkeypatch):
    loaded = []
    monkeypatch.setattr(asr_mlx, "available", lambda: True)
    monkeypatch.setattr(transcribe, "load_model", _loader(loaded))
    monkeypatch.setattr(transcribe, "_transcribe_one", _one(True))
    r = transcribe.run(project)
    assert (r["model"], r["device"]) == ("small.en", "cpu")
    assert loaded == [transcribe.MLX_MODEL, "small.en"]
    assert projmod.load(project)["transcript"]["model"] == "small.en"


def test_a_project_heard_on_the_gpu_reopens_on_the_cpu_elsewhere(project, monkeypatch):
    proj = projmod.load(project)
    proj["transcript"] = {"model": transcribe.MLX_MODEL, "language": "en"}
    projmod.save(project, proj)
    loaded = []
    monkeypatch.setattr(asr_mlx, "available", lambda: False)
    monkeypatch.setattr(transcribe, "load_model", _loader(loaded))
    monkeypatch.setattr(transcribe, "_transcribe_one", _one(False))
    assert transcribe.run(project)["model"] == "small.en"
    assert loaded == ["small.en"]
