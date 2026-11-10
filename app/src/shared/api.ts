import type { EngineView, HealthView, PerformanceView } from './overview'
import type { StudyAddOptions, StudyList, StudyReelDetail } from './study'
// Types shared by the main process, the preload bridge and the renderer.
// Keep this file free of Node and DOM imports.
import type { BeatTemplate } from './beats'
import type { BrandDoc, BrandEdit, BrandList } from './brand-profile'
import type { Carousel } from './carousel'
import type { CarouselAssets } from './carousel-render'
import type { Story, StoryAssets, StoryTiming, StoryVoiceOption, VoiceModelStatus } from './story'

/** A Stories job's progress: `id` is the story ('' for the voice model download). */
export interface StoryProgress {
  id: string
  stage: 'download' | 'voice' | 'align' | 'export'
  pct: number
  message: string
}
import type { Level, Theme } from './life'
import type { VideoFormat } from './formats'
import type { ChatAction } from './notes'
import type { DefaultLook, FilterName, LookTemplate, PictureStyle } from './looks'
import type { Insights, VideoResult } from './results'
export type { ChatAction } from './notes'
export type { DefaultLook, FilterName, LookTemplate } from './looks'

export type AppCommand = { type: 'new-video' | 'settings' | 'export' | 'library' } | { type: 'open-reel'; slug: string }

export type ScreenStatus = 'new' | 'working' | 'ready' | 'interrupted' | 'failed'

export interface ProjectSummary {
  slug: string
  dir: string
  title: string
  createdAt: string
  updatedAt: string
  version: number
  thumbnail: string | null
  status: ScreenStatus
}

export interface VersionInfo {
  n: number
  video: string
  videoPath: string
  draft: boolean
  cover: string | null
  createdAt: string
}

export interface Word {
  id: string
  w: string
  s: number
  e: number
  source?: string
}

export interface ChecklistItem {
  key: string
  label: string
  done: boolean
  detail?: string
}

export interface ChatMessage {
  id: string
  from: 'you' | 'editor'
  text: string
  at: string
  version?: number
  /** Buttons under an editor message (e.g. "Open caption settings", "Connect ChatGPT"). */
  actions?: ChatAction[]
  /** A My style rule the AI suggested; saved only if the user answers Yes (remember-yes). */
  suggestion?: string
  /** Pictures, GIFs or clips the user attached to this note (a "you" message). */
  attachments?: NoteAttachment[]
}

/** A file attached to a note: what `engine attach` wrote in its sidecar (shared/attachments.ts). */
export interface NoteAttachment {
  /** project-relative `work/assets/attach-*` */
  asset: string
  /** the original file name, for the user */
  name: string
  kind: 'image' | 'video'
  bytes: number
  width?: number
  height?: number
  duration?: number
  hasAudio?: boolean
  /** an animated GIF, turned into a silent clip */
  fromGif?: boolean
  /** project-relative 320 px still */
  thumb?: string
  /** reel-media URL of the still (filled by main when it goes to the page) */
  thumbUrl?: string
}

/** What came of attaching: the files that made it, and a plain message for each one that did not. */
export interface AttachResult {
  attached: NoteAttachment[]
  errors: string[]
}

export interface ProjectDetail extends ProjectSummary {
  /** The raw take (reel-media URL), or null before it is copied in. */
  sourceVideo: string | null
  project: ProjectJson
  versions: VersionInfo[]
  words: Word[]
  keptIds: string[]
  checklist: ChecklistItem[]
  chat: ChatMessage[]
  lastError: { code: string; userMessage: string } | null
  job: { id: string; kind: JobKind; message: string; pct: number; overall: number; secondsLeft: number | null; overdue: boolean; thinking: boolean } | null
  /** A small picture for each b-roll item with an image file (broll id -> reel-media URL). Animations and
   * text-only items have none (the Pictures list names them in words instead of a file name). */
  brollThumbs: Record<string, string>
  /** True when an AI editor made this video's edit. False = the simple no-AI edit (be honest about it). */
  aiEdited: boolean
}

