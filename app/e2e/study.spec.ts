// Study reels end to end with the stand-in engine (no network) and the stand-in AI: paste a video, a creator and a
// line it can't read; watch them download, measure and get broken down; open one; send it to the writer as a concept,
// a beat template and a research note; a private video fails in plain words. Writes only to a throwaway folder.
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, launch, passFirstRun, shot } from './helpers'

const MINE = mkdtempSync(join(BASE, 'study-'))
const USER_DATA = join(MINE, 'user data')
const AGENT = join(MINE, 'video-agent')
const env = { REELSTUDIO_ROOT: join(MINE, 'Documents', 'Matcha Momentum Generator'), REELSTUDIO_USER_DATA: USER_DATA }

test('study reels: paste, study, open, and send it on to the writer', async () => {
  mkdirSync(AGENT, { recursive: true })
  mkdirSync(USER_DATA, { recursive: true })
  writeFileSync(join(AGENT, 'voice.md'), '# Voice\nI build an app in public.\n')
  writeFileSync(join(AGENT, 'swipe.md'), '# Swipe\n\n## Concepts\n\n### Bold claim\n- x\n')
  writeFileSync(join(USER_DATA, 'settings.json'), JSON.stringify({ voiceFile: join(AGENT, 'voice.md') }))

  const { app, page } = await launch(env)
  try {
    await passFirstRun(page)
    await page.getByTestId('nav-study').click()
    await expect(page.getByTestId('study-empty')).toBeVisible()

    await page.getByTestId('study-text').fill('https://www.tiktok.com/@maker/video/123\n@coach_amy\nhello there\nhttps://www.instagram.com/p/private1/')
    await expect(page.getByTestId('study-understood')).toContainText('2 videos')
    await expect(page.getByTestId('study-understood')).toContainText('1 creator')
    await expect(page.getByTestId('study-understood')).toContainText('Not understood: hello')
    await shot(page, 'study-paste')
    await page.getByRole('radio', { name: '3' }).click()
    await page.getByTestId('study-add').click()
    await expect(page.getByTestId('study-text')).toHaveValue('')

    // the creator's 3 most viewed (of 6 listed) + the 2 pasted videos
    await expect(page.getByTestId('study-reel')).toHaveCount(5, { timeout: 30_000 })
    await expect(page.locator('[data-testid="study-reel"][data-status="done"]')).toHaveCount(4, { timeout: 90_000 })
    const failed = page.locator('[data-testid="study-reel"][data-status="failed"]')
    await expect(failed).toHaveCount(1)
    await expect(failed).toContainText('private, removed or not available')
    await expect(page.getByTestId('creator-patterns')).toContainText('3 videos studied', { timeout: 30_000 })
    await expect(page.getByTestId('study-creator')).toContainText('usually 5.3k views')
    await expect(page.locator('[data-testid="study-reel"]').filter({ hasText: '@coach_amy' }).first()).toContainText('×')
    await shot(page, 'study-list')

    // one study: the timeline, then each tab
    await page.locator('[data-testid="study-reel"][data-status="done"]').filter({ hasText: '@maker' }).locator('.study-poster').click()
    await expect(page.getByTestId('study-reel-page')).toBeVisible()
    await expect(page.getByTestId('study-facts')).toContainText('20.0 cuts a minute')
    await expect(page.getByTestId('study-script')).toContainText('this is how I got')
    // the keyboard: arrows move between tabs and only the open tab is a Tab stop (a11y-keys.ts)
    await page.getByTestId('study-tab-script').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('study-formula')).toBeVisible()
    await expect(page.getByTestId('study-tab-formula')).toBeFocused()
    await expect(page.getByTestId('study-tab-script')).toHaveAttribute('tabindex', '-1')
    await page.keyboard.press('Home')
    await expect(page.getByTestId('study-script')).toBeVisible()
    await page.getByTestId('study-tab-formula').click()
    await expect(page.getByTestId('study-formula')).toContainText('Talk, then show')
    await page.getByTestId('study-tab-edit').click()
    await expect(page.getByTestId('study-edit')).toContainText('160')
    await page.getByTestId('study-tab-why').click()
    await expect(page.getByTestId('study-why')).toContainText('Try this in your own videos')
    await shot(page, 'study-reel')

    // send it on
    await page.getByTestId('study-to-concept').click()
    await expect(page.getByTestId('study-to-concept')).toContainText('In your niche concepts')
    const swipe = readFileSync(join(AGENT, 'swipe.md'), 'utf8')
    expect(swipe).toContain('### Bold claim')
    expect(swipe).toContain('### Talk, then show (studied: @maker)')
    await page.getByTestId('study-to-template').click()
    await expect(page.getByTestId('study-to-template')).toContainText('Saved as a template')
    const settings = JSON.parse(readFileSync(join(USER_DATA, 'settings.json'), 'utf8'))
    expect(settings.beatTemplates.map((t: { name: string; basedOn?: string }) => [t.name, t.basedOn])).toEqual([['Talk, then show', "@maker's TikTok"]])
    expect(settings.beatTemplate ?? 'life-climb').toBe('life-climb')
    await page.getByTestId('study-to-research').click()
    await expect(page.getByTestId('study-to-research')).toContainText('Saved to research')
    const notes = readdirSync(join(AGENT, 'research'))
    expect(notes).toHaveLength(1)
    expect(readFileSync(join(AGENT, 'research', notes[0]!), 'utf8')).toContain('Learn the shape, never the words.')

    // the Content engine shows the new template with what it's based on
    await page.getByTestId('nav-engine').click()
    await expect(page.getByTestId('skills-map')).toBeVisible()
    await expect(page.getByTestId("engine-template-" + settings.beatTemplates[0].id)).toContainText("@maker's TikTok")

    // studies survive a restart
    expect(existsSync(join(env.REELSTUDIO_ROOT, 'Study', 'reels'))).toBe(true)
  } finally {
    await app.close()
  }
})
