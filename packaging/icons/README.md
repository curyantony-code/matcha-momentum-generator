# Matcha Momentum Generator icons

A clear glass mug of bright matcha on a deep green squircle tile; the matcha swirls up out of the mug and shapes
itself into a glossy play button: tea that becomes video. The artwork was made with Adobe Firefly
(`logo-source.png`, the master). The mac icon follows the Big Sur+ grid (1024 canvas, 824 px tile); the Windows
`.ico` lets the tile fill more of the square so it holds up at taskbar sizes.

Files: `logo-source.png` (master), `icon.png` (1024), `icon.icns` (16-1024 including @2x), `icon.ico` (16, 24, 32,
48, 64, 128, 256), and the sidebar mark `app/src/renderer/src/assets/logo-mark.png` (64). To regenerate after
changing the artwork: `python -m venv .venv`, `.venv/bin/pip install pillow`, then
`.venv/bin/python packaging/icons/build_icons.py` (set TILE_BOX and RADIUS in it to the new tile). It also writes a
throwaway `_preview/` folder (gitignored) with 64/32/16 px renders to check.