// Loose mirror of project.json (docs/architecture.md section 3). The engine owns validation.
export interface ProjectJson {
  schemaVersion: number
  id: string
  title: string
  slug: string
  createdAt: string
  updatedAt: string
  version: number
  /** `kind`: vertical short, horizontal short or long-form (shared/formats.ts); absent = from the shape. */
  format?: { width: number; height: number; fps: number; kind?: VideoFormat }
  /** `mirror`: the take is mirrored, the engine flips the picture (absent = as filmed) */
  sources?: { id: string; path: string; duration?: number; width?: number; height?: number; rotation?: number; mirror?: boolean }[]
  transcript?: { file: string; language?: string }
  cut?: { keep: { from: string; to: string }[]; gapCap?: number; minSaving?: number }
  captions?: {
    enabled: boolean
    style?: Record<string, unknown>
    corrections?: { from: string; to: string }[]
  }
  music?: {
    enabled: boolean
    track: string | null
    startAt?: number
    level?: string
    automation?: unknown[]
    fadeOut?: number
  }
  broll?: {
    id: string
    anchor: { from: string; to: string }
    treatment: string
    /** Library path, project path or animation id; null for text-only treatments. */
    asset: string | null
    params?: Record<string, unknown>
  }[]
  zooms?: unknown[]
  cover?: { atSourceTime: number; source: string; text: string | null }
  /** The Instagram post; `adapted` is it rewritten for TikTok and YouTube, `from` the caption it came from. */
  post?: { caption: string; hashtags: string[]; keywords: string[]; adapted?: AdaptedPosts }
  /** One colour filter for the whole picture (shared/looks.ts), and auto colour: each take's light fixed first. */
  look?: { filter?: FilterName; autoColor?: boolean; pictureStyle?: PictureStyle; pictureColor?: string }
  /** Pops, swishes and taps on text cards, animations and pictures. */
  soundEffects?: { enabled?: boolean }
  /** The script this video was filmed from; hookFormula = the hook's shape, for learning from results. */
  script?: { hook: string; script: string; onScreenText: string[]; hookFormula?: string }
  notes?: { version: number; text: string; applied: string[]; at: string }[]
  [k: string]: unknown
}

export type JobKind = 'first-edit' | 'note' | 'rerender' | 'export' | 'script'

/** The steps of a job, tagged by the ai package on its status events (main/progress.ts times them). */
export type Phase = 'listen' | 'analyze' | 'firstLook' | 'edit' | 'final'

/**
 * What a running job reports to main (jobs.ts `Emit`): the ai package's AgentEvent plus what main adds
 * itself. ONE contract; `shared/live.ts` is the only reader on the renderer side.
 */
export type JobUpdate =
  /** pct = this step's own percent (restarts per step). thinking = waiting on the AI's answer. */
  | { type: 'status'; message: string; pct?: number; phase?: Phase; thinking?: boolean }
  | { type: 'tool'; name: string; summary: string }
  /** A render finished. firstLook = the quick no-AI preview made while the AI still edits (not a version).
   * file = the engine's output path (absolute); main turns it into `video` for the renderer. */
  | { type: 'render'; version: number; draft: boolean; firstLook?: boolean; file?: string }
  /** The reply to a note, known before the render that makes it true (fast notes). Shown at once;
   * the same text lands in the chat when the job is done. */
  | { type: 'reply'; text: string }
  /** The words heard, once listening is done (main reads them from the transcript). */
  | { type: 'heard'; words: string[] }
  /** Every tool call the AI made, and its reasoning: saved to the project's trace (main/trace.ts), never sent on. */
  | { type: 'step'; name: string; args: Record<string, unknown>; ok: boolean; summary?: string; error?: string }
  | { type: 'thought'; text: string }

type Ids = { jobId: string; slug: string | null }

/** Every event the renderer receives (`reel.jobs.onEvent`). */
export type JobEvent = Ids &
  (
    /** overall = honest 0-99 for the whole job, never backwards; secondsLeft = from this computer's measured
     * history (main/progress.ts), null = too early to say. Status repeats about once a second while a job
     * runs (thinking kept), so a bar fed by `overall` never freezes. */
    /** overdue = past every estimate on the last step: show "Still working, almost there", no number. */
    | { type: 'status'; message: string; pct: number; phase?: Phase; overall: number; secondsLeft: number | null; overdue: boolean; thinking: boolean }
    | { type: 'tool'; name: string; summary: string }
    /** video = a playable reel-media URL of a stable copy (never the file the engine overwrites next). */
    | { type: 'render'; version: number; draft: boolean; firstLook: boolean; video: string | null }
    | { type: 'reply'; text: string }
    | { type: 'heard'; words: string[] }
    | { type: 'done'; summary: string; version?: number }
    | { type: 'error'; code: string; userMessage: string }
    | { type: 'cancelled' }
  )

export interface LibraryFile {
  name: string
  path: string
  url: string
  size: number
  modifiedAt: string
}

export interface LibraryBin {
  key: 'raw' | 'broll' | 'music' | 'images' | 'exports'
  label: string
  dir: string
  files: LibraryFile[]
}

export interface DropResult {
  file: string
  name: string
  bin: LibraryBin['key'] | null
  dest: string | null
  reason?: string
}

