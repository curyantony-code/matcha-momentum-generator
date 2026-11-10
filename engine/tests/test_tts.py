"""Stories voice engine (tts.py): synthesis and transcription faked, no model, no network."""
import hashlib
import io
import json
import urllib.error

import numpy as np
import pytest

from reelengine import cli, proto, transcribe, tts
from reelengine.proto import EngineError

SR = tts.SAMPLE_RATE


def tone(seconds, amp=0.5, pad=0.2):
    """A burst of sound with `pad` seconds of silence on both sides."""
    n, p = int(seconds * SR), int(pad * SR)
    return np.concatenate([np.zeros(p), amp * np.sin(np.linspace(0, 400, n)), np.zeros(p)]).astype(np.float32)


def lines(*texts):
    return [{"shown": t, "spoken": t} for t in texts]


def words(spec):
    return [{"w": w, "s": s, "e": e} for w, s, e in spec]


# --- audio ---------------------------------------------------------------------------------------

def test_trim_silence_keeps_a_small_pad_and_drops_the_rest():
    out = tts.trim_silence(tone(1.0, pad=0.5))
    assert abs(len(out) / SR - (1.0 + 2 * tts.TRIM_PAD)) < 0.01


def test_trim_silence_of_pure_silence_is_empty():
    assert len(tts.trim_silence(np.zeros(SR, dtype=np.float32))) == 0


def test_join_uses_lead_gap_and_extra_after_a_full_stop():
    clips = [np.ones(SR, dtype=np.float32)] * 3
    samples, win = tts.join_lines(clips, ["One.", "Two", "Three"])
    assert win[0] == {"start": 0.12, "end": 1.12}
    assert win[1]["start"] == pytest.approx(1.12 + 0.18 + 0.12, abs=1e-3)     # after a full stop
    assert win[2]["start"] == pytest.approx(win[1]["end"] + 0.18, abs=1e-3)   # no stop
    assert len(samples) / SR == pytest.approx(win[2]["end"], abs=1e-3)        # no gap after the last


def test_normalise_peaks_at_minus_one_dbfs():
    out = tts.normalise(np.array([0.0, 0.25, -0.1], dtype=np.float32))
    assert float(np.abs(out).max()) == pytest.approx(10 ** (-1 / 20), rel=1e-4)
    assert tts.normalise(np.zeros(4, dtype=np.float32)).tolist() == [0, 0, 0, 0]


def test_write_wav_is_24k_mono_16bit(tmp_path):
    import wave
    tts.write_wav(tmp_path / "a" / "vo.wav", tone(0.5))
    with wave.open(str(tmp_path / "a" / "vo.wav")) as w:
        assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, SR)


# --- timing --------------------------------------------------------------------------------------

def test_text_hash_is_16_hex_of_shown_joined_by_newlines():
    want = hashlib.sha256("Hi there\nBye".encode()).hexdigest()[:16]
    assert tts.text_hash([{"shown": "Hi there", "spoken": "x"}, {"shown": "Bye", "spoken": "y"}]) == want


def test_words_go_to_the_last_line_started_and_gap_words_to_the_line_before():
    ws = words([("a", 0.0, 0.1), ("b", 0.2, 0.4), ("c", 1.5, 1.7), ("d", 2.6, 2.9)])
    out = tts.assign_words(ws, [0.12, 1.0, 2.5])
    assert [w["line"] for w in out] == [0, 0, 1, 2]      # "a" is before line 0: still line 0


def test_run_voice_writes_wav_and_timing_with_fakes(tmp_path, monkeypatch):
    texts = ["Hello world.", "Second line here"]
    (tmp_path / "lines.json").write_text(json.dumps([{"shown": "Hello world.", "spoken": ""},
                                                     {"shown": "2nd", "spoken": texts[1]}]))
    spoken = []

    def synth(text):
        spoken.append(text)
        return tone(1.0)
    monkeypatch.setattr(tts, "transcribe_words", lambda a, lang: (words([
        ("Hello", 0.2, 0.5), ("world.", 0.6, 1.0), ("Second", 1.8, 2.0), ("line", 2.1, 2.3), ("here", 2.4, 2.6)]), 3.0))
    res = tts.run_voice(tmp_path, tmp_path / "lines.json", "af_heart", 1.0, tmp_path / "audio" / "vo.wav",
                        tmp_path / "work" / "timing.json", synth=synth)
    assert spoken == ["Hello world.", "Second line here"]          # spoken, falling back to shown
    t = json.loads((tmp_path / "work" / "timing.json").read_text())
    assert (tmp_path / "audio" / "vo.wav").exists()
    assert len(t["lines"]) == 2 and t["lines"][0]["start"] == 0.12
    assert [w["line"] for w in t["words"]] == [0, 0, 1, 1, 1]
    assert t["textHash"] == tts.text_hash([{"shown": "Hello world."}, {"shown": "2nd"}])
    assert res["lines"] == 2 and res["words"] == 5


