"""study-fetch / study-measure / study-list: everything here runs offline."""
import json
import subprocess
from pathlib import Path

import numpy as np
import pytest

from reelengine import cli, proto, study, tools
from reelengine.proto import EngineError


# --- urls ----------------------------------------------------------------------------------------

@pytest.mark.parametrize("url,platform", [
    ("https://www.instagram.com/reel/ABC123/", "instagram"),
    ("https://www.instagram.com/p/DXUay41ivSK/", "instagram"),
    ("https://instagram.com/reels/ABC123/", "instagram"),
    ("https://www.instagram.com/someone/reel/ABC123/", "instagram"),
    ("https://www.tiktok.com/@khaby.lame/video/7123456789012345678", "tiktok"),
    ("https://vm.tiktok.com/ZMabc123/", "tiktok"),
    ("https://www.youtube.com/shorts/abcDEF12345", "youtube"),
    ("https://youtu.be/abcDEF12345", "youtube"),
])
def test_detect_platform_accepts(url, platform):
    assert study.detect_platform(url) == platform


@pytest.mark.parametrize("url", [
    "https://example.com/reel/abc", "https://www.instagram.com/someone/", "https://www.tiktok.com/@x",
    "https://www.youtube.com/watch?v=abcDEF12345", "file:///etc/passwd", "javascript:alert(1)", "",
    "https://evil.com/?u=https://www.instagram.com/reel/abc/", "https://instagram.com.evil.com/reel/abc/",
])
def test_detect_platform_rejects(url):
    with pytest.raises(EngineError) as e:
        study.detect_platform(url)
    assert e.value.code == "BAD_URL"
    assert e.value.user_message == "That link isn't an Instagram, TikTok or YouTube video."


def test_parse_profile():
    assert study.parse_profile("https://www.tiktok.com/@khaby.lame") == ("tiktok", "khaby.lame", "https://www.tiktok.com/@khaby.lame")
    assert study.parse_profile("https://www.youtube.com/@MrBeast")[2] == "https://www.youtube.com/@MrBeast/shorts"
    assert study.parse_profile("https://www.instagram.com/nasa/")[:2] == ("instagram", "nasa")
    assert study.parse_profile("@nasa", "instagram")[:2] == ("instagram", "nasa")
    with pytest.raises(EngineError):
        study.parse_profile("@nasa")
    with pytest.raises(EngineError):
        study.parse_profile("https://www.instagram.com/reel/abc/")


# --- source.json ---------------------------------------------------------------------------------

def test_shape_source():
    info = {"id": "abc", "uploader_id": "@MrBeast", "uploader_url": "https://www.youtube.com/@MrBeast",
            "title": "  Hi ", "description": "x" * 3000, "view_count": 10, "like_count": 2.0,
            "comment_count": None, "duration": 12.3456, "upload_date": "20260102"}
    s = study.shape_source("https://youtu.be/abc", "youtube", info)
    assert s == {"url": "https://youtu.be/abc", "platform": "youtube", "id": "abc", "creator": "MrBeast",
                 "creatorUrl": "https://www.youtube.com/@MrBeast", "title": "Hi", "caption": "x" * 2000,
                 "views": 10, "likes": 2, "comments": None, "durationSec": 12.346,
                 "uploadedAt": "2026-01-02", "video": "video.mp4"}


def test_shape_source_sparse():
    ig = study.shape_source("u", "instagram", {"id": 1, "channel": "rob", "uploader": "Rob G", "uploader_id": "567"})
    assert ig["creator"] == "rob" and ig["creatorUrl"] == "https://www.instagram.com/rob/"
    tt = study.shape_source("u", "tiktok", {"id": 1, "uploader": "khaby.lame", "channel": "Khaby", "uploader_id": "99"})
    assert tt["creator"] == "khaby.lame"
    s = study.shape_source("u", "instagram", {"id": 5, "description": "Line one\nline two", "timestamp": 0})
    assert s["creator"] == "" and s["creatorUrl"] is None and s["title"] == "Line one"
    assert s["id"] == "5" and s["views"] is None and s["uploadedAt"] == "1970-01-01"


def test_error_mapping():
    m = lambda msg, plat="instagram", ck=False: study.map_ytdlp_error(Exception(msg), plat, ck)
    assert m("Unable to download webpage: <urlopen error [Errno 8]>").code == "NETWORK"
    e = m("Instagram sent an empty media response. Check if this post is accessible in your browser without being logged-in.")
    assert e.code == "LOGIN_NEEDED" and e.user_message.startswith("Instagram wants a login")
    assert m("login required", ck=True).code == "UNAVAILABLE"
    assert m("This video is private", "tiktok").code == "UNAVAILABLE"
    assert m("something odd", "youtube").code == "FETCH_FAILED"