export interface ProviderInfo {
  id: 'claude' | 'codex-cli' | 'claude-cli' | 'custom' | 'replay' | 'none'
  connected: boolean
  label: string
  detail?: string
  error?: UserError
  connectionId?: string
}

export type ConnectionKind = 'anthropic' | 'openai'

/** The key never comes back to the page, only `hasKey`. */
export interface ConnectionInfo {
  id: string
  label: string
  kind: ConnectionKind
  baseURL: string
  model: string
  /** false: the AI editor is never sent pictures through this server */
  supportsImages: boolean
  hasKey: boolean
  active: boolean
}

export interface ConnectionInput {
  id?: string
  label: string
  kind: ConnectionKind
  baseURL: string
  model: string
  /** empty keeps the stored key when editing */
  key?: string
}

export interface SaveConnectionResult {
  status: ProviderInfo
  connection?: ConnectionInfo
  error?: UserError & { field?: 'label' | 'address' | 'key' | 'model' }
}

export interface AppInfo {
  version: string
  platform: string
  root: string
  /** The root in friendly words: "Documents › Matcha Momentum Generator". */
  rootDisplay: string
  firstRunDone: boolean
  engine: { mode: 'real' | 'fake'; dir: string; python: string }
  ai: 'package' | 'mock'
  test: boolean
  /** REELSTUDIO_DEV=1: show the dev-only AI providers. */
  dev: boolean
}

/** The person's own Claude Code app: not found / found but will not start / not signed in / ready. */
export type ClaudeCodeState = 'missing' | 'broken' | 'signed_out' | 'ready'

/** "Connect Claude" / "Connect ChatGPT": the person's own Claude Code app or Codex app (main/vendor-connect.ts). */
export type VendorId = 'claude' | 'chatgpt'
/** idle = nothing running; installing = the vendor's installer runs; signing_in = the vendor's page is open in the
 * browser; checking = asking the app if it worked; done = it is the AI editor now; failed = see `problem`. */
export type VendorStep = 'idle' | 'installing' | 'signing_in' | 'checking' | 'done' | 'failed'
export type VendorProblem =
  | 'install_failed'
  | 'not_found_after_install'
  | 'sign_in_failed'
  | 'sign_in_timeout'
  | 'port_busy'
  | 'free_plan'
  | 'cancelled'

/** What the page learns about a vendor's app. Never the account, a path, a sign-in link or a code. */
export interface VendorInfo {
  vendor: VendorId
  state: ClaudeCodeState
  step: VendorStep
  version?: string
  /** the plan kind when the app says it (Claude: "pro", "max") */
  plan?: string
  /** plain words for the person */
  message?: string
  problem?: VendorProblem
}

/** What the page learns about it. Never the account (no e-mail, no organization), never a path. */
export interface ClaudeCodeInfo {
  state: ClaudeCodeState
  version?: string
  /** the plan kind, e.g. "pro" or "max" */
  plan?: string
  /** plain words when it is not ready */
  reason?: string
}

export interface ModelStatus {
  name: string
  installed: boolean
  downloading: boolean
  pct: number
  bytes: number
  total: number
  error: string | null
}

export interface StyleRule {
  id: string
  text: string
  createdAt: string
}

export interface ExportResult {
  folder: string
  video: string
  cover: string | null
  captionFile: string
  caption: string
}

/** "Send to my phone": one network the phone could reach this computer on. */
export interface PhoneAddress {
  address: string
  label: string
  likely: boolean
}

/** A running "Send to my phone" link (one video, one-time token, stops by itself). */
export interface PhoneShare {
  url: string
  address: string
  /** Every network the link could use, best first, for "Use a different network". */
  addresses: PhoneAddress[]
  expiresAt: number
  /** Bytes, for the email size warning. */
  size: number
  /** Show the "phone can't connect?" help after this long without a visit. */
  waitMs: number
}

export type PhoneEvent = { kind: 'page' } | { kind: 'video' } | { kind: 'stopped'; reason: 'timeout' | 'closed' }

export interface ScriptResult {
  hook: string
  script: string
  onScreenText: string[]
}

/** Another opening for a script, with how long it takes to say. */
export interface HookOption {
  text: string
  formula: string
  words: number
  seconds: number
}

