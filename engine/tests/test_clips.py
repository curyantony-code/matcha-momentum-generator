"""`clip` end to end: real ffmpeg on a generated video, one new project per moment."""
import json
import subprocess

import pytest

from reelengine import clips, init as initmod, probe, project as projmod, tools
from reelengine.proto import EngineError

LONG_SECONDS = 30


@pytest.fixture
def long_project(tmp_path):
    video = tmp_path / "long.mp4"
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    f"testsrc2=s=320x568:r=30:d={LONG_SECONDS}", "-f", "lavfi", "-i",
                    f"sine=frequency=440:d={LONG_SECONDS}", "-c:v", "libx264", "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(video)], check=True)
    project = tmp_path / "long"
    initmod.run(project, "Long talk", [video])
    words = [{"id": f"w{i}", "source": "s1", "s": float(i), "e": i + 0.8, "w": "word."} for i in range(LONG_SECONDS - 1)]
    (project / "work" / "transcript.json").write_text(
        json.dumps({"words": words, "segments": [], "nextId": len(words)}), encoding="utf-8")
    return project


def write_segments(tmp_path, data):
    path = tmp_path / "segments.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_each_moment_becomes_a_project_of_the_snapped_length(long_project, tmp_path):
    segments = write_segments(tmp_path, {"segments": [{"start": 2.0, "end": 9.0, "title": "First"},
                                                      {"start": 15.0, "end": 24.0}]})
    out = clips.run(long_project, segments, tmp_path / "clips")["clips"]

    assert [c["title"] for c in out] == ["First", "Long talk 2"]
    for clip in out:
        proj = projmod.load(clip["project"])
        assert len(proj["sources"]) == 1
        media = probe.probe(f'{clip["project"]}/{proj["sources"][0]["path"]}', quick=True)
        assert media["hasAudio"]
        assert abs(media["duration"] - (clip["end"] - clip["start"])) < 0.2


def test_cutting_the_same_moment_again_makes_a_new_project(long_project, tmp_path):
    segments = write_segments(tmp_path, {"segments": [{"start": 2.0, "end": 9.0}]})
    first = clips.run(long_project, segments, tmp_path / "clips")["clips"][0]
    second = clips.run(long_project, segments, tmp_path / "clips")["clips"][0]
    assert first["project"] != second["project"]
    assert projmod.load(second["project"])["slug"].endswith("-clip-01-2")


def test_temporary_cuts_are_removed(long_project, tmp_path):
    segments = write_segments(tmp_path, {"segments": [{"start": 2.0, "end": 9.0}]})
    clips.run(long_project, segments, tmp_path / "clips")
    assert list((long_project / "work").glob("clips-*")) == []


def test_a_failed_cut_leaves_no_projects_and_no_temp_files(long_project, tmp_path, monkeypatch):
    real = clips._extract
    calls = []

    def fail_second(*args):
        calls.append(args)
        if len(calls) == 2:
            raise EngineError("FFMPEG_FAILED", "boom", "It broke.")
        real(*args)

    monkeypatch.setattr(clips, "_extract", fail_second)
    segments = write_segments(tmp_path, {"segments": [{"start": 2.0, "end": 9.0}, {"start": 15.0, "end": 24.0}]})
    with pytest.raises(EngineError):
        clips.run(long_project, segments, tmp_path / "clips")
    assert list((tmp_path / "clips").glob("*")) == []
    assert list((long_project / "work").glob("clips-*")) == []


def test_a_failed_project_undoes_the_ones_before_it(long_project, tmp_path, monkeypatch):
    real = initmod.run
    calls = []

    def fail_second(*args, **kwargs):
        calls.append(args)
        if len(calls) == 2:
            raise EngineError("IO", "boom", "It broke.")
        return real(*args, **kwargs)

    monkeypatch.setattr(clips.initmod, "run", fail_second)
    segments = write_segments(tmp_path, {"segments": [{"start": 2.0, "end": 9.0}, {"start": 15.0, "end": 24.0}]})
    with pytest.raises(EngineError):
        clips.run(long_project, segments, tmp_path / "clips")
    assert list((tmp_path / "clips").glob("*")) == []


def test_bad_segments_are_refused_before_any_cutting(long_project, tmp_path):
    segments = write_segments(tmp_path, {"segments": [{"start": 9.0, "end": 2.0}]})
    with pytest.raises(EngineError) as err:
        clips.run(long_project, segments, tmp_path / "clips")
    assert err.value.code == "BAD_SEGMENTS"
    assert not (tmp_path / "clips").exists()


def test_a_take_with_no_words_is_refused(long_project, tmp_path):
    words = [{"id": "w0", "source": "s2", "s": 1.0, "e": 1.5, "w": "other."}]
    (long_project / "work" / "transcript.json").write_text(
        json.dumps({"words": words, "segments": [], "nextId": 1}), encoding="utf-8")
    segments = write_segments(tmp_path, {"segments": [{"start": 2.0, "end": 9.0}]})
    with pytest.raises(EngineError) as err:
        clips.run(long_project, segments, tmp_path / "clips")
    assert err.value.code == "NO_WORDS"
