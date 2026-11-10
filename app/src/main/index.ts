import { DEFAULT_BEAT_TEMPLATE, MAX_BEAT_TEMPLATES, activeTemplate, allTemplates, cleanTemplate, type BeatTemplate } from '../shared/beats'
import { formatOf, frameFor } from '../shared/formats'
import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, net, safeStorage, shell, type IpcMainInvokeEvent, session } from 'electron'
import { existsSync, promises as fs, appendFileSync, mkdirSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  binDir,
  engineDir,
  engineEnv,
  engineMode,
  initPaths,
  projectsDir,
  pythonExe,
  reelStudioRoot,
  templatesDir,
  libraryDir,
  modelsDir,
  setRootOverride,
  settingsDir,
  legacyUserData
} from './paths'
import { createEngineRunner, killAllEngines, toUserError, type RunEngine } from './engine'
import { logDuration } from './diagnostics'
import { handleMediaProtocol, registerMediaScheme } from './media'
import {
  addChat,
  detail,
  ensureRoot,
  listProjects,
  listVersions,
  projectDir,
  readAppState,
  readProject,
  readWords,
  recoverInterrupted,
  titleFromFile,
  uniqueSlug,
  updateAppState,
  writeJson,
  writeProject
} from './store'
import { addToLibrary, isVideo, listLibrary, uniqueDest } from './library'
import { createJobManager } from './jobs'
import { createLiveVideos } from './live-video'
import { rememberQuestion, styleConsent } from './style-consent'
import type { AgentResult } from './ai-types'
import { loadAI } from './ai'
import type { AI, EngineHost } from './ai-types'
import { closeAnimationRenderer, renderAnimation, TEST_TEMPLATE } from './animation'
import { captureWebsite } from './capture'
import { createModelManager } from './models'
import { loadSettings, saveSettings, type Settings, isTheme } from './settings'
import { homedir } from 'node:os'
import { installedSkillFolders } from './overview-views'
import { carouselDefaults, editBrief, lookByName, styleFileName, type CarouselDefaults, type EditBrief } from '../shared/brand-use'
import { createPidRegistry } from './orphans'
import { openSignInWindow, publicInfo } from './claude-signin'
import { createVendorConnect, type CliStatus, type VendorConnect } from './vendor-connect'
import { runInstall, runLogin, testVendorEnv, testVendorLoginEnv, type Vendor } from './vendor-setup'
import { withUserPathKept } from './user-path'
import { aiChoiceSaved, carryOverDecision } from './ai-carryover'
import type { AppInfo, CapcutExport, DropResult, ExportResult, JobEvent, OpenReelExport, ProjectJson, ScriptSetup } from '../shared/api'
import { noAiReply } from '../shared/notes'
import { versionMessage } from '../shared/describe'
import { mergeSourcesPatch } from '../shared/mirror'
import { displayPath } from '../shared/display-path'
import { registerPhoneIpc, stopPhoneShare } from './phone-ipc'
import { checkNoteAttachments, forChat, pickClipboardType, registerAttachmentIpc } from './attachments'
import { registerContentIpc } from './content-ipc'
import { registerBrandsIpc } from './brands-ipc'
import { registerCarouselsIpc } from './carousels-ipc'
import { registerStoriesIpc } from './stories-ipc'
import { StudyQueue } from './study'
import { PAGE_PERMISSIONS, mayOpenLink, mayReveal, mayUseAsRoot } from './guards'
import { registerStudyIpc } from './study-ipc'
import { exportStory } from './story-export'
import { storyHtml } from '../shared/story-render'
import { exportCarousel } from './carousel-export'
import { parseBrandProfile } from '../shared/brand-profile'
import { activeBrand, brandForVoiceFile, defaultBrandsDir, writerFilesFor, type ActiveBrand, type WriterFiles } from './brands'
import { createOpenMontage } from './openmontage'
import { mediaUrl } from './media-url'
import { cleanDefaultLook, cleanVideoLook, withDefaultLook, BUILT_IN_LOOKS } from '../shared/looks'
import { MAX_RULE_LENGTH, cleanRuleInput } from '../shared/style'
import { cleanBounds, createStudio, openReelExports } from './studio'
import { cleanResult } from '../shared/results'
import { createPostiz } from './postiz'
import { scriptStoreFor, type ScriptStore } from './scripts'
import { createUpdateService } from './update-check'
import { UPDATE_CHECK_ON } from '../shared/config'
import { createJobFeedback, createMainWindow, feedbackLog, installMenu, startDragOut, SURFACES, titleBarOverlay, windowStateFile, type AppCommand, type Surface } from './window'

const TEST = process.env.REELSTUDIO_TEST === '1'
/** Tests run with the window never shown and no Dock icon, so they never take over the screen of someone working
 * (helpers.ts sets it; REELSTUDIO_E2E_SHOW=1 there shows the window to watch a run). */
const HIDDEN = TEST && process.env.REELSTUDIO_HIDDEN === '1'
if (HIDDEN) app.dock?.hide()
const DEV_PROVIDERS = process.env.REELSTUDIO_DEV === '1'
if (process.env.REELSTUDIO_USER_DATA) app.setPath('userData', process.env.REELSTUDIO_USER_DATA)
else {
  // settings made by Matcha Momentum Generator, before the rename to Matcha Momentum Generator, stay where they are (paths.ts)
  const before = legacyUserData(app.getPath('appData'))
  if (before) app.setPath('userData', before)
}
// Tests that save a key (safeStorage) must not write to the login keychain of the Mac they run on.
if (TEST && process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain')

registerMediaScheme()

initPaths({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  documentsDir: app.getPath('documents'),
  userDataDir: app.getPath('userData'),
  appDir: app.getAppPath()
})

// ---- logging ------------------------------------------------------------------------------------
const logFile = (): string => join(settingsDir(), 'logs', 'main.log')
function log(line: string): void {
  const s = `${new Date().toISOString()} ${line}`
  if (!app.isPackaged) console.log(s)
  try {
    mkdirSync(dirname(logFile()), { recursive: true })
    appendFileSync(logFile(), s + '\n')
  } catch {
    /* logging must never break the app */
  }
}

app.on('render-process-gone', (_event, contents, details) => {
  log(`[render-process-gone] type=Renderer webContentsId=${contents.id} reason=${details.reason} exitCode=${details.exitCode}`)
})
app.on('child-process-gone', (_event, details) => {
  log(`[child-process-gone] type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`)
})
app.on('browser-window-created', (_event, window) => {
  window.on('unresponsive', () => log(`[unresponsive] type=Renderer windowId=${window.id}`))
  window.on('responsive', () => log(`[responsive] type=Renderer windowId=${window.id}`))
})

function showOpenDialog(options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  return logDuration(`[dialog] ${options.title ?? 'Open folder'}`, log, async () => {
    const result = await dialog.showOpenDialog(win!, options)
    log(`[dialog] returned canceled=${result.canceled} selectedCount=${result.filePaths.length}`)
    return result
  })
}

// ---- engine, AI, jobs ----------------------------------------------------------------------------
let pidRegistry: ReturnType<typeof createPidRegistry> | null = null
const runEngine: RunEngine = createEngineRunner({
  python: pythonExe,
  env: engineEnv,
  cwd: engineDir,
  log,
  onSpawn: (pid) => pidRegistry?.add(pid),
  onExit: (pid) => pidRegistry?.remove(pid)
})

const host: EngineHost = {
  runEngine,
  renderAnimation: (template, params, outPath) => renderAnimation(template, params, outPath),
  captureWebsite: (url, outPath, opts) => captureWebsite(url, outPath, opts),
  reelStudioRoot
}

let ai: AI
let studyQueue: StudyQueue | null = null
/** The folder last picked in "Change where videos are kept": the only one setRoot accepts. */
let pickedFolder: string | null = null
/** How much of the voice file a study reads, to write its "try this" for them. */
const STUDY_ABOUT_LIMIT = 2_000
let aiSource: 'package' | 'mock' = 'mock'
let vendors: VendorConnect

// The environment the person's own Claude Code / Codex apps get. Normally the app's own; the test switch
// REELSTUDIO_TEST_VENDOR_HOME swaps in a throwaway home (a fresh machine) so a real install + sign-in can be tried
// without touching the apps already on this computer (vendor-setup.ts testVendorEnv).
const TEST_VENDOR_ENV = testVendorEnv(process.env, process.platform)
const cliBaseEnv = (): NodeJS.ProcessEnv => TEST_VENDOR_ENV ?? process.env
const TEST_LOGIN_ENV = testVendorLoginEnv(process.env, process.platform)
let win: BrowserWindow | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

// The window, menu, Dock/taskbar and notifications (window.ts) hear about every job too.
const sendCommand = (c: AppCommand): void => broadcast('app:command', c)
const feedback = createJobFeedback({
  window: () => win,
  title: async (slug) => (await readProject(slug).catch(() => null))?.title || slug,
  send: sendCommand,
  test: TEST
})
if (TEST) (globalThis as { __reelFeedback?: unknown }).__reelFeedback = feedbackLog
// Honest progress (main/progress.ts): phase times measured on this computer, per minute of video.
const speedHistoryFile = (): string => join(settingsDir(), 'speed-history.json')
const jobs = createJobManager(
  (e: JobEvent) => {
    broadcast('job:event', e)
    feedback.onJobEvent(e)
  },
  log,
  {
    loadHistory: async () => JSON.parse(await fs.readFile(speedHistoryFile(), 'utf8')),
    saveHistory: (h) => writeJson(speedHistoryFile(), h),
    mediaSeconds: async (slug) =>
      ((await readProject(slug)).sources ?? []).reduce((a: number, s: { duration?: number }) => a + (Number(s?.duration) || 0), 0)
  },
  // render events carry a playable URL (a stable copy for drafts: main/live-video.ts)
  ((live) => (slug: string, e) => live(projectDir(slug), e))(createLiveVideos())
)
const models = createModelManager(runEngine, (s) => broadcast('model:progress', s))
// "Update available" notice (main/update-check.ts): one anonymous GET a day, never in test runs.
const updates = createUpdateService({
  active: !TEST,
  version: app.getVersion(),
  load: loadSettings,
  save: saveSettings,
  fetch: (url, init) => fetch(url, init), // Node's fetch: no Electron session, so no cookies
  now: () => Date.now(),
  log,
  openExternal: (url) => shell.openExternal(url),
  send: (n) => broadcast('update:change', n)
})

// ---- helpers ------------------------------------------------------------------------------------
type Handler = (e: IpcMainInvokeEvent, ...args: any[]) => unknown

/** Every IPC call returns {ok, value} or {ok:false, error:{code,userMessage}} so errors stay friendly. */
function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (e, ...args) => {
    try {
      return { ok: true, value: await fn(e, ...args) }
    } catch (err) {
      const u = toUserError(err)
      log(`[ipc ${channel}] ${u.code}: ${u.message ?? u.userMessage}`)
      const link = (err as { link?: unknown })?.link
      return { ok: false, error: { code: u.code, userMessage: u.userMessage, ...(typeof link === 'string' ? { link } : {}) } }
    }
  })
}

