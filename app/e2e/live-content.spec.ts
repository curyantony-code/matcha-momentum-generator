// The whole path with nothing faked: the real engine, speech model and ffmpeg, the person's signed-in Claude Code app,
// and the real postiz program. It spends the person's Claude plan, so it runs only when asked:
//   REELSTUDIO_E2E_LIVE=1 REELSTUDIO_E2E_VIDEO=talk.mp4 REELSTUDIO_MODELS_DIR=<folder with the model> \
//   REELSTUDIO_ENGINE_DIR=../engine REELSTUDIO_E2E_AI=package REELSTUDIO_E2E_POSTIZ_DIR=<folder with postiz> \
//   npx playwright test e2e/live-content.spec.ts
// Nothing is posted: the Postiz program here is expected to be signed out, or signed in with no plan.
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, SHOTS, chooseClaudeCode, launch, shot } from './helpers'

const LIVE = !!process.env.REELSTUDIO_E2E_LIVE
const MINUTES = 60_000

test('a real talk becomes a reel, clips and posts', async () => {
  test.skip(!LIVE, 'set REELSTUDIO_E2E_LIVE=1')
  test.setTimeout(30 * MINUTES)
  mkdirSync(SHOTS, { recursive: true })
  const postiz = process.env.REELSTUDIO_E2E_POSTIZ_DIR
  const { app, page } = await launch({ PATH: `${postiz}:${process.env.PATH}` })

  await page.getByTestId('get-started').click()
  await page.getByTestId('model-next').click()
  expect(await chooseClaudeCode(page)).toBe(true)
  await expect(page.getByText('Your videos').or(page.getByText('Make your first reel')).first()).toBeVisible({ timeout: MINUTES })

  // ---- the AI edit, on real speech, with captions ----
  await page.getByTestId('new-video').click()
  await page.getByTestId('file-input').setInputFiles([process.env.REELSTUDIO_E2E_VIDEO as string])
  await expect(page.getByTestId('export')).toBeEnabled({ timeout: 12 * MINUTES })
  await shot(page, 'live-01-reel')
  const projects = join(ROOT, 'Projects')
  const slug = readdirSync(projects)[0]
  const finished = readdirSync(join(projects, slug, 'versions')).filter((v) => existsSync(join(projects, slug, 'versions', v, 'export.mp4')))
  expect(finished.length).toBeGreaterThan(0)

  // ---- other posts, from the real model ----
  await page.getByTestId('go-repurpose').click()
  await page.getByTestId('make-repurpose').click()
  await expect(page.getByTestId('repurpose-result')).toContainText('Newsletter', { timeout: 5 * MINUTES })
  await shot(page, 'live-02-repurpose')
  await page.getByText('Back to this video').click()

  // ---- signed out: the real program, and the sign-in steps ----
  await page.getByTestId('go-publish').click()
  // Signed out, or signed in with no plan: either way nothing can post, and the screen says what to do
  await expect(page.getByTestId('publish-setup')).toContainText(/Sign in to Postiz|Your Postiz account needs a plan/, { timeout: MINUTES })
  await shot(page, 'live-03-publish')
  await page.getByText('Back to this video').click()

  // ---- clips, last, because they start editing new videos ----
  await page.getByTestId('go-clips').click()
  await page.getByTestId('find-clips').click()
  await expect(page.getByTestId('clip-list')).toBeVisible({ timeout: 5 * MINUTES })
  await shot(page, 'live-04-clips')
  await page.getByTestId('make-clips').click()
  const clip = join(projects, `${slug}-clip-01`)
  await expect.poll(() => existsSync(join(clip, 'project.json')), { timeout: 3 * MINUTES }).toBe(true)
  await expect
    .poll(() => (existsSync(join(clip, 'versions')) ? readdirSync(join(clip, 'versions')).some((v) => existsSync(join(clip, 'versions', v, 'export.mp4'))) : false), {
      timeout: 12 * MINUTES,
      intervals: [5000]
    })
    .toBe(true)
  expect(JSON.parse(readFileSync(join(clip, 'project.json'), 'utf8')).sources.length).toBe(1)
  await page.getByTestId('nav-home').click()
  await shot(page, 'live-05-home')
  await app.close()
})
