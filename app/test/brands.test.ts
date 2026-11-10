import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listBrands, saveBrand } from '../src/main/brands'

const PERSONAL = '# Brand profile: Personal\n\n## Identity\n- name: Sam\n- instagram: {{to fill}}\n'
const ACME = '# Brand profile: Acme\n\n## Identity\n- name: Acme\n'

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'brands-'))
  await fs.writeFile(join(dir, 'personal.md'), PERSONAL)
  await fs.writeFile(join(dir, 'acme.md'), ACME)
  await fs.writeFile(join(dir, 'acme-voice.md'), '# Voice\nnot a profile\n')
  await fs.writeFile(join(dir, 'notes.txt'), 'ignore me')
})
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

describe('listBrands', () => {
  it('lists only brand profiles, Personal first', async () => {
    const list = await listBrands(dir)
    expect(list.folder).toBe(dir)
    expect(list.brands.map((b) => b.id)).toEqual(['personal', 'acme'])
    expect(list.brands[0]!.profile.title).toBe('Personal')
    expect(list.brands[0]!.text).toBe(PERSONAL)
  })

  it('returns an empty list when the folder is missing', async () => {
    const list = await listBrands(join(dir, 'nope'))
    expect(list.brands).toEqual([])
  })
})

describe('saveBrand', () => {
  it('writes the edits and returns the new profile', async () => {
    const doc = await saveBrand(dir, 'personal', PERSONAL, [{ line: 4, value: '@sam' }])
    expect(doc.profile.sections[0]!.fields[1]).toMatchObject({ key: 'instagram', value: '@sam', pending: null })
    expect(await fs.readFile(join(dir, 'personal.md'), 'utf8')).toBe(PERSONAL.replace('{{to fill}}', '@sam'))
  })

  // Windows has no Unix modes, and making a symlink there needs admin rights: this only means something elsewhere.
  it.skipIf(process.platform === 'win32')('keeps the file’s permissions and writes through a link to the real file', async () => {
    const real = join(dir, 'real-personal.txt')
    await fs.rename(join(dir, 'personal.md'), real)
    await fs.chmod(real, 0o600)
    await fs.symlink(real, join(dir, 'personal.md'))
    await saveBrand(dir, 'personal', PERSONAL, [{ line: 4, value: '@sam' }])
    expect((await fs.lstat(join(dir, 'personal.md'))).isSymbolicLink()).toBe(true)
    expect(await fs.readFile(real, 'utf8')).toContain('@sam')
    expect((await fs.stat(real)).mode & 0o777).toBe(0o600)
    expect((await fs.readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([])
  })

  it('refuses when the file changed since it was opened, and leaves the file alone', async () => {
    await fs.writeFile(join(dir, 'personal.md'), PERSONAL + '- tiktok: @x\n')
    await expect(saveBrand(dir, 'personal', PERSONAL, [{ line: 4, value: '@sam' }])).rejects.toMatchObject({ code: 'BRAND_CHANGED' })
    expect(await fs.readFile(join(dir, 'personal.md'), 'utf8')).toBe(PERSONAL + '- tiktok: @x\n')
  })

  it('refuses names that could leave the folder', async () => {
    for (const id of ['../personal', 'personal.md', '', 'a/b', 'Personal']) {
      await expect(saveBrand(dir, id, PERSONAL, [])).rejects.toMatchObject({ code: 'BAD_BRAND' })
    }
  })

  it('refuses a brand that is not there', async () => {
    await expect(saveBrand(dir, 'other', PERSONAL, [])).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses edits that are not a list of {line, value}', async () => {
    for (const bad of [null, 'x', [{ line: '4', value: 'a' }], [{ line: 4 }], [{ line: -1, value: 'a' }]]) {
      await expect(saveBrand(dir, 'personal', PERSONAL, bad)).rejects.toMatchObject({ code: 'BAD_EDIT' })
    }
  })

  it('refuses an edit on a line that is not a value, with a friendly message', async () => {
    await expect(saveBrand(dir, 'personal', PERSONAL, [{ line: 2, value: 'x' }])).rejects.toMatchObject({ code: 'BAD_EDIT' })
  })
})

describe('activeBrand', () => {
  it('reads the brand’s settings and profile, or null when the brand is gone', async () => {
    const { activeBrand } = await import('../src/main/brands')
    await fs.writeFile(join(dir, 'personal.md'), PERSONAL + '\n## Voice\n- voice file: ~/v/voice.md\n')
    const b = await activeBrand(dir, 'personal', '/Users/z')
    expect(b).toMatchObject({ id: 'personal', title: 'Personal', settings: { kind: 'person' as const, voiceFile: '/Users/z/v/voice.md' } })
    expect(b!.profileText).toContain('- voice file: ~/v/voice.md')
    expect(await activeBrand(dir, 'gone', '/Users/z')).toBeNull()
    expect(await activeBrand(dir, '../personal', '/Users/z')).toBeNull()
  })
})

describe('writerFiles', () => {
  it('uses the brand’s own files, and its profile without the unanswered lines', async () => {
    const { writerFiles } = await import('../src/main/brands')
    const v = join(dir, 'voice'); await fs.mkdir(v)
    await fs.writeFile(join(v, 'voice.md'), 'MY VOICE')
    await fs.writeFile(join(v, 'framework.md'), 'BESIDE FRAMEWORK')
    await fs.writeFile(join(dir, 'rules.md'), 'BRAND RULES')
    const brand = { id: 'personal', title: 'Personal', profileText: '# Brand profile: Personal\n## Identity\n- name: Sam\n- tiktok: {{to fill}}\n',
      settings: { kind: 'person' as const, voiceFile: join(v, 'voice.md'), personalityFile: null, scriptRulesFile: join(dir, 'rules.md'), defaultLook: null } }
    const f = await writerFiles(brand, null)
    expect(f.voiceFile).toBe(join(v, 'voice.md'))
    expect(f.framework).toBe('BRAND RULES')
    expect(f.brand).toContain('The brand this is for: Personal')
    expect(f.brand).toContain('- name: Sam')
    expect(f.brand).not.toContain('{{')
  })

  it('never lends another voice to a brand whose voice is not written yet', async () => {
    const { writerFiles } = await import('../src/main/brands')
    const brand = { id: 'acme', title: 'Acme', profileText: '# Brand profile: Acme\n## Identity\n- speaks as: we\n',
      settings: { kind: 'person' as const, voiceFile: null, personalityFile: null, scriptRulesFile: null, defaultLook: null } }
    const f = await writerFiles(brand, '/somewhere/sam/voice.md')
    expect(f.voiceFile).toBeNull()
    expect(f.framework).toBe('')
    expect(f.brand).toContain('- speaks as: we')
  })

  it('with no brand, reads the voice file and the files beside it, as before', async () => {
    const { writerFiles } = await import('../src/main/brands')
    const v = join(dir, 'v2'); await fs.mkdir(v)
    await fs.writeFile(join(v, 'framework.md'), 'FW'); await fs.writeFile(join(v, 'brand.md'), 'BR')
    expect(await writerFiles(null, join(v, 'voice.md'))).toEqual({ voiceFile: join(v, 'voice.md'), framework: 'FW', brand: 'BR', speaker: 'person' })
  })
})

describe('writerFilesFor', () => {
  it('gives a brand that was picked but is gone nothing to write from, never the voice file', async () => {
    const { writerFilesFor } = await import('../src/main/brands')
    expect(await writerFilesFor('acme', null, '/somewhere/sam/voice.md')).toEqual({ voiceFile: null, framework: '', brand: '', speaker: 'person' })
  })
  it('with no brand picked, reads the voice file as before', async () => {
    const { writerFilesFor } = await import('../src/main/brands')
    expect((await writerFilesFor(null, null, '/nowhere/voice.md')).voiceFile).toBe('/nowhere/voice.md')
  })
})

describe('brandForVoiceFile', () => {
  it('finds the brand whose profile names this voice file, so an unpicked switch still gets its sign-off', async () => {
    const { brandForVoiceFile } = await import('../src/main/brands')
    await fs.writeFile(join(dir, 'personal.md'), '# Brand profile: Personal\n## Voice\n- voice file: ~/v/voice.md\n- sign-off: See you tomorrow.\n')
    const b = await brandForVoiceFile(dir, '/Users/z/v/voice.md', '/Users/z')
    expect(b?.id).toBe('personal')
    expect(await brandForVoiceFile(dir, '/Users/z/other/voice.md', '/Users/z')).toBeNull()
    expect(await brandForVoiceFile(dir, null, '/Users/z')).toBeNull()
  })
})
