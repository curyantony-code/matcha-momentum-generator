// Study reels: what the person pastes (video links, profile links, @handles), read into things to study, and the
// shapes the Study screen shows. The engine downloads and measures (reelengine study-*), the AI breaks each video down.

/** Mirror of ai/src/study.ts ReelStudy (the app loads the AI package at run time; test/study.test.ts keeps them in step). */
export interface ReelStudy {
  summary: string
  script: {
    hook: { text: string; at: number; shape: string; why: string }
    beats: { at: number; role: string; said: string; note: string }[]
    rehook: { at: number; text: string } | null
    payoff: string
    cta: { text: string; kind: string }
    loop: { loops: boolean; how: string }
  }
  formula: { name: string; steps: string[]; hookShape: string; closestTemplate: { name: string; fit: 'close' | 'partial' | 'none'; diff: string }; concept: string }
  edit: { pace: string; captions: string; onScreen: string; broll: string; camera: string; zooms: string; sound: string; look: string; muted: string }
  why: string[]
  borrow: string[]
  avoid: string[]
  tryThis: { idea: string; hook: string }
}

/** Mirror of ai/src/study.ts CreatorPatterns. */
export interface CreatorPatterns {
  signature: string
  hooks: string
  structure: string
  edit: string
  length: string
  topics: string
  best: { url: string; why: string }[]
  borrow: string[]
}

/** What the engine's study-fetch writes (source.json). */
export interface StudySource {
  url: string
  platform: Platform
  id: string
  creator: string
  creatorUrl: string | null
  title: string
  caption: string
  views: number | null
  likes: number | null
  comments: number | null
  durationSec: number
  uploadedAt: string | null
  video: string
}

/** What the engine's study-measure writes (measure.json). */
export interface StudyMeasure {
  durationSec: number
  cuts: number[]
  cutsPerMin: number
  avgShotSec: number
  words: { w: string; s: number; e: number }[]
  wordCount: number
  wpm: number
  firstWordAt: number | null
  speechRatio: number
  musicLikely: boolean
  frames: { file: string; at: number }[]
  language: string | null
}
export type Platform = 'instagram' | 'tiktok' | 'youtube'
export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
]
export const BROWSERS = ['chrome', 'safari', 'firefox', 'edge', 'brave'] as const
export type Browser = (typeof BROWSERS)[number]

/** One line of what was pasted, understood. */
export type Wanted =
  | { kind: 'video'; url: string; platform: Platform }
  | { kind: 'creator'; url: string; platform: Platform; handle: string }
  | { kind: 'unknown'; text: string; why: string }

export const MAX_PASTE = 40
export const DEFAULT_PER_CREATOR = 5
export const MAX_PER_CREATOR = 10

const HANDLE = /^@?([A-Za-z0-9._-]{2,40})$/

function asUrl(text: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null
  } catch {
    return null
  }
}

/** A profile link for a handle on a platform. */
export function profileUrl(platform: Platform, handle: string): string {
  if (platform === 'tiktok') return `https://www.tiktok.com/@${handle}`
  if (platform === 'youtube') return `https://www.youtube.com/@${handle}`
  return `https://www.instagram.com/${handle}/`
}

/** One pasted line: a video, a creator, or what is wrong with it. `handles`: the platform for a bare @handle. */
export function readLine(raw: string, handles: Platform): Wanted | null {
  const text = raw.trim().replace(/^[-*•]\s*/, '')
  if (!text) return null
  // a handle needs its "@" (dots allowed), so a stray word is never taken for a creator
  const h = text.startsWith('@') ? HANDLE.exec(text) : null
  if (h) return { kind: 'creator', platform: handles, handle: h[1]!, url: profileUrl(handles, h[1]!) }
  const u = asUrl(text)
  if (!u) return { kind: 'unknown', text, why: 'Not a link or an @handle' }
  const host = u.hostname.replace(/^(www|m|vm|vt)\./, '')
  const parts = u.pathname.split('/').filter(Boolean)
  const clean = `${u.protocol}//${u.hostname}${u.pathname}`
  if (host === 'instagram.com') {
    if (['reel', 'reels', 'p', 'tv'].includes(parts[0] ?? '') && parts[1]) return { kind: 'video', platform: 'instagram', url: clean }
    if (parts.length === 1 && HANDLE.test(parts[0]!)) return { kind: 'creator', platform: 'instagram', handle: parts[0]!, url: profileUrl('instagram', parts[0]!) }
  }
  if (host === 'tiktok.com') {
    if (parts[1] === 'video' && parts[2]) return { kind: 'video', platform: 'tiktok', url: clean }
    if (u.hostname.startsWith('vm.') || u.hostname.startsWith('vt.') || parts[0] === 't') return { kind: 'video', platform: 'tiktok', url: clean }
    if (parts.length === 1 && parts[0]!.startsWith('@')) return { kind: 'creator', platform: 'tiktok', handle: parts[0]!.slice(1), url: profileUrl('tiktok', parts[0]!.slice(1)) }
  }
  if (host === 'youtube.com' || host === 'youtu.be') {
    if (host === 'youtu.be' && parts[0]) return { kind: 'video', platform: 'youtube', url: `https://youtu.be/${parts[0]}` }
    if (parts[0] === 'shorts' && parts[1]) return { kind: 'video', platform: 'youtube', url: `https://www.youtube.com/shorts/${parts[1]}` }
    if (parts[0] === 'watch' && u.searchParams.get('v')) return { kind: 'video', platform: 'youtube', url: `https://www.youtube.com/watch?v=${u.searchParams.get('v')}` }
    if (parts[0]?.startsWith('@')) return { kind: 'creator', platform: 'youtube', handle: parts[0].slice(1), url: profileUrl('youtube', parts[0].slice(1)) }
  }
  return { kind: 'unknown', text, why: 'Only Instagram, TikTok and YouTube links work here' }
}

