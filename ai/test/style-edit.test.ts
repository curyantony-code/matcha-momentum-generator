import { describe, it, expect } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { StyleStore } from '../src/style';

async function store(): Promise<StyleStore> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'style-edit-'));
  return new StyleStore(() => root);
}

describe('editing a My style rule', () => {
  it('rewords a rule in place, keeping its id, date and place in the list', async () => {
    const s = await store();
    const a = (await s.add('use big subtitles')).rule;
    const b = (await s.add('no music under talking')).rule;
    const r = await s.update(a.id, 'use subtitles three words at a time');
    expect(r).toEqual({ updated: true, rule: { ...a, text: 'Use subtitles three words at a time.' } });
    expect((await s.list()).map((x) => x.id)).toEqual([a.id, b.id]);
    expect((await s.list())[0].text).toBe('Use subtitles three words at a time.');
  });

  it('refuses wording another rule already has, and leaves both as they were', async () => {
    const s = await store();
    const a = (await s.add('use big subtitles')).rule;
    const b = (await s.add('no music under talking')).rule;
    const r = await s.update(a.id, 'No music under talking!');
    expect(r).toEqual({ updated: false, rule: b });
    expect((await s.list()).map((x) => x.text)).toEqual(['Use big subtitles.', 'No music under talking.']);
  });

  it('says so when the rule is gone, and refuses an empty rule', async () => {
    const s = await store();
    expect(await s.update('missing', 'anything')).toBeNull();
    const a = (await s.add('use big subtitles')).rule;
    await expect(s.update(a.id, '   ')).rejects.toThrow(/empty/);
    expect((await s.list())[0].text).toBe('Use big subtitles.');
  });

  it('runs edits one at a time so two quick saves both land', async () => {
    const s = await store();
    const a = (await s.add('first rule')).rule;
    const b = (await s.add('second rule')).rule;
    await Promise.all([s.update(a.id, 'first, reworded'), s.update(b.id, 'second, reworded')]);
    expect((await s.list()).map((x) => x.text)).toEqual(['First, reworded.', 'Second, reworded.']);
  });
});
