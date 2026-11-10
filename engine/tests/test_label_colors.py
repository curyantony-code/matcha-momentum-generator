"""A text-pop label in the person's card colours (their rule: "Aubergine card, Pearl words"), else the hand-edit
look: dark words on a white box. A colour that is not #RRGGBB is never used."""
from reelengine import broll


def test_label_colors_come_from_the_params_when_they_are_hex():
    assert broll.label_colors({"fill": "#1E1524", "ink": "#F6F3F8"}) == ("#1E1524", "#F6F3F8")


def test_label_colors_default_to_a_white_box_and_dark_words():
    assert broll.label_colors({}) == ("#FFFFFF", "#111111")


def test_a_colour_that_is_not_hex_is_ignored():
    assert broll.label_colors({"fill": "aubergine", "ink": "#F6F3F8; drop"}) == ("#FFFFFF", "#111111")
    assert broll.label_colors({"fill": "#1e1524"}) == ("#1E1524", "#111111")


def test_the_label_is_drawn_in_those_colours():
    img, ok = broll._label_image("Freestyle more", 900, 80, 1080, fill="#1E1524", ink="#F6F3F8")
    assert ok
    px = img.convert("RGBA").getpixel((6, img.height // 2))
    assert px[:3] == (0x1E, 0x15, 0x24)


MINE = {"style": {"preset": "mine", "color": "#F6F3F8", "outlineColor": "#1E1524"}}


def test_with_their_own_caption_look_the_label_takes_its_colours():
    # their look: Pearl words, an Aubergine outline -> an Aubergine box with Pearl words, like their cards
    assert broll.label_colors({}, MINE) == ("#1E1524", "#F6F3F8")


def test_colours_the_editor_chose_win_over_the_look():
    assert broll.label_colors({"fill": "#000000", "ink": "#FFFFFF"}, MINE) == ("#000000", "#FFFFFF")


def test_a_default_caption_look_keeps_the_white_label():
    assert broll.label_colors({}, {"style": {"color": "#FFFFFF", "outlineColor": "#000000"}}) == ("#FFFFFF", "#111111")
    assert broll.label_colors({}, {"style": {"preset": "mine", "color": "pearl"}}) == ("#FFFFFF", "#111111")
