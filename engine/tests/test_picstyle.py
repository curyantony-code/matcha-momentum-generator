"""Picture style: one look for every still picture card (look.pictureStyle), a picture's own params still win."""
from types import SimpleNamespace

import pytest
from PIL import Image

from reelengine import broll, picstyle

W, H = 1080, 1920
ZONE = {"x": 60, "y": 150, "w": 960, "h": 640, "zone": "above-face"}
FACE = (360, 820, 380, 480)


def ctx(look=None):
    return SimpleNamespace(fmt={"width": W, "height": H, "fps": 30}, project={"look": look or {}})


def test_no_style_leaves_every_card_as_it_was():
    for look in (None, {}, {"pictureStyle": "as-is"}, {"pictureStyle": "polaroid"}):
        assert picstyle.params_for(look, "card-above-head", 0) == {}
    d = broll.treatment_defaults("card-above-head")
    assert broll.item_params(ctx(), "card-above-head", 0, {}) == {**d, "scale": d["scale"] * broll.PICTURE_SIZE}


def test_only_still_cards_are_styled():
    for t in ("full-frame", "phone-card", "text-pop", "post-wall", "icon-wall", "split-top", "animation"):
        assert picstyle.params_for({"pictureStyle": "rounded"}, t, 0) == {}
    assert picstyle.params_for({"pictureStyle": "rounded"}, "side-card", 0)["radius"] == 0.045


def test_style_sits_between_the_defaults_and_the_picture_own_params():
    c = ctx({"pictureStyle": "rounded"})
    p = broll.item_params(c, "card-above-head", 0, {})
    assert (p["tilt"], p["radius"], p["shadow"]) == (0.0, 0.045, True)
    assert p["maxWidth"] == broll.treatment_defaults("card-above-head")["maxWidth"]   # untouched default kept
    own = broll.item_params(c, "card-above-head", 0, {"params": {"tilt": -4.0}})
    assert own["tilt"] == -4.0 and own["radius"] == 0.045


def test_notebook_tilts_left_and_right_in_turn_and_takes_the_border_colour():
    look = {"pictureStyle": "notebook", "pictureColor": "#f58d3d"}
    tilts = [picstyle.params_for(look, "card-above-head", i)["tilt"] for i in range(4)]
    assert tilts == [-picstyle.NOTEBOOK_TILT, picstyle.NOTEBOOK_TILT] * 2
    assert picstyle.params_for(look, "card-above-head", 0)["borderColor"] == "#F58D3D"
    assert picstyle.params_for({"pictureStyle": "notebook", "pictureColor": "red"}, "card-above-head", 0)["borderColor"] == "#F6F3F8"


def test_a_bad_border_colour_falls_back_to_white():
    assert broll._border({"border": 0.01, "borderColor": "url(x)"}) == {"border_frac": 0.01, "border_color": "#FFFFFF"}
    assert broll._border({}) == {"border_frac": 0.0, "border_color": "#FFFFFF"}


def _card(look, index=0, pic=None):
    params = broll.item_params(ctx(look), "card-above-head", index, {})
    st = {"image": pic or Image.new("RGBA", (800, 600), (40, 90, 160, 255)), "cutout": False}
    return broll._card_layout(ctx(look), st, ZONE, float(params["tilt"]), float(params["scale"]),
                              float(params["maxWidth"]), FACE, float(params["radius"]),
                              shadow=bool(params.get("shadow", True)), low=True, **broll._border(params))


@pytest.mark.parametrize("style", ["as-is", "rounded", "notebook", "outline"])
def test_every_style_fits_the_room_a_card_has(style):
    canvas, x, y, (cw, ch) = _card({"pictureStyle": style})
    room = broll.shadow_zone(ZONE, W, H, broll._shadow_pad(0, W) if style != "outline" else 2)
    assert room["x"] <= x and x + canvas.width <= room["x"] + room["w"] + 1
    assert room["y"] <= y and y + canvas.height <= room["y"] + room["h"] + 1
    assert cw > 0.5 * W * broll.PICTURE_SIZE  # still big enough to read, at the default picture size


def test_a_notebook_card_has_its_paper_border_around_the_picture():
    canvas, *_ = _card({"pictureStyle": "notebook", "pictureColor": "#F6F3F8"}, index=1)
    px = canvas.convert("RGB").getpixel((canvas.width // 2, canvas.height // 2))
    assert px == (40, 90, 160)                 # the picture in the middle
    row = [canvas.getpixel((x, canvas.height // 2)) for x in range(canvas.width)]
    paper = [p for p in row if p[3] == 255 and abs(p[0] - 0xF6) < 6 and abs(p[1] - 0xF3) < 6 and abs(p[2] - 0xF8) < 6]
    assert len(paper) >= 2 * int(0.016 * W) * 0.8     # a border on both sides of the row


def test_rounded_cards_are_level_and_outline_cards_have_no_shadow():
    canvas, *_ = _card({"pictureStyle": "rounded"})
    alpha = canvas.getchannel("A")
    assert alpha.getbbox()                                  # drawn
    flat, *_ = _card({"pictureStyle": "outline"})
    a = flat.getchannel("A")
    semi = sum(1 for v in a.get_flattened_data() if 0 < v < 200)
    assert semi < 0.02 * flat.width * flat.height           # no soft shadow halo
