// A story's logic: a new one, cleaning what the page or the AI sent, the text hash the voice was made for, when each
// scene runs, a timing estimate for a preview before any voice exists, and the rules a story should keep.
// Pure TypeScript (no Node, no DOM): the renderer and main share it. Types: shared/story.ts.
import {
  MAX_LINES,
  MIN_LINES,
  SCENE_TYPES,
  TRANSITIONS,
  WORLDS,
  type Scene,
  type SceneParams,
  type SceneType,
  type Story,
  type StoryLine,
  type StoryPalette,
  type StoryTiming,
  type StoryVoice,
  type TimedWord,
  type Transition,
  type World
} from './story'

export const LIMITS = {
  title: 120,
  shown: 160,
  spoken: 240,
  hero: 40,
  kicker: 48,
  value: 16,
  label: 60,
  phrase: 120,
  item: 48,
  handle: 60,
  caption: 2200,
  hashtag: 40
} as const
export const MAX_ITEMS = 5
export const MIN_ITEMS = 2
export const MAX_HASHTAGS = 8
export const WORDS_PER_SECOND = 2.6
/** The last scene holds this long after the voice ends. */
export const TAIL_SECONDS = 0.6
export const DEFAULT_VOICE: Extract<StoryVoice, { kind: 'kokoro' }> = { kind: 'kokoro', voice: 'af_heart', speed: 1 }
const MAX_HOOK_WORDS = 12
const LEAD = 0.12
const GAP = 0.18
const STOP_GAP = 0.12
const MIN_LINE_SECONDS = 0.8
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const ART = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(svg|png|jpe?g|webp)$/i
const LIBRARY_PATH = /^[A-Za-z0-9][A-Za-z0-9._ /-]{0,199}$/
const VOICE_ID = /^[a-z]{2}_[a-z0-9]{1,30}$/
const RECORDING = /^(audio\/)?recording\.[a-z0-9]{1,5}$/
const PALETTES: readonly StoryPalette[] = ['brand', 'mono']

// ---------------------------------------------------------------------------------------------------------------
// New

const scene = (type: SceneType, world: World, transition: Transition, params: SceneParams = {}): Scene => ({ type, world, transition, params })
const line = (shown: string, s: Scene): StoryLine => ({ shown, spoken: '', scene: s })

export interface NewStory {
  id: string
  title: string
  brand: string | null
  palette: StoryPalette
  handle: string
  now: string
}

/** A starting story: six lines that already keep every rule, one of each kind of beat, ready to rewrite. */
export function newStory({ id, title, brand, palette, handle, now }: NewStory): Story {
  const hook = str(title, LIMITS.shown) || 'Nobody tells you this'
  return {
    version: 1,
    id,
    title: str(title, LIMITS.title) || 'Untitled story',
    brand,
    palette,
    handle,
    voice: DEFAULT_VOICE,
    lines: [
      line(hook, scene('title', 'ink', 'cut', { kicker: 'A short story' })),
      line('Here is what nobody tells you', scene('line', 'paper', 'flash', { hero: 'nobody' })),
      line('It took 3 years', scene('stat', 'clay', 'zoom', { value: '3', label: 'years' })),
      line('The answer was hiding in plain sight', scene('highlight', 'grey', 'wipe', { phrase: 'plain sight' })),
      line('Three things changed', scene('list', 'black', 'whip', { items: ['The habit', 'The tools', 'The people'] })),
      line('Follow for more stories like this', scene('line', 'paper', 'iris', { hero: 'Follow' }))
    ],
    caption: '',
    hashtags: [],
    createdAt: now,
    updatedAt: now
  }
}

/** Still the starting lines newStory gave it: drafting over it loses nothing the person wrote. */
export function isUntouchedStory(s: Story): boolean {
  const start = newStory({ id: s.id, title: s.title, brand: s.brand, palette: s.palette, handle: s.handle, now: s.createdAt }).lines
  return s.lines.length === start.length && s.lines.every((l, i) => i === 0 || (l.shown === start[i]!.shown && l.spoken === start[i]!.spoken))
}

// ---------------------------------------------------------------------------------------------------------------
// Clean

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const oneOf = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback)

