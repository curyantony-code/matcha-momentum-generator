import { describe, it, expect } from 'vitest';
import { executeTool, loadProject, newToolState, StyleStore, type ToolContext } from '../src';
import { FakeHost, makeProject } from './helpers';

async function ctxFor() {
  const { root, dir } = await makeProject();
  const ctx: ToolContext = { projectDir: dir, host: new FakeHost(root), style: new StyleStore(() => root), emit: () => undefined, state: newToolState(), supportsImages: true };
  return { ctx, dir };
}

const label = (extra: Record<string, unknown>) => ({
  anchor: { from: 'w1', to: 'w4' }, treatment: 'text-pop', asset: null, search: null, animation: null,
  params: { side: null, tilt: 0, scale: null, text: 'Freestyle more', iconic: null, style: 'label', ...extra }
});

describe('a hook title in the person\'s card colours', () => {
  it('keeps a label\'s #RRGGBB fill and ink', async () => {
    const { ctx, dir } = await ctxFor();
    const r = await executeTool(ctx, 'add_broll', label({ fill: '#1E1524', ink: '#F6F3F8' }));
    expect(r.isError, r.content).toBe(false);
    const b = (await loadProject(dir)).broll.at(-1)!;
    expect(b.params).toMatchObject({ style: 'label', fill: '#1E1524', ink: '#F6F3F8' });
  });

  it('refuses a colour that is not #RRGGBB', async () => {
    const { ctx } = await ctxFor();
    const r = await executeTool(ctx, 'add_broll', label({ fill: 'aubergine' }));
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/#RRGGBB/);
  });
});
