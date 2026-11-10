import { describe, expect, it } from 'vitest'
import { BUILT_IN_BEATS } from '../src/shared/beats'
import { ALWAYS, SOURCES, STAGES, TEMPLATE_BASIS, installedFolder, skillsUsedBy, sourceById } from '../src/shared/skills'

describe('skills map', () => {
  it('every source has a known stage on every use, and ids are unique', () => {
    const stages = new Set(STAGES.map((s) => s.id))
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length)
    for (const s of SOURCES) for (const u of s.uses) expect(stages.has(u.stage)).toBe(true)
  })

  it('every built-in template says what it is based on, and only names real sources', () => {
    for (const t of BUILT_IN_BEATS) {
      const b = TEMPLATE_BASIS[t.id]
      expect(b, t.id).toBeTruthy()
      for (const id of b!.sources) expect(sourceById(id), id).toBeTruthy()
    }
    for (const id of ALWAYS) expect(sourceById(id)?.kind).toBe('skill')
  })

  it('records only what a script really has', () => {
    expect(skillsUsedBy({})).toEqual([])
    const used = skillsUsedBy({ hookFormula: 'Confession', hooks: [{ text: 'a', formula: 'b', words: 1, seconds: 1 }], firstFrame: 'me at the desk', onScreenText: ['a', 'b'], slop: [], concept: 'none', cards: [] })
    expect(used.map((u) => [u.source, u.stage, u.what])).toEqual([
      ['copywriting-hooks', 'hook', 'Hook shape: Confession'],
      ['short-form-video-script', 'hook', '1 more hook to test'],
      ['short-form-video-script', 'hook', 'First frame: me at the desk'],
      ['short-form-video-script', 'screen', 'Muted version: 2 on-screen lines'],
      ['antislop-copywriting', 'check', 'No AI phrases left']
    ])
  })

  it('finds a skill installed under its own folder name, or one ending the same way', () => {
    expect(installedFolder(sourceById('watch')!, ['watch', 'x'])).toBe('watch')
    expect(installedFolder(sourceById('thought-leadership')!, ['my-thought-leadership'])).toBe('my-thought-leadership')
    expect(installedFolder(sourceById('thought-leadership')!, ['thought-leadership-notes'])).toBeNull()
    expect(installedFolder(sourceById('framework')!, ['framework'])).toBeNull()
  })
})
