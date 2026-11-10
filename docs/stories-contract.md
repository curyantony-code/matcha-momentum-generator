# Stories (faceless shorts): the contract

A story is a 9:16 short with no camera: every line is one full-screen motion-graphics scene, timed to a voiceover
(Kokoro, free and local, or the person's own recording). Types: `app/src/shared/story.ts`. Every part below builds
against this file and those types; change them only together.

## Files (one folder per story)

```
<Matcha Momentum Generator root>/Stories/<id>/
  story.json            the Story (shared/story.ts), cleaned by cleanStory
  audio/vo.wav          the voiceover (Kokoro), or audio/recording.<ext> (their own)
  work/lines.json       what the engine was asked to say: [{"shown": string, "spoken": string}]
  work/timing.json      StoryTiming, written by the engine
  renders/<id>.mp4      the export (H.264, yuv420p, 30 fps, 1080x1920, AAC 48 kHz)
  renders/caption.txt   caption + hashtags
```
`<id>` matches `^[a-z0-9][a-z0-9-]{0,79}$`.

## 1 · Engine (Python, `engine/reelengine/tts.py` + `cli.py`) — agent A

All commands follow the engine's protocol (`reelengine/proto.py`: JSON progress lines, a final result object,
errors with a `code` and a `userMessage`). Kokoro is an OPTIONAL extra (`pyproject.toml`
`[project.optional-dependencies] tts = ["kokoro-onnx>=0.4", "soundfile>=0.12"]`): when it is missing, commands fail
with code `TTS_MISSING` and a userMessage saying how to add it. Never import it at module top level.

- `reelengine story-voice-model --dir <models>/kokoro [--check]`
  Downloads `kokoro-v1.0.onnx` and `voices-v1.0.bin` from
  `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/<file>`, resuming a `<file>.part`
  (HTTP Range), verifying the size and SHA-256 (pin them in tts.py), then renaming. Progress stage `download`.
  `--check`: no download; result `{installed, downloaded, total, packageMissing}` (= VoiceModelStatus).
- `reelengine story-voices --dir <models>/kokoro` → result `{voices: [{id, label}]}` (English voices only: ids that
  start with `a` (American) or `b` (British); label like "Heart (US, female)").
- `reelengine story-voice --dir <models>/kokoro --lines work/lines.json --voice af_heart --speed 1.0
  --out audio/vo.wav --timing work/timing.json`
  Synthesises each line (`spoken` or `shown`), trims each line's silence, joins them with a 0.18 s gap
  (+0.12 s after a full stop) and a 0.12 s lead, normalises to -1 dBFS peak, writes 24 kHz mono WAV. Then gets the
  word times by transcribing the WAV with the engine's own transcription (`transcribe.py`, whatever model the app
  already has; MLX on Apple Silicon) and assigns each word to its line by the known line windows. Writes
  StoryTiming (`textHash` = sha256 of the joined `shown` texts, `\n`-separated, hex, first 16 chars).
- `reelengine story-align --audio <file> --lines work/lines.json --timing work/timing.json`
  For their own recording: transcribes it and finds each line in the transcript (fuzzy, in order); words between
  lines go to the line before. Fails with `ALIGN_FAILED` when fewer than half the lines are found.
- Tests in `engine/tests/test_tts.py` with the synthesis and transcription faked (no model in CI).

### Voice freshness (added after review)

`textHash` hashes each line's `shown` cleaned exactly as story.json keeps it. After every voice (Kokoro or a
recording) main stamps `voiceKey` (story-logic.ts) into work/timing.json: a hash of the lines as said (shown + spoken
for Kokoro; shown for a recording) and the voice (id + speed, or the recording file). The page shows the voice as
stale and `stories:export` refuses (`VOICE_STALE`) when `isVoiceCurrent(story, timing)` is false. A recording is
copied to work/incoming.<ext> and aligned into work/timing.json.next first; only on success does it replace
audio/recording.<ext> and work/timing.json.

## 2 · Scene library + film renderer (`app/src/shared/story-logic.ts`, `story-render.ts`) — agent B

Pure TypeScript, no Node or DOM imports, shared by the renderer (preview) and main (export).
- `story-logic.ts`: `newStory(...)`, `cleanStory(raw): Story | null` (caps text, whitelists enums, drops bad
  art/image names, `^[A-Za-z0-9][A-Za-z0-9._ /-]{0,199}$` for Library paths with no `..`), `textHash(story)`,
  `sceneTimes(story, timing) → {start, end}[]` (scene i: line i start → line i+1 start; last: to duration + 0.6 s
  tail), `estimateTiming(story)` (2.6 words/s, for a preview before any voice exists), `checkStory(story) →
  {line, rule, text}[]` (6–20 lines, a hook first, a CTA last that is a follow or the waitlist, the same world twice
  in a row, a hero/phrase not in its line, a stat with no value).
