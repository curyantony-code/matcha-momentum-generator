// Studying someone else's short video: what the engine measured (study-fetch, study-measure) goes to the model with
// a few frames, and comes back as their script with timestamps, its formula, the edit, why it works and what to
// borrow. Everything here only checks and trims what the model says: numbers come from the measurements.
import { extractJson } from './providers/cli';
import type { ImagePart, ModelProvider } from './types';
import { AIError } from './types';
import type { Prompts } from './prompts';

export interface StudySource {
  url: string; platform: 'instagram' | 'tiktok' | 'youtube'; creator: string; title: string; caption: string;
  views: number | null; likes: number | null; comments: number | null; durationSec: number; uploadedAt: string | null;
}
export interface StudyMeasure {
  durationSec: number; cuts: number[]; cutsPerMin: number; avgShotSec: number;
  words: { w: string; s: number; e: number }[]; wpm: number; firstWordAt: number | null; speechRatio: number; musicLikely: boolean;
}
export interface StudyFrame { at: number; mime: string; base64: string }

export const BEAT_ROLES = ['hook', 'setup', 'claim', 'proof', 'story', 'turn', 'rehook', 'payoff', 'cta', 'signoff', 'other'] as const;
export type BeatRole = (typeof BEAT_ROLES)[number];
export const CTA_KINDS = ['follow', 'comment', 'link', 'save', 'share', 'none', 'other'] as const;

export interface ReelStudy {
  summary: string;
  script: {
    hook: { text: string; at: number; shape: string; why: string };
    beats: { at: number; role: BeatRole; said: string; note: string }[];
    rehook: { at: number; text: string } | null;
    payoff: string;
    cta: { text: string; kind: (typeof CTA_KINDS)[number] };
    loop: { loops: boolean; how: string };
  };
  formula: { name: string; steps: string[]; hookShape: string; closestTemplate: { name: string; fit: 'close' | 'partial' | 'none'; diff: string }; concept: string };
  edit: { pace: string; captions: string; onScreen: string; broll: string; camera: string; zooms: string; sound: string; look: string; muted: string };
  why: string[];
  borrow: string[];
  avoid: string[];
  tryThis: { idea: string; hook: string };
}

export interface CreatorPatterns {
  signature: string;
  hooks: string;
  structure: string;
  edit: string;
  length: string;
  topics: string;
  best: { url: string; why: string }[];
  borrow: string[];
}

const MAX_TEXT = 400;
const MAX_LIST = 6;
const MAX_BEATS = 16;
const MAX_FRAMES = 8;
/** Words in the transcript sent to the model: about 6 minutes of speech. */
const MAX_WORDS = 1200;

/** Text from the model, one line, at most `max` characters: cut at the last sentence end, else the last word, with "…". */
export function str(v: unknown, max = MAX_TEXT): string {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  const sentence = head.search(/[.!?](?=[^.!?]*$)/);
  if (sentence > max * 0.6) return head.slice(0, sentence + 1);
  const space = head.lastIndexOf(' ');
  return `${(space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s,;:]+$/, '')}…`;
}
const list = (v: unknown, max = MAX_LIST): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const time = (v: unknown, dur: number): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, dur) * 10) / 10;
};
const oneOf = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback);

/** The model's reply, checked: null when the parts that make a study (a hook and some beats) are missing. */
export function parseStudy(reply: unknown, durationSec: number): ReelStudy | null {
  const r = obj(reply);
  const s = obj(r.script);
  const h = obj(s.hook);
  const hookText = str(h.text);
  const beats = (Array.isArray(s.beats) ? s.beats : [])
    .map((b) => {
      const o = obj(b);
      const at = time(o.at, durationSec);
      const said = str(o.said, 240);
      return at === null || !said ? null : { at, role: oneOf(o.role, BEAT_ROLES, 'other'), said, note: str(o.note, 240) };
    })
    .filter((b): b is ReelStudy['script']['beats'][number] => b !== null)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_BEATS);
  if (!hookText || !beats.length) return null;
  const rh = obj(s.rehook);
  const rehookAt = time(rh.at, durationSec);
  const f = obj(r.formula);
  const ct = obj(f.closestTemplate);
  const e = obj(r.edit);
  const cta = obj(s.cta);
  const loop = obj(s.loop);
  const t = obj(r.tryThis);
  return {
    summary: str(r.summary, 320),
    script: {
      hook: { text: hookText, at: time(h.at, durationSec) ?? 0, shape: str(h.shape, 60), why: str(h.why) },
      beats,
      rehook: rehookAt !== null && str(rh.text) ? { at: rehookAt, text: str(rh.text) } : null,
      payoff: str(s.payoff),
      cta: { text: str(cta.text), kind: oneOf(cta.kind, CTA_KINDS, 'other') },
      loop: { loops: loop.loops === true, how: str(loop.how) },
    },
    formula: {
      name: str(f.name, 60),
      steps: list(f.steps, 12),
      hookShape: str(f.hookShape, 60),
      closestTemplate: { name: str(ct.name, 60), fit: oneOf(ct.fit, ['close', 'partial', 'none'] as const, 'none'), diff: str(ct.diff) },
      concept: str(f.concept, 240),
    },
    edit: {
      pace: str(e.pace), captions: str(e.captions), onScreen: str(e.onScreen), broll: str(e.broll), camera: str(e.camera),
      zooms: str(e.zooms), sound: str(e.sound), look: str(e.look), muted: str(e.muted),
    },
    why: list(r.why),
    borrow: list(r.borrow),
    avoid: list(r.avoid),
    tryThis: { idea: str(t.idea, 600), hook: str(t.hook, 240) },
  };
}

