// What kind of video it is: a vertical short (Reels, TikTok, Shorts), a horizontal short or a long-form video.
// The rules each format gets live in ai/src/formats.ts (given to the script writer and the editor); this side has
// the picker, the frame size a new video is made at, and the checklist shown under a script as it is rewritten.
// Keys, labels, sizes and length windows match ai/src/formats.ts (test/formats.test.ts).

export type VideoFormat = 'short-vertical' | 'short-horizontal' | 'long'

export interface FormatOption {
  key: VideoFormat
  label: string
  hint: string
  width: number
  height: number
  /** Spoken length window of a script, in seconds. */
  seconds: readonly [number, number]
}

export const FORMAT_OPTIONS: readonly FormatOption[] = [
  { key: 'short-vertical', label: 'Short, vertical', hint: 'Reels, TikTok and Shorts: 9:16, 20 to 60 s, the fastest cuts', width: 1080, height: 1920, seconds: [20, 60] },
  { key: 'short-horizontal', label: 'Short, horizontal', hint: 'YouTube, LinkedIn and X feeds: 16:9, 30 to 90 s, plays muted', width: 1920, height: 1080, seconds: [30, 90] },
  { key: 'long', label: 'Long-form', hint: 'YouTube: 16:9, 3 to 20 minutes, in chapters', width: 1920, height: 1080, seconds: [180, 1200] }
]

export const DEFAULT_FORMAT: VideoFormat = 'short-vertical'
export const isFormat = (v: unknown): v is VideoFormat => FORMAT_OPTIONS.some((f) => f.key === v)
export const formatOf = (v: unknown): VideoFormat => (isFormat(v) ? v : DEFAULT_FORMAT)
export const formatOption = (v: unknown): FormatOption => FORMAT_OPTIONS.find((f) => f.key === formatOf(v)) ?? FORMAT_OPTIONS[0]

/** The format a project is, from project.format: its kind when set, else its shape (wide = horizontal short). */
export function projectFormat(fmt: { kind?: unknown; width?: unknown; height?: unknown } | null | undefined): VideoFormat {
  if (isFormat(fmt?.kind)) return fmt.kind
  return typeof fmt?.width === 'number' && typeof fmt?.height === 'number' && fmt.width > fmt.height ? 'short-horizontal' : 'short-vertical'
}

/** project.format for a format, keeping the frame rate. */
export function frameFor(f: VideoFormat, fps = 30): { width: number; height: number; fps: number; kind: VideoFormat } {
  const o = formatOption(f)
  return { width: o.width, height: o.height, fps, kind: o.key }
}

/** Whether a take is taller than wide once turned upright (a phone held upright). */
export function isPortraitTake(src: { width?: number; height?: number; rotation?: number }): boolean {
  const turned = ((src.rotation ?? 0) % 180 + 180) % 180 === 90
  const w = turned ? src.height : src.width
  const h = turned ? src.width : src.height
  return typeof w === 'number' && typeof h === 'number' && h > w
}

/** One line of the checklist under a script. */
export interface ScriptCheck {
  key: string
  label: string
  ok: boolean
  hint: string
}

export interface CheckedScript {
  hook: string
  script: string
  onScreenText: readonly string[]
  /** Spoken length at the person's pace. */
  seconds: number
}

const MAX_HOOK_WORDS = 12
const MAX_SCREEN_HOOK_WORDS = 6
const COLD_OPEN = /^(hey|hi|hello|so\b|today\b|in this video|welcome|what'?s up|my name)/i
const SPECIFIC =
  /\d|\[[^\]]+\]|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|hundred|thousand|million|first|last|yesterday|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
/** A name mid-sentence (a city, a brand): case matters, so it is its own pattern. */
const NAMED = /(?<=\s)[A-Z][a-z]+/
const REHOOK = /\?|\b(but|here'?s|the part|turns out|until|then|except|that'?s when|the real|plot twist|wait)\b/i

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length
const fmtSeconds = (s: number): string => (s >= 120 ? `${Math.round(s / 60)} min` : `${s} s`)

/**
 * The script against what makes videos travel: a short, cold, specific hook, an on-screen hook that adds to it
 * for muted viewers (chapter titles for long-form), a re-hook in the middle, and a length that fits the format.
 */
export function viralityChecks(s: CheckedScript, format: VideoFormat): ScriptCheck[] {
  const f = formatOption(format)
  const hookWords = words(s.hook)
  const screen = s.onScreenText[0] ?? ''
  const lines = s.script
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const middle = lines.slice(Math.floor(lines.length / 3), Math.ceil((lines.length * 2) / 3))
  const [lo, hi] = f.seconds
  const long = f.key === 'long'
  return [
    { key: 'hook-short', label: `Hook of ${MAX_HOOK_WORDS} words or fewer`, ok: hookWords > 0 && hookWords <= MAX_HOOK_WORDS, hint: `It has ${hookWords}. Cut everything before the point.` },
    { key: 'hook-cold', label: 'Starts mid-thought', ok: !COLD_OPEN.test(s.hook.trim()), hint: 'No greeting, name or "so" first: open on the moment.' },
    { key: 'hook-specific', label: 'A specific detail in the hook', ok: SPECIFIC.test(s.hook) || NAMED.test(s.hook), hint: 'Add a number, a name, a day or a place.' },
    long
      ? { key: 'screen-hook', label: 'Chapters named', ok: s.onScreenText.length >= 2, hint: 'Give it 2 or more chapter titles so viewers can see where it goes.' }
      : {
          key: 'screen-hook',
          label: 'On-screen hook adds to the spoken one',
          ok: !!screen && screen.trim().toLowerCase() !== s.hook.trim().toLowerCase() && words(screen) <= MAX_SCREEN_HOOK_WORDS,
          hint: `${MAX_SCREEN_HOOK_WORDS} words or fewer, not the hook's own words: it is what muted viewers read.`
        },
    { key: 'rehook', label: 'A re-hook in the middle', ok: lines.length >= 4 && middle.some((l) => REHOOK.test(l)), hint: 'Around halfway, reopen the question or raise the stakes.' },
    { key: 'length', label: `Fits a ${f.label.toLowerCase()} video (${fmtSeconds(lo)} to ${fmtSeconds(hi)})`, ok: s.seconds >= lo && s.seconds <= hi, hint: `It runs about ${fmtSeconds(s.seconds)}.` }
  ]
}