const caption = (v: unknown): string =>
  typeof v === 'string'
    ? v.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.caption)
    : ''

const hashtags = (v: unknown): string[] => {
  if (!Array.isArray(v)) return []
  const tags = v.flatMap((t) => {
    const clean = typeof t === 'string' ? t.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, LIMITS.hashtag) : ''
    return clean ? [`#${clean}`] : []
  })
  return Array.from(new Set(tags)).slice(0, MAX_HASHTAGS)
}

/** A Library-relative path ("Images/x.png"): never absolute, never `..`, nothing outside the safe characters. */
export function isLibraryPath(v: unknown): v is string {
  return typeof v === 'string' && LIBRARY_PATH.test(v) && !v.includes('..') && !v.includes('//')
}

/** A brand-kit illustration file name: a name, never a path. */
export function isArtName(v: unknown): v is string {
  return typeof v === 'string' && ART.test(v)
}

function cleanItems(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map((x) => str(x, LIMITS.item)).filter(Boolean).slice(0, MAX_ITEMS)
}

/** Only the settings that were sent and are valid; text capped, paths and names checked. */
export function cleanParams(raw: unknown): SceneParams {
  const r = record(raw)
  const out: SceneParams = {}
  const text = (k: 'hero' | 'kicker' | 'value' | 'label' | 'phrase'): void => {
    if (typeof r[k] === 'string') out[k] = str(r[k], LIMITS[k])
  }
  text('hero')
  text('kicker')
  text('value')
  text('label')
  text('phrase')
  const items = cleanItems(r.items)
  if (items) out.items = items
  if ('image' in r) out.image = isLibraryPath(r.image) ? r.image : null
  if ('art' in r) out.art = isArtName(r.art) ? r.art : null
  return out
}

function cleanScene(raw: unknown): Scene {
  const r = record(raw)
  return {
    type: oneOf(r.type, SCENE_TYPES, 'line'),
    world: oneOf(r.world, WORLDS, 'paper'),
    transition: oneOf(r.transition, TRANSITIONS, 'cut'),
    params: cleanParams(r.params)
  }
}

function cleanLine(raw: unknown): StoryLine {
  const r = record(raw)
  return { shown: str(r.shown, LIMITS.shown), spoken: str(r.spoken, LIMITS.spoken), scene: cleanScene(r.scene) }
}

export function cleanVoice(raw: unknown): StoryVoice {
  const r = record(raw)
  if (r.kind === 'recording' && typeof r.file === 'string' && RECORDING.test(r.file)) return { kind: 'recording', file: r.file }
  if (r.kind !== 'kokoro') return DEFAULT_VOICE
  const voice = typeof r.voice === 'string' && VOICE_ID.test(r.voice) ? r.voice : DEFAULT_VOICE.voice
  const n = typeof r.speed === 'number' && Number.isFinite(r.speed) ? r.speed : 1
  return { kind: 'kokoro', voice, speed: Math.round(Math.min(1.3, Math.max(0.7, n)) * 100) / 100 }
}

/** A story as saved: unknown fields dropped, text capped, enums whitelisted, a bad path never kept. Null if not one. */
export function cleanStory(raw: unknown): Story | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !ID.test(r.id) || !Array.isArray(r.lines) || !r.lines.length) return null
  return {
    version: 1,
    id: r.id,
    title: str(r.title, LIMITS.title) || 'Untitled story',
    brand: typeof r.brand === 'string' && ID.test(r.brand) ? r.brand : null,
    palette: oneOf(r.palette, PALETTES, 'brand'),
    handle: str(r.handle, LIMITS.handle),
    voice: cleanVoice(r.voice),
    lines: r.lines.slice(0, MAX_LINES).map(cleanLine),
    caption: caption(r.caption),
    hashtags: hashtags(r.hashtags),
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date(0).toISOString()
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Text hash (SHA-256, pure JS so the renderer can run it too)

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

/** UTF-8 bytes of a string (lone surrogates become U+FFFD, like Python's and TextEncoder's). */
export function utf8(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    let c = ch.codePointAt(0)!
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63))
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63))
  }
  return out
}

