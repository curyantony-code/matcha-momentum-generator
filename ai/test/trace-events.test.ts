import { describe, expect, it } from 'vitest';
import { createAI, executeTool, newToolState, StyleStore, type AgentEvent, type ToolContext } from '../src';
import { traceArgs } from '../src/tools';
import { FakeHost, ScriptedModel, call, makeProject, tmpDir } from './helpers';

async function ctxFor(events: AgentEvent[]): Promise<ToolContext> {
  const { root, dir } = await makeProject({ withAnalysis: true });
  return { projectDir: dir, host: new FakeHost(root), style: new StyleStore(() => root), emit: (e) => events.push(e), state: newToolState(), supportsImages: true, lookupImpl: async () => ['93.184.215.14'] };
}

describe('the edit trace events', () => {
  it('every tool call emits a step, with its arguments and what came of it', async () => {
    const events: AgentEvent[] = [];
    const ctx = await ctxFor(events);
    await executeTool(ctx, 'set_cut', { keep: [{ from: 'w16', to: 'w56' }] });
    await executeTool(ctx, 'set_zoom', { zooms: 'not a list' });
    const steps = events.filter((e) => e.type === 'step') as Extract<AgentEvent, { type: 'step' }>[];
    expect(steps[0]).toMatchObject({ name: 'set_cut', ok: true, args: { keep: [{ from: 'w16', to: 'w56' }] } });
    expect(steps[1]).toMatchObject({ name: 'set_zoom', ok: false });
    expect(steps[1]!.error).toMatch(/invalid arguments/);
  });

  it('keeps long arguments short', () => {
    expect(traceArgs({ text: 'x'.repeat(500) }).text).toHaveLength(301);
    expect(traceArgs({ big: Array(400).fill('y'.repeat(200)) })).toEqual({ note: 'arguments too long to keep' });
    expect(traceArgs(null)).toEqual({});
  });

  it("the AI's text before its tool calls is emitted as a thought", async () => {
    const { root, dir } = await makeProject({ withAnalysis: true });
    const model = new ScriptedModel([{ text: 'The hook is the second take; cut the first.', toolCalls: [call('finish', { summary: 'Done.' })] }]);
    const events: AgentEvent[] = [];
    await createAI({ host: new FakeHost(root), settingsDir: tmpDir(), providerOverride: model }).firstEdit(dir, (e) => events.push(e)).catch(() => undefined);
    expect(events).toContainEqual({ type: 'thought', text: 'The hook is the second take; cut the first.' });
  });
});