def test_read_lines_rejects_empty_and_unreadable(tmp_path):
    (tmp_path / "l.json").write_text("[]")
    with pytest.raises(EngineError) as e:
        tts.read_lines(tmp_path / "l.json")
    assert e.value.code == "BAD_LINES"
    with pytest.raises(EngineError):
        tts.read_lines(tmp_path / "nope.json")


# --- align ---------------------------------------------------------------------------------------

HEARD = words([("So,", 0.5, 0.7), ("most", 0.8, 1.0), ("people", 1.0, 1.3), ("quit", 1.3, 1.6),
               ("in", 3.0, 3.1), ("March.", 3.1, 3.6), ("Follow", 5.0, 5.4), ("for", 5.4, 5.5), ("more", 5.5, 5.9)])


def test_align_finds_lines_in_order_with_fuzzy_words():
    ls = lines("Most people quit", "In march", "Follow for more")
    win = tts.align_lines(ls, HEARD, 7.0)
    assert win == [{"start": 0.8, "end": 1.6}, {"start": 3.0, "end": 3.6}, {"start": 5.0, "end": 5.9}]


def test_align_spreads_a_missing_line_between_its_neighbours():
    ls = lines("Most people quit", "Something never said at all", "Follow for more")
    win = tts.align_lines(ls, HEARD, 7.0)
    assert win[1] == {"start": 1.6, "end": 5.0}
    assert win[0]["end"] == 1.6 and win[2]["start"] == 5.0


def test_align_words_between_lines_go_to_the_line_before():
    ls = lines("Most people quit", "Follow for more")
    t = tts.build_timing(ls, tts.align_lines(ls, HEARD, 7.0), HEARD, 7.0)
    assert [w["line"] for w in t["words"]] == [0, 0, 0, 0, 0, 0, 1, 1, 1]


def test_align_fails_when_fewer_than_half_the_lines_are_found():
    ls = lines("Most people quit", "alpha beta gamma", "delta epsilon", "zeta eta theta")
    with pytest.raises(EngineError) as e:
        tts.align_lines(ls, HEARD, 7.0)
    assert e.value.code == "ALIGN_FAILED" and e.value.user_message


def test_run_align_writes_timing(tmp_path, monkeypatch):
    (tmp_path / "l.json").write_text(json.dumps(lines("Most people quit", "Follow for more")))
    monkeypatch.setattr(tts, "transcribe_words", lambda a, lang: (HEARD, 7.0))
    res = tts.run_align(tmp_path / "rec.m4a", tmp_path / "l.json", tmp_path / "t.json")
    t = json.loads((tmp_path / "t.json").read_text())
    assert t["duration"] == 7.0 and t["lines"][1]["start"] == 5.0 and res["lines"] == 2


# --- package + voices ----------------------------------------------------------------------------

def test_missing_package_is_tts_missing_with_a_friendly_message(tmp_path, monkeypatch):
    import builtins
    real = builtins.__import__

    def no_kokoro(name, *a, **k):
        if name.startswith("kokoro_onnx"):
            raise ImportError("no kokoro")
        return real(name, *a, **k)
    monkeypatch.setattr(builtins, "__import__", no_kokoro)
    with pytest.raises(EngineError) as e:
        tts.load_kokoro(tmp_path)
    assert e.value.code == "TTS_MISSING" and "pip install" in e.value.user_message


def test_voices_list_only_english_with_labels(tmp_path):
    np.savez(tmp_path / "v.npz", af_heart=np.zeros(1), bm_george=np.zeros(1), jf_alpha=np.zeros(1))
    (tmp_path / "v.npz").rename(tmp_path / tts.VOICES_FILE)
    assert tts.list_voices(tmp_path)["voices"] == [
        {"id": "af_heart", "label": "Heart (US, female)"}, {"id": "bm_george", "label": "George (UK, male)"}]


def test_voices_fall_back_to_the_known_list_without_the_file(tmp_path):
    ids = [v["id"] for v in tts.list_voices(tmp_path)["voices"]]
    assert "af_heart" in ids and all(i[0] in "ab" for i in ids)


