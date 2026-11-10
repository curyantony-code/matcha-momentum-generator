# Matcha Momentum Generator: content pipeline plan

Matcha Momentum Generator extends Matcha Momentum Generator (MIT) from "raw take to finished reel" to "idea to published post".

```
idea -> script -> teleprompter -> film -> edit (Matcha Momentum Generator) -> repurpose -> schedule and post
long video -> pick clips -> clip projects ----^
generated b-roll (OpenMontage, optional) -----^
```

## License boundaries

| Tool | License | How it is used |
|---|---|---|
| Matcha Momentum Generator | MIT | The base of this repo |
| claude-shorts | MIT | Snapping and rubric adapted here, credited in `THIRD_PARTY.md` |
| OpenMontage | AGPL-3.0 | Separate process only. Nothing of it, skill text included, may enter this repo |
| Postiz CLI | AGPL-3.0 | Installed by the person, started as a separate program, never bundled |
| yt-dlp | Unlicense | Separate program, already used by the app |
| OpenReel Video | MIT | Not bundled or run. Matcha Momentum Generator writes its open "openreel-edit" v2 file for the person to import |

The OpenMontage bridge imports AGPL code, so it lives in its own repo under AGPL (`~/matcha/bridge`), not
here. It reads JSON on stdin and writes JSON on stdout, and this app only ever sees finished media files. OpenMontage
pipelines need an LLM agent to drive them, so only its tool layer can be called this way.

Remotion is in claude-shorts and OpenMontage but is not used here: its license can require a paid company license.
The engine's own captions and renderer do this work.

## Rules this must keep

From `docs/architecture.md`: the engine never calls an LLM, and the ai package never touches media. Same project in,
same video out, so generated clips enter a project as plain b-roll files. Schema changes are additive and logged in
`docs/schema-changes.md`. UI copy is plain words with no em dashes.

## Status

| Stage | State |
|---|---|
| Saved scripts, attached to the project filmed from them | Done, run in the real app |
| Teleprompter | Done, run in the real app |
| Clip cutting and queued edits | Done, `clip` run with real ffmpeg |
| Clips and Repurpose AI calls | Done, run in the real app with real Claude |
| Publishing through the Postiz CLI | Sign-in check run on the real CLI; posting only run against a stand-in |
| Generated media through the OpenMontage bridge | Done; bridge run on real OpenMontage with a free tool, no paid generator tried |
| Edit in OpenReel (engine `openreel`) | File checked against OpenReel's importer rules, restated in `tests/test_openreel.py`; not yet opened in OpenReel itself |

**Edit in OpenReel.** The engine writes `<title>.openreel-edit.json` plus a `media/` folder: each take once (upright,
mirror fixed, HDR tone-mapped, framed and graded like the edit), each still picture card as drawn, `captions.srt` and
`HOW TO OPEN.txt`. Every kept span is its own clip with its original source times, so a cut can be opened up again.
The person imports `media/` first; OpenReel links clips to files by name and size. Zooms, music, sound effects and
moving b-roll cards are not carried over. Picture placement follows OpenReel's video engine: fit "contain", then
`scale`, then `position` in pixels from the canvas centre. OpenReel itself cannot be launched with a file (no file
association or URL scheme), so the app shows the folder and the steps.

`script` in a project is stored but the edit does not read it yet, so the AI does not compare takes to the script.
Clips are cut from a project's first take only.

## Verifying

`npm test`, `npm run typecheck`, `cd engine && python -m pytest tests`, `python scripts/leak-check/check.py`.

The compositing tests and any captioned render need an ffmpeg with the `subtitles` filter (libass), which Homebrew's
plain `ffmpeg` may lack. Run `python packaging/fetch_runtime.py --ffmpeg-only` once: the app then uses that pinned
build in development. Set `REELENGINE_FFMPEG` and `REELENGINE_FFPROBE` to it for the engine tests.

`app/e2e/live-content.spec.ts` runs the whole path with nothing faked, on the person's own Claude plan. See its header.
