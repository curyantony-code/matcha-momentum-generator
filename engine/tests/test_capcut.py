"""Handing an edit to CapCut: the edit without burned captions, and the captions as an .srt it can import."""
import json
import subprocess

import pytest

from reelengine import capcut, init as initmod, probe, project as projmod, tools

SECONDS = 6


def test_srt_numbers_cues_and_formats_times():
    cues = [{"s": 0.0, "e": 1.25, "t": "HELLO THERE"}, {"s": 61.5, "e": 3725.004, "t": "SECOND"}]
    assert capcut.to_srt(cues) == (
        "1\n00:00:00,000 --> 00:00:01,250\nHELLO THERE\n\n"
        "2\n00:01:01,500 --> 01:02:05,004\nSECOND\n"
    )


def test_srt_skips_empty_and_backwards_cues():
    cues = [{"s": 1.0, "e": 0.5, "t": "BACK"}, {"s": 2.0, "e": 3.0, "t": "  "}, {"s": 4.0, "e": 5.0, "t": "OK"}]
    assert capcut.to_srt(cues) == "1\n00:00:04,000 --> 00:00:05,000\nOK\n"


def test_srt_keeps_cue_text_on_one_block_per_cue():
    assert "\n\n" not in capcut.to_srt([{"s": 0.0, "e": 1.0, "t": "A\n\nB"}]).strip()


@pytest.fixture
def edited_project(tmp_path):
    video = tmp_path / "take.mp4"
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    f"testsrc2=s=320x568:r=30:d={SECONDS}", "-f", "lavfi", "-i", f"sine=frequency=440:d={SECONDS}",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(video)], check=True)
    project = tmp_path / "talk"
    initmod.run(project, "Talk", [video])
    words = [{"id": f"w{i}", "source": "s1", "s": i * 0.5 + 0.2, "e": i * 0.5 + 0.6, "w": f"word{i}"} for i in range(10)]
    (project / "work" / "transcript.json").write_text(json.dumps({"words": words, "segments": [], "nextId": 10}))
    proj = projmod.load(project)
    proj["cut"]["keep"] = [{"from": "w0", "to": "w9"}]
    proj["captions"] = {**proj.get("captions", {}), "enabled": True}
    projmod.save(project, proj)
    return project


def test_export_writes_a_clean_video_and_its_captions_without_touching_versions(edited_project, tmp_path):
    out = tmp_path / "for-capcut"
    before = projmod.load(edited_project)["version"]
    result = capcut.run(edited_project, out)

    video = probe.probe(result["video"], quick=True)
    assert video["hasVideo"] and video["hasAudio"]
    srt = (out / "captions.srt").read_text(encoding="utf-8")
    assert srt.startswith("1\n00:00:00,")
    assert "WORD0" in srt or "word0" in srt.lower()
    assert result["cues"] >= 1
    assert projmod.load(edited_project)["version"] == before
    assert not (edited_project / "versions" / f"v{before + 1}").exists()
    assert sorted(p.name for p in out.iterdir()) == ["captions.srt", "video.mp4"]
