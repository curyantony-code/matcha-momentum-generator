// The Brands tab: reads the brand profiles in the brands folder and writes the person's edits back to them.
// Kept free of Electron so it can be tested; brands-ipc.ts wires it to the page.
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { PROFILE_HEADER, applyBrandEdits, parseBrandProfile, type BrandDoc, type BrandEdit, type BrandList } from '../shared/brand-profile'
import { brandSettings, profileForWriting, type BrandSettings, type ProfileKind } from '../shared/brand-use'

const MAX_FILE_BYTES = 256 * 1024
const MAX_EDITS = 500
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/
/** Shown first, in this order; any other brand follows by name. */
const FIRST = ['personal'] // the person's own profile first, then the brands by name

export const defaultBrandsDir = (): string => process.env.REELFORGE_BRANDS || join(homedir(), 'matcha', 'content', 'brands')

const fail = (code: string, userMessage: string): never => {
  throw { code, userMessage }
}

const rank = (id: string): number => {
  const i = FIRST.indexOf(id)
  return i === -1 ? FIRST.length : i
}

async function readDoc(dir: string, id: string): Promise<BrandDoc | null> {
  const path = join(dir, `${id}.md`)
  const st = await fs.stat(path).catch(() => null)
  if (!st?.isFile() || st.size > MAX_FILE_BYTES) return null
  const text = await fs.readFile(path, 'utf8')
  if (!text.trimStart().startsWith(PROFILE_HEADER)) return null
  return { id, path, text, profile: parseBrandProfile(text) }
}

export async function listBrands(dir: string): Promise<BrandList> {
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const ids = names.filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)).filter((id) => ID.test(id))
  const docs = await Promise.all(ids.map((id) => readDoc(dir, id)))
  const brands = docs
    .filter((d): d is BrandDoc => d !== null)
    .sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
  return { folder: dir, brands }
}

function cleanEdits(raw: unknown): BrandEdit[] {
  const ok =
    Array.isArray(raw) &&
    raw.length <= MAX_EDITS &&
    raw.every(
      (e) =>
        typeof e === 'object' && e !== null &&
        Number.isInteger((e as BrandEdit).line) && (e as BrandEdit).line >= 0 &&
        typeof (e as BrandEdit).value === 'string'
    )
  if (!ok) fail('BAD_EDIT', 'Those changes could not be read. Reload the tab and try again.')
  return (raw as BrandEdit[]).map(({ line, value }) => ({ line, value }))
}

/**
 * Applies the edits to the file the page opened (`base`). If the file changed on disk since then (edited in another
 * app), nothing is written and the page is asked to reload, so no one's words are lost.
 */
export async function saveBrand(dir: string, id: unknown, base: unknown, rawEdits: unknown): Promise<BrandDoc> {
  if (typeof id !== 'string' || !ID.test(id)) fail('BAD_BRAND', 'That brand name is not valid.')
  const edits = cleanEdits(rawEdits)
  const current = await readDoc(dir, id as string)
  if (!current) return fail('NOT_FOUND', 'That brand file is gone. It may have been moved or renamed.')
  if (current.text !== base) fail('BRAND_CHANGED', 'This file changed outside the app. It has been reloaded: make your change again.')

  let text = ''
  try {
    text = applyBrandEdits(current.text, edits)
  } catch (e) {
    fail('BAD_EDIT', e instanceof RangeError ? e.message : 'That change could not be saved.')
  }
  await writeKeeping(current.path, text)
  return { ...current, text, profile: parseBrandProfile(text) }
}

/**
 * Writes atomically (temp file, then rename) to the real file behind any link, keeping its permissions, and never
 * leaves a temp file behind.
 */
async function writeKeeping(path: string, text: string): Promise<void> {
  const real = await fs.realpath(path)
  const { mode } = await fs.stat(real)
  const tmp = `${real}.${process.pid}.tmp`
  try {
    await fs.writeFile(tmp, text, { encoding: 'utf8', mode: mode & 0o777 })
    await fs.chmod(tmp, mode & 0o777)
    await fs.rename(tmp, real)
  } catch (e) {
    await fs.rm(tmp, { force: true })
    throw e
  }
}

