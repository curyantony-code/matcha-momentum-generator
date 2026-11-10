import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StoryProgress } from '../src/shared/api'
import type { Story, StoryTiming } from '../src/shared/story'
import {
  MAX_IMAGE_BYTES, copyRecording, createStory, getStory, listStories, loadStoryAssets, readTiming, removeStory, saveStory, writeLines
} from '../src/main/stories'
import { registerStoriesIpc, type StoriesDeps } from '../src/main/stories-ipc'

let root: string
const T = '2026-11-05T10:00:00.000Z'
const make = (title = 'Your CV hides you'): Promise<Story> => createStory(root, { title, brand: 'acme', palette: 'brand', handle: '@acme', now: T })
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'stories-'))
})
afterEach(() => fs.rm(root, { recursive: true, force: true }))

describe('story store', () => {
  it('creates a folder named after the title, and a new name for the same title', async () => {
    const a = await make()
    const b = await make()
    expect(a.id).toBe('your-cv-hides-you')
    expect(b.id).toBe('your-cv-hides-you-2')
    expect(a).toMatchObject({ palette: 'brand', handle: '@acme', brand: 'acme' })
    expect(JSON.parse(await fs.readFile(join(root, 'Stories', a.id, 'story.json'), 'utf8')).title).toBe('Your CV hides you')
  })

  it('lists newest first, empty with no folder, and skips a broken file', async () => {
    expect(await listStories(root)).toEqual([])
    await createStory(root, { title: 'Old', brand: null, palette: 'mono', handle: '', now: '2026-11-01T00:00:00.000Z' })
    await createStory(root, { title: 'New', brand: null, palette: 'mono', handle: '', now: '2026-11-05T00:00:00.000Z' })
    await fs.mkdir(join(root, 'Stories', 'broken'), { recursive: true })
    await fs.writeFile(join(root, 'Stories', 'broken', 'story.json'), '{nope')
    expect((await listStories(root)).map((s) => s.title)).toEqual(['New', 'Old'])
  })

  it('saves a cleaned copy with a new updatedAt and the old createdAt', async () => {
    const s = await make()
    const saved = await saveStory(root, { ...s, title: 'Better', createdAt: '1999-01-01T00:00:00.000Z' }, '2026-11-05T11:00:00.000Z')
    expect(saved).toMatchObject({ title: 'Better', createdAt: T, updatedAt: '2026-11-05T11:00:00.000Z' })
    expect((await getStory(root, s.id))?.title).toBe('Better')
  })

  it('never creates a folder on save, and rejects junk and bad ids', async () => {
    const s = await make()
    await expect(saveStory(root, { ...s, id: 'ghost' }, T)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(fs.stat(join(root, 'Stories', 'ghost'))).rejects.toThrow()
    await expect(saveStory(root, { nope: 1 }, T)).rejects.toMatchObject({ code: 'BAD_STORY' })
    expect(await getStory(root, '../x')).toBeNull()
    await expect(removeStory(root, '../x')).rejects.toMatchObject({ code: 'BAD_STORY' })
  })

  it('removes the folder', async () => {
    const s = await make()
    await removeStory(root, s.id)
    expect(await getStory(root, s.id)).toBeNull()
  })
})

describe('story assets', () => {
  let lib: string
  let fonts: string
  beforeEach(async () => {
    lib = join(root, 'Library')
    fonts = join(root, 'fonts')
    await fs.mkdir(join(lib, 'Images'), { recursive: true })
    await fs.mkdir(fonts)
    await fs.writeFile(join(lib, 'Images', 'a.png'), 'png-a')
    await fs.writeFile(join(fonts, 'Figtree-Bold.ttf'), 'f')
  })
  const load = (images: string[]) => loadStoryAssets({ fontsDir: fonts, logo: null, artDir: null, libraryDir: lib, images })

  it('loads fonts that exist and leaves the others empty', async () => {
    const a = await load([])
    expect(a.fonts.textBold.startsWith('data:font/ttf;base64,')).toBe(true)
    expect(a.fonts.serif).toBe('')
    expect(a.logo).toBeNull()
  })

  it('loads a Library image as a data URL', async () => {
    expect(Object.keys((await load(['Images/a.png'])).images)).toEqual(['Images/a.png'])
  })

  it('rejects .., absolute paths, other types, missing files and symlinks out of the Library', async () => {
    await fs.writeFile(join(root, 'secret.png'), 'x')
    await fs.symlink(join(root, 'secret.png'), join(lib, 'Images', 'link.png'))
    const bad = ['../secret.png', 'Images/../../secret.png', join(root, 'secret.png'), 'Images/a.txt', 'Images/none.png', 'Images/link.png', '']
    expect((await load(bad)).images).toEqual({})
  })

  it('skips an image over 8 MB and stops at 24 MB in all', async () => {
    const chunk = (n: number) => Buffer.alloc(n, 1)
    await fs.writeFile(join(lib, 'big.png'), chunk(MAX_IMAGE_BYTES + 1))
    for (const n of ['x1', 'x2', 'x3', 'x4']) await fs.writeFile(join(lib, `${n}.png`), chunk(MAX_IMAGE_BYTES))
    const r = (await load(['big.png', 'x1.png', 'x2.png', 'x3.png', 'x4.png'])).images
    expect(Object.keys(r)).toEqual(['x1.png', 'x2.png', 'x3.png'])
  })
})

describe('recording, timing and lines', () => {
  it('copies only audio types into audio/recording.<ext>, replacing the old one', async () => {
    const dir = join(root, 'Stories', 's')
    const src = join(root, 'take.M4A')
    await fs.writeFile(src, 'aaa')
    await fs.writeFile(join(root, 'take.wav'), 'bbb')
    await copyRecording(dir, join(root, 'take.wav'))
    const to = await copyRecording(dir, src)
    expect(to).toBe(join(dir, 'audio', 'recording.m4a'))
    expect(await fs.readdir(join(dir, 'audio'))).toEqual(['recording.m4a'])
    await fs.writeFile(join(root, 'x.exe'), 'z')
    await expect(copyRecording(dir, join(root, 'x.exe'))).rejects.toMatchObject({ code: 'BAD_AUDIO' })
    await expect(copyRecording(dir, join(root, 'missing.mp3'))).rejects.toMatchObject({ code: 'BAD_AUDIO' })
  })

  it('writes lines.json with shown and spoken only, and reads timing back or null', async () => {
    const dir = join(root, 's')
    const s = await make()
    await writeLines(dir, s.lines)
    const lines = JSON.parse(await fs.readFile(join(dir, 'work', 'lines.json'), 'utf8')) as Record<string, unknown>[]
    expect(lines.length).toBe(s.lines.length)
    expect(Object.keys(lines[0]!).sort()).toEqual(['shown', 'spoken'])
    expect(await readTiming(dir)).toBeNull()
    await fs.writeFile(join(dir, 'work', 'timing.json'), '{"duration":"x"}')
    expect(await readTiming(dir)).toBeNull()
    const t: StoryTiming = { duration: 5, lines: [{ start: 0, end: 5 }], words: [], textHash: 'h' }
    await fs.writeFile(join(dir, 'work', 'timing.json'), JSON.stringify(t))
    expect(await readTiming(dir)).toEqual(t)
  })
})

// ---- IPC with fake deps ----------------------------------------------------------------------------

type Handler = (e: unknown, ...a: any[]) => unknown
interface Calls {
  engine: { cmd: string; args: string[] }[]
  progress: StoryProgress[]
  exports: { html: string; duration: number; audio: string; out: string }[]
  revealed: string[]
}

function harness(over: Partial<StoriesDeps> = {}) {
  const handlers = new Map<string, Handler>()
  const calls: Calls = { engine: [], progress: [], exports: [], revealed: [] }
  const timingFor = (dir: string): StoryTiming => ({ duration: 10, lines: [{ start: 0, end: 10 }], words: [], textHash: 'h' + dir.length })
  const deps: StoriesDeps = {
    handle: (c, fn) => void handlers.set(c, fn),
    root: () => root,
    fontsDir: () => null,
    libraryDir: () => join(root, 'Library'),
    modelsDir: () => join(root, 'models'),
    activeBrand: () => 'acme',
    defaultsFor: async (b) => ({ palette: b ? 'brand' : 'mono', handle: '@bm', logo: null, artDir: null }),
    runEngine: async (cmd, args, onProgress) => {
      calls.engine.push({ cmd, args })
      onProgress?.({ stage: 'x', pct: 50, message: 'half' })
      if (cmd === 'story-voice' || cmd === 'story-align') {
        const timing = args[args.indexOf('--timing') + 1]!
        await fs.mkdir(join(timing, '..'), { recursive: true })
        await fs.writeFile(timing, JSON.stringify(timingFor(timing)))
        if (cmd === 'story-voice') await fs.writeFile(args[args.indexOf('--out') + 1]!, 'wav')
      }
      if (cmd === 'story-voices') return { voices: [{ id: 'af_heart', label: 'Heart' }, { id: 5 }] }
      if (cmd === 'story-voice-model') return { installed: true, downloaded: 1, total: 1, packageMissing: false }
      return {}
    },
    chooseFile: async () => null,
    mediaUrl: (p, bust) => `media://${p}?${bust ? 'v' : ''}`,
    draft: async (st) => ({ title: 'AI title', lines: st.lines, caption: 'cap', hashtags: ['#a'] }),
    exportStory: async (html, duration, audio, out, onProgress) => {
      calls.exports.push({ html, duration, audio, out })
      onProgress(40, 'mid')
      await fs.writeFile(out, 'mp4')
      return out
    },
    renderHtml: () => '<html></html>',
    progress: (p) => calls.progress.push(p),
    reveal: (p) => calls.revealed.push(p),
    ...over
  }
  registerStoriesIpc(deps)
  const call = <T = unknown>(ch: string, ...a: unknown[]): Promise<T> => Promise.resolve(handlers.get(ch)!({}, ...a)) as Promise<T>
  return { call, calls, handlers }
}

describe('stories IPC', () => {
  it('registers every channel of ReelApi.stories', () => {
    const { handlers } = harness()
    const names = ['list', 'create', 'save', 'remove', 'draft', 'assets', 'timing', 'audioUrl', 'voiceModel', 'downloadVoiceModel', 'voices', 'makeVoice', 'useRecording', 'export', 'reveal']
    expect([...handlers.keys()].sort()).toEqual(names.map((n) => `stories:${n}`).sort())
  })

  it('creates a story in the brand palette and handle of the brand in use', async () => {
    const { call } = harness()
    expect(await call('stories:create', 'My story')).toMatchObject({ palette: 'brand', handle: '@bm', brand: 'acme' })
    const mono = harness({ activeBrand: () => null })
    expect(await mono.call('stories:create', 42)).toMatchObject({ palette: 'mono', brand: null })
  })

  it('validates ids on every channel that takes one', async () => {
    const { call } = harness()
    for (const ch of ['remove', 'assets', 'timing', 'audioUrl', 'makeVoice', 'useRecording', 'export', 'reveal']) {
      await expect(call(`stories:${ch}`, '../x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(call(`stories:${ch}`, 7)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    await expect(call('stories:draft', 'nope', 'topic', 8)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses a draft with no topic, and applies a draft to the saved story', async () => {
    const { call } = harness()
    const s = await make()
    await expect(call('stories:draft', s.id, '   ', 10)).rejects.toMatchObject({ code: 'EMPTY' })
    const saved = await call<Story>('stories:draft', s.id, 'CVs', 10)
    expect(saved).toMatchObject({ title: 'AI title', caption: 'cap', hashtags: ['#a'] })
    expect((await getStory(root, s.id))?.caption).toBe('cap')
  })

  it('makes the voice: lines.json, the engine call, timing back, progress with the story id', async () => {
    const { call, calls } = harness()
    const s = await make()
    const t = await call<StoryTiming>('stories:makeVoice', s.id)
    expect(t.duration).toBe(10)
    const c = calls.engine.find((e) => e.cmd === 'story-voice')!
    expect(c.args).toContain(join(root, 'models', 'kokoro'))
    expect(c.args.join(' ')).toContain('--voice af_heart')
    await expect(fs.stat(join(root, 'Stories', s.id, 'work', 'lines.json'))).resolves.toBeTruthy()
    expect(calls.progress[0]).toEqual({ id: s.id, stage: 'voice', pct: 50, message: 'half' })
    expect(await call('stories:audioUrl', s.id)).toContain(join('audio', 'vo.wav'))
    expect(await call('stories:timing', s.id)).toMatchObject({ duration: 10 })
  })

  it('refuses a second job on the same story while one runs, and frees it after', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    const { call } = harness({
      runEngine: async (cmd, args) => {
        if (cmd === 'story-voice') {
          await gate
          const timing = args[args.indexOf('--timing') + 1]!
          await fs.writeFile(timing, JSON.stringify({ duration: 3, lines: [{ start: 0, end: 3 }], words: [], textHash: 'h' }))
        }
        return {}
      }
    })
    const s = await make()
    const first = call('stories:makeVoice', s.id)
    await new Promise((r) => setTimeout(r, 20))
    await expect(call('stories:makeVoice', s.id)).rejects.toMatchObject({ code: 'BUSY' })
    await expect(call('stories:export', s.id)).rejects.toMatchObject({ code: 'BUSY' })
    await expect(call('stories:remove', s.id)).rejects.toMatchObject({ code: 'BUSY' })
    release()
    await first
    await expect(call('stories:makeVoice', s.id)).resolves.toBeTruthy()
  })

  it('frees the story after a failed job', async () => {
    let fails = true
    const { call } = harness({
      runEngine: async (cmd, args) => {
        if (fails) throw { code: 'TTS_MISSING', userMessage: 'add it' }
        await fs.writeFile(args[args.indexOf('--timing') + 1]!, JSON.stringify({ duration: 1, lines: [], words: [], textHash: 'h' }))
        return {}
      }
    })
    const s = await make()
    await expect(call('stories:makeVoice', s.id)).rejects.toMatchObject({ code: 'TTS_MISSING' })
    fails = false
    await expect(call('stories:makeVoice', s.id)).resolves.toBeTruthy()
  })

  it('uses a recording: null when cancelled, else copies, aligns and saves the voice', async () => {
    const take = join(root, 'take.m4a')
    await fs.writeFile(take, 'aud')
    let pick: string | null = null
    const { call, calls } = harness({ chooseFile: async () => pick })
    const s = await make()
    expect(await call('stories:useRecording', s.id)).toBeNull()
    pick = take
    expect(await call<StoryTiming>('stories:useRecording', s.id)).toMatchObject({ duration: 10 })
    expect(calls.engine.map((e) => e.cmd)).toEqual(['story-align'])
    expect((await getStory(root, s.id))?.voice).toEqual({ kind: 'recording', file: 'recording.m4a' })
    expect(await call<string>('stories:audioUrl', s.id)).toContain('recording.m4a')
  })

  it('a recording that cannot be aligned leaves the old recording and timing as they were', async () => {
    const take = join(root, 'take.m4a')
    const bad = join(root, 'bad.wav')
    await fs.writeFile(take, 'aud')
    await fs.writeFile(bad, 'noise')
    let pick = take
    let failAlign = false
    const { call } = harness({
      chooseFile: async () => pick,
      runEngine: async (cmd, args) => {
        if (cmd !== 'story-align') return {}
        if (failAlign) throw { code: 'ALIGN_FAILED', userMessage: 'I could not find your lines in that recording.' }
        const t = args[args.indexOf('--timing') + 1]!
        await fs.mkdir(join(t, '..'), { recursive: true })
        await fs.writeFile(t, JSON.stringify({ duration: 7, lines: [{ start: 0, end: 7 }], words: [], textHash: 'x' }))
        return {}
      }
    })
    const s = await make()
    await call('stories:useRecording', s.id)
    const dir = join(root, 'Stories', s.id)
    const before = await fs.readFile(join(dir, 'work', 'timing.json'), 'utf8')
    pick = bad
    failAlign = true
    await expect(call('stories:useRecording', s.id)).rejects.toMatchObject({ code: 'ALIGN_FAILED' })
    expect(await fs.readdir(join(dir, 'audio'))).toEqual(['recording.m4a'])
    expect(await fs.readFile(join(dir, 'work', 'timing.json'), 'utf8')).toBe(before)
    expect((await fs.readdir(join(dir, 'work'))).filter((f) => f.startsWith('incoming') || f.endsWith('.next'))).toEqual([])
    expect((await getStory(root, s.id))?.voice).toEqual({ kind: 'recording', file: 'recording.m4a' })
  })

  it('refuses to export with a voice made for other lines or another voice (VOICE_STALE)', async () => {
    const { call, calls } = harness()
    const s = await make()
    await call('stories:makeVoice', s.id)
    const fresh = (await getStory(root, s.id))!
    await saveStory(root, { ...fresh, voice: { kind: 'kokoro', voice: 'am_adam', speed: 1 } }, T)
    await expect(call('stories:export', s.id)).rejects.toMatchObject({ code: 'VOICE_STALE' })
    await saveStory(root, { ...fresh, lines: fresh.lines.map((l, i) => (i === 1 ? { ...l, spoken: 'said another way' } : l)) }, T)
    await expect(call('stories:export', s.id)).rejects.toMatchObject({ code: 'VOICE_STALE' })
    expect(calls.exports).toEqual([])
  })

  it('refuses to export without timing (NO_VOICE)', async () => {
    const { call, calls } = harness()
    const s = await make()
    await expect(call('stories:export', s.id)).rejects.toMatchObject({ code: 'NO_VOICE', userMessage: expect.stringContaining('voice') })
    expect(calls.exports).toEqual([])
  })

  it('exports to renders/<id>.mp4 and writes caption.txt, removing it when the caption is empty', async () => {
    const { call, calls } = harness()
    const s = await make()
    await call('stories:makeVoice', s.id)
    await saveStory(root, { ...s, caption: 'Hello', hashtags: ['#cv', '#jobs'] }, T)
    const r = await call<{ file: string }>('stories:export', s.id)
    const renders = join(root, 'Stories', s.id, 'renders')
    expect(r.file).toBe(join(renders, `${s.id}.mp4`))
    expect(calls.exports[0]!.audio).toBe(join(root, 'Stories', s.id, 'audio', 'vo.wav'))
    expect(calls.exports[0]!.duration).toBeGreaterThanOrEqual(10)
    expect(await fs.readFile(join(renders, 'caption.txt'), 'utf8')).toBe('Hello\n\n#cv #jobs\n')
    expect(calls.progress.some((p) => p.stage === 'export' && p.pct === 40)).toBe(true)
    await saveStory(root, { ...(await getStory(root, s.id))!, caption: '', hashtags: [] }, T)
    await call('stories:export', s.id)
    await expect(fs.stat(join(renders, 'caption.txt'))).rejects.toThrow()
  })

  it('lists only valid English voice options and reports the model status', async () => {
    const { call } = harness()
    expect(await call('stories:voices')).toEqual([{ id: 'af_heart', label: 'Heart' }])
    expect(await call('stories:voiceModel')).toEqual({ installed: true, downloaded: 1, total: 1, packageMissing: false })
  })

  it('reveals the renders folder when it exists, else the story folder', async () => {
    const { call, calls } = harness()
    const s = await make()
    await call('stories:reveal', s.id)
    await fs.mkdir(join(root, 'Stories', s.id, 'renders'))
    await call('stories:reveal', s.id)
    expect(calls.revealed).toEqual([join(root, 'Stories', s.id), join(root, 'Stories', s.id, 'renders')])
  })
})
