"""The storyboard: the edit cut into scenes, with what is said, what pops up, and a still from the preview."""
import json
import subprocess

import pytest

from reelengine import init as initmod, project as projmod, storyboard, tools


def w(i, s, e, text):
    return {"id": f"w{i}", "s": s, "e": e, "w": text}


SPOKEN = [w(0, 0.0, 0.4, "I"), w(1, 0.4, 0.9, "lost"), w(2, 0.9, 1.4, "45"), w(3, 1.4, 2.6, "days."),
          w(4, 2.8, 3.2, "Nobody"), w(5, 3.2, 3.8, "warned"), w(6, 3.8, 4.9, "me."),
          w(7, 5.0, 5.5, "Here's"), w(8, 5.5, 6.0, "what"), w(9, 6.0, 7.4, "changed.")]


def test_scenes_end_on_sentences_once_long_enough():
    scenes = storyboard.group_scenes(SPOKEN, min_len=2.0, max_len=7.0)
    assert [s["text"] for s in scenes] == ["I lost 45 days.", "Nobody warned me.", "Here's what changed."]
    assert scenes[0]["t0"] == 0.0 and scenes[0]["t1"] == 2.6
    assert [s["ids"][0] for s in scenes] == ["w0", "w4", "w7"]


def test_a_sentence_too_short_to_stand_alone_joins_the_next():
    scenes = storyboard.group_scenes(SPOKEN, min_len=3.0, max_len=7.0)
    assert [s["text"] for s in scenes] == ["I lost 45 days. Nobody warned me.", "Here's what changed."]


def test_a_long_run_without_full_stops_is_still_split():
    words = [w(i, i * 1.0, i * 1.0 + 0.8, "word") for i in range(20)]
    scenes = storyboard.group_scenes(words, min_len=2.0, max_len=7.0)
    assert all(s["t1"] - s["t0"] <= 7.0 for s in scenes)
    assert sum(len(s["ids"]) for s in scenes) == 20


def test_overlays_land_in_the_scene_they_start_in():
    scenes = storyboard.group_scenes(SPOKEN, min_len=2.0, max_len=7.0)
    broll = [
        {"id": "b1", "anchor": {"from": "w2", "to": "w3"}, "treatment": "text-pop", "asset": None, "params": {"text": "45 DAYS"}},
        {"id": "b2", "anchor": {"from": "w7", "to": "w9"}, "treatment": "fullscreen", "asset": "Library/Images/calendar.png"},
        {"id": "b3", "anchor": {"from": "w5", "to": "w6"}, "treatment": "animation", "asset": "work/assets/anim-stat-count-up-1.mov"},
        {"id": "gone", "anchor": {"from": "w99", "to": "w99"}, "treatment": "text-pop", "params": {"text": "CUT"}},
    ]
    placed = storyboard.place_overlays(scenes, broll, {x["id"]: x for x in SPOKEN})
    assert placed[0]["overlays"] == ["Text card: 45 DAYS"]
    assert placed[1]["overlays"] == ["Count-up"]
    assert placed[2]["overlays"] == ["Picture: calendar.png"]


def test_animations_are_named_from_their_sidecar(tmp_path):
    assets = tmp_path / "work" / "assets"
    assets.mkdir(parents=True)
    (assets / "anim-big-quote-1.anim.json").write_text(json.dumps(
        {"kind": "reelstudio-animation", "template": "big-quote", "params": {"text": "By lunch, the day was gone."}}))
    (assets / "anim-list-reveal-1.anim.json").write_text(json.dumps(
        {"kind": "reelstudio-animation", "template": "list-reveal", "params": {"items": ["No email", "No messages"]}}))
    quote = {"treatment": "animation", "asset": "work/assets/anim-big-quote-1.mov"}
    listing = {"treatment": "full-frame", "asset": "work/assets/anim-list-reveal-1.mov"}
    bare = {"treatment": "animation", "asset": "work/assets/anim-stat-count-up-2.mov"}
    assert storyboard.overlay_label(quote, tmp_path) == "Quote: By lunch, the day was gone."
    assert storyboard.overlay_label(listing, tmp_path) == "List: No email, No messages"
    assert storyboard.overlay_label(bare, tmp_path) == "Count-up"


def test_input_is_not_changed():
    words = [dict(x) for x in SPOKEN]
    storyboard.group_scenes(words, min_len=2.0, max_len=7.0)
    assert words == SPOKEN


@pytest.fixture
def previewed_project(tmp_path):
    video = tmp_path / "take.mp4"
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc2=s=320x568:r=30:d=8", "-f", "lavfi", "-i", "sine=frequency=440:d=8",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(video)], check=True)
    project = tmp_path / "talk"
    initmod.run(project, "Talk", [video])
    words = [dict(x, source="s1") for x in SPOKEN]
    (project / "work" / "transcript.json").write_text(json.dumps({"words": words, "segments": [], "nextId": 10}))
    proj = projmod.load(project)
    proj["cut"]["keep"] = [{"from": "w0", "to": "w9"}]
    projmod.save(project, proj)
    preview = project / "versions" / "v1"
    preview.mkdir(parents=True)
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-i", str(video), "-c", "copy",
                    str(preview / "export.mp4")], check=True)
    return project


def test_run_writes_a_still_per_scene_from_the_newest_preview(previewed_project):
    out = storyboard.run(previewed_project)
    assert len(out["scenes"]) == 3
    for scene in out["scenes"]:
        assert scene["still"] and (previewed_project / scene["still"]).is_file()
    saved = json.loads((previewed_project / "work" / "storyboard" / "storyboard.json").read_text())
    assert saved["scenes"][0]["text"] == "I lost 45 days."
    assert saved["video"].endswith("versions/v1/export.mp4")


def test_run_without_a_preview_still_lists_the_scenes(previewed_project):
    (previewed_project / "versions" / "v1" / "export.mp4").unlink()
    out = storyboard.run(previewed_project)
    assert [s["still"] for s in out["scenes"]] == [None, None, None]


def test_two_runs_at_once_both_finish_and_leave_one_whole_storyboard(previewed_project):
    # Regression: the app asked twice at once and the second run crashed on mkdir (FileExistsError).
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: storyboard.run(previewed_project), range(4)))
    assert all(len(r["scenes"]) == 3 for r in results)
    work = previewed_project / "work"
    assert sorted(p.name for p in work.iterdir() if p.name.startswith("storyboard")) == ["storyboard"]
    for scene in json.loads((work / "storyboard" / "storyboard.json").read_text())["scenes"]:
        assert (previewed_project / scene["still"]).is_file()
