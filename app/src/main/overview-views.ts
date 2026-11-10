// The Content engine and System health screens, built from what the app already knows. Everything they need comes
// in as plain values or small functions (main/index.ts passes the real ones), so they stay testable without Electron.
import { constants, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EngineFile, EngineView, HealthCheck, HealthView } from '../shared/overview'
import { TEMPLATE_BASIS, skillsUsedBy } from '../shared/skills'
import type { SavedScript } from '../shared/api'

const FILES: { key: EngineFile['key']; label: string; what: string; name: string | null }[] = [
  { key: 'voice', label: 'Voice', what: 'Who you are, how you talk, what you can prove', name: null },
  { key: 'framework', label: 'Framework', what: 'How every one of your reels is built', name: 'framework.md' },
  { key: 'brand', label: 'Brand', what: 'What you stand for and how you come across', name: 'brand.md' },
  { key: 'rankings', label: 'Rankings', what: 'Hooks, templates and cards ranked by what works online', name: 'rankings.md' },
  { key: 'swipe', label: 'Swipe file', what: 'What over-performs in your niche, with the proof', name: 'swipe.md' }
]

/** The "### " concepts under "## Concepts" in a swipe file. */
export function swipeConcepts(text: string): string[] {
  const start = text.search(/^## Concepts\s*$/m)
  if (start < 0) return []
  const rest = text.slice(start).split('\n').slice(1)
  const end = rest.findIndex((l) => /^## /.test(l))
  return (end < 0 ? rest : rest.slice(0, end)).filter((l) => l.startsWith('### ')).map((l) => l.slice(4).trim()).filter(Boolean)
}

const kb = (bytes: number): string => (bytes < 1024 ? `${bytes} bytes` : `${Math.round(bytes / 1024)} KB`)

async function fileFacts(path: string | null): Promise<{ found: boolean; updatedAt: string | null; size: number; text: string }> {
  if (!path) return { found: false, updatedAt: null, size: 0, text: '' }
  try {
    const [st, text] = await Promise.all([fs.stat(path), fs.readFile(path, 'utf8')])
    return { found: true, updatedAt: st.mtime.toISOString(), size: st.size, text }
  } catch {
    return { found: false, updatedAt: null, size: 0, text: '' }
  }
}

export interface EngineInputs {
  brand: string | null
  voiceFile: string | null
  templates: { id: string; name: string; builtIn?: boolean; beats: string; basedOn?: string }[]
  activeTemplate: string | null
  styleRules: string
  motionCards: boolean
  scripts: SavedScript[]
  /** Skill folder names installed on this computer. */
  skillFolders: string[]
}

/** "Beat templates, ranked" in rankings.md: the name before any "(", lower case → place and score. */
export function templateRanks(rankings: string): Map<string, { place: number; score: number }> {
  const out = new Map<string, { place: number; score: number }>()
  const start = rankings.search(/^## Beat templates/m)
  if (start < 0) return out
  for (const line of rankings.slice(start).split('\n').slice(1)) {
    if (/^## /.test(line)) break
    const m = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\d+(?:\.\d+)?)\s*\|/.exec(line)
    if (m) out.set(rankKey(m[2]!), { place: Number(m[1]), score: Number(m[3]) })
  }
  return out
}
const rankKey = (name: string): string => name.replace(/\s*\(.*$/, '').trim().toLowerCase()

export async function engineView(i: EngineInputs): Promise<EngineView> {
  const beside = (name: string | null): string | null => (i.voiceFile ? (name ? join(dirname(i.voiceFile), name) : i.voiceFile) : null)
  let concepts: string[] = []
  let ranks = new Map<string, { place: number; score: number }>()
  const files: EngineFile[] = []
  for (const f of FILES) {
    const path = beside(f.name)
    const facts = await fileFacts(path)
    let fact: string | null = facts.found ? kb(facts.size) : null
    if (f.key === 'rankings' && facts.found) ranks = templateRanks(facts.text)
    if (f.key === 'swipe' && facts.found) {
      concepts = swipeConcepts(facts.text)
      fact = `${concepts.length} ${concepts.length === 1 ? 'concept' : 'concepts'}`
    }
    files.push({ key: f.key, label: f.label, what: f.what, found: facts.found, path, updatedAt: facts.updatedAt, fact })
  }
  return {
    brand: i.brand,
    files,
    templates: i.templates.map((t) => ({
      id: t.id,
      name: t.name,
      builtIn: !!t.builtIn,
      active: t.name === i.activeTemplate,
      beats: t.beats.split('\n').filter((l) => l.trim()).length,
      basis: t.builtIn ? (TEMPLATE_BASIS[t.id] ?? null) : t.basedOn ? { sources: ['reel-research'], from: t.basedOn } : null,
      rank: ranks.get(rankKey(t.name)) ?? null
    })),
    concepts,
    styleRules: i.styleRules.split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean),
    skillFolders: [...i.skillFolders].sort(),
    motionCards: i.motionCards,
    scripts: [...i.scripts]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12)
      .map((s) => ({
        id: s.id,
        hook: s.hook,
        formula: s.hookFormula ?? '',
        concept: s.concept ?? '',
        template: s.ranked?.templates[0]?.name ?? null,
        cards: s.cards?.length ?? 0,
        slop: s.slop?.length ?? 0,
        createdAt: s.createdAt,
        used: skillsUsedBy(s)
      }))
  }
}

export interface HealthInputs {
  /** the engine's own check (engine doctor): { ok, checks: [{ ok, name, detail, fix }] }, or an error */
  doctor: () => Promise<{ checks?: { ok?: unknown; name?: unknown; detail?: unknown; fix?: unknown }[] }>
  ai: () => Promise<{ connected: boolean; id: string; label: string }>
  model: () => Promise<{ installed: boolean; downloading: boolean; pct: number; name: string }>
  postiz: () => Promise<{ state: string; channels?: unknown[] }>
  appVersion: string
  root: string
}

const POSTIZ_WORDS: Record<string, { ok: boolean; detail: string; fix?: string }> = {
  ready: { ok: true, detail: 'Signed in and ready to post' },
  'signed-out': { ok: false, detail: 'Not signed in', fix: 'Sign in to Postiz to post from here' },
  'no-subscription': { ok: false, detail: 'Signed in, but the account has no plan', fix: 'Start a plan, or use your own Postiz' },
  missing: { ok: false, detail: 'The Postiz program is not installed', fix: 'Install it to post from here, or export and post yourself' }
}

/** Every part of the system, checked at once; one part failing never hides the others. */
export async function healthView(i: HealthInputs, now = new Date()): Promise<HealthView> {
  const checks: HealthCheck[] = []
  const settle = async <T>(fn: () => Promise<T>): Promise<T | Error> => fn().catch((e: unknown) => (e instanceof Error ? e : new Error(String((e as { userMessage?: string })?.userMessage ?? e))))

  const [doctor, ai, model, postiz] = await Promise.all([settle(i.doctor), settle(i.ai), settle(i.model), settle(i.postiz)])

  if (doctor instanceof Error) checks.push({ group: 'Video engine', name: 'Video engine', ok: false, detail: `Could not check it: ${doctor.message}`, fix: 'Reinstall Matcha Momentum Generator if this keeps happening' })
  else if (!doctor.checks?.length)
    checks.push({ group: 'Video engine', name: 'Video engine', ok: false, detail: 'It answered, but reported no checks', fix: 'Check again; reinstall Matcha Momentum Generator if this keeps happening' })
  else
    for (const c of doctor.checks)
      checks.push({ group: 'Video engine', name: String(c.name ?? ''), ok: c.ok === true, detail: String(c.detail ?? ''), ...(c.fix ? { fix: String(c.fix) } : {}) })

  if (ai instanceof Error) checks.push({ group: 'AI editor', name: 'AI editor', ok: false, detail: ai.message })
  else
    checks.push(
      ai.connected && ai.id !== 'none'
        ? { group: 'AI editor', name: 'AI editor', ok: true, detail: `Using ${ai.label}` }
        : { group: 'AI editor', name: 'AI editor', ok: false, detail: 'No AI editor connected', fix: 'Connect Claude or ChatGPT in Settings' }
    )

  if (model instanceof Error) checks.push({ group: 'Listening model', name: 'Listening model', ok: false, detail: model.message })
  else
    checks.push(
      model.installed
        ? { group: 'Listening model', name: 'Listening model', ok: true, detail: `${model.name} is installed` }
        : { group: 'Listening model', name: 'Listening model', ok: false, detail: model.downloading ? `Downloading, ${Math.round(model.pct)}%` : 'Not downloaded yet', fix: 'Download it in Settings' }
    )

  if (postiz instanceof Error) checks.push({ group: 'Posting', name: 'Postiz', ok: false, detail: postiz.message })
  else {
    const w = POSTIZ_WORDS[postiz.state] ?? { ok: false, detail: postiz.state }
    const n = Array.isArray(postiz.channels) ? postiz.channels.length : 0
    checks.push({ group: 'Posting', name: 'Postiz', ok: w.ok, detail: w.ok && n ? `${w.detail}, ${n} ${n === 1 ? 'account' : 'accounts'}` : w.detail, ...(w.fix ? { fix: w.fix } : {}) })
  }

  checks.push({ group: 'App', name: 'Matcha Momentum Generator', ok: true, detail: `Version ${i.appVersion}` })
  const writable = await fs.access(i.root, constants.W_OK).then(() => true, () => false)
  checks.push({ group: 'App', name: 'Your videos folder', ok: writable, detail: writable ? i.root : `Can't write to ${i.root}`, ...(writable ? {} : { fix: 'Pick another folder in Settings' }) })

  return { checkedAt: now.toISOString(), ok: checks.every((c) => c.ok), checks }
}

/** Skill folders (each with a SKILL.md) in ~/.claude/skills and ~/.agents/skills: names only, nothing is read. */
export async function installedSkillFolders(home: string): Promise<string[]> {
  const found = new Set<string>()
  for (const dir of [join(home, '.claude', 'skills'), join(home, '.agents', 'skills')]) {
    let names: string[] = []
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const n of names) {
      try {
        await fs.access(join(dir, n, 'SKILL.md'), constants.R_OK)
        found.add(n)
      } catch {
        // not a skill folder
      }
    }
  }
  return [...found]
}
