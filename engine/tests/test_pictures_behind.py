"""The speaker is the foreground: pictures and animations go behind them, smaller, and captions stay on top."""
import subprocess

import numpy as np

from reelengine import behind, broll, segment, tools
from reelengine.render_ctx import Layer


class Ctx:
    def __init__(self, look=None):
        self.project = {"look": look or {}}


def test_pictures_are_smaller_by_default_and_the_look_can_change_it():
    assert broll.picture_size(None) == broll.PICTURE_SIZE == 0.75
    assert broll.picture_size({"pictureSize": 1}) == 1.0
    assert broll.picture_size({"pictureSize": 0.1}) == broll.PICTURE_SIZE_MIN
    assert broll.picture_size({"pictureSize": "big"}) == broll.PICTURE_SIZE
    for t in ("card-above-head", "side-card", "phone-card"):
        assert broll.item_params(Ctx(), t, 0, {})["scale"] == broll.treatment_defaults(t)["scale"] * 0.75
    assert broll.item_params(Ctx({"pictureSize": 0.5}), "card-above-head", 0, {})["scale"] == 0.5
    assert broll.item_params(Ctx(), "card-above-head", 0, {"params": {"scale": 0.9}})["scale"] == 0.9   # by hand wins


def test_pictures_go_behind_the_speaker_unless_turned_off(monkeypatch):
    monkeypatch.setattr(segment, "available", lambda: True)
    assert broll.pictures_behind(None) and broll.pictures_behind({})
    assert not broll.pictures_behind({"picturesBehind": False})
    monkeypatch.setattr(segment, "available", lambda: False)
    assert not broll.pictures_behind({})                     # no person masks: drawn in front, as before


def test_a_picture_behind_the_speaker_never_counts_as_covering_the_face():
    rec = {"id": "b1", "treatment": "full-frame", "behind": True, "faceHiding": False,
           "bbox": [0, 0, 1080, 1920], "protected": [400, 700, 300, 300]}

    class C:
        fmt = {"width": 1080, "height": 1920, "fps": 30}
        project = {}
    assert broll.check_layers(C(), [rec]) == []
    assert broll.check_layers(C(), [{**rec, "behind": False}])          # in front, it would


def _clip(path, seconds=1.0):
    subprocess.run([tools.ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=blue:s=160x160:d={seconds}:r=10",
                    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", str(seconds), "-c:v", "libx264",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", str(path)], check=True)


def test_captions_are_burned_on_top_of_a_full_frame_picture_behind_the_speaker(tmp_path, monkeypatch):
    from PIL import Image
    export = tmp_path / "export.mp4"
    _clip(export)
    card = tmp_path / "card.png"
    Image.new("RGBA", (160, 160), (255, 255, 255, 255)).save(card)      # a white picture over the whole frame
    (tmp_path / "fonts").mkdir()
    (tmp_path / "captions.ass").write_text(
        "[Script Info]\nPlayResX: 160\nPlayResY: 160\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding\n"
        "Style: Cap,Arial,60,&H000000FF,&H000000FF,&H000000FF,&H00000000,0,0,0,0,100,100,0,0,3,20,0,5,0,0,0,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        "Dialogue: 0,0:00:00.00,0:00:01.00,Cap,,0,0,0,,{\\pos(80,80)}II\n", encoding="utf-8")
    monkeypatch.setattr(segment, "available", lambda: True)
    monkeypatch.setattr(segment, "person_mask", lambda _p, _q="balanced": np.zeros((160, 160), dtype=np.float32))
    res = behind.apply(tools.ffmpeg(), export, [Layer(card, "image", 0.0, 1.0, 0, 0, 160, 160, behind=True)], 10.0,
                       1.0, ["-c:v", "libx264", "-pix_fmt", "yuv420p"], False, ass="captions.ass", cwd=tmp_path)
    assert res.drawn == 1
    frame = tmp_path / "f.png"
    subprocess.run([tools.ffmpeg(), "-v", "error", "-y", "-ss", "0.5", "-i", str(export), "-frames:v", "1", str(frame)],
                   check=True)
    px = np.asarray(Image.open(frame).convert("RGB"), dtype=int)
    assert px[5, 5].min() > 200                                  # the picture covers the frame...
    red = (px[..., 0] > 150) & (px[..., 1] < 90) & (px[..., 2] < 90)
    assert red[60:100, 60:100].mean() > 0.3                      # ...and the red caption box is drawn over it


def test_a_video_layer_behind_the_speaker_plays_its_own_frames(tmp_path, monkeypatch):
    from PIL import Image
    export = tmp_path / "export.mp4"
    _clip(export)
    anim = tmp_path / "anim.mov"
    subprocess.run([tools.ffmpeg(), "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=160x160:d=1:r=10,format=argb",
                    "-c:v", "qtrle", str(anim)], check=True)
    half = np.zeros((160, 160), dtype=np.float32)
    half[:, :80] = 1.0
    monkeypatch.setattr(segment, "available", lambda: True)
    monkeypatch.setattr(segment, "person_mask", lambda _p, _q="balanced": half)
    res = behind.apply(tools.ffmpeg(), export, [Layer(anim, "video", 0.0, 1.0, 0, 0, 160, 160, behind=True)], 10.0,
                       1.0, ["-c:v", "libx264", "-pix_fmt", "yuv420p"], False)
    assert res.drawn == 1
    frame = tmp_path / "f.png"
    subprocess.run([tools.ffmpeg(), "-v", "error", "-y", "-ss", "0.5", "-i", str(export), "-frames:v", "1", str(frame)],
                   check=True)
    px = np.asarray(Image.open(frame).convert("RGB"), dtype=int)
    assert px[80, 20, 2] > 150 and px[80, 20, 0] < 100           # the person's half: the speaker shows through
    assert px[80, 140].min() > 200                              # the other half: the animation
