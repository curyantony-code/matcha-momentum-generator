import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { readLine, readPaste, studyErrorText, type ReelStudy, type StudyList, type StudyMeasure } from '../src/shared/study'
import { StudyQueue, type StudyDeps } from '../src/main/study'
import { conceptBlock, noteName, researchNote, templateFrom, withConcept } from '../src/main/study-notes'
import { cleanAddOptions } from '../src/main/study-ipc'
import type { CreatorPatterns, StudyReelDetail } from '../src/shared/study'
import type { CreatorPatterns as AiCreatorPatterns, ReelStudy as AiReelStudy } from '../../ai/src/study'

// The app's mirror of the AI package's types must accept what the package returns (checked by tsc).
export const aiStudyFits = (s: AiReelStudy): ReelStudy => s
export const aiCreatorFits = (c: AiCreatorPatterns): CreatorPatterns => c

describe('reading what was pasted', () => {
  it('knows videos and profiles on all three platforms', () => {
    const r = (t: string) => readLine(t, 'tiktok')
    expect(r('https://www.instagram.com/reel/DXUay41ivSK/?igsh=abc')).toEqual({ kind: 'video', platform: 'instagram', url: 'https://www.instagram.com/reel/DXUay41ivSK/' })
    expect(r('instagram.com/p/DXUay41ivSK')).toMatchObject({ kind: 'video', platform: 'instagram' })
    expect(r('https://www.instagram.com/realrobertgutierrez/')).toMatchObject({ kind: 'creator', platform: 'instagram', handle: 'realrobertgutierrez' })
    expect(r('https://www.tiktok.com/@scout2015/video/6718335390845095173')).toMatchObject({ kind: 'video', platform: 'tiktok' })
    expect(r('https://vm.tiktok.com/ZMabc123/')).toMatchObject({ kind: 'video', platform: 'tiktok' })
    expect(r('https://www.tiktok.com/@khaby.lame')).toMatchObject({ kind: 'creator', handle: 'khaby.lame', url: 'https://www.tiktok.com/@khaby.lame' })
    expect(r('https://youtube.com/shorts/kPI9Mc35mOg?feature=share')).toEqual({ kind: 'video', platform: 'youtube', url: 'https://www.youtube.com/shorts/kPI9Mc35mOg' })
    expect(r('https://youtu.be/kPI9Mc35mOg')).toMatchObject({ kind: 'video', platform: 'youtube' })
    expect(r('https://www.youtube.com/@MrBeast')).toMatchObject({ kind: 'creator', platform: 'youtube', handle: 'MrBeast' })
  })

  it('a bare @handle goes to the platform picked for handles; anything else is named as not understood', () => {
    expect(readLine('@khaby.lame', 'instagram')).toEqual({ kind: 'creator', platform: 'instagram', handle: 'khaby.lame', url: 'https://www.instagram.com/khaby.lame/' })
    expect(readLine('kallaway', 'youtube')).toMatchObject({ kind: 'unknown' })
    expect(readLine('https://example.com/video/1', 'tiktok')).toMatchObject({ kind: 'unknown' })
    expect(readLine('javascript:alert(1)', 'tiktok')).toMatchObject({ kind: 'unknown' })
    expect(readLine('   ', 'tiktok')).toBeNull()
  })

  it('splits on lines, spaces and commas, drops repeats and caps the list', () => {
    const w = readPaste('@aa, @aa\nhttps://youtu.be/x  https://youtu.be/x\n- @bb', 'tiktok')
    expect(w.map((x) => (x.kind === 'unknown' ? x.text : x.url))).toEqual(['https://www.tiktok.com/@aa', 'https://youtu.be/x', 'https://www.tiktok.com/@bb'])
    expect(readPaste(Array.from({ length: 60 }, (_, i) => `@user${i}`).join('\n'), 'tiktok')).toHaveLength(40)
  })

  it('cleans what the screen sends', () => {
    expect(cleanAddOptions({ handles: 'myspace', perCreator: 'x', browser: 'netscape' })).toEqual({ handles: 'tiktok', perCreator: 5, browser: null })
    expect(cleanAddOptions({ handles: 'youtube', perCreator: 3, browser: 'safari' })).toEqual({ handles: 'youtube', perCreator: 3, browser: 'safari' })
  })

  it('turns engine codes into plain words', () => {
    expect(studyErrorText('LOGIN_NEEDED', 'x')).toMatch(/browser's Instagram login/)
    expect(studyErrorText('WEIRD', 'Fallback.')).toBe('Fallback.')
  })
})

const study = (over: Partial<ReelStudy> = {}): ReelStudy => ({
  summary: 'A growth how-to.',
  script: { hook: { text: 'This is how I got 5,000 users', at: 0, shape: 'Result', why: 'number first' }, beats: [{ at: 0, role: 'hook', said: 'This is how', note: 'opens' }, { at: 33, role: 'rehook', said: 'But here is the part', note: 'reopens' }], rehook: { at: 33, text: 'But here is the part' }, payoff: 'DMs', cta: { text: 'comment GROW', kind: 'comment' }, loop: { loops: false, how: 'no' } },
  formula: { name: 'One-take proof', steps: ['Hook: a number and a result', 'One step, with proof on screen'], hookShape: 'Result', closestTemplate: { name: 'One-take proof', fit: 'close', diff: 'no intro' }, concept: 'A result anyone can copy' },
  edit: { pace: 'slow', captions: 'small', onScreen: 'cards', broll: 'none', camera: 'car', zooms: 'none', sound: 'voice', look: 'day', muted: 'yes' },
  why: ['Number in second 1.'], borrow: ['Proof above your head.'], avoid: ['His words.'], tryThis: { idea: 'My signups', hook: 'Here is how I got [n] signups' },
  ...over
})
const detail = (over: Partial<StudyReelDetail> = {}): StudyReelDetail => ({
  id: 'abc123def456', url: 'https://www.instagram.com/p/X/', platform: 'instagram', creator: 'rob', addedAt: '', status: 'done', pct: 100, error: null, errorCode: null,
  title: '', views: 50000, vsUsual: 4.2, durationSec: 86, poster: null, formula: 'One-take proof', hook: 'x', creatorKey: null, caption: '', video: null, likes: null, comments: null,
  measure: { durationSec: 86, cuts: [40], cutsPerMin: 1.4, avgShotSec: 43, wpm: 243, firstWordAt: 0, speechRatio: 0.9, musicLikely: false, words: [], frames: [] },
  study: study(), saved: { concept: false, template: false, research: null }, ...over
})

describe('sending a study on', () => {
  it('a concept lands at the end of "## Concepts", once', () => {
    const block = conceptBlock(detail())
    expect(block.split('\n')[0]).toBe('### One-take proof (studied: @rob)')
    expect(block).toContain('- The shape: Hook: a number and a result → One step, with proof on screen')
    expect(block).toContain('50,000 views (4.2× their usual)')
    const swipe = '# Swipe\n\n## Concepts\n\n### Bold claim\n- x\n\n## 2026-11-02\n### other\n'
    const next = withConcept(swipe, block)
    expect(next).toBe('# Swipe\n\n## Concepts\n\n### Bold claim\n- x\n\n' + block + '\n\n## 2026-11-02\n### other\n')
    expect(withConcept(next, block)).toBe(next)
    expect(withConcept('', block)).toBe(`## Concepts\n\n${block}\n`)
    expect(withConcept('# Swipe\n## Concepts\n### A\n', block)).toBe(`# Swipe\n## Concepts\n### A\n\n${block}\n`)
  })

  it('a template gets the steps, an ask and a sign-off, and says where it came from', () => {
    const t = templateFrom(detail())
    expect(t).toEqual({ name: 'One-take proof', hint: 'A result anyone can copy', beats: '1. Hook: a number and a result\n2. One step, with proof on screen\n3. CTA: one ask (a follow, or your link).\n4. Sign-off.', basedOn: "@rob's reel" })
  })

  it('a research note carries the timestamps and the reminder, and gets a safe name', () => {
    const note = researchNote(detail(), '2026-11-09')
    expect(note).toContain('# Study · @rob · 2026-11-09')
    expect(note).toContain('- **0:33 rehook:** "But here is the part" reopens')
    expect(note).toContain('Learn the shape, never the words.')
    expect(note).not.toMatch(/\n\n\n/)
    expect(noteName({ id: 'abc123def456', creator: '../../Rob G!', platform: 'instagram' }, '2026-11-09')).toBe('2026-11-09-study-rob-g-abc123.md')
  })
})

const measure: StudyMeasure = { durationSec: 6, cuts: [2, 4], cutsPerMin: 20, avgShotSec: 2, words: [{ w: 'hi', s: 0, e: 0.3 }], wordCount: 1, wpm: 160, firstWordAt: 0, speechRatio: 0.8, musicLikely: false, frames: [{ file: 'frames/f00.jpg', at: 0 }], language: 'en' }

function fakeDeps(root: string, over: Partial<StudyDeps> = {}): StudyDeps & { calls: string[]; lists: StudyList[] } {
  const calls: string[] = []
  const lists: StudyList[] = []
  return {
    calls,
    lists,
    root,
    async runEngine(cmd, args) {
      calls.push(`${cmd} ${args.filter((a) => !isAbsolute(a)).join(' ')}`.trim())
      const out = args[args.indexOf('--out') + 1]!
      if (cmd === 'study-fetch') {
        if (args.at(-1)!.includes('private')) throw { code: 'UNAVAILABLE', userMessage: 'gone' }
        await writeFile(join(out, 'video.mp4'), 'v')
        await writeFile(join(out, 'source.json'), JSON.stringify({ url: args.at(-1), platform: 'tiktok', id: '1', creator: 'abc', creatorUrl: null, title: 't', caption: '', views: 5000, likes: null, comments: null, durationSec: 6, uploadedAt: null, video: 'video.mp4' }))
      }
      if (cmd === 'study-measure') {
        await mkdir(join(out, 'frames'), { recursive: true })
        await writeFile(join(out, 'frames', 'f00.jpg'), 'jpg')
        await writeFile(join(out, 'measure.json'), JSON.stringify(measure))
      }
      if (cmd === 'study-list') return { items: [{ url: 'https://www.tiktok.com/@abc/video/1', views: 100 }, { url: 'https://www.tiktok.com/@abc/video/2', views: 9000 }, { url: 'https://www.tiktok.com/@abc/video/3', views: 400 }] }
      return {}
    },
    async studyReel(_src, _m, frames, ctx) {
      calls.push(`studyReel frames=${frames.length} median=${ctx.medianViews} shapes=${ctx.hookShapes.length > 5}`)
      return study()
    },
    async studyCreator(creator, reels) {
      calls.push(`studyCreator ${creator} ${reels.length}`)
      return { signature: 'numbers first', hooks: '', structure: '', edit: '', length: '', topics: '', best: [], borrow: [] }
    },
    context: async () => ({ templates: [], about: '' }),
    mediaUrl: (p) => `reel-media://${p}`,
    changed: (l) => void lists.push(l),
    log: () => {},
    ...over
  }
}

const settle = async (q: StudyQueue): Promise<void> => {
  // the queue runs in the background: wait until it has nothing in progress
  for (let i = 0; i < 200; i++) {
    const l = await q.list()
    if (l.reels.every((r) => r.status === 'done' || r.status === 'failed') && l.creators.every((c) => c.status === 'done' || c.status === 'failed')) return
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error('queue did not settle')
}

describe('the study queue', () => {
  it('downloads, measures and studies a video, with its first frame as the poster', async () => {
    const d = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    const q = new StudyQueue(d)
    await q.add([{ kind: 'video', url: 'https://www.tiktok.com/@abc/video/9', platform: 'tiktok' }], { handles: 'tiktok', perCreator: 5, browser: null })
    await settle(q)
    expect(d.calls).toEqual(['study-fetch --out https://www.tiktok.com/@abc/video/9', 'study-measure --out', 'studyReel frames=1 median=null shapes=true'])
    const [r] = (await q.list()).reels
    expect(r).toMatchObject({ status: 'done', creator: 'abc', formula: 'One-take proof', views: 5000, vsUsual: null })
    expect(r!.poster).toMatch(/^reel-media:\/\/.*f00\.jpg$/)
    const det = await q.detail(r!.id)
    expect(det!.measure!.frames[0]!.url).toMatch(/f00\.jpg$/)
    expect(det!.study!.formula.name).toBe('One-take proof')
    expect(d.lists.length).toBeGreaterThan(2)
  })

  it('a failed download says why in plain words, and Try again starts it over', async () => {
    let fail = true
    const base = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    const d = { ...base, runEngine: async (cmd: string, args: string[]) => { if (cmd === 'study-fetch' && fail) throw { code: 'LOGIN_NEEDED', userMessage: 'x' }; return base.runEngine(cmd, args) } }
    const q = new StudyQueue(d)
    await q.add([{ kind: 'video', url: 'https://www.instagram.com/p/Y/', platform: 'instagram' }], { handles: 'tiktok', perCreator: 5, browser: 'chrome' })
    await settle(q)
    const [r] = (await q.list()).reels
    expect(r).toMatchObject({ status: 'failed', errorCode: 'LOGIN_NEEDED' })
    expect(r!.error).toMatch(/browser's Instagram login/)
    fail = false
    await q.retry(r!.id)
    await settle(q)
    expect((await q.list()).reels[0]!.status).toBe('done')
    expect(base.calls[0]).toBe('study-fetch --out --cookies-from-browser chrome https://www.instagram.com/p/Y/')
  })

  it('a creator: lists their videos, studies the most viewed against their median, then finds the patterns', async () => {
    const d = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    const q = new StudyQueue(d)
    await q.add([{ kind: 'creator', url: 'https://www.tiktok.com/@abc', platform: 'tiktok', handle: 'abc' }], { handles: 'tiktok', perCreator: 2, browser: null })
    await settle(q)
    const l = await q.list()
    expect(l.creators[0]).toMatchObject({ handle: 'abc', status: 'done', medianViews: 400, patterns: { signature: 'numbers first' } })
    expect(l.reels.map((r) => r.url).sort()).toEqual(['https://www.tiktok.com/@abc/video/2', 'https://www.tiktok.com/@abc/video/3'])
    expect(d.calls).toContain('studyReel frames=1 median=400 shapes=true')
    expect(d.calls.at(-1)).toBe('studyCreator abc 2')
    expect(l.reels.find((r) => r.url.endsWith('/2'))!.vsUsual).toBe(12.5)
  })

  it('remove takes a creator with its videos, and ids from outside are refused', async () => {
    const root = mkdtempSync(join(tmpdir(), 'study-'))
    const q = new StudyQueue(fakeDeps(root))
    await q.add([{ kind: 'creator', url: 'https://www.tiktok.com/@abc', platform: 'tiktok', handle: 'abc' }], { handles: 'tiktok', perCreator: 1, browser: null })
    await settle(q)
    const l = await q.remove('tiktok-abc')
    expect(l).toEqual({ reels: [], creators: [] })
    expect(() => q.dirOf('../../etc')).toThrow()
    expect(await q.detail('../x')).toBeNull()
  })

  it('a quit mid-study picks up again on the next start', async () => {
    const root = mkdtempSync(join(tmpdir(), 'study-'))
    const dir = join(root, 'Study', 'reels', 'abcdef123456')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'item.json'), JSON.stringify({ id: 'abcdef123456', url: 'https://youtu.be/x', platform: 'youtube', addedAt: '', status: 'measuring', pct: 40, error: null, errorCode: null, creatorKey: null, browser: null, medianViews: null, saved: { concept: false, template: false, research: null } }))
    const d = fakeDeps(root)
    const q = new StudyQueue(d)
    // it was stopped in "measuring": item.json is not final, so resume runs it
    await writeFile(join(dir, 'item.json'), (await readFile(join(dir, 'item.json'), 'utf8')).replace('"measuring"', '"queued"'))
    await q.resume()
    await settle(q)
    expect((await q.list()).reels[0]!.status).toBe('done')
  })
})

describe('the study queue, under pressure', () => {
  it('browser cookies only go with Instagram links, never TikTok or YouTube', async () => {
    const d = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    const q = new StudyQueue(d)
    await q.add([{ kind: 'video', url: 'https://youtu.be/abc', platform: 'youtube' }, { kind: 'creator', url: 'https://www.tiktok.com/@abc', platform: 'tiktok', handle: 'abc' }], { handles: 'tiktok', perCreator: 1, browser: 'chrome' })
    await settle(q)
    expect(d.calls.filter((c) => c.includes('cookies'))).toEqual([])
  })

  it('many progress lines while downloading never break the item (they stay in memory)', async () => {
    const base = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    const d = { ...base, runEngine: async (cmd: string, args: string[], onProgress?: (p: { stage: string; pct: number; message: string }) => void, signal?: AbortSignal) => {
      for (let p = 0; p <= 100; p += 6) onProgress?.({ stage: 'fetch', pct: p, message: '' })
      return base.runEngine(cmd, args, onProgress, signal)
    } }
    const q = new StudyQueue(d)
    await q.add([{ kind: 'video', url: 'https://youtu.be/abc', platform: 'youtube' }], { handles: 'tiktok', perCreator: 1, browser: null })
    await settle(q)
    expect((await q.list()).reels.map((r) => r.status)).toEqual(['done'])
  })

  it('removing a video while it is downloading stops it, and it does not come back', async () => {
    const base = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    let release!: () => void
    const started = new Promise<void>((ok) => (release = ok))
    const d = { ...base, runEngine: (cmd: string, args: string[], _p?: unknown, signal?: AbortSignal) =>
      cmd === 'study-fetch' ? new Promise((_, no) => { release(); signal?.addEventListener('abort', () => no({ code: 'CANCELLED' })) }) : base.runEngine(cmd, args) }
    const q = new StudyQueue(d)
    const l = await q.add([{ kind: 'video', url: 'https://youtu.be/abc', platform: 'youtube' }], { handles: 'tiktok', perCreator: 1, browser: null })
    await started
    await q.remove(l.reels[0]!.id)
    await new Promise((r) => setTimeout(r, 30))
    expect(await q.list()).toEqual({ reels: [], creators: [] })
  })

  it('a creator stopped with one video done is not marked done, and its videos carry on next start', async () => {
    const root = mkdtempSync(join(tmpdir(), 'study-'))
    const base = fakeDeps(root)
    let q!: StudyQueue
    let reels = 0
    const d = { ...base, studyReel: async (...a: Parameters<StudyDeps['studyReel']>) => { if (++reels === 1) q.stop(); return base.studyReel(...a) } }
    q = new StudyQueue(d)
    await q.add([{ kind: 'creator', url: 'https://www.tiktok.com/@abc', platform: 'tiktok', handle: 'abc' }], { handles: 'tiktok', perCreator: 3, browser: null })
    await new Promise((r) => setTimeout(r, 80))
    expect((await q.list()).creators[0]!.status).toBe('studying')
    const again = new StudyQueue(fakeDeps(root))
    await again.resume()
    await settle(again)
    const l = await again.list()
    expect(l.creators[0]!.status).toBe('done')
    expect(l.reels.every((r) => r.status === 'done')).toBe(true)
  })

  it('adding the same creator twice studies it once', async () => {
    const d = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    const q = new StudyQueue(d)
    const c = { kind: 'creator' as const, url: 'https://www.tiktok.com/@abc', platform: 'tiktok' as const, handle: 'abc' }
    await q.add([c], { handles: 'tiktok', perCreator: 2, browser: null })
    await settle(q)
    await q.add([c], { handles: 'tiktok', perCreator: 2, browser: null })
    await settle(q)
    const l = await q.list()
    expect([l.creators.length, l.reels.length]).toEqual([1, 2])
  })

  it('retrying a creator whose videos failed reuses them, and removing it takes them all', async () => {
    const base = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    let fail = true
    const d = { ...base, studyReel: async (...a: Parameters<StudyDeps['studyReel']>) => { if (fail) throw { code: 'X', userMessage: 'no' }; return base.studyReel(...a) } }
    const q = new StudyQueue(d)
    await q.add([{ kind: 'creator', url: 'https://www.tiktok.com/@abc', platform: 'tiktok', handle: 'abc' }], { handles: 'tiktok', perCreator: 2, browser: null })
    await settle(q)
    const before = await q.list()
    expect(before.creators[0]!.status).toBe('failed')
    fail = false
    await q.retry('tiktok-abc')
    await settle(q)
    const after = await q.list()
    expect(after.creators[0]!.status).toBe('done')
    expect(after.reels.map((r) => r.id).sort()).toEqual(before.reels.map((r) => r.id).sort())
    expect(await q.remove('tiktok-abc')).toEqual({ reels: [], creators: [] })
  })

  it('Try again refuses ids that are not a video or a creator', async () => {
    const q = new StudyQueue(fakeDeps(mkdtempSync(join(tmpdir(), 'study-'))))
    for (const bad of ['../../../etc/passwd', 'tiktok-../../x', '/abs/path']) await expect(q.retry(bad)).resolves.toEqual({ reels: [], creators: [] })
  })

  it('a video whose download went missing is downloaded again on Try again', async () => {
    const base = fakeDeps(mkdtempSync(join(tmpdir(), 'study-')))
    let ai = 0
    const d = { ...base, studyReel: async (...a: Parameters<StudyDeps['studyReel']>) => { if (++ai === 1) throw { code: 'X', userMessage: 'no' }; return base.studyReel(...a) } }
    const q = new StudyQueue(d)
    const l = await q.add([{ kind: 'video', url: 'https://youtu.be/abc', platform: 'youtube' }], { handles: 'tiktok', perCreator: 1, browser: null })
    await settle(q)
    const id = l.reels[0]!.id
    const { rm } = await import('node:fs/promises')
    await rm(join(q.dirOf(id), 'video.mp4'))
    await q.retry(id)
    await settle(q)
    expect((await q.list()).reels[0]!.status).toBe('done')
    expect(base.calls.filter((c) => c.startsWith('study-fetch'))).toHaveLength(2)
  })
})
