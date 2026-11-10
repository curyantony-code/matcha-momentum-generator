// "How it was made": one video's edit laid out on its own timeline, from what the engine and the AI already save.
//   lanes  cut (the kept stretches), words (each caption, the key words marked), cards (pictures, animations, text),
//          zooms (each push-in), all in seconds of the finished video
//   jobs   the AI's steps and reasoning per job (main/trace.ts)
//   checks the finished file's checks (verify.json), the summary the AI wrote (notes.md), and a few counts
// Nothing here runs the engine: a video made before the trace existed still shows its lanes, with no steps.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { HowMade, HowMadeCard, HowMadeCheck } from '../shared/api'
import { byJob, readTrace } from './trace'

type Json = Record<string, any>

const readJson = async (file: string): Promise<Json | null> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as Json
  } catch {
    return null
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round = (v: number): number => Math.round(v * 1000) / 1000

/** The newest finished version folder (vN with a render.json), else the preview, else null. */
async function newestVersion(projectDir: string): Promise<{ n: number | null; dir: string } | null> {
  const names = await fs.readdir(join(projectDir, 'versions')).catch(() => [] as string[])
  const numbered = names.map((n) => /^v(\d+)$/.exec(n)).filter((m): m is RegExpExecArray => !!m).map((m) => Number(m[1])).sort((a, b) => b - a)
  for (const n of numbered) {
    const dir = join(projectDir, 'versions', `v${n}`)
    if (await readJson(join(dir, 'render.json'))) return { n, dir }
  }
  const preview = join(projectDir, 'versions', 'preview')
  if (await readJson(join(preview, 'render.json'))) return { n: null, dir: preview }
  // no render report anywhere (an older render, or the test engine): the newest version with a video still counts
  for (const n of numbered) {
    const dir = join(projectDir, 'versions', `v${n}`)
    if (await fs.stat(join(dir, 'export.mp4')).then(() => true, () => false)) return { n, dir }
  }
  return null
}

/** Where each word sits in the finished video, from the captions the engine burned in (word id -> start, end). */
export function wordTimes(cues: Json[]): Map<string, { s: number; e: number }> {
  const at = new Map<string, { s: number; e: number }>()
  for (const c of cues) {
    const s = num(c.s), e = num(c.e)
    if (s === null || e === null || !Array.isArray(c.ids)) continue
    for (const id of c.ids) if (typeof id === 'string' && !at.has(id)) at.set(id, { s, e })
  }
  return at
}

const CARD_KIND: Record<string, HowMadeCard['kind']> = { animation: 'animation', 'text-pop': 'text' }

/** What an animation says, from its sidecar (<file>.anim.json): its text, its list items, or its number. */
export function animationWords(params: Json | null | undefined): string | null {
  if (!params || typeof params !== 'object') return null
  const parts = [
    typeof params.value === 'string' || typeof params.value === 'number' ? String(params.value) : '',
    typeof params.text === 'string' ? params.text : '',
    Array.isArray(params.items) ? params.items.filter((i: unknown) => typeof i === 'string').join(' · ') : '',
    // a logo pop with no label: name it by its picture ("Acme logo (dark, for light).png" -> that name)
    !params.text && typeof params.image === 'string' ? params.image.split(/[\\/]/).pop()!.replace(/\.[a-z0-9]+$/i, '') : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' · ').slice(0, 120) : null
}

/** One card per placed layer, named the way a person would say it. `said`: broll id -> an animation's own words. */
export function cardsOf(layers: Json[], broll: Json[], said: Map<string, string> = new Map()): HowMadeCard[] {
  const byId = new Map(broll.filter((b) => b && typeof b.id === 'string').map((b) => [b.id as string, b]))
  return layers.flatMap((l) => {
    const t0 = num(l.t0), t1 = num(l.t1)
    if (t0 === null || t1 === null || l.skipped) return []
    const b = byId.get(l.id) ?? {}
    const asset = typeof b.asset === 'string' ? b.asset : null
    const template = typeof l.template === 'string' ? l.template : /anim-([a-z-]+)-\d+/.exec(asset ?? '')?.[1] ?? null
    const label =
      (typeof l.text === 'string' && l.text) ||
      said.get(String(l.id)) ||
      (typeof b.params?.text === 'string' && b.params.text) ||
      (template ? template.replace(/-/g, ' ') : asset ? asset.split('/').pop()!.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]/g, ' ') : String(l.id))
    return [{ id: String(l.id), t0: round(t0), t1: round(t1), kind: CARD_KIND[l.treatment] ?? 'picture', treatment: String(l.treatment ?? ''), label, behind: !!l.behind }]
  })
}

/** Each animation card's own words, read from the sidecar next to its file (inside the project only). */
async function animationsSaid(projectDir: string, broll: Json[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const b of broll) {
    const asset = typeof b?.asset === 'string' ? b.asset : ''
    if (!/^work\/assets\/[^/]+\.(mov|webm)$/.test(asset)) continue
    const side = await readJson(join(projectDir, asset.replace(/\.(mov|webm)$/, '.anim.json')))
    const words = animationWords(side?.params)
    if (words) out.set(String(b.id), words)
  }
  return out
}

/**
 * The cut and the words rebuilt from the kept takes when the render left no timing of its own (an older render, or
 * the test engine): each kept stretch follows the last, so the times are close, not exact (pauses are not shortened).
 */
