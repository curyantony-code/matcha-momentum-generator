// Study reels for real: the real engine downloads three public videos (Instagram, YouTube, TikTok), transcribes and
// measures them on this Mac, and your own AI breaks each one down. Opt-in (network, your AI plan):
//   REELSTUDIO_E2E_LIVE_STUDY=claude-cli (or codex-cli)  REELSTUDIO_ENGINE_DIR=<repo>/engine
//   REELSTUDIO_PYTHON=<repo>/engine/.venv/bin/python  REELSTUDIO_MODELS_DIR=<folder holding the speech model>
//   REELENGINE_FFMPEG / REELENGINE_FFPROBE = the bundled ffmpeg   [REELSTUDIO_E2E_STUDY_LINKS=<link>;<link>]
import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, SHOTS, launch, passFirstRun, shot } from './helpers'

const PROVIDER = process.env.REELSTUDIO_E2E_LIVE_STUDY
test.skip(!PROVIDER, 'set REELSTUDIO_E2E_LIVE_STUDY to run')

const LINKS = (process.env.REELSTUDIO_E2E_STUDY_LINKS ?? 'https://www.instagram.com/p/DXUay41ivSK/;https://www.youtube.com/shorts/kPI9Mc35mOg;https://www.tiktok.com/@scout2015/video/6718335390845095173').split(';')

test('study three real videos with the real engine and a live AI', async () => {
  test.setTimeout(30 * 60_000)
  mkdirSync(join(SHOTS, 'live'), { recursive: true })
  const MINE = mkdtempSync(join(BASE, 'live-study-'))
  const { app, page } = await launch({ REELSTUDIO_DEV: '1', REELSTUDIO_MOCK_AI: '0', REELSTUDIO_ROOT: join(MINE, 'Matcha Momentum Generator') })
  try {
    await passFirstRun(page)
    await page.getByTestId('nav-settings').click()
    await page.getByTestId(`provider-${PROVIDER}`).click()
    await expect(page.getByTestId(`provider-${PROVIDER}`)).toHaveClass(/active/)

    await page.getByTestId('nav-study').click()
    await page.getByTestId('study-text').fill(LINKS.join('\n'))
    await page.getByTestId('study-add').click()
    const cards = page.getByTestId('study-reel')
    await expect(cards).toHaveCount(LINKS.length)
    await expect.poll(async () => page.locator('[data-testid="study-reel"][data-status="done"], [data-testid="study-reel"][data-status="failed"]').count(), { timeout: 25 * 60_000, intervals: [10_000] }).toBe(LINKS.length)
    await shot(page, 'live/study-list')
    for (const t of await page.locator('[data-testid="study-reel"][data-status="failed"]').allInnerTexts()) console.log('FAILED: ' + t.replace(/\s+/g, ' '))
    const done = page.locator('[data-testid="study-reel"][data-status="done"]')
    expect(await done.count()).toBeGreaterThan(0)

    await done.first().locator('.study-poster').click()
    await expect(page.getByTestId('study-script')).toBeVisible()
    await shot(page, 'live/study-script')
    for (const tab of ['formula', 'edit', 'why']) {
      await page.getByTestId(`study-tab-${tab}`).click()
      await expect(page.getByTestId(`study-${tab}`)).toBeVisible()
      await shot(page, `live/study-${tab}`)
    }
  } finally {
    await app.close()
  }
})
