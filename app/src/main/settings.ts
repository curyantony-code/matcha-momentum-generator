// App settings (not user content): first-run flag and storage location.
import type { BeatTemplate } from '../shared/beats'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { settingsFile } from './paths'
import { writeJson } from './store'
import { UPDATE_DEFAULTS, type UpdateState } from './update-check'
import { NO_DEFAULT_LOOK, type DefaultLook, type LookTemplate } from '../shared/looks'
import { DEFAULT_FORMAT, type VideoFormat } from '../shared/formats'

export interface Settings extends UpdateState {
  firstRunDone: boolean
  root: string | null
  /** Written by the 0.1.0/0.1.1 local-Claude-Code builds (a one-time automatic AI pick); read once by ai-carryover.ts. */
  aiAutoPicked: boolean
  /** ai-carryover.ts already ran (it kept, or left alone, what an old local-Claude-Code install was using) */
  aiCarriedOver: boolean
  /** The person's voice file (voice.md) the script generator writes from, or null. */
  voiceFile: string | null
  /** How the person's videos are built (beats, length, sign-off), in their words. */
  scriptFormat: string
  /** What kind of video they make (Scripts page): scripts and new videos follow it. */
  videoFormat: VideoFormat
  /** Beat templates they saved (shared/beats.ts), and the one scripts are written in. */
  beatTemplates: BeatTemplate[]
  beatTemplate: string | null
  /** First edits (and changes before approval) stop at a preview with a storyboard, until "Make the final video". */
  storyboardFirst: boolean
  /** The AI adds animated cards (numbers, lists, strong lines, typing) on its own. On unless turned off. */
  motionCards: boolean
  /** How the app looks: the dark edit bay, daylight, or whatever the system uses. */
  theme: Theme
  /** The filter and subtitle style every new video starts with. */
  defaultLook: DefaultLook
  /** Named looks saved from Settings > Your look. */
  lookTemplates: LookTemplate[]
  /** The brand new scripts and videos are made for (Brands tab, sidebar switch): a file id in the brands folder. */
  activeBrand: string | null
}

export type Theme = 'dark' | 'light' | 'system'
export const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'light' || v === 'system'

const DEFAULTS: Settings = {
  firstRunDone: false,
  root: null,
  aiAutoPicked: false,
  aiCarriedOver: false,
  voiceFile: null,
  scriptFormat: '',
  videoFormat: DEFAULT_FORMAT,
  beatTemplates: [],
  beatTemplate: null,
  storyboardFirst: false,
  motionCards: true,
  theme: 'dark',
  defaultLook: NO_DEFAULT_LOOK,
  lookTemplates: [],
  activeBrand: null,
  ...UPDATE_DEFAULTS
}

export async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULTS, ...JSON.parse(await fs.readFile(settingsFile(), 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

// One save at a time: each is read-modify-write, and the update check (main/update-check.ts) saves in the
// background, so two overlapping saves must not drop each other's change (e.g. firstRunDone).
let queue: Promise<unknown> = Promise.resolve()

export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const run = async (): Promise<Settings> => {
    const next = { ...(await loadSettings()), ...patch }
    await fs.mkdir(dirname(settingsFile()), { recursive: true })
    // Same writer as projects: unique temp file + rename that retries on Windows locks (review 32).
    await writeJson(settingsFile(), next)
    return next
  }
  const p = queue.then(run, run)
  queue = p.catch(() => undefined)
  return p
}
