"""The fonts picked for the brand (DM Serif Display, Anton, Caveat Bold, Figtree, Bricolage Grotesque) render as
themselves through libass.

Each is resolved by the name the app offers, copied alone into a fonts dir (as the render does), burned with
the subtitles filter, and libass' own "fontselect" log line must name that file: a silent substitution fails.
"""
import shutil
import subprocess

import pytest

from reelengine import captions, render, tools

BRAND_FONTS = ["DM Serif Display", "Anton", "Caveat Bold", "Montserrat SemiBold", "Figtree SemiBold", "Figtree Bold",
               "Bricolage Grotesque Bold"]

ASS = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,{font},96,&H00FFFFFF,&H00000000,&H00000000,0,0,1,4,0,2,40,40,200

[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0:00:00.00,0:00:01.00,Default,That's me, briefly
"""


@pytest.mark.parametrize("name", BRAND_FONTS)
def test_brand_font_renders_as_itself(name, tmp_path):
    family, path, metrics, warning = captions.resolve_font(name)
    assert warning is None, warning
    assert metrics["upem"] > 0
    fonts = tmp_path / "fonts"
    fonts.mkdir()
    shutil.copy(path, fonts / path.name)
    (tmp_path / "t.ass").write_text(ASS.format(font=family), encoding="utf-8")
    r = subprocess.run([tools.ffmpeg(), "-hide_banner", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:d=1",
                        "-vf", "subtitles=filename=t.ass:fontsdir=fonts", "-frames:v", "1", "-f", "null", "-"],
                       capture_output=True, text=True, cwd=tmp_path)
    assert r.returncode == 0, r.stderr[-600:]
    assert "fontselect:" in r.stderr, "libass did not say which font it used"
    assert render.check_fontselect(r.stderr, path) is None, r.stderr[-600:]
