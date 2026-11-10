// The Stories page's files: <Matcha Momentum Generator>/Stories/<id>/story.json, audio/, work/ and renders/.
// Kept free of Electron so it can be tested; story-export.ts draws the MP4 and stories-ipc.ts wires the page.
import { promises as fs } from 'node:fs'
import { extname, isAbsolute, join, sep } from 'node:path'
import { slug } from '../shared/carousel'
import type { Story, StoryAssets, StoryLine, StoryPalette, StoryTiming } from '../shared/story'
import { cleanStory, newStory } from '../shared/story-logic'
import { readJson, renameWithRetry, writeJson } from './store'

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const FILE = 'story.json'
export const AUDIO_DIR = 'audio'
export const WORK_DIR = 'work'
export const RENDERS_DIR = 'renders'
export const VOICE_FILE = join(AUDIO_DIR, 'vo.wav')
export const LINES_FILE = join(WORK_DIR, 'lines.json')
export const TIMING_FILE = join(WORK_DIR, 'timing.json')

const MAX_FONT_BYTES = 4 * 1024 * 1024
const MAX_ART = 60
const MAX_ART_BYTES = 4 * 1024 * 1024
export const MAX_ART_TOTAL_BYTES = 8 * 1024 * 1024
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
export const MAX_IMAGES_TOTAL_BYTES = 24 * 1024 * 1024
const IMAGE_PATH = /^[A-Za-z0-9][A-Za-z0-9._ /-]{0,199}$/
const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const ART_TYPES: Record<string, string> = { ...IMAGE_TYPES, '.svg': 'image/svg+xml' }
export const RECORDING_TYPES: readonly string[] = ['.wav', '.m4a', '.mp3', '.aac', '.mov', '.mp4']

/**
 * The faces the scenes were designed with (shared/story-render.ts), from templates/fonts. There is no condensed face
 * there: null leaves the slot empty and the renderer sets those stacks in Figtree Bold caps, as designed.
 */
const FONTS: Record<keyof StoryAssets['fonts'], string | null> = {
  display: 'Fraunces_700Bold.ttf',
  text: 'Figtree-SemiBold.ttf',
  textBold: 'Figtree-Bold.ttf',
  serif: 'Fraunces_600SemiBold.ttf',
  condensed: null
}

const fail = (code: string, userMessage: string): never => {
  throw { code, userMessage }
}

export const storiesDir = (root: string): string => join(root, 'Stories')
export const storyDir = (root: string, id: string): string => {
  if (!ID.test(id)) fail('BAD_STORY', 'That story name is not valid.')
  return join(storiesDir(root), id)
}

export async function getStory(root: string, id: string): Promise<Story | null> {
  if (!ID.test(id)) return null
  return cleanStory(await readJson<unknown>(join(storiesDir(root), id, FILE), null))
}

