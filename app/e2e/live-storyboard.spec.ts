// "Storyboard first", with nothing faked: the real engine and the person's Claude Code app. Runs only when asked,
// with the same environment as live-content.spec.ts (REELSTUDIO_E2E_LIVE=1 and the rest).
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, SHOTS, USER_DATA, chooseClaudeCode, launch, shot } from './helpers'

const LIVE = !!process.env.REELSTUDIO_E2E_LIVE
const MINUTES = 60_000

test('the first edit stops at a storyboard, and approving it makes the final video', async () => {
  test.skip(!LIVE, 'set REELSTUDIO_E2E_LIVE=1')
  test.setTimeout(30 * MINUTES)
  mkdirSync(SHOTS, { recursive: true })
  mkdirSync(USER_DATA, { recursive: true })
  writeFileSync(join(USER_DATA, 'settings.json'), JSON.stringify({ storyboardFirst: true }))
  const { app, page } = await launch()

  await page.getByTestId('get-started').click()
  await page.getByTestId('model-next').click()
  expect(await chooseClaudeCode(page)).toBe(true)
  await page.getByTestId('new-video').click()
  await page.getByTestId('file-input').setInputFiles([process.env.REELSTUDIO_E2E_VIDEO as string])

  const board = page.getByTestId('storyboard')
  await expect(board).toBeVisible({ timeout: 12 * MINUTES })
  await expect(board.getByTestId('scene').first()).toBeVisible({ timeout: 2 * MINUTES })
  const scenes = await board.getByTestId('scene').count()
  expect(scenes).toBeGreaterThan(1)
  const loaded = await board.locator('.scene-still img').evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length)
  expect(loaded).toBe(scenes)
  await shot(page, 'live-storyboard-01')

  const slug = readdirSync(join(ROOT, 'Projects'))[0]
  const versions = join(ROOT, 'Projects', slug, 'versions')
  const finals = () => readdirSync(versions).filter((v) => /^v\d+$/.test(v) && existsSync(join(versions, v, 'export.mp4')))
  expect(finals()).toEqual([]) // only a preview so far

  await page.getByTestId('approve-storyboard').click()
  await expect.poll(() => finals().length, { timeout: 12 * MINUTES, intervals: [5000] }).toBe(1)
  await expect(board).toBeHidden({ timeout: MINUTES })
  await shot(page, 'live-storyboard-02-final')
  await app.close()
})