def test_error_mapping_by_status_code_first():
    m = lambda msg, plat="instagram", ck=False: study.map_ytdlp_error(Exception(msg), plat, ck)
    # yt-dlp wraps HTTP errors in "Unable to download webpage": the status decides, not the wrapper
    assert m("Unable to download webpage: HTTP Error 404: Not Found", "tiktok").code == "UNAVAILABLE"
    assert m("Unable to download webpage: HTTP Error 401: Unauthorized").code == "LOGIN_NEEDED"
    assert m("Unable to download webpage: HTTP Error 403: Forbidden", ck=True).code == "UNAVAILABLE"
    assert m("HTTP Error 429: Too Many Requests", "youtube").code == "RATE_LIMITED"
    assert m("Unable to download webpage: HTTP Error 503", "youtube").code == "NETWORK"
    # the usual login-wall hint names --cookies-from-browser: that is not a cookie-reading failure
    hint = "Requested content is not available, rate-limit reached or login required. Use --cookies, --cookies-from-browser"
    assert m(hint, ck=True).code == "UNAVAILABLE"
    assert m("Sign in to confirm you're not a bot. Use --cookies-from-browser", "youtube", ck=True).code == "RATE_LIMITED"
    assert m("failed to decrypt cookie with keychain", ck=True).code == "COOKIES_UNREADABLE"
    assert m("could not find chrome cookies database in /x", ck=True).code == "COOKIES_UNREADABLE"


# --- measure maths -------------------------------------------------------------------------------

def test_dedupe_cuts():
    assert study.dedupe_cuts([5.0, 1.0, 1.1, 0.1, 3.0, 3.25, 3.2]) == [1.0, 3.0, 3.25, 5.0]


def test_shot_stats():
    assert study.shot_stats(30.0, [10.0, 20.0]) == (4.0, 10.0)
    assert study.shot_stats(0, []) == (0.0, 0.0)


def test_speech_stats():
    words = [{"w": "a", "s": 1.0, "e": 2.0}, {"w": "b", "s": 1.5, "e": 3.0}, {"w": "c", "s": 5.0, "e": 6.0}]
    s = study.speech_stats(words, 10.0)
    assert s["wordCount"] == 3 and s["wpm"] == 18.0 and s["firstWordAt"] == 1.0
    assert s["speechRatio"] == 0.3
    assert study.speech_stats([], 10.0) == {"wordCount": 0, "wpm": 0.0, "firstWordAt": None, "speechRatio": 0.0}


def test_music_likely():
    quiet = np.full(1000, 0.001, dtype=np.float32)
    loud = np.full(1000, 0.05, dtype=np.float32)
    words = [{"w": "a", "s": 4.0, "e": 5.0}]
    assert study.music_likely(loud, words, 10.0) is True
    assert study.music_likely(quiet, words, 10.0) is False
    assert study.music_likely(loud, [{"w": "a", "s": 0.0, "e": 10.0}], 10.0) is False


def test_select_frame_times():
    t = study.select_frame_times(30.0, [4.0, 8.0, 12.0, 16.0, 20.0, 24.0, 28.0, 29.9])
    assert len(t) == 8 and t[0] == 0.0 and 1.5 in t and t == sorted(t)
    assert sum(1 for x in t[2:] if round(x - 0.3, 1) in (4.0, 8.0, 12.0, 16.0, 20.0, 24.0, 28.0)) >= 5
    nocut = study.select_frame_times(30.0, [])
    assert len(nocut) == 8 and nocut[:2] == [0.0, 1.5]
    short = study.select_frame_times(1.0, [])
    assert short[0] == 0.0 and all(x <= 1.0 for x in short)


# --- out path safety -----------------------------------------------------------------------------

def test_out_dir_rules(tmp_path):
    assert study.out_dir(str(tmp_path / "a" / "b")).is_dir()
    for bad in ("", "relative/dir", str(tmp_path / ".." / "x"), "/"):
        with pytest.raises(EngineError) as e:
            study.out_dir(bad)
        assert e.value.code == "BAD_OUT"
    f = tmp_path / "file"
    f.write_text("x")
    with pytest.raises(EngineError):
        study.out_dir(str(f))
    out = tmp_path / "o"
    out.mkdir()
    outside = tmp_path / "secret.mp4"
    outside.write_text("x")
    (out / "video.mp4").symlink_to(outside)
    with pytest.raises(EngineError):
        study.out_dir(str(out))


