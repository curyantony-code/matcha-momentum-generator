// A faceless story short: 9:16, no camera, every line one full-screen motion-graphics scene timed to a voiceover.
// CONTRACT FILE (docs/stories-contract.md): the types and constants every part builds against. Logic lives in
// story-logic.ts (clean, new, timing, checks) and story-render.ts (the film as one seekable HTML page).

export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920
export const STORY_FPS = 30
export const MIN_LINES = 6
export const MAX_LINES = 20

/** What a scene shows. Every scene also shows the spoken words of its line landing on their onsets. */
export type SceneType =
  | 'line' //  the line's words in mixed type, one hero word big
  | 'title' // hook / chapter card: huge stacked heavy type, a small kicker
  | 'stat' //  a number that counts or rolls up, with its label
  | 'highlight' // the line set as a printed sentence, a highlighter sweeping the phrase
  | 'list' //  2 to 5 items building one per beat
  | 'logo' //  a logo or mark focusing in (the brand's, or a Library image)
  | 'art' //   a brand-kit illustration (cut-paper) acting over the words
  | 'photo' // a Library photo, B&W, slow push, the words over a dark gradient

export const SCENE_TYPES: readonly SceneType[] = ['line', 'title', 'stat', 'highlight', 'list', 'logo', 'art', 'photo']

/** The ground a scene sits on. Worlds change scene to scene; never the same twice in a row. */
export type World = 'paper' | 'ink' | 'clay' | 'grey' | 'black' | 'brand'
export const WORLDS: readonly World[] = ['paper', 'ink', 'clay', 'grey', 'black', 'brand']

/** How this scene arrives from the one before (the first scene ignores it). Never a crossfade. */
export type Transition = 'cut' | 'flash' | 'zoom' | 'whip' | 'wipe' | 'iris'
export const TRANSITIONS: readonly Transition[] = ['cut', 'flash', 'zoom', 'whip', 'wipe', 'iris']

/** Per-type settings. Text fields are what is shown; all of it is escaped by the renderer. */
export interface SceneParams {
  /** line, title, art, photo: the one word (or 2-word phrase) of `shown` drawn as the hero. '' = none. */
  hero?: string
  /** title: small line above. */
  kicker?: string
  /** stat: the number as shown ("27%", "$4.2M", "1987"), and what it measures. */
  value?: string
  label?: string
  /** highlight: the exact words of `shown` the highlighter sweeps. */
  phrase?: string
  /** list: 2 to 5 short items. */
  items?: string[]
  /** logo, photo: a Library-relative path (e.g. "Images/x.png"), or null for the brand logo / none. */
  image?: string | null
  /** art: a brand-kit illustration file name (never a path), or null. */
  art?: string | null
}

export interface Scene {
  type: SceneType
  world: World
  transition: Transition
  params: SceneParams
}

export interface StoryLine {
  /** What appears on screen. */
  shown: string
  /** How the voice should say it ("twenty twenty-one" for "2021"); '' = say `shown`. Kokoro only. */
  spoken: string
  scene: Scene
}

/** Kokoro voices are ids like "af_heart", "am_michael", "bf_emma"; speed 0.7–1.3. */
export type StoryVoice =
  | { kind: 'kokoro'; voice: string; speed: number }
  /** The person's own recording, copied into the story folder (audio/recording.<ext>). */
  | { kind: 'recording'; file: string }

/** The look: 'brand' = the brand's palette (for example aubergine, pearl and tangerine), 'mono' = MG V3 paper/ink/clay. */
export type StoryPalette = 'brand' | 'mono'

export interface Story {
  version: 1
  id: string
  title: string
  /** The brand it is made for (Brands tab id), or null. */
  brand: string | null
  palette: StoryPalette
  handle: string
  voice: StoryVoice
  lines: StoryLine[]
  caption: string
  hashtags: string[]
  createdAt: string
  updatedAt: string
}

/** One spoken word with its time in the voiceover (seconds) and the line it belongs to (0-based). */
export interface TimedWord {
  w: string
  s: number
  e: number
  line: number
}

/**
 * When everything is said: written by the engine (reelengine story-voice / story-align) to work/timing.json.
 * `lines[i]` is when line i is spoken; scenes run from their line's start to the next line's start.
 * `textHash` is the hash of the lines' text the timing was made for: a story edited since needs a new voice.
 */
export interface StoryTiming {
  duration: number
  lines: { start: number; end: number }[]
  words: TimedWord[]
  textHash: string
  /**
   * Stamped by main after the voice is made: the lines as said and the voice that said them (story-logic.ts
   * voiceKey). Changing a line, how it is said, the voice or the recording makes it stale. Absent on older timings.
   */
  voiceKey?: string
}

/** Fonts, logo, art and Library images as data: URLs (main reads the files; the renderer never loads a path). */
export interface StoryAssets {
  fonts: Record<'display' | 'text' | 'textBold' | 'serif' | 'condensed', string>
  logo: string | null
  /** art file name → data URL */
  art: Record<string, string>
  /** Library-relative path → data URL, for the images the story's scenes use */
  images: Record<string, string>
}

/** The voice model on this computer (Kokoro): what the Stories page needs to offer "Make the voice". */
export interface VoiceModelStatus {
  installed: boolean
  /** bytes downloaded so far / total, while a download runs or after one stopped part-way */
  downloaded: number
  total: number
  /** The Python package (kokoro-onnx) is missing: an optional add-on, never bundled (espeak-ng is GPL-3). */
  packageMissing: boolean
}

export interface StoryVoiceOption {
  id: string
  label: string
}
