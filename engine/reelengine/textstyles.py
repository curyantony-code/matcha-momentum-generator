"""OpenReel Video's text styles and four of its overlay templates, drawn with PIL (MIT, Augustus Otu and
Contributors: TEXT_STYLE_PRESETS in apps/web/src/components/editor/AssetsPanel.tsx, DEFAULT_TEXT_STYLE in
packages/core/src/text/types.ts, and the Subtitle Bar, Lower Third, Hashtag Strip and Facecam Frame recipes in
packages/core/src/editing-templates/built-in-templates.ts). Values are OpenReel's; only the drawing is ours.

Sizes are pixels on a 1080-wide frame, as in OpenReel. Two changes for a vertical reel read on a phone:
- no text is drawn smaller than MIN_TEXT_PX (OpenReel's "Caption" style is 24 px);
- the templates were laid out for a 1920 x 1080 landscape frame, so their sizes are scaled by TEMPLATE_SCALE,
  bars keep their share of the frame width, and anything OpenReel puts at the very bottom moves up into the
  area Instagram's buttons and caption leave free (SAFE_BOTTOM).
Facecam Frame becomes a frame around the speaker's face: in a talking-head reel, the face is the facecam.

Fonts are the files Matcha Momentum Generator ships (fonts/): OpenReel's default family, Inter, in the weight asked for
(800 and 900 use Inter Bold, the heaviest shipped), or one of the brand fonts by name. No italic file ships,
so "Quote" is slanted in software. Same text and style in, same image out.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from . import tools

MIN_TEXT_PX = 44
TEMPLATE_SCALE = 1.5
SAFE_BOTTOM = 0.84          # Instagram's caption and buttons cover the frame below about here
# where each bottom template sits (centre, fraction of frame height), in its own band so two used together
# never overlap: the hashtags lowest, the subtitle bar above them, the name card above that
BAND = {"hashtag-strip": SAFE_BOTTOM, "subtitle-bar": 0.785, "lower-third": 0.70}
SLANT = 0.2

INTER = {400: "Inter_400Regular.ttf", 500: "Inter_500Medium.ttf", 600: "Inter_600SemiBold.ttf", 700: "Inter_700Bold.ttf"}
FONTS = {
    "Inter": None,                                    # by weight, above
    "DM Serif Display": "DMSerifDisplay-Regular.ttf",
    "Anton": "Anton-Regular.ttf",
    "Caveat Bold": "Caveat-Bold.ttf",
    "Figtree SemiBold": "Figtree-SemiBold.ttf",
    "Figtree Bold": "Figtree-Bold.ttf",
    "Bricolage Grotesque Bold": "BricolageGrotesque-Bold.ttf",
    "Montserrat SemiBold": "Montserrat-SemiBold.ttf",
    "Roboto": "Roboto-Regular.ttf",
    "Roboto Medium": "Roboto-Medium.ttf",
}

# DEFAULT_TEXT_STYLE (OpenReel): Inter bold 48, white, stroke #111827 2, centred, line height 1.2
DEFAULT = {"size": 48, "weight": 700, "italic": False, "color": "#FFFFFF", "stroke": "#111827", "strokeWidth": 2,
           "align": "center", "lineHeight": 1.2, "letterSpacing": 0, "background": None, "shadow": None}

# TEXT_STYLE_PRESETS (OpenReel), merged over the default
TEXT_STYLES = {
    "heading": {"label": "Heading", "size": 72, "weight": 700},
    "subtitle": {"label": "Subtitle", "size": 36, "weight": 400},
    "lower-third": {"label": "Lower Third", "size": 32, "weight": 600, "align": "left", "background": "rgba(0,0,0,0.7)"},
    "caption": {"label": "Caption", "size": 24, "weight": 400, "shadow": ("rgba(0,0,0,0.8)", 4, 1, 1)},
    "hero": {"label": "Hero", "size": 112, "weight": 900, "letterSpacing": -2, "lineHeight": 0.95, "strokeWidth": 3},
    "quote": {"label": "Quote", "size": 54, "weight": 600, "italic": True, "lineHeight": 1.25,
              "shadow": ("rgba(0,0,0,0.65)", 10, 0, 4)},
    "outline": {"label": "Outline", "size": 80, "weight": 900, "letterSpacing": 2, "stroke": "#111827", "strokeWidth": 5},
    "badge": {"label": "Badge", "size": 28, "weight": 800, "letterSpacing": 3, "background": "rgba(17,24,39,0.88)"},
}

OVERLAYS = {
    "subtitle-bar": {"label": "Subtitle Bar", "text": "Your subtitle text here"},
    "lower-third": {"label": "Lower Third", "name": "Open Reel", "role": "Creator", "accent": "#7BF1A8"},
    "hashtag-strip": {"label": "Hashtag Strip", "text": "#openreel #editing #creative"},
    "facecam-frame": {"label": "Facecam Frame"},
}


def rgba(value, default=(255, 255, 255, 255)) -> tuple:
    """#RRGGBB, #RRGGBBAA or rgba(r,g,b,a) as an RGBA tuple; anything else is the default."""
    if not isinstance(value, str):
        return default
    v = value.strip()
    try:
        if v.startswith("#") and len(v) in (7, 9):
            n = [int(v[i:i + 2], 16) for i in range(1, len(v), 2)]
            return tuple(n + [255] * (4 - len(n)))
        if v.startswith("rgba(") and v.endswith(")"):
            r, g, b, a = (float(x) for x in v[5:-1].split(","))
            return (int(r), int(g), int(b), int(round(max(0.0, min(1.0, a)) * 255)))
    except ValueError:
        pass
    return default


