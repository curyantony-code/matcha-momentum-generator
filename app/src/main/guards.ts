// Checks on what the page asks the main process to do with the computer: which folders it may reveal, which root it
// may move to, which web pages it may open. The page is trusted to ask only for the app's own things; these make
// sure a page that went wrong (a bug, injected content) can't ask for anything else (security review, Nov 2026).
import { win32 } from 'node:path'
import { isInsideFolder } from './inside-folder'

/** A network location (\\server\share, \\?\UNC\..., //server): touching one can send the Windows login to it. */
export function isNetworkPath(p: string, platform: NodeJS.Platform = process.platform): boolean {
  const s = p.trim()
  if (/^\\\\\?\\UNC\\/i.test(s)) return true
  if (platform === 'win32') return /^[\\/]{2}/.test(s) && !/^\\\\\?\\[a-z]:/i.test(s)
  return /^\/\/[^/]/.test(s)
}

/**
 * Whether a path may be shown in Finder / Explorer: a real path inside one of the app's folders, never a network path,
 * and never an app bundle (opening a .app folder launches it). `real` resolves symlinks; it returns null for a path
 * that doesn't exist.
 */
export async function mayReveal(p: unknown, roots: string[], real: (p: string) => Promise<string | null>, platform: NodeJS.Platform = process.platform): Promise<boolean> {
  if (typeof p !== 'string' || !p.trim() || isNetworkPath(p, platform)) return false
  if (/\.app[\\/]*$/i.test(p)) return false
  const target = await real(p)
  if (!target) return false
  for (const r of roots) {
    const root = await real(r)
    if (root && isInsideFolder(target, root, platform)) return true
  }
  return false
}

/** A new home for the app's folder: only the folder just picked in the system dialog, and never a network share. */
export function mayUseAsRoot(p: unknown, picked: string | null, platform: NodeJS.Platform = process.platform): p is string {
  if (typeof p !== 'string' || !picked || isNetworkPath(p, platform)) return false
  return platform === 'win32' ? win32.resolve(p).toLowerCase() === win32.resolve(picked).toLowerCase() : p === picked
}

/** The sites the app links to (help pages, sign-in and plans, where a video lives, the app's own site). */
export const LINK_HOSTS = [
  'github.com',
  'anthropic.com',
  'claude.ai',
  'claude.com',
  'chatgpt.com',
  'openai.com',
  'ollama.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'icloud.com',
  'drive.google.com',
  'phosphoricons.com',
  'openfontlicense.org',
  'scripts.sil.org',
  'nayuki.io'
] as const

/** Whether a link from the page may open in the browser: https, to one of LINK_HOSTS or a subdomain of one. */
export function mayOpenLink(url: unknown): boolean {
  if (typeof url !== 'string') return false
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  const host = u.hostname.toLowerCase()
  return LINK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
}

/** What the page may be granted: fullscreen (the video player) and writing to the clipboard. */
export const PAGE_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write'])
