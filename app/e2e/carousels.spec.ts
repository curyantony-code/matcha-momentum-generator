// The Carousels page: a carousel made for the brand in use starts in its style and kit, is edited with a live
// preview, saves itself, and exports 1080 × 1350 PNGs.
import { test, expect } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BASE, ROOT, launch, passFirstRun, shot } from './helpers'

const BRANDS = join(BASE, 'carousel-brands')
const KIT = join(BASE, 'kit')
const REAL_KIT = join(homedir(), 'matcha', 'content', 'brand', 'kit')
// A 1 × 1 PNG, for when the real kit is not on this computer.
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test.beforeAll(() => {
  mkdirSync(join(KIT, 'cut-paper'), { recursive: true })
  mkdirSync(BRANDS, { recursive: true })
  for (const art of ['06-heart-dark.svg', '02-paper-plane-dark.svg']) {
    try {
      copyFileSync(join(REAL_KIT, 'cut-paper', art), join(KIT, 'cut-paper', art))
    } catch {
      writeFileSync(join(KIT, 'cut-paper', art), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#F58D3D"/></svg>')
    }
  }
  try {
    copyFileSync(join(REAL_KIT, 'acme-horizontal-fullcolour-1200.png'), join(KIT, 'logo.png'))
  } catch {
    writeFileSync(join(KIT, 'logo.png'), PNG_1PX)
  }
  writeFileSync(
    join(BRANDS, 'acme.md'),
    [
      '# Brand profile: Acme (the page)',
      '## Identity',
      '- instagram: @acme.app',
      '## Look: short-form video',
      `- illustration: cut-paper style, from ${join(KIT, 'cut-paper')} (the -dark versions)`,
      `- logo: ${join(KIT, 'logo.png')} (full colour on dark only)`,
      '## Look: carousels',
      '- style preset: cut-paper (the brand kit)',
      ''
    ].join('\n')
  )
})

/** Width and height from a PNG's header. */
const pngSize = (file: string): { w: number; h: number } => {
  const b = readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

test('make a carousel for Acme, edit it, and export the slides', async () => {
  const { app, page } = await launch({ REELFORGE_BRANDS: BRANDS })
  try {
    await passFirstRun(page)
    await page.getByTestId('brand-switch').locator('select').selectOption('acme')
    await page.getByTestId('nav-carousels').click()
    await expect(page.getByTestId('carousels')).toContainText('New ones are made for Acme')

    await page.getByTestId('carousel-title').fill('Your CV hides who you are')
    await page.getByTestId('carousel-create').click()
    await expect(page.getByTestId('carousel-editor')).toBeVisible()
    await expect(page.getByTestId('style-cut-paper')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Handle')).toHaveValue('@acme.app')

    // Slide 1: pick the highlighted word and an illustration.
    await page.getByRole('group', { name: 'Highlighted word (one per slide)' }).getByRole('button', { name: 'hides', exact: true }).click()
    await page.getByRole('group', { name: 'Illustration (at most one)' }).getByRole('button', { name: 'heart' }).click()
    // Slide 2: new words.
    await page.getByTestId('thumb-2').click()
    await page.getByTestId('slide-headline').fill('Recruiters spend 7 seconds on a CV')
    await page.getByRole('button', { name: 'seconds', exact: true }).click()
    await expect(page.getByTestId('carousel-save-state')).toHaveText('Saved')

    const file = join(ROOT, 'Carousels', 'your-cv-hides-who-you-are', 'carousel.json')
    const saved = JSON.parse(readFileSync(file, 'utf8'))
    expect(saved.slides[0]).toMatchObject({ role: 'hook', highlight: 'hides', art: '06-heart-dark.svg' })
    expect(saved.slides[1]).toMatchObject({ headline: 'Recruiters spend 7 seconds on a CV', highlight: 'seconds' })

    await page.getByTestId('thumb-1').click()
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await shot(page, `carousel-editor-${width}`)
    }
    await page.setViewportSize({ width: 1280, height: 820 })

    await page.getByTestId('carousel-export').click()
    await expect(page.getByTestId('carousel-exported')).toHaveText('6 slides saved.', { timeout: 60_000 })
    const slides = join(ROOT, 'Carousels', 'your-cv-hides-who-you-are', 'slides')
    const pngs = readdirSync(slides).filter((f) => f.endsWith('.png')).sort()
    expect(pngs).toEqual(['01.png', '02.png', '03.png', '04.png', '05.png', '06.png'])
    expect(pngSize(join(slides, '01.png'))).toEqual({ w: 1080, h: 1350 })
    copyFileSync(join(slides, '01.png'), join(__dirname, 'screenshots', 'carousel-export-01.png'))
    copyFileSync(join(slides, '06.png'), join(__dirname, 'screenshots', 'carousel-export-06.png'))

    // The other two styles, for a look (the preview is the same HTML the export draws).
    for (const style of ['editorial', 'midnight']) {
      await page.getByTestId(`style-${style}`).click()
      await expect(page.getByTestId(`style-${style}`)).toHaveAttribute('aria-pressed', 'true')
      await page.waitForTimeout(600)
      await page.locator('.carousel-preview > .slide-frame').screenshot({ path: join(__dirname, 'screenshots', `carousel-style-${style}.png`) })
    }
    await page.getByTestId('style-cut-paper').click()

    // Back on the list, the carousel is there. An edit typed just before leaving is kept.
    await page.getByTestId('thumb-3').click()
    await page.getByTestId('slide-headline').fill('Typed right before leaving')
    await page.getByRole('button', { name: '← Carousels' }).click()
    await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).slides[2].headline).toBe('Typed right before leaving')
    await expect(page.getByTestId('carousel-your-cv-hides-who-you-are')).toBeVisible()
    await shot(page, 'carousels-list')

    // Delete asks first, then removes the folder.
    await page.getByTestId('carousel-your-cv-hides-who-you-are').click()
    await page.getByRole('button', { name: 'Delete…' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByTestId('carousels')).toBeVisible()
    expect(existsSync(file)).toBe(false)
  } finally {
    await app.close()
  }
})

test('write the slides with AI: a fresh carousel at once, an edited one only after asking', async () => {
  const { app, page } = await launch({ REELFORGE_BRANDS: BRANDS })
  try {
    await passFirstRun(page)
    await page.getByTestId('brand-switch').locator('select').selectOption('acme')
    await page.getByTestId('nav-carousels').click()
    await page.getByTestId('carousel-title').fill('Why recruiters skip your CV')
    await page.getByTestId('carousel-create').click()
    const file = join(ROOT, 'Carousels', 'why-recruiters-skip-your-cv', 'carousel.json')

    // Fresh: it writes straight away.
    await page.getByTestId('writer-run').click()
    await expect(page.getByTestId('slide-headline')).toHaveValue('Why recruiters skip your CV')
    await expect(page.getByTestId('caption-text')).toHaveValue(/One idea per slide/)
    const drafted = JSON.parse(readFileSync(file, 'utf8'))
    expect(drafted.slides.map((s: { headline: string }) => s.headline)).toEqual([
      'Why recruiters skip your CV', 'Most people never say it', 'Here is what changes it', 'Do this one thing today', 'Then watch what happens', 'Follow for more'
    ])
    expect(drafted.hashtags).toEqual(['#carousel', '#mock'])
    await shot(page, 'carousel-drafted')

    // Edited: it asks first, and the illustration stays.
    await page.getByRole('group', { name: 'Illustration (at most one)' }).getByRole('button', { name: 'heart' }).click()
    await page.getByTestId('thumb-2').click()
    await page.getByTestId('slide-headline').fill('My own words')
    await page.getByTestId('writer-run').click()
    await expect(page.getByRole('alert')).toContainText('replaces the words')
    await page.getByRole('button', { name: 'Keep mine' }).click()
    await expect(page.getByRole('alert')).toBeHidden()
    await page.getByTestId('writer-run').click()
    await page.getByTestId('writer-replace').click()
    await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).slides[1].headline).toBe('Most people never say it')
    expect(JSON.parse(readFileSync(file, 'utf8')).slides[0].art).toBe('06-heart-dark.svg')

    // Export puts the caption beside the slides.
    await page.getByTestId('carousel-export').click()
    await expect(page.getByTestId('carousel-exported')).toHaveText('6 slides saved.', { timeout: 60_000 })
    const caption = readFileSync(join(ROOT, 'Carousels', 'why-recruiters-skip-your-cv', 'slides', 'caption.txt'), 'utf8')
    expect(caption).toContain('Why recruiters skip your CV')
    expect(caption).toContain('#carousel #mock')
  } finally {
    await app.close()
  }
})
