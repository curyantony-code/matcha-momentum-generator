import { describe, expect, it } from 'vitest';
import { findSlop } from '../src/slop';
import { createAI } from '../src/index';
import { FakeHost, ScriptedModel, tmpDir } from './helpers';

describe('findSlop', () => {
  it('finds the AI phrases a real person does not say, without case', () => {
    expect(findSlop("But Here's the thing, 39% said it.")).toEqual(["here's the thing"]);
    expect(findSlop('Let that sink in. Picture this: a recruiter.')).toEqual(['let that sink in', 'picture this']);
    expect(findSlop("It's not just a CV, it's you.")).toEqual(["it's not just x, it's y"]);
    expect(findSlop('Honestly? It depends.')).toEqual(['honestly?']);
  });

  it('leaves plain speech alone, and "honestly" said as a word', () => {
    expect(findSlop('I sent 200 CVs and got zero replies. Honestly I was crushed.')).toEqual([]);
  });

  it('never flags a phrase the person really says (it is in their voice file)', () => {
    expect(findSlop("Here's the thing, I hate CVs.", "Real samples: \"here's the thing, nobody reads it\"")).toEqual([]);
  });
});

const good = { hook: 'I sent 200 CVs and got zero replies.', script: 'I sent 200 CVs and got zero replies.\nSo I built my own first impression.', onScreenText: ['200 CVs, 0 replies'] };

describe('writeScript removes AI phrases', () => {
  it('asks for one rewrite naming the phrases it found, and keeps the clean version', async () => {
    const model = new ScriptedModel([
      { text: JSON.stringify({ ...good, script: "I sent 200 CVs.\nBut here's the thing, nobody replied.\nLet that sink in." }) },
      (req) => {
        const ask = (req.messages.at(-1) as any).content[0].text as string;
        expect(ask).toContain("here's the thing");
        expect(ask).toContain('let that sink in');
        return { text: JSON.stringify(good) };
      },
    ]);
    const r = await createAI({ host: new FakeHost(tmpDir()), settingsDir: tmpDir(), providerOverride: model }).writeScript('cvs', () => undefined);
    expect(r.script).toBe(good.script);
    expect(r.slop).toEqual([]);
    expect(model.requests).toHaveLength(2);
  });

  it('keeps the first draft and says which phrases are left when the rewrite is no better', async () => {
    const bad = { ...good, script: "I sent 200 CVs.\nHere's the thing, nobody replied." };
    const model = new ScriptedModel([{ text: JSON.stringify(bad) }, { text: JSON.stringify(bad) }]);
    const r = await createAI({ host: new FakeHost(tmpDir()), settingsDir: tmpDir(), providerOverride: model }).writeScript('cvs', () => undefined);
    expect(r.slop).toEqual(["here's the thing"]);
  });

  it('does not ask again when the draft is clean', async () => {
    const model = new ScriptedModel([{ text: JSON.stringify(good) }]);
    await createAI({ host: new FakeHost(tmpDir()), settingsDir: tmpDir(), providerOverride: model }).writeScript('cvs', () => undefined);
    expect(model.requests).toHaveLength(1);
  });

  it('reads the first frame the writer planned', async () => {
    const model = new ScriptedModel([{ text: JSON.stringify({ ...good, firstFrame: 'Me holding a stack of 200 printed CVs' }) }]);
    const r = await createAI({ host: new FakeHost(tmpDir()), settingsDir: tmpDir(), providerOverride: model }).writeScript('cvs', () => undefined);
    expect(r.firstFrame).toBe('Me holding a stack of 200 printed CVs');
  });
});
