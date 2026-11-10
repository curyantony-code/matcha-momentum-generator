#!/usr/bin/env python3
"""Regenerate every Matcha Momentum Generator icon file from the logo artwork.

    python -m venv .venv && .venv/bin/pip install pillow
    .venv/bin/python packaging/icons/build_icons.py

The master is logo-source.png: the rounded tile (a glass mug of matcha, its liquid shaping a play button) on a flat
background. This cuts the tile out along its rounded outline (smoothed, inset 2 px so no background is left at the
edge) and writes icon.png (1024), icon.icns (16-1024, with @2x) and icon.ico (16-256) next to this file, the
sidebar mark (app/src/renderer/src/assets/logo-mark.png), plus a
throwaway _preview/ folder (gitignored) with 64/32/16 px renders to check. Replacing the artwork: put the new file
in as logo-source.png and set TILE_BOX and RADIUS to its tile (the pixel box and the corner radius).
"""
import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent
SOURCE = OUT / "logo-source.png"
TILE_BOX = (460, 173, 1857, 1590)   # left, top, right, bottom of the tile in logo-source.png
RADIUS = 316                        # its corner radius, in source pixels
INSET = 2                           # cut this far inside the outline: no background halo


def tile() -> Image.Image:
    src = Image.open(SOURCE).convert("RGBA")
    t = src.crop(TILE_BOX)
    w, h = t.size
    s = 4  # draw the outline 4x larger, then shrink it, for smooth edges
    mask = Image.new("L", (w * s, h * s), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (INSET * s, INSET * s, (w - INSET) * s - 1, (h - INSET) * s - 1), radius=(RADIUS - INSET) * s, fill=255)
    t.putalpha(mask.resize((w, h), Image.LANCZOS))
    return t


def place(t: Image.Image, canvas: int, width: int) -> Image.Image:
    """The tile `width` wide, centred on a transparent square `canvas`."""
    scaled = t.resize((width, round(t.height * width / t.width)), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(scaled, ((canvas - width) // 2, (canvas - scaled.height) // 2), scaled)
    return out


def write_icns(path: Path, master: Image.Image) -> None:
    """Hand-built .icns from PNG chunks (Pillow's writer is lossy about @2x slots)."""
    slots = [(b"icp4", 16), (b"icp5", 32), (b"icp6", 64), (b"ic07", 128), (b"ic08", 256),
             (b"ic09", 512), (b"ic10", 1024), (b"ic11", 32), (b"ic12", 64), (b"ic13", 256), (b"ic14", 512)]
    body = b""
    for tag, px in slots:
        buf = io.BytesIO()
        master.resize((px, px), Image.LANCZOS).save(buf, "PNG")
        data = buf.getvalue()
        body += tag + struct.pack(">I", len(data) + 8) + data
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    t = tile()
    # macOS: Apple's grid, a 1024 canvas with the tile 824 wide
    mac = place(t, 1024, 824)
    mac.save(OUT / "icon.png")
    write_icns(OUT / "icon.icns", mac)
    # Windows: the tile fills more of the square, so the tiny taskbar sizes stay readable
    win = place(t, 1024, 960)
    sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [win.resize((s, s), Image.LANCZOS) for s in sizes]
    imgs[-1].save(OUT / "icon.ico", format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[:-1])

    # the sidebar's mark beside the app name: the tile alone, 64 px (sharp at 28 px on a Retina screen)
    mark = place(t, 64, 64)
    mark.save(OUT.parent.parent / "app" / "src" / "renderer" / "src" / "assets" / "logo-mark.png", optimize=True)

    prev = OUT / "_preview"
    prev.mkdir(exist_ok=True)
    sheet = Image.new("RGBA", (900, 300), "#f3f4f2")
    x = 20
    for s in (16, 32, 64):
        for im in (mac, win):
            small = im.resize((s, s), Image.LANCZOS)
            small.save(prev / f"{'mac' if im is mac else 'win'}-{s}.png")
            big = small.resize((s * 4, s * 4), Image.NEAREST)
            sheet.paste(big, (x, 20), big)
            x += s * 4 + 20
    sheet.save(prev / "sheet.png")


if __name__ == "__main__":
    main()
