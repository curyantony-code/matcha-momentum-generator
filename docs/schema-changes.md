# project.json schema changes

All additive (optional fields only), per docs/architecture.md section 3. Schema: `engine/reelengine/schema/project.schema.json`.

## 2026-10-17 (engine-core, A1)

- `sources[].rotation`: defined as the CLOCKWISE degrees (0/90/180/270) the stored picture must be turned
  to display upright. An upright iPhone portrait MOV stored as 1920x1080 has `rotation: 90`.
- `sources[].originalName` (string), `sources[].hdr` (bool): optional, written by `init`.
- `transcript.model` (string): which speech model produced the transcript.
- `cut.source` (string): who wrote the cut (`autocut` | `ai` | `user`).
- `captions.style.outlineColor` (`#RRGGBB`), `captions.style.shadow` (number): optional style knobs.
- `captions.style.size` is in 1080-wide units (scaled for other widths).
- `captions.hidden`: optional list of word-id ranges whose captions are suppressed (e.g. under a
  full-frame card).
- `transcript.json` words may carry `ws`/`we` (whisper's raw times), `p` (probability) and `gaps`
  (silent runs inside the word). `s`/`e` are the MEASURED edges every module should use.
  It also has `segments[{source,s,e,text,from,to}]` and `nextId`.
- Unknown extra fields anywhere are allowed (the schema does not set `additionalProperties: false`).

## 2026-10-20 (0.1.2 F2, note attachments)

- `notes[].attachments` (array of project-relative paths, at most 4): the files the user attached to that
  note, each a `work/assets/attach-<8 hex>-<stem>.<ext>` written by engine `attach`, with a sidecar
  `<asset>.attach.json` next to it (`asset`, `name`, `kind` image|video, `bytes`, `width`, `height`,
  `duration`, `hasAudio`, `fromGif`, `thumb`, `createdAt`). The sidecar is not part of project.json. A note
  may have empty `text` when it has attachments.

## 2026-10-20 (mirror)

- `sources[].mirror` (boolean, absent = false): the take is mirrored (a front-camera selfie: posters, shirts and
  signs read backwards), so the engine flips the picture left to right. The flip is the LAST step of the face
  picture's chain (after crop, scale and the upright turn) in both the software and the CUDA draft path, so the
  crop window is the same and the output is its mirror image. B-roll, zooms and captions are drawn on top and are
  never flipped; every reader of the face box in output pixels mirrors x (`x' = W - x - w`). Written by the AI's
  `set_mirror` tool and by the "Flip picture (it's mirrored)" toggle in "Edit it myself"; turning it off removes
  the field, so the project matches one that never had it.

## 2026-11-01 (Matcha Momentum Generator, script)

- `script` (object, optional): `hook`, `script` and `onScreenText`, copied from the saved script the user chose when
  creating the project. Nothing in a render reads it, so the same project still gives the same video.
- `script.hookFormula` (string, optional, added 2026-11-03): the hook's shape as the script writer named it
  ("Confession"). Only the app's results page reads it, to learn which shapes do well for the person.

## 2026-11-02 (Matcha Momentum Generator, look)

- `look` (object, optional): `filter`, one of `none`, `warm`, `cool`, `vivid`, `film`, `faded`, `mono`. A fixed colour
  chain (engine `looks.py`) applied to the whole picture after pictures and animations and before captions. Absent or
  `none` = no filter, so older projects render exactly as before.
- `captions.style.preset` = `"mine"` marks a subtitle style copied from the person's default look; the first edit
  is told to keep it.

## 2026-11-02 (Matcha Momentum Generator, auto colour)

- `look.autoColor` (boolean, optional): when true, engine `autocolor.py` measures each take once (average luma and
  chroma of its keyframes, cached in `work/autocolor.json`) and adds a per-take fix after the reframe: a gamma to
  pull a too-dark or too-bright take back into range, and a partial chroma shift for a colour cast. Takes already in
  range are untouched; HDR takes are skipped. Runs before `look.filter`. Absent or false = no fix, so older projects
  render exactly as before. New videos get it from the default look (on unless the person turns it off).

## 2026-11-03 (Matcha Momentum Generator, OpenReel colour presets)

- `look.filter` is now any id matching `^[a-z0-9-]{1,48}$` instead of a fixed list: the seven Matcha Momentum Generator filters
  plus OpenReel Video's 30 colour presets (`engine/reelengine/data/openreel_looks.json`, MIT), named by their
  OpenReel ids such as `cinematic-teal-orange`. Unknown names are ignored, as before, so older projects render
  exactly as they did.

## 2026-11-03 (Matcha Momentum Generator, picture style)

- `look.pictureStyle` (optional): `as-is`, `notebook`, `rounded` or `outline`. Engine `picstyle.py` merges the style's
  card params (tilt, corner radius, shadow, border) over a treatment's defaults and under each picture's own
  `params`, for still cards only (`card-above-head`, `side-card`). Absent or `as-is` = the cards render exactly as
  before. `notebook` alternates its tilt by the picture's place in the video, so the same project gives the same video.
- `look.pictureColor` (optional, `#RRGGBB`): the border colour for `notebook` and `outline`.
- `broll[].params.border` (fraction of the frame width) and `params.borderColor` (`#RRGGBB`): a solid mount around a
  still card, sized so the bordered card fits where the bare one would.

## 2026-11-02 (Matcha Momentum Generator, sound effects)

- `soundEffects` (object, optional): `enabled`. When true, engine `soundfx.py` mixes a sound from the earshot bank
  (MIT) under each overlay: a pop on a text card, a swish on an animation, a tap on a picture, its loudest moment on
  the overlay's first word, at least 0.6 s apart. Absent or false = no sound effects, so older projects are unchanged.