async function appInfo(): Promise<AppInfo> {
  const s = await loadSettings()
  // The real long path, never an 8.3 short name like USERNA~1 (design critique 1.9).
  let root = reelStudioRoot()
  try {
    root = realpathSync.native(root)
  } catch {
    /* not created yet: show it as configured */
  }
  return {
    version: app.getVersion(),
    platform: process.platform,
    root,
    rootDisplay: displayPath(
      root,
      { documents: app.getPath('documents'), desktop: app.getPath('desktop'), home: app.getPath('home') },
      process.platform
    ),
    firstRunDone: s.firstRunDone,
    engine: { mode: engineMode(), dir: engineDir(), python: pythonExe() },
    ai: aiSource,
    test: TEST,
    dev: DEV_PROVIDERS
  }
}

const scriptStore = (): ScriptStore => scriptStoreFor(join(reelStudioRoot(), 'scripts.json'))
// What the script generator reads, capped so one huge file cannot crowd out the prompt.
const VOICE_LIMIT = 20_000
const FORMAT_LIMIT = 4_000

const SWIPE_LIMIT = 40_000
/** rankings.md beside the voice file: what has traction online (hooks, templates, concepts, motion cards), ranked. */
const RANKING_LIMIT = 12_000

/** swipe.md next to the voice file ('' when there is none): its Concepts section is the niche research. */
async function readSwipe(voiceFile: string | null): Promise<string> {
  return readBeside(voiceFile, 'swipe.md', SWIPE_LIMIT)
}

// framework.md (how every reel is built) and brand.md (what they stand for), beside the voice file, capped
const FRAMEWORK_LIMIT = 16_000
const BRAND_LIMIT = 12_000
async function readBeside(voiceFile: string | null, name: string, limit: number): Promise<string> {
  if (!voiceFile) return ''
  return (await fs.readFile(join(dirname(voiceFile), name), 'utf8').catch(() => '')).slice(0, limit)
}

// ---- The active brand (Brands tab, sidebar switch): the files the writer reads, the look, the My style file ----
let activeBrandId: string | null = null
/** Tests never see the person's real brand files: without REELFORGE_BRANDS they get a folder in the test root. */
const brandsDir = (): string => (TEST && !process.env.REELFORGE_BRANDS ? join(reelStudioRoot(), 'brands') : defaultBrandsDir())
const currentBrand = (): Promise<ActiveBrand | null> =>
  activeBrandId ? activeBrand(brandsDir(), activeBrandId, homedir()) : Promise.resolve(null)
const readCapped = async (path: string | null, limit: number): Promise<string> =>
  path ? (await fs.readFile(path, 'utf8').catch(() => '')).slice(0, limit) : ''
/** What the script writer reads for the active brand, or the voice file and what is beside it (main/brands.ts). */
const writerFilesNow = async (s: Settings): Promise<WriterFiles> => writerFilesFor(activeBrandId, await currentBrand(), s.voiceFile)

/**
 * What the carousel and story writers read for a piece made for `brandId`: that brand's voice, profile, framework and
 * its own My style rules, whatever brand is in use now. A brand whose file is gone is refused, never guessed.
 */
async function writerContextFor(brandId: string | null, what: 'carousel' | 'story') {
  const brand = brandId ? await activeBrand(brandsDir(), brandId, homedir()) : null
  if (brandId && !brand) throw { code: 'BRAND_GONE', userMessage: `This ${what}’s brand file is gone, so I don’t know whose voice to write in. Check the Brands tab.` }
  const files = await writerFilesFor(brandId, brand, (await loadSettings()).voiceFile)
  return {
    voice: await readCapped(files.voiceFile, VOICE_LIMIT),
    brand: files.brand,
    framework: files.framework,
    speaker: files.speaker,
    styleRules: await rulesText(join(reelStudioRoot(), styleFileName(brandId)))
  }
}

/** A My style file's rules as the prompt lists them ("- rule" lines), or '' when it has none. */
async function rulesText(file: string): Promise<string> {
  const j = (await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null)) as { rules?: { text?: unknown }[] } | null
  return (j?.rules ?? []).flatMap((r) => (typeof r?.text === 'string' && r.text.trim() ? [`- ${r.text.trim()}`] : [])).join('\n')
}

/**
 * What the first edit is told: whether motion cards are on, and the person's sign-off and ask, from the brand in use,
 * else from the brand whose profile names the voice file (the switch may be unpicked while that brand is plainly theirs).
 */
async function editBriefNow(): Promise<EditBrief> {
  const s = await loadSettings()
  const brand = (await currentBrand()) ?? (await brandForVoiceFile(brandsDir(), s.voiceFile, homedir()))
  return { ...(brand ? editBrief(parseBrandProfile(brand.profileText)) : {}), motionCards: s.motionCards !== false }
}

/** The theme the window shows now: the saved choice, or the system's when it is "system". */
async function surfaceNow(): Promise<Surface> {
  const t = (await loadSettings()).theme
  return t === 'light' ? 'light' : t === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : 'dark'
}

/** The parts the OS draws (the window's background, the Windows title-bar strip) in the theme's colours. */
async function paintWindowChrome(): Promise<void> {
  if (!win || win.isDestroyed()) return
  const surface = await surfaceNow()
  win.setBackgroundColor(SURFACES[surface].bg)
  if (process.platform !== 'darwin') win.setTitleBarOverlay(titleBarOverlay(false, surface))
}

/** The look a new video starts in: the active brand's named look when it is saved, else Settings > Your look. */
async function startingLook(s: Settings) {
  const named = lookByName([...BUILT_IN_LOOKS, ...(s.lookTemplates ?? [])], (await currentBrand())?.settings.defaultLook ?? null)
  return cleanDefaultLook(named ? named.look : s.defaultLook)
}

