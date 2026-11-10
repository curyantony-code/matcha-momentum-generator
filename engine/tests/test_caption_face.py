"""Captions keep off the face: a style height that would cross the eyes-to-chin zone drops to just under the chin
(his rule: "captions just under my collar"), never into the platform's bottom UI, and never moves a caption that
was clear of the face (above the head, or already below the chin)."""
from reelengine import captions

H = 1920


def _cues(*spans):
    return [{"s": s, "e": e, "t": "hello", "ids": [f"w{i}"]} for i, (s, e) in enumerate(spans)]


def _cy(report, i=0):
    x, y, w, h = report[i]["box"]
    return y + h / 2


# a close take: eyes at y 980, chin at y 1260 (the protected zone), like his framing
FACE = [(0.0, 10.0, 980, 1260)]


def test_a_caption_on_the_mouth_moves_to_just_under_the_chin():
    cap = {"style": {"position": 0.64, "size": 64}}   # 0.64 x 1920 = y 1229: on the mouth
    _, report, _, _ = captions.render_ass(_cues((1, 2)), cap, 1080, H, face_floors=FACE)
    x, y, w, h = report[0]["box"]
    assert y >= 1260, "the caption's top is below the chin"
    assert y <= 1260 + 0.05 * H, "and close under it, not far down the chest"
    assert y + h <= 0.80 * H, "above the platform's bottom UI"


def test_a_caption_clear_of_the_face_does_not_move():
    for pos in (0.30, 0.74):   # above the head; already under the chin
        cap = {"style": {"position": pos, "size": 64}}
        _, plain, _, _ = captions.render_ass(_cues((1, 2)), cap, 1080, H)
        _, faced, _, _ = captions.render_ass(_cues((1, 2)), cap, 1080, H, face_floors=FACE)
        assert _cy(faced) == _cy(plain)


def test_only_cues_while_the_face_is_there_move():
    cap = {"style": {"position": 0.64, "size": 64}}
    _, report, _, _ = captions.render_ass(_cues((1, 2), (12, 13)), cap, 1080, H, face_floors=FACE)
    assert _cy(report, 0) > _cy(report, 1)
    assert abs(_cy(report, 1) - 0.64 * H) <= 1   # the report box is rounded to whole pixels


def test_a_chin_too_low_to_fit_under_keeps_the_caption_above_the_bottom_ui():
    cap = {"style": {"position": 0.64, "size": 64}}
    _, report, _, _ = captions.render_ass(_cues((1, 2)), cap, 1080, H, face_floors=[(0, 10, 1100, 1500)])
    x, y, w, h = report[0]["box"]
    assert y + h <= 0.80 * H + 1


def test_a_split_view_span_wins_over_the_face_floor():
    cap = {"style": {"position": 0.64, "size": 64}}
    _, report, _, _ = captions.render_ass(_cues((1, 2)), cap, 1080, H, position_spans=[(0, 10, 0.5)], face_floors=FACE)
    assert _cy(report) == 0.5 * H