/** Everything pasted, one per line (or separated by spaces or commas), without repeats. */
export function readPaste(text: string, handles: Platform): Wanted[] {
  const seen = new Set<string>()
  const out: Wanted[] = []
  for (const piece of text.split(/[\n,\s]+/)) {
    const w = readLine(piece, handles)
    if (!w) continue
    const key = w.kind === 'unknown' ? `?${w.text}` : w.url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
    if (out.length >= MAX_PASTE) break
  }
  return out
}

export type StudyStatus = 'queued' | 'fetching' | 'measuring' | 'studying' | 'done' | 'failed'

export const STATUS_LABEL: Record<StudyStatus, string> = {
  queued: 'Waiting',
  fetching: 'Downloading',
  measuring: 'Listening and measuring the edit',
  studying: 'Breaking it down',
  done: 'Done',
  failed: 'Did not work',
}

/** A studied (or waiting) video, as listed. */
export interface StudyReelSummary {
  id: string
  url: string
  platform: Platform
  creator: string
  addedAt: string
  status: StudyStatus
  pct: number
  error: string | null
  /** The engine's code when it failed (LOGIN_NEEDED: offer the browser login). */
  errorCode: string | null
  title: string
  views: number | null
  /** Views against the creator's usual, when known. */
  vsUsual: number | null
  durationSec: number | null
  /** The first frame, to show. */
  poster: string | null
  formula: string | null
  hook: string | null
  creatorKey: string | null
}

export interface StudyCreatorSummary {
  key: string
  platform: Platform
  handle: string
  url: string
  addedAt: string
  status: 'listing' | 'studying' | 'done' | 'failed'
  error: string | null
  errorCode: string | null
  reels: string[]
  medianViews: number | null
  patterns: CreatorPatterns | null
}

export interface StudyList {
  reels: StudyReelSummary[]
  creators: StudyCreatorSummary[]
}

/** Everything about one studied video, for its page. */
export interface StudyReelDetail extends StudyReelSummary {
  caption: string
  video: string | null
  likes: number | null
  comments: number | null
  measure: {
    durationSec: number
    cuts: number[]
    cutsPerMin: number
    avgShotSec: number
    wpm: number
    firstWordAt: number | null
    speechRatio: number
    musicLikely: boolean
    words: { w: string; s: number; e: number }[]
    frames: { url: string; at: number }[]
  } | null
  study: ReelStudy | null
  /** What has already been done with it. */
  saved: { concept: boolean; template: boolean; research: string | null }
}

export interface StudyAddOptions {
  /** The platform for a bare @handle. */
  handles: Platform
  /** How many videos to study per creator. */
  perCreator: number
  /** Read this browser's Instagram login, when the person turned it on. */
  browser: Browser | null
}

/** A user-facing line for each engine failure code. */
export function studyErrorText(code: string | null, fallback: string): string {
  switch (code) {
    case 'LOGIN_NEEDED':
      return 'Instagram wants a login for this one. Turn on "Use my browser\'s Instagram login" and try again.'
    case 'LIST_FAILED':
      return 'This profile could not be listed right now (TikTok often blocks it). Paste links to their videos instead.'
    case 'TOO_LONG':
      return 'This video is over 10 minutes. Study reels is made for short videos.'
    case 'UNAVAILABLE':
      return 'This video is private, removed or not available where you are.'
    case 'RATE_LIMITED':
      return 'The site is limiting downloads right now. Wait a few minutes, then Try again.'
    case 'NETWORK':
      return 'The download did not get through. Check your internet, then try again.'
    case 'MODEL_MISSING':
      return 'The listening model is not downloaded yet. Open System health to get it.'
    case 'COOKIES_UNREADABLE':
      return 'Your browser\'s login could not be read. Close the browser fully, or pick another one.'
    case 'BAD_URL':
      return 'That link is not an Instagram, TikTok or YouTube video.'
    default:
      return fallback
  }
}
