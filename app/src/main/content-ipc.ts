// The stages around the edit: saved scripts, clips from a long video, other posts from a reel, and publishing.
// Choosing and writing go through the AI; cutting goes through the engine; posting goes through the Postiz program.
import { isLevel, isTheme } from '../shared/life'
import { formatOf, type VideoFormat } from '../shared/formats'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { AdaptedPost, AdaptedPosts, HouseLook } from '../shared/api'
import type { CapcutExport, OpenReelExport, ClipPick, DropResult, MakerTool, PublishRequest, RepurposeResult, SavedScript, ScriptSetup, Storyboard, StoryboardScene } from '../shared/api'
import { buildHowMade } from './how-made'
import { performanceView, type VideoFeatures } from './performance'
import { engineView, healthView, type EngineInputs, type HealthInputs } from './overview-views'
import { MAX_TEMPLATES, cleanDefaultLook, cleanTemplate, withDefaultLook, type DefaultLook, type LookTemplate, BUILT_IN_LOOKS, isBuiltInLook } from '../shared/looks'
import { randomUUID } from 'node:crypto'
import type { ProjectJson } from '../shared/api'
import type { AI, ScriptContext } from './ai-types'
import type { RunEngine } from './engine'
import type { OpenMontage } from './openmontage'
import type { Postiz } from './postiz'
import type { ScriptStore } from './scripts'
import { cleanResult, learn, promptText, swipeSection, withSwipeSection, type Insights, type ResultRow, type VideoResult } from '../shared/results'

export const MAX_CLIPS = 20
const REPURPOSE_FILE = join('work', 'repurpose.json')
const PICKS_FILE = join('work', 'clip-picks.json')
const quiet = (): void => {}

export interface ContentDeps {
  handle(channel: string, fn: (e: unknown, ...args: any[]) => unknown): void
  ai(): AI
  runEngine: RunEngine
  scripts: ScriptStore
  postiz: Postiz
  maker: OpenMontage
  addToLibrary(files: string[]): Promise<DropResult[]>
  /** The voice file text and the format, as the generator should read them. */
  scriptContext(): Promise<ScriptContext>
  scriptSetup(): Promise<ScriptSetup>
  chooseVoice(): Promise<ScriptSetup | null>
  setFormat(format: string): Promise<ScriptSetup>
  setVideoFormat(format: VideoFormat): Promise<ScriptSetup>
  setBeatTemplate(id: string): Promise<ScriptSetup>
  saveBeatTemplate(raw: unknown): Promise<ScriptSetup>
  removeBeatTemplate(id: string): Promise<ScriptSetup>
  /** The edit as a clean video and captions.srt, in a new folder. Runs as a job on the project. */
  capcut(slug: string): Promise<CapcutExport>
  /** The edit for OpenReel Video, in a new folder. Runs as a job on the project. */
  openreel(slug: string): Promise<OpenReelExport>
  /** Shows a file or folder in Finder or Explorer. */
  reveal(path: string): void
  /** A URL the page can load for a file inside the Matcha Momentum Generator root. */
  mediaUrl(path: string): string
  /** Whether a job is working on this project now. */
  isBusy(slug: string): boolean
  storyboardFirst(): Promise<boolean>
  setStoryboardFirst(on: boolean): Promise<void>
  motionCards(): Promise<boolean>
  theme(): Promise<string>
  setTheme(theme: string): Promise<void>
  setMotionCards(on: boolean): Promise<void>
  defaultLook(): Promise<DefaultLook>
  setDefaultLook(look: DefaultLook): Promise<void>
  projectSlugs(): Promise<string[]>
  lookTemplates(): Promise<LookTemplate[]>
  setLookTemplates(templates: LookTemplate[]): Promise<void>
  readProjectJson(slug: string): Promise<ProjectJson>
  writeProjectJson(slug: string, p: ProjectJson): Promise<void>
  dirOf(slug: string): string
  /** what the Content engine screen reads (main/overview-views.ts) */
  engineInputs(): Promise<EngineInputs>
  /** what the System health screen checks */
  healthInputs(): HealthInputs
  projectsRoot(): string
  /** Marks a new project as being worked on. */
  markWorking(slug: string, title: string): Promise<void>
  /** Starts the normal edit of a project and settles when it ends. */
  edit(slug: string): Promise<void>
  /** The full-quality file of the newest version. */
  latestVideo(slug: string): Promise<string>
  title(slug: string): Promise<string>
  log(line: string): void
  /** How a posted video did (app state), and saving it. */
  readResult(slug: string): Promise<VideoResult>
  writeResult(slug: string, result: VideoResult): Promise<void>
  /** The first words heard in a video, for videos not made from a saved script. */
  firstWords(slug: string): Promise<string>
  /** swipe.md next to the person's voice file, or null when no voice file is set. */
  swipeFile(): Promise<string | null>
}

