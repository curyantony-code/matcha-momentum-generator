import { describe, it, expect } from 'vitest';
import { compact, forWriting } from '../src/context';

describe('fewer tokens for the same instructions', () => {
  it('the script writer sends the same system prompt for every idea, so the prompt cache serves it', async () => {
    const { createAI } = await import('../src');
    const { FakeHost, ScriptedModel, tmpDir } = await import('./helpers');
    const reply = { text: '{"hook": "A", "script": "A", "onScreenText": [], "theme": "Love", "level": "Safe"}' };
    const model = new ScriptedModel([reply, reply]);
    const ai = createAI({ host: new FakeHost(tmpDir()), settingsDir: tmpDir(), providerOverride: model });
    const ctx = { voice: 'VOICE', framework: 'FRAMEWORK', brand: 'BRAND' };
    await ai.writeScript('the studio week', () => undefined, undefined, ctx);
    await ai.writeScript('fall is the best season', () => undefined, undefined, ctx);
    expect(model.requests[0].system).toBe(model.requests[1].system);
    expect(model.requests[1].system).not.toMatch(/fall is the best season/);
    expect(JSON.stringify(model.requests[1].messages)).toMatch(/fall is the best season/);
  });

  it('drops empty fill-in lines, comments and blank runs, keeps the rest word for word', () => {
    const text = '# Voice\n- Pace: 160 wpm\n- {{what that viewer is stuck on}}\n- Energy: {{to fill}}\n<!-- note -->\n\n\n\n- Words I use: "glazed central"';
    expect(compact(text)).toBe('# Voice\n- Pace: 160 wpm\n\n- Words I use: "glazed central"');
  });

  it('leaves out the parts of brand.md and framework.md that are for people, not for writing', () => {
    const brand = '# Brand\n## The idea\nNobody is just a job title.\n## Bio options\n- Instagram: ...\n## Taglines to choose from\n1. ...\n## Voice and tone\nShort lines.';
    expect(forWriting(brand, 'brand')).toBe('# Brand\n## The idea\nNobody is just a job title.\n## Voice and tone\nShort lines.');
    const framework = '## 7. Writing rules\nCut a fifth.\n## 8. Studying a reference (what to copy)\nTeardowns.';
    expect(forWriting(framework, 'framework')).toBe('## 7. Writing rules\nCut a fifth.');
  });
});
