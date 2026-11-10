import { describe, it, expect } from 'vitest';
import { clipScore, formatForClips, parseClipCandidates, selectClips, type ClipCandidate } from '../src/clips';
import { parseRepurpose } from '../src/repurpose';

const cand = (start: number, end: number, score: number): ClipCandidate => ({
  start, end, score, title: `t${start}`, hookLine: 'hook', reason: 'why',
  scores: { hook: score, coherence: score, emotion: score, value: score, payoff: score },
});

describe('clipScore', () => {
  it('applies the rubric weights', () => {
    expect(clipScore({ hook: 100, coherence: 0, emotion: 0, value: 0, payoff: 0 })).toBe(30);
    expect(clipScore({ hook: 80, coherence: 70, emotion: 60, value: 50, payoff: 40 })).toBe(65);
  });
  it('holds out-of-range model scores to 0..100', () => {
    expect(clipScore({ hook: 500, coherence: 500, emotion: 500, value: 500, payoff: 500 })).toBe(100);
    expect(clipScore({ hook: -5, coherence: -5, emotion: -5, value: -5, payoff: -5 })).toBe(0);
  });
});

describe('parseClipCandidates', () => {
  it('scores valid candidates itself rather than trusting the model total', () => {
    const [c] = parseClipCandidates({ clips: [{ start: 1, end: 31, title: 'T', hookLine: 'H', reason: 'R', score: 99,
      scores: { hook: 50, coherence: 50, emotion: 50, value: 50, payoff: 50 } }] });
    expect(c.score).toBe(50);
  });
  it('drops malformed entries and keeps good ones', () => {
    const good = { start: 1, end: 31, title: 'T', hookLine: 'H', reason: 'R', scores: { hook: 1, coherence: 1, emotion: 1, value: 1, payoff: 1 } };
    const out = parseClipCandidates({ clips: [{ ...good, end: 0 }, { ...good, start: 'x' }, { ...good, scores: {} }, null, good] });
    expect(out.length).toBe(1);
  });
  it('returns nothing for a reply of the wrong shape', () => {
    expect(parseClipCandidates(null)).toEqual([]);
    expect(parseClipCandidates({ clips: 'no' })).toEqual([]);
  });
});

describe('selectClips', () => {
  it('skips clips under the score bar or outside the length limits', () => {
    const out = selectClips([cand(0, 30, 59), cand(100, 105, 90), cand(200, 290, 90), cand(300, 330, 60)], { minGap: 0 });
    expect(out.map((c) => c.start)).toEqual([300]);
  });
  it('ranks by score and honors the limit', () => {
    const out = selectClips([cand(0, 30, 70), cand(500, 530, 90), cand(1000, 1030, 80)], { limit: 2 });
    expect(out.map((c) => c.score)).toEqual([90, 80]);
  });
  it('prefers spaced clips, then fills up with close ones, never overlapping', () => {
    const out = selectClips([cand(0, 30, 90), cand(20, 50, 85), cand(40, 70, 80), cand(400, 430, 70)]);
    expect(out.map((c) => c.start)).toEqual([0, 400, 40]);
  });
  it('does not change its input', () => {
    const input = [cand(0, 30, 70), cand(500, 530, 90)];
    const copy = JSON.parse(JSON.stringify(input));
    selectClips(input);
    expect(input).toEqual(copy);
  });
});

describe('formatForClips', () => {
  it('breaks lines on pauses and stamps each with its start', () => {
    const words = [{ s: 1, e: 1.5, w: ' Hello' }, { s: 1.6, e: 2, w: ' there.' }, { s: 5, e: 5.5, w: ' Next' }];
    expect(formatForClips(words)).toBe('[1.00s] Hello there.\n[5.00s] Next');
  });
});

describe('parseRepurpose', () => {
  const ok = {
    carousel: [{ title: 'A', body: 'a' }, { title: 'B', body: 'b' }, { title: 'C', body: 'c' }],
    thread: ['one', 'two'], newsletter: { subject: 'S', body: 'B' },
  };
  it('accepts a complete reply', () => {
    expect(parseRepurpose(ok)).toEqual(ok);
  });
  it('rejects a thread post too long to publish', () => {
    expect(parseRepurpose({ ...ok, thread: ['x'.repeat(281)] })).toBeNull();
  });
  it('rejects a carousel with too few slides, and missing parts', () => {
    expect(parseRepurpose({ ...ok, carousel: ok.carousel.slice(0, 2) })).toBeNull();
    expect(parseRepurpose({ ...ok, newsletter: {} })).toBeNull();
    expect(parseRepurpose(null)).toBeNull();
  });
});
