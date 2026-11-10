import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { Prompts } from '../src/prompts';
import { measuredBlock, medianOf, parseCreator, parseStudy, pickOutliers, studyReel, timedTranscript, type StudyMeasure, type StudySource } from '../src/study';
import type { CompletionRequest, ModelProvider } from '../src/types';

const prompts = new Prompts(path.join(__dirname, '..', 'prompts'));
const src: StudySource = { url: 'https://www.instagram.com/p/X/', platform: 'instagram', creator: 'rob', title: '', caption: 'comment GROW', views: 50000, likes: 2462, comments: null, durationSec: 86, uploadedAt: '2026-10-01' };
const m: StudyMeasure = {
  durationSec: 86, cuts: [40.2, 70.5], cutsPerMin: 1.4, avgShotSec: 28.7, wpm: 243, firstWordAt: 0, speechRatio: 0.92, musicLikely: false,
  words: [{ w: 'This', s: 0, e: 0.2 }, { w: 'is', s: 0.2, e: 0.3 }, { w: 'how', s: 0.3, e: 0.5 }, { w: 'But', s: 33.1, e: 33.3 }, { w: 'here', s: 33.3, e: 33.5 }],
};
const good = {
  summary: 'A growth how-to in one take.',
  script: {
    hook: { text: 'This is how I got 5,000 users', at: 0, shape: 'Number + result', why: 'a number in second 1' },
    beats: [{ at: 33.1, role: 'rehook', said: 'But here is the part', note: 'reopens' }, { at: 0, role: 'hook', said: 'This is how', note: 'opens' }, { at: 'x', role: 'proof', said: 'bad time', note: '' }, { at: 5, role: 'weird', said: 'step one', note: '' }],
    rehook: { at: 33.1, text: 'But here is the part' },
    payoff: 'the manual DM step', cta: { text: 'comment GROW', kind: 'comment' }, loop: { loops: false, how: 'ends on good night' },
  },
  formula: { name: 'One-take proof', steps: ['Hook: a number and a result', 'Step, with proof'], hookShape: 'Number + result', closestTemplate: { name: 'One-take proof', fit: 'close', diff: 'no intro' }, concept: 'a result anyone can copy' },
  edit: { pace: '1.4 cuts a minute', captions: 'small white', onScreen: 'proof cards', broll: 'none', camera: 'car, lav mic', zooms: 'none', sound: 'voice only', look: 'daylight', muted: 'mostly' },
  why: ['number first'], borrow: ['put proof above your head'], avoid: ['his words'], tryThis: { idea: 'my signups', hook: 'Here is how I got [number] signups' },
};

describe('reading a study', () => {
  it('keeps beats with a real time and words, in order, and clamps roles and times', () => {
    const s = parseStudy(good, 86)!;
    expect(s.script.beats.map((b) => [b.at, b.role])).toEqual([[0, 'hook'], [5, 'other'], [33.1, 'rehook']]);
    expect(s.script.cta.kind).toBe('comment');
    expect(s.formula.closestTemplate.fit).toBe('close');
    expect(parseStudy({ ...good, script: { ...good.script, rehook: { at: 999, text: 'x' } } }, 86)!.script.rehook).toEqual({ at: 86, text: 'x' });
  });

  it('refuses a reply with no hook or no beats', () => {
    expect(parseStudy({ ...good, script: { ...good.script, hook: { text: '' } } }, 86)).toBeNull();
    expect(parseStudy({ ...good, script: { ...good.script, beats: [] } }, 86)).toBeNull();
    expect(parseStudy('nope', 86)).toBeNull();
  });

  it('a creator\'s best videos must be ones that were studied', () => {
    const c = parseCreator({ signature: 'number first', best: [{ url: 'a', why: 'x' }, { url: 'made-up', why: 'y' }], borrow: ['b'] }, ['a']);
    expect(c!.best).toEqual([{ url: 'a', why: 'x' }]);
    expect(parseCreator({}, [])).toBeNull();
  });
});

describe('what goes to the model', () => {
  it('breaks the transcript at pauses, with times', () => {
    expect(timedTranscript(m.words)).toBe('[0.0 s] This is how\n[33.1 s] But here');
    expect(timedTranscript([])).toMatch(/no speech/);
  });

  it('states the measurements and the views against the creator\'s usual', () => {
    const b = measuredBlock(src, m, 10000);
    expect(b).toContain('Views: 50,000 (5.0× this creator\'s usual)');
    expect(b).toContain('Comments: not shown');
    expect(b).toContain('243 words a minute');
  });

  it('sends frames only to an AI that can see them', async () => {
    const seen: CompletionRequest[] = [];
    const fake = (images: boolean): ModelProvider => ({ id: 'fake', supportsImages: images, complete: async (r) => { seen.push(r); return { text: JSON.stringify(good), toolCalls: [], stop: 'end' } as any; } });
    const frames = [{ at: 0, mime: 'image/jpeg', base64: 'AA' }];
    const ctx = { templates: [{ name: 'One-take proof', beats: '1. Hook' }], hookShapes: ['Confession'], about: 'I build an app', medianViews: null };
    await studyReel(prompts, fake(true), src, m, frames, ctx);
    await studyReel(prompts, fake(false), src, m, frames, ctx);
    const images = (r: CompletionRequest) => (r.messages[0] as any).content.filter((c: any) => c.type === 'image').length;
    expect(seen.map(images)).toEqual([1, 0]);
    expect(seen[0]!.system).toContain('### One-take proof');
    expect(seen[0]!.system).not.toMatch(/\{\{\w+\}\}/);
  });

  it('needs an AI', async () => {
    await expect(studyReel(prompts, null, src, m, [], { templates: [], hookShapes: [], about: '', medianViews: null })).rejects.toThrow(/Connect/);
  });
});

describe('picking what to study', () => {
  it('the median ignores unknown counts', () => {
    expect(medianOf([3, null, 1, 2])).toBe(2);
    expect(medianOf([1, 2, 3, 10])).toBe(2.5);
    expect(medianOf([null])).toBeNull();
  });

  it('studies the most viewed first, and recent ones when views are hidden', () => {
    expect(pickOutliers([{ id: 1, views: 10 }, { id: 2, views: 900 }, { id: 3, views: null }, { id: 4, views: 50 }], 2).map((i) => i.id)).toEqual([2, 4]);
    expect(pickOutliers([{ id: 1, views: null }, { id: 2, views: null }], 1).map((i) => i.id)).toEqual([1]);
  });
});

describe('trimming what the model says', () => {
  it('cuts long text at a sentence, else a word, never mid-word', async () => {
    const { str } = await import('../src/study');
    expect(str('Short.', 50)).toBe('Short.');
    expect(str('First sentence is here. Second one runs on and on past the end', 30)).toBe('First sentence is here.');
    expect(str('First sentence is here. Second one runs on and on past the end', 40)).toBe('First sentence is here. Second one…');
    expect(str('one two three four five six seven eight nine ten', 30)).toBe('one two three four five six…');
    expect(str(42)).toBe('');
  });
});
