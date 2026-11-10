// The stages around the edit, in the real app: a saved script on the teleprompter and into a project, then clips,
// other posts and publishing from the Reel screen. A stand-in `postiz` program goes on PATH, so no account is touched.
import { test, expect } from '@playwright/test'
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE, ROOT, SHOTS, launch, makeMedia, passFirstRun, shot } from './helpers'

const SCRIPT = {
  id: 'saved-1',
  createdAt: '2026-11-01T00:00:00.000Z',
  hook: 'I lost 45 days to one bad habit.',
  script: Array(12).fill('Here is the first thing I changed, and it took one afternoon to do.').join('\n\n'),
  onScreenText: ['45 days'],
  hookFormula: 'Confession',
  hooks: [{ text: 'Nobody warned me about this habit.', formula: 'Nobody says it', words: 6, seconds: 2 }]
}
const ALT_HOOK = 'Nobody warned me about this habit.'

function fakePostiz(): { dir: string; log: string } {
  const dir = join(BASE, 'fake-postiz')
  const log = join(dir, 'calls.log')
  mkdirSync(dir, { recursive: true })
  const bin = join(dir, 'postiz')
  writeFileSync(
    bin,
    `#!/bin/sh
echo "$@" >> "${log}"
case "$1" in
  integrations:list) echo "Connected Integrations:"; echo '[{"id":"t1","name":"My TikTok","identifier":"tiktok"},{"id":"y1","name":"My YouTube","identifier":"youtube"}]';;
  integrations:settings) echo '{"output":{"maxLength":2200}}';;
  upload) echo '{"path":"https://cdn.example/v.mp4"}';;
  posts:create) echo '[{"postId":"p1"}]';;
esac
`
  )
  chmodSync(bin, 0o755)
  return { dir, log }
}

