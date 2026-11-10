// The Stories page's IPC: every `stories:*` channel of ReelApi.stories (shared/api.ts, docs/stories-contract.md).
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { StoryProgress } from '../shared/api'
import type { Story, StoryAssets, StoryLine, StoryPalette, StoryTiming, StoryVoiceOption, VoiceModelStatus } from '../shared/story'
import { isVoiceCurrent, sceneTimes, voiceKey } from '../shared/story-logic'
import { writeJson } from './store'
import type { EngineProgress } from './engine'
import {
  AUDIO_DIR, RENDERS_DIR, TIMING_FILE, VOICE_FILE, audioFile, commitRecording, createStory, getStory, imagesOf, listStories, stageRecording,
  loadStoryAssets, readTiming, removeStory, saveStory, storyDir, writeLines
} from './stories'

/** A brand's starting look for a story, and its logo and art folder. */
export interface StoryDefaults {
  /** 'brand' when the brand has a kit, else 'mono'. */
  palette: StoryPalette
  handle: string
  logo: string | null
  artDir: string | null
}

/** The AI's words for a story: lines with their scenes, caption, hashtags (ai.draftStory's result). */
export interface StoryDraft {
  title: string
  lines: StoryLine[]
  caption: string
  hashtags: string[]
}

export interface StoriesDeps {
  handle(channel: string, fn: (e: unknown, ...args: any[]) => unknown): void
  root(): string
  fontsDir(): string | null
  libraryDir(): string
  /** The models folder (paths.ts modelsDir); Kokoro lives in <modelsDir>/kokoro. */
  modelsDir(): string
  /** The brand in use (sidebar switch), or null. */
  activeBrand(): string | null
  defaultsFor(brand: string | null): Promise<StoryDefaults>
  runEngine(command: string, args: string[], onProgress?: (p: EngineProgress) => void, signal?: AbortSignal): Promise<unknown>
  /** A file dialog for their own recording; null when cancelled. */
  chooseFile(): Promise<string | null>
  mediaUrl(path: string, bust?: number): string
  /** The AI writes this story's words for its own brand (main/index.ts). */
  draft(story: Story, topic: string, lines: number): Promise<StoryDraft>
  exportStory(html: string, duration: number, audio: string, outPath: string, onProgress: (pct: number, message: string) => void): Promise<string>
  renderHtml(story: Story, timing: StoryTiming, assets: StoryAssets): string
  progress(p: StoryProgress): void
  reveal(path: string): void
}

const now = (): string => new Date().toISOString()
const DEFAULT_LINES = 12
const MAX_TOPIC = 500
const KOKORO = 'kokoro'

const err = (code: string, userMessage: string): { code: string; userMessage: string } => ({ code, userMessage })
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

