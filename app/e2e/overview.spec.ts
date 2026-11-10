// The screens that make the background visible: What's performing (honest when nothing is scored), Content engine
// (the writer's files, the skills behind each stage, templates and what they're based on, scripts) and System health (every part checked, Check again).
import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, launch, passFirstRun, shot } from './helpers'

const MINE = mkdtempSync(join(BASE, 'overview-'))
const env = { REELSTUDIO_ROOT: join(MINE, 'Documents', 'Matcha Momentum Generator'), REELSTUDIO_USER_DATA: join(MINE, 'user data') }

test('what is performing, the content engine and system health', async () => {
  const { app, page } = await launch(env)
  try {
    await passFirstRun(page)

    await page.getByTestId('nav-performing').click()
    await expect(page.getByTestId('performing')).toBeVisible()
    await expect(page.getByTestId('performing-empty')).toContainText('Nothing scored yet')
    await shot(page, 'performing-empty')

    await page.getByTestId('nav-engine').click()
    await expect(page.getByTestId('engine')).toBeVisible()
    for (const f of ['voice', 'framework', 'brand', 'rankings', 'swipe']) await expect(page.getByTestId(`engine-file-${f}`)).toBeVisible()
    // the skills map: open a skill to see its rules and where they apply
    await expect(page.getByTestId('skills-map')).toBeVisible()
    await page.getByTestId('skill-short-form-video-script').getByRole('button').click()
    await expect(page.getByTestId('skills-map')).toContainText('The muted version first')
    await expect(page.getByTestId('engine-template-one-take-proof')).toContainText('The reference reels study')
    await expect(page.getByTestId('engine')).toContainText('Motion cards are on')
    await shot(page, 'engine')

    await page.getByTestId('nav-health').click()
    await expect(page.getByTestId('health')).toBeVisible()
    await expect(page.getByTestId('health-check').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('health-summary')).toContainText(/Everything is working|need/)
    await expect(page.getByTestId('health')).toContainText('AI editor')
    await page.getByTestId('health-recheck').click()
    await expect(page.getByTestId('health-recheck')).toBeEnabled({ timeout: 60_000 })
    await shot(page, 'health')
  } finally {
    await app.close()
  }
})
