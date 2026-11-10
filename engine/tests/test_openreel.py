"""Edit in OpenReel: the openreel-edit file passes the rules of OpenReel Video's own importer.

`check()` restates validatePortableEdit and its schema (openreel-video packages/core/src/editing/portable-project.ts
at 367d7e9, MIT): required fields, id pattern, unique ids, track/media types, source ranges inside the media,
duration = range / speed, subtitle order, number ranges. Restated, not imported: Matcha Momentum Generator runs none of its code.
"""
import json
import re
import subprocess

import pytest

from reelengine import init as initmod, openreel, project as projmod, tools

ID = re.compile(r"^[a-zA-Z0-9_.:-]{1,200}$")
TRACK_TYPES = {"video", "audio", "image", "text", "graphics"}
MEDIA_TYPES = {"video", "audio", "image"}
CLIP_KEYS = {"id", "mediaId", "trackId", "startTime", "duration", "inPoint", "outPoint", "effects", "audioEffects",
             "transform", "volume", "keyframes"}
META_KEYS = {"duration", "width", "height", "frameRate", "codec", "sampleRate", "channels", "fileSize"}
TRANSFORM_FITS = {"contain", "cover", "stretch", "none"}


def check(doc: dict) -> None:
    assert doc["format"] == "openreel-edit" and doc["version"] == 2
    p = doc["project"]
    assert {"id", "name", "settings", "media", "timeline", "textClips"} <= set(p)
    s = p["settings"]
    assert 16 <= s["width"] <= 8192 and 16 <= s["height"] <= 8192 and 1 <= s["frameRate"] <= 120
    assert 8000 <= s["sampleRate"] <= 192000 and 1 <= s["channels"] <= 8
    seen = set()

    def unique(i):
        assert ID.match(i), f"bad id {i!r}"
        assert i not in seen, f"duplicate id {i}"
        seen.add(i)
    media = {}
    for m in p["media"]:
        unique(m["id"])
        assert m["type"] in MEDIA_TYPES and META_KEYS <= set(m["metadata"])
        meta = m["metadata"]
        assert 0 <= meta["duration"] <= 86400 and 0 <= meta["frameRate"] <= 240 and 0 <= meta["channels"] <= 8
        assert {"name", "size", "lastModified"} <= set(m["sourceFile"])
        media[m["id"]] = m
    tl = p["timeline"]
    assert {"tracks", "subtitles", "markers", "duration"} <= set(tl) and len(tl["tracks"]) <= 100
    for t in tl["tracks"]:
        unique(t["id"])
        assert t["type"] in TRACK_TYPES
        assert {"name", "locked", "hidden", "muted", "solo", "clips", "transitions"} <= set(t)
        for c in t["clips"]:
            unique(c["id"])
            assert CLIP_KEYS <= set(c), CLIP_KEYS - set(c)
            a = media.get(c["mediaId"])
            assert a and c["trackId"] == t["id"], f"clip {c['id']}: media or track"
            assert t["type"] == a["type"] or (t["type"] == "video" and a["type"] == "image")
            assert c["outPoint"] > c["inPoint"] >= 0
            if a["type"] != "image":
                assert c["outPoint"] <= a["metadata"]["duration"] + 0.05, f"clip {c['id']} runs past its media"
            assert abs(c["duration"] - (c["outPoint"] - c["inPoint"]) / c.get("speed", 1)) <= 0.05
            assert 0.001 <= c["duration"] <= 86400 and 0 <= c["startTime"] <= 86400 and 0 <= c["volume"] <= 4
            tr = c["transform"]
            assert {"x", "y"} <= set(tr["position"]) and {"x", "y"} <= set(tr["scale"]) and 0 <= tr["opacity"] <= 1
            assert tr.get("fitMode", "contain") in TRANSFORM_FITS
    for sub in tl["subtitles"]:
        unique(sub["id"])
        assert sub["endTime"] > sub["startTime"] >= 0 and sub["text"]
        assert sub.get("style", {}).get("position", "bottom") in ("top", "center", "bottom")
    assert len(json.dumps(doc)) < 5 * 1024 * 1024


def test_a_picture_card_lands_where_the_app_drew_it():
    t = openreel.placed(100, 200, 540, 300, 1080, 1920)     # top-left (100, 200), 540 x 300
    fw, fh = openreel.contain(540, 300, 1080, 1920)          # OpenReel first fits it to the canvas...
    drawn_w = fw * t["scale"]["x"]                            # ...then scales it
    assert drawn_w == pytest.approx(540) and fh * t["scale"]["y"] == pytest.approx(300)
    cx, cy = 540 + t["position"]["x"], 960 + t["position"]["y"]   # position = offset from the canvas centre
    assert (cx - drawn_w / 2, cy - 150) == pytest.approx((100, 200))


def test_contain_matches_openreel_for_tall_and_wide_pictures():
    assert openreel.contain(1080, 1920, 1080, 1920) == (1080, 1920)
    assert openreel.contain(2000, 1000, 1080, 1920) == (1080, 540)
    assert openreel.contain(500, 2000, 1080, 1920) == (480, 1920)


@pytest.fixture
def project(tmp_path):
    video = tmp_path / "take.mp4"
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc2=s=320x568:r=30:d=6", "-f", "lavfi", "-i", "sine=frequency=440:d=6",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(video)], check=True)
    proj_dir = tmp_path / "talk"
    initmod.run(proj_dir, "My first reel", [video])
    words = [{"id": f"w{i}", "source": "s1", "s": i * 0.5 + 0.2, "e": i * 0.5 + 0.6, "w": f"word{i}"} for i in range(10)]
    (proj_dir / "work" / "transcript.json").write_text(json.dumps({"words": words, "segments": [], "nextId": 10}))
    proj = projmod.load(proj_dir)
    proj["cut"]["keep"] = [{"from": "w0", "to": "w2"}, {"from": "w6", "to": "w9"}]   # two cuts, a gap between
    projmod.save(proj_dir, proj)
    return proj_dir


def test_the_export_passes_openreel_rules_with_each_cut_as_its_own_clip(project, tmp_path):
    out = openreel.run(project, tmp_path / "out")
    doc = json.loads((tmp_path / "out" / "my-first-reel.openreel-edit.json").read_text())
    check(doc)
    assert out["takes"] == 1 and out["cuts"] == 2
    clips = doc["project"]["timeline"]["tracks"][0]["clips"]
    assert clips[1]["inPoint"] > clips[0]["outPoint"]              # the gap is cut, the source times kept
    assert clips[1]["startTime"] == pytest.approx(clips[0]["startTime"] + clips[0]["duration"], abs=0.01)
    files = {p.name for p in (tmp_path / "out" / "media").iterdir()}
    assert files == {m["name"] for m in doc["project"]["media"]}    # every referenced file is in media/
    take = doc["project"]["media"][0]
    assert take["sourceFile"]["size"] == (tmp_path / "out" / "media" / take["name"]).stat().st_size
    assert (take["metadata"]["width"], take["metadata"]["height"]) == (1080, 1920)
    assert (tmp_path / "out" / "captions.srt").exists() and (tmp_path / "out" / openreel.HOW_TO).exists()


def test_an_export_never_goes_into_a_folder_with_something_in_it(project, tmp_path):
    (tmp_path / "busy").mkdir()
    (tmp_path / "busy" / "keep.txt").write_text("mine")
    with pytest.raises(Exception, match="not empty"):
        openreel.run(project, tmp_path / "busy")
    assert (tmp_path / "busy" / "keep.txt").read_text() == "mine"
