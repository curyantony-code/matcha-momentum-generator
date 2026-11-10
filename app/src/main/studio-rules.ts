// The Studio tab's rules, kept free of Electron so they can be tested: which pages the OpenReel view may show,
// the area the page may ask for, and the "for OpenReel" exports it lists.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export const STUDIO_URL = 'https://openreel.video/'
export const STUDIO_PARTITION = 'persist:openreel'
/** Everything else (camera, microphone, location, notifications, MIDI...) is refused. */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write', 'fullscreen'])
const MAX_EXPORTS = 12

export interface StudioBounds {
  x: number
  y: number
  width: number
  height: number
}

/** openreel.video and its subdomains, over https only. */
export function isStudioUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && (u.hostname === 'openreel.video' || u.hostname.endsWith('.openreel.video'))
  } catch {
    return false
  }
}

/** The area the page asked for, as whole pixels inside a sane range, or null. */
export function cleanBounds(raw: unknown): StudioBounds | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const n = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(20000, Math.max(0, Math.round(v))) : null
  const [x, y, width, height] = [n(r.x), n(r.y), n(r.width), n(r.height)]
  if (x === null || y === null || width === null || height === null || width < 50 || height < 50) return null
  return { x, y, width, height }
}

export interface StudioExport {
  name: string
  path: string
  at: string
}

/** The "for OpenReel" folders in Library > Exports, newest first. */
export async function openReelExports(exportsDir: string): Promise<StudioExport[]> {
  const names = await fs.readdir(exportsDir).catch(() => [] as string[])
  const found = await Promise.all(
    names
      .filter((n) => n.endsWith(' for OpenReel'))
      .map(async (name) => {
        const path = join(exportsDir, name)
        const st = await fs.stat(path).catch(() => null)
        return st?.isDirectory() ? { name: name.replace(/ for OpenReel$/, ''), path, at: st.mtime.toISOString() } : null
      })
  )
  return found.filter((e): e is StudioExport => e !== null).sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_EXPORTS)
}
