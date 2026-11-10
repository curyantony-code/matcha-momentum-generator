// Home's contact sheet and "How it was made": a new reel opens its timeline from Home and from the reel screen, with
// the lanes, the facts line and its checks; clicking a lane jumps the video.
import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, launch, makeMedia, passFirstRun, shot } from './helpers'

const MINE = mkdtempSync(join(BASE, 'made-'))
const env = { REELSTUDIO_ROOT: join(MINE, 'Documents', 'Matcha Momentum Generator'), REELSTUDIO_USER_DATA: join(MINE, 'user data') }

test('a finished reel shows how it was made', async () => {
  test.setTimeout(10 * 60_000)
  const media = makeMedia()
  const { app, page } = await launch(env)
  try {
    await passFirstRun(page)
    await page.getByTestId('new-video').click()
    await page.getByTestId('file-input').setInputFiles([media.video])
    await expect(page.getByTestId('player')).toBeVisible({ timeout: 8 * 60_000 })

    // from the reel screen
    await page.getByTestId('reel-how-made').click()
    await expect(page.getByTestId('how-made')).toBeVisible()
    for (const lane of ['lane-cut', 'lane-words', 'lane-cards', 'lane-zooms']) await expect(page.getByTestId(lane)).toBeVisible()
    await expect(page.getByTestId('made-facts')).toContainText(/s (kept from|long)/)
    await expect(page.getByTestId('lane-cut').locator('.clip').first()).toBeVisible()
    await shot(page, 'how-made')

    // a lane click moves the video
    const player = page.getByTestId('made-player')
    await expect(player).toBeVisible()
    const clips = page.getByTestId('lane-cut').locator('.clip')
    if ((await clips.count()) > 1) {
      await clips.nth(1).click()
      await expect.poll(() => player.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0)
    }

    // and from Home, the poster's link
    await page.getByTestId('nav-home').click()
    await expect(page.getByTestId('project-card')).toHaveCount(1)
    await shot(page, 'home-sheet')
    await page.getByTestId('poster-how-made').click()
    await expect(page.getByTestId('how-made')).toBeVisible()
  } finally {
    await app.close()
  }
})
