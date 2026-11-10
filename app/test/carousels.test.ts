import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCarousel, getCarousel, listCarousels, loadAssets, removeCarousel, saveCarousel } from '../src/main/carousels'

let root: string
const defaults = { style: 'cut-paper' as const, handle: '@acme', logo: null, artDir: null }
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'carousels-'))
})
afterEach(() => fs.rm(root, { recursive: true, force: true }))

describe('carousel store', () => {
  it('creates one with a folder named after the title, and a new name for the same title', async () => {
    const a = await createCarousel(root, { title: 'Your CV hides you', brand: 'acme', defaults, now: '2026-11-05T10:00:00.000Z' })
    const b = await createCarousel(root, { title: 'Your CV hides you', brand: 'acme', defaults, now: '2026-11-05T10:00:01.000Z' })
    expect(a.id).toBe('your-cv-hides-you')
    expect(b.id).toBe('your-cv-hides-you-2')
    expect(a).toMatchObject({ style: 'cut-paper', handle: '@acme', brand: 'acme' })
    expect(JSON.parse(await fs.readFile(join(root, 'Carousels', a.id, 'carousel.json'), 'utf8')).title).toBe('Your CV hides you')
  })

  it('lists them newest first', async () => {
    await createCarousel(root, { title: 'Old', brand: null, defaults, now: '2026-11-01T00:00:00.000Z' })
    await createCarousel(root, { title: 'New', brand: null, defaults, now: '2026-11-05T00:00:00.000Z' })
    expect((await listCarousels(root)).map((c) => c.title)).toEqual(['New', 'Old'])
  })

  it('returns an empty list with no Carousels folder, and skips a broken file', async () => {
    expect(await listCarousels(root)).toEqual([])
    await fs.mkdir(join(root, 'Carousels', 'broken'), { recursive: true })
    await fs.writeFile(join(root, 'Carousels', 'broken', 'carousel.json'), '{nope')
    expect(await listCarousels(root)).toEqual([])
  })

  it('saves a cleaned copy with a new updatedAt, and never under another id', async () => {
    const c = await createCarousel(root, { title: 'T', brand: null, defaults, now: '2026-11-05T10:00:00.000Z' })
    const saved = await saveCarousel(root, { ...c, title: 'Better', slides: c.slides.map((s) => ({ ...s, art: '../x.svg' })) }, '2026-11-05T11:00:00.000Z')
    expect(saved.title).toBe('Better')
    expect(saved.updatedAt).toBe('2026-11-05T11:00:00.000Z')
    expect(saved.slides[0]!.art).toBeNull()
    expect((await getCarousel(root, c.id))!.title).toBe('Better')
    await expect(saveCarousel(root, { ...c, id: 'not-there' }, 'x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(saveCarousel(root, { nope: 1 }, 'x')).rejects.toMatchObject({ code: 'BAD_CAROUSEL' })
  })

  it('removes one, and refuses a name that could leave the folder', async () => {
    const c = await createCarousel(root, { title: 'Gone', brand: null, defaults, now: 'x' })
    await removeCarousel(root, c.id)
    expect(await getCarousel(root, c.id)).toBeNull()
    await expect(removeCarousel(root, '../..')).rejects.toMatchObject({ code: 'BAD_CAROUSEL' })
    expect(await getCarousel(root, '../..')).toBeNull()
  })
})

describe('loadAssets', () => {
  it('reads the fonts, the logo and the art as data URLs, listing the art by name', async () => {
    const fonts = join(root, 'fonts')
    const art = join(root, 'art')
    await fs.mkdir(fonts)
    await fs.mkdir(art)
    for (const f of ['Fraunces_700Bold.ttf', 'Figtree-SemiBold.ttf', 'Figtree-Bold.ttf']) await fs.writeFile(join(fonts, f), 'x')
    await fs.writeFile(join(art, '06-heart-dark.svg'), '<svg/>')
    await fs.writeFile(join(art, 'README.txt'), 'not art')
    await fs.writeFile(join(root, 'logo.png'), 'png')
    const a = await loadAssets({ fontsDir: fonts, logo: join(root, 'logo.png'), artDir: art })
    expect(a.fonts.display).toMatch(/^data:font\/ttf;base64,/)
    expect(a.logo).toMatch(/^data:image\/png;base64,/)
    expect(Object.keys(a.art)).toEqual(['06-heart-dark.svg'])
    expect(a.art['06-heart-dark.svg']).toMatch(/^data:image\/svg\+xml;base64,/)
  })

  it('leaves out what is missing instead of failing', async () => {
    const a = await loadAssets({ fontsDir: join(root, 'none'), logo: join(root, 'none.png'), artDir: null })
    expect(a).toEqual({ fonts: { display: '', text: '', textBold: '' }, logo: null, art: {} })
  })
})

describe('loadAssets size cap', () => {
  it('stops adding art once the total would pass the cap', async () => {
    const { loadAssets, MAX_ART_TOTAL_BYTES } = await import('../src/main/carousels')
    const art = join(root, 'big-art')
    await fs.mkdir(art)
    const chunk = Math.ceil(MAX_ART_TOTAL_BYTES / 3)
    for (const n of ['a.svg', 'b.svg', 'c.svg', 'd.svg']) await fs.writeFile(join(art, n), 'x'.repeat(chunk))
    const a = await loadAssets({ fontsDir: null, logo: null, artDir: art })
    expect(Object.keys(a.art)).toEqual(['a.svg', 'b.svg'])
  })
})
