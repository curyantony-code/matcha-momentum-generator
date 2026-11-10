// The Carousels page's IPC: list, create (for the brand in use), save, delete, the slide assets, and export to PNG.
import { join } from 'node:path'
import { applyDraft, type Carousel, type CarouselDraft } from '../shared/carousel'
import { rm, writeFile } from 'node:fs/promises'
import type { CarouselDefaults } from '../shared/brand-use'
import type { CarouselAssets } from '../shared/carousel-render'
import { SLIDES_DIR, carouselDir, createCarousel, getCarousel, listCarousels, loadAssets, removeCarousel, saveCarousel } from './carousels'

export interface CarouselsDeps {
  handle(channel: string, fn: (e: unknown, ...args: any[]) => unknown): void
  root(): string
  fontsDir(): string | null
  /** The brand in use (sidebar switch), or null. */
  activeBrand(): string | null
  /** A brand's carousel defaults, logo and art folder (shared/brand-use.ts carouselDefaults). */
  defaultsFor(brand: string | null): Promise<CarouselDefaults>
  exportSlides(c: Carousel, assets: CarouselAssets, outDir: string): Promise<string[]>
  /** The AI's words for this carousel, written for its own brand (main/index.ts reads that brand's voice and rules). */
  draft(c: Carousel, topic: string, slides: number): Promise<CarouselDraft>
  reveal(path: string): void
}

export interface CarouselExport {
  folder: string
  files: string[]
}

const now = (): string => new Date().toISOString()

export function registerCarouselsIpc(d: CarouselsDeps): void {
  const assetsFor = async (brand: string | null): Promise<CarouselAssets> => {
    const def = await d.defaultsFor(brand)
    return loadAssets({ fontsDir: d.fontsDir(), logo: def.logo, artDir: def.artDir })
  }
  const need = async (id: unknown): Promise<Carousel> => {
    const c = typeof id === 'string' ? await getCarousel(d.root(), id) : null
    if (!c) throw { code: 'NOT_FOUND', userMessage: 'That carousel is gone. It may have been deleted.' }
    return c
  }

  d.handle('carousels:list', () => listCarousels(d.root()))
  d.handle('carousels:create', async (_e, title: unknown) => {
    const brand = d.activeBrand()
    return createCarousel(d.root(), { title: typeof title === 'string' ? title : '', brand, defaults: await d.defaultsFor(brand), now: now() })
  })
  d.handle('carousels:save', (_e, raw: unknown) => saveCarousel(d.root(), raw, now()))
  // Writes the slides' words (illustrations stay), saves, and returns the carousel as saved.
  d.handle('carousels:draft', async (_e, id: unknown, topic: unknown, slides: unknown) => {
    const c = await need(id)
    const t = typeof topic === 'string' ? topic.replace(/\s+/g, ' ').trim().slice(0, 500) : ''
    if (!t) throw { code: 'EMPTY', userMessage: 'Tell me what the carousel is about first.' }
    const n = typeof slides === 'number' && Number.isFinite(slides) ? slides : 6
    const draft = await d.draft(c, t, n)
    // The AI takes up to a minute: put its words on the carousel as it is now, not as it was before the call.
    return saveCarousel(d.root(), applyDraft(await need(id), draft), now())
  })
  d.handle('carousels:remove', async (_e, id: unknown) => removeCarousel(d.root(), (await need(id)).id))
  // The carousel's own brand decides the logo and the art, whatever brand is in use now.
  d.handle('carousels:assets', async (_e, id: unknown) => assetsFor((await need(id)).brand))
  d.handle('carousels:export', async (_e, id: unknown): Promise<CarouselExport> => {
    const c = await need(id)
    const folder = join(carouselDir(d.root(), c.id), SLIDES_DIR)
    const files = await d.exportSlides(c, await assetsFor(c.brand), folder)
    // the caption goes beside the slides, ready to paste under the post
    const text = [c.caption, c.hashtags.join(' ')].filter(Boolean).join('\n\n')
    if (text) await writeFile(join(folder, 'caption.txt'), text + '\n', 'utf8')
    else await rm(join(folder, 'caption.txt'), { force: true }) // an emptied caption must not leave the old one
    return { folder, files }
  })
  d.handle('carousels:reveal', async (_e, id: unknown) => d.reveal(join(carouselDir(d.root(), (await need(id)).id), SLIDES_DIR)))
}
