// Study reels over IPC: paste links, list and open studies, and send a study on to the writer (a concept in
// swipe.md, a beat template) or to Claude Code (a research note).
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { BeatTemplate } from '../shared/beats'
import { BROWSERS, DEFAULT_PER_CREATOR, PLATFORMS, readLine, readPaste, type Platform, type StudyAddOptions, type StudyList } from '../shared/study'
import type { StudyQueue } from './study'
import { renameWithRetry } from './store'
import { conceptBlock, noteName, researchNote, templateFrom, withConcept } from './study-notes'

export interface StudyIpcDeps {
  handle(channel: string, fn: (e: unknown, ...args: any[]) => unknown): void
  queue: StudyQueue
  /** swipe.md beside the voice file, or null when no voice file is set. */
  swipeFile(): Promise<string | null>
  /** video-agent/research beside the voice file, or null. */
  researchDir(): Promise<string | null>
  saveTemplate(t: Omit<BeatTemplate, 'id'>): Promise<void>
  openExternal(url: string): void
}

const NO_VOICE = 'Set your voice file in Scripts first: the concept and notes go in the same folder.'

/** What the renderer sends to "add", made safe. */
export function cleanAddOptions(raw: unknown): StudyAddOptions {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const handles = PLATFORMS.some((p) => p.id === r.handles) ? (r.handles as Platform) : 'tiktok'
  const n = typeof r.perCreator === 'number' && Number.isFinite(r.perCreator) ? r.perCreator : DEFAULT_PER_CREATOR
  const browser = BROWSERS.includes(r.browser as (typeof BROWSERS)[number]) ? (r.browser as StudyAddOptions['browser']) : null
  return { handles, perCreator: n, browser }
}

export function registerStudyIpc(d: StudyIpcDeps): void {
  const { handle, queue } = d
  const detailOrThrow = async (id: string) => {
    const det = await queue.detail(String(id))
    if (!det?.study) throw { code: 'NOT_READY', userMessage: 'This video has not been studied yet.' }
    return det
  }

  handle('study:list', (): Promise<StudyList> => queue.list())
  handle('study:get', (_e, id: string) => queue.detail(String(id)))
  handle('study:add', async (_e, text: unknown, opts: unknown) => {
    const o = cleanAddOptions(opts)
    const wanted = readPaste(typeof text === 'string' ? text.slice(0, 20_000) : '', o.handles).filter((w) => w.kind !== 'unknown')
    if (!wanted.length) throw { code: 'NOTHING', userMessage: 'Paste at least one Instagram, TikTok or YouTube link, or an @handle.' }
    return queue.add(wanted, o)
  })
  handle('study:retry', (_e, id: string) => queue.retry(String(id)))
  handle('study:remove', (_e, id: string) => queue.remove(String(id)))

  handle('study:toConcept', async (_e, id: string) => {
    const det = await detailOrThrow(id)
    const file = await d.swipeFile()
    if (!file) throw { code: 'NO_VOICE', userMessage: NO_VOICE }
    // a swipe.md that's a link (into a notes vault) is written where it points; only a missing file reads as empty,
    // so a file that can't be read right now is never replaced
    const target = await fs.realpath(file).catch((e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? file : Promise.reject(e)))
    const current = await fs.readFile(target, 'utf8').catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return ''
      throw { code: 'SWIPE_UNREADABLE', userMessage: 'Your swipe.md could not be read right now, so it was left as it is. Try again in a moment.' }
    })
    const next = withConcept(current, conceptBlock(det))
    if (next !== current) {
      const temp = `${target}.${randomUUID()}.tmp`
      await fs.writeFile(temp, next)
      await renameWithRetry(temp, target)
    }
    await queue.markSaved(det.id, { concept: true })
    return true
  })

  handle('study:toTemplate', async (_e, id: string) => {
    const det = await detailOrThrow(id)
    await d.saveTemplate(templateFrom(det))
    await queue.markSaved(det.id, { template: true })
    return true
  })

  handle('study:toResearch', async (_e, id: string) => {
    const det = await detailOrThrow(id)
    const dir = await d.researchDir()
    if (!dir) throw { code: 'NO_VOICE', userMessage: NO_VOICE }
    const today = new Date().toISOString().slice(0, 10)
    await fs.mkdir(dir, { recursive: true })
    const path = join(dir, noteName(det, today))
    await fs.writeFile(path, researchNote(det, today))
    await queue.markSaved(det.id, { research: path })
    return path
  })

  // only links this screen understands open in the browser
  handle('study:open', (_e, url: unknown) => {
    const w = typeof url === 'string' ? readLine(url, 'tiktok') : null
    if (!w || w.kind === 'unknown') return false
    d.openExternal(w.url)
    return true
  })
}
