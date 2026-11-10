// Picking the best short clips out of a long video. The model judges each candidate; the score and the final
// selection are computed here, so they are repeatable. Weights and selection rules are adapted from the scoring
// rubric in claude-shorts by Daniel Agrici (MIT, see THIRD_PARTY.md).

export interface ClipScores { hook: number; coherence: number; emotion: number; value: number; payoff: number }

export interface ClipCandidate {
  start: number;
  end: number;
  title: string;
  hookLine: string;
  reason: string;
  scores: ClipScores;
  score: number;
}

export interface ClipSelectOptions { minScore?: number; minGap?: number; minLen?: number; maxLen?: number; limit?: number }

export const CLIP_WEIGHTS: Readonly<ClipScores> = { hook: 0.3, coherence: 0.25, emotion: 0.2, value: 0.15, payoff: 0.1 };

const MIN_SCORE = 60;
const MIN_GAP = 120;
const MIN_LEN = 15;
const MAX_LEN = 60;
const CLIP_LIMIT = 10;
const LINE_PAUSE = 0.6;
const LINE_WORDS = 24;

const SCORE_KEYS = Object.keys(CLIP_WEIGHTS) as (keyof ClipScores)[];

export function clipScore(scores: Readonly<ClipScores>): number {
  const total = SCORE_KEYS.reduce((sum, k) => sum + Math.min(100, Math.max(0, scores[k])) * CLIP_WEIGHTS[k], 0);
  return Math.round(total * 10) / 10;
}

function parseScores(v: unknown): ClipScores | null {
  if (typeof v !== 'object' || v === null) return null;
  const rec = v as Record<string, unknown>;
  if (!SCORE_KEYS.every((k) => Number.isFinite(rec[k]))) return null;
  return { hook: Number(rec.hook), coherence: Number(rec.coherence), emotion: Number(rec.emotion), value: Number(rec.value), payoff: Number(rec.payoff) };
}

function parseCandidate(v: unknown): ClipCandidate | null {
  if (typeof v !== 'object' || v === null) return null;
  const { start, end, title, hookLine, reason, scores } = v as Record<string, unknown>;
  const parsed = parseScores(scores);
  if (!parsed || typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end <= start || typeof title !== 'string' || !title || typeof hookLine !== 'string' || !hookLine) return null;
  return { start, end, title, hookLine, reason: typeof reason === 'string' ? reason : '', scores: parsed, score: clipScore(parsed) };
}

/** Candidates from the model's reply. Malformed entries are dropped; the model's own total is never used. */
export function parseClipCandidates(reply: unknown): ClipCandidate[] {
  const clips = typeof reply === 'object' && reply !== null ? (reply as { clips?: unknown }).clips : undefined;
  if (!Array.isArray(clips)) return [];
  return clips.map(parseCandidate).filter((c): c is ClipCandidate => c !== null);
}

const distance = (a: ClipCandidate, b: ClipCandidate): number => Math.max(a.start - b.end, b.start - a.end);

function takeSpaced(pool: readonly ClipCandidate[], chosen: readonly ClipCandidate[], gap: number, limit: number): ClipCandidate[] {
  return pool.reduce<ClipCandidate[]>((picked, c) => {
    const clear = picked.every((p) => p === c ? false : distance(p, c) >= gap);
    return picked.length < limit && clear ? [...picked, c] : picked;
  }, [...chosen]);
}

/** Best clips first: spaced apart where the video allows it, then filled up with closer ones that do not overlap. */
export function selectClips(candidates: readonly ClipCandidate[], opts: ClipSelectOptions = {}): ClipCandidate[] {
  const { minScore = MIN_SCORE, minGap = MIN_GAP, minLen = MIN_LEN, maxLen = MAX_LEN, limit = CLIP_LIMIT } = opts;
  const pool = candidates
    .filter((c) => c.score >= minScore && c.end - c.start >= minLen && c.end - c.start <= maxLen)
    .sort((a, b) => b.score - a.score);
  return takeSpaced(pool, takeSpaced(pool, [], minGap, limit), 0, limit);
}

/** The transcript as timed lines. Times are what the model must quote back, so each line is stamped with its start. */
export function formatForClips(words: readonly { s: number; e: number; w: string }[]): string {
  const lines = words.reduce<{ start: number; text: string[]; end: number }[]>((out, w) => {
    const last = out[out.length - 1];
    const text = String(w.w).trim();
    if (!last || w.s - last.end > LINE_PAUSE || last.text.length >= LINE_WORDS) return [...out, { start: w.s, text: [text], end: w.e }];
    return [...out.slice(0, -1), { ...last, text: [...last.text, text], end: w.e }];
  }, []);
  return lines.map((l) => `[${l.start.toFixed(2)}s] ${l.text.join(' ')}`).join('\n');
}
