import { describe, it, expect } from 'vitest';
import { pickClips, repurpose } from '../src/editor';
import { Prompts } from '../src/prompts';

const words = [{ s: 1, e: 1.5, w: ' Hello' }, { s: 1.6, e: 2, w: ' there.' }];
const scores = { hook: 80, coherence: 80, emotion: 80, value: 80, payoff: 80 };
const clip = { start: 10, end: 40, title: 'T', hookLine: 'H', reason: 'R', scores };
const posts = { carousel: [1, 2, 3].map((n) => ({ title: `t${n}`, body: 'b' })), thread: ['one'], newsletter: { subject: 'S', body: 'B' } };

/** A model that answers from a list, recording each system prompt. */
function fakeProvider(replies: unknown[]) {
  const systems: string[] = [];
  let i = 0;
  const provider: any = {
    id: 'fake', model: 'fake',
    complete: async (req: { system: string }) => {
      systems.push(req.system);
      const reply = replies[Math.min(i++, replies.length - 1)];
      return { text: typeof reply === 'string' ? reply : JSON.stringify(reply), toolCalls: [] };
    },
  };
  return { provider, systems, calls: () => i };
}

const deps: any = { prompts: new Prompts(), style: { asPromptText: async () => 'STYLE RULES' } };
const quiet = () => {};

describe('pickClips', () => {
  it('puts the timed transcript and style rules in the prompt, and returns selected clips', async () => {
    const { provider, systems } = fakeProvider([{ clips: [clip] }]);
    const out = await pickClips(deps, provider, words, quiet);
    expect(out.map((c) => c.score)).toEqual([80]);
    expect(systems[0]).toContain('[1.00s] Hello there.');
    expect(systems[0]).toContain('STYLE RULES');
    expect(systems[0]).not.toContain('{{');
  });
  it('asks again after a bad reply', async () => {
    const { provider, calls } = fakeProvider(['not json', { clips: [clip] }]);
    expect((await pickClips(deps, provider, words, quiet)).length).toBe(1);
    expect(calls()).toBe(2);
  });
  it('fails plainly after two bad replies or with no AI', async () => {
    await expect(pickClips(deps, fakeProvider(['no']).provider, words, quiet)).rejects.toMatchObject({ code: 'clips_failed' });
    await expect(pickClips(deps, null, words, quiet)).rejects.toMatchObject({ code: 'no_ai' });
  });
});

describe('repurpose', () => {
  it('returns the checked posts', async () => {
    const { provider, systems } = fakeProvider([posts]);
    expect(await repurpose(deps, provider, words, quiet)).toEqual(posts);
    expect(systems[0]).not.toContain('{{');
  });
  it('fails plainly when the reply stays too long to post', async () => {
    const long = { ...posts, thread: ['x'.repeat(281)] };
    await expect(repurpose(deps, fakeProvider([long]).provider, words, quiet)).rejects.toMatchObject({ code: 'repurpose_failed' });
  });
});