export function registerStoriesIpc(d: StoriesDeps): void {
  const busy = new Map<string, string>()
  const modelDir = (): string => join(d.modelsDir(), KOKORO)

  const need = async (id: unknown): Promise<Story> => {
    const s = typeof id === 'string' ? await getStory(d.root(), id) : null
    if (!s) throw err('NOT_FOUND', 'That story is gone. It may have been deleted.')
    return s
  }

  /** One voice or export job per story (key '' = the voice model download). */
  const job = async <T>(key: string, what: string, fn: () => Promise<T>): Promise<T> => {
    const running = busy.get(key)
    if (running) throw err('BUSY', `This story is already ${running}. Wait for it to finish.`)
    busy.set(key, what)
    try {
      return await fn()
    } finally {
      busy.delete(key)
    }
  }

  const report = (id: string, stage: StoryProgress['stage']) => (p: EngineProgress): void =>
    d.progress({ id, stage, pct: Math.max(0, Math.min(100, p.pct)), message: p.message })

  const status = async (): Promise<VoiceModelStatus> => {
    const r = await d.runEngine('story-voice-model', ['--dir', modelDir(), '--check'])
    const o = isRec(r) ? r : {}
    return {
      installed: o.installed === true,
      downloaded: typeof o.downloaded === 'number' ? o.downloaded : 0,
      total: typeof o.total === 'number' ? o.total : 0,
      packageMissing: o.packageMissing === true
    }
  }

  const needTiming = async (dir: string): Promise<StoryTiming> => {
    const t = await readTiming(dir)
    if (!t) throw err('NO_VOICE', 'Make the voice first (or use your own recording): the film is timed to it.')
    return t
  }
  /** Marks the timing with what the voice was made from, so a later change to the lines or the voice shows as stale. */
  const stampVoice = async (dir: string, made: Story): Promise<StoryTiming> => {
    const t = { ...(await needTiming(dir)), voiceKey: voiceKey(made) }
    await writeJson(join(dir, TIMING_FILE), t)
    return t
  }

  d.handle('stories:list', () => listStories(d.root()))
  d.handle('stories:create', async (_e, title: unknown) => {
    const brand = d.activeBrand()
    const def = await d.defaultsFor(brand)
    return createStory(d.root(), { title: typeof title === 'string' ? title : '', brand, palette: def.palette, handle: def.handle, now: now() })
  })
  d.handle('stories:save', (_e, raw: unknown) => saveStory(d.root(), raw, now()))
  d.handle('stories:remove', async (_e, id: unknown) => {
    const s = await need(id)
    if (busy.has(s.id)) throw err('BUSY', `This story is ${busy.get(s.id)}. Wait for it to finish.`)
    await removeStory(d.root(), s.id)
  })

  // Puts the draft's words on the story as it is now (the AI takes up to a minute), keeping voice, palette, handle.
  d.handle('stories:draft', async (_e, id: unknown, topic: unknown, lines: unknown) => {
    const s = await need(id)
    const t = typeof topic === 'string' ? topic.replace(/\s+/g, ' ').trim().slice(0, MAX_TOPIC) : ''
    if (!t) throw err('EMPTY', 'Tell me what the story is about first.')
    const n = typeof lines === 'number' && Number.isFinite(lines) ? Math.round(lines) : DEFAULT_LINES
    const draft = await d.draft(s, t, Math.max(6, Math.min(20, n)))
    const current = await need(s.id)
    return saveStory(d.root(), { ...current, title: draft.title.trim() || current.title, lines: draft.lines, caption: draft.caption, hashtags: draft.hashtags }, now())
  })

  d.handle('stories:assets', async (_e, id: unknown): Promise<StoryAssets> => {
    const s = await need(id)
    const def = await d.defaultsFor(s.brand)
    return loadStoryAssets({ fontsDir: d.fontsDir(), logo: def.logo, artDir: def.artDir, libraryDir: d.libraryDir(), images: imagesOf(s) })
  })
  d.handle('stories:timing', async (_e, id: unknown) => readTiming(storyDir(d.root(), (await need(id)).id)))
  d.handle('stories:audioUrl', async (_e, id: unknown) => {
    const s = await need(id)
    const file = await audioFile(storyDir(d.root(), s.id), s)
    if (!file) return null
    return d.mediaUrl(file, (await stat(file)).mtimeMs)
  })

  d.handle('stories:voiceModel', status)
  d.handle('stories:downloadVoiceModel', () =>
    job('', 'downloading the voice', async () => {
      await mkdir(modelDir(), { recursive: true })
      await d.runEngine('story-voice-model', ['--dir', modelDir()], report('', 'download'))
      return status()
    })
  )
  d.handle('stories:voices', async (): Promise<StoryVoiceOption[]> => {
    const r = await d.runEngine('story-voices', ['--dir', modelDir()])
    const list = isRec(r) && Array.isArray(r.voices) ? r.voices : []
    return list.filter((v): v is StoryVoiceOption => isRec(v) && typeof v.id === 'string' && typeof v.label === 'string').map((v) => ({ id: v.id, label: v.label }))
  })

  d.handle('stories:makeVoice', async (_e, id: unknown) => {
    const s = await need(id)
    if (s.voice.kind !== KOKORO) throw err('NOT_KOKORO', 'This story uses your own recording. Pick a voice first to make one.')
    const voice = s.voice
    return job(s.id, 'making its voice', async () => {
      const dir = storyDir(d.root(), s.id)
      await mkdir(join(dir, AUDIO_DIR), { recursive: true })
      const lines = await writeLines(dir, s.lines)
      await d.runEngine(
        'story-voice',
        ['--dir', modelDir(), '--lines', lines, '--voice', voice.voice, '--speed', String(voice.speed), '--out', join(dir, VOICE_FILE), '--timing', join(dir, TIMING_FILE)],
        report(s.id, 'voice')
      )
      return stampVoice(dir, s)
    })
  })

  d.handle('stories:useRecording', async (_e, id: unknown) => {
    const s = await need(id)
    const file = await d.chooseFile()
    if (!file) return null
    return job(s.id, 'timing your recording', async () => {
      const dir = storyDir(d.root(), s.id)
      // Timed first, swapped in only on success: a recording that cannot be aligned leaves the old voice as it was.
      const staged = await stageRecording(dir, file)
      const next = join(dir, `${TIMING_FILE}.next`)
      try {
        const lines = await writeLines(dir, s.lines)
        await d.runEngine('story-align', ['--audio', staged, '--lines', lines, '--timing', next], report(s.id, 'align'))
        await rename(next, join(dir, TIMING_FILE))
      } catch (e) {
        await rm(staged, { force: true })
        await rm(next, { force: true })
        throw e
      }
      const copied = await commitRecording(dir, staged)
      const current = await need(s.id)
      const saved = await saveStory(d.root(), { ...current, voice: { kind: 'recording', file: basename(copied) } }, now())
      return stampVoice(dir, saved)
    })
  })

  d.handle('stories:export', async (_e, id: unknown) => {
    const s = await need(id)
    return job(s.id, 'being exported', async () => {
      const dir = storyDir(d.root(), s.id)
      const timing = await needTiming(dir)
      // Never a film timed to another voice: the lines, how they are said and the voice must be what it was made from.
      if (!isVoiceCurrent(s, timing)) throw err('VOICE_STALE', 'The lines or the voice changed since the voice was made. Make the voice again first.')
      const audio = await audioFile(dir, s)
      if (!audio) throw err('NO_VOICE', 'The voice file is missing. Make the voice again.')
      const def = await d.defaultsFor(s.brand)
      const assets = await loadStoryAssets({ fontsDir: d.fontsDir(), logo: def.logo, artDir: def.artDir, libraryDir: d.libraryDir(), images: imagesOf(s) })
      const duration = sceneTimes(s, timing).at(-1)?.end ?? timing.duration
      const out = join(dir, RENDERS_DIR, `${s.id}.mp4`)
      await mkdir(join(dir, RENDERS_DIR), { recursive: true })
      const file = await d.exportStory(d.renderHtml(s, timing, assets), duration, audio, out, (pct, message) => d.progress({ id: s.id, stage: 'export', pct, message }))
      const text = [s.caption, s.hashtags.join(' ')].filter(Boolean).join('\n\n')
      const captionFile = join(dir, RENDERS_DIR, 'caption.txt')
      if (text) await writeFile(captionFile, text + '\n', 'utf8')
      else await rm(captionFile, { force: true }) // an emptied caption must not leave the old one
      return { file }
    })
  })

  d.handle('stories:reveal', async (_e, id: unknown) => {
    const dir = storyDir(d.root(), (await need(id)).id)
    const renders = join(dir, RENDERS_DIR)
    d.reveal(await stat(renders).then(() => renders, () => dir))
  })
}
