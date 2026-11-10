import { describe, expect, it } from 'vitest';
import { parseScriptReply } from '../src/scriptgen';
import { createAI } from '../src/index';
import { FakeHost, ScriptedModel, tmpDir } from './helpers';

const base = { hook: 'I lost 45 days.', script: 'I lost 45 days.\nI hit 10k signups.\nNo script, no checkbox.', onScreenText: [] };

describe('parseScriptReply: motion cards and rankings', () => {
  it('keeps cards on real lines with a known card, and drops the rest', () => {
    const r = parseScriptReply({
      ...base,
      cards: [
        { line: 2, card: 'stat-count-up', text: '10k signups' },
        { line: 3, card: 'list-reveal', text: 'No script · No checkbox' },
        { line: 9, card: 'big-quote', text: 'not a line' },
        { line: 1, card: 'fireworks', text: 'unknown card' },
        { line: 1.5, card: 'big-quote', text: 'half a line' },
        'junk',
      ],
    });
    expect(r!.cards).toEqual([
      { line: 2, card: 'stat-count-up', text: '10k signups' },
      { line: 3, card: 'list-reveal', text: 'No script · No checkbox' },
    ]);
  });

  it('keeps the top three rankings of each kind, with their reason', () => {
    const r = parseScriptReply({
      ...base,
      ranked: {
        templates: [{ name: 'Hot take', why: 'a claim' }, { name: 'Making-of story', why: 'a result' }, { name: 'Misdirect', why: 'a flip' }, { name: 'extra', why: 'x' }],
        hooks: [{ name: 'Confession', why: 'struggle first' }, { name: '', why: 'no name' }],
        concepts: 'not a list',
      },
    });
    expect(r!.ranked.templates.map((t) => t.name)).toEqual(['Hot take', 'Making-of story', 'Misdirect']);
    expect(r!.ranked.hooks).toEqual([{ name: 'Confession', why: 'struggle first' }]);
    expect(r!.ranked.concepts).toEqual([]);
  });

  it('gives empty cards and rankings when the model sends none', () => {
    expect(parseScriptReply(base)).toMatchObject({ cards: [], ranked: { templates: [], hooks: [], concepts: [] } });
  });
});

describe('writeScript sees every template', () => {
  it('lists all beat templates (the picked one marked), every motion card and the traction ranking', async () => {
    const model = new ScriptedModel([{ text: JSON.stringify(base) }]);
    await createAI({ host: new FakeHost(tmpDir()), settingsDir: tmpDir(), providerOverride: model }).writeScript('idea', () => undefined, undefined, {
      templates: [
        { name: 'Hot take', beats: ['1. Hook: the claim.', '2. Intro.'] },
        { name: 'Misdirect', beats: ['1. Set up one expectation.', '2. Flip it.'] },
      ],
      activeTemplate: 'Hot take',
      ranking: '## Hooks, ranked by traction\n1. Confession',
    });
    const sys = model.requests[0].system as string;
    expect(sys).toContain('Hot take (the one they picked)');
    expect(sys).toContain('Misdirect');
    expect(sys).toContain('2. Flip it.');
    for (const id of ['stat-count-up', 'big-quote', 'list-reveal', 'logo-pop', 'price-tag', 'typing-terminal']) expect(sys).toContain(id);
    expect(sys).toContain('1. Confession');
    expect(sys).not.toMatch(/\{\{\w+\}\}/);
  });

  it('says plainly when there is no ranking yet', async () => {
    const model = new ScriptedModel([{ text: JSON.stringify(base) }]);
    await createAI({ host: new FakeHost(tmpDir()), settingsDir: tmpDir(), providerOverride: model }).writeScript('idea', () => undefined);
    expect(model.requests[0].system).toMatch(/no traction ranking yet/i);
  });
});
