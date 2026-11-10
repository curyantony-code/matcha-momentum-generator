import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { engineView, healthView, installedSkillFolders, swipeConcepts, templateRanks } from '../src/main/overview-views'
import type { SavedScript } from '../src/shared/api'

describe('content engine', () => {
  it('reads the concepts under "## Concepts" only', () => {
    expect(swipeConcepts('# Swipe\n## Concepts\n### A question, then a blunt answer\n- x\n### Bold claim\n## 2026-11-02\n### not a concept')).toEqual(['A question, then a blunt answer', 'Bold claim'])
    expect(swipeConcepts('# nothing here')).toEqual([])
  })

  it('shows each writer file as it is on disk, the templates, rules and what each script used', async () => {
    const d = mkdtempSync(join(tmpdir(), 'engine-'))
    writeFileSync(join(d, 'voice.md'), 'I am Sam.')
    writeFileSync(join(d, 'swipe.md'), '## Concepts\n### Bold claim\n')
    writeFileSync(join(d, 'rankings.md'), '## Beat templates, ranked\n\n| # | Template | Score |\n|---|---|---|\n| 3 | Hot take | 7 | x |\n## Concepts\n| 1 | Mine | 9 |\n')
    const scripts = [
      { id: 'a', createdAt: '2026-11-01', hook: 'Old', script: '', onScreenText: [] },
      { id: 'b', createdAt: '2026-11-07', hook: 'New', script: '', onScreenText: [], hookFormula: 'Result', concept: 'Bold claim', cards: [{ line: 1, card: 'stat-count-up', text: '200' }], slop: ['picture this'], ranked: { templates: [{ name: 'Hot take', why: '' }], hooks: [], concepts: [] } }
    ] as unknown as SavedScript[]
    const v = await engineView({ brand: 'Personal', voiceFile: join(d, 'voice.md'), templates: [{ id: 'hot-take', name: 'Hot take', builtIn: true, beats: '1. Hook\n2. Intro\n' }, { id: 'm', name: 'Mine', beats: '1. Hook', basedOn: "@kallaway's reel" }], activeTemplate: 'Mine', styleRules: '- Captions under the collar\n- CTA is a follow', motionCards: true, scripts, skillFolders: ['watch', 'copywriting-hooks'] })
    expect(v.files.map((f) => [f.key, f.found])).toEqual([['voice', true], ['framework', false], ['brand', false], ['rankings', true], ['swipe', true]])
    expect(v.files.find((f) => f.key === 'swipe')!.fact).toBe('1 concept')
    expect(v.concepts).toEqual(['Bold claim'])
    expect(v.templates).toEqual([
      { id: 'hot-take', name: 'Hot take', builtIn: true, active: false, beats: 2, basis: { sources: ['studio-script', 'rankings'], from: 'Studio script, divisive funnel' }, rank: { place: 3, score: 7 } },
      { id: 'm', name: 'Mine', builtIn: false, active: true, beats: 1, basis: { sources: ['reel-research'], from: "@kallaway's reel" }, rank: null }
    ])
    expect(v.skillFolders).toEqual(['copywriting-hooks', 'watch'])
    expect(v.scripts[0]!.used.map((u) => u.source)).toEqual(['studio-script', 'rankings', 'copywriting-hooks', 'antislop-copywriting', 'rankings'])
    expect(v.scripts[1]!.used).toEqual([])
    expect(v.styleRules).toEqual(['Captions under the collar', 'CTA is a follow'])
    expect(v.scripts.map((s) => [s.hook, s.formula, s.template, s.cards, s.slop])).toEqual([['New', 'Result', 'Hot take', 1, 1], ['Old', '', null, 0, 0]])
  })

  it('a friend with no writer files sees them as missing, never an error', async () => {
    const v = await engineView({ brand: null, voiceFile: null, templates: [], activeTemplate: null, styleRules: '', motionCards: false, scripts: [], skillFolders: [] })
    expect(v.files.every((f) => !f.found && f.path === null)).toBe(true)
  })
})

describe('skills and templates', () => {
  it('reads template places from the "Beat templates" table only, matching the name before any bracket', () => {
    const r = templateRanks('## Hooks\n| 1 | Hot take | 9 |\n## Beat templates, ranked\n| 1 | One-take proof | 8 | why |\n| 7 | Page intro | 5 | x |\n## Concepts\n| 2 | Other | 6 |')
    expect([...r.entries()]).toEqual([['one-take proof', { place: 1, score: 8 }], ['page intro', { place: 7, score: 5 }]])
    expect(templateRanks('nothing')).toEqual(new Map())
  })

  it('lists only folders that hold a SKILL.md, from both skill folders, and survives missing ones', async () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    mkdirSync(join(home, '.claude', 'skills', 'watch'), { recursive: true })
    writeFileSync(join(home, '.claude', 'skills', 'watch', 'SKILL.md'), '#')
    mkdirSync(join(home, '.claude', 'skills', 'empty'), { recursive: true })
    mkdirSync(join(home, '.agents', 'skills', 'studio-script'), { recursive: true })
    writeFileSync(join(home, '.agents', 'skills', 'studio-script', 'SKILL.md'), '#')
    expect((await installedSkillFolders(home)).sort()).toEqual(['studio-script', 'watch'])
    expect(await installedSkillFolders(join(home, 'nobody'))).toEqual([])
  })
})

describe('system health', () => {
  const base = {
    doctor: async () => ({ checks: [{ ok: true, name: 'ffmpeg', detail: '7.1.1' }, { ok: false, name: 'libass', detail: 'missing', fix: 'Reinstall' }] }),
    ai: async () => ({ connected: true, id: 'claude-cli', label: 'Claude (your Claude Code app)' }),
    model: async () => ({ installed: true, downloading: false, pct: 100, name: 'small.en' }),
    postiz: async () => ({ state: 'no-subscription', channels: [] }),
    appVersion: '1.2.3',
    root: tmpdir()
  }

  it('checks every part at once and says what to do about what fails', async () => {
    const h = await healthView(base, new Date('2026-11-09T10:00:00Z'))
    expect(h.checkedAt).toBe('2026-11-09T10:00:00.000Z')
    expect(h.ok).toBe(false)
    expect(h.checks.map((c) => [c.group, c.name, c.ok])).toEqual([
      ['Video engine', 'ffmpeg', true],
      ['Video engine', 'libass', false],
      ['AI editor', 'AI editor', true],
      ['Listening model', 'Listening model', true],
      ['Posting', 'Postiz', false],
      ['App', 'Matcha Momentum Generator', true],
      ['App', 'Your videos folder', true]
    ])
    expect(h.checks.find((c) => c.name === 'Postiz')!.fix).toMatch(/plan/)
  })

  it('an engine that reports no checks says so, never a silent gap', async () => {
    const h = await healthView({ ...base, doctor: async () => ({}) })
    expect(h.checks[0]).toMatchObject({ group: 'Video engine', ok: false, detail: 'It answered, but reported no checks' })
  })

  it('one part failing to answer never hides the others', async () => {
    const h = await healthView({ ...base, doctor: async () => { throw new Error('engine gone') }, postiz: async () => ({ state: 'ready', channels: [{}, {}] }) })
    expect(h.checks[0]).toMatchObject({ group: 'Video engine', ok: false })
    expect(h.checks[0]!.detail).toMatch(/engine gone/)
    expect(h.checks.find((c) => c.name === 'Postiz')).toMatchObject({ ok: true, detail: 'Signed in and ready to post, 2 accounts' })
    expect(h.checks.find((c) => c.name === 'AI editor')!.ok).toBe(true)
  })
})
