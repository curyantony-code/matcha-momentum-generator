"""Key-word captions (the "Upscale" edit style): the editor's chosen word in each caption is set big in its own face
(a serif, italic), the rest stays small, and the line still fits the safe width with the bigger word in it."""
import re

from reelengine import captions

W, H = 1080, 1920
KEY = {"keyFont": "DM Serif Display", "keyScale": 1.8, "keyItalic": True}


def _cue(text, ids):
    return [{"s": 1.0, "e": 2.0, "t": text, "words": text.split(" "), "word_ids": [[i] for i in ids], "ids": ids}]


def _dialogue(ass):
    return [l for l in ass.splitlines() if l.startswith("Dialogue:")][0]


def test_the_key_word_is_big_serif_italic_and_the_rest_goes_back_to_small():
    cap = {"style": {"font": "Montserrat SemiBold", "size": 64, **KEY}, "emphasis": ["w2"]}
    ass, report, _, _ = captions.render_ass(_cue("your brain overanalyses", ["w1", "w2", "w3"]), cap, W, H)
    d = _dialogue(ass)
    fs = report[0]["size"]
    m = re.search(r"\{\\fnDM Serif Display\\fs(\d+)\\i1\}brain\{\\fnMontserrat SemiBold\\fs(\d+)\\i0\}", d)
    assert m, d
    assert int(m.group(1)) == round(fs * 1.8) and int(m.group(2)) == fs
    assert "your" in d and "overanalyses" in d


def test_without_a_key_style_nothing_changes():
    cap = {"style": {"font": "Montserrat SemiBold", "size": 64}, "emphasis": ["w2"]}
    ass, _, _, _ = captions.render_ass(_cue("your brain overanalyses", ["w1", "w2", "w3"]), cap, W, H)
    assert "\\fn" not in _dialogue(ass)


def test_a_line_with_a_big_key_word_still_fits_the_safe_width():
    cap = {"style": {"font": "Montserrat SemiBold", "size": 105, **KEY, "keyScale": 2.4}, "emphasis": ["w2"]}
    _, report, _, _ = captions.render_ass(_cue("stop overanalysing everything", ["w1", "w2", "w3"]), cap, W, H)
    safe = W - 2 * captions.MARGIN_FRAC * W
    assert report[0]["box"][2] <= safe + 2


def test_the_key_font_file_is_found_for_the_renderer_and_unknown_fonts_are_not():
    assert captions.key_font_path({"style": KEY}).name.lower().endswith((".ttf", ".otf"))
    assert captions.key_font_path({"style": {"keyFont": "No Such Face"}}) is None
    assert captions.key_font_path({"style": {}}) is None


def test_the_font_check_accepts_the_key_font_and_still_catches_a_swap():
    from pathlib import Path
    from reelengine import render
    main, key = Path("Figtree-SemiBold.ttf"), Path("DMSerifDisplay-Regular.ttf")
    log = ("[sub] fontselect: (Figtree SemiBold, 400, 0) -> Figtree-SemiBold, 0, Figtree-SemiBold\n"
           "[sub] fontselect: (DM Serif Display, 400, 100) -> DMSerifDisplay-Regular, 0, DMSerifDisplay-Regular\n")
    assert render.check_fontselect(log, main, key) is None
    assert render.check_fontselect(log, main) is not None          # without it, the serif is a stranger
    swapped = log + "[sub] fontselect: (DM Serif Display, 400, 100) -> Arial, 0, ArialMT\n"
    assert "Arial" in render.check_fontselect(swapped, main, key)
