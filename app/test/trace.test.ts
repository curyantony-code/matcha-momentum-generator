import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TRACE_FILE, appendTrace, byJob, readTrace } from '../src/main/trace'

const dir = () => mkdtempSync(join(tmpdir(), 'trace-'))
const at = '2026-11-08T12:00:00.000Z'

describe('the edit trace', () => {
  it('appends one line per entry and reads them back in order', async () => {
    const d = dir()
    await appendTrace(d, { type: 'job', at, kind: 'first-edit' })
    await appendTrace(d, { type: 'thought', at, text: 'Cut the pauses first.' })
    await appendTrace(d, { type: 'step', at, name: 'set_cut', args: { keep: [] }, ok: true, summary: 'Kept the best take' })
    expect((await readTrace(d)).map((e) => e.type)).toEqual(['job', 'thought', 'step'])
    expect(readFileSync(join(d, TRACE_FILE), 'utf8').trim().split('\n')).toHaveLength(3)
  })

  it('skips a damaged line and treats a missing file as empty', async () => {
    const d = dir()
    expect(await readTrace(d)).toEqual([])
    mkdirSync(join(d, 'work'), { recursive: true })
    writeFileSync(join(d, TRACE_FILE), '{"type":"job","at":"x","kind":"note"}\nnot json\n{"no":"type"}\n')
    expect(await readTrace(d)).toEqual([{ type: 'job', at: 'x', kind: 'note' }])
  })

  it('splits the trace into its jobs, each with its own steps', () => {
    const t = [
      { type: 'step' as const, at, name: 'orphan', args: {}, ok: true },
      { type: 'job' as const, at, kind: 'first-edit' },
      { type: 'step' as const, at, name: 'a', args: {}, ok: true },
      { type: 'job' as const, at, kind: 'note', note: 'music quieter' },
      { type: 'thought' as const, at, text: 'lower the music' },
      { type: 'step' as const, at, name: 'b', args: {}, ok: false, error: 'no music' }
    ]
    const jobs = byJob(t)
    expect(jobs.map((j) => j.kind)).toEqual(['first-edit', 'note'])
    expect(jobs[0]!.entries).toHaveLength(1)
    expect(jobs[1]).toMatchObject({ note: 'music quieter', entries: [{ type: 'thought' }, { type: 'step', ok: false }] })
    expect(byJob([])).toEqual([])
  })
})
