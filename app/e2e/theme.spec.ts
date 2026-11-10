// Settings > Appearance: dark (the edit bay) by default, light and "match system" apply at once and survive a restart.
import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, launch, passFirstRun, shot } from './helpers'

const MINE = mkdtempSync(join(BASE, 'theme-'))
const env = { REELSTUDIO_ROOT: join(MINE, 'Documents', 'Matcha Momentum Generator'), REELSTUDIO_USER_DATA: join(MINE, 'user data') }
const saved = (): Record<string, unknown> => JSON.parse(readFileSync(join(env.REELSTUDIO_USER_DATA, 'settings.json'), 'utf8'))
const themeOf = (page: import('@playwright/test').Page) => page.evaluate(() => document.documentElement.dataset.theme)

test('dark by default; light applies at once and is kept after a restart', async () => {
  let { app, page } = await launch(env)
  try {
    await passFirstRun(page)
    await expect.poll(() => themeOf(page)).toBe('dark')
    await page.getByTestId('nav-settings').click()
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true')
    await shot(page, 'theme-dark-settings')
    await page.getByTestId('theme-light').click()
    await expect.poll(() => themeOf(page)).toBe('light')
    await expect.poll(() => saved().theme).toBe('light')
    await shot(page, 'theme-light-settings')
    await page.getByTestId('nav-home').click()
    await shot(page, 'theme-light-home')
  } finally {
    await app.close()
  }
  ;({ app, page } = await launch(env))
  try {
    await expect.poll(() => themeOf(page)).toBe('light')
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('theme-system').click()
    await expect.poll(() => saved().theme).toBe('system')
    expect(['dark', 'light']).toContain(await themeOf(page))
    await page.getByTestId('theme-dark').click()
    await expect.poll(() => themeOf(page)).toBe('dark')
  } finally {
    await app.close()
  }
})
