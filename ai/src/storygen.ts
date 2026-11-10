// A story draft from the model: 10 to 16 narrated lines, each with the scene that shows it, a caption and hashtags.
// The app keeps its own copy of the story types (app/src/shared/story.ts); the lists below must match it.

export const STORY_SCENE_TYPES = ['line', 'title', 'stat', 'highlight', 'list', 'logo', 'art', 'photo'] as const;
export const STORY_WORLDS = ['paper', 'ink', 'clay', 'grey', 'black', 'brand'] as const;
export const STORY_TRANSITIONS = ['cut', 'flash', 'zoom', 'whip', 'wipe', 'iris'] as const;
export type StorySceneType = (typeof STORY_SCENE_TYPES)[number];
export type StoryWorld = (typeof STORY_WORLDS)[number];
export type StoryTransition = (typeof STORY_TRANSITIONS)[number];

export interface StoryDraftParams {
  hero?: string;
  kicker?: string;
  value?: string;
  label?: string;
  phrase?: string;
  items?: string[];
}

export interface StoryDraftLine {
  shown: string;
  spoken: string;
  scene: { type: StorySceneType; world: StoryWorld; transition: StoryTransition; params: StoryDraftParams };
}

export interface StoryDraft {
  title: string;
  lines: StoryDraftLine[];
  caption: string;
  hashtags: string[];
}

export const STORY_DRAFT_MIN_LINES = 6;
export const STORY_DRAFT_MAX_LINES = 20;
const MAX_HASHTAGS = 8;
const MAX_ITEMS = 5;
const MIN_ITEMS = 2;
// The app's own limits (app/src/shared/story-logic.ts LIMITS): anything longer would be cut there, mid-word or mid-number.
const LIMITS = { title: 120, shown: 160, spoken: 240, hero: 40, kicker: 48, value: 16, label: 60, phrase: 120, item: 48, caption: 2200, hashtag: 40 };
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(EMOJI, '').replace(/\s+/g, ' ').trim() : '');
/** Within `max`, cut at a word (never mid-word). */
const text = (v: unknown, max: number): string => {
  const t = clean(v);
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > 0 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:–-]+$/, '');
};
/** All of it or nothing: a hero word, a phrase or a number that does not fit is dropped, never shortened. */
const whole = (v: unknown, max: number): string => {
  const t = clean(v);
  return t.length <= max ? t : '';
};

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v.trim().toLowerCase()) ? (v.trim().toLowerCase() as T) : null;

const inLine = (shown: string, part: string): boolean => part !== '' && shown.toLowerCase().includes(part.toLowerCase());

function paramsOf(type: StorySceneType, raw: unknown, shown: string): { type: StorySceneType; params: StoryDraftParams } {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const params: StoryDraftParams = {};
  // a hero or phrase the line does not hold would draw nothing: dropped
  const hero = whole(p.hero, LIMITS.hero);
  if (['line', 'title', 'art', 'photo'].includes(type) && inLine(shown, hero)) params.hero = hero;
  if (type === 'title') {
    const kicker = text(p.kicker, LIMITS.kicker);
    if (kicker) params.kicker = kicker;
  }
  if (type === 'highlight') {
    const phrase = whole(p.phrase, LIMITS.phrase);
    if (inLine(shown, phrase)) params.phrase = phrase;
  }
  if (type === 'stat') {
    const value = whole(p.value, LIMITS.value);
    // a stat without its number (or with one too long to show whole) is only a line
    if (!value) return { type: 'line', params: inLine(shown, hero) ? { hero } : {} };
    params.value = value;
    params.label = text(p.label, LIMITS.label);
  }
  if (type === 'list') {
    const items = Array.isArray(p.items) ? p.items.map((i) => text(i, LIMITS.item)).filter(Boolean).slice(0, MAX_ITEMS) : [];
    if (items.length < MIN_ITEMS) return { type: 'line', params: {} };
    params.items = items;
  }
  return { type, params };
}

function lineOf(raw: unknown): StoryDraftLine | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const shown = text(r.shown, LIMITS.shown);
  if (!shown) return null;
  const s = (typeof r.scene === 'object' && r.scene !== null ? r.scene : {}) as Record<string, unknown>;
  const { type, params } = paramsOf(pick(s.type, STORY_SCENE_TYPES) ?? 'line', s.params, shown);
  return {
    shown,
    spoken: text(r.spoken, LIMITS.spoken),
    scene: { type, world: pick(s.world, STORY_WORLDS) ?? 'paper', transition: pick(s.transition, STORY_TRANSITIONS) ?? 'cut', params },
  };
}

const captionOf = (v: unknown): string =>
  typeof v === 'string'
    ? v.replace(EMOJI, '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.caption)
    : '';

const hashtagOf = (v: unknown): string | null => {
  const t = text(v, LIMITS.hashtag).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  return t ? `#${t}` : null;
};

/** The draft, or null when it cannot be one (fewer than 6 usable lines, a line with no words). */
export function parseStoryDraft(raw: unknown): StoryDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.lines)) return null;
  // Too many: keep the opening lines and the real last one (the call to action), dropping from the middle.
  const kept = r.lines.length > STORY_DRAFT_MAX_LINES ? [...r.lines.slice(0, STORY_DRAFT_MAX_LINES - 1), r.lines[r.lines.length - 1]] : r.lines;
  const parsed = kept.map(lineOf);
  if (parsed.length < STORY_DRAFT_MIN_LINES || parsed.some((l) => l === null)) return null;
  // the same ground twice in a row: take the next world in order (left to right, against the fixed line before)
  const fixed: StoryDraftLine[] = [];
  for (const l of parsed as StoryDraftLine[]) {
    const prev = fixed[fixed.length - 1];
    if (prev && prev.scene.world === l.scene.world) {
      fixed.push({ ...l, scene: { ...l.scene, world: STORY_WORLDS[(STORY_WORLDS.indexOf(l.scene.world) + 1) % STORY_WORLDS.length] } });
    } else fixed.push(l);
  }
  const tags = Array.isArray(r.hashtags) ? r.hashtags.map(hashtagOf).filter((t): t is string => t !== null) : [];
  return { title: text(r.title, LIMITS.title), lines: fixed, caption: captionOf(r.caption), hashtags: Array.from(new Set(tags)).slice(0, MAX_HASHTAGS) };
}