/** Their own templates; the first time, what they wrote in "How your videos are built" becomes one, kept as theirs. */
async function myBeatTemplates(): Promise<BeatTemplate[]> {
  const s = await loadSettings()
  const mine = (s.beatTemplates ?? []).flatMap((t) => cleanTemplate(t, t.id) ?? [])
  if (!mine.length && s.scriptFormat.trim()) {
    const first = cleanTemplate({ name: 'My format', hint: 'What you wrote in "How your videos are built".', beats: s.scriptFormat }, 'my-format')
    if (first) {
      await saveSettings({ beatTemplates: [first] })
      return [first]
    }
  }
  return mine
}

async function scriptSetup(): Promise<ScriptSetup> {
  const mine = await myBeatTemplates()
  const s = await loadSettings()
  const active = activeTemplate(mine, s.beatTemplate)
  const files = await writerFilesNow(s)
  const swipe = await readSwipe(files.voiceFile)
  return {
    voicePath: files.voiceFile,
    voiceFound: !!files.voiceFile && existsSync(files.voiceFile),
    format: active.beats,
    beatTemplates: allTemplates(mine),
    beatTemplate: active.id,
    videoFormat: formatOf(s.videoFormat),
    nicheFound: /^## Concepts/m.test(swipe),
    frameworkFound: !!files.framework
  }
}

function startFirstEdit(slug: string, initArgs: { title: string; files: string[]; scriptId?: string } | null): string {
  const dir = projectDir(slug)
  return jobs.start(slug, 'first-edit', async (emit, signal) => {
    if (initArgs && !existsSync(join(dir, 'project.json'))) {
      emit({ type: 'status', message: 'Copying your video', pct: 0 })
      await runEngine(
        'init',
        ['--project', dir, '--title', initArgs.title, '--slug', slug, ...initArgs.files],
        (p) => emit({ type: 'status', message: 'Copying your video', pct: Math.round(p.pct * 0.01) }),
        signal
      )
      const script = initArgs.scriptId ? await scriptStore().get(initArgs.scriptId) : undefined
      // The video is posted where its script was written for, else where they post first (Scripts page).
      // The frame follows the kind of video its script was written for, else Scripts > What kind of video.
      const kind = formatOf(script?.videoFormat ?? (await loadSettings()).videoFormat)
      const withFormat = (p: ProjectJson): ProjectJson => ({ ...p, format: frameFor(kind, p.format?.fps ?? 30) })
      const withScript = (p: ProjectJson): ProjectJson =>
        script
          ? {
              ...p,
              script: {
                hook: script.hook,
                script: script.script,
                onScreenText: script.onScreenText,
                // the hook's shape, so the results page can learn which shapes work (shared/results.ts)
                ...(script.hookFormula ? { hookFormula: script.hookFormula } : {})
              }
            }
          : p
      // Every new video starts with the person's own look (Settings > Your look).
      // ...or the active brand's look (Brands tab).
      await writeProject(slug, withDefaultLook(withFormat(withScript(await readProject(slug))), await startingLook(await loadSettings())))
    }
    const provider = await ai.active().catch(() => null)
    // A render event with firstLook = the quick no-AI draft is ready while the AI keeps editing; the
    // Working screen plays it (shared/live.ts) and says what it is. Once listening is done (the first
    // status of a later phase), the words heard go to the Working screen ("I heard: ...").
    let heard = false
    const r = await ai.firstEdit(
      dir,
      (e) => {
        emit(e)
        if (!heard && e.type === 'status' && e.phase && e.phase !== 'listen') {
          heard = true
          void readProject(slug)
            .then((p) => readWords(dir, p))
            .then((w) => w.length && emit({ type: 'heard', words: w.map((x) => x.w) }))
            .catch(() => undefined)
        }
      },
      signal,
      { finalRender: !(await loadSettings()).storyboardFirst, brief: await editBriefNow() }
    )
    // Honest "What I did": only an AI that ran to the end picked the takes and wrote the caption.
    // A notice means it stopped and (usually) the simple edit stepped in, so claim nothing.
    const aiEdited = !!provider && provider.connected && provider.id !== 'none' && !r.notice
    await updateAppState(slug, (s) => {
      s.aiEdited = aiEdited
    })
    if (r.notice?.userMessage) await addChat(slug, 'editor', r.notice.userMessage)
    return replyAskingAboutStyle(slug, r, r.summary)
  })
}

/** The editor's reply into the chat, then one "Remember this for next time?" per My style rule the AI
 * proposed or saved (a saved one is taken out again until the user says Yes): main/style-consent.ts. */
async function replyAskingAboutStyle(slug: string, r: AgentResult, summary: string): Promise<{ summary: string; version: number; quiet: true }> {
  const c = styleConsent(summary, r.styleRulesAdded, r.styleSuggestions)
  if (c.undo.length) {
    const rules = await ai.styleRules().catch(() => [])
    for (const rule of rules) if (c.undo.includes(rule.text)) await ai.removeStyleRule(rule.id).catch(() => undefined)
  }
  await addChat(slug, 'editor', c.summary, r.version)
  for (const rule of c.suggestions) await addChat(slug, 'editor', rememberQuestion(rule), undefined, ['remember-yes', 'remember-no'], rule)
  return { summary: c.summary, version: r.version, quiet: true }
}

const EDITABLE: (keyof ProjectJson)[] = ['title', 'cut', 'captions', 'music', 'broll', 'zooms', 'cover', 'post', 'look', 'soundEffects']

function safeFileName(s: string): string {
  const t = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '')
  return t.slice(0, 80) || 'My video'
}

async function exportVersion(slug: string, n: number): Promise<ExportResult> {
  const dir = projectDir(slug)
  let versions = await listVersions(dir)
  let v = versions.find((x) => x.n === n) ?? versions[versions.length - 1]
  if (!v) throw { code: 'NO_VERSION', userMessage: 'This video is not ready yet. Wait for it to finish, then try again.' }
  if (jobs.forSlug(slug)) throw { code: 'BUSY', userMessage: 'I am still working on this video. Wait until it is done, then export.' }
  if (v.draft) {
    // A preview is not the full-quality file: make it first, as a normal job (progress, Stop, and
    // nothing else can run on this video meanwhile) (review 25).
    jobs.start(slug, 'rerender', async (emit, signal) => {
      emit({ type: 'status', message: 'Making the full-quality video', pct: 1, phase: 'final' })
      const r: any = await runEngine(
        'render',
        ['--project', dir],
        (pr) => emit({ type: 'status', message: pr.message || 'Making the full-quality video', pct: pr.pct, phase: 'final' }),
        signal
      )
      const version = Number(r?.version ?? 0)
      emit({ type: 'render', version, draft: false })
      return { summary: '', version, quiet: true }
    })
    await jobs.forSlug(slug)?.done
    versions = await listVersions(dir)
    v = versions[versions.length - 1]
    if (!v || v.draft) throw { code: 'EXPORT_FAILED', userMessage: 'I could not make the full-quality video. Try Export again.' }
  }
  const p = await readProject(slug)
  const exportsDir = binDir('exports')
  await fs.mkdir(exportsDir, { recursive: true })
  // "<title> - Version 2.mp4": the same words as the version buttons, never a bare "(2)".
  const name = `${safeFileName(p.title || slug)} - Version ${v.n}`
  const video = uniqueDest(exportsDir, `${name}.mp4`)
  const stem = basename(video, '.mp4')
  await fs.copyFile(v.videoPath, video)
  let cover: string | null = null
  const coverSrc = join(dirname(v.videoPath), 'cover.png')
  if (existsSync(coverSrc)) {
    cover = join(exportsDir, `${stem} cover.png`)
    await fs.copyFile(coverSrc, cover)
  }
  const tags = (Array.isArray(p.post?.hashtags) ? p.post!.hashtags : [])
    .map((h) => String(h))
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ')
  const caption = [p.post?.caption ?? '', tags].filter(Boolean).join('\n\n')
  const captionFile = join(exportsDir, `${stem} caption.txt`)
  await fs.writeFile(captionFile, caption + '\n', 'utf8')
  if (!TEST) shell.showItemInFolder(video)
  return { folder: exportsDir, video, cover, captionFile, caption }
}

