// The three screens that make the background visible: What's performing, the Content engine, and System health.
import type { UsedSkill } from './skills'
import type { Insights } from './results'

/** One way of grouping scored videos (by hook shape, edit style, motion cards, length), best average first. */
export interface PerformanceGroup {
  dimension: 'hook' | 'editStyle' | 'cards' | 'length'
  label: string
  rows: { name: string; videos: number; average: number }[]
}

export interface PerformanceView {
  insights: Insights
  groups: PerformanceGroup[]
  /** each scored video's score with its features, newest first */
  videos: { slug: string; title: string; score: number; formula: string; editStyle: string; cards: number; seconds: number | null }[]
}

/** A file the writer reads, as it is on disk now. */
export interface EngineFile {
  key: 'voice' | 'framework' | 'brand' | 'rankings' | 'swipe'
  label: string
  what: string
  found: boolean
  path: string | null
  updatedAt: string | null
  /** one plain fact about it ("5 concepts", "12 KB") */
  fact: string | null
}

export interface EngineTemplate {
  id: string
  name: string
  builtIn: boolean
  active: boolean
  beats: number
  /** What it is based on: the sources (shared/skills.ts) and where it was drawn from; null for one you wrote. */
  basis: { sources: string[]; from: string } | null
  /** Its place in rankings.md's "Beat templates, ranked", when listed there. */
  rank: { place: number; score: number } | null
}

export interface EngineView {
  /** whose files these are: the brand in use, or the voice file */
  brand: string | null
  files: EngineFile[]
  templates: EngineTemplate[]
  concepts: string[]
  styleRules: string[]
  /** The skill folders installed on this computer (~/.claude/skills, ~/.agents/skills). */
  skillFolders: string[]
  motionCards: boolean
  /** the newest scripts and what each one used */
  scripts: { id: string; hook: string; formula: string; concept: string; template: string | null; cards: number; slop: number; createdAt: string; used: UsedSkill[] }[]
}

export interface HealthCheck {
  group: 'Video engine' | 'AI editor' | 'Listening model' | 'Posting' | 'App'
  name: string
  ok: boolean
  detail: string
  fix?: string
}

export interface HealthView {
  checkedAt: string
  ok: boolean
  checks: HealthCheck[]
}