/** A script kept for later: read it on the teleprompter, then attach it to the video filmed from it. */
export interface SavedScript extends ScriptResult {
  id: string
  createdAt: string
  /** From the generator; absent on scripts saved before it, or imported. */
  hookFormula?: string
  hooks?: HookOption[]
  seconds?: number
  /** The kind of video it was written for; absent on older scripts (= vertical short). */
  videoFormat?: VideoFormat
  /** The niche concept from swipe.md it rides, '' or absent when none. */
  concept?: string
  /** L.I.F.E.: its theme and how much of themselves it gives (shared/life.ts). */
  theme?: Theme
  level?: Level
  /** Its day in a series ("Briefly, me" day N), when it has one. */
  day?: number
  /** Lines written to land a motion card in the edit (1-based line of the script, card id, what it shows). */
  cards?: ScriptCard[]
  /** For this idea, best first: their beat templates, hook shapes and niche concepts, each with the reason. */
  ranked?: { templates: Ranked[]; hooks: Ranked[]; concepts: Ranked[] }
  /** What the viewer sees in the first second, under the text hook and the spoken hook. */
  firstFrame?: string
  /** AI phrases still in it after the writer's own rewrite, for the person to say their way. */
  slop?: string[]
}

export interface ScriptCard {
  line: number
  card: string
  text: string
}

export interface Ranked {
  name: string
  why: string
}

export interface IdeaOption {
  idea: string
  hook: string
}

/** What the generator writes from: the person's voice file and their video format. */
export interface ScriptSetup {
  voicePath: string | null
  voiceFound: boolean
  format: string
  /** What kind of video they make: scripts and new videos are made for it. */
  videoFormat: VideoFormat
  /** swipe.md beside the voice file has a Concepts section (niche research the writer builds on). */
  nicheFound: boolean
  /** framework.md beside the voice file: every script follows it. */
  frameworkFound?: boolean
  /** Every beat template (built-ins first, then theirs) and the one scripts are written in. */
  beatTemplates: BeatTemplate[]
  beatTemplate: string
}

/** One moment of a long video, in that take's own seconds. */
export interface ClipPick {
  start: number
  end: number
  title: string
  hookLine: string
  reason: string
  score: number
}

export interface RepurposeResult {
  carousel: { title: string; body: string }[]
  thread: string[]
  newsletter: { subject: string; body: string }
}

export interface PublishChannel {
  id: string
  name: string
  /** The platform, as Postiz names it: tiktok, instagram, youtube... */
  identifier: string
}

export interface PublishStatus {
  /** missing: the Postiz program is not installed. signed-out: it is, but it has no login.
   * no-subscription: logged in, but the Postiz account has no plan. */
  state: 'ready' | 'missing' | 'signed-out' | 'no-subscription'
  channels: PublishChannel[]
}

/** One scene of the edit: what is said, what pops up, and a still from the newest preview (a page URL, or null). */
export interface StoryboardScene {
  n: number
  t0: number
  t1: number
  text: string
  overlays: string[]
  still: string | null
}

export interface Storyboard {
  scenes: StoryboardScene[]
}

/** The edit handed to CapCut: the video without burned captions, and the captions as a file CapCut imports. */
export interface CapcutExport {
  folder: string
  video: string
  srt: string
}

/** The edit handed to OpenReel Video: an openreel-edit file (each cut a clip, pictures, subtitles) and the media
 * to import before it (engine openreel.py). */
export interface OpenReelExport {
  folder: string
  edit: string
  cuts: number
  pictures: number
  subtitles: number
}

export interface PublishResult {
  channels: string[]
  sentIds: string[]
  /** Set when some accounts got the post and the rest did not. */
  failed: string | null
}

/** One post rewritten for another platform. YouTube has a title; its caption is the description. */
export interface AdaptedPost {
  caption: string
  hashtags: string[]
  title?: string
}

export interface AdaptedPosts {
  /** The Instagram caption these were adapted from: when it changes, they are out of date. */
  from: string
  tiktok?: AdaptedPost
  youtube?: AdaptedPost
}

/** The colour every video is matched to, measured from one take the person liked. */
export interface HouseLook {
  /** The title of the video it was taken from. */
  from: string
}

export interface PublishRequest {
  caption: string
  channelIds: string[]
  /** 'draft' saves it in Postiz for review; an ISO date schedules a real post. */
  when: string
}

/** A generator offered by the OpenMontage bridge. */
export interface MakerTool {
  name: string
  provider: string
  capability: string
  /** USD for one run, or null when the tool does not say. */
  costUsd: number | null
}

export interface UserError {
  code: string
  userMessage: string
  /** A page that helps (e.g. the ChatGPT usage page). */
  link?: string
}