/** The current edit for CapCut, as a job so nothing else renders this project meanwhile. */
async function exportCapcut(slug: string): Promise<CapcutExport> {
  const dir = projectDir(slug)
  if (jobs.forSlug(slug)) throw { code: 'BUSY', userMessage: 'I am still working on this video. Wait until it is done, then try again.' }
  const p = await readProject(slug)
  const exportsDir = binDir('exports')
  await fs.mkdir(exportsDir, { recursive: true })
  const folder = uniqueDest(exportsDir, `${safeFileName(p.title || slug)} for CapCut`)
  let out: CapcutExport | null = null
  jobs.start(slug, 'export', async (emit, signal) => {
    emit({ type: 'status', message: 'Making the files for CapCut', pct: 1, phase: 'final' })
    const r: any = await runEngine(
      'capcut',
      ['--project', dir, '--out', folder],
      (pr) => emit({ type: 'status', message: pr.message || 'Making the files for CapCut', pct: pr.pct, phase: 'final' }),
      signal
    )
    out = { folder, video: String(r.video), srt: String(r.srt) }
    return { summary: '', version: Number(p.version ?? 0), quiet: true }
  })
  await jobs.forSlug(slug)?.done
  if (!out) throw { code: 'EXPORT_FAILED', userMessage: 'I could not make the CapCut files. Try again.' }
  return out
}

/** The current edit for OpenReel Video (engine openreel.py), as a job like the CapCut files. */
async function exportOpenReel(slug: string): Promise<OpenReelExport> {
  const dir = projectDir(slug)
  if (jobs.forSlug(slug)) throw { code: 'BUSY', userMessage: 'I am still working on this video. Wait until it is done, then try again.' }
  const p = await readProject(slug)
  const exportsDir = binDir('exports')
  await fs.mkdir(exportsDir, { recursive: true })
  const folder = uniqueDest(exportsDir, `${safeFileName(p.title || slug)} for OpenReel`)
  let out: OpenReelExport | null = null
  jobs.start(slug, 'export', async (emit, signal) => {
    emit({ type: 'status', message: 'Making the files for OpenReel', pct: 1, phase: 'final' })
    const r: any = await runEngine(
      'openreel',
      ['--project', dir, '--out', folder],
      (pr) => emit({ type: 'status', message: pr.message || 'Making the files for OpenReel', pct: pr.pct, phase: 'final' }),
      signal
    )
    out = { folder, edit: String(r.edit), cuts: Number(r.cuts) || 0, pictures: Number(r.pictures) || 0, subtitles: Number(r.subtitles) || 0 }
    return { summary: '', version: Number(p.version ?? 0), quiet: true }
  })
  await jobs.forSlug(slug)?.done
  if (!out) throw { code: 'EXPORT_FAILED', userMessage: 'I could not make the OpenReel files. Try again.' }
  return out
}

// ---- IPC ----------------------------------------------------------------------------------------
/** One Postiz client for posting and for the health check. */
const postiz = createPostiz()

