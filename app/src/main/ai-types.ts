// Mirror of the @reelstudio/ai interface (docs/architecture.md section 8). The real package is loaded at
// runtime when it exists; until then ai-mock.ts implements the same shape.
import type { ClipPick, IdeaOption, JobUpdate, RepurposeResult, SavedScript } from '../shared/api'

/** The person's voice file text and video format, given to the script generator. */
import type { CarouselDraft } from '../shared/carousel'
import type { EditBrief } from '../shared/brand-use'
import type { StoryLine } from '../shared/story'
import type { CreatorPatterns, ReelStudy, StudyMeasure, StudySource } from '../shared/study'

export interface ScriptContext {
  voice?: string
  format?: string
  /** What their own posted videos say works (shared/results.ts promptText); '' until there is enough. */
  results?: string
  /** Vertical short, horizontal short or long-form (shared/formats.ts). */
  videoFormat?: string
  /** The person's swipe.md: its Concepts section is the niche research the writer builds on. */
  swipe?: string
  /** framework.md and brand.md beside the voice file: how every reel is built, and what they stand for. */
  framework?: string
  brand?: string
  /** Every beat template (built-in and theirs), and the name of the one they picked. */
  templates?: { name: string; beats: string[] }[]
  activeTemplate?: string
  /** rankings.md beside the voice file: hooks, templates, concepts and motion cards ranked by traction online. */
  ranking?: string
  /** Who is talking: a person (a creator, like Alex) or a company brand (like Nike) (ai/src/speaker.ts). */
  speaker?: 'person' | 'company'
}

/** What the carousel writer reads: the script writer's context for the carousel's own brand, plus that brand's My
 * style rules as text and how many slides to aim for. */
export type CarouselContext = ScriptContext & { styleRules?: string; slides?: number }

/** What the story writer reads: the carousel context plus how many lines to aim for (10 to 16) and which asset kinds exist. */
export type StoryContext = CarouselContext & { lines?: number; hasImages?: boolean; hasArt?: boolean }

/** The story writer's reply: the lines with their scenes, a caption and hashtags (the Story minus its ids and dates). */
export interface StoryDraft {
  title: string
  lines: StoryLine[]
  caption: string
  hashtags: string[]
}

/** What @reelstudio/ai emits: the job contract minus `heard` (main adds that one itself). */
export type AgentEvent = Exclude<JobUpdate, { type: 'heard' }>

export interface UserFacingError {
  code: string
  userMessage: string
  link?: string
}

export interface AgentResult {
  summary: string
  version: number
  styleRulesAdded: string[]
  changed: string[]
  /** Rules the AI PROPOSES for My style, not saved (stream quality2). The app asks before saving. */
  styleSuggestions?: string[]
  /** Set when the AI stopped early and a simpler edit was made instead. */
  notice?: UserFacingError
}

export interface ScriptResult {
  hook: string
  script: string
  onScreenText: string[]
}

export interface EngineHost {
  runEngine(
    command: string,
    args: string[],
    onProgress?: (p: { stage: string; pct: number; message: string }) => void,
    signal?: AbortSignal
  ): Promise<any>
  renderAnimation(template: string, params: Record<string, unknown>, outPath: string): Promise<string>
  reelStudioRoot(): string
  captureWebsite?(
    url: string,
    outPath: string,
    opts?: { layout?: 'phone' | 'desktop' }
  ): Promise<{ path: string; url: string; site: string; title: string; width: number; height: number }>
}

export interface ProviderStatus {
  id: 'claude' | 'codex-cli' | 'claude-cli' | 'custom' | 'replay' | 'none'
  connected: boolean
  label: string
  detail?: string
  error?: UserFacingError
  connectionId?: string
}

export interface ConnectionInfo {
  id: string
  label: string
  kind: 'anthropic' | 'openai'
  baseURL: string
  model: string
  supportsImages: boolean
  hasKey: boolean
  active: boolean
}

export interface ConnectionInput {
  id?: string
  label: string
  kind: 'anthropic' | 'openai'
  baseURL: string
  model: string
  /** empty keeps the stored key when editing */
  key?: string
}

export interface SaveConnectionResult {
  status: ProviderStatus
  connection?: ConnectionInfo
  error?: UserFacingError & { field?: 'label' | 'address' | 'key' | 'model' }
}

/** Mirrors Electron's safeStorage. */
export interface SecretStore {
  isEncryptionAvailable(): boolean
  encryptString(s: string): Buffer
  decryptString(b: Buffer): string
  getSelectedStorageBackend?(): string
}