def test_fetch_rejects_bad_url_before_touching_disk(tmp_path):
    out = tmp_path / "never"
    with pytest.raises(EngineError) as e:
        study.fetch(str(out), "https://example.com/x")
    assert e.value.code == "BAD_URL" and not out.exists()


# --- end to end on a synthetic clip --------------------------------------------------------------

def _make_clip(path: Path, audio: bool = True):
    # 3 x 2 s of different colours (two hard cuts, at 2 s and 4 s), 440 Hz tone
    cmd = [tools.ffmpeg(), "-y", "-nostdin", "-hide_banner", "-loglevel", "error"]
    for color in ("black", "white", "black"):
        cmd += ["-f", "lavfi", "-i", f"color=c={color}:s=320x568:r=25:d=2"]
    if audio:
        cmd += ["-f", "lavfi", "-i", "sine=frequency=440:duration=6"]
    cmd += ["-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]"]
    if audio:
        cmd += ["-map", "3:a", "-c:a", "aac"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)]
    subprocess.run(cmd, check=True)


@pytest.fixture
def clip_dir(tmp_path):
    d = tmp_path / "study"
    d.mkdir()
    _make_clip(d / "video.mp4")
    return d


def test_measure_end_to_end(clip_dir, monkeypatch):
    words = [{"w": "hello", "s": 0.5, "e": 0.9}, {"w": "world", "s": 1.0, "e": 1.4}]
    monkeypatch.setattr(study, "_listen", lambda wav, dur: (words, "en"))
    r = study.measure(str(clip_dir))
    assert r["durationSec"] == pytest.approx(6.0, abs=0.2)
    assert len(r["cuts"]) == 2 and r["cuts"][0] == pytest.approx(2.0, abs=0.1)
    assert r["cutsPerMin"] == pytest.approx(20.0, abs=1.5)
    assert r["avgShotSec"] == pytest.approx(2.0, abs=0.1)
    assert r["wordCount"] == 2 and [w["w"] for w in r["words"]] == ["hello", "world"]
    assert r["firstWordAt"] == pytest.approx(0.5, abs=0.2)
    assert 0 < r["speechRatio"] < 1 and r["language"] == "en"
    assert r["musicLikely"] is True            # the tone plays between the words
    assert r["frames"][0] == {"file": "frames/f00-0.00.jpg", "at": 0.0}
    assert any(f["at"] == 1.5 for f in r["frames"]) and len(r["frames"]) <= 8
    for f in r["frames"]:
        assert (clip_dir / f["file"]).stat().st_size > 0
    assert json.loads((clip_dir / "measure.json").read_text()) == r
    assert not (clip_dir / "work").exists()


def test_measure_no_speech(clip_dir, monkeypatch):
    monkeypatch.setattr(study, "_listen", lambda wav, dur: ([], "en"))
    r = study.measure(str(clip_dir))
    assert r["words"] == [] and r["wpm"] == 0 and r["firstWordAt"] is None and r["speechRatio"] == 0


def test_measure_silent_video_needs_no_model(tmp_path, monkeypatch):
    d = tmp_path / "s"
    d.mkdir()
    _make_clip(d / "video.mp4", audio=False)
    monkeypatch.setattr(study, "_listen", lambda *a: pytest.fail("no audio, no model"))
    r = study.measure(str(d))
    assert r["words"] == [] and r["musicLikely"] is False and len(r["cuts"]) == 2


def test_measure_model_missing(clip_dir, monkeypatch, tmp_path):
    monkeypatch.setenv("REELENGINE_MODELS", str(tmp_path / "nomodels"))
    monkeypatch.setenv("REELENGINE_MODEL", "small.en")
    with pytest.raises(EngineError) as e:
        study.measure(str(clip_dir))
    assert e.value.code == "MODEL_MISSING"


def test_measure_without_video(tmp_path):
    with pytest.raises(EngineError) as e:
        study.measure(str(tmp_path / "empty"))
    assert e.value.code == "NOT_FOUND"


def test_cli_registered(clip_dir, monkeypatch):
    monkeypatch.setattr(study, "_listen", lambda wav, dur: ([], None))
    buf = __import__("io").StringIO()
    proto.set_stream(buf)
    assert cli.main(["study-measure", "--out", str(clip_dir)]) == 0
    lines = [json.loads(l) for l in buf.getvalue().splitlines()]
    assert lines[-1]["event"] == "done" and any(l.get("stage") == "listen" for l in lines if l["event"] == "progress")
    assert cli.main(["study-fetch", "--out", str(clip_dir), "https://example.com/a"]) == 1
