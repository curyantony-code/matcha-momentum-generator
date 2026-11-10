// A written script shows the writer's best picks for the idea (templates, hooks, concepts) and the motion cards its
// lines are written to land.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, launch, passFirstRun, shot } from './helpers'

const SCRIPT = {
  id: 'ranked-1',
  createdAt: '2026-11-06T00:00:00.000Z',
  hook: 'If you are a student and recruiters ghost you, this is for you.',
  script: 'If you are a student and recruiters ghost you, this is for you.\nI sent 40 applications.\nNo reply, no interview.\nWrite your own first impression.',
  onScreenText: ['Recruiters ghosting you?'],
  hookFormula: 'Identity call-out',
  cards: [
    { line: 2, card: 'stat-count-up', text: '40 applications' },
    { line: 3, card: 'list-reveal', text: 'No reply · No interview' }
  ],
  ranked: {
    templates: [{ name: 'Teach: one fix', why: 'ranked 2nd for traction, fits a mistake people make' }, { name: 'One-take proof', why: 'needs a result you have' }],
    hooks: [{ name: 'Identity call-out', why: '+19% in Ames Create' }],
    concepts: [{ name: 'A question, then a blunt answer', why: 'answers what they already wonder' }]
  }
}

test('a script shows its best picks for the idea and the motion cards it lands', async () => {
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(join(ROOT, 'scripts.json'), JSON.stringify([SCRIPT]))
  const { app, page } = await launch()
  try {
    await passFirstRun(page)
    await page.getByTestId('nav-home').click()
    await page.getByTestId('new-video').click()
    await page.getByText('I want help writing a script first').click()
    await page.getByTestId('saved-scripts').getByText(SCRIPT.hook).click()
    const editor = page.getByTestId('script-editor')
    await expect(editor.getByTestId('script-cards')).toContainText('Line 2 · Number counting up: 40 applications')
    await expect(editor.getByTestId('script-cards')).toContainText('Line 3 · List, one row at a time: No reply · No interview')
    await expect(editor.getByTestId('ranked-templates')).toContainText('1. Teach: one fix')
    await expect(editor.getByTestId('ranked-hooks')).toContainText('Identity call-out (+19% in Ames Create)')
    await expect(editor.getByTestId('ranked-concepts')).toContainText('A question, then a blunt answer')
    // which skill shaped which stage of this script
    const built = editor.getByTestId('built-with')
    await expect(built).toContainText('Copywriting hooks')
    await expect(built).toContainText('Hook shape: Identity call-out')
    await expect(built).toContainText('Traction research')
    await editor.getByTestId('script-ranked').scrollIntoViewIfNeeded()
    await shot(page, 'script-ranked')
  } finally {
    await app.close()
  }
})