export interface AI {
  providers(): Promise<ProviderStatus[]>
  active(): Promise<ProviderStatus>
  setActive(id: ProviderStatus['id'], connectionId?: string): Promise<void>
  setClaudeKey(key: string | null): Promise<ProviderStatus>
  /** `opts.finalRender: false` stops at a preview, for a storyboard to approve first. */
  /** `brief`: the person's sign-off and ask from their brand profile (shared/brand-use.ts editBrief), kept at the end. */
  firstEdit(projectDir: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal, opts?: { finalRender?: boolean; brief?: EditBrief }): Promise<AgentResult>
  /** `opts.attachments`: `work/assets/attach-*` refs main already checked (the AI checks them again). */
  applyNote(
    projectDir: string,
    note: string,
    onEvent: (e: AgentEvent) => void,
    signal?: AbortSignal,
    opts?: { attachments?: string[]; finalRender?: boolean }
  ): Promise<AgentResult>
  /** Someone else's video broken down (ai/src/study.ts); frames only reach an AI that can see pictures. */
  studyReel(
    src: StudySource,
    m: StudyMeasure,
    frames: { at: number; mime: string; base64: string }[],
    ctx: { templates: { name: string; beats: string }[]; hookShapes: string[]; about: string; medianViews: number | null },
    signal?: AbortSignal
  ): Promise<ReelStudy>
  /** What one creator's studied videos have in common. */
  studyCreator(
    creator: string,
    reels: { url: string; views: number | null; study: ReelStudy; measure: StudyMeasure }[],
    signal?: AbortSignal
  ): Promise<CreatorPatterns>
  writeScript(idea: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal, ctx?: ScriptContext): Promise<ScriptResult & Partial<Pick<SavedScript, 'hookFormula' | 'hooks' | 'seconds' | 'videoFormat' | 'concept' | 'theme' | 'level' | 'cards' | 'ranked' | 'firstFrame' | 'slop'>>>
  /** Optional: older packages and the mock lack it. */
  suggestIdeas?(onEvent: (e: AgentEvent) => void, signal?: AbortSignal, ctx?: ScriptContext & { avoid?: string[] }): Promise<IdeaOption[]>
  /** Optional: older packages and the mock lack them. */
  pickClips?(projectDir: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<ClipPick[]>
  repurpose?(projectDir: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<RepurposeResult>
  /** The Instagram post rewritten for TikTok and YouTube, saved in the project as post.adapted. */
  adaptPost?(projectDir: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal): Promise<unknown>
  /** The words of a carousel on `topic` (5 to 7 slides, caption, hashtags) in the brand's voice. Older AI packages lack it. */
  draftCarousel?(topic: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal, ctx?: CarouselContext): Promise<CarouselDraft>
  /** The lines of a faceless story short on `topic` (10 to 16, each with its scene), caption, hashtags. Older AI packages lack it. */
  draftStory?(topic: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal, ctx?: StoryContext): Promise<StoryDraft>
  styleRules(): Promise<{ id: string; text: string; createdAt: string }[]>
  removeStyleRule(id: string): Promise<void>
  /** Saves one My style rule (after the user said Yes). Optional: older packages lack it. */
  addStyleRule?(text: string): Promise<{ id: string; text: string; createdAt: string }>
  /** New wording for one rule. updated=false: another rule already says that (it is returned). null: gone. */
  updateStyleRule?(id: string, text: string): Promise<{ updated: boolean; rule: { id: string; text: string; createdAt: string } } | null>
  /** A fresh look at the person's own Claude Code app (`bin` stays in main). Optional: older packages lack it. */
  claudeCodeStatus?(): Promise<ClaudeCodeStatus>
  /** The person's own servers (provider 'custom'). Optional: older packages and the mock lack them. */
  connections?(): Promise<ConnectionInfo[]>
  saveConnection?(input: ConnectionInput): Promise<SaveConnectionResult>
  removeConnection?(id: string): Promise<void>
  setConnectionImages?(id: string, supportsImages: boolean): Promise<void>
  connectionModels?(q: { kind: ConnectionInfo['kind']; baseURL: string; key?: string; id?: string }): Promise<{ models: string[]; suggested: string | null; needsKey: boolean }>
  /** A fresh look at the person's own Codex app (`bin` stays in main). */
  codexStatus?(): Promise<ClaudeCodeStatus & { chatgptMoved?: boolean }>
  /** Once at start-up: signs out a saved "Sign in with ChatGPT" session (retired) and clears it as the choice. */
  retireSignInWithChatGPT?(): Promise<boolean>
  /** Mock only: the sign-in window "opened" (tests flip the mock's state instead of opening a terminal). */
  mockClaudeSignInOpened?(): void
  /** Mock only: how REELSTUDIO_MOCK_CLAUDE / REELSTUDIO_MOCK_CODEX play an install and a browser sign-in. */
  mockVendor?: MockVendor
}

/** Mock only (ai-mock.ts): plays install and sign-in for the Connect cards without a real CLI. */
export interface MockVendor {
  install(v: 'claude' | 'chatgpt', signal: AbortSignal): Promise<void>
  login(v: 'claude' | 'chatgpt', signal: AbortSignal): Promise<{ code: number | null; portBusy?: boolean; aborted?: boolean }>
}

export interface ClaudeCodeStatus {
  state: 'missing' | 'broken' | 'signed_out' | 'ready'
  bin?: string
  version?: string
  plan?: string
  reason?: string
}

export interface CreateAIOptions {
  host: EngineHost
  settingsDir: string
  dev?: boolean
  secretStore?: SecretStore
  /** the environment the person's own CLIs get (main's test switch can swap in a throwaway home) */
  cliEnv?: () => NodeJS.ProcessEnv
  /** The My style rules file to use, read on every call: one per brand (shared/brand-use.ts styleFileName). */
  styleFile?: () => string | undefined
}

export type CreateAI = (opts: CreateAIOptions) => AI
