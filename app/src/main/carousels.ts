// The Carousels page's files: <Matcha Momentum Generator>/Carousels/<id>/carousel.json, and slides/NN.png once exported.
// Kept free of Electron so it can be tested; carousel-export.ts draws the PNGs and carousels-ipc.ts wires the page.
import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import { cleanCarousel, newCarousel, slug, type Carousel } from '../shared/carousel'
import { NO_ASSETS, type CarouselAssets } from '../shared/carousel-render'
import type { CarouselDefaults } from '../shared/brand-use'
import { readJson, writeJson } from './store'

const ID = /^[a-z0-9][a-z0-9-]{0,79}$/
const FILE = 'carousel.json'
export const SLIDES_DIR = 'slides'
const MAX_ASSET_BYTES = 4 * 1024 * 1024
const MAX_ART = 60
/** All the art sent to the page together: it is inlined as base64, so a huge kit must not flood the renderer. */
export const MAX_ART_TOTAL_BYTES = 8 * 1024 * 1024
const ART_TYPES: Record<string, string> = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
/** The faces the slides use, from templates/fonts. */
const FONTS = { display: 'Fraunces_700Bold.ttf', text: 'Figtree-SemiBold.ttf', textBold: 'Figtree-Bold.ttf' }

const fail = (code: string, userMessage: string): never => {
  throw { code, userMessage }
}

export const carouselsDir = (root: string): string => join(root, 'Carousels')
export const carouselDir = (root: string, id: string): string => {
  if (!ID.test(id)) fail('BAD_CAROUSEL', 'That carousel name is not valid.')
  return join(carouselsDir(root), id)
}

export async function getCarousel(root: string, id: string): Promise<Carousel | null> {
  if (!ID.test(id)) return null
  return cleanCarousel(await readJson<unknown>(join(carouselsDir(root), id, FILE), null))
}

export async function listCarousels(root: string): Promise<Carousel[]> {
  const ids = await fs.readdir(carouselsDir(root)).catch(() => [] as string[])
  const all = await Promise.all(ids.filter((id) => ID.test(id)).map((id) => getCarousel(root, id)))
  return all.filter((c): c is Carousel => c !== null && ID.test(c.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export interface CreateCarousel {
  title: string
  brand: string | null
  defaults: CarouselDefaults
  now: string
}

export async function createCarousel(root: string, { title, brand, defaults, now }: CreateCarousel): Promise<Carousel> {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled carousel'
  const base = slug(clean)
  let id = base
  for (let n = 2; await fs.stat(join(carouselsDir(root), id)).then(() => true, () => false); n++) id = `${base}-${n}`
  const c = newCarousel({ id, title: clean, brand, style: defaults.style, handle: defaults.handle, now })
  await fs.mkdir(carouselDir(root, id), { recursive: true })
  await writeJson(join(carouselDir(root, id), FILE), c)
  return c
}

/** Saves what the page sent, cleaned, over an existing carousel only (an id never creates a folder). */
export async function saveCarousel(root: string, raw: unknown, now: string): Promise<Carousel> {
  const c = cleanCarousel(raw)
  if (!c) return fail('BAD_CAROUSEL', 'That carousel could not be read. Reload the page and try again.')
  const existing = await getCarousel(root, c.id)
  if (!existing) return fail('NOT_FOUND', 'That carousel is gone. It may have been deleted.')
  const next: Carousel = { ...c, createdAt: existing.createdAt, updatedAt: now }
  await writeJson(join(carouselDir(root, c.id), FILE), next)
  return next
}

export async function removeCarousel(root: string, id: string): Promise<void> {
  await fs.rm(carouselDir(root, id), { recursive: true, force: true })
}

const asDataUrl = async (path: string, type: string): Promise<string | null> => {
  const st = await fs.stat(path).catch(() => null)
  if (!st?.isFile() || st.size > MAX_ASSET_BYTES) return null
  return `data:${type};base64,${(await fs.readFile(path)).toString('base64')}`
}

export interface AssetSources {
  fontsDir: string | null
  logo: string | null
  artDir: string | null
}

/** Fonts, logo and art as data URLs for the slides. Missing files are left out, never an error. */
export async function loadAssets({ fontsDir, logo, artDir }: AssetSources): Promise<CarouselAssets> {
  const font = (name: string): Promise<string> => (fontsDir ? asDataUrl(join(fontsDir, name), 'font/ttf').then((u) => u ?? '') : Promise.resolve(''))
  const [display, text, textBold] = await Promise.all([font(FONTS.display), font(FONTS.text), font(FONTS.textBold)])
  const logoType = logo ? ART_TYPES[extname(logo).toLowerCase()] : undefined
  const logoUrl = logo && logoType ? await asDataUrl(logo, logoType) : null

  const names = artDir ? (await fs.readdir(artDir).catch(() => [] as string[])).filter((n) => ART_TYPES[extname(n).toLowerCase()]).sort().slice(0, MAX_ART) : []
  const art: Record<string, string> = {}
  let total = 0
  for (const n of names) {
    const size = (await fs.stat(join(artDir!, n)).catch(() => null))?.size ?? 0
    if (total + size > MAX_ART_TOTAL_BYTES) break
    const u = await asDataUrl(join(artDir!, n), ART_TYPES[extname(n).toLowerCase()]!)
    if (!u) continue
    art[n] = u
    total += size
  }
  if (!display && !text && !textBold && !logoUrl && !names.length) return { ...NO_ASSETS, fonts: { ...NO_ASSETS.fonts }, art: {} }
  return { fonts: { display, text, textBold }, logo: logoUrl, art }
}