function registerIpc(): void {
  handle('app:info', () => appInfo())
  handle('app:finishFirstRun', async () => {
    await saveSettings({ firstRunDone: true })
  })
  handle('app:openFolder', async (_e, p: unknown) => {
    // only the app's own folders and files (guards.ts): never a network path, never an app to launch
    const real = (x: string): Promise<string | null> => fs.realpath(x).catch(() => null)
    if (!(await mayReveal(p, [reelStudioRoot(), projectsDir()], real))) throw { code: 'NOT_ALLOWED', userMessage: 'That is not one of Matcha Momentum Generator\'s folders.' }
    if (TEST) return
    const path = p as string
    const st = await fs.stat(path).catch(() => null)
    if (st?.isDirectory()) await shell.openPath(path)
    else shell.showItemInFolder(path)
  })
  handle('app:copyText', (_e, t: string) => clipboard.writeText(String(t)))

  // ---- Studio tab: OpenReel's web editor in its own locked-down view (main/studio.ts) ----
  const studio = createStudio(() => win, { offline: TEST, log })
  handle('studio:show', (_e, raw: unknown) => {
    const bounds = cleanBounds(raw)
    if (bounds) studio.show(bounds)
  })
  handle('studio:hide', () => studio.hide())
  handle('studio:reload', () => studio.reload())
  handle('studio:openInBrowser', () => {
    if (!TEST) studio.openInBrowser()
  })
  handle('studio:exports', () => openReelExports(binDir('exports')))
  handle('app:dimTitleBar', async (_e, on: boolean) => {
    if (process.platform !== 'darwin' && win && !win.isDestroyed()) win.setTitleBarOverlay(titleBarOverlay(on === true, await surfaceNow()))
  })
  ipcMain.on('app:startDrag', (e, file: string) => {
    try {
      startDragOut(e.sender, file, [reelStudioRoot(), projectsDir()])
    } catch (err) {
      log(`[drag] ${String(err)}`)
    }
  })
  handle('app:chooseFolder', async () => {
    const r = await showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    pickedFolder = r.canceled ? null : (r.filePaths[0] ?? null)
    return pickedFolder
  })
  handle('app:setRoot', async (_e, p: unknown) => {
    // only the folder the person just picked in the dialog above, and never a network share (guards.ts)
    if (!mayUseAsRoot(p, pickedFolder)) throw { code: 'NOT_ALLOWED', userMessage: 'Pick the folder with "Change" first.' }
    pickedFolder = null
    if (jobs.runningCount()) throw { code: 'BUSY', userMessage: 'Wait until your video is finished, then change where videos are kept.' }
    const root = basename(p) === 'Matcha Momentum Generator' ? p : join(p, 'Matcha Momentum Generator')
    await fs.mkdir(root, { recursive: true })
    await saveSettings({ root })
    setRootOverride(root)
    await ensureRoot()
    return appInfo()
  })

  registerPhoneIpc({ handle, roots: () => [reelStudioRoot(), projectsDir()], send: broadcast, log, test: TEST })
  // pictures, GIFs and clips on a note (main/attachments.ts)
  registerAttachmentIpc({
    handle,
    runEngine,
    log,
    projectDir,
    readProject,
    busy: (slug) => !!jobs.forSlug(slug),
    clipboardImage: async () => {
      // Electron's async clipboard: the first item that carries a picture, as bytes
      for (const item of await clipboard.read()) {
        const type = pickClipboardType(item.types)
        if (!type) continue
        const blob = await item.getType(type)
        if (blob instanceof Blob) return { mime: type, bytes: new Uint8Array(await blob.arrayBuffer()) }
      }
      return null
    },
    choose: async (filters) => {
      const r = await showOpenDialog({ title: 'Attach a picture or a clip', properties: ['openFile', 'multiSelections'], filters })
      return r.canceled ? null : r.filePaths
    }
  })

  handle('model:status', () => models.status())
  handle('model:download', () => models.download())
  handle('model:cancel', () => models.cancel())

  handle('ai:providers', () => ai.providers())
  handle('ai:active', () => ai.active())
  // Done or failed, every call that can change the AI editor announces it so the sidebar line follows at once.
  const changesAI = (channel: string, fn: Handler): void =>
    handle(channel, async (e, ...args) => {
      try {
        return await fn(e, ...args)
      } finally {
        ai.active().then((p) => broadcast('ai:change', p), () => {})
      }
    })
  changesAI('ai:setActive', (_e, id, connectionId?: string) => ai.setActive(id, typeof connectionId === 'string' ? connectionId : undefined))
  changesAI('ai:setClaudeKey', (_e, key: string | null) => ai.setClaudeKey(key))
  // The key goes from the page to the AI package once and never comes back.
  const text = (v: unknown): string => (typeof v === 'string' ? v : '')
  const connectionsNotReady = { code: 'NOT_READY', userMessage: 'Connecting your own AI server is not ready in this build yet. Your videos still work without it.' }
  handle('ai:connections', async () => (await ai.connections?.()) ?? [])
  changesAI('ai:saveConnection', async (_e, input: Record<string, unknown>) => {
    if (!ai.saveConnection) throw connectionsNotReady
    const kind = input?.kind === 'anthropic' ? 'anthropic' : 'openai'
    return ai.saveConnection({ ...(input?.id ? { id: text(input.id) } : {}), label: text(input?.label), kind, baseURL: text(input?.baseURL), model: text(input?.model), key: text(input?.key) })
  })
  changesAI('ai:removeConnection', async (_e, id: unknown) => {
    if (!ai.removeConnection) throw connectionsNotReady
    await ai.removeConnection(text(id))
  })
  handle('ai:setConnectionImages', async (_e, id: unknown, on: unknown) => {
    if (!ai.setConnectionImages) throw connectionsNotReady
    await ai.setConnectionImages(text(id), on === true)
  })
  handle('ai:connectionModels', async (_e, q: Record<string, unknown>) => {
    if (!ai.connectionModels) return { models: [], suggested: null, needsKey: false }
    const kind = q?.kind === 'anthropic' ? 'anthropic' : 'openai'
    return ai.connectionModels({ kind, baseURL: text(q?.baseURL), key: text(q?.key), ...(q?.id ? { id: text(q.id) } : {}) })
  })
  // The person's own Claude Code app: the page gets the state only; the sign-in happens in Anthropic's CLI.
  const claudeCode = async () => (await ai.claudeCodeStatus?.()) ?? { state: 'missing' as const }
  handle('ai:claudeCodeStatus', async () => publicInfo(await claudeCode()))
  handle('ai:openClaudeSignIn', async () => {
    const st = await claudeCode()
    if (st.state === 'ready') return
    const open = aiSource === 'mock' ? async () => (ai.mockClaudeSignInOpened?.(), '') : (f: string) => shell.openPath(f)
    await openSignInWindow(st.bin, { dir: join(settingsDir(), 'claude-sign-in'), platform: process.platform, open })
  })
  // "Connect Claude" / "Connect ChatGPT" (vendor-connect.ts): the page gets VendorInfo only.
  const vendorOf = (v: unknown): Vendor => {
    if (v !== 'claude' && v !== 'chatgpt') throw { code: 'BAD_INPUT', userMessage: 'Unknown AI.' }
    return v
  }
  handle('ai:vendorStatus', (_e, v) => vendors.status(vendorOf(v)))
  // connecting ends by making the vendor's app the AI editor
  changesAI('ai:vendorConnect', (_e, v) => vendors.connect(vendorOf(v)))
  handle('ai:vendorCancel', (_e, v) => vendors.cancel(vendorOf(v)))
  handle('ai:vendorSignInAgain', (_e, v) => void vendors.signInAgain(vendorOf(v)))

  handle('projects:list', () => listProjects())
  handle('projects:get', async (_e, slug: string) => {
    const d = await detail(slug)
    const running = jobs.forSlug(slug)
    d.job = running
      ? { id: running.id, kind: running.kind, message: running.message, pct: running.pct, overall: running.overall, secondsLeft: running.secondsLeft, overdue: running.overdue, thinking: running.thinking }
      : null
    if (!running && d.status === 'working') d.status = 'interrupted'
    return d
  })
  handle('projects:create', async (_e, files: string[], scriptId?: unknown) => {
    const videos = files.filter(isVideo)
    const others = files.filter((f) => !isVideo(f))
    const skipped: DropResult[] = others.length ? await addToLibrary(others, runEngine, log) : []
    if (!videos.length) {
      const sorted = skipped.filter((s) => s.bin)
      throw {
        code: 'NO_VIDEO',
        userMessage: sorted.length
          ? 'That was not a video, so I put it in your Library. Drop a video file (like .mp4 or .mov) to make a reel.'
          : 'Drop a video file (like .mp4 or .mov) to make a reel.'
      }
    }
    for (const v of videos) {
      if (!(await fs.stat(v).catch(() => null))?.isFile()) {
        throw { code: 'NOT_FOUND', userMessage: `I could not open "${basename(v)}". Check that the file is still there and try again.` }
      }
    }
    await ensureRoot()
    const title = titleFromFile(videos[0])
    const slug = await uniqueSlug(title)
    await fs.mkdir(projectDir(slug), { recursive: true })
    await updateAppState(slug, (s) => {
      s.status = 'working'
      s.title = title
    })
    const jobId = startFirstEdit(slug, { title, files: videos, scriptId: typeof scriptId === 'string' ? scriptId : undefined })
    return { slug, jobId, skipped }
  })
  handle('projects:resume', async (_e, slug: string) => {
    const dir = projectDir(slug)
    if (!existsSync(join(dir, 'project.json'))) {
      throw { code: 'CANNOT_RESUME', userMessage: 'This video never finished copying. Delete it and drop the video in again.' }
    }
    return { jobId: startFirstEdit(slug, null) }
  })
  handle('projects:note', async (_e, slug: string, text: string, attachments?: unknown) => {
    const note = String(text ?? '').trim()
    const dir = projectDir(slug)
    // never trust the page: every attached ref is re-read from THIS project's own sidecars
    const files = await checkNoteAttachments(dir, attachments)
    if (!note && !files.length) throw { code: 'EMPTY', userMessage: 'Type what you would like changed first.' }
    if (jobs.forSlug(slug)) throw { code: 'BUSY', userMessage: 'I am still working on this video. Give me a moment, or press Stop.' }
    await addChat(slug, 'you', note, undefined, undefined, undefined, files.map(forChat))
    const active = await ai.active().catch(() => null)
    if (!active || !active.connected || active.id === 'none') {
      // No AI editor: nothing can apply the note, so do not pretend. Say what they can do instead
      // and offer the matching manual control plus "Connect ChatGPT" (grandma test, finding 8).
      const reply = noAiReply(note, files.length)
      await addChat(slug, 'editor', reply.text, undefined, reply.actions)
      return { jobId: null }
    }
    const jobId = jobs.start(
      slug,
      'note',
      async (emit, signal) => {
        // While a storyboard waits for approval (only previews so far), a change stays a preview too.
        const awaitingApproval = (await loadSettings()).storyboardFirst && (await listVersions(dir)).every((v) => v.draft)
        const opts = {
          ...(files.length ? { attachments: files.map((f) => f.asset) } : {}),
          ...(awaitingApproval ? { finalRender: false } : {})
        }
        const r: AgentResult = await ai.applyNote(dir, note, (e) => emit(e), signal, opts)
        const extra = r.notice?.userMessage ? ` ${r.notice.userMessage}` : ''
        return replyAskingAboutStyle(slug, r, r.summary + extra)
      },
      { note: note || files.map((f) => f.name).join(', ') }
    )
    return { jobId }
  })
  handle('projects:setFormat', async (_e, slug: string, format: unknown) => {
    if (jobs.forSlug(slug)) throw { code: 'BUSY', userMessage: 'I am still working on this video. Give me a moment, or press Stop.' }
    const p = await readProject(slug)
    p.format = frameFor(formatOf(format), p.format?.fps ?? 30)
    await writeProject(slug, p)
    return detail(slug)
  })
  handle('projects:update', async (_e, slug: string, patch: Partial<ProjectJson>) => {
    if (jobs.forSlug(slug)) throw { code: 'BUSY', userMessage: 'I am still working on this video. Give me a moment, or press Stop.' }
    const p = await readProject(slug)
    for (const k of Object.keys(patch ?? {}) as (keyof ProjectJson)[]) {
      // the "Flip picture" toggle: only each take's mirror flag, never its path or size
      if (k === 'sources') {
        p.sources = mergeSourcesPatch(p.sources, patch.sources)
        continue
      }
      if (!EDITABLE.includes(k)) continue
      if (k === 'look') {
        // only fields and values the engine knows (filter, auto colour, picture style); anything else is dropped
        p.look = cleanVideoLook(patch.look)
        continue
      }
      if (k === 'post' && patch.post) {
        // the renderer edits the caption; the adapted versions are only ever written by the AI (post:adapt)
        p.post = { ...patch.post, ...(p.post?.adapted ? { adapted: p.post.adapted } : {}) }
        if (!p.post.adapted) delete p.post.adapted
        continue
      }
      if (k === 'soundEffects') {
        p.soundEffects = { enabled: (patch.soundEffects as { enabled?: unknown } | undefined)?.enabled === true }
        continue
      }
      ;(p as any)[k] = (patch as any)[k]
    }
    await writeProject(slug, p)
    const d = await detail(slug)
    return d
  })
  // `change` = what the user changed, in plain words ("bigger yellow subtitles"), for the chat and the version button.
  // A manual change is render-only (no AI), called what it is ("Updating your subtitles", never the engine's
  // own step names like "Adding pictures"), and fast to SEE: a half-size preview first (the Reel screen plays
  // it), then the full-quality version (grandma 2: a colour change took 3 minutes and said "Adding pictures").
  handle('projects:rerender', async (_e, slug: string, change?: string, label?: string) => {
    const dir = projectDir(slug)
    const words = typeof label === 'string' && label.trim() ? label.trim().slice(0, 60) : 'Updating your video'
    const jobId = jobs.start(slug, 'rerender', async (emit, signal) => {
      emit({ type: 'status', message: words, pct: 1, phase: 'final' })
      const look: any = await runEngine(
        'render',
        ['--project', dir, '--draft', '--no-cover'],
        (p) => emit({ type: 'status', message: words, pct: Math.round(p.pct * 0.3), phase: 'final' }),
        signal
      )
      emit({ type: 'render', version: Number(look?.version ?? 0), draft: true, ...(look?.file ? { file: String(look.file) } : {}) })
      const r: any = await runEngine(
        'render',
        ['--project', dir],
        (p) => emit({ type: 'status', message: words, pct: 30 + Math.round(p.pct * 0.7), phase: 'final' }),
        signal
      )
      const version = Number(r?.version ?? (await readProject(slug)).version)
      emit({ type: 'render', version, draft: false, ...(r?.file ? { file: String(r.file) } : {}) })
      return { summary: versionMessage(version, typeof change === 'string' ? change.slice(0, 200) : ''), version }
    })
    return { jobId }
  })
  handle('projects:export', (_e, slug: string, n: number) => exportVersion(slug, n))
  handle('projects:remove', async (_e, slug: string) => {
    const running = jobs.forSlug(slug)
    if (running) {
      jobs.cancel(running.id)
      await running.done
    }
    await fs.rm(projectDir(slug), { recursive: true, force: true })
  })

  handle('jobs:cancel', (_e, id: string) => jobs.cancel(id))

  handle('library:list', async () => {
    await ensureRoot()
    return listLibrary()
  })
  handle('library:add', async (_e, paths: string[]) => {
    await ensureRoot()
    return addToLibrary(paths, runEngine, log)
  })
  handle('library:choose', async (_e, kind: 'music' | 'images') => {
    const filters =
      kind === 'music'
        ? [{ name: 'Songs', extensions: ['mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg'] }]
        : [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic'] }]
    const r = await showOpenDialog({
      title: kind === 'music' ? 'Pick a song' : 'Pick pictures',
      properties: ['openFile', 'multiSelections'],
      filters
    })
    if (r.canceled || !r.filePaths.length) return []
    await ensureRoot()
    return addToLibrary(r.filePaths, runEngine, log)
  })

  handle('style:rules', () => ai.styleRules())
  handle('style:remove', (_e, id: string) => ai.removeStyleRule(id))
  // Typed on the My style page: a new rule, or new wording for one.
  handle('style:add', async (_e, raw: unknown) => {
    const text = cleanRuleInput(raw)
    if (!text) throw { code: 'BAD_INPUT', userMessage: `Write the rule in one sentence, up to ${MAX_RULE_LENGTH} characters.` }
    if (!ai.addStyleRule) throw { code: 'NOT_READY', userMessage: 'I could not save that to My style. Try again later.' }
    return ai.addStyleRule(text)
  })
  handle('style:update', async (_e, id: unknown, raw: unknown) => {
    const text = cleanRuleInput(raw)
    if (typeof id !== 'string' || !id) throw { code: 'BAD_INPUT', userMessage: 'That rule is gone. Reload My style.' }
    if (!text) throw { code: 'BAD_INPUT', userMessage: `Write the rule in one sentence, up to ${MAX_RULE_LENGTH} characters.` }
    if (!ai.updateStyleRule) throw { code: 'NOT_READY', userMessage: 'I could not change that rule. Try again later.' }
    const r = await ai.updateStyleRule(id, text)
    if (!r) throw { code: 'NOT_FOUND', userMessage: 'That rule is gone. Reload My style.' }
    if (!r.updated) throw { code: 'DUPLICATE', userMessage: `You already have that rule: "${r.rule.text}"` }
    return r.rule
  })
  // "Remember this for next time?" Yes saves the rule; either answer replaces the buttons with a plain reply.
  handle('style:answer', async (_e, slug: string, messageId: string, yes: boolean) => {
    const st = await readAppState(slug)
    const m = st.chat.find((x) => x.id === messageId)
    if (!m?.suggestion || !m.actions?.includes('remember-yes')) return
    if (yes) {
      if (!ai.addStyleRule) throw { code: 'NOT_READY', userMessage: 'I could not save that to My style. Try again later.' }
      await ai.addStyleRule(m.suggestion)
    }
    await updateAppState(slug, (s) => {
      const x = s.chat.find((y) => y.id === messageId)
      if (x) delete x.actions
    })
    await addChat(slug, 'editor', yes ? "Saved. I'll do that in your next videos too. You can remove it in My style." : 'OK, only for this video.')
  })

  // ---- Brands tab: the brand profiles in ~/matcha/content/brands (main/brands.ts) ----
  registerBrandsIpc({
    handle,
    dir: brandsDir,
    reveal: (p) => (TEST ? undefined : shell.showItemInFolder(p)),
    active: () => activeBrandId,
    setActive: async (id) => {
      // The My style file follows (createAI's styleFile reads activeBrandId on every call).
      await saveSettings({ activeBrand: id })
      activeBrandId = id
    }
  })

  // ---- Carousels page: <root>/Carousels (main/carousels.ts), PNGs drawn offscreen (main/carousel-export.ts) ----
  registerCarouselsIpc({
    handle,
    root: reelStudioRoot,
    fontsDir: () => join(templatesDir(), 'fonts'),
    activeBrand: () => activeBrandId,
    defaultsFor: async (brand): Promise<CarouselDefaults> => {
      const b = brand ? await activeBrand(brandsDir(), brand, homedir()) : null
      return b ? carouselDefaults(parseBrandProfile(b.profileText), homedir()) : { style: 'editorial', handle: '', logo: null, artDir: null }
    },
    exportSlides: exportCarousel,
    // Written for the carousel's own brand (its voice, profile and My style file), whatever brand is in use now.
    draft: async (c, topic, slides) => {
      if (!ai.draftCarousel) throw { code: 'NOT_READY', userMessage: 'This version of the AI editor cannot write carousels yet. Update the app.' }
      return ai.draftCarousel(topic, () => {}, undefined, { ...(await writerContextFor(c.brand, 'carousel')), slides })
    },
    reveal: (p) => {
      if (TEST) return
      void shell.openPath(existsSync(p) ? p : dirname(p))
    }
  })

  // ---- Study reels: <root>/Study (main/study.ts): download, measure, then the AI breaks each video down ----
  studyQueue = new StudyQueue({
    root: reelStudioRoot(),
    runEngine: (cmd, args, onProgress, signal) => runEngine(cmd, args, onProgress, signal),
    studyReel: (src, m, frames, ctx, signal) => ai.studyReel(src, m, frames, ctx, signal),
    studyCreator: (creator, reels, signal) => ai.studyCreator(creator, reels, signal),
    context: async () => {
      const s = await loadSettings()
      const files = await writerFilesNow(s)
      const voice = await readCapped(files.voiceFile, STUDY_ABOUT_LIMIT)
      return { templates: allTemplates(await myBeatTemplates()).map((t) => ({ name: t.name, beats: t.beats })), about: voice }
    },
    mediaUrl,
    changed: (list) => broadcast('study:changed', list),
    log
  })
  registerStudyIpc({
    handle,
    queue: studyQueue,
    swipeFile: async () => {
      const { voiceFile } = await writerFilesNow(await loadSettings())
      return voiceFile ? join(dirname(voiceFile), 'swipe.md') : null
    },
    researchDir: async () => {
      const { voiceFile } = await writerFilesNow(await loadSettings())
      return voiceFile ? join(dirname(voiceFile), 'research') : null
    },
    // added to their templates without switching the one they picked
    saveTemplate: async (raw) => {
      const mine = await myBeatTemplates()
      const t = cleanTemplate(raw, `mine-${randomUUID().slice(0, 8)}`)
      if (!t) throw { code: 'BAD_TEMPLATE', userMessage: 'This study has no steps to make a template from.' }
      if (mine.length >= MAX_BEAT_TEMPLATES) throw { code: 'TOO_MANY', userMessage: `You can keep ${MAX_BEAT_TEMPLATES} templates. Delete one in Scripts first.` }
      await saveSettings({ beatTemplates: [...mine, t] })
    },
    openExternal: (url) => void shell.openExternal(url)
  })
  void studyQueue.resume()

  // ---- Stories page: <root>/Stories (main/stories.ts), voice by the engine (story-voice), MP4 drawn offscreen ----
  registerStoriesIpc({
    handle,
    root: reelStudioRoot,
    fontsDir: () => join(templatesDir(), 'fonts'),
    libraryDir,
    modelsDir,
    activeBrand: () => activeBrandId,
    defaultsFor: async (brand) => {
      const b = brand ? await activeBrand(brandsDir(), brand, homedir()) : null
      if (!b) return { palette: 'mono', handle: '', logo: null, artDir: null }
      const d = carouselDefaults(parseBrandProfile(b.profileText), homedir())
      return { palette: d.logo || d.artDir ? 'brand' : 'mono', handle: d.handle, logo: d.logo, artDir: d.artDir }
    },
    runEngine,
    chooseFile: async () => {
      const r = await showOpenDialog({ title: 'Choose your recording', properties: ['openFile'], filters: [{ name: 'Audio or video', extensions: ['wav', 'm4a', 'mp3', 'aac', 'mov', 'mp4'] }] })
      return r.canceled ? null : (r.filePaths[0] ?? null)
    },
    mediaUrl,
    // Written for the story's own brand, like carousels; it is told whether that brand has illustrations.
    draft: async (story, topic, lines) => {
      if (!ai.draftStory) throw { code: 'NOT_READY', userMessage: 'This version of the AI editor cannot write stories yet. Update the app.' }
      const ctx = await writerContextFor(story.brand, 'story')
      const hasArt = story.brand ? !!(await (async () => {
        const b = await activeBrand(brandsDir(), story.brand!, homedir())
        return b ? carouselDefaults(parseBrandProfile(b.profileText), homedir()).artDir : null
      })()) : false
      const d = await ai.draftStory(topic, () => {}, undefined, { ...ctx, lines, hasArt, hasImages: false })
      return { title: d.title, lines: d.lines, caption: d.caption, hashtags: d.hashtags }
    },
    exportStory,
    renderHtml: storyHtml,
    progress: (p) => broadcast('stories:progress', p),
    reveal: (p) => {
      if (TEST) return
      void shell.openPath(existsSync(p) ? p : dirname(p))
    }
  })

  registerContentIpc({
    handle,
    ai: () => ai,
    runEngine,
    scripts: {
      list: () => scriptStore().list(),
      get: (id) => scriptStore().get(id),
      save: (draft) => scriptStore().save(draft),
      update: (id, patch) => scriptStore().update(id, patch),
      remove: (id) => scriptStore().remove(id)
    },
    postiz,
    maker: createOpenMontage(),
    addToLibrary: (files) => addToLibrary(files, runEngine, log),
    dirOf: projectDir,
    projectsRoot: projectsDir,
    markWorking: async (slug, title) => {
      await updateAppState(slug, (s) => {
        s.status = 'working'
        s.title = title
      })
    },
    edit: async (slug) => {
      // Pressing Resume on a queued clip gets there first: wait for that job, and never edit a clip twice.
      await jobs.forSlug(slug)?.done
      if ((await listVersions(projectDir(slug))).length) return
      startFirstEdit(slug, null)
      await jobs.forSlug(slug)?.done
    },
    latestVideo: async (slug) => {
      const newest = (await listVersions(projectDir(slug))).at(-1)
      if (!newest) throw { code: 'NO_VERSION', userMessage: 'This video is not ready yet. Wait for it to finish, then try again.' }
      return (await exportVersion(slug, newest.n)).video
    },
    title: async (slug) => (await readProject(slug)).title,
    readResult: async (slug) => cleanResult((await readAppState(slug)).result),
    writeResult: async (slug, result) => {
      await updateAppState(slug, (s) => {
        s.result = result
      })
    },
    firstWords: async (slug) => {
      const p = await readProject(slug)
      return (await readWords(projectDir(slug), p)).map((w) => w.w).join(' ')
    },
    swipeFile: async () => {
      const { voiceFile } = await writerFilesNow(await loadSettings())
      return voiceFile ? join(dirname(voiceFile), 'swipe.md') : null
    },
    engineInputs: async () => {
      const s = await loadSettings()
      const files = await writerFilesNow(s)
      const mine = await myBeatTemplates()
      return {
        brand: (await currentBrand())?.title ?? null,
        voiceFile: files.voiceFile,
        templates: allTemplates(mine),
        activeTemplate: activeTemplate(mine, s.beatTemplate).name,
        styleRules: await rulesText(join(reelStudioRoot(), styleFileName(activeBrandId))),
        motionCards: s.motionCards !== false,
        scripts: await scriptStore().list(),
        skillFolders: await installedSkillFolders(homedir())
      }
    },
    healthInputs: () => ({
      doctor: () => runEngine('doctor', []) as Promise<{ checks?: { ok?: unknown; name?: unknown; detail?: unknown; fix?: unknown }[] }>,
      ai: () => ai.active(),
      model: async () => models.status(),
      postiz: () => postiz.status(),
      appVersion: app.getVersion(),
      root: reelStudioRoot()
    }),
    scriptContext: async () => {
      const s = await loadSettings()
      const files = await writerFilesNow(s)
      const mine = await myBeatTemplates()
      const active = activeTemplate(mine, s.beatTemplate)
      return { voice: await readCapped(files.voiceFile, VOICE_LIMIT), format: active.beats, videoFormat: formatOf(s.videoFormat), swipe: await readSwipe(files.voiceFile),
        framework: files.framework, brand: files.brand, speaker: files.speaker,
        templates: allTemplates(mine).map((t) => ({ name: t.name, beats: t.beats.split('\n').filter((l) => l.trim()) })),
        activeTemplate: active.name, ranking: await readBeside(files.voiceFile, 'rankings.md', RANKING_LIMIT) }
    },
    scriptSetup,
    capcut: exportCapcut,
    openreel: exportOpenReel,
    mediaUrl,
    isBusy: (slug) => !!jobs.forSlug(slug),
    storyboardFirst: async () => (await loadSettings()).storyboardFirst,
    setStoryboardFirst: async (on) => {
      await saveSettings({ storyboardFirst: on })
    },
    theme: async () => {
      const t = (await loadSettings()).theme
      return isTheme(t) ? t : 'dark'
    },
    setTheme: async (t) => {
      if (!isTheme(t)) return
      await saveSettings({ theme: t })
      await paintWindowChrome()
    },
    motionCards: async () => (await loadSettings()).motionCards !== false,
    setMotionCards: async (on) => {
      await saveSettings({ motionCards: on })
    },
    defaultLook: async () => cleanDefaultLook((await loadSettings()).defaultLook),
    setDefaultLook: async (look) => {
      await saveSettings({ defaultLook: look })
    },
    projectSlugs: async () => (await listProjects()).map((p) => p.slug),
    lookTemplates: async () => (await loadSettings()).lookTemplates ?? [],
    setLookTemplates: async (lookTemplates) => {
      await saveSettings({ lookTemplates })
    },
    readProjectJson: readProject,
    writeProjectJson: writeProject,
    reveal: (path) => {
      if (!TEST) shell.showItemInFolder(path)
    },
    chooseVoice: async () => {
      // With a brand picked, its profile says which voice file it uses: choosing one here would change nothing.
      if (activeBrandId) throw { code: 'BRAND_VOICE', userMessage: 'This brand’s voice file is set on the Brands tab, under Voice.' }
      const r = await showOpenDialog({ title: 'Choose your voice file', properties: ['openFile'], filters: [{ name: 'Text', extensions: ['md', 'txt'] }] })
      if (r.canceled || !r.filePaths[0]) return null
      await saveSettings({ voiceFile: r.filePaths[0] })
      return scriptSetup()
    },
    setFormat: async (format) => {
      await saveSettings({ scriptFormat: format.slice(0, FORMAT_LIMIT) })
      return scriptSetup()
    },
    setBeatTemplate: async (id) => {
      if (allTemplates(await myBeatTemplates()).some((t) => t.id === id)) await saveSettings({ beatTemplate: id })
      return scriptSetup()
    },
    saveBeatTemplate: async (raw) => {
      const mine = await myBeatTemplates()
      const want = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : ''
      const id = mine.some((t) => t.id === want) ? want : `mine-${randomUUID().slice(0, 8)}`
      const t = cleanTemplate(raw, id)
      if (!t) throw { code: 'BAD_TEMPLATE', userMessage: 'Give the template a name and at least one beat.' }
      if (!mine.some((m) => m.id === id) && mine.length >= MAX_BEAT_TEMPLATES) {
        throw { code: 'TOO_MANY', userMessage: `You can keep ${MAX_BEAT_TEMPLATES} templates. Delete one first.` }
      }
      const next = mine.some((m) => m.id === id) ? mine.map((m) => (m.id === id ? t : m)) : [...mine, t]
      await saveSettings({ beatTemplates: next, beatTemplate: id })
      return scriptSetup()
    },
    removeBeatTemplate: async (id) => {
      const s = await loadSettings()
      const mine = (await myBeatTemplates()).filter((t) => t.id !== id)
      await saveSettings({ beatTemplates: mine, ...(s.beatTemplate === id ? { beatTemplate: DEFAULT_BEAT_TEMPLATE } : {}) })
      return scriptSetup()
    },
    setVideoFormat: async (videoFormat) => {
      await saveSettings({ videoFormat })
      return scriptSetup()
    },
    log
  })

  handle('update:status', () => updates.status())
  handle('update:setEnabled', (_e, on: unknown) => updates.setEnabled(on))
  handle('update:open', (_e, url: unknown) => updates.open(url))
  handle('update:dismiss', (_e, version: unknown) => updates.dismiss(version))

  handle('dev:renderTestAnimation', (_e, outPath: string, fullSize?: boolean, template?: string, params?: Record<string, unknown>) => {
    if (!TEST && app.isPackaged) throw { code: 'NOT_ALLOWED', userMessage: 'Not available.' }
    if (template) return host.renderAnimation(template, params ?? {}, outPath)
    return host.renderAnimation(TEST_TEMPLATE, { text: 'Hi', duration: fullSize ? 2 : 1 }, outPath)
  })
}

/** "Connect Claude" / "Connect ChatGPT": real installers and sign-ins, or the mock's (REELSTUDIO_MOCK_CLAUDE / _CODEX). */
function createVendors(): VendorConnect {
  const status = async (v: Vendor): Promise<CliStatus> =>
    (v === 'claude' ? await ai.claudeCodeStatus?.() : await ai.codexStatus?.()) ?? { state: 'missing' }
  const mock = aiSource === 'mock' ? ai.mockVendor : undefined
  return createVendorConnect({
    status,
    install: (v, signal) => {
      if (mock) return mock.install(v, signal)
      const run = (): Promise<void> =>
        runInstall({ vendor: v, platform: process.platform, dir: join(settingsDir(), 'vendor-setup'), env: cliBaseEnv(), fetch: (u, i) => net.fetch(u, i), signal, systemRoot: process.env.SystemRoot, log })
      // Test switch only: OpenAI's Windows installer rewrites the user PATH; put it back exactly as it was.
      return TEST_VENDOR_ENV && process.platform === 'win32' && v === 'chatgpt' ? withUserPathKept(run, log) : run()
    },
    login: (v, bin, signal) =>
      mock ? mock.login(v, signal) : runLogin({ vendor: v, bin, env: TEST_LOGIN_ENV ?? process.env, platform: process.platform, signal, systemRoot: process.env.SystemRoot }),
    select: (v) => ai.setActive(v === 'claude' ? 'claude-cli' : 'codex-cli'),
    emit: (i) => broadcast('ai:vendor', i),
    log
  })
}

/** Old local-Claude-Code installs used Claude Code without a saved choice; keep it for them, once (ai-carryover.ts). */
async function carryOverClaudeCode(settings: { aiAutoPicked: boolean; aiCarriedOver: boolean }): Promise<void> {
  const decision = carryOverDecision({
    aiAutoPicked: settings.aiAutoPicked,
    carriedOver: settings.aiCarriedOver,
    choiceSaved: await aiChoiceSaved(join(settingsDir(), 'ai')),
    activeId: (await ai.active()).id,
    claudeCodeReady: settings.aiAutoPicked && !settings.aiCarriedOver ? (await ai.claudeCodeStatus?.())?.state === 'ready' : false
  })
  if (decision === 'nothing-to-do') {
    if (settings.aiAutoPicked && !settings.aiCarriedOver) await saveSettings({ aiCarriedOver: true })
    return
  }
  if (decision === 'not-ready-yet') return // try again next start: their Claude Code app may be signed out right now
  await ai.setActive('claude-cli')
  await saveSettings({ aiCarriedOver: true })
  log('[ai] kept Claude (your Claude Code app), which this install used before 0.1.2')
}

// ---- window -------------------------------------------------------------------------------------
async function createWindow(): Promise<void> {
  win = createMainWindow({ preload: join(__dirname, '../preload/index.js'), stateFile: windowStateFile(settingsDir()), test: TEST, surface: await surfaceNow() })
  installMenu(sendCommand, DEV_PROVIDERS || !app.isPackaged)
  if (!HIDDEN) win.once('ready-to-show', () => win?.show())
  // Stop flashing the taskbar once the person is back.
  win.on('focus', () => win?.flashFrame(false))
  // The animation renderer keeps a hidden offscreen window; it must not keep the app alive.
  win.on('closed', () => void closeAnimationRenderer())
  // Links open in the system browser; the app window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    // only the sites the app links to (guards.ts LINK_HOSTS)
    if (mayOpenLink(url)) void shell.openExternal(url)
    else log(`[links] refused to open ${String(url).slice(0, 120)}`)
    return { action: 'deny' }
  })
  // The app is one page: it never navigates (review 30). Links go out through the handler above.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

