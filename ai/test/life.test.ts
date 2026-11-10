import { describe, it, expect } from 'vitest';
import { parseScriptReply } from '../src/scriptgen';
import { Prompts } from '../src/prompts';
import * as path from 'node:path';

const reply = (extra: Record<string, unknown>) => ({ hook: 'I flunked out of McGill.', script: 'I flunked out of McGill.\nHere is why.', onScreenText: [], ...extra });

describe('the L.I.F.E. formula in the script writer', () => {
  it('keeps the theme and level the model picked, whatever their case', () => {
    expect(parseScriptReply(reply({ theme: 'love', level: 'REAL' }))).toMatchObject({ theme: 'Love', level: 'Real' });
    expect(parseScriptReply(reply({ theme: ' Earnings ', level: 'Raw' }))).toMatchObject({ theme: 'Earnings', level: 'Raw' });
  });

  it('drops a theme or level that is not one of the four and three', () => {
    expect(parseScriptReply(reply({ theme: 'Money', level: 'Spicy' }))).toMatchObject({ theme: '', level: '' });
    expect(parseScriptReply(reply({}))).toMatchObject({ theme: '', level: '' });
  });

  it('puts their framework and brand in every script and idea request', async () => {
    const { createAI } = await import('../src');
    const { FakeHost, ScriptedModel, tmpDir } = await import('./helpers');
    const model = new ScriptedModel([
      { text: '{"hook": "I flunked out.", "script": "I flunked out.", "onScreenText": [], "theme": "Love", "level": "Real"}' },
      { text: '{"ideas": [{"idea": "The studio week", "hook": "8 hours a day in a studio."}]}' },
    ]);
    const ai = createAI({ host: new FakeHost(tmpDir()), settingsDir: tmpDir(), providerOverride: model });
    const ctx = { framework: 'FRAMEWORK: every day has a Today on Acme beat', brand: 'BRAND: a modern Renaissance man' };
    expect(await ai.writeScript('the studio', () => undefined, undefined, ctx)).toMatchObject({ theme: 'Love', level: 'Real' });
    await ai.suggestIdeas(() => undefined, undefined, ctx);
    for (const req of model.requests) {
      expect(req.system).toMatch(/Their script framework \(always follow it\)\n[\s\S]*FRAMEWORK: every day has a Today on Acme beat/);
      expect(req.system).toMatch(/BRAND: a modern Renaissance man/);
      expect(req.system).not.toMatch(/\{\{\w+\}\}/);
    }
  });

  it('asks for the theme and the Safe → Real → Raw → purpose → why → ask climb, and never invents a Raw fact', () => {
    const t = new Prompts(path.join(__dirname, '..', 'prompts')).raw('writeScript');
    expect(t).toMatch(/"theme": "Love" \| "Identity" \| "Fitness" \| "Earnings"/);
    expect(t).not.toMatch(/"level":/);                                   // one climb for every reel, not a level
    expect(t).toMatch(/1\. SAFE[\s\S]*2\. REAL[\s\S]*3\. RAW[\s\S]*4\. PURPOSE[\s\S]*5\. WHY[\s\S]*6\. The ask/);
    expect(t).toMatch(/never an invented one/);
  });
});
