// "My style": durable user preferences, persisted in <Matcha Momentum Generator root>/My style.json.
import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { readJson, styleFile, writeFileAtomic } from './project';

export interface StyleRule { id: string; text: string; createdAt: string }
export interface StyleFile { version: 1; rules: StyleRule[] }

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, '').replace(/\s+/g, ' ').trim();

/** A rule as it is shown and stored: one sentence, capitalised, ending in a full stop. */
export function cleanRuleText(text: string): string {
  let clean = String(text ?? '').replace(/\s*—\s*/g, ', ').replace(/\s+/g, ' ').trim();
  if (!clean) throw new Error('empty rule');
  if (!/[.!?]$/.test(clean)) clean += '.';
  return clean[0].toUpperCase() + clean.slice(1);
}

/** The user's note itself asks for a lasting habit ("always...", "from now on...", "remember...",
 * "in every video..."). Only then is a rule saved without asking; otherwise it is only proposed
 * (novice test: "I also saved this to My style" for a note that never asked was surprising). */
export function noteAsksToRemember(note: string | undefined): boolean {
  return !!note && /\b(always|never again|from now on|going forward|in (the )?future|remember|every (video|time|reel)|all (my|of my|future) (videos|reels)|for next time|next time)\b/i.test(note);
}

export class StyleStore {
  /** `fileFor`: the app's pick of rules file (one per brand), read on every call; default My style.json in the root. */
  constructor(private readonly rootDir: () => string, private readonly fileFor?: () => string | undefined) {}

  /** add/remove are read-modify-write of one file shared by every project: run them one at a time
   * (two edits saving a rule at once used to drop one of them; review finding 36). */
  private chain: Promise<unknown> = Promise.resolve();
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.catch(() => undefined).then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  get file(): string { return this.fileFor?.() || styleFile(this.rootDir()); }

  /** `file`: resolved once by the caller, so a brand switch mid-edit cannot send one edit to two files. */
  async list(file: string = this.file): Promise<StyleRule[]> {
    if (!fs.existsSync(file)) return [];
    try {
      const data = await readJson<StyleFile>(file);
      return Array.isArray(data?.rules) ? data.rules.filter((r) => r && typeof r.text === 'string') : [];
    } catch { return []; }
  }

  private async write(rules: StyleRule[], file: string): Promise<void> {
    await writeFileAtomic(file, JSON.stringify({ version: 1, rules } satisfies StyleFile, null, 2) + '\n');
  }

  /** Adds a rule unless an equivalent one already exists. */
  async add(text: string): Promise<{ added: boolean; rule: StyleRule }> {
    const file = this.file;
    return this.serial(() => this.addNow(text, file));
  }

  /** The saved rule equivalent to `text`, if any. */
  async find(text: string): Promise<StyleRule | undefined> {
    const n = normalize(cleanRuleText(text));
    return (await this.list()).find((r) => normalize(r.text) === n);
  }

  private async addNow(text: string, file: string): Promise<{ added: boolean; rule: StyleRule }> {
    const clean = cleanRuleText(text);
    const rules = await this.list(file);
    const dup = rules.find((r) => normalize(r.text) === normalize(clean));
    if (dup) return { added: false, rule: dup };
    const rule: StyleRule = { id: randomUUID(), text: clean, createdAt: new Date().toISOString() };
    await this.write([...rules, rule], file);
    return { added: true, rule };
  }

  /** New wording for one rule (same id and date). Refused when another rule already says the same thing,
   * so the list never holds two copies. Returns null when the id is gone (removed elsewhere). */
  async update(id: string, text: string): Promise<{ updated: boolean; rule: StyleRule } | null> {
    const file = this.file;
    return this.serial(async () => {
      const clean = cleanRuleText(text);
      const rules = await this.list(file);
      const current = rules.find((r) => r.id === id);
      if (!current) return null;
      const dup = rules.find((r) => r.id !== id && normalize(r.text) === normalize(clean));
      if (dup) return { updated: false, rule: dup };
      const rule: StyleRule = { ...current, text: clean };
      await this.write(rules.map((r) => (r.id === id ? rule : r)), file);
      return { updated: true, rule };
    });
  }

  async remove(id: string): Promise<void> {
    const file = this.file;
    return this.serial(async () => {
      const rules = await this.list(file);
      await this.write(rules.filter((r) => r.id !== id), file);
    });
  }

  async asPromptText(): Promise<string> {
    const rules = await this.list();
    return rules.length ? rules.map((r) => `- ${r.text}`).join('\n') : '(none yet)';
  }
}