const gotLock = TEST || app.requestSingleInstanceLock()
if (!gotLock) app.quit()
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(async () => {
  // the page asks for nothing beyond fullscreen video and copying text: camera, microphone, location and the rest are
  // refused (security review; the studio, capture and export windows set their own)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(PAGE_PERMISSIONS.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => PAGE_PERMISSIONS.has(permission))
  if (process.platform === 'darwin' && process.execPath.startsWith('/Volumes/')) {
    log('[start] executable is under /Volumes/ on macOS; running from a mounted volume that may be a read-only disk image')
  }
  if (process.platform === 'darwin' && process.execPath.includes('/AppTranslocation/')) {
    log('[start] executable is under /AppTranslocation/ on macOS; running from a read-only Gatekeeper translocated copy')
  }
  pidRegistry = createPidRegistry(settingsDir())
  const reaped = await pidRegistry.reap().catch(() => 0)
  if (reaped) log(`[start] stopped ${reaped} engine process(es) left over from a crash`)
  const settings = await loadSettings()
  if (settings.root) setRootOverride(settings.root)
  await ensureRoot().catch((e) => log(`[root] ${String(e)}`))
  const recovered = await recoverInterrupted().catch((e) => {
    log(`[recover] ${String(e)}`)
    return []
  })
  if (recovered.length) log(`[recover] cleaned up ${recovered.join(', ')}`)
  activeBrandId = settings.activeBrand
  const loaded = await loadAI(
    {
      // My style: one rules file per brand (Personal keeps My style.json).
      styleFile: () => join(reelStudioRoot(), styleFileName(activeBrandId)),
      host,
      settingsDir: join(settingsDir(), 'ai'),
      dev: DEV_PROVIDERS,
      secretStore: safeStorage,
      cliEnv: cliBaseEnv
    },
    log
  )
  ai = loaded.ai
  aiSource = loaded.source
  vendors = createVendors()
  if (TEST_VENDOR_ENV) log(`[ai] test switch: the Claude Code and Codex apps see a throwaway home (REELSTUDIO_TEST_VENDOR_HOME)`)
  if (!DEV_PROVIDERS) {
    const retired = await ai.retireSignInWithChatGPT?.().catch((e) => (log(`[ai] retire Sign in with ChatGPT: ${String(e)}`), false))
    if (retired) log('[ai] signed out the old in-app ChatGPT sign-in; ChatGPT now connects through the Codex app')
  }
  await carryOverClaudeCode(settings).catch((e) => log(`[ai] carry-over: ${String(e)}`))
  log(`[start] root=${reelStudioRoot()} engine=${engineMode()}:${engineDir()} python=${pythonExe()} ai=${aiSource}`)
  handleMediaProtocol(() => [reelStudioRoot(), projectsDir()])
  registerIpc()
  await createWindow()
  // off in Matcha Momentum Generator until it has its own update server (shared/config.ts UPDATE_CHECK_ON)
  if (UPDATE_CHECK_ON) updates.start() // a few seconds after the window, so launch is never slower
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

let quitting = false
app.on('before-quit', (e) => {
  void stopPhoneShare() // the "Send to my phone" link never outlives the app
  studyQueue?.stop() // an interrupted study picks up again on the next start
  if (quitting || !jobs.runningCount()) {
    void killAllEngines()
    return
  }
  // Stop running work cleanly so the next start finds a tidy project.
  e.preventDefault()
  quitting = true
  void jobs
    .cancelAll()
    .then(() => killAllEngines())
    .finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export { readAppState }
