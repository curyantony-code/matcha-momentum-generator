"""Sound effects on pictures and text cards: when they land, and that they are mixed in at that moment."""
import subprocess
import wave

import numpy as np
import pytest

from reelengine import soundfx, tools

# The sounds come from the optional earshot add-on (pyproject.toml): without it the engine renders with no sound
# effects, so the tests that render real sounds are skipped rather than failed.
try:
    import earshot  # noqa: F401
    HAS_EARSHOT = True
except ImportError:
    HAS_EARSHOT = False
needs_earshot = pytest.mark.skipif(not HAS_EARSHOT, reason="earshot (optional sound effects add-on) is not installed")

WORDS = {f"w{i}": {"id": f"w{i}", "s": float(i), "e": i + 0.6} for i in range(10)}
PEAKS = {"ui_pop/soft": 0.042, "swish/soft": 0.11, "pro_tap/soft": 0.018}


def broll(i, treatment, asset=None, frm=None):
    return {"id": f"b{i}", "anchor": {"from": frm or f"w{i}", "to": frm or f"w{i}"}, "treatment": treatment, "asset": asset}


def test_off_unless_the_person_turns_it_on():
    proj = {"broll": [broll(2, "text-pop")]}
    assert soundfx.plan(proj, WORDS, PEAKS.get) == []
    assert soundfx.plan({**proj, "soundEffects": {"enabled": False}}, WORDS, PEAKS.get) == []


def test_each_kind_of_overlay_gets_its_sound_with_the_peak_on_the_word():
    proj = {"soundEffects": {"enabled": True}, "broll": [
        broll(2, "text-pop"),
        broll(5, "animation", "work/assets/anim-big-quote-1.mov"),
        broll(8, "full-frame", "Library/Images/x.png"),
    ]}
    events = soundfx.plan(proj, WORDS, PEAKS.get)
    assert [e["sound"] for e in events] == ["ui_pop/soft", "swish/soft", "pro_tap/soft"]
    assert [round(e["at"], 3) for e in events] == [round(2 - 0.042, 3), round(5 - 0.11, 3), round(8 - 0.018, 3)]


def test_sounds_too_close_together_keep_only_the_first():
    proj = {"soundEffects": {"enabled": True}, "broll": [broll(2, "text-pop"), broll(3, "text-pop", frm="w2"), broll(4, "text-pop")]}
    assert [e["at"] for e in soundfx.plan(proj, WORDS, PEAKS.get)] == [pytest.approx(2 - 0.042), pytest.approx(4 - 0.042)]


def test_overlays_on_cut_words_are_skipped_and_nothing_starts_before_zero():
    proj = {"soundEffects": {"enabled": True}, "broll": [broll(0, "text-pop"), broll(1, "text-pop", frm="w99")]}
    assert [e["at"] for e in soundfx.plan(proj, WORDS, PEAKS.get)] == [0.0]


def _wav(path, seconds, value=0.0, rate=48000):
    data = (np.full(int(seconds * rate) * 2, value) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data.tobytes())


def _read(path):
    with wave.open(str(path), "rb") as w:
        rate = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, w.getnchannels()).astype(float) / 32767
    return x[:, 0], rate


def test_the_mix_puts_each_sound_at_its_moment_and_keeps_the_length(tmp_path):
    base, take, out = tmp_path / "base.wav", tmp_path / "take.wav", tmp_path / "out.wav"
    _wav(base, 3.0)
    _wav(take, 0.1, value=0.9)
    soundfx.mix(tools.ffmpeg(), base, [{"at": 1.5, "file": take}], out)
    x, rate = _read(out)
    assert abs(len(x) / rate - 3.0) < 0.02
    assert np.abs(x[: int(1.4 * rate)]).max() < 0.01
    assert np.abs(x[int(1.5 * rate): int(1.6 * rate)]).max() > 0.1
    assert np.abs(x).max() < 0.95                          # the limiter keeps it from clipping


@pytest.fixture
def card_project(tmp_path):
    import json
    from reelengine import init as initmod, project as projmod

    video = tmp_path / "take.mp4"
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc2=s=320x568:r=30:d=5", "-f", "lavfi", "-i", "sine=frequency=220:d=5",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(video)], check=True)
    proj_dir = tmp_path / "talk"
    initmod.run(proj_dir, "Talk", [video])
    words = [{"id": f"w{i}", "source": "s1", "s": i * 0.5 + 0.2, "e": i * 0.5 + 0.6, "w": f"word{i}"} for i in range(9)]
    (proj_dir / "work" / "transcript.json").write_text(json.dumps({"words": words, "segments": [], "nextId": 9}))
    proj = projmod.load(proj_dir)
    proj["cut"]["keep"] = [{"from": "w0", "to": "w8"}]
    proj["captions"]["enabled"] = False
    proj["broll"] = [{"id": "b1", "anchor": {"from": "w4", "to": "w5"}, "treatment": "text-pop", "asset": None,
                      "params": {"text": "BIG"}}]
    projmod.save(proj_dir, proj)
    return proj_dir


def _audio(video, out):
    subprocess.run([tools.ffmpeg(), "-v", "error", "-y", "-i", str(video), "-vn", "-ac", "2", "-ar", "48000", str(out)], check=True)
    return _read(out)


@needs_earshot
def test_a_rendered_video_gets_the_pop_on_its_text_card_and_nothing_else_changes(card_project, tmp_path):
    from reelengine import capcut, project as projmod

    plain = _audio(capcut.run(card_project, tmp_path / "plain")["video"], tmp_path / "plain.wav")
    proj = projmod.load(card_project)
    proj["soundEffects"] = {"enabled": True}
    projmod.save(card_project, proj)
    with_fx = _audio(capcut.run(card_project, tmp_path / "fx")["video"], tmp_path / "fx.wav")
    (a, rate), (b, _) = plain, with_fx
    n = min(len(a), len(b))
    diff = np.abs(a[:n] - b[:n])
    card = proj["broll"][0]["anchor"]["from"]
    t = next(w["s"] for w in projmod.timeline(card_project, proj).words_out if w["id"] == card)
    around = diff[int((t - 0.15) * rate): int((t + 0.3) * rate)].max()
    before = diff[: int((t - 0.3) * rate)].max()
    # Both videos are re-encoded to AAC, which differs by a hair everywhere; the pop must stand far above that.
    assert before < 0.03                                            # in time with the picture: no shift
    assert around > 4 * before                                      # the pop is there, on the card


@needs_earshot
def test_takes_come_from_the_bank_and_are_cached(tmp_path):
    takes = soundfx.render_takes(["ui_pop/soft", "ui_pop/soft"], tmp_path)
    assert list(takes) == ["ui_pop/soft"]
    file, peak = takes["ui_pop/soft"]
    assert file.is_file() and 0 < peak < 0.2
    mtime = file.stat().st_mtime
    assert soundfx.render_takes(["ui_pop/soft"], tmp_path)["ui_pop/soft"][0].stat().st_mtime == mtime
