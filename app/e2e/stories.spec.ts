// The Stories page: a story is made from a topic, drafted with the (mock) AI, edited, voiced (the fake engine returns a
// silent WAV and a timing), previewed with the scrub bar, exported to a 1080 x 1920 MP4 and deleted.
// Needs the coordinator's wiring (route 'stories', nav item with data-testid "nav-stories", IPC) to run.
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, ROOT, launch, passFirstRun, shot } from './helpers'

// A stand-in brand in a temp folder: never the person's real brand files.
const BRANDS = join(BASE, 'story-brands')
const ID = 'why-recruiters-skip-your-cv'
const DIR = join(ROOT, 'Stories', ID)

test.beforeAll(() => {
  mkdirSync(BRANDS, { recursive: true })
  writeFileSync(join(BRANDS, 'standin.md'), ['# Brand profile: Stand-in (a test brand)', '## Identity', '- instagram: @standin.test', ''].join('\n'))
})

/** Width, height and duration of the first video stream, by ffprobe. */
function probe(file: string): { w: number; h: number; seconds: number } {
  const bin = process.env.REELENGINE_FFPROBE ?? 'ffprobe'
  const out = execFileSync(bin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' })
  const j = JSON.parse(out) as { streams: { width: number; height: number }[]; format: { duration: string } }
  return { w: j.streams[0]!.width, h: j.streams[0]!.height, seconds: Number(j.format.duration) }
}

test('make a story, draft it, change a scene, make the voice, scrub, export and delete', async () => {
  test.setTimeout(240_000)
  const { app, page } = await launch({ REELFORGE_BRANDS: BRANDS })
  try {
    await passFirstRun(page)
    await page.getByTestId('brand-switch').locator('select').selectOption('standin')
    await page.getByTestId('nav-stories').click()
    await expect(page.getByTestId('stories')).toContainText('New ones are made for')

    await page.getByTestId('story-title').fill('Why recruiters skip your CV')
    await page.getByTestId('story-create').click()
    await expect(page.getByTestId('story-editor')).toBeVisible()
    await expect(page.getByLabel('Handle')).toHaveValue('@standin.test')

    // Nothing is written yet, so the draft needs no confirmation. The mock AI writes 12 lines.
    await page.getByTestId('story-write').click()
    await expect(page.getByTestId('story-line-12')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('story-line-1')).toContainText('Why recruiters skip your CV')
    const file = join(DIR, 'story.json')
    await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).lines.length).toBe(12)

    // Without a voice the export waits, and the preview plays silently.
    await expect(page.getByTestId('story-export')).toBeDisabled()
    await expect(page.getByTestId('story-player')).toContainText('No voice yet')

    // Line 3 is a number: change it to a plain line, then set its big word.
    await page.getByTestId('story-line-3').click()
    await expect(page.getByTestId('story-stat-value')).toHaveValue('27%')
    await page.getByTestId('story-type-line').click()
    await expect(page.getByTestId('story-type-line')).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('group', { name: 'Big word (one per line)' }).getByRole('button', { name: 'right', exact: true }).click()
    await expect(page.getByTestId('story-save-state')).toHaveText('Saved')
    await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).lines[2].scene).toMatchObject({ type: 'line', params: { hero: 'right' } })

    // The voice: the fake engine has the model, so it can be made at once.
    await page.getByTestId('story-make-voice').click()
    await expect(page.getByTestId('story-voice-ok')).toBeVisible({ timeout: 60_000 })
    expect(existsSync(join(DIR, 'audio', 'vo.wav'))).toBe(true)
    await expect(page.getByTestId('story-export')).toBeEnabled()

    // Scrub the preview: the time follows the bar, and the arrow keys move a second.
    const scrub = page.getByTestId('story-scrub')
    await scrub.focus()
    await scrub.fill('5')
    await expect(page.getByTestId('story-time')).toContainText('0:05')
    await page.getByTestId('story-play').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('story-time')).toContainText('0:06')
    await expect(page.locator('.story-frame iframe')).toHaveAttribute('sandbox', 'allow-scripts')
    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await shot(page, `story-editor-${width}`)
    }
    await page.setViewportSize({ width: 1280, height: 820 })

    // Editing the words makes the voice stale: the export waits for a new one.
    await page.getByTestId('story-line-2').click()
    await page.getByTestId('story-shown').fill('Most people never say it plainly')
    await expect(page.getByTestId('story-stale')).toContainText('make it again')
    await expect(page.getByTestId('story-export')).toBeDisabled()
    await page.getByTestId('story-make-voice').click()
    await expect(page.getByTestId('story-voice-ok')).toBeVisible({ timeout: 60_000 })

    // Export: a 1080 x 1920 MP4 of about the voice's length, and the caption beside it.
    await page.getByTestId('story-export').click()
    await expect(page.getByTestId('story-exported')).toBeVisible({ timeout: 200_000 })
    const mp4 = join(DIR, 'renders', `${ID}.mp4`)
    expect(statSync(mp4).size).toBeGreaterThan(10_000)
    const v = probe(mp4)
    expect({ w: v.w, h: v.h }).toEqual({ w: 1080, h: 1920 })
    expect(v.seconds).toBeGreaterThan(20)
    expect(readFileSync(join(DIR, 'renders', 'caption.txt'), 'utf8')).toContain('#story #mock')

    copyFileSync(mp4, join(__dirname, 'screenshots', 'story-export.mp4')) // kept for a look at the real frames

    // Back on the list the story is there; delete asks first, then removes the folder.
    await page.getByRole('button', { name: '← Stories' }).click()
    await expect(page.getByTestId(`story-${ID}`)).toBeVisible()
    await shot(page, 'stories-list')
    await page.getByTestId(`story-${ID}`).click()
    await page.getByRole('button', { name: 'Delete…' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByTestId('stories')).toBeVisible()
    expect(existsSync(file)).toBe(false)
  } finally {
    await app.close()
  }
})
