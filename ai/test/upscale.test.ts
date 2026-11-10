import { describe, expect, it } from 'vitest';
import { createAI, executeTool, loadProject, newToolState, StyleStore, ToolContext } from '../src';
import { saveProject } from '../src/project';
import { UPSCALE_MAX_ZOOM } from '../src/tools';
import { FakeHost, ScriptedModel, call, makeProject, tmpDir } from './helpers';

async function upscaleProject(style: Record<string, unknown> = {}) {
  const { root, dir } = await makeProject({ withAnalysis: true });
  const p = await loadProject(dir);
  await saveProject(dir, { ...p, look: { ...(p as any).look, editStyle: 'upscale' }, captions: { ...p.captions, style: { ...(p.captions.style ?? {}), preset: 'mine', ...style } } } as any);
  return { root, dir };
}

describe('the Upscale edit style', () => {
  it('first edit gets its rules and may only pick the key words of their subtitle style', async () => {
    const { root, dir } = await upscaleProject({ keyFont: 'DM Serif Display', keyScale: 1.9 });
    const model = new ScriptedModel([{ toolCalls: [call('finish', { summary: 'Done.' })] }]);
    await createAI({ host: new FakeHost(root), settingsDir: tmpDir(), providerOverride: model }).firstEdit(dir, () => undefined).catch(() => undefined);
    const task = (model.requests[0].messages[0] as any).content[0].text as string;
    expect(task).toContain('Edit style: Upscale');
    expect(task).toMatch(/pause over 0\.4 s/);
    expect(task).toMatch(/call set_caption_style only with `emphasis`/);
    expect(task).not.toMatch(/do not call set_caption_style\./);
  });

  it('a project without it gets none of it', async () => {
    const { root, dir } = await makeProject({ withAnalysis: true });
    const model = new ScriptedModel([{ toolCalls: [call('finish', { summary: 'Done.' })] }]);
    await createAI({ host: new FakeHost(root), settingsDir: tmpDir(), providerOverride: model }).firstEdit(dir, () => undefined).catch(() => undefined);
    expect((model.requests[0].messages[0] as any).content[0].text).not.toContain('Edit style: Upscale');
  });

  it('caps every push-in at 6%, and leaves other projects alone', async () => {
    const ctxOf = async (dir: string, root: string): Promise<ToolContext> => ({ projectDir: dir, host: new FakeHost(root), style: new StyleStore(() => root), emit: () => undefined, state: newToolState(), supportsImages: true, lookupImpl: async () => ['93.184.215.14'] });
    const up = await upscaleProject();
    await executeTool(await ctxOf(up.dir, up.root), 'set_cut', { keep: [{ from: 'w16', to: 'w56' }] });
    await executeTool(await ctxOf(up.dir, up.root), 'set_zoom', { zooms: [{ anchor: { from: 'w53', to: 'w56' }, scale: 1.15 }] });
    expect((await loadProject(up.dir)).zooms[0].scale).toBe(UPSCALE_MAX_ZOOM);
    const plain = await makeProject({ withAnalysis: true });
    await executeTool(await ctxOf(plain.dir, plain.root), 'set_cut', { keep: [{ from: 'w16', to: 'w56' }] });
    await executeTool(await ctxOf(plain.dir, plain.root), 'set_zoom', { zooms: [{ anchor: { from: 'w53', to: 'w56' }, scale: 1.15 }] });
    expect((await loadProject(plain.dir)).zooms[0].scale).toBe(1.15);
  });
});
