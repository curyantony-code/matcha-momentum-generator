// Settings > Motion cards: on by default, and turning it off is kept in the settings file across restarts.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { USER_DATA, launch, passFirstRun, shot } from './helpers'

const saved = (): Record<string, unknown> => JSON.parse(readFileSync(join(USER_DATA, 'settings.json'), 'utf8'))

test('motion cards are on by default and the switch is kept', async () => {
  let { app, page } = await launch()
  try {
    await passFirstRun(page)
    await page.getByTestId('nav-settings').click()
    const toggle = page.getByTestId('motion-cards')
    await expect(toggle).toBeChecked()
    await toggle.scrollIntoViewIfNeeded()
    await shot(page, 'settings-motion-cards')
    await toggle.uncheck()
    await expect(toggle).not.toBeChecked()
    await expect.poll(() => saved().motionCards).toBe(false)
  } finally {
    await app.close()
  }
  ;({ app, page } = await launch())
  try {
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('motion-cards')).not.toBeChecked()
    await page.getByTestId('motion-cards').check()
    await expect.poll(() => saved().motionCards).toBe(true)
  } finally {
    await app.close()
  }
})