test('script to teleprompter to reel, then clips, posts and publishing', async () => {
  mkdirSync(SHOTS, { recursive: true })
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(join(ROOT, 'scripts.json'), JSON.stringify([SCRIPT]))
  const media = makeMedia()
  const postiz = fakePostiz()
  const { app, page } = await launch({ PATH: `${postiz.dir}:${process.env.PATH}` })
  await passFirstRun(page)

  // ---- a saved script, on the teleprompter ----
  await page.getByTestId('nav-home').click()
  await page.getByTestId('new-video').click()
  await page.getByText('I want help writing a script first').click()
  await expect(page.getByTestId('saved-scripts')).toContainText(SCRIPT.hook)
  await shot(page, 'content-01-saved-scripts')
  await page.getByTestId('saved-scripts').getByText(SCRIPT.hook).click()

  // ---- the person's own rewrite: swap the opening, change a line, save ----
  const editor = page.getByTestId('script-editor')
  // L.I.F.E.: a theme on every script (saved as soon as it is picked); every script climbs all three degrees
  await editor.getByTestId('script-theme').selectOption('Identity')
  await expect(editor.getByTestId('script-climb')).toHaveText('climbs Safe → Real → Raw → Purpose → Why → CTA')
  await expect(page.getByTestId('script-life-tag').first()).toHaveText('Identity')
  await expect(editor.getByLabel(/^Hook/)).toHaveValue(SCRIPT.hook)
  await expect(page.getByTestId('open-prompter')).toBeEnabled()
  await editor.getByTestId('other-hooks').getByText(ALT_HOOK).click()
  await expect(editor.getByLabel(/^Hook/)).toHaveValue(ALT_HOOK)
  await expect(editor.getByTestId('other-hooks')).toContainText(SCRIPT.hook) // the original stays one click away
  await expect(editor.getByTestId('other-hooks')).not.toContainText(ALT_HOOK)
  await expect(editor.getByText('Nobody says it').first()).toBeVisible() // the label follows the hook in use
  const body = editor.getByLabel(/What to say/)
  await body.fill((await body.inputValue()).replace('one afternoon', 'one quiet afternoon'))
  await expect(page.getByTestId('open-prompter')).toBeDisabled() // unsaved changes stay off the teleprompter
  await shot(page, 'content-01b-editor')
  await page.getByTestId('save-script').click()
  await expect(page.getByTestId('save-script')).toHaveText('Saved')
  const stored = JSON.parse(readFileSync(join(ROOT, 'scripts.json'), 'utf8'))[0]
  expect(stored.hook).toBe(ALT_HOOK)
  expect(stored.script.startsWith(ALT_HOOK)).toBe(true)
  expect(stored.script).toContain('one quiet afternoon')

  await page.getByTestId('open-prompter').click()
  await expect(page.getByTestId('teleprompter')).toContainText(ALT_HOOK)
  await expect(page.getByTestId('teleprompter')).toContainText('one quiet afternoon')
  await expect(page.getByTestId('prompter-length')).toContainText('About')

  const moved = () => page.locator('.prompter-text').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m42)
  expect(await moved()).toBe(0)
  await page.getByTestId('prompter-play').click()
  await expect.poll(moved).toBeLessThan(-1)
  await shot(page, 'content-02-teleprompter')
  await page.keyboard.press(' ') // pause from the keyboard
  await expect(page.getByTestId('prompter-play')).toHaveText('Start')

  // ---- film it: the script goes into the project ----
  await page.getByRole('button', { name: 'I filmed it' }).click()
  await expect(page.getByText('I will keep your script with this video.')).toBeVisible()
  await page.getByTestId('file-input').setInputFiles([media.video])
  await expect(page.getByTestId('export')).toBeVisible({ timeout: 90_000 })
  const projects = join(ROOT, 'Projects')
  const slug = readdirSync(projects)[0]
  const saved = JSON.parse(readFileSync(join(projects, slug, 'project.json'), 'utf8'))
  expect(saved.script.hook).toBe(ALT_HOOK) // the person's edited version is what goes into the project
  expect(saved.script.script).toContain('one quiet afternoon')
  await expect(page.getByTestId('export')).toBeEnabled({ timeout: 90_000 })

  // ---- no AI connected: both AI stages say so ----
  await page.getByTestId('go-clips').click()
  await page.getByTestId('find-clips').click()
  await expect(page.getByRole('alert')).toContainText('Connect')
  await shot(page, 'content-03-clips')
  await page.getByText('Back to this video').click()
  await page.getByTestId('go-repurpose').click()
  await page.getByTestId('make-repurpose').click()
  await expect(page.getByRole('alert')).toContainText('Connect')
  await shot(page, 'content-04-repurpose')
  await page.getByText('Back to this video').click()

  // ---- publish a draft through the stand-in postiz ----
  await page.getByTestId('go-publish').click()
  await expect(page.getByTestId('publish-form')).toContainText('My TikTok')
  await expect(page.getByTestId('publish-send')).toBeDisabled()
  await page.getByLabel(/My TikTok/).check()
  await page.getByLabel('Caption').fill('My new reel')
  await shot(page, 'content-05-publish')
  await page.getByTestId('publish-send').click()
  await expect(page.getByTestId('publish-done')).toContainText('Nothing is live yet', { timeout: 60_000 })

  const calls = readFileSync(postiz.log, 'utf8')
  expect(calls).toContain('upload ')
  expect(calls).toMatch(/posts:create .*-t draft .*-i t1/)
  expect(calls).toContain('DIRECT_POST')
  expect(calls).not.toContain('-i y1')
  expect(existsSync(join(projects, slug, 'versions'))).toBe(true)
  await app.close()
  // Specs share this worker's folder, and some read the first project in it.
  rmSync(join(projects, slug), { recursive: true, force: true })
  rmSync(join(ROOT, 'scripts.json'), { force: true })
})