function padMessage(bytes: readonly number[]): number[] {
  const bits = bytes.length * 8
  const out = [...bytes, 0x80]
  while (out.length % 64 !== 56) out.push(0)
  const hi = Math.floor(bits / 0x100000000)
  for (const w of [hi, bits >>> 0]) out.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255)
  return out
}

function compress(h: number[], m: readonly number[], at: number): number[] {
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))
  const w = new Array<number>(64)
  for (let i = 0; i < 16; i++) w[i] = (m[at + i * 4]! << 24) | (m[at + i * 4 + 1]! << 16) | (m[at + i * 4 + 2]! << 8) | m[at + i * 4 + 3]!
  for (let i = 16; i < 64; i++) {
    const a = w[i - 15]!
    const b = w[i - 2]!
    const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)
    const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)
    w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0
  }
  let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number]
  for (let i = 0; i < 64; i++) {
    const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i]! + w[i]!) | 0
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
    hh = g
    g = f
    f = e
    e = (d + t1) | 0
    d = c
    c = b
    b = a
    a = (t1 + t2) | 0
  }
  return [a, b, c, d, e, f, g, hh].map((v, i) => (h[i]! + v) | 0)
}

/** SHA-256 of a string's UTF-8 bytes, as 64 hex characters. */
export function sha256Hex(s: string): string {
  const m = padMessage(utf8(s))
  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  for (let at = 0; at < m.length; at += 64) h = compress(h, m, at)
  return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('')
}

/** What the voice was made for: the first 16 hex of SHA-256 of the lines' `shown`, joined by "\n" (= the engine's). */
/** The lines as the engine was asked to say them: cleaned like story.json, so spaces typed around them count for nothing. */
export function textHash(story: Pick<Story, 'lines'>): string {
  return sha256Hex(story.lines.map((l) => str(l.shown, LIMITS.shown)).join('\n')).slice(0, 16)
}

/**
 * What a voiceover was made from: the lines as said, and by what. A Kokoro voice depends on each line's shown and
 * spoken text, the voice and its speed; a recording on what is shown and which file it is.
 */
export function voiceKey(story: Pick<Story, 'lines' | 'voice'>): string {
  const v = story.voice
  const said = story.lines.map((l) => (v.kind === 'kokoro' ? [str(l.shown, LIMITS.shown), str(l.spoken, LIMITS.spoken)] : [str(l.shown, LIMITS.shown)]))
  const by = v.kind === 'kokoro' ? ['kokoro', v.voice, v.speed.toFixed(2)] : ['recording', v.file]
  return sha256Hex(JSON.stringify([by, said])).slice(0, 16)
}

/** The voiceover still fits the story: its voice key matches (or, on a timing from before voice keys, its text). */
export function isVoiceCurrent(story: Pick<Story, 'lines' | 'voice'>, timing: StoryTiming): boolean {
  return timing.voiceKey ? timing.voiceKey === voiceKey(story) : timing.textHash === textHash(story)
}

// ---------------------------------------------------------------------------------------------------------------
// Timing

export interface SceneTime {
  start: number
  end: number
}

/** When each scene runs: line i's start to line i+1's start; the last to the voice's end plus a short tail. */
export function sceneTimes(story: Pick<Story, 'lines'>, timing: StoryTiming): SceneTime[] {
  const n = story.lines.length
  const starts: number[] = []
  for (let i = 0; i < n; i++) {
    const t = timing.lines[i]?.start
    const prev = starts[i - 1] ?? 0
    // A timing made for fewer lines (a story edited since): the extra scenes get two seconds each.
    starts.push(typeof t === 'number' && Number.isFinite(t) && t >= prev ? t : i === 0 ? 0 : prev + 2)
  }
  const last = Math.max(timing.duration, starts[n - 1] ?? 0)
  return starts.map((start, i) => ({ start, end: i < n - 1 ? starts[i + 1]! : last + TAIL_SECONDS }))
}

/** The words of a shown line, as the screen splits them. */
export const tokens = (s: string): string[] => (s.trim() ? s.trim().split(/\s+/) : [])

