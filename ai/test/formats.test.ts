import { describe, it, expect } from 'vitest';
import { createAI, loadProject, saveProject } from '../src';
import { FORMATS, FORMAT_PROFILES, formatBlock, formatOf, projectFormat } from '../src/formats';
import { adaptedKit, INSTAGRAM } from '../src/platforms';
import { nicheConcepts } from '../src/niche';
import { parseAdapted } from '../src/editor';
import { FakeHost, ScriptedModel, makeProject, tmpDir } from './helpers';

const SWIPE = `# Swipe file

## Concepts

### A question, then a blunt answer
Best: 4.2x. Ask what the viewer is thinking, answer in one line.

### Bold claim against what everyone assumes
Best: 3.1x.

## 2026-11-02 · student athlete
| channel | x |
`;

describe('video formats', () => {
  it('are a vertical short, a horizontal short and long-form, each with its frame and length window', () => {
    expect([...FORMATS]).toEqual(['short-vertical', 'short-horizontal', 'long']);
    expect(FORMATS.map((f) => [FORMAT_PROFILES[f].width, FORMAT_PROFILES[f].height])).toEqual([[1080, 1920], [1920, 1080], [1920, 1080]]);
    for (const f of FORMATS) expect(FORMAT_PROFILES[f].seconds[0]).toBeLessThan(FORMAT_PROFILES[f].seconds[1]);
    expect(FORMAT_PROFILES.long.seconds[0]).toBeGreaterThanOrEqual(180);
  });

  it('falls back to a vertical short, and reads a project by its kind, else its shape', () => {
    expect(formatOf('long')).toBe('long');
    expect(formatOf('square')).toBe('short-vertical');
    expect(projectFormat({ width: 1080, height: 1920, fps: 30 })).toBe('short-vertical');
    expect(projectFormat({ width: 1920, height: 1080, fps: 30 })).toBe('short-horizontal');
    expect(projectFormat({ width: 1920, height: 1080, fps: 30, kind: 'long' })).toBe('long');
  });

  it('gives each format its own script and edit rules', () => {
    expect(formatBlock('short-vertical', 'script')).toMatch(/Reels first, then TikTok and YouTube Shorts/);
    expect(formatBlock('short-horizontal', 'edit')).toMatch(/BESIDE the face/);
    expect(formatBlock('long', 'script')).toMatch(/chapters/);
    expect(formatBlock('long', 'edit')).toMatch(/8 to 15 seconds/);
  });
});

describe('niche research from swipe.md', () => {
  it('takes only the Concepts section', () => {
    const c = nicheConcepts(SWIPE);
    expect(c).toMatch(/^### A question, then a blunt answer/);
    expect(c).not.toMatch(/student athlete/);
    expect(nicheConcepts('# Swipe file\n\n## 2026-11-02\nrows')).toBe('');
    expect(nicheConcepts(`## Concepts\n${'word '.repeat(2000)}`).length).toBeLessThan(4_100);
  });
});

describe('post kits', () => {
  it('Instagram first with 5 hashtags; TikTok 4; YouTube 3 with a title, a description for long-form', () => {
    expect(INSTAGRAM.hashtags).toBe(5);
    expect(adaptedKit('tiktok', 'short-vertical')).toMatchObject({ hashtags: 4, title: false });
    expect(adaptedKit('youtube', 'short-vertical')).toMatchObject({ label: 'YouTube Shorts', hashtags: 3, title: true });
    expect(adaptedKit('youtube', 'long')).toMatchObject({ label: 'YouTube', title: true });
    expect(adaptedKit('youtube', 'long').rules).toMatch(/Description/);
  });

  it('refuses an adapted kit that breaks its platform’s rules', () => {
    expect(parseAdapted({ caption: 'x', hashtags: ['a', 'b', 'c', 'd'] }, 'tiktok', 'short-vertical')).toMatchObject({ hashtags: ['#a', '#b', '#c', '#d'] });
    expect(parseAdapted({ caption: 'x', hashtags: ['a', 'b', 'c'] }, 'tiktok', 'short-vertical')).toBeNull();
    expect(parseAdapted({ caption: 'x', hashtags: ['a', 'a', 'b', 'c'] }, 'tiktok', 'short-vertical')).toBeNull();
    expect(parseAdapted({ caption: 'x', hashtags: ['a', 'b', 'c'] }, 'youtube', 'short-vertical')).toBeNull();
    expect(parseAdapted({ caption: 'x', hashtags: ['a', 'b', 'c'], title: 't'.repeat(101) }, 'youtube', 'long')).toBeNull();
    expect(parseAdapted({ caption: 'x', hashtags: ['a', 'b', 'c'], title: 'A title' }, 'youtube', 'long')).toEqual({ caption: 'x', hashtags: ['#a', '#b', '#c'], title: 'A title' });
  });
});

describe('adaptPost', () => {
  const reply = JSON.stringify({
    tiktok: { caption: 'Why baking bread takes so long', hashtags: ['sourdough', 'breadtok', 'baking', 'homebaker'] },
    youtube: { title: 'Why bread takes forever', caption: 'The waiting is the recipe.', hashtags: ['sourdough', 'baking', 'bread'] },
  });

  it('rewrites the Instagram post for TikTok and YouTube and saves where it came from', async () => {
    const { root, dir } = await makeProject();
    const p = await loadProject(dir);
    await saveProject(dir, { ...p, post: { caption: 'The hardest part of baking bread is waiting', hashtags: ['#a', '#b', '#c', '#d', '#e'], keywords: [] } });
    const model = new ScriptedModel([{ text: '{"tiktok": {"caption": "x", "hashtags": ["one"]}}' }, { text: reply }]);
    const ai = createAI({ host: new FakeHost(root), settingsDir: tmpDir(), providerOverride: model });
    const out = await ai.adaptPost(dir, () => undefined);
    expect(out.tiktok.hashtags).toHaveLength(4);
    expect(model.requests).toHaveLength(2);   // the first reply broke the rules, so it asked again
    expect(model.requests[0].system).toMatch(/The hardest part of baking bread is waiting/);
    expect(model.requests[0].system).toMatch(/YouTube Shorts|Title: at most 60/);
    expect(model.requests[0].system).not.toMatch(/\{\{\w+\}\}/);
    const saved = (await loadProject(dir)).post as any;
    expect(saved.caption).toBe('The hardest part of baking bread is waiting');
    expect(saved.adapted).toMatchObject({ from: 'The hardest part of baking bread is waiting', youtube: { title: 'Why bread takes forever' } });
  });

  it('long-form asks for a YouTube description, and there is nothing to adapt without an Instagram post', async () => {
    const { root, dir } = await makeProject();
    const p = await loadProject(dir);
    const model = new ScriptedModel([{ text: reply }]);
    const ai = createAI({ host: new FakeHost(root), settingsDir: tmpDir(), providerOverride: model });
    await expect(ai.adaptPost(dir, () => undefined)).rejects.toMatchObject({ code: 'no_post' });
    await saveProject(dir, { ...p, format: { ...p.format, width: 1920, height: 1080, kind: 'long' }, post: { caption: 'Bread', hashtags: [], keywords: [] } });
    await ai.adaptPost(dir, () => undefined);
    expect(model.requests[0].system).toMatch(/Long-form video/);
    expect(model.requests[0].system).toMatch(/Description: the first 150 characters/);
  });
});
