"""Colour filters: one look for the whole picture, applied before the captions so captions keep their colours."""
import json
import subprocess

import pytest

from reelengine import capcut, init as initmod, looks, project as projmod, tools


def test_no_filter_means_no_chain():
    assert looks.filter_chain(None) is None
    assert looks.filter_chain({}) is None
    assert looks.filter_chain({"filter": "none"}) is None


def test_every_named_filter_has_a_chain():
    for key in looks.FILTERS:
        if key != "none":
            assert looks.filter_chain({"filter": key})


def test_all_of_openreels_colour_presets_are_there():
    names = looks.openreel_filters()
    assert len(names) == 30
    assert {"cinematic-teal-orange", "cinematic-noir", "vintage-polaroid", "mood-golden-hour", "color-vibrant"} <= set(names)
    assert all(looks.known(n) for n in names)


def test_openreel_presets_follow_openreels_own_values():
    noir = looks.filter_chain({"filter": "cinematic-noir"})
    assert "eq=saturation=0.000" in noir and "eq=contrast=1.400" in noir and "eq=brightness=-0.050" in noir
    assert "vignette=angle=" in noir and "noise=c0s=6:c0f=t:c0_seed=7" in noir      # mono grain, fixed seed
    assert "noise=alls=" in looks.filter_chain({"filter": "vintage-70s"})            # coloured grain
    assert "hue=h=210" in looks.filter_chain({"filter": "cinematic-day-for-night"})


def test_every_openreel_chain_is_accepted_by_ffmpeg():
    for key, chain in looks.openreel_filters().items():
        r = subprocess.run([tools.ffmpeg(), "-hide_banner", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x64:d=0.2",
                            "-vf", chain or "null", "-f", "null", "-"], capture_output=True, text=True)
        assert r.returncode == 0, (key, chain, r.stderr)


def test_an_unknown_filter_is_ignored_rather_than_breaking_the_render():
    assert looks.filter_chain({"filter": "sepia; rm -rf /"}) is None


def test_every_chain_is_accepted_by_ffmpeg():
    for key in looks.FILTERS:
        chain = looks.filter_chain({"filter": key}) or "null"
        r = subprocess.run([tools.ffmpeg(), "-hide_banner", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=64x64:d=0.2",
                            "-vf", chain, "-f", "null", "-"], capture_output=True, text=True)
        assert r.returncode == 0, (key, r.stderr)


@pytest.fixture
def project(tmp_path):
    video = tmp_path / "take.mp4"
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc2=s=320x568:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=440:d=4",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(video)], check=True)
    proj_dir = tmp_path / "talk"
    initmod.run(proj_dir, "Talk", [video])
    words = [{"id": f"w{i}", "source": "s1", "s": i * 0.5 + 0.2, "e": i * 0.5 + 0.6, "w": f"word{i}"} for i in range(6)]
    (proj_dir / "work" / "transcript.json").write_text(json.dumps({"words": words, "segments": [], "nextId": 6}))
    proj = projmod.load(proj_dir)
    proj["cut"]["keep"] = [{"from": "w0", "to": "w5"}]
    proj["look"] = {"filter": "mono"}
    projmod.save(proj_dir, proj)
    return proj_dir


def _chroma_spread(video):
    """How far the U and V planes stray from neutral grey (128) in one frame: about 0 for black and white."""
    raw = subprocess.run([tools.ffmpeg(), "-v", "error", "-ss", "1", "-i", str(video), "-frames:v", "1",
                          "-vf", "scale=32:32,format=yuv444p", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    plane = 32 * 32
    chroma = raw[plane:3 * plane]
    return max(abs(b - 128) for b in chroma)


def test_a_black_and_white_look_reaches_the_rendered_video(project, tmp_path):
    out = capcut.run(project, tmp_path / "mono")          # a full render of the project, no captions
    # a few steps off grey is the encoder's rounding (4 with CI's ffmpeg, 3 here); colour stays far above 20
    assert _chroma_spread(out["video"]) <= 6
    proj = projmod.load(project)
    proj["look"] = {"filter": "none"}
    projmod.save(project, proj)
    colour = capcut.run(project, tmp_path / "colour")
    assert _chroma_spread(colour["video"]) > 20