/** A timing at 2.6 words a second, laid out like the engine's (a lead, a gap between lines, more after a full stop). */
export function estimateTiming(story: Pick<Story, 'lines'>): StoryTiming {
  const lines: { start: number; end: number }[] = []
  const words: TimedWord[] = []
  let t = LEAD
  story.lines.forEach((l, i) => {
    const ws = tokens(l.shown)
    const dur = Math.max(MIN_LINE_SECONDS, ws.length / WORDS_PER_SECOND)
    const step = ws.length ? dur / ws.length : dur
    ws.forEach((w, k) => words.push({ w, s: round(t + k * step), e: round(t + (k + 0.85) * step), line: i }))
    lines.push({ start: round(t), end: round(t + dur) })
    t += dur + GAP + (/[.!?]["')\]]*$/.test(l.shown.trim()) ? STOP_GAP : 0)
  })
  return { duration: lines.length ? lines[lines.length - 1]!.end : 0, lines, words, textHash: textHash(story) }
}

const round = (n: number): number => Math.round(n * 1000) / 1000

// ---------------------------------------------------------------------------------------------------------------
// Checks

export type StoryRule = 'count' | 'hook-first' | 'cta-last' | 'empty' | 'world-repeat' | 'hero' | 'phrase' | 'stat-value' | 'list-items'

export interface StoryNote {
  /** 1-based line number, or null for the whole story. */
  line: number | null
  rule: StoryRule
  text: string
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}%$€£.,'’ -]/gu, ' ').replace(/\s+/g, ' ').trim()
/** Is `part` in `whole`, ignoring case and spacing? */
export const containsText = (whole: string, part: string): boolean => {
  const p = norm(part)
  return !p || norm(whole).includes(p)
}
const CTA = /\b(follow|waitlist|wait list|wait-list)\b/i

function lineNotes(l: StoryLine, i: number, prev: StoryLine | undefined): StoryNote[] {
  const at = i + 1
  const notes: StoryNote[] = []
  const p = l.scene.params
  if (!l.shown) notes.push({ line: at, rule: 'empty', text: 'This line has no words on screen.' })
  if (prev && prev.scene.world === l.scene.world) notes.push({ line: at, rule: 'world-repeat', text: `Same world as the line before (${l.scene.world}): change it so the scene reads as new.` })
  if (p.hero && !containsText(l.shown, p.hero)) notes.push({ line: at, rule: 'hero', text: `The hero word "${p.hero}" is not in this line.` })
  if (l.scene.type === 'highlight' && p.phrase && !containsText(l.shown, p.phrase)) notes.push({ line: at, rule: 'phrase', text: `The highlighted words "${p.phrase}" are not in this line.` })
  if (l.scene.type === 'stat' && !p.value) notes.push({ line: at, rule: 'stat-value', text: 'A stat scene needs its number (the value).' })
  if (l.scene.type === 'list' && (p.items?.length ?? 0) < MIN_ITEMS) notes.push({ line: at, rule: 'list-items', text: `A list scene needs ${MIN_ITEMS} to ${MAX_ITEMS} items.` })
  return notes
}

/** What breaks the story rules, line by line. Advice, not a lock: export still works. */
export function checkStory(story: Pick<Story, 'lines'>): StoryNote[] {
  const n = story.lines.length
  const notes: StoryNote[] = []
  if (n < MIN_LINES || n > MAX_LINES) notes.push({ line: null, rule: 'count', text: `Use ${MIN_LINES} to ${MAX_LINES} lines (now ${n}).` })
  const first = story.lines[0]
  const hookWords = first ? tokens(first.shown).length : 0
  if (!first || !hookWords || hookWords > MAX_HOOK_WORDS) notes.push({ line: 1, rule: 'hook-first', text: `Line 1 is the hook: one short line (${MAX_HOOK_WORDS} words at most) that stops the scroll.` })
  const last = story.lines[n - 1]
  if (!last || !CTA.test(last.shown)) notes.push({ line: n || null, rule: 'cta-last', text: 'The last line should ask for one thing: a follow, or the waitlist.' })
  story.lines.forEach((l, i) => notes.push(...lineNotes(l, i, story.lines[i - 1])))
  return notes
}
