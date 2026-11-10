// Study reels: a queue that downloads each pasted video, measures it, and has the AI break it down, one at a time.
// Each video gets a folder under <root>/Study/reels/<id> (the engine's source.json, measure.json, video.mp4 and
// frames, plus item.json and study.json); a creator gets <root>/Study/creators/<key>.json. Everything it needs
// comes in through StudyDeps, so it runs in tests without Electron.
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  CreatorPatterns,
  ReelStudy,
  StudyAddOptions,
  StudyCreatorSummary,
  StudyList,
  StudyMeasure,
  StudyReelDetail,
  StudyReelSummary,
  StudySource,
  Wanted
} from '../shared/study'
import { MAX_PER_CREATOR, studyErrorText } from '../shared/study'
import type { EngineProgress } from './engine'
// a temp file of its own per write, and a retry when Windows holds the file open for a moment
import { writeJson } from './store'

export interface StudyDeps {
  root: string
  runEngine(cmd: string, args: string[], onProgress?: (p: EngineProgress) => void, signal?: AbortSignal): Promise<unknown>
  studyReel(src: StudySource, m: StudyMeasure, frames: { at: number; mime: string; base64: string }[], ctx: { templates: { name: string; beats: string }[]; hookShapes: string[]; about: string; medianViews: number | null }, signal?: AbortSignal): Promise<ReelStudy>
  studyCreator(creator: string, reels: { url: string; views: number | null; study: ReelStudy; measure: StudyMeasure }[], signal?: AbortSignal): Promise<CreatorPatterns>
  /** Their templates and a short line on who they are, for the AI. */
  context(): Promise<{ templates: { name: string; beats: string }[]; about: string }>
  mediaUrl(path: string): string
  changed(list: StudyList): void
  log(line: string): void
}

/** The hook shapes the script writer knows (ai/prompts/writeScript.md), so a study names them the same way. */
export const HOOK_SHAPES = ['Exact method', 'The only one', 'Numbered', 'Time collapse', 'Contrarian', 'Transformation', 'Confession', 'Curiosity question', 'Identity call-out', 'Story cold open', 'Comparison', 'Stakes', 'Compression', 'Result', 'Prediction']

interface Item {
  id: string
  url: string
  platform: StudyReelSummary['platform']
  addedAt: string
  status: StudyReelSummary['status']
  pct: number
  error: string | null
  errorCode: string | null
  creatorKey: string | null
  browser: StudyAddOptions['browser']
  /** The creator's median views, when the video came from their profile. */
  medianViews: number | null
  saved: StudyReelDetail['saved']
}

interface Creator {
  key: string
  platform: StudyCreatorSummary['platform']
  handle: string
  url: string
  addedAt: string
  status: StudyCreatorSummary['status']
  error: string | null
  errorCode: string | null
  reels: string[]
  medianViews: number | null
  perCreator: number
  browser: StudyAddOptions['browser']
  patterns: CreatorPatterns | null
}

const FINAL = new Set(['done', 'failed'])
const ID = /^[a-z0-9-]{6,40}$/
/** A creator's key: the platform, then the handle in lower case. */
export const CREATOR_KEY = /^(instagram|tiktok|youtube)-[a-z0-9._-]{1,60}$/

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as T
  } catch {
    return null
  }
}


async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/** An engine or AI failure as { code, text } for the person. */
function failure(e: unknown): { code: string | null; text: string } {
  const o = (e ?? {}) as { code?: unknown; userMessage?: unknown; message?: unknown }
  const code = typeof o.code === 'string' ? o.code : null
  const text = typeof o.userMessage === 'string' ? o.userMessage : typeof o.message === 'string' ? o.message : 'Something went wrong.'
  return { code, text: studyErrorText(code, text) }
}

const medianOf = (values: (number | null)[]): number | null => {
  const v = values.filter((x): x is number => typeof x === 'number' && x >= 0).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2
}

const validSource = (s: StudySource | null): s is StudySource => !!s && typeof s.url === 'string' && typeof s.durationSec === 'number'
const validMeasure = (m: StudyMeasure | null): m is StudyMeasure =>
  !!m && typeof m.durationSec === 'number' && Array.isArray(m.words) && Array.isArray(m.cuts) && Array.isArray(m.frames)

/** Browser cookies only ever go with an Instagram link: the setting is "my browser's Instagram login". */
const cookiesFor = (platform: Item['platform'], browser: Item['browser']): string[] =>
  platform === 'instagram' && browser ? ['--cookies-from-browser', browser] : []

