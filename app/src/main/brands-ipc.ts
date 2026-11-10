// The Brands tab's IPC: list the brand profiles, save edits, show a file in Finder, and pick the brand new work is
// made for (the sidebar switch).
import { join } from 'node:path'
import { listBrands, saveBrand } from './brands'

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/

export interface BrandsDeps {
  handle(channel: string, fn: (e: unknown, ...args: any[]) => unknown): void
  /** The folder holding the <id>.md brand profiles. */
  dir(): string
  /** Shows a file in Finder. Not called in tests. */
  reveal(path: string): void
  /** The brand new work is made for, or null for none. */
  active(): string | null
  setActive(id: string | null): Promise<void>
}

export function registerBrandsIpc({ handle, dir, reveal, active, setActive }: BrandsDeps): void {
  handle('brands:list', () => listBrands(dir()))
  handle('brands:save', (_e, id: unknown, base: unknown, edits: unknown) => saveBrand(dir(), id, base, edits))
  handle('brands:reveal', (_e, id: unknown) => {
    // The page names a brand, never a path: main builds the path inside the brands folder.
    reveal(typeof id === 'string' && ID.test(id) ? join(dir(), `${id}.md`) : dir())
  })
  handle('brands:active', () => active())
  handle('brands:setActive', async (_e, id: unknown) => {
    if (id === null) return setActive(null)
    const known = typeof id === 'string' && (await listBrands(dir())).brands.some((b) => b.id === id)
    if (!known) throw { code: 'NOT_FOUND', userMessage: 'That brand is gone. It may have been moved or renamed.' }
    await setActive(id as string)
  })
}
