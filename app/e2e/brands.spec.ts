// The Brands tab: shows each brand profile, fills a {{to fill}} value, saves it into the file, and refuses to
// overwrite a file that changed outside the app.
import { test, expect } from '@playwright/test'
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BASE, ROOT, launch, passFirstRun, shot } from './helpers'
import { existsSync } from 'node:fs'

const BRANDS = join(BASE, 'brands')
// The real profiles when they are on this computer, else a small stand-in, so the test never writes to the real ones.
const REAL = join(homedir(), 'matcha', 'content', 'brands')
const STANDIN = '# Brand profile: Personal\n\n## Identity\n- name: Sam\n- instagram: {{to fill}} @handle\n\n## Voice: {{Alex}}\n- tone: {{Alex}}\n'

test.beforeAll(() => {
  mkdirSync(BRANDS, { recursive: true })
  for (const id of ['personal', 'acme']) {
    try {
      copyFileSync(join(REAL, `${id}.md`), join(BRANDS, `${id}.md`))
    } catch {
      writeFileSync(join(BRANDS, `${id}.md`), id === 'personal' ? STANDIN : STANDIN.replace('Personal', 'Acme (the page)'))
    }
  }
  // the test empties a rule (a plain "- …" line): give the copy one of its own, whatever the real profile holds
  appendFileSync(join(BRANDS, 'personal.md'), '\n## Rules\n- Keep every caption short.\n')
})

test('fill a value on the Brands tab and it is saved into the file', async () => {
  const { app, page } = await launch({ REELFORGE_BRANDS: BRANDS })
  try {
    await passFirstRun(page)
    await page.getByTestId('nav-brands').click()
    await expect(page.getByTestId('brands')).toBeVisible()
    await expect(page.getByTestId('brand-personal')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('brand-pending')).toContainText('to fill')
    await expect(page.getByTestId('brand-kind')).toContainText(/A person|A company brand/)

    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await shot(page, `brands-${width}`)
    }
    await page.getByTestId('brand-acme').click()
    await shot(page, 'brands-acme-1440')
    await page.getByRole('heading', { name: 'Voice', exact: true }).scrollIntoViewIfNeeded()
    await shot(page, 'brands-acme-voice')
    await page.getByTestId('brand-personal').click()
    await page.setViewportSize({ width: 1280, height: 820 })

    const insta = page.getByRole('textbox', { name: 'instagram', exact: true })
    await expect(insta).toHaveValue('')
    await insta.fill('@sam.e2e')
    await expect(page.getByRole('region', { name: 'Unsaved changes' })).toContainText('1 change')
    await page.getByTestId('brand-save').click()
    await expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeHidden()
    expect(readFileSync(join(BRANDS, 'personal.md'), 'utf8')).toMatch(/^- instagram: @sam\.e2e$/m)

    // Emptying a rule can't be saved: the bar says why and Save is off until it has words again.
    const rule = page.getByRole('textbox', { name: 'Rules 1', exact: true }) // the rule this test added
    const ruleText = await rule.inputValue()
    await rule.fill('')
    await expect(page.getByRole('region', { name: 'Unsaved changes' })).toContainText('can’t be empty')
    await expect(page.getByTestId('brand-save')).toBeDisabled()
    await rule.fill(ruleText)
    await expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeHidden()

    // Changed in another app since the tab read it: the save is refused, and the tab reloads the file.
    const file = join(BRANDS, 'personal.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('@sam.e2e', '@changed.elsewhere'))
    await page.getByRole('textbox', { name: 'name', exact: true }).first().fill('Someone')
    await page.getByTestId('brand-save').click()
    await expect(page.getByText('changed outside the app')).toBeVisible()
    await expect(insta).toHaveValue('@changed.elsewhere')
    await expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeHidden()
    expect(readFileSync(file, 'utf8')).toContain('@changed.elsewhere')
  } finally {
    await app.close()
  }
})

test('the sidebar switch picks the brand, and each brand keeps its own My style rules', async () => {
  const { app, page } = await launch({ REELFORGE_BRANDS: BRANDS })
  try {
    await passFirstRun(page)
    const select = page.getByTestId('brand-switch').locator('select')
    await select.selectOption('acme')
    await shot(page, 'brand-switch-sidebar')

    await page.getByTestId('nav-style').click()
    await page.getByTestId('style-add-input').fill('Speak as we, never as I.')
    await page.getByTestId('style-add').click()
    await expect(page.getByTestId('style-rule').filter({ hasText: 'Speak as we' })).toBeVisible()
    const acmeRules = join(ROOT, 'My style (acme).json')
    await expect.poll(() => existsSync(acmeRules)).toBe(true)
    expect(readFileSync(acmeRules, 'utf8')).toContain('Speak as we, never as I.')

    // Personal keeps its own rules: the Acme one is not there.
    await select.selectOption('personal')
    await expect(page.getByTestId('style-add-input')).toBeVisible()
    await expect(page.getByTestId('style-rule').filter({ hasText: 'Speak as we' })).toHaveCount(0)

    // The Brands tab marks the brand in use, and can switch to the other one.
    await page.getByTestId('nav-brands').click()
    await expect(page.getByTestId('brand-personal')).toContainText('in use')
    await page.getByTestId('brand-acme').click()
    await page.getByTestId('brand-make-active').click()
    await expect(select).toHaveValue('acme')
    await expect(page.getByTestId('brand-acme')).toContainText('in use')
  } finally {
    await app.close()
  }

  // The pick is remembered on the next start.
  const again = await launch({ REELFORGE_BRANDS: BRANDS })
  try {
    await expect(again.page.getByTestId('brand-switch').locator('select')).toHaveValue('acme')
  } finally {
    await again.app.close()
  }

  // Its file gone: the switch says so instead of showing another brand's name.
  const acmeFile = join(BRANDS, 'acme.md')
  const kept = readFileSync(acmeFile, 'utf8')
  rmSync(acmeFile)
  const gone = await launch({ REELFORGE_BRANDS: BRANDS })
  try {
    await expect(gone.page.getByTestId('brand-switch').locator('select option:checked')).toHaveText('acme (file missing)')
  } finally {
    await gone.app.close()
    writeFileSync(acmeFile, kept)
  }
})