export class StudyQueue {
  private chain: Promise<void> = Promise.resolve()
  private stopped = new AbortController()
  /** Download and listen progress, kept in memory (never written: only the job itself writes its item). */
  private pct = new Map<string, number>()
  /** One write at a time per item or creator. */
  private locks = new Map<string, Promise<unknown>>()
  /** The running job of each item or creator, so removing it stops it. */
  private jobs = new Map<string, AbortController>()
  /** Removed this session: nothing may write them back. */
  private removed = new Set<string>()

  constructor(private readonly d: StudyDeps) {}

  private reelsDir = (): string => join(this.d.root, 'Study', 'reels')
  private creatorsDir = (): string => join(this.d.root, 'Study', 'creators')
  dirOf = (id: string): string => {
    if (!ID.test(id)) throw new Error('bad study id')
    return join(this.reelsDir(), id)
  }
  private creatorFile = (key: string): string => {
    if (!CREATOR_KEY.test(key)) throw new Error('bad creator key')
    return join(this.creatorsDir(), `${key}.json`)
  }

  /** Picks up anything a quit interrupted: unfinished creators (with their videos), and any unfinished video whose
   * creator is finished or gone. */
  async resume(): Promise<void> {
    const creators = await this.creators()
    const open = new Set(creators.filter((c) => !FINAL.has(c.status)).map((c) => c.key))
    for (const key of open) this.enqueue(() => this.runCreator(key))
    for (const i of await this.items()) if (!FINAL.has(i.status) && !(i.creatorKey && open.has(i.creatorKey))) this.enqueue(() => this.runReel(i.id))
  }

  /** Queues what was pasted; returns the new list. A creator already here is not added twice. */
  async add(wanted: Wanted[], opts: StudyAddOptions): Promise<StudyList> {
    const now = new Date().toISOString()
    for (const w of wanted) {
      if (w.kind === 'video') {
        const item = await this.newItem(w.url, w.platform, opts.browser, null, null, now)
        this.enqueue(() => this.runReel(item.id))
      } else if (w.kind === 'creator') {
        const key = `${w.platform}-${w.handle.toLowerCase()}`.replace(/[^a-z0-9._-]/g, '')
        if (!CREATOR_KEY.test(key)) continue
        const have = await readJson<Creator>(this.creatorFile(key))
        if (have && !this.removed.has(key)) {
          if (have.status === 'failed') await this.retry(key)
          continue
        }
        this.removed.delete(key)
        const c: Creator = { key, platform: w.platform, handle: w.handle, url: w.url, addedAt: now, status: 'listing', error: null, errorCode: null, reels: [], medianViews: null, perCreator: Math.max(1, Math.min(MAX_PER_CREATOR, Math.round(opts.perCreator))), browser: opts.browser, patterns: null }
        await fs.mkdir(this.creatorsDir(), { recursive: true })
        await writeJson(this.creatorFile(key), c)
        this.enqueue(() => this.runCreator(key))
      }
    }
    return this.publish()
  }

  /** Try again: a failed video from where it stopped; a creator's failed videos, or its listing when nothing was listed. */
  async retry(id: string): Promise<StudyList> {
    // a creator key can look like a video id ("tiktok-abc"): go by which one is really there
    if (ID.test(id) && (await this.item(id))) {
      const item = await this.update(id, (i) => (i.status === 'failed' ? { ...i, status: 'queued', error: null, errorCode: null } : null))
      if (item) {
        const creator = item.creatorKey ? await this.updateCreator(item.creatorKey, (c) => (FINAL.has(c.status) ? { ...c, status: 'studying', error: null, errorCode: null } : null)) : null
        // a creator's video goes through its creator, so the patterns are worked out again with it
        this.enqueue(() => (creator ? this.runCreator(creator.key) : this.runReel(id)))
      }
    } else if (CREATOR_KEY.test(id)) {
      const c = await this.updateCreator(id, (c) => (c.status === 'failed' ? { ...c, status: c.reels.length ? 'studying' : 'listing', error: null, errorCode: null } : null))
      if (c) {
        for (const r of c.reels) await this.update(r, (i) => (i.status === 'failed' ? { ...i, status: 'queued', error: null, errorCode: null } : null))
        this.enqueue(() => this.runCreator(id))
      }
    }
    return this.publish()
  }