def style_of(name: Optional[str], font: Optional[str] = None) -> dict:
    """A text style's full values (OpenReel default + preset), with an optional font from FONTS."""
    s = {**DEFAULT, **{k: v for k, v in TEXT_STYLES.get(name or "", {}).items() if k != "label"}}
    if font in FONTS:
        s["font"] = font
    return s


def font_file(style: dict) -> Optional[Path]:
    name = style.get("font") or "Inter"
    weight = int(style.get("weight") or 700)
    file = FONTS.get(name) or INTER[min(INTER, key=lambda w: (abs(w - min(weight, 700)), -w))]
    for d in tools.font_dirs():
        p = d / file
        if p.exists():
            return p
    return None


def _font(style: dict, px: int):
    from PIL import ImageFont
    f = font_file(style)
    return ImageFont.truetype(str(f), max(1, px)) if f else ImageFont.load_default(size=max(1, px))


def _line_width(d, text: str, font, spacing: float) -> float:
    return d.textlength(text, font=font) + spacing * max(0, len(text) - 1)


def _draw_line(d, x: float, y: float, text: str, font, spacing: float, **kw) -> None:
    if not spacing:
        d.text((x, y), text, font=font, **kw)
        return
    for ch in text:                       # letter spacing: OpenReel's px between letters
        d.text((x, y), ch, font=font, **kw)
        x += d.textlength(ch, font=font) + spacing


def draw_text(text: str, style: dict, max_w: int, scale: float = 1.0):
    """(RGBA image, fits) for `text` in `style`, wrapped to max_w. scale multiplies every size."""
    from PIL import Image, ImageDraw, ImageFilter
    px = max(MIN_TEXT_PX, int(round(float(style["size"]) * scale)))
    k = px / float(style["size"])                      # every other size follows the text size
    font = _font(style, px)
    spacing = float(style.get("letterSpacing") or 0) * k
    stroke = int(round(float(style.get("strokeWidth") or 0) * k))
    probe = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    bg = rgba(style.get("background"), None) if style.get("background") else None
    pad_x, pad_y = (int(px * 0.42), int(px * 0.26)) if bg else (stroke + 2, stroke + 2)
    inner = max(1, max_w - 2 * pad_x)
    lines, cur = [], ""
    for word in text.split():
        t = f"{cur} {word}".strip()
        if _line_width(probe, t, font, spacing) + 2 * stroke <= inner or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = word
    lines += [cur] if cur else []
    lh = int(round(px * float(style.get("lineHeight") or 1.2)))
    widths = [int(_line_width(probe, ln, font, spacing)) + 2 * stroke for ln in lines] or [1]
    w = max(widths) + 2 * pad_x
    h = lh * len(lines) + 2 * pad_y + int(px * 0.2)
    shadow = style.get("shadow")
    margin = int((shadow[1] + max(abs(shadow[2]), abs(shadow[3]))) * k * 2) if shadow else 0
    img = Image.new("RGBA", (w + 2 * margin, h + 2 * margin), (0, 0, 0, 0))
    if bg:
        ImageDraw.Draw(img).rounded_rectangle((margin, margin, margin + w - 1, margin + h - 1),
                                              radius=max(4, int(px * 0.18)), fill=bg)

    def text_layer(fill, with_stroke: bool):
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        y = margin + pad_y
        for ln, lw in zip(lines, widths):
            x = margin + pad_x + (0 if style.get("align") == "left" else (w - 2 * pad_x - lw) / 2)
            kw = {"fill": fill}
            if with_stroke and stroke:
                kw.update(stroke_width=stroke, stroke_fill=rgba(style.get("stroke"), (17, 24, 39, 255)))
            _draw_line(d, x + stroke, y, ln, font, spacing, **kw)
            y += lh
        return layer
    if shadow:
        colour, blur, dx, dy = shadow
        sh = text_layer(rgba(colour, (0, 0, 0, 200)), False)
        sh = sh.filter(ImageFilter.GaussianBlur(max(0.1, float(blur) * k / 2)))
        img.alpha_composite(sh, (int(round(dx * k)), int(round(dy * k))))
    img.alpha_composite(text_layer(rgba(style.get("color")), True))
    if style.get("italic"):                            # no italic file ships: slant it
        extra = int(img.height * SLANT)
        wide = Image.new("RGBA", (img.width + extra, img.height), (0, 0, 0, 0))
        wide.paste(img, (0, 0))
        img = wide.transform(wide.size, Image.AFFINE, (1, SLANT, -extra, 0, 1, 0), resample=Image.BICUBIC)
    return img, max(widths) <= inner


