"""Text behind the speaker: the card is cut where the person stands, then laid over the finished video."""
import subprocess

import numpy as np
import pytest

from reelengine import behind, broll, segment, tools
from reelengine.render_ctx import Layer


def _clip(path, w=64, h=64, seconds=1.0):
    subprocess.run([tools.ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=blue:s={w}x{h}:d={seconds}:r=10",
                    "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo", "-t", str(seconds), "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", str(path)], check=True)


def test_the_card_is_hidden_where_the_person_stands_and_shown_elsewhere(tmp_path, monkeypatch):
    from PIL import Image
    export = tmp_path / "export.mp4"
    _clip(export)
    card = tmp_path / "card.png"
    Image.new("RGBA", (64, 64), (255, 255, 255, 255)).save(card)
    left_half = np.zeros((64, 64), dtype=np.float32)
    left_half[:, :32] = 1.0                                   # "the person" fills the left half
    monkeypatch.setattr(segment, "available", lambda: True)
    monkeypatch.setattr(segment, "person_mask", lambda _p, _q="balanced": left_half)
    res = behind.apply(tools.ffmpeg(), export, [Layer(card, "image", 0.0, 1.0, 0, 0, 64, 64, behind=True)], 10.0,
                       1.0, ["-c:v", "libx264", "-pix_fmt", "yuv420p"], False)
    assert res.drawn == 1 and res.masked
    assert 0.45 < res.visible[0]["visible"] < 0.55             # half the card is behind the person
    frame = tmp_path / "f.png"
    subprocess.run([tools.ffmpeg(), "-v", "error", "-y", "-ss", "0.5", "-i", str(export), "-frames:v", "1", str(frame)], check=True)
    px = np.asarray(Image.open(frame).convert("RGB"), dtype=int)
    assert px[32, 8, 2] > 150 and px[32, 8, 0] < 100           # left (the person): still the blue video
    assert px[32, 56].min() > 200                              # right: the white card shows


def test_without_person_detection_the_card_is_drawn_in_front(tmp_path, monkeypatch):
    from PIL import Image
    export = tmp_path / "export.mp4"
    _clip(export)
    card = tmp_path / "card.png"
    Image.new("RGBA", (64, 64), (255, 255, 255, 255)).save(card)
    monkeypatch.setattr(segment, "available", lambda: False)
    monkeypatch.setattr(segment, "person_mask", lambda _p, _q="balanced": None)
    res = behind.apply(tools.ffmpeg(), export, [Layer(card, "image", 0.0, 1.0, 0, 0, 64, 64, behind=True)], 10.0,
                       1.0, ["-c:v", "libx264", "-pix_fmt", "yuv420p"], False)
    assert res.drawn == 1 and not res.masked and res.visible[0]["visible"] == 1.0


def test_nothing_to_do_leaves_the_video_alone(tmp_path):
    res = behind.apply(tools.ffmpeg(), tmp_path / "x.mp4", [], 30.0, 1.0, [], False)
    assert res.drawn == 0 and res.stderr == ""


@pytest.mark.skipif(not segment.available(), reason="needs macOS Vision")
def test_vision_returns_a_mask_the_size_of_the_frame(tmp_path):
    from PIL import Image
    img = tmp_path / "frame.png"
    Image.new("RGB", (120, 200), (200, 180, 160)).save(img)
    mask = segment.person_mask(img)
    assert mask is not None and mask.shape == (200, 120) and 0.0 <= float(mask.min()) <= float(mask.max()) <= 1.0


def test_a_behind_title_spans_the_frame_and_overlaps_the_head(monkeypatch):
    class Ctx:
        fmt = {"width": 1080, "height": 1920, "fps": 30}
        project = {}
        work = None
    saved = {}
    monkeypatch.setattr(broll, "_save_png", lambda img, ctx, stem: saved.setdefault("img", img) and "card.png")
    monkeypatch.setattr(broll, "fmt_of", lambda ctx: (1080, 1920, 30.0))
    face = (390, 700, 300, 380)                                 # x, y, w, h in output px
    layers, rec = broll._t_text_behind(Ctx(), {"id": "b1", "t0": 0.0, "t1": 2.0}, {"textStyle": "hero"}, "Acme", face)
    L = layers[0]
    assert L.behind and rec["behind"] and rec["text"] == "ACME"
    assert L.w >= 1080 * 0.8                                    # nearly as wide as the frame
    assert L.y < face[1] < L.y + L.h                            # the head's top falls inside the letters