export function parseCreator(reply: unknown, urls: readonly string[]): CreatorPatterns | null {
  const r = obj(reply);
  const signature = str(r.signature);
  if (!signature) return null;
  const best = (Array.isArray(r.best) ? r.best : [])
    .map((b) => ({ url: str(obj(b).url, 300), why: str(obj(b).why) }))
    .filter((b) => urls.includes(b.url) && b.why)
    .slice(0, 3);
  return {
    signature, hooks: str(r.hooks), structure: str(r.structure), edit: str(r.edit), length: str(r.length), topics: str(r.topics),
    best, borrow: list(r.borrow),
  };
}

const sec = (n: number): string => `${n.toFixed(1)} s`;
const num = (n: number | null): string => (n === null ? 'not shown' : n.toLocaleString('en-US'));

/** The transcript as timed lines (a new line at a pause of 0.6 s or more, or every 14 words). */
export function timedTranscript(words: readonly { w: string; s: number; e: number }[]): string {
  const lines: string[] = [];
  let cur: string[] = [];
  let start = 0;
  let last = 0;
  for (const [i, w] of words.slice(0, MAX_WORDS).entries()) {
    if (cur.length && (w.s - last >= 0.6 || cur.length >= 14)) {
      lines.push(`[${sec(start)}] ${cur.join(' ')}`);
      cur = [];
    }
    if (!cur.length) start = w.s;
    cur.push(w.w.trim());
    last = w.e;
    if (i === MAX_WORDS - 1 && words.length > MAX_WORDS) cur.push('(transcript cut here)');
  }
  if (cur.length) lines.push(`[${sec(start)}] ${cur.join(' ')}`);
  return lines.join('\n') || '(no speech: a video with music or text only)';
}

/** What the engine measured, in plain lines for the prompt. */
export function measuredBlock(src: StudySource, m: StudyMeasure, medianViews: number | null): string {
  const vsUsual = src.views !== null && medianViews ? ` (${(src.views / medianViews).toFixed(1)}× this creator's usual)` : '';
  return [
    `Platform: ${src.platform}. Creator: ${src.creator || 'unknown'}. Posted: ${src.uploadedAt ?? 'unknown'}.`,
    `Views: ${num(src.views)}${vsUsual}. Likes: ${num(src.likes)}. Comments: ${num(src.comments)}.`,
    `Length: ${sec(m.durationSec)}. Cuts: ${m.cuts.length} (${m.cutsPerMin.toFixed(1)} a minute, a shot every ${sec(m.avgShotSec)} on average) at ${m.cuts.slice(0, 40).map((c) => c.toFixed(1)).join(', ') || 'none'}.`,
    `Speech: ${m.words.length} words, ${Math.round(m.wpm)} words a minute, first word at ${m.firstWordAt === null ? 'none' : sec(m.firstWordAt)}, talking ${Math.round(m.speechRatio * 100)}% of the time.`,
    `Music or sound under the voice: ${m.musicLikely ? 'likely' : 'not detected'}.`,
    `Their caption: ${src.caption.slice(0, 800) || '(none)'}`,
  ].join('\n');
}

export interface StudyContext {
  /** Their beat templates: name and beats, to find the closest one. */
  templates: { name: string; beats: string }[];
  /** The hook shapes the writer knows, by name. */
  hookShapes: string[];
  /** A short line on who the person studying is and what they make ('' when unknown). */
  about: string;
  /** Median views of this creator's recent videos, when known. */
  medianViews: number | null;
}

