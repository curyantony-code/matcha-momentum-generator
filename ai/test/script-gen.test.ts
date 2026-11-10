import { describe, it, expect } from 'vitest';
import { hookStats, parseIdeas, parseScriptReply } from '../src/scriptgen';
import { suggestIdeas, writeScript } from '../src/editor';
import { Prompts } from '../src/prompts';

const reply = {
  hook: 'I look Italian and talk like I am Greek.',
  hookFormula: 'The flip',
  script: 'I look Italian and talk like I am Greek.\nI am neither.',
  onScreenText: ['Italian? Greek?'],
  otherHooks: [{ text: 'Where are you really from?', formula: 'The question they get' }, { text: '', formula: 'x' }, 'junk'],
};

function fakeProvider(replies: unknown[]) {
  const systems: string[] = [];
  let i = 0;
  const provider: any = {
    id: 'fake', model: 'fake',
    complete: async (req: { system: string }) => {
      systems.push(req.system);
      const r = replies[Math.min(i++, replies.length - 1)];
      return { text: typeof r === 'string' ? r : JSON.stringify(r), toolCalls: [] };
    },
  };
  return { provider, systems };
}
const deps: any = { prompts: new Prompts(), style: { asPromptText: async () => '' } };
const quiet = () => {};

describe('hookStats', () => {
  it('counts words and spoken seconds at the given pace', () => {
    expect(hookStats('one two three four five six seven eight', 160)).toEqual({ words: 8, seconds: 3 });
    expect(hookStats('  ', 160)).toEqual({ words: 0, seconds: 0 });
  });
});

describe('parseScriptReply', () => {
  it('keeps the script and only the usable other hooks, each with its timing', () => {
    const out = parseScriptReply(reply, 160)!;
    expect(out.hook).toBe(reply.hook);
    expect(out.hookFormula).toBe('The flip');
    expect(out.hooks.map((h) => h.text)).toEqual(['Where are you really from?']);
    expect(out.hooks[0]).toMatchObject({ formula: 'The question they get', words: 5 });
    expect(out.seconds).toBe(5);
  });
  it('accepts an older reply with no other hooks', () => {
    const out = parseScriptReply({ hook: 'H', script: 'H\nmore', onScreenText: [] }, 160)!;
    expect(out.hooks).toEqual([]);
    expect(out.hookFormula).toBe('');
  });
  it('refuses a reply without a hook or a script', () => {
    expect(parseScriptReply({ script: 'x' }, 160)).toBeNull();
    expect(parseScriptReply(null, 160)).toBeNull();
  });
});

describe('parseIdeas', () => {
  it('keeps ideas that have both a topic and a hook', () => {
    expect(parseIdeas({ ideas: [{ idea: 'A', hook: 'B' }, { idea: '', hook: 'C' }, 'x'] })).toEqual([{ idea: 'A', hook: 'B' }]);
  });
  it('gives null when nothing is usable', () => {
    expect(parseIdeas({ ideas: [] })).toBeNull();
    expect(parseIdeas('x')).toBeNull();
  });
});

describe('writeScript with a voice and a format', () => {
  it('puts the voice file and the format into the prompt', async () => {
    const { provider, systems } = fakeProvider([reply]);
    await writeScript(deps, provider, 'my background', quiet, undefined, { voice: 'VOICE FILE TEXT', format: 'FORMAT TEXT' });
    expect(systems[0]).toContain('VOICE FILE TEXT');
    expect(systems[0]).toContain('FORMAT TEXT');
    expect(systems[0]).not.toContain('{{');
  });
  it('still works with neither', async () => {
    const { provider, systems } = fakeProvider([reply]);
    const out = await writeScript(deps, provider, 'idea', quiet);
    expect(out.hooks.length).toBe(1);
    expect(systems[0]).not.toContain('{{');
    expect(systems[0]).toContain('not enough posted videos with views yet');
  });
  it('tells the writer which of their own hooks worked', async () => {
    const { provider, systems } = fakeProvider([reply]);
    await writeScript(deps, provider, 'idea', quiet, undefined, { results: '- 4.5x "I flunked out of McGill." (Confession)' });
    expect(systems[0]).toContain('4.5x "I flunked out of McGill." (Confession)');
    expect(systems[0]).not.toContain('not enough posted videos');
  });
});

describe('suggestIdeas', () => {
  it('asks from the voice file and skips topics already written', async () => {
    const { provider, systems } = fakeProvider([{ ideas: [{ idea: 'Airport story', hook: 'My mom yelled at me.' }] }]);
    const out = await suggestIdeas(deps, provider, quiet, undefined, { voice: 'VOICE', avoid: ['Old topic'], results: 'WINNING HOOKS' });
    expect(out).toEqual([{ idea: 'Airport story', hook: 'My mom yelled at me.' }]);
    expect(systems[0]).toContain('VOICE');
    expect(systems[0]).toContain('WINNING HOOKS');
    expect(systems[0]).toContain('Old topic');
    expect(systems[0]).not.toContain('{{');
  });
  it('fails plainly with no AI', async () => {
    await expect(suggestIdeas(deps, null, quiet)).rejects.toMatchObject({ code: 'no_ai' });
  });
});