/** The brand new work is made for: what it changes (shared/brand-use.ts) and its profile text for the writer. */
export interface ActiveBrand {
  id: string
  title: string
  settings: BrandSettings
  profileText: string
}

export async function activeBrand(dir: string, id: string, home: string): Promise<ActiveBrand | null> {
  if (!ID.test(id)) return null
  const doc = await readDoc(dir, id)
  if (!doc) return null
  return { id, title: doc.profile.title || id, settings: brandSettings(doc.profile, home), profileText: doc.text }
}

// What the script writer reads, capped so one huge file cannot crowd out the prompt.
export const FRAMEWORK_LIMIT = 16_000
export const BRAND_LIMIT = 12_000

export interface WriterFiles {
  voiceFile: string | null
  framework: string
  brand: string
  /** Who is talking: a person or a company brand (shared/brand-use.ts profileKind); a person with no brand picked. */
  speaker: ProfileKind
}

const readCapped = async (path: string | null, limit: number): Promise<string> =>
  path ? (await fs.readFile(path, 'utf8').catch(() => '')).slice(0, limit) : ''
const beside = (voiceFile: string | null, name: string, limit: number): Promise<string> =>
  readCapped(voiceFile ? join(dirname(voiceFile), name) : null, limit)

/**
 * What the script writer reads. With a brand picked: its voice, personality and script-rules files (each falling back
 * to the file beside its voice file), plus its profile with the unanswered lines left out. A brand whose voice is not
 * written yet gets no voice at all, never another brand's. With no brand: `voiceFile` and the files beside it.
 */
export async function writerFiles(brand: ActiveBrand | null, voiceFile: string | null): Promise<WriterFiles> {
  if (!brand) {
    return { voiceFile, framework: await beside(voiceFile, 'framework.md', FRAMEWORK_LIMIT), brand: await beside(voiceFile, 'brand.md', BRAND_LIMIT), speaker: 'person' }
  }
  const { voiceFile: voice, scriptRulesFile, personalityFile } = brand.settings
  const framework = scriptRulesFile ? await readCapped(scriptRulesFile, FRAMEWORK_LIMIT) : await beside(voice, 'framework.md', FRAMEWORK_LIMIT)
  const personality = personalityFile ? await readCapped(personalityFile, BRAND_LIMIT) : await beside(voice, 'brand.md', BRAND_LIMIT)
  const profile = `## The brand this is for: ${brand.title}\n\n${profileForWriting(brand.profileText)}`.slice(0, BRAND_LIMIT)
  return { voiceFile: voice, framework, brand: [personality, profile].filter(Boolean).join('\n\n'), speaker: brand.settings.kind }
}

/**
 * writerFiles for the brand that is picked. A brand that was picked but whose file is gone (deleted, renamed) gets
 * nothing to write from: falling back to the voice file would hand it another brand's voice.
 */
export async function writerFilesFor(activeId: string | null, brand: ActiveBrand | null, voiceFile: string | null): Promise<WriterFiles> {
  if (activeId && !brand) return { voiceFile: null, framework: '', brand: '', speaker: 'person' }
  return writerFiles(brand, voiceFile)
}

/**
 * The brand whose profile names `voiceFile` (Voice: "voice file"): with no brand picked in the sidebar, the voice
 * file the app writes from still belongs to one, and its sign-off and ask apply. Null when none names it.
 */
export async function brandForVoiceFile(dir: string, voiceFile: string | null, home: string): Promise<ActiveBrand | null> {
  if (!voiceFile) return null
  for (const doc of (await listBrands(dir)).brands) {
    const b = await activeBrand(dir, doc.id, home)
    if (b?.settings.voiceFile === voiceFile) return b
  }
  return null
}