# --- overlay templates ---------------------------------------------------------------------------

def _bar(w: int, h: int, fill, radius: int = 0, stroke=None, stroke_w: int = 0):
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=fill,
                                          outline=stroke, width=stroke_w if stroke else 0)
    return img


def overlay(template: str, params: dict, W: int, H: int, face: Optional[tuple]):
    """(RGBA image, x, y) for one overlay template on a W x H frame, or None for an unknown template."""
    s = TEMPLATE_SCALE * W / 1080.0
    p = {**OVERLAYS.get(template, {}), **{k: v for k, v in params.items() if v not in (None, "")}}
    if template == "subtitle-bar":
        txt, _ = draw_text(str(p["text"]), {**DEFAULT, "size": 28, "weight": 600, "stroke": None, "strokeWidth": 0,
                                            "lineHeight": 1.1}, int(W * 0.69), s)
        w = int(W * 1400 / 1920)
        h = max(int(64 * s), txt.height + int(20 * s))
        img = _bar(w, h, rgba("rgba(0,0,0,0.7)"), int(12 * s))
        img.alpha_composite(txt, ((w - txt.width) // 2, (h - txt.height) // 2))
        return img, (W - w) // 2, int(BAND["subtitle-bar"] * H - h / 2)
    if template == "hashtag-strip":
        txt, _ = draw_text(str(p["text"]), {**DEFAULT, "size": 18, "weight": 600, "stroke": None, "strokeWidth": 0,
                                            "color": "rgba(255,255,255,0.9)", "letterSpacing": 0.5, "lineHeight": 1.0},
                           int(W * 0.94), s)
        h = max(int(56 * s), txt.height + int(16 * s))
        img = _bar(W, h, rgba("rgba(0,0,0,0.6)"))
        img.alpha_composite(txt, ((W - txt.width) // 2, (h - txt.height) // 2))
        return img, 0, int(min(BAND["hashtag-strip"] * H, SAFE_BOTTOM * H + h / 2) - h / 2)
    if template == "lower-third":
        name, _ = draw_text(str(p["name"]), {**DEFAULT, "size": 34, "weight": 800, "stroke": None, "strokeWidth": 0,
                                             "align": "left", "lineHeight": 1.1}, int(W * 0.62), s)
        role, _ = draw_text(str(p["role"]), {**DEFAULT, "size": 22, "weight": 500, "stroke": None, "strokeWidth": 0,
                                             "color": "rgba(255,255,255,0.72)", "align": "left", "lineHeight": 1.1},
                            int(W * 0.62), s)
        w = max(int(520 * s), max(name.width, role.width) + int(40 * s))
        w = min(w, int(W * 0.9))
        h = max(int(124 * s), name.height + role.height + int(24 * s))
        accent = rgba(p.get("accent"), (123, 241, 168, 255))
        img = _bar(w, h, rgba("rgba(7,7,10,0.76)"), int(18 * s), accent, max(1, int(4 * s)))
        top = (h - name.height - role.height) // 2
        img.alpha_composite(name, (int(18 * s), top))
        img.alpha_composite(role, (int(18 * s), top + name.height))
        return img, int(W * 0.06), int(BAND["lower-third"] * H - h / 2)
    if template == "facecam-frame":
        fx, fy, fw, fh = face if face else (W * 0.2, H * 0.3, W * 0.6, H * 0.35)
        grow = 0.18
        x0, y0 = max(0, int(fx - fw * grow)), max(0, int(fy - fh * grow))
        x1, y1 = min(W, int(fx + fw * (1 + grow))), min(H, int(fy + fh * (1 + grow)))
        img = _bar(max(2, x1 - x0), max(2, y1 - y0), None, int(22 * s), rgba("rgba(255,255,255,0.9)"),
                   max(1, int(6 * s)))
        return img, x0, y0
    return None