  /** Removes a video, or a creator with every video it brought; a running one is stopped first. */
  async remove(id: string): Promise<StudyList> {
    if (ID.test(id) && (await this.item(id))) await this.removeItem(id)
    else if (CREATOR_KEY.test(id)) {
      this.removed.add(id)
      this.jobs.get(id)?.abort()
      for (const i of await this.items()) if (i.creatorKey === id) await this.removeItem(i.id)
      await fs.rm(this.creatorFile(id), { force: true })
    }
    return this.publish()
  }

  private async removeItem(id: string): Promise<void> {
    this.removed.add(id)
    this.jobs.get(id)?.abort()
    await fs.rm(this.dirOf(id), { recursive: true, force: true })
  }

  /** Marks what was done with a study (saved as a concept, a template, a research note). */
  async markSaved(id: string, patch: Partial<StudyReelDetail['saved']>): Promise<void> {
    await this.update(id, (i) => ({ ...i, saved: { ...i.saved, ...patch } }))
  }

  stop(): void {
    this.stopped.abort()
  }

  async list(): Promise<StudyList> {
    const [items, creators] = await Promise.all([this.items(), this.creators()])
    const reels = await Promise.all(items.map((i) => this.summary(i)))
    return {
      reels: reels.sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
      creators: creators
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
        .map((c) => ({ key: c.key, platform: c.platform, handle: c.handle, url: c.url, addedAt: c.addedAt, status: c.status, error: c.error, errorCode: c.errorCode, reels: c.reels, medianViews: c.medianViews, patterns: c.patterns }))
    }
  }

  async detail(id: string): Promise<StudyReelDetail | null> {
    const item = await this.item(id)
    if (!item) return null
    const dir = this.dirOf(id)
    const [base, src, m, study] = await Promise.all([this.summary(item), readJson<StudySource>(join(dir, 'source.json')), readJson<StudyMeasure>(join(dir, 'measure.json')), readJson<ReelStudy>(join(dir, 'study.json'))])
    const video = join(dir, 'video.mp4')
    return {
      ...base,
      caption: validSource(src) ? src.caption ?? '' : '',
      video: validSource(src) && (await exists(video)) ? this.d.mediaUrl(video) : null,
      likes: validSource(src) ? src.likes ?? null : null,
      comments: validSource(src) ? src.comments ?? null : null,
      measure: validMeasure(m)
        ? { durationSec: m.durationSec, cuts: m.cuts, cutsPerMin: m.cutsPerMin, avgShotSec: m.avgShotSec, wpm: m.wpm, firstWordAt: m.firstWordAt, speechRatio: m.speechRatio, musicLikely: m.musicLikely, words: m.words, frames: m.frames.map((f) => ({ at: f.at, url: this.d.mediaUrl(join(dir, f.file)) })) }
        : null,
      study: study && study.script ? study : null,
      saved: item.saved
    }
  }

  // ---------------------------------------------------------------- the work

  private enqueue(job: () => Promise<void>): void {
    this.chain = this.chain.then(job).catch((e) => this.d.log(`[study] ${String((e as Error)?.message ?? e)}`))
  }

  /** A job's own stop switch, tied to the app quitting. */
  private startJob(key: string): AbortSignal {
    const ctrl = new AbortController()
    this.jobs.set(key, ctrl)
    return AbortSignal.any([this.stopped.signal, ctrl.signal])
  }