test('your look: a default filter and subtitle style for new videos, and a filter per video', async () => {
  const media = makeMedia()
  const { app, page } = await launch()
  await passFirstRun(page)

  // ---- Settings > Your look ----
  await page.getByTestId('nav-settings').click()
  const yours = page.getByTestId('your-look')
  await yours.getByTestId('default-filter-mono').click()
  await yours.getByTestId('default-subs-mine').check()
  await yours.getByTestId('cap-size-range').fill('126')
  await yours.getByTestId('cap-look-box').click()
  await yours.getByTestId('cap-outline-color').fill('#1e1524')
  await yours.getByTestId('cap-font').selectOption('Roboto Medium')
  await yours.getByTestId('cap-case').selectOption('as-is')
  await expect(yours.getByTestId('default-filter-mono')).toHaveAttribute('aria-checked', 'true')
  // a template of this look, to use on one video later
  await yours.getByTestId('template-name').fill('Raw day')
  await yours.getByTestId('template-save').click()
  await expect(yours.getByTestId('look-templates')).toContainText('Raw day')
  await shot(page, 'content-07-your-look').catch(() => undefined) // a picture for review, not part of the check

  // ---- a new video starts with it ----
  await page.getByTestId('nav-home').click()
  await page.getByTestId('new-video').click()
  await expect(page.getByTestId('drop-zone')).toBeVisible()
  await page.getByTestId('file-input').setInputFiles([media.video])
  await expect(page.getByTestId('drop-zone')).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('export')).toBeEnabled({ timeout: 90_000 })
  const projects = join(ROOT, 'Projects')
  const slug = readdirSync(projects).find((s) => existsSync(join(projects, s, 'project.json')))!
  const project = () => JSON.parse(readFileSync(join(projects, slug, 'project.json'), 'utf8'))
  expect(project().look).toEqual({ filter: 'mono', autoColor: true }) // auto colour is on unless turned off
  expect(project().captions.style).toMatchObject({ size: 126, box: true, outlineColor: '#1E1524', font: 'Roboto Medium', case: 'as-is', preset: 'mine' })

  // ---- one video gets its own filter ----
  await page.getByTestId('edit-myself').click()
  await page.getByRole('tab', { name: 'Filter' }).or(page.getByRole('button', { name: 'Filter', exact: true })).first().click()
  await expect(page.getByTestId('filter-controls')).toBeVisible()
  await page.getByTestId('filter-warm').click()
  // ...and one style for all its picture cards
  await page.getByTestId('picture-style-rounded').click()
  await expect(page.getByTestId('picture-style-rounded')).toHaveAttribute('aria-checked', 'true')
  await shot(page, 'content-08-filter-tab').catch(() => undefined) // a picture for review, not part of the check
  await page.getByTestId('make-version').click()
  await expect.poll(() => project().look, { timeout: 60_000 }).toEqual({ filter: 'warm', autoColor: true, pictureStyle: 'rounded' })

  // ---- and sound effects, from the Music tab, once that version is done (no edits while it renders) ----
  await expect(page.getByTestId('versions').getByText('Version 2')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('export')).toBeEnabled({ timeout: 90_000 })
  await page.getByTestId('edit-myself').click()
  await page.getByRole('tab', { name: 'Music' }).or(page.getByRole('button', { name: 'Music', exact: true })).first().click()
  await page.getByTestId('sound-effects').check()
  await page.getByTestId('make-version').click()
  await expect.poll(() => project().soundEffects, { timeout: 60_000 }).toEqual({ enabled: true })

  // ---- the "Raw day" template on this one video: black and white, no sound effects ----
  await expect(page.getByTestId('versions').getByText('Version 3')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('export')).toBeEnabled({ timeout: 90_000 })
  await page.getByTestId('edit-myself').click()
  await page.getByRole('tab', { name: 'Filter' }).or(page.getByRole('button', { name: 'Filter', exact: true })).first().click()
  await page.getByTestId('apply-template').selectOption({ label: 'Raw day' })
  await page.getByTestId('make-version').click()
  // the template has no picture style, so the pictures go back to the usual cards
  await expect.poll(() => project().look, { timeout: 60_000 }).toEqual({ filter: 'mono', autoColor: true })
  expect(project().soundEffects).toEqual({ enabled: false })

  // ---- OpenReel styles: a caption look, a Quote text card in a brand font, a Lower Third for the whole video ----
  await expect(page.getByTestId('versions').getByText('Version 4')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('export')).toBeEnabled({ timeout: 90_000 })
  await page.getByTestId('edit-myself').click()
  await page.getByRole('tab', { name: 'Subtitles' }).or(page.getByRole('button', { name: 'Subtitles', exact: true })).first().click()
  await page.getByTestId('cap-openreel-or-cinematic').click()
  await page.getByRole('tab', { name: 'Pictures' }).or(page.getByRole('button', { name: 'Pictures', exact: true })).first().click()
  await page.getByTestId('text-overlay-open').click()
  await page.getByTestId('text-card-words').fill('Nobody is just a job title')
  await page.getByTestId('text-card-style').selectOption('quote')
  await page.getByTestId('text-card-font').selectOption('DM Serif Display')
  await page.getByTestId('text-card-place').click()
  await page.getByTestId('pick-word').locator('.word').first().click()
  await page.getByTestId('text-overlay-open').click()
  await page.getByTestId('overlay-template').selectOption('lower-third')
  await page.getByTestId('overlay-name').fill('Sam Rivera')
  await page.getByTestId('overlay-role').fill('Host, Acme')
  await shot(page, 'content-09-text-overlay').catch(() => undefined)
  await page.getByTestId('overlay-whole').click()
  await page.getByTestId('make-version').click()
  await expect.poll(() => (project().broll ?? []).map((b: any) => [b.treatment, b.params?.textStyle ?? b.params?.template]), { timeout: 60_000 })
    .toEqual([['text-pop', 'quote'], ['overlay', 'lower-third']])
  expect(project().broll[0].params).toEqual({ text: 'Nobody is just a job title', textStyle: 'quote', font: 'DM Serif Display' })
  expect(project().broll[1].params).toMatchObject({ template: 'lower-third', name: 'Sam Rivera', role: 'Host, Acme', accent: '#F58D3D' })
  expect(project().captions.style).toMatchObject({ font: 'DM Serif Display', size: 104, color: '#F0F0F0', box: false })
  await app.close()
  rmSync(join(projects, slug), { recursive: true, force: true })
})