const FIRST_WORDS = 14

/** Every video with a result, as the learning reads it. A video that can't be read is left out. */
/** What a video was made with, for What's performing: its edit style, its animated cards, its length. */
async function videoFeatures(dir: string): Promise<VideoFeatures> {
  const read = (rel: string) => fs.readFile(join(dir, rel), 'utf8').then((t) => JSON.parse(t) as Record<string, any>).catch(() => null)
  const p = (await read('project.json')) ?? {}
  const versions = await fs.readdir(join(dir, 'versions')).catch(() => [] as string[])
  const newest = versions.map((v) => /^v(\d+)$/.exec(v)?.[1]).filter(Boolean).map(Number).sort((a, b) => b - a)[0]
  const render = newest ? await read(join('versions', `v${newest}`, 'render.json')) : null
  return {
    editStyle: typeof p.look?.editStyle === 'string' ? p.look.editStyle : null,
    cards: (Array.isArray(p.broll) ? p.broll : []).filter((b: any) => b?.treatment === 'animation').length,
    seconds: typeof render?.duration === 'number' ? render.duration : null
  }
}

export async function resultRows(deps: ContentDeps): Promise<ResultRow[]> {
  const rows = await Promise.all(
    (await deps.projectSlugs()).map(async (slug): Promise<ResultRow | null> => {
      try {
        const result = await deps.readResult(slug)
        if (result.views === null && result.rating === null) return null
        const p = await deps.readProjectJson(slug)
        const script = p.script as { hook?: string; hookFormula?: string } | undefined
        const hook = script?.hook?.trim() || (await deps.firstWords(slug)).split(/\s+/).slice(0, FIRST_WORDS).join(' ')
        return { slug, title: p.title ?? slug, hook, formula: script?.hookFormula?.trim() ?? '', result }
      } catch {
        return null
      }
    })
  )
  return rows.filter((r): r is ResultRow => r !== null)
}

/** The "My outliers" block in swipe.md, so /studio-script learns too. Best effort: never fails a save. */
async function refreshSwipe(deps: ContentDeps, insights: Insights): Promise<void> {
  if (!insights.enough) return
  try {
    const file = await deps.swipeFile()
    if (!file) return
    const current = await fs.readFile(file, 'utf8').catch(() => '')
    const temp = `${file}.${randomUUID()}.tmp`
    await fs.writeFile(temp, withSwipeSection(current, swipeSection(insights)))
    await fs.rename(temp, file)
  } catch (e) {
    deps.log(`[results] swipe.md not updated: ${String((e as Error)?.message ?? e)}`)
  }
}

const noAi = (): { code: string; userMessage: string } => ({
  code: 'NO_AI',
  userMessage: 'Connect Claude or ChatGPT in Settings first.'
})

export function validPicks(picks: unknown): ClipPick[] {
  const list = Array.isArray(picks) ? picks : []
  const ok = list.filter((p: ClipPick) => Number.isFinite(p?.start) && Number.isFinite(p?.end) && p.start >= 0 && p.end > p.start)
  if (!ok.length || ok.length !== list.length || list.length > MAX_CLIPS) {
    throw { code: 'BAD_PICKS', userMessage: `Pick between 1 and ${MAX_CLIPS} clips.` }
  }
  return ok
}

async function readRepurpose(file: string): Promise<RepurposeResult | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as RepurposeResult
  } catch {
    return null
  }
}

export async function makeClips(deps: ContentDeps, slug: string, picks: unknown): Promise<{ slugs: string[] }> {
  const dir = deps.dirOf(slug)
  const chosen = validPicks(picks)
  const segments = join(dir, PICKS_FILE)
  await fs.writeFile(segments, JSON.stringify({ segments: chosen.map(({ start, end, title }) => ({ start, end, title })) }))
  const made = (await deps.runEngine('clip', ['--project', dir, '--segments', segments, '--out-root', deps.projectsRoot()])) as {
    clips: { project: string; title: string }[]
  }
  const clips = made.clips.map((c) => ({ slug: basename(c.project), title: c.title }))
  await Promise.all(clips.map((c) => deps.markWorking(c.slug, c.title)))
  // One at a time: each edit listens to its video, which uses the whole machine.
  void clips.reduce(
    (prev, c) => prev.then(() => deps.edit(c.slug)).catch((e) => deps.log(`[clips] ${c.slug}: ${String(e?.userMessage ?? e)}`)),
    Promise.resolve()
  )
  return { slugs: clips.map((c) => c.slug) }
}