  private async runReel(id: string): Promise<void> {
    const start = await this.item(id)
    if (!start || FINAL.has(start.status) || this.stopped.signal.aborted || this.removed.has(id)) return
    const signal = this.startJob(id)
    const dir = this.dirOf(id)
    const step = async (status: Item['status']): Promise<void> => {
      this.pct.delete(id)
      await this.update(id, (i) => ({ ...i, status }))
      await this.publish()
    }
    try {
      // each step counts as done only when what it wrote is there and reads back
      if (!validSource(await readJson<StudySource>(join(dir, 'source.json'))) || !(await exists(join(dir, 'video.mp4')))) {
        await this.clear(dir, ['source.json', 'video.mp4', 'measure.json', 'frames', 'study.json'])
        await step('fetching')
        await this.d.runEngine('study-fetch', ['--out', dir, ...cookiesFor(start.platform, start.browser), start.url], (p) => this.progress(id, p.pct), signal)
      }
      if (!validMeasure(await readJson<StudyMeasure>(join(dir, 'measure.json')))) {
        await this.clear(dir, ['measure.json', 'frames', 'study.json'])
        await step('measuring')
        await this.d.runEngine('study-measure', ['--out', dir], (p) => this.progress(id, p.pct), signal)
      }
      await step('studying')
      const src = await readJson<StudySource>(join(dir, 'source.json'))
      const m = await readJson<StudyMeasure>(join(dir, 'measure.json'))
      if (!validSource(src) || !validMeasure(m)) throw { code: 'BAD_FILES', userMessage: 'The downloaded files were incomplete. Try again.' }
      const frames: { at: number; mime: string; base64: string }[] = []
      for (const f of m.frames.slice(0, 8)) {
        // a frame that can't be read is left out, not a reason to fail
        const data = await fs.readFile(join(dir, f.file)).catch(() => null)
        if (data) frames.push({ at: f.at, mime: 'image/jpeg', base64: data.toString('base64') })
      }
      const ctx = await this.d.context()
      const study = await this.d.studyReel(src, m, frames, { ...ctx, hookShapes: HOOK_SHAPES, medianViews: start.medianViews }, signal)
      if (signal.aborted || this.removed.has(id)) return
      await writeJson(join(dir, 'study.json'), study)
      await step('done')
    } catch (e) {
      if (signal.aborted || this.removed.has(id)) return
      const f = failure(e)
      this.d.log(`[study] ${id} failed: ${f.code ?? ''} ${f.text}`)
      await this.update(id, (i) => ({ ...i, status: 'failed', error: f.text, errorCode: f.code }))
      await this.publish()
    } finally {
      this.jobs.delete(id)
      this.pct.delete(id)
      // the engine may have written into the folder after it was removed
      if (this.removed.has(id)) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async runCreator(key: string): Promise<void> {
    const start = await readJson<Creator>(this.creatorFile(key))
    if (!start || FINAL.has(start.status) || this.stopped.signal.aborted || this.removed.has(key)) return
    const signal = this.startJob(key)
    try {
      let c: Creator = start
      if (c.status === 'listing') {
        const listed = (await this.d.runEngine('study-list', ['--limit', '30', ...cookiesFor(c.platform, c.browser), c.url], undefined, signal)) as { items?: { url: string; views: number | null }[] }
        const items = (listed?.items ?? []).filter((i) => typeof i?.url === 'string')
        if (!items.length) throw { code: 'LIST_FAILED', userMessage: 'No videos found on this profile.' }
        const median = medianOf(items.map((i) => i.views))
        const withViews = items.filter((i) => typeof i.views === 'number')
        const picked = (withViews.length ? [...withViews].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)) : items).slice(0, c.perCreator)
        const now = new Date().toISOString()
        const reels: string[] = []
        for (const p of picked) reels.push((await this.newItem(p.url, c.platform, c.browser, key, median, now)).id)
        const saved = await this.updateCreator(key, (x) => ({ ...x, status: 'studying', reels, medianViews: median }))
        if (!saved) return
        c = saved
        await this.publish()
      }
      for (const id of c.reels) await this.runReel(id)
      if (signal.aborted || this.removed.has(key)) return
      const states = await Promise.all(c.reels.map((id) => this.item(id)))
      // done only when every one of its videos is finished one way or the other
      if (states.some((i) => i && !FINAL.has(i.status))) return
      const done: { url: string; views: number | null; study: ReelStudy; measure: StudyMeasure }[] = []
      for (const id of c.reels) {
        const dir = this.dirOf(id)
        const [src, study, measure] = await Promise.all([readJson<StudySource>(join(dir, 'source.json')), readJson<ReelStudy>(join(dir, 'study.json')), readJson<StudyMeasure>(join(dir, 'measure.json'))])
        if (validSource(src) && study?.script && validMeasure(measure)) done.push({ url: src.url, views: src.views, study, measure })
      }
      if (!done.length) throw { code: null, userMessage: 'None of their videos could be studied.' }
      const patterns = done.length >= 2 ? await this.d.studyCreator(c.handle, done, signal) : null
      if (signal.aborted) return
      await this.updateCreator(key, (x) => ({ ...x, status: 'done', patterns, error: null, errorCode: null }))
      await this.publish()
    } catch (e) {
      if (signal.aborted || this.removed.has(key)) return
      const f = failure(e)
      this.d.log(`[study] creator ${key} failed: ${f.code ?? ''} ${f.text}`)
      await this.updateCreator(key, (x) => ({ ...x, status: 'failed', error: f.text, errorCode: f.code }))
      await this.publish()
    } finally {
      this.jobs.delete(key)
    }
  }