export async function listStories(root: string): Promise<Story[]> {
  const ids = await fs.readdir(storiesDir(root)).catch(() => [] as string[])
  const all = await Promise.all(ids.filter((id) => ID.test(id)).map((id) => getStory(root, id)))
  return all.filter((s): s is Story => s !== null && ID.test(s.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export interface CreateStory {
  title: string
  brand: string | null
  palette: StoryPalette
  handle: string
  now: string
}

export async function createStory(root: string, { title, brand, palette, handle, now }: CreateStory): Promise<Story> {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled story'
  const base = slug(clean) || 'story'
  let id = base
  for (let n = 2; await fs.stat(join(storiesDir(root), id)).then(() => true, () => false); n++) id = `${base}-${n}`
  const s = newStory({ id, title: clean, brand, palette, handle, now })
  await fs.mkdir(storyDir(root, id), { recursive: true })
  await writeJson(join(storyDir(root, id), FILE), s)
  return s
}

/** Saves what the page sent, cleaned, over an existing story only (an id never creates a folder). */
export async function saveStory(root: string, raw: unknown, now: string): Promise<Story> {
  const s = cleanStory(raw)
  if (!s) return fail('BAD_STORY', 'That story could not be read. Reload the page and try again.')
  const existing = await getStory(root, s.id)
  if (!existing) return fail('NOT_FOUND', 'That story is gone. It may have been deleted.')
  const next: Story = { ...s, createdAt: existing.createdAt, updatedAt: now }
  await writeJson(join(storyDir(root, s.id), FILE), next)
  return next
}

export async function removeStory(root: string, id: string): Promise<void> {
  await fs.rm(storyDir(root, id), { recursive: true, force: true })
}

// ---- assets -------------------------------------------------------------------------------------

const dataUrl = async (path: string, type: string, max: number): Promise<string | null> => {
  const st = await fs.stat(path).catch(() => null)
  if (!st?.isFile() || st.size > max) return null
  return `data:${type};base64,${(await fs.readFile(path)).toString('base64')}`
}

export interface StoryAssetSources {
  fontsDir: string | null
  logo: string | null
  artDir: string | null
  libraryDir: string
  /** Library-relative paths the story's scenes use. */
  images: readonly string[]
}

async function loadFonts(fontsDir: string | null): Promise<StoryAssets['fonts']> {
  const one = (name: string | null): Promise<string> => (fontsDir && name ? dataUrl(join(fontsDir, name), 'font/ttf', MAX_FONT_BYTES).then((u) => u ?? '') : Promise.resolve(''))
  const keys = Object.keys(FONTS) as (keyof typeof FONTS)[]
  const urls = await Promise.all(keys.map((k) => one(FONTS[k])))
  return Object.fromEntries(keys.map((k, i) => [k, urls[i]!])) as StoryAssets['fonts']
}

async function loadArt(artDir: string | null): Promise<Record<string, string>> {
  const names = artDir ? (await fs.readdir(artDir).catch(() => [] as string[])).filter((n) => ART_TYPES[extname(n).toLowerCase()]).sort().slice(0, MAX_ART) : []
  const art: Record<string, string> = {}
  let total = 0
  for (const n of names) {
    const size = (await fs.stat(join(artDir!, n)).catch(() => null))?.size ?? 0
    if (total + size > MAX_ART_TOTAL_BYTES) break
    const u = await dataUrl(join(artDir!, n), ART_TYPES[extname(n).toLowerCase()]!, MAX_ART_BYTES)
    if (!u) continue
    art[n] = u
    total += size
  }
  return art
}

/** A Library-relative image path that stays in the Library (no `..`, not absolute, real path inside), or null. */
export async function resolveLibraryImage(libraryDir: string, rel: string): Promise<string | null> {
  if (!IMAGE_PATH.test(rel) || isAbsolute(rel) || rel.split('/').includes('..') || !IMAGE_TYPES[extname(rel).toLowerCase()]) return null
  const [lib, real] = await Promise.all([fs.realpath(libraryDir).catch(() => null), fs.realpath(join(libraryDir, rel)).catch(() => null)])
  if (!lib || !real || !real.startsWith(lib + sep)) return null
  return real
}

async function loadImages(libraryDir: string, images: readonly string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  let total = 0
  for (const rel of new Set(images)) {
    const real = await resolveLibraryImage(libraryDir, rel)
    if (!real) continue
    const size = (await fs.stat(real).catch(() => null))?.size ?? 0
    if (size > MAX_IMAGE_BYTES || total + size > MAX_IMAGES_TOTAL_BYTES) continue
    const u = await dataUrl(real, IMAGE_TYPES[extname(rel).toLowerCase()]!, MAX_IMAGE_BYTES)
    if (!u) continue
    out[rel] = u
    total += size
  }
  return out
}

/** Fonts, logo, art and Library images as data URLs. Anything missing, unsafe or over a limit is left out. */
export async function loadStoryAssets({ fontsDir, logo, artDir, libraryDir, images }: StoryAssetSources): Promise<StoryAssets> {
  const logoType = logo ? ART_TYPES[extname(logo).toLowerCase()] : undefined
  const [fonts, logoUrl, art, imgs] = await Promise.all([
    loadFonts(fontsDir),
    logo && logoType ? dataUrl(logo, logoType, MAX_ART_BYTES) : Promise.resolve(null),
    loadArt(artDir),
    loadImages(libraryDir, images)
  ])
  return { fonts, logo: logoUrl, art, images: imgs }
}

/** The Library images a story's scenes use. */
export const imagesOf = (s: Story): string[] => s.lines.map((l) => l.scene.params.image).filter((i): i is string => typeof i === 'string' && i !== '')

// ---- audio and timing ---------------------------------------------------------------------------

/** Copies their recording into audio/recording.<ext> (temp then rename); returns the path. */
/**
 * Copies their recording into work/ (incoming.<ext>), checked: the story's own recording is not touched until the
 * new one has been timed (commitRecording), so a recording that cannot be aligned never replaces a good one.
 */
export async function stageRecording(dir: string, file: string): Promise<string> {
  const ext = extname(file).toLowerCase()
  if (!RECORDING_TYPES.includes(ext)) return fail('BAD_AUDIO', `Use a ${RECORDING_TYPES.map((e) => e.slice(1)).join(', ')} file.`)
  const st = await fs.stat(file).catch(() => null)
  if (!st?.isFile()) return fail('BAD_AUDIO', 'That recording could not be found.')
  const work = join(dir, 'work')
  await fs.mkdir(work, { recursive: true })
  const to = join(work, `incoming${ext}`)
  const tmp = `${to}.${process.pid}.tmp`
  try {
    await fs.copyFile(file, tmp)
    await renameWithRetry(tmp, to)
  } finally {
    await fs.rm(tmp, { force: true })
  }
  return to
}

/** The staged recording becomes the story's (audio/recording.<ext>), replacing any earlier one. */
export async function commitRecording(dir: string, staged: string): Promise<string> {
  const audio = join(dir, AUDIO_DIR)
  await fs.mkdir(audio, { recursive: true })
  for (const f of await fs.readdir(audio).catch(() => [] as string[])) if (/^recording\./.test(f)) await fs.rm(join(audio, f), { force: true })
  const to = join(audio, `recording${extname(staged).toLowerCase()}`)
  await renameWithRetry(staged, to)
  return to
}

/** Stage and commit at once (tests, and anything that does not need to align first). */
export async function copyRecording(dir: string, file: string): Promise<string> {
  return commitRecording(dir, await stageRecording(dir, file))
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** work/timing.json, or null when missing or not a StoryTiming. */
export async function readTiming(dir: string): Promise<StoryTiming | null> {
  const t = await readJson<Partial<StoryTiming> | null>(join(dir, TIMING_FILE), null)
  if (!t || !isNum(t.duration) || !Array.isArray(t.lines) || !Array.isArray(t.words) || typeof t.textHash !== 'string') return null
  if (!t.lines.every((l) => l && isNum(l.start) && isNum(l.end))) return null
  return t as StoryTiming
}

/** work/lines.json: what the engine is asked to say. */
export async function writeLines(dir: string, lines: readonly StoryLine[]): Promise<string> {
  const file = join(dir, LINES_FILE)
  await fs.mkdir(join(dir, WORK_DIR), { recursive: true })
  await writeJson(file, lines.map((l) => ({ shown: l.shown, spoken: l.spoken })))
  return file
}

/** The voiceover file for this story: their recording, or the Kokoro WAV, or null. */
export async function audioFile(dir: string, story: Story): Promise<string | null> {
  const names = story.voice.kind === 'recording' ? [story.voice.file] : []
  const found = (await fs.readdir(join(dir, AUDIO_DIR)).catch(() => [] as string[])).filter((f) => /^recording\./.test(f))
  for (const n of [...names, ...(story.voice.kind === 'recording' ? found : ['vo.wav'])]) {
    const p = join(dir, AUDIO_DIR, n.replace(/^.*[\\/]/, ''))
    if ((await fs.stat(p).catch(() => null))?.isFile()) return p
  }
  return null
}