export interface ReelApi {
  app: {
    info(): Promise<AppInfo>
    finishFirstRun(): Promise<void>
    openFolder(path: string): Promise<void>
    copyText(text: string): Promise<void>
    /** A modal opened (true) or the last one closed: the OS-drawn strip behind the window buttons follows the scrim. */
    dimTitleBar(on: boolean): Promise<void>
    pathForFile(file: File): string
    chooseFolder(): Promise<string | null>
    setRoot(path: string): Promise<AppInfo>
    /** Menu items, keyboard shortcuts handled by the menu, and notification clicks. */
    onCommand(cb: (c: AppCommand) => void): () => void
    /** Drag a finished file out of the app (desktop, folder, browser upload box). Call from dragstart. */
    startDrag(file: string): void
  }
  model: {
    status(): Promise<ModelStatus>
    download(): Promise<ModelStatus>
    cancel(): Promise<void>
    onProgress(cb: (s: ModelStatus) => void): () => void
  }
  ai: {
    providers(): Promise<ProviderInfo[]>
    active(): Promise<ProviderInfo>
    setActive(id: ProviderInfo['id'], connectionId?: string): Promise<void>
    setClaudeKey(key: string | null): Promise<ProviderInfo>
    /** A fresh look at the person's own Claude Code app. */
    claudeCodeStatus(): Promise<ClaudeCodeInfo>
    /** Opens a terminal window where the person signs in to their Claude Code app themselves (the fallback when the
     * browser sign-in shows a code instead of coming back). */
    openClaudeSignIn(): Promise<void>
    connections(): Promise<ConnectionInfo[]>
    saveConnection(input: ConnectionInput): Promise<SaveConnectionResult>
    removeConnection(id: string): Promise<void>
    setConnectionImages(id: string, supportsImages: boolean): Promise<void>
    /** `suggested` is null when no listed model is one Matcha Momentum Generator knows: the person picks. */
    connectionModels(q: { kind: ConnectionKind; baseURL: string; key?: string; id?: string }): Promise<{ models: string[]; suggested: string | null; needsKey: boolean }>
    /** Returns unsubscribe. */
    onChange(cb: (p: ProviderInfo) => void): () => void
    /** A fresh look at a vendor's app, plus the step of a connect in progress. */
    vendorStatus(v: VendorId): Promise<VendorInfo>
    /** Installs the vendor's app if missing, starts its own sign-in in the browser, then makes it the AI editor.
     * Resolves when that ends (done, failed or cancelled); every step also arrives on onVendor. */
    vendorConnect(v: VendorId): Promise<VendorInfo>
    vendorCancel(v: VendorId): Promise<void>
    /** Restarts a waiting sign-in so the vendor's app opens a fresh page. */
    vendorSignInAgain(v: VendorId): Promise<void>
    onVendor(cb: (i: VendorInfo) => void): () => void
  }
  projects: {
    list(): Promise<ProjectSummary[]>
    get(slug: string): Promise<ProjectDetail>
    /** `scriptId`: a saved script this video was filmed from; it is copied into the project. */
    create(files: string[], scriptId?: string): Promise<{ slug: string; jobId: string; skipped: DropResult[] }>
    resume(slug: string): Promise<{ jobId: string }>
    /** jobId null = no AI connected: the note and a plain reply were added to the chat, nothing runs.
     * `attachments`: `work/assets/attach-*` refs from notes.attach* (main re-checks each one). */
    note(slug: string, text: string, attachments?: string[]): Promise<{ jobId: string | null }>
    update(slug: string, patch: Partial<ProjectJson>): Promise<ProjectDetail>
    /** `change`: what changed, in plain words ("bigger yellow subtitles"), for the chat and the version button.
     * `label`: what to call the work while it runs ("Updating your subtitles"). Render only, never the AI. */
    rerender(slug: string, change?: string, label?: string): Promise<{ jobId: string }>
    /** Changes the frame to a format's (vertical 1080x1920, horizontal 1920x1080); call rerender after. */
    setFormat(slug: string, format: VideoFormat): Promise<ProjectDetail>
    exportVersion(slug: string, version: number): Promise<ExportResult>
    /** The current edit for CapCut: a clean video and captions.srt in Library > Exports, shown in Finder. */
    capcut(slug: string): Promise<CapcutExport>
    /** The current edit for OpenReel Video, in Library > Exports, shown in Finder. */
    openreel(slug: string): Promise<OpenReelExport>
    remove(slug: string): Promise<void>
  }
  /** Pictures, GIFs and short clips on a note (0.1.2). Each call copies the files into the project. */
  notes: {
    attachFiles(slug: string, paths: string[]): Promise<AttachResult>
    /** a pasted or dropped file with no path on disk (a screenshot, a picture copied from a browser) */
    attachData(slug: string, file: { name: string; mime: string; bytes: Uint8Array }): Promise<AttachResult>
    /** the picture on the system clipboard (a paste that had an image but no file the page could read) */
    attachClipboard(slug: string): Promise<AttachResult>
    /** the file picker; an empty result = cancelled */
    choose(slug: string): Promise<AttachResult>
    /** removes an attached file that is not in the video */
    remove(slug: string, asset: string): Promise<void>
  }
  jobs: {
    cancel(jobId: string): Promise<void>
    onEvent(cb: (e: JobEvent) => void): () => void
  }
  phone: {
    /** Start (or restart, e.g. on another network) the link for one exported video. */
    start(video: string, caption: string, address?: string): Promise<PhoneShare>
    stop(): Promise<void>
    onEvent(cb: (e: PhoneEvent) => void): () => void
    /** Open a new email to yourself and show the video in Finder/Explorer to attach it. */
    emailSelf(video: string): Promise<void>
    /** macOS: the Share menu (AirDrop, Messages). Elsewhere: show the file. */
    shareSheet(video: string): Promise<void>
  }
  library: {
    list(): Promise<LibraryBin[]>
    add(paths: string[]): Promise<DropResult[]>
    /** Open the system file picker for songs or pictures and add the picked files. [] = cancelled. */
    choose(kind: 'music' | 'images'): Promise<DropResult[]>
  }
  style: {
    rules(): Promise<StyleRule[]>
    /** A rule typed on the My style page (an equivalent rule already there is returned instead). */
    add(text: string): Promise<StyleRule>
    /** New wording for a rule; refused when another rule already says it. */
    update(id: string, text: string): Promise<StyleRule>
    remove(id: string): Promise<void>
    /** Answer "Remember this for next time?" on a chat message: Yes saves the rule, No only says so. */
    answer(slug: string, messageId: string, yes: boolean): Promise<void>
  }
  script: {
    /** Writes and saves it. */
    write(idea: string): Promise<SavedScript>
    list(): Promise<SavedScript[]>
    remove(id: string): Promise<void>
    update(id: string, patch: { hook?: string; script?: string; theme?: Theme; level?: Level }): Promise<SavedScript>
    /** Ideas from the voice file, skipping topics already saved. */
    ideas(): Promise<IdeaOption[]>
    setup(): Promise<ScriptSetup>
    /** The file picker for the voice file; null = cancelled. */
    chooseVoice(): Promise<ScriptSetup | null>
    setFormat(format: string): Promise<ScriptSetup>
    setVideoFormat(format: VideoFormat): Promise<ScriptSetup>
    /** Scripts are written in this beat template from now on. */
    setBeatTemplate(id: string): Promise<ScriptSetup>
    /** Saves one of theirs: an id of theirs updates it, no id makes a new one. It becomes the active one. */
    saveBeatTemplate(t: { id?: string; name: string; beats: string; hint?: string }): Promise<ScriptSetup>
    removeBeatTemplate(id: string): Promise<ScriptSetup>
  }
  clips: {
    /** The AI's best moments of this video. */
    pick(slug: string): Promise<ClipPick[]>
    /** Cuts each moment into a new video and starts editing them, one after another. */
    make(slug: string, picks: ClipPick[]): Promise<{ slugs: string[] }>
  }
  repurpose: {
    /** What was made before, or null. */
    load(slug: string): Promise<RepurposeResult | null>
    make(slug: string): Promise<RepurposeResult>
  }
  post: {
    /** Rewrites the video's Instagram post for TikTok and YouTube (AI), saved with the project. */
    adapt(slug: string): Promise<AdaptedPosts>
  }
  /** The filter and subtitle style every new video starts with (Settings > Your look). */
  look: {
    default(): Promise<DefaultLook>
    /** Saves it, cleaned to known filters and subtitle fields; returns what was saved. */
    setDefault(look: DefaultLook): Promise<DefaultLook>
    /** Puts the default on every video (used at its next version); videos being worked on are skipped. */
    applyAll(): Promise<{ updated: number; skipped: string[] }>
    templates(): Promise<LookTemplate[]>
    /** Saves under a name; a name that exists (any case) is replaced. */
    saveTemplate(t: { name: string; look: DefaultLook }): Promise<LookTemplate>
    removeTemplate(id: string): Promise<void>
    /** Makes a template the default look for new videos; returns that look. */
    useTemplate(id: string): Promise<DefaultLook>
    /** The house look every video's colour is matched to (Library/house-look.json), or null. */
    house(): Promise<HouseLook | null>
    /** Makes this video's take the house look. Other videos match it at their next version. */
    setHouse(slug: string): Promise<HouseLook>
    clearHouse(): Promise<void>
  }
  /** Scenes to approve before the full-quality render. */
  /** The Brands tab: the brand profiles in the brands folder (main/brands.ts). */
  brands: {
    list(): Promise<BrandList>
    /** Writes the edits into the file opened as `base`. Fails with BRAND_CHANGED if it changed on disk since. */
    save(id: string, base: string, edits: BrandEdit[]): Promise<BrandDoc>
    /** Shows the brand's file in Finder (or the folder, for an unknown id). */
    reveal(id: string): Promise<void>
    /** The brand new scripts and videos are made for (its voice, look and My style rules), or null. */
    active(): Promise<string | null>
    setActive(id: string | null): Promise<void>
  }
  /** The Carousels page: <root>/Carousels, slides exported to PNG (main/carousels.ts). */
  carousels: {
    list(): Promise<Carousel[]>
    /** A new carousel for the brand in use, starting in its style, handle and kit. */
    create(title: string): Promise<Carousel>
    save(c: Carousel): Promise<Carousel>
    /** The AI writes the slides' words (illustrations stay) for the carousel's brand, saves, and returns it. */
    draft(id: string, topic: string, slides: number): Promise<Carousel>
    remove(id: string): Promise<void>
    /** Fonts, logo and art for this carousel's slides, as data: URLs. */
    assets(id: string): Promise<CarouselAssets>
    /** Draws every slide to <carousel>/slides/NN.png. */
    export(id: string): Promise<{ folder: string; files: string[] }>
    reveal(id: string): Promise<void>
  }
  /** The Stories page: faceless shorts, one motion-graphics scene per line over a voiceover (docs/stories-contract.md). */
  stories: {
    list(): Promise<Story[]>
    /** A new story for the brand in use, starting in its palette and handle. */
    create(title: string): Promise<Story>
    save(s: Story): Promise<Story>
    remove(id: string): Promise<void>
    /** The AI writes every line and picks its scene, for the story's own brand; saves and returns it. */
    draft(id: string, topic: string, lines: number): Promise<Story>
    /** Fonts, logo, art and the Library images its scenes use, as data: URLs. */
    assets(id: string): Promise<StoryAssets>
    /** The voice's word timing, or null before a voice exists. */
    timing(id: string): Promise<StoryTiming | null>
    /** The voiceover as a reel-media: URL for the preview player, or null. */
    audioUrl(id: string): Promise<string | null>
    /** Whether Kokoro (the free voice) is on this computer. */
    voiceModel(): Promise<VoiceModelStatus>
    /** Downloads (or resumes) the Kokoro model, reporting on onProgress with id ''. */
    downloadVoiceModel(): Promise<VoiceModelStatus>
    voices(): Promise<StoryVoiceOption[]>
    /** Says every line with Kokoro and times every word (a job: onProgress). */
    makeVoice(id: string): Promise<StoryTiming>
    /** Their own recording: a file dialog, then the lines found in it and timed. null when the dialog is cancelled. */
    useRecording(id: string): Promise<StoryTiming | null>
    /** Draws every frame and adds the voice: renders/<id>.mp4 (a job: onProgress). */
    export(id: string): Promise<{ file: string }>
    reveal(id: string): Promise<void>
    onProgress(cb: (p: StoryProgress) => void): () => void
  }
  /** The Studio tab: OpenReel's web editor drawn over the page's area (main/studio.ts). */
  studio: {
    /** Shows the editor over this area of the window (CSS pixels from the top-left). */
    show(bounds: { x: number; y: number; width: number; height: number }): Promise<void>
    hide(): Promise<void>
    reload(): Promise<void>
    openInBrowser(): Promise<void>
    /** The "for OpenReel" folders in Library > Exports, newest first. */
    exports(): Promise<{ name: string; path: string; at: string }[]>
  }
  /** How each posted video did, typed by the person, and what that says about their hooks. */
  results: {
    get(slug: string): Promise<VideoResult>
    /** Saves it (cleaned) and refreshes "My outliers" in swipe.md once there is enough to say. */
    set(slug: string, result: VideoResult): Promise<VideoResult>
    insights(): Promise<Insights>
  }
  storyboard: {
    get(slug: string): Promise<Storyboard>
    /** "Show me a storyboard first": the first edit and notes stop at a preview until approved. */
    enabled(): Promise<boolean>
    setEnabled(on: boolean): Promise<boolean>
  }
  /** The screens that make the background visible: what's performing, the content engine, system health. */
  overview: {
    performance(): Promise<PerformanceView>
    engine(): Promise<EngineView>
    health(): Promise<HealthView>
  }
  /** Study reels: other creators' videos downloaded, measured and broken down (main/study.ts). */
  study: {
    list(): Promise<StudyList>
    get(id: string): Promise<StudyReelDetail | null>
    /** Pasted links and @handles; returns the new list. */
    add(text: string, opts: StudyAddOptions): Promise<StudyList>
    retry(id: string): Promise<StudyList>
    remove(id: string): Promise<StudyList>
    /** Adds its formula to the Concepts in swipe.md, so the script writer can build on it. */
    toConcept(id: string): Promise<boolean>
    /** Adds its formula to your beat templates. */
    toTemplate(id: string): Promise<boolean>
    /** Writes the whole study to video-agent/research; returns the file. */
    toResearch(id: string): Promise<string>
    /** Opens the original video in the browser. */
    open(url: string): Promise<boolean>
    onChanged(cb: (list: StudyList) => void): () => void
  }
  /** How it was made: one video's edit on its own timeline, the AI's steps and the checks. */
  howMade: {
    get(slug: string): Promise<HowMade>
  }
  /** How the app looks: 'dark' (the edit bay, default), 'light' (daylight) or 'system'. */
  theme: {
    get(): Promise<'dark' | 'light' | 'system'>
    set(theme: 'dark' | 'light' | 'system'): Promise<'dark' | 'light' | 'system'>
  }
  /** Settings > Motion cards: the AI adds animated cards on numbers, lists, strong lines and typing on its own. */
  motion: {
    enabled(): Promise<boolean>
    setEnabled(on: boolean): Promise<boolean>
  }
  /** Generated clips and pictures, when the OpenMontage bridge is set up. */
  maker: {
    tools(): Promise<{ installed: boolean; tools: MakerTool[] }>
    /** Makes it and adds it to the Library. Spends money on paid tools, so `agreedCostUsd` is what the person accepted. */
    make(req: { tool: string; prompt: string; agreedCostUsd: number | null }): Promise<DropResult[]>
  }
  publish: {
    status(): Promise<PublishStatus>
    send(slug: string, req: PublishRequest): Promise<PublishResult>
  }
  dev: {
    /** Test builds only. `template` defaults to the bundled self-test template. */
    renderTestAnimation(outPath: string, fullSize?: boolean, template?: string, params?: Record<string, unknown>): Promise<string>
  }
  /** "Update available" notice (main/update-check.ts). Tells, never installs. */
  update: {
    status(): Promise<UpdateStatus>
    /** Settings > "Check for updates". Turning it on checks at once (still at most once a day). */
    setEnabled(on: boolean): Promise<UpdateStatus>
    /** Open the download page in the browser. Main opens only pages on the update server's site (update-check.ts). */
    open(url: string): Promise<void>
    /** "Not now": hide it until a newer version comes out, or until tomorrow. */
    dismiss(version: string): Promise<void>
    /** A notice to show, or null to hide it (checks switched off). */
    onChange(cb: (n: UpdateNotice | null) => void): () => void
  }
}

