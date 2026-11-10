// Scripts are written before any video exists, so they live beside the projects, not inside one.
import { isLevel, isTheme, type Level, type Theme } from '../shared/life'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import type { SavedScript, ScriptResult } from '../shared/api'

export interface ScriptStore {
  list(): Promise<SavedScript[]>
  get(id: string): Promise<SavedScript | undefined>
  save(draft: ScriptResult): Promise<SavedScript>
  /** The person's own rewrite. Keeps the script's id, date and place in the list. */
  update(id: string, patch: { hook?: string; script?: string; theme?: Theme; level?: Level }): Promise<SavedScript>
  remove(id: string): Promise<void>
}

async function read(file: string): Promise<SavedScript[]> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return []
  }
  try {
    const data: unknown = JSON.parse(raw)
    return Array.isArray(data) ? (data as SavedScript[]) : []
  } catch {
    await fs.writeFile(`${file}.damaged`, raw)
    return []
  }
}

async function write(file: string, scripts: readonly SavedScript[]): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  await fs.writeFile(temp, JSON.stringify(scripts, null, 2))
  await fs.rename(temp, file)
}

const stores = new Map<string, ScriptStore>()

/** One store per file, so all saves share one queue. The file can change when the storage folder moves. */
export function scriptStoreFor(file: string): ScriptStore {
  const existing = stores.get(file)
  if (existing) return existing
  const store = createScriptStore(file)
  stores.set(file, store)
  return store
}

export function createScriptStore(file: string): ScriptStore {
  // One change at a time: two saves must not both read the old list.
  let queue: Promise<unknown> = Promise.resolve()
  const change = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => undefined)
    return next
  }
  return {
    list: () => read(file),
    get: async (id) => (await read(file)).find((s) => s.id === id),
    save: (draft) => {
      if (!draft.hook.trim() && !draft.script.trim()) {
        return Promise.reject({ code: 'EMPTY', userMessage: 'There is no script to save yet.' })
      }
      return change(async () => {
        // a theme or level the writer made up is dropped, not saved (shared/life.ts)
        const tags = draft as { theme?: unknown; level?: unknown }
        const { theme: _t, level: _l, ...rest } = draft as SavedScript
        const saved: SavedScript = {
          ...rest,
          ...(isTheme(tags.theme) ? { theme: tags.theme } : {}),
          ...(isLevel(tags.level) ? { level: tags.level } : {}),
          id: randomUUID(),
          createdAt: new Date().toISOString()
        }
        await write(file, [saved, ...(await read(file))])
        return saved
      })
    },
    update: (id, patch) =>
      change(async () => {
        const scripts = await read(file)
        const found = scripts.find((s) => s.id === id)
        if (!found) throw { code: 'NOT_FOUND', userMessage: 'That script is gone. It may have been deleted.' }
        const edited: SavedScript = {
          ...found,
          ...(typeof patch.hook === 'string' ? { hook: patch.hook } : {}),
          ...(typeof patch.script === 'string' ? { script: patch.script } : {}),
          ...(isTheme(patch.theme) ? { theme: patch.theme } : {}),
          ...(isLevel(patch.level) ? { level: patch.level } : {})
        }
        if (!edited.hook.trim() && !edited.script.trim()) throw { code: 'EMPTY', userMessage: 'A script needs some words in it.' }
        await write(file, scripts.map((s) => (s.id === id ? edited : s)))
        return edited
      }),
    remove: (id) =>
      change(async () => {
        const scripts = await read(file)
        const kept = scripts.filter((s) => s.id !== id)
        if (kept.length !== scripts.length) await write(file, kept)
      })
  }
}