export interface MakeInput {
  tool: string
  prompt: string
  agreedCostUsd: number | null
}

/** What the person agreed to, in the bridge's terms. The tool's price is looked up here, not taken from the page. */
export function costApproval(tool: MakerTool, agreed: unknown): { maxCostUsd: number; acceptUnknownCost: boolean } {
  if (tool.costUsd === null) {
    if (agreed !== null) throw { code: 'NEEDS_OK', userMessage: 'This one does not say what it costs. Agree to that first.' }
    return { maxCostUsd: 0, acceptUnknownCost: true }
  }
  if (tool.costUsd > 0 && agreed !== tool.costUsd) {
    throw { code: 'NEEDS_OK', userMessage: `This costs about $${tool.costUsd.toFixed(2)}. Agree to that first.` }
  }
  return { maxCostUsd: tool.costUsd, acceptUnknownCost: false }
}

export async function makeMedia(deps: ContentDeps, input: MakeInput): Promise<DropResult[]> {
  const tool = (await deps.maker.tools()).find((t) => t.name === input?.tool)
  if (!tool) throw { code: 'BAD_TOOL', userMessage: 'That generator is not available.' }
  const approval = costApproval(tool, input.agreedCostUsd)
  const folder = await fs.mkdtemp(join(tmpdir(), 'matcha-momentum-generator-make-'))
  try {
    const outputPath = join(folder, `generated.${tool.capability === 'video_generation' ? 'mp4' : 'png'}`)
    const made = await deps.maker.make({ tool: tool.name, prompt: String(input.prompt ?? ''), outputPath, ...approval })
    return await deps.addToLibrary([made])
  } finally {
    await fs.rm(folder, { recursive: true, force: true })
  }
}

/** Runs `fn` unless the same key is already running. */
function createGuard(message: string) {
  const running = new Set<string>()
  return async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (running.has(key)) throw { code: 'BUSY', userMessage: message }
    running.add(key)
    try {
      return await fn()
    } finally {
      running.delete(key)
    }
  }
}

/** The adapted posts, by Postiz channel kind, only while they still match the caption being sent. */
export function adaptedFor(caption: string, adapted: AdaptedPosts | undefined): Record<string, { caption: string; title?: string }> {
  if (!adapted || adapted.from.trim() !== String(caption ?? '').trim()) return {}
  const text = (a: AdaptedPost) => [a.caption, a.hashtags.join(' ')].filter(Boolean).join('\n\n')
  return Object.fromEntries(
    (['tiktok', 'youtube'] as const).flatMap((k) => {
      const a = adapted[k]
      return a ? [[k, { caption: text(a), ...(a.title ? { title: a.title } : {}) }]] : []
    })
  )
}

