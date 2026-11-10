"""Caption defaults = the proven default look (grandma test: captions were small, grey and on the chest)."""
from reelengine import captions, project


def _style_line(ass: str) -> list:
    line = next(l for l in ass.splitlines() if l.startswith("Style: Cap,"))
    return line[len("Style: "):].split(",")


def _cue():
    return [{"s": 0.0, "e": 1.0, "t": "HELLO THERE", "ids": ["w0"]}]


def test_new_project_defaults_are_the_proven_look():
    st = project.new_project("t")["captions"]["style"]
    assert st["font"] == "Montserrat SemiBold"
    assert st["size"] == 105 and st["maxWords"] == 3
    assert st["color"] == "#FFFFFF" and st["outlineColor"] == "#000000"
    assert st["outline"] == 8 and st["shadow"] == 0
    assert st["position"] == 0.75   # line centre y 1440 -> bottom ~1495, the 425 px margin


def test_default_render_is_solid_outline_no_grey_shadow():
    ass, report, _, _ = captions.render_ass(_cue(), {}, 1080, 1920)
    f = _style_line(ass)
    assert f[2] == "105"
    assert f[6] == "&H00000000"            # BackColour opaque, not &H80 (grey see-through)
    assert f[15] == "1" and float(f[16]) == 8.0 and float(f[17]) == 0.0
    x, y, w, h = report[0]["box"]
    assert abs((y + h / 2) - 1440) <= 2   # centred at 0.75 of 1920
    assert y + h <= 1920 - 415            # bottom clears the 425 px margin (+ outline)


def test_wide_frame_sizes_by_height_and_sits_on_the_subtitle_line():
    """A 16:9 frame is not a taller phone: 105 px would be 187 px if scaled by width."""
    ass, report, _, _ = captions.render_ass(_cue(), {}, 1920, 1080)
    assert float(_style_line(ass)[2]) == round(105 * captions.WIDE_SCALE)
    x, y, w, h = report[0]["box"]
    assert abs((y + h / 2) - 1080 * captions.WIDE_POSITION) <= 2


def test_wide_frame_keeps_a_centred_or_top_line_where_it_is():
    for pos in (0.5, 0.18):
        _, report, _, _ = captions.render_ass(_cue(), {"style": {"position": pos}}, 1920, 1080)
        x, y, w, h = report[0]["box"]
        assert abs((y + h / 2) - 1080 * pos) <= 2


def test_box_style_draws_an_opaque_box():
    ass, _, _, _ = captions.render_ass(_cue(), {"style": {"box": True}}, 1080, 1920)
    f = _style_line(ass)
    assert f[15] == "3"                    # BorderStyle 3 = opaque box in the outline colour
    assert float(f[16]) >= captions.BOX_PAD and float(f[17]) == 0.0


def test_numbers_and_chosen_words_are_drawn_in_the_emphasis_colour():
    cue = [{"s": 0.0, "e": 1.0, "t": "only $0 and zero salary", "ids": ["w0", "w1", "w2", "w3", "w4"],
            "words": [{"id": "w0", "w": "only"}, {"id": "w1", "w": "$0"}, {"id": "w2", "w": "and"},
                      {"id": "w3", "w": "zero"}, {"id": "w4", "w": "salary"}]}]
    style = {"style": {"color": "#F6F3F8", "emphasisColor": "#F58D3D"}, "emphasis": ["w4"]}
    ass, _, _, _ = captions.render_ass(cue, style, 1080, 1920)
    line = next(l for l in ass.splitlines() if l.startswith("Dialogue:"))
    on, off = captions.ass_color("#F58D3D"), captions.ass_color("#F6F3F8")
    assert f"{{\\1c{on}}}$0{{\\1c{off}}}" in line            # a number, on its own
    assert f"{{\\1c{on}}}salary{{\\1c{off}}}" in line        # the word the editor chose
    assert f"{{\\1c{on}}}only" not in line and f"{{\\1c{on}}}zero" not in line


def test_no_emphasis_colour_means_plain_captions():
    ass, _, _, _ = captions.render_ass(_cue(), {"emphasis": ["w0"]}, 1080, 1920)
    assert "\\1c" not in next(l for l in ass.splitlines() if l.startswith("Dialogue:"))


def test_emphasis_works_on_cues_built_from_real_words():
    # Regression: build_cues gives words as plain strings; render_ass crashed on w.get().
    words = [{"s": i * 0.3, "e": i * 0.3 + 0.25, "w": w, "id": f"w{i}"}
             for i, w in enumerate(["I", "quit", "my", "salary", "today"])]
    cap = {"style": {"color": "#F6F3F8", "emphasisColor": "#F58D3D", "case": "as-is"}, "emphasis": ["w3"]}
    cues = captions.build_cues(words, cap)
    ass, _, _, _ = captions.render_ass(cues, cap, 1080, 1920)
    on = captions.ass_color("#F58D3D")
    text = "\n".join(l for l in ass.splitlines() if l.startswith("Dialogue:"))
    assert f"{{\\1c{on}}}salary" in text
    assert f"{{\\1c{on}}}quit" not in text