test('generated media needs agreement to its cost, then lands in the Library', async () => {
  const media = makeMedia()
  const dir = join(BASE, 'fake-bridge')
  mkdirSync(dir, { recursive: true })
  const bridge = join(dir, 'run.sh')
  writeFileSync(
    bridge,
    `#!/usr/bin/env node
const fs = require('fs')
const req = JSON.parse(fs.readFileSync(0, 'utf8'))
fs.appendFileSync(${JSON.stringify(join(dir, 'calls.log'))}, JSON.stringify(req) + '\\n')
if (req.action === 'list') {
  console.log(JSON.stringify({ ok: true, tools: [{ name: 'paid_image', provider: 'p', capability: 'image_generation', costUsd: 0.25 }] }))
} else {
  fs.copyFileSync(${JSON.stringify(media.picture)}, req.outputPath)
  console.log(JSON.stringify({ ok: true, path: req.outputPath }))
}
`
  )
  chmodSync(bridge, 0o755)
  const { app, page } = await launch({ REELFORGE_BRIDGE: bridge })
  await passFirstRun(page)
  await page.getByTestId('nav-library').click()
  await expect(page.getByTestId('maker')).toContainText('paid_image (about $0.25)')
  await page.getByLabel('What to make').fill('a cat on a skateboard')
  await expect(page.getByTestId('maker-make')).toBeDisabled()
  await page.getByTestId('maker-agree').check()
  await shot(page, 'content-06-maker')
  await page.getByTestId('maker-make').click()
  await expect(page.getByTestId('library-result')).toContainText('added it to your Library')
  await expect(page.getByTestId('bin-images')).toContainText('generated')
  const run = JSON.parse(readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').at(-1)!)
  expect(run).toMatchObject({ action: 'run', tool: 'paid_image', inputs: { prompt: 'a cat on a skateboard' }, maxCostUsd: 0.25, acceptUnknownCost: false })
  await app.close()
})
