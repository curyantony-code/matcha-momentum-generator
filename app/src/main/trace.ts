// A project's edit trace: every AI step (the tool, what it was asked, what came of it) and the AI's reasoning, one
// JSON line each in <project>/work/trace.jsonl, so "How it was made" can show the edit after the fact. Appends only;
// a trace past TRACE_MAX bytes is trimmed to its newest half, at a line boundary.
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { TraceEntry } from '../shared/api'

export const TRACE_FILE = join('work', 'trace.jsonl')
export const TRACE_MAX = 2_000_000

const fileOf = (projectDir: string): string => join(projectDir, TRACE_FILE)

export async function appendTrace(projectDir: string, entry: TraceEntry): Promise<void> {
  const file = fileOf(projectDir)
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.appendFile(file, JSON.stringify(entry) + '\n', 'utf8')
  const size = (await fs.stat(file)).size
  if (size > TRACE_MAX) {
    const text = await fs.readFile(file, 'utf8')
    const half = text.slice(Math.floor(text.length / 2))
    await fs.writeFile(file, half.slice(half.indexOf('\n') + 1), 'utf8')
  }
}

/** The trace, oldest first; a damaged line is skipped, a missing file is an empty trace. */
export async function readTrace(projectDir: string): Promise<TraceEntry[]> {
  const text = await fs.readFile(fileOf(projectDir), 'utf8').catch(() => '')
  return text.split('\n').flatMap((line) => {
    if (!line.trim()) return []
    try {
      const e = JSON.parse(line) as TraceEntry
      return e && typeof e === 'object' && typeof (e as { type?: unknown }).type === 'string' ? [e] : []
    } catch {
      return []
    }
  })
}

export interface TracedJob {
  kind: string
  at: string
  note?: string
  /** the AI's steps and reasoning in this job, in order */
  entries: Exclude<TraceEntry, { type: 'job' }>[]
}

/** The trace split into its jobs (the first edit, each note), oldest first. Entries before any job line are dropped. */
export function byJob(entries: TraceEntry[]): TracedJob[] {
  const out: TracedJob[] = []
  for (const e of entries) {
    if (e.type === 'job') out.push({ kind: e.kind, at: e.at, ...(e.note ? { note: e.note } : {}), entries: [] })
    else out[out.length - 1]?.entries.push(e)
  }
  return out
}
