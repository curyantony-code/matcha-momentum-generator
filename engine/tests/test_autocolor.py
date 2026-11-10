"""Auto colour: each take measured once, its exposure and white balance gently fixed before the look."""
import json
import re
import subprocess

import pytest

from reelengine import autocolor, capcut, init as initmod, project as projmod, tools

GOOD = {"y": 151.2, "u": 120.8, "v": 133.4}        # a well-exposed iPhone take, measured 2026-11-02


def test_a_well_exposed_take_is_left_as_shot():
    assert autocolor.correction(GOOD) is None
    assert autocolor.correction(None) is None


def test_a_dark_take_is_brightened_and_a_bright_one_darkened():
    dark = autocolor.correction({**GOOD, "y": 95.0})
    bright = autocolor.correction({**GOOD, "y": 200.0})
    assert float(re.search(r"gamma=([\d.]+)", dark).group(1)) > 1.0
    assert float(re.search(r"gamma=([\d.]+)", bright).group(1)) < 1.0


def test_the_gamma_is_capped_on_a_nearly_black_take():
    chain = autocolor.correction({**GOOD, "y": 17.0})
    assert f"gamma={autocolor.GAMMA_MAX:.3f}" in chain


def test_a_blue_cast_is_pulled_back_only_partly():
    chain = autocolor.correction({**GOOD, "u": 128.0 + autocolor.REF_U + 10})
    shift = float(re.search(r"u='clip\(val-\(([-\d.]+)\)", chain).group(1))
    assert 0 < shift < 10                       # some blue removed, never all of it
    assert ":v=" not in chain                   # the red channel was fine: untouched


def test_a_cast_is_capped():
    chain = autocolor.correction({**GOOD, "v": 128.0 + autocolor.REF_V + 60})
    assert f"val-({autocolor.CAST_MAX:.1f})" in chain


def test_every_kind_of_fix_is_accepted_by_ffmpeg():
    for stats in ({**GOOD, "y": 40.0, "u": 140.0, "v": 110.0}, {**GOOD, "y": 220.0}, {**GOOD, "v": 150.0}):
        chain = autocolor.correction(stats)
        r = subprocess.run([tools.ffmpeg(), "-hide_banner", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x64:d=0.2",
                            "-vf", chain, "-f", "null", "-"], capture_output=True, text=True)
        assert r.returncode == 0, (chain, r.stderr)


def test_measurements_are_averaged_and_a_partial_read_is_refused():
    text = "\n".join(f"lavfi.signalstats.{k}={v}" for k, v in
                     (("YAVG", 100), ("UAVG", 120), ("VAVG", 130), ("YAVG", 110), ("UAVG", 122), ("VAVG", 132)))
    assert autocolor.parse_stats(text) == {"y": 105.0, "u": 121.0, "v": 131.0, "frames": 2}
    assert autocolor.parse_stats("lavfi.signalstats.YAVG=100") is None
    assert autocolor.parse_stats("") is None


def test_fixes_go_on_a_copy_of_the_sources():
    meta = {"s1": {"id": "s1"}, "s2": {"id": "s2"}}
    out = autocolor.with_fixes(meta, {"s1": "eq=gamma=1.2"})
    assert autocolor.fix_of(out["s1"]) == ",eq=gamma=1.2"
    assert autocolor.fix_of(out["s2"]) == ""
    assert meta == {"s1": {"id": "s1"}, "s2": {"id": "s2"}}


def _take(path, colour):
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    f"color=c={colour}:s=320x568:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=440:d=4",
                    "-c:v", "libx264", "-preset", "ultrafast", "-g", "15", "-pix_fmt", "yuv420p", "-c:a", "aac",
                    "-shortest", str(path)], check=True)
    return path


@pytest.fixture
def dark_blue(tmp_path):
    proj_dir = tmp_path / "talk"
    initmod.run(proj_dir, "Talk", [_take(tmp_path / "take.mp4", "0x2a3446")])
    words = [{"id": f"w{i}", "source": "s1", "s": i * 0.5 + 0.2, "e": i * 0.5 + 0.6, "w": f"word{i}"} for i in range(6)]
    (proj_dir / "work" / "transcript.json").write_text(json.dumps({"words": words, "segments": [], "nextId": 6}))
    proj = projmod.load(proj_dir)
    proj["cut"]["keep"] = [{"from": "w0", "to": "w5"}]
    proj["look"] = {"autoColor": True}
    projmod.save(proj_dir, proj)
    return proj_dir


def test_nothing_is_measured_when_auto_colour_is_off(dark_blue, monkeypatch):
    monkeypatch.setattr(autocolor, "measure", lambda *_: pytest.fail("measured with auto colour off"))
    proj = {**projmod.load(dark_blue), "look": {"filter": "warm"}}
    assert autocolor.for_project(dark_blue / "work", tools.ffmpeg(), proj, {}, {"s1": dark_blue}) == {}


def test_a_take_is_measured_once_then_read_from_the_cache(dark_blue, monkeypatch):
    proj = projmod.load(dark_blue)
    meta = {s["id"]: s for s in proj["sources"]}
    paths = {s["id"]: projmod.source_path(dark_blue, s) for s in proj["sources"]}
    first = autocolor.for_project(dark_blue / "work", tools.ffmpeg(), proj, meta, paths)
    assert first.get("s1")
    monkeypatch.setattr(autocolor, "measure", lambda *_: pytest.fail("measured twice"))
    assert autocolor.for_project(dark_blue / "work", tools.ffmpeg(), proj, meta, paths) == first


def _stats(video):
    return autocolor.measure(tools.ffmpeg(), video)


def test_a_dark_blue_take_comes_out_brighter_and_less_blue(dark_blue, tmp_path):
    fixed = _stats(capcut.run(dark_blue, tmp_path / "on")["video"])
    proj = projmod.load(dark_blue)
    proj["look"] = {"autoColor": False}
    projmod.save(dark_blue, proj)
    shot = _stats(capcut.run(dark_blue, tmp_path / "off")["video"])
    assert fixed["y"] > shot["y"] + 5
    assert fixed["u"] < shot["u"] - 2
