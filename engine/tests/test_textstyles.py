"""OpenReel's 8 text styles and 4 overlay templates (textstyles.py), and their use as picture items."""
import json
import subprocess

import pytest

from reelengine import capcut, init as initmod, project as projmod, textstyles, tools

W, H = 1080, 1920


def test_the_eight_text_styles_keep_openreels_values_over_its_default():
    assert list(textstyles.TEXT_STYLES) == ["heading", "subtitle", "lower-third", "caption", "hero", "quote", "outline", "badge"]
    hero = textstyles.style_of("hero")
    assert (hero["size"], hero["weight"], hero["letterSpacing"], hero["lineHeight"], hero["strokeWidth"]) == (112, 900, -2, 0.95, 3)
    assert hero["color"] == "#FFFFFF" and hero["stroke"] == "#111827"          # from OpenReel's default
    assert textstyles.style_of("lower-third")["background"] == "rgba(0,0,0,0.7)"
    assert textstyles.style_of("nope") == {**textstyles.DEFAULT}


def test_a_brand_font_can_replace_inter_and_an_unknown_one_cannot():
    assert textstyles.font_file(textstyles.style_of("quote", "DM Serif Display")).name == "DMSerifDisplay-Regular.ttf"
    assert textstyles.font_file(textstyles.style_of("outline", "Anton")).name == "Anton-Regular.ttf"
    assert textstyles.font_file(textstyles.style_of("hero", "Comic Sans")).name == "Inter_700Bold.ttf"   # 900 -> heaviest shipped
    assert textstyles.font_file(textstyles.style_of("subtitle")).name == "Inter_400Regular.ttf"


def test_colours_read_like_openreels():
    assert textstyles.rgba("rgba(0,0,0,0.7)") == (0, 0, 0, 178)
    assert textstyles.rgba("#F58D3D") == (245, 141, 61, 255)
    assert textstyles.rgba("red", (1, 2, 3, 4)) == (1, 2, 3, 4)


def test_no_text_is_drawn_too_small_to_read_on_a_phone():
    img, ok = textstyles.draw_text("Caption text here", textstyles.style_of("caption"), 900)
    assert ok and img.height >= textstyles.MIN_TEXT_PX


def test_quote_is_slanted_and_badge_sits_on_its_box():
    plain, _ = textstyles.draw_text("Tell a better story", {**textstyles.style_of("quote"), "italic": False}, 900)
    slanted, _ = textstyles.draw_text("Tell a better story", textstyles.style_of("quote"), 900)
    assert slanted.width > plain.width
    badge, _ = textstyles.draw_text("NEW RELEASE", textstyles.style_of("badge"), 900)
    assert badge.getpixel((3, badge.height // 2))[3] > 200                     # the box reaches the edge


@pytest.mark.parametrize("template", ["subtitle-bar", "lower-third", "hashtag-strip"])
def test_bottom_overlays_stay_above_instagrams_buttons(template):
    img, x, y = textstyles.overlay(template, {}, W, H, None)
    assert 0 <= x and x + img.width <= W
    assert y + img.height <= textstyles.SAFE_BOTTOM * H + img.height / 2 + 1


def test_bottom_overlays_never_overlap_each_other():
    boxes = []
    for t in ("lower-third", "subtitle-bar", "hashtag-strip"):
        img, x, y = textstyles.overlay(t, {}, W, H, None)
        boxes.append((y, y + img.height))
    boxes.sort()
    assert all(a[1] <= b[0] for a, b in zip(boxes, boxes[1:]))


def test_facecam_frame_goes_around_the_face():
    face = (300, 700, 400, 500)
    img, x, y = textstyles.overlay("facecam-frame", {}, W, H, face)
    assert x < 300 and y < 700 and x + img.width > 700 and y + img.height > 1200
    assert textstyles.overlay("rainbow", {}, W, H, face) is None


@pytest.fixture
def project(tmp_path):
    video = tmp_path / "take.mp4"
    subprocess.run([tools.ffmpeg(), "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc2=s=540x960:r=30:d=4", "-f", "lavfi", "-i", "sine=frequency=440:d=4",
                    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
                    str(video)], check=True)
    proj_dir = tmp_path / "talk"
    initmod.run(proj_dir, "Talk", [video])
    words = [{"id": f"w{i}", "source": "s1", "s": i * 0.5 + 0.2, "e": i * 0.5 + 0.6, "w": f"word{i}"} for i in range(6)]
    (proj_dir / "work" / "transcript.json").write_text(json.dumps({"words": words, "segments": [], "nextId": 6}))
    proj = projmod.load(proj_dir)
    proj["cut"]["keep"] = [{"from": "w0", "to": "w5"}]
    proj["captions"]["enabled"] = False
    proj["broll"] = [
        {"id": "t1", "anchor": {"from": "w0", "to": "w2"}, "treatment": "text-pop",
         "params": {"text": "Nobody is just a job title", "textStyle": "quote", "font": "DM Serif Display"}},
        {"id": "o1", "anchor": {"from": "w3", "to": "w5"}, "treatment": "overlay",
         "params": {"template": "lower-third", "name": "Sam Rivera", "role": "Host", "accent": "#F58D3D"}},
    ]
    projmod.save(proj_dir, proj)
    return proj_dir


def test_a_styled_text_card_and_an_overlay_render_in_a_real_video(project, tmp_path):
    out = capcut.run(project, tmp_path / "out")
    assert (tmp_path / "out" / "video.mp4").exists() and out["video"]
    rows = {r["id"]: r for r in json.loads((project / "work" / "layers" / "layers.json").read_text())["items"]}
    assert rows["t1"].get("textStyle") == "quote" and rows["t1"]["text"] == "Nobody is just a job title"
    assert rows["o1"].get("template") == "lower-third" and rows["o1"]["zone"] == "overlay"
