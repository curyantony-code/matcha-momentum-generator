// Checking what the model writes for the script generator. Timings are counted here, not taken from the model.
import { ANIMATION_IDS } from './animations';

export const DEFAULT_WPM = 160;

export interface HookOption { text: string; formula: string; words: number; seconds: number }

export interface GeneratedScript {
  hook: string;
  /** The hook shape the model says it used, '' when it did not say. */
  hookFormula: string;
  script: string;
  onScreenText: string[];
  /** Other openings to pick from, each from a different hook shape. */
  hooks: HookOption[];
  /** Spoken length of the whole script at the person's pace. */
  seconds: number;
  /** The niche concept (swipe.md) it is built on, '' when none. */
  concept: string;
  /** L.I.F.E.: its theme and level, '' when the model gave none it knows. */
  theme: Theme | '';
  level: Level | '';
  /** Motion cards the script is written to land: which spoken line (1-based) gets which animated card. */
  cards: ScriptCard[];
  /** For this idea, best first: their beat templates, hook shapes and niche concepts (top 3 each), with the reason. */
  ranked: { templates: Ranked[]; hooks: Ranked[]; concepts: Ranked[] };
  /** What the viewer sees in the first second, under the text hook and the spoken hook ('' when not given). */
  firstFrame: string;
  /** AI phrases still in it after the writer's own rewrite (ai/src/slop.ts), for the person to fix; [] when clean. */
  slop: string[];
}

export interface ScriptCard { line: number; card: string; text: string }
export interface Ranked { name: string; why: string }
export const MAX_RANKED = 3;

export const THEMES = ['Love', 'Identity', 'Fitness', 'Earnings'] as const;
export const LEVELS = ['Safe', 'Real', 'Raw'] as const;
export type Theme = (typeof THEMES)[number];
export type Level = (typeof LEVELS)[number];
/** The model's word, matched without case ("real" is Real); anything else is ''. */
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | '' =>
  list.find((x) => typeof v === 'string' && x.toLowerCase() === v.trim().toLowerCase()) ?? '';

export interface IdeaOption { idea: string; hook: string }

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const countWords = (s: string): number => s.split(/\s+/).filter(Boolean).length;

export function hookStats(line: string, wpm: number = DEFAULT_WPM): { words: number; seconds: number } {
  const words = countWords(line);
  return { words, seconds: Math.round((words / wpm) * 60) };
}

function parseHook(v: unknown, wpm: number): HookOption | null {
  if (typeof v !== 'object' || v === null) return null;
  const { text: line, formula } = v as Record<string, unknown>;
  const t = text(line);
  return t ? { text: t, formula: text(formula), ...hookStats(t, wpm) } : null;
}

export function parseScriptReply(reply: unknown, wpm: number = DEFAULT_WPM): GeneratedScript | null {
  if (typeof reply !== 'object' || reply === null) return null;
  const r = reply as Record<string, unknown>;
  const hook = text(r.hook);
  const script = text(r.script);
  if (!hook || !script) return null;
  const others = Array.isArray(r.otherHooks) ? r.otherHooks : [];
  return {
    hook,
    hookFormula: text(r.hookFormula),
    script,
    onScreenText: Array.isArray(r.onScreenText) ? r.onScreenText.map(text).filter(Boolean) : [],
    hooks: others.map((h) => parseHook(h, wpm)).filter((h): h is HookOption => h !== null),
    seconds: hookStats(script, wpm).seconds,
    concept: /^none$/i.test(text(r.concept)) ? '' : text(r.concept),
    theme: oneOf(THEMES, r.theme),
    level: oneOf(LEVELS, r.level),
    cards: parseCards(r.cards, script.split('\n').filter((l) => l.trim()).length),
    ranked: parseRanked(r.ranked),
    firstFrame: text(r.firstFrame),
    slop: [],
  };
}

/** Cards on a real line of the script, with a card the editor can make; anything else is dropped. */
function parseCards(v: unknown, lines: number): ScriptCard[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c) => {
    if (typeof c !== 'object' || c === null) return [];
    const { line, card, text: t } = c as Record<string, unknown>;
    const ok = Number.isInteger(line) && (line as number) >= 1 && (line as number) <= lines && typeof card === 'string' && ANIMATION_IDS.includes(card);
    return ok ? [{ line: line as number, card: card as string, text: text(t) }] : [];
  });
}

function parseRanked(v: unknown): GeneratedScript['ranked'] {
  const r = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const list = (x: unknown): Ranked[] =>
    (Array.isArray(x) ? x : []).flatMap((e) => {
      if (typeof e !== 'object' || e === null) return [];
      const name = text((e as Record<string, unknown>).name);
      return name ? [{ name, why: text((e as Record<string, unknown>).why) }] : [];
    }).slice(0, MAX_RANKED);
  return { templates: list(r.templates), hooks: list(r.hooks), concepts: list(r.concepts) };
}

export function parseIdeas(reply: unknown): IdeaOption[] | null {
  const list = typeof reply === 'object' && reply !== null ? (reply as { ideas?: unknown }).ideas : undefined;
  if (!Array.isArray(list)) return null;
  const ideas = list.flatMap((v) => {
    if (typeof v !== 'object' || v === null) return [];
    const idea = text((v as Record<string, unknown>).idea);
    const hook = text((v as Record<string, unknown>).hook);
    return idea && hook ? [{ idea, hook }] : [];
  });
  return ideas.length ? ideas : null;
}