export function estimateFromCut(keep: Json[], words: Json[]): { cut: HowMade['lanes']['cut']; words: { id: string; s: number; e: number; text: string }[]; duration: number } {
  const index = new Map(words.map((w, i) => [w.id, i]))
  const cut: HowMade['lanes']['cut'] = []
  const placed: { id: string; s: number; e: number; text: string }[] = []
  let out = 0
  for (const k of keep) {
    const a = index.get(k?.from), b = index.get(k?.to)
    if (a === undefined || b === undefined || b < a) continue
    const from = num(words[a]!.s), to = num(words[b]!.e)
    if (from === null || to === null || to <= from) continue
    for (let i = a; i <= b; i++) {
      const w = words[i]!, s = num(w.s), e = num(w.e)
      if (s !== null && e !== null && typeof w.id === 'string') placed.push({ id: w.id, s: round(out + s - from), e: round(out + e - from), text: String(w.w ?? '') })
    }
    cut.push({ t0: round(out), t1: round(out + to - from), source: String(words[a]!.source ?? ''), from: round(from), to: round(to) })
    out += to - from
  }
  return { cut, words: placed, duration: round(out) }
}

export async function buildHowMade(projectDir: string): Promise<HowMade> {
  const project = (await readJson(join(projectDir, 'project.json'))) ?? {}
  const version = await newestVersion(projectDir)
  const render = version ? ((await readJson(join(version.dir, 'render.json'))) ?? {}) : {}
  const verify = version ? await readJson(join(version.dir, 'verify.json')) : null
  const summary = version ? (await fs.readFile(join(version.dir, 'notes.md'), 'utf8').catch(() => '')) : ''
  const cues: Json[] = ((await readJson(join(projectDir, 'work', 'captions.json')))?.cues as Json[]) ?? []
  const layers: Json[] = ((await readJson(join(projectDir, 'work', 'layers', 'layers.json')))?.items as Json[]) ?? []
  const broll: Json[] = Array.isArray(project.broll) ? project.broll : []
  const at = wordTimes(cues)
  const emphasis = new Set<string>(Array.isArray(project.captions?.emphasis) ? project.captions.emphasis : [])

  const cut = (Array.isArray(render.segmentsDetail) ? render.segmentsDetail : []).flatMap((s: Json) => {
    const out = num(s.out_start), a = num(s.src_start), b = num(s.src_end)
    return out === null || a === null || b === null || b <= a ? [] : [{ t0: round(out), t1: round(out + b - a), source: String(s.source ?? ''), from: round(a), to: round(b) }]
  })
  const words = cues.flatMap((c) => {
    const s = num(c.s), e = num(c.e)
    if (s === null || e === null || typeof c.text !== 'string') return []
    const key = Array.isArray(c.ids) && c.ids.some((id: unknown) => typeof id === 'string' && emphasis.has(id))
    return [{ t0: round(s), t1: round(e), text: c.text, key }]
  })

  const checks: HowMadeCheck[] = (Array.isArray(verify?.checks) ? verify!.checks : []).flatMap((c: Json) =>
    typeof c?.name === 'string' ? [{ name: c.name, ok: c.status === 'PASS', warn: c.status === 'WARN', detail: typeof c.detail === 'string' ? c.detail : '' }] : []
  )
  const transcriptWords: Json[] = ((await readJson(join(projectDir, 'work', 'transcript.json')))?.words as Json[]) ?? []
  const sourceSeconds = transcriptWords.length ? Math.max(...transcriptWords.map((w) => num(w.e) ?? 0)) : null
  // no timing from the render: rebuild it from the kept takes, and say it is approximate
  const estimated = version !== null && !cut.length && Array.isArray(project.cut?.keep) && project.cut.keep.length > 0
  if (estimated) {
    const est = estimateFromCut(project.cut.keep, transcriptWords)
    cut.push(...est.cut)
    if (!words.length) {
      words.push(...est.words.map((w) => ({ t0: w.s, t1: w.e, text: w.text, key: emphasis.has(w.id) })))
      for (const w of est.words) if (!at.has(w.id)) at.set(w.id, { s: w.s, e: w.e })
    }
  }
  const duration = num(render.duration) ?? (cut.length ? cut[cut.length - 1]!.t1 : 0)
  const zooms = (Array.isArray(project.zooms) ? project.zooms : []).flatMap((z: Json) => {
    const a = at.get(z?.anchor?.from), b = at.get(z?.anchor?.to)
    const scale = num(z?.scale)
    return a && b && scale !== null ? [{ t0: round(a.s), t1: round(Math.max(b.e, a.s)), scale }] : []
  })
  return {
    version: version?.n ?? null,
    estimated,
    duration: round(duration),
    lanes: { cut, words, cards: cardsOf(layers, broll, await animationsSaid(projectDir, broll)), zooms },
    sound: {
      effects: project.soundEffects?.enabled === true,
      music: project.music?.enabled && typeof project.music.track === 'string' ? { track: project.music.track.split('/').pop()!, level: String(project.music.level ?? '') } : null
    },
    look: {
      editStyle: typeof project.look?.editStyle === 'string' ? project.look.editStyle : null,
      filter: typeof project.look?.filter === 'string' ? project.look.filter : 'none'
    },
    checks,
    summary: summary.replace(/^# v\d+\s*/m, '').trim(),
    stats: {
      keptSeconds: round(duration),
      sourceSeconds: sourceSeconds !== null ? round(sourceSeconds) : null,
      cuts: Math.max(0, cut.length - 1),
      keyWords: words.filter((w) => w.key).length
    },
    jobs: byJob(await readTrace(projectDir))
  }
}