- `story-render.ts`: `storyHtml(story, timing, assets): string` → ONE self-contained HTML document, 1080x1920,
  every scene in it. It defines `window.__duration` (seconds) and `window.__seek(t)` (synchronous, deterministic:
  the frame at time t depends only on t: no CSS transitions/animations, no timers, no randomness without a seed).
  It also answers `window.addEventListener('message', e => e.data?.type === 'seek' && __seek(e.data.t))` for the
  sandboxed preview. Inline CSP: `default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline';
  script-src 'unsafe-inline'`. Every text is escaped. Assets only as data: URLs (others dropped).
  The look (MG V3, our own code): worlds hold for the line, words land on their onsets (blur 10→0 over 0.16 s),
  mixed type tiers (thin connectors, one bold/hero word, an italic feeling word), the camera always drifts
  (scale 1.00→1.05 over a scene), one action per scene, the transition kinds in shared/story.ts, one accent colour.
  Palettes: `brand` (Aubergine #1E1524, Pearl #F6F3F8, Tangerine #F58D3D) and `mono` (paper #E9E7E1, ink #0F0E13,
  clay #D97757, grey #BEBEBC, black #000).
- Tests: `app/test/story-logic.test.ts`, `app/test/story-render.test.ts`.

## 3 · Store, IPC, export (`app/src/main/stories.ts`, `stories-ipc.ts`, `story-export.ts`) — agent C

- `stories.ts` (no Electron): create/list/get/save/remove like `main/carousels.ts`; `loadStoryAssets(...)` like
  `loadAssets` (fonts from templates/fonts: Figtree-SemiBold/Bold, Fraunces_700Bold, Inter_*; images from the Library,
  each under 8 MB, 24 MB total); copying a recording in.
- `story-export.ts` (Electron): `exportStory(html, duration, audio, outPath, onProgress)`: offscreen BrowserWindow
  1080x1920 (sandboxed, locked session like carousel-export.ts), for each frame at 30 fps
  `executeJavaScript('__seek(t)')` then two rAFs, `capturePage`, raw RGBA piped to `ffmpeg` (`ffmpegPath()` from
  paths.ts) → H.264 CRF 18 yuv420p + the audio as AAC; one export at a time; writes to a temp file then renames.
- `stories-ipc.ts`: `registerStoriesIpc(deps)` with the channels of `ReelApi.stories` (shared/api.ts). Voice and
  export run as jobs that report progress on `stories:progress` (`{id, stage, pct, message}`).
- Tests: `app/test/stories.test.ts` (store, assets, IPC validation with fakes).

## 4 · AI writer (`ai/prompts/draftStory.md`, `ai/src/storygen.ts`, `editor.ts`, `index.ts`) — agent D

`ai.draftStory(topic, onEvent, signal, ctx: CarouselContext & { lines?: number })` → `{ title, lines: [{shown,
spoken, scene: {type, world, transition, params}}], caption, hashtags }`. Same rules as draftCarousel (brand voice,
its rules, the brand's ask, never invent a number, keep each number with what it measured) plus: 10–16 lines of
~2.5 words/s (a 30–50 s short), hook first, thesis near the end, one CTA last; one scene type per line chosen from
what the line says; worlds never repeat back to back; 4–6 transition kinds per story; `spoken` respells numbers and
names for a voice ("2021" → "twenty twenty-one"; acronyms stay plain: "AI", never "A.I."). Parser: `parseStoryDraft`
(whitelists, fixes repeats, drops a hero not in its line). Tests in `ai/test/storygen.test.ts` and a scripted-model
test. Rebuild `ai/dist` (`npm run build` in ai/).

## 5 · Stories page (`app/src/renderer/src/screens/Stories*.tsx`, `components/StoryPlayer.tsx`) — agent E

List (like Carousels) + editor: the lines (shown, spoken, scene type and its params, world, transition), "Write it
with AI", voice (Kokoro voice + speed, with the model download if missing; or "Use my own recording"), a preview
player (the story's HTML in an `<iframe sandbox="allow-scripts">`, driven by `postMessage({type:'seek', t})` from a
play/pause + scrub bar using requestAnimationFrame; audio from the WAV via the `reel-media:` URL), checks, Export MP4,
Open folder. Uses only `reel.stories.*` and existing `reel.*` calls.

## Wiring (main/index.ts, preload, App.tsx, nav.ts, Connect.tsx, styles) — the coordinator

Only the coordinator edits these shared files.