/** A newer Matcha Momentum Generator is out. `url` is its download page on the update server's site. */
export interface UpdateNotice {
  version: string
  url: string
}

export interface UpdateStatus {
  enabled: boolean
  /** What to show now; null = nothing (up to date, not checked yet, off, or "Not now"). */
  notice: UpdateNotice | null
}

/** One line of a project's edit trace (work/trace.jsonl): a job starting, an AI step, or the AI's reasoning. */
export type TraceEntry =
  | { type: 'job'; at: string; kind: string; note?: string }
  | { type: 'step'; at: string; name: string; args: Record<string, unknown>; ok: boolean; summary?: string; error?: string }
  | { type: 'thought'; at: string; text: string }

/** "How it was made" (main/how-made.ts): one video's edit on its own timeline, in seconds of the finished video. */
export interface HowMadeCard {
  id: string
  t0: number
  t1: number
  kind: 'picture' | 'animation' | 'text'
  treatment: string
  label: string
  /** drawn behind the speaker */
  behind: boolean
}
export interface HowMadeCheck {
  name: string
  ok: boolean
  warn: boolean
  detail: string
}
export interface HowMade {
  /** the version the lanes show (null = the preview) */
  version: number | null
  /** the render left no timing, so the cut and words were rebuilt from the kept takes: close, not exact */
  estimated: boolean
  duration: number
  lanes: {
    cut: { t0: number; t1: number; source: string; from: number; to: number }[]
    words: { t0: number; t1: number; text: string; key: boolean }[]
    cards: HowMadeCard[]
    zooms: { t0: number; t1: number; scale: number }[]
  }
  sound: { effects: boolean; music: { track: string; level: string } | null }
  look: { editStyle: string | null; filter: string }
  checks: HowMadeCheck[]
  /** what the editor wrote about this version */
  summary: string
  stats: { keptSeconds: number; sourceSeconds: number | null; cuts: number; keyWords: number }
  /** the AI's steps and reasoning, per job (the first edit, then each note) */
  jobs: { kind: string; at: string; note?: string; entries: Exclude<TraceEntry, { type: 'job' }>[] }[]
}
