// A live script through the person's own connected AI, with the writer context the app builds: every beat template
// (theirs and built-in, the picked one marked), rankings.md and the motion cards. Skipped unless LIVE_SCRIPT=1 (it
// uses their AI and reads their real files, never writes them). LIVE_SCRIPT_OUT=<folder> keeps the script as JSON.
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { activeTemplate, allTemplates, type BeatTemplate } from '../src/shared/beats'

const LIVE = process.env.LIVE_SCRIPT === '1'
const ROOT = join(homedir(), 'Documents', 'Matcha Momentum Generator')
const DATA = join(homedir(), 'Library', 'Application Support', 'Matcha Momentum Generator')
const IDEA = process.env.LIVE_SCRIPT_IDEA ?? 'Recruiters read a one-line job title and miss who you are; I built Acme so you write your own first impression'
const read = (p: string, cap: number) => fs.readFile(p, 'utf8').then((t) => t.slice(0, cap)).catch(() => '')

describe.skipIf(!LIVE)('live script', () => {
  it('writes a script that ranks the templates and marks its motion cards', async () => {
    const dist = new URL('../../ai/dist/index.js', import.meta.url).href
    const { createAI } = (await import(/* @vite-ignore */ dist)) as { createAI: (o: unknown) => { writeScript: (...a: unknown[]) => Promise<any> } }
    const s = JSON.parse(await fs.readFile(join(DATA, 'settings.json'), 'utf8')) as { voiceFile?: string; beatTemplates?: BeatTemplate[]; beatTemplate?: string; videoFormat?: string }
    const voiceFile = s.voiceFile!
    const beside = (n: string, cap: number) => read(join(dirname(voiceFile), n), cap)
    const mine = s.beatTemplates ?? []
    const active = activeTemplate(mine, s.beatTemplate)
    const ai = createAI({ host: { reelStudioRoot: () => ROOT } as never, settingsDir: join(DATA, 'ai') })
    const started = Date.now()
    const r = await ai.writeScript(IDEA, () => undefined, undefined, {
      voice: await read(voiceFile, 20_000), format: active.beats, videoFormat: s.videoFormat,
      swipe: await beside('swipe.md', 40_000), framework: await beside('framework.md', 16_000), brand: await beside('brand.md', 12_000),
      templates: allTemplates(mine).map((t) => ({ name: t.name, beats: t.beats.split('\n').filter((l) => l.trim()) })),
      activeTemplate: active.name, ranking: await beside('rankings.md', 12_000)
    })
    if (process.env.LIVE_SCRIPT_OUT) await fs.writeFile(join(process.env.LIVE_SCRIPT_OUT, 'script.json'), JSON.stringify({ seconds: Math.round((Date.now() - started) / 1000), activeTemplate: active.name, ...r }, null, 2))
    expect(r.script.length).toBeGreaterThan(50)
    expect(r.ranked.templates.length).toBeGreaterThan(0)
    expect(r.cards.length).toBeGreaterThan(0)
  }, 300_000)
})
