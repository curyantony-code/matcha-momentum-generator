import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { StyleStore } from '../src/style'

describe('StyleStore file', () => {
  it('uses My style.json in the root by default', () => {
    expect(new StyleStore(() => '/r').file).toBe(path.join('/r', 'My style.json'))
  })

  it('uses the file the app picks (one per brand), read on every call so a brand switch takes effect at once', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'style-file-'))
    let name = 'My style (acme).json'
    const store = new StyleStore(() => root, () => path.join(root, name))
    await store.add('Speak as we.')
    expect(JSON.parse(fs.readFileSync(path.join(root, 'My style (acme).json'), 'utf8')).rules[0].text).toBe('Speak as we.')
    name = 'My style.json'
    expect(await store.list()).toEqual([])
  })
})

describe('StyleStore during a brand switch', () => {
  it('writes a rule to the file it read, even when the pick changes mid-way', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'style-race-'))
    let name = 'My style (a).json'
    const store = new StyleStore(() => root, () => path.join(root, name))
    const adding = store.add('Rule for A.')
    name = 'My style (b).json' // the switch lands while the add is in flight
    await adding
    expect(fs.existsSync(path.join(root, 'My style (b).json'))).toBe(false)
    expect(fs.readFileSync(path.join(root, 'My style (a).json'), 'utf8')).toContain('Rule for A.')
  })
})