const FRAME_TEXT = (at: number): string => `Frame at ${sec(at)}`;

async function ask<T>(provider: ModelProvider, system: string, content: any[], parse: (r: unknown) => T | null, shape: string, signal?: AbortSignal): Promise<T | null> {
  const messages: any[] = [{ role: 'user', content }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await provider.complete({ system, messages, tools: [], jsonOnly: true, signal });
    const parsed = parse(extractJson(res.text));
    if (parsed !== null) return parsed;
    messages.push({ role: 'assistant', text: res.text, toolCalls: [] });
    messages.push({ role: 'user', content: [{ type: 'text', text: `That was not valid. Reply with ONLY the JSON object ${shape}.` }] });
  }
  return null;
}

/** One reel, broken down. Frames go along when the AI can see pictures. */
export async function studyReel(prompts: Prompts, provider: ModelProvider | null, src: StudySource, m: StudyMeasure, frames: readonly StudyFrame[], ctx: StudyContext, signal?: AbortSignal): Promise<ReelStudy> {
  if (!provider) throw new AIError('no_ai', 'Connect ChatGPT or Claude in Settings so I can study videos.');
  const system = prompts.render('studyReel', {
    measured: measuredBlock(src, m, ctx.medianViews),
    transcript: timedTranscript(m.words),
    templates: ctx.templates.map((t) => `### ${t.name}\n${t.beats.trim()}`).join('\n\n') || '(none yet)',
    hookShapes: ctx.hookShapes.join(', ') || '(none listed)',
    about: ctx.about.trim() || '(not set up yet: keep "tryThis" general)',
  });
  const content: any[] = [{ type: 'text', text: 'Study this video. Reply with the JSON only.' }];
  if (provider.supportsImages) {
    for (const f of frames.slice(0, MAX_FRAMES)) {
      content.push({ type: 'text', text: FRAME_TEXT(f.at) });
      content.push({ type: 'image', mime: f.mime, base64: f.base64 } satisfies ImagePart);
    }
  }
  const study = await ask(provider, system, content, (r) => parseStudy(r, m.durationSec), '{"summary", "script", "formula", "edit", "why", "borrow", "avoid", "tryThis"}', signal);
  if (!study) throw new AIError('study_failed', 'I could not break this video down this time. Try again.');
  return study;
}

/** Several studied reels by one creator: what they always do. */
export async function studyCreator(prompts: Prompts, provider: ModelProvider | null, creator: string, reels: readonly { url: string; views: number | null; study: ReelStudy; measure: StudyMeasure }[], signal?: AbortSignal): Promise<CreatorPatterns> {
  if (!provider) throw new AIError('no_ai', 'Connect ChatGPT or Claude in Settings so I can study videos.');
  const block = reels
    .map((r) => [
      `## ${r.url} (${num(r.views)} views, ${sec(r.measure.durationSec)}, ${r.measure.cutsPerMin.toFixed(1)} cuts a minute, ${Math.round(r.measure.wpm)} wpm)`,
      `Summary: ${r.study.summary}`,
      `Hook (${r.study.script.hook.shape}): ${r.study.script.hook.text}`,
      `Formula: ${r.study.formula.name}: ${r.study.formula.steps.join(' / ')}`,
      `Edit: ${r.study.edit.pace} ${r.study.edit.captions} ${r.study.edit.onScreen}`,
      `Ask: ${r.study.script.cta.text || 'none'}`,
    ].join('\n'))
    .join('\n\n');
  const system = prompts.render('studyCreator', { creator: creator || 'this creator', reels: block });
  const urls = reels.map((r) => r.url);
  const out = await ask(provider, system, [{ type: 'text', text: 'Reply with the JSON only.' }], (r) => parseCreator(r, urls), '{"signature", "hooks", "structure", "edit", "length", "topics", "best", "borrow"}', signal);
  if (!out) throw new AIError('study_failed', 'I could not find this creator\'s patterns this time. Try again.');
  return out;
}

/** The middle of the view counts we know (null with none). */
export function medianOf(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number' && x >= 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** From a creator's recent videos, the ones to study: the most over their median first, at most `n`. */
export function pickOutliers<T extends { views: number | null }>(items: readonly T[], n: number): T[] {
  const withViews = items.filter((i) => typeof i.views === 'number');
  if (!withViews.length) return items.slice(0, n);
  return [...withViews].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, n);
}