# --- model download with a fake HTTP layer -------------------------------------------------------

BLOB = bytes(range(256)) * 40


class FakeResp(io.BytesIO):
    def __init__(self, data, status=200, headers=None):
        super().__init__(data)
        self.status, self.headers = status, headers or {}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture
def fake_files(monkeypatch):
    sha = hashlib.sha256(BLOB).hexdigest()
    monkeypatch.setattr(tts, "MODEL_FILES", {tts.MODEL_FILE: (len(BLOB), sha), tts.VOICES_FILE: (len(BLOB), sha)})
    monkeypatch.setattr(tts, "package_missing", lambda: False)
    seen = []

    def urlopen(req, timeout=0):
        rng = req.headers.get("Range")
        seen.append((req.full_url.rsplit("/", 1)[-1], rng))
        if rng:
            start = int(rng.split("=")[1].rstrip("-"))
            return FakeResp(BLOB[start:], 206, {"Content-Range": f"bytes {start}-{len(BLOB) - 1}/{len(BLOB)}"})
        return FakeResp(BLOB)
    monkeypatch.setattr(transcribe.urllib.request, "urlopen", urlopen)
    return seen


def test_download_resumes_a_part_file_with_a_range_request(tmp_path, fake_files):
    (tmp_path / (tts.MODEL_FILE + ".part")).write_bytes(BLOB[:1000])
    st = tts.model_status(tmp_path)
    assert st["installed"] is False and st["downloaded"] == 1000 and st["total"] == 2 * len(BLOB)
    res = tts.download_model(tmp_path)
    assert (tts.MODEL_FILE, "bytes=1000-") in fake_files and (tts.VOICES_FILE, None) in fake_files
    assert (tmp_path / tts.MODEL_FILE).read_bytes() == BLOB
    assert not list(tmp_path.glob("*.part")) and res["installed"] is True


def test_download_skips_files_already_verified(tmp_path, fake_files):
    for n in (tts.MODEL_FILE, tts.VOICES_FILE):
        (tmp_path / n).write_bytes(BLOB)
    tts.download_model(tmp_path)
    assert fake_files == []


def test_download_discards_a_corrupt_file_and_fails_after_two_tries(tmp_path, monkeypatch, fake_files):
    bad = bytes(len(BLOB))
    monkeypatch.setattr(transcribe.urllib.request, "urlopen", lambda req, timeout=0: FakeResp(bad))
    with pytest.raises(EngineError) as e:
        tts.download_model(tmp_path)
    assert e.value.code == "DOWNLOAD_CORRUPT" and not list(tmp_path.glob("*.part"))


def test_download_offline_keeps_the_part_and_says_offline(tmp_path, monkeypatch, fake_files):
    def boom(req, timeout=0):
        raise urllib.error.URLError("down")
    monkeypatch.setattr(transcribe.urllib.request, "urlopen", boom)
    with pytest.raises(EngineError) as e:
        tts.download_model(tmp_path)
    assert e.value.code == "OFFLINE"


# --- CLI -----------------------------------------------------------------------------------------

def test_cli_check_reports_voice_model_status(tmp_path, capsys, monkeypatch):
    out = io.StringIO()
    proto.set_stream(out)
    monkeypatch.setattr(proto, "capture_stdout", lambda: out)
    assert cli.main(["story-voice-model", "--dir", str(tmp_path), "--check"]) == 0
    last = json.loads(out.getvalue().strip().splitlines()[-1])
    assert last["event"] == "done" and set(last["result"]) == {"installed", "downloaded", "total", "packageMissing"}
    assert last["result"]["installed"] is False


def test_slack_lets_a_word_that_the_recogniser_hears_early_join_its_line():
    ws = words([("end", 1.0, 1.4), ("Follow", 1.66, 2.1)])
    assert [w["line"] for w in tts.assign_words(ws, [0.12, 1.818])] == [0, 0]
    assert [w["line"] for w in tts.assign_words(ws, [0.12, 1.818], slack=0.2)] == [0, 1]


def test_run_voice_refuses_a_voice_kokoro_does_not_have(tmp_path):
    import json
    import pytest
    from reelengine import tts
    from reelengine.proto import EngineError
    lines = tmp_path / "lines.json"
    lines.write_text(json.dumps([{"shown": "Hi", "spoken": ""}]))
    with pytest.raises(EngineError) as e:
        tts.run_voice(tmp_path, lines, "zz_nobody", 1.0, tmp_path / "vo.wav", tmp_path / "t.json")
    assert e.value.code == "BAD_VOICE"
