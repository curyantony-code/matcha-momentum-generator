"""Picture style: one look for every still picture card in a video (`look.pictureStyle`).

A style is a set of card params (tilt, corner radius, shadow, border) merged OVER a treatment's defaults
and UNDER each picture's own params, so a picture the person or the AI changed by hand keeps that change.
Only still cards are styled (card-above-head and side-card); full-frame pictures, phones, walls, text
pops, animations and moving video cards are left as they are.

Same project in, same video out: every style is a fixed table, and the notebook's alternating tilt is
decided by the picture's place in the video.
"""
from __future__ import annotations

import re
from typing import Optional

STYLED = ("card-above-head", "side-card")
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")

# radius and border are fractions of the frame width, like the treatments' own params
STYLES: dict = {
    "as-is": {},
    # a printed photo on a paper mount: thin paper border, square-ish corners, soft shadow, a hand-placed
    # tilt that alternates left and right from one picture to the next
    "notebook": {"radius": 0.004, "shadow": True, "border": 0.016, "borderColor": "#F6F3F8", "tilt": "alternate"},
    # clean and modern: level, generous rounded corners, soft shadow
    "rounded": {"tilt": 0.0, "radius": 0.045, "shadow": True, "border": 0.0},
    # flat: level, small corners, a thin coloured line, no shadow
    "outline": {"tilt": 0.0, "radius": 0.018, "shadow": False, "border": 0.006, "borderColor": "#FFFFFF"},
}
NOTEBOOK_TILT = 2.5


def style_name(look: Optional[dict]) -> str:
    name = (look or {}).get("pictureStyle")
    return name if isinstance(name, str) and name in STYLES else "as-is"


def params_for(look: Optional[dict], treatment: str, index: int) -> dict:
    """The style's card params for the `index`-th picture of the video ({} when unstyled)."""
    if treatment not in STYLED:
        return {}
    style = dict(STYLES[style_name(look)])
    if not style:
        return {}
    if style.get("tilt") == "alternate":
        style["tilt"] = -NOTEBOOK_TILT if index % 2 == 0 else NOTEBOOK_TILT
    colour = (look or {}).get("pictureColor")
    if "borderColor" in style and isinstance(colour, str) and HEX.match(colour):
        style["borderColor"] = colour.upper()
    return style
