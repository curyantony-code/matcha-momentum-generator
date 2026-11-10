import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createScriptStore } from '../src/main/scripts'

const file = (): string => join(mkdtempSync(join(tmpdir(), 'scripts-')), 'scripts.json')
const draft = { hook: 'I lost 45 days', script: 'Here is what happened.', onScreenText: ['45 days'] }

describe('saved scripts', () => {
  it('keeps a known L.I.F.E. theme and level, drops unknown ones, and lets them change', async () => {
    const store = createScriptStore(file())
    const tagged = await store.save({ ...draft, theme: 'Love', level: 'Raw' } as typeof draft)
    expect(tagged).toMatchObject({ theme: 'Love', level: 'Raw' })
    const odd = await store.save({ ...draft, theme: 'Money', level: '' } as typeof draft)
    expect(odd.theme).toBeUndefined()
    expect(odd.level).toBeUndefined()
    expect(await store.update(tagged.id, { level: 'Real' })).toMatchObject({ theme: 'Love', level: 'Real' })
    expect(await store.update(tagged.id, { theme: 'Nope' as never })).toMatchObject({ theme: 'Love' })
  })

  it('starts empty, then lists the newest first', async () => {
    const store = createScriptStore(file())
    expect(await store.list()).toEqual([])
    const a = await store.save({ ...draft, hook: 'first' })
    const b = await store.save({ ...draft, hook: 'second' })
    expect((await store.list()).map((s) => s.id)).toEqual([b.id, a.id])
  })

  it('finds a script by id and survives a restart', async () => {
    const path = file()
    const saved = await createScriptStore(path).save(draft)
    const found = await createScriptStore(path).get(saved.id)
    expect(found?.script).toBe(draft.script)
    expect(typeof found?.createdAt).toBe('string')
  })

  it('removes a script and ignores an unknown id', async () => {
    const store = createScriptStore(file())
    const saved = await store.save(draft)
    await store.remove('nope')
    expect((await store.list()).length).toBe(1)
    await store.remove(saved.id)
    expect(await store.list()).toEqual([])
  })

  it('edits a saved script in place and keeps its place in the list', async () => {
    const store = createScriptStore(file())
    const a = await store.save({ ...draft, hook: 'first' })
    await store.save({ ...draft, hook: 'second' })
    const edited = await store.update(a.id, { hook: 'first, rewritten', script: 'My own words.' })
    expect(edited).toMatchObject({ id: a.id, hook: 'first, rewritten', script: 'My own words.', createdAt: a.createdAt })
    expect((await store.list()).map((s) => s.hook)).toEqual(['second', 'first, rewritten'])
  })

  it('refuses to edit a script that is gone, or to empty one', async () => {
    const store = createScriptStore(file())
    const a = await store.save(draft)
    await expect(store.update('nope', { hook: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(store.update(a.id, { hook: ' ', script: ' ' })).rejects.toMatchObject({ code: 'EMPTY' })
  })

  it('refuses an empty script', async () => {
    const store = createScriptStore(file())
    await expect(store.save({ hook: ' ', script: ' ', onScreenText: [] })).rejects.toMatchObject({ code: 'EMPTY' })
  })

  it('does not lose scripts saved at the same moment', async () => {
    const store = createScriptStore(file())
    await Promise.all([1, 2, 3, 4].map((n) => store.save({ ...draft, hook: `h${n}` })))
    expect((await store.list()).length).toBe(4)
  })

  it('treats a damaged file as empty rather than crashing, and keeps a copy', async () => {
    const path = file()
    writeFileSync(path, 'not json')
    const store = createScriptStore(path)
    expect(await store.list()).toEqual([])
    await store.save(draft)
    expect(readFileSync(`${path}.damaged`, 'utf8')).toBe('not json')
  })
})