  private progress(id: string, pct: number): void {
    const was = this.pct.get(id) ?? 0
    if (Math.abs(was - pct) < 5) return
    this.pct.set(id, Math.round(pct))
    void this.publish().catch(() => undefined)
  }

  private async clear(dir: string, names: string[]): Promise<void> {
    for (const n of names) await fs.rm(join(dir, n), { recursive: true, force: true })
  }

  // ---------------------------------------------------------------- storage

  /** One read-change-write at a time per key. */
  private locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    this.locks.set(key, next.catch(() => undefined))
    return next
  }

  /** Changes an item; `fn` returns null to leave it. Never brings back a removed one. */
  private update(id: string, fn: (i: Item) => Item | null): Promise<Item | null> {
    return this.locked(id, async () => {
      if (this.removed.has(id)) return null
      const cur = await this.item(id)
      const next = cur ? fn(cur) : null
      if (!next) return null
      await writeJson(join(this.dirOf(id), 'item.json'), next)
      return next
    })
  }

  private updateCreator(key: string, fn: (c: Creator) => Creator | null): Promise<Creator | null> {
    return this.locked(key, async () => {
      if (this.removed.has(key)) return null
      const cur = await readJson<Creator>(this.creatorFile(key))
      const next = cur && cur.key === key ? fn(cur) : null
      if (!next) return null
      await writeJson(this.creatorFile(key), next)
      return next
    })
  }

  private async newItem(url: string, platform: Item['platform'], browser: Item['browser'], creatorKey: string | null, medianViews: number | null, now: string): Promise<Item> {
    const item: Item = { id: randomUUID().slice(0, 13), url, platform, addedAt: now, status: 'queued', pct: 0, error: null, errorCode: null, creatorKey, browser, medianViews, saved: { concept: false, template: false, research: null } }
    await fs.mkdir(this.dirOf(item.id), { recursive: true })
    await writeJson(join(this.dirOf(item.id), 'item.json'), item)
    return item
  }

  private async item(id: string): Promise<Item | null> {
    return ID.test(id) ? readJson<Item>(join(this.dirOf(id), 'item.json')) : null
  }

  private async items(): Promise<Item[]> {
    let names: string[] = []
    try {
      names = await fs.readdir(this.reelsDir())
    } catch {
      return []
    }
    const all = await Promise.all(names.filter((n) => ID.test(n) && !this.removed.has(n)).map((n) => this.item(n)))
    return all.filter((i): i is Item => i !== null)
  }

  private async creators(): Promise<Creator[]> {
    let names: string[] = []
    try {
      names = await fs.readdir(this.creatorsDir())
    } catch {
      return []
    }
    const keys = names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5)).filter((k) => CREATOR_KEY.test(k) && !this.removed.has(k))
    const all = await Promise.all(keys.map((k) => readJson<Creator>(this.creatorFile(k))))
    return all.filter((c): c is Creator => c !== null && CREATOR_KEY.test(c.key))
  }

  private async summary(i: Item): Promise<StudyReelSummary> {
    const dir = this.dirOf(i.id)
    const [src, study, m] = await Promise.all([readJson<StudySource>(join(dir, 'source.json')), readJson<ReelStudy>(join(dir, 'study.json')), readJson<StudyMeasure>(join(dir, 'measure.json'))])
    const s = validSource(src) ? src : null
    const poster = validMeasure(m) ? (m.frames.find((f) => f.at >= 1) ?? m.frames[0]) : undefined
    return {
      id: i.id,
      url: i.url,
      platform: i.platform,
      creator: s?.creator ?? '',
      addedAt: i.addedAt,
      status: i.status,
      pct: FINAL.has(i.status) ? 100 : (this.pct.get(i.id) ?? 0),
      error: i.error,
      errorCode: i.errorCode,
      title: s?.title ?? '',
      views: s?.views ?? null,
      vsUsual: s?.views != null && i.medianViews ? Math.round((s.views / i.medianViews) * 10) / 10 : null,
      durationSec: s?.durationSec ?? null,
      poster: poster ? this.d.mediaUrl(join(dir, poster.file)) : null,
      formula: study?.formula?.name || null,
      hook: study?.script?.hook?.text ?? null,
      creatorKey: i.creatorKey
    }
  }

  private async publish(): Promise<StudyList> {
    const list = await this.list()
    this.d.changed(list)
    return list
  }
}