export function registerContentIpc(deps: ContentDeps): void {
  const { handle, scripts, postiz, maker } = deps
  const oneClipRun = createGuard('I am already cutting clips from this video.')
  const onePost = createGuard('I am already posting this video.')

  // What their own posted videos say, for the script writer and the idea finder ('' until there is enough).
  const learned = async (): Promise<{ results: string }> => ({ results: promptText(learn(await resultRows(deps))) })

  handle('script:write', async (_e, idea: string): Promise<SavedScript> => {
    if (!String(idea ?? '').trim()) throw { code: 'EMPTY', userMessage: 'Tell me your idea in a sentence or two first.' }
    const written = await deps.ai().writeScript(String(idea), quiet, undefined, { ...(await deps.scriptContext()), ...(await learned()) })
    return scripts.save(written)
  })

  handle('results:get', (_e, slug: string) => deps.readResult(String(slug)))
  handle('results:set', async (_e, slug: string, raw: unknown) => {
    const result = cleanResult(raw)
    await deps.writeResult(String(slug), result)
    await refreshSwipe(deps, learn(await resultRows(deps)))
    return result
  })
  handle('results:insights', async () => learn(await resultRows(deps)))
  handle('script:list', () => scripts.list())
  handle('script:remove', (_e, id: string) => scripts.remove(String(id)))
  handle('script:update', (_e, id: string, patch: { hook?: unknown; script?: unknown; theme?: unknown; level?: unknown }) =>
    scripts.update(String(id), {
      ...(typeof patch?.hook === 'string' ? { hook: patch.hook } : {}),
      ...(typeof patch?.script === 'string' ? { script: patch.script } : {}),
      ...(isTheme(patch?.theme) ? { theme: patch.theme } : {}),
      ...(isLevel(patch?.level) ? { level: patch.level } : {})
    })
  )
  handle('script:ideas', async () => {
    const ai = deps.ai()
    if (!ai.suggestIdeas) throw noAi()
    const avoid = (await scripts.list()).map((s) => s.hook)
    return ai.suggestIdeas(quiet, undefined, { ...(await deps.scriptContext()), ...(await learned()), avoid })
  })
  handle('script:setup', () => deps.scriptSetup())
  handle('script:chooseVoice', () => deps.chooseVoice())
  handle('script:setFormat', (_e, format: unknown) => deps.setFormat(typeof format === 'string' ? format : ''))
  handle('script:setVideoFormat', (_e, format: unknown) => deps.setVideoFormat(formatOf(format)))
  handle('script:setBeatTemplate', (_e, id: unknown) => deps.setBeatTemplate(String(id ?? '')))
  handle('script:saveBeatTemplate', (_e, raw: unknown) => deps.saveBeatTemplate(raw))
  handle('script:removeBeatTemplate', (_e, id: unknown) => deps.removeBeatTemplate(String(id ?? '')))

  handle('clips:pick', (_e, slug: string) => {
    const ai = deps.ai()
    if (!ai.pickClips) throw noAi()
    return ai.pickClips(deps.dirOf(slug), quiet)
  })
  handle('clips:make', (_e, slug: string, picks: unknown) => oneClipRun(String(slug), () => makeClips(deps, slug, picks)))

  handle('repurpose:load', (_e, slug: string) => readRepurpose(join(deps.dirOf(slug), REPURPOSE_FILE)))
  handle('repurpose:make', async (_e, slug: string) => {
    const ai = deps.ai()
    if (!ai.repurpose) throw noAi()
    const dir = deps.dirOf(slug)
    const result = await ai.repurpose(dir, quiet)
    await fs.writeFile(join(dir, REPURPOSE_FILE), JSON.stringify(result, null, 2))
    return result
  })

  handle('post:adapt', async (_e, slug: string) => {
    const ai = deps.ai()
    if (!ai.adaptPost) throw noAi()
    await ai.adaptPost(deps.dirOf(String(slug)), quiet)
    const p = (await deps.readProjectJson(String(slug))) as { post?: { adapted?: unknown } }
    return p.post?.adapted ?? null
  })

  handle('maker:tools', async () => ({ installed: maker.installed(), tools: await maker.tools() }))
  handle('maker:make', (_e, input: MakeInput) => makeMedia(deps, input))

  handle('storyboard:get', async (_e, slug: string): Promise<Storyboard> => {
    const dir = deps.dirOf(slug)
    if (deps.isBusy(slug)) throw { code: 'BUSY', userMessage: 'I am still working on this video. The storyboard comes when it is done.' }
    const r = (await deps.runEngine('storyboard', ['--project', dir])) as { scenes: (StoryboardScene & { still: string | null })[] }
    return { scenes: r.scenes.map((s) => ({ ...s, still: s.still ? deps.mediaUrl(join(dir, s.still)) : null })) }
  })
  handle('look:default', () => deps.defaultLook())
  handle('look:setDefault', async (_e, raw: unknown) => {
    const look = cleanDefaultLook(raw)
    await deps.setDefaultLook(look)
    return look
  })
  // Every video takes the default look at its next version. A video being worked on is left alone and named.
  handle('look:applyAll', async () => {
    const look = await deps.defaultLook()
    const skipped: string[] = []
    let updated = 0
    for (const slug of await deps.projectSlugs()) {
      if (deps.isBusy(slug)) {
        skipped.push(slug)
        continue
      }
      await deps.writeProjectJson(slug, withDefaultLook(await deps.readProjectJson(slug), look))
      updated++
    }
    return { updated, skipped }
  })
  // Named looks. A name is unique (any case): saving one that exists replaces it.
  // The person's own named looks (built-in ones are listed by allTemplates, never saved).
  const templates = async (): Promise<LookTemplate[]> =>
    (await deps.lookTemplates()).map(cleanTemplate).filter((t): t is LookTemplate => t !== null && !isBuiltInLook(t.id))
  const allTemplates = async (): Promise<LookTemplate[]> => [...BUILT_IN_LOOKS, ...(await templates())]
  // The house look: written by the engine (autocolor.set_house_look), read here only for its name.
  const houseFile = (): string => join(dirname(deps.projectsRoot()), 'Library', 'house-look.json')
  const house = async (): Promise<HouseLook | null> => {
    try {
      const data = JSON.parse(await fs.readFile(houseFile(), 'utf8')) as { stats?: unknown; from?: { project?: unknown } }
      if (typeof data.stats !== 'object' || data.stats === null) return null
      return { from: typeof data.from?.project === 'string' ? data.from.project : 'a video' }
    } catch {
      return null
    }
  }
  handle('look:house', () => house())
  handle('look:setHouse', async (_e, slug: string) => {
    if (deps.isBusy(String(slug))) throw { code: 'BUSY', userMessage: 'I am still working on this video. Give me a moment.' }
    await deps.runEngine('house-look', ['--project', deps.dirOf(String(slug)), '--root', dirname(deps.projectsRoot())])
    return (await house()) ?? { from: 'this video' }
  })
  handle('look:clearHouse', async () => {
    await fs.rm(houseFile(), { force: true })
  })
  handle('look:templates', () => allTemplates())
  handle('look:saveTemplate', async (_e, raw: { name?: unknown; look?: unknown }) => {
    const all = await templates()
    const name = typeof raw?.name === 'string' ? raw.name.trim().toLowerCase() : ''
    if (BUILT_IN_LOOKS.some((t) => t.name.toLowerCase() === name)) {
      throw { code: 'BUILT_IN', userMessage: `"${raw.name}" is a look that comes with the app. Save yours under another name.` }
    }
    const same = all.find((t) => t.name.toLowerCase() === name)
    const t = cleanTemplate({ id: same?.id ?? randomUUID(), name: raw?.name, look: raw?.look })
    if (!t) throw { code: 'BAD_TEMPLATE', userMessage: 'Give the template a name first.' }
    if (!same && all.length >= MAX_TEMPLATES) {
      throw { code: 'TOO_MANY', userMessage: `You have ${MAX_TEMPLATES} templates. Delete one to save another.` }
    }
    await deps.setLookTemplates(same ? all.map((x) => (x.id === same.id ? t : x)) : [...all, t])
    return t
  })
  handle('look:removeTemplate', async (_e, id: unknown) => {
    if (isBuiltInLook(id)) throw { code: 'BUILT_IN', userMessage: 'This look comes with the app, so it stays.' }
    await deps.setLookTemplates((await templates()).filter((t) => t.id !== id))
  })
  handle('look:useTemplate', async (_e, id: unknown) => {
    const t = (await allTemplates()).find((x) => x.id === id)
    if (!t) throw { code: 'NOT_FOUND', userMessage: 'That template is gone.' }
    await deps.setDefaultLook(t.look)
    return t.look
  })
  handle('storyboard:enabled', () => deps.storyboardFirst())
  handle('storyboard:setEnabled', async (_e, on: unknown) => {
    await deps.setStoryboardFirst(on === true)
    return on === true
  })
  // How it was made: one video's edit on its own timeline (main/how-made.ts), read only
  // The screens that make the background visible (shared/overview.ts)
  handle('overview:performance', async () => {
    const rows = await resultRows(deps)
    const features = new Map<string, VideoFeatures>()
    for (const r of rows) features.set(r.slug, await videoFeatures(deps.dirOf(r.slug)))
    return performanceView(learn(rows), features)
  })
  handle('overview:engine', async () => engineView(await deps.engineInputs()))
  handle('overview:health', () => healthView(deps.healthInputs()))
  handle('howMade:get', (_e, slug: string) => buildHowMade(deps.dirOf(String(slug))))
  handle('theme:get', () => deps.theme())
  handle('theme:set', async (_e, t: unknown) => {
    const theme = t === 'light' || t === 'system' ? t : 'dark'
    await deps.setTheme(theme)
    return theme
  })
  handle('motion:enabled', () => deps.motionCards())
  handle('motion:setEnabled', async (_e, on: unknown) => {
    await deps.setMotionCards(on === true)
    return on === true
  })

  handle('projects:capcut', async (_e, slug: string) => {
    const out = await deps.capcut(String(slug))
    deps.reveal(out.folder)
    return out
  })
  handle('projects:openreel', async (_e, slug: string) => {
    const out = await deps.openreel(String(slug))
    deps.reveal(out.folder)
    return out
  })

  handle('publish:status', () => postiz.status())
  handle('publish:send', (_e, slug: string, req: PublishRequest) =>
    onePost(String(slug), async () => {
      const video = await deps.latestVideo(slug)
      // TikTok and YouTube get their own version of the post when it was adapted from this caption.
      const p = (await deps.readProjectJson(String(slug))) as { post?: { adapted?: AdaptedPosts } }
      return postiz.send({ ...req, video, title: await deps.title(slug), adapted: adaptedFor(req.caption, p.post?.adapted) })
    })
  )
}
