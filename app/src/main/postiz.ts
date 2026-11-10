// Publishing through the Postiz CLI. It is AGPL, so it is never bundled or imported: the person installs it and this
// starts it as a separate program. Its login stays in its own credentials; this app never sees or stores them.
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PublishChannel, PublishResult, PublishStatus } from '../shared/api'

export interface PostRequest {
  video: string
  caption: string
  title: string
  channelIds: string[]
  /** 'draft' stays in Postiz for review; an ISO date schedules a real post. */
  when: string
  /** Per channel kind (tiktok, youtube): its own caption and title, used instead of `caption` and `title`. */
  adapted?: Record<string, { caption: string; title?: string }>
}

export interface Postiz {
  status(): Promise<PublishStatus>
  /** Throws if nothing was sent. If only some accounts got it, says which, so a retry cannot post to them twice. */
  send(req: PostRequest): Promise<PublishResult>
}

export type Settings = Record<string, string | boolean>

const LOOKUP_MS = 30_000
const UPLOAD_MS = 10 * 60_000
const POST_MS = 2 * 60_000
const OUTPUT_LIMIT = 16 * 1024 * 1024
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin']

/** An app opened from Finder does not get the shell's PATH, and npm's global folder is often not on it anyway. */
export function searchPath(path: string | undefined, home: string): string {
  return [path, join(home, '.npm-global', 'bin'), ...EXTRA_PATH].filter(Boolean).join(':')
}

class MissingProgram extends Error {}

function run(bin: string, args: string[], timeout: number): Promise<string> {
  const env = { ...process.env, PATH: searchPath(process.env.PATH, homedir()) }
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, env, maxBuffer: OUTPUT_LIMIT }, (err, stdout) => {
      if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') reject(new MissingProgram(bin))
      else if (err) reject(err)
      else resolve(stdout)
    })
  })
}

/** The CLI prints a decorated line, then JSON that may run over many lines. */
export function parseCliJson(out: string): unknown {
  const start = out.search(/^[[{]/m)
  if (start < 0) return null
  const end = Math.max(out.lastIndexOf(']'), out.lastIndexOf('}'))
  try {
    return JSON.parse(out.slice(start, end + 1))
  } catch {
    return null
  }
}

/** What each platform needs. TikTok's other method only drops the video in an inbox while still reporting success. */
export function channelSettings(identifier: string, title: string): Settings {
  if (identifier === 'tiktok') {
    return { privacy_level: 'PUBLIC_TO_EVERYONE', duet: true, stitch: true, content_posting_method: 'DIRECT_POST' }
  }
  if (identifier === 'youtube') return { title, type: 'public' }
  if (identifier === 'instagram') return { post_type: 'post' }
  return {}
}

function parseChannels(data: unknown): PublishChannel[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((c) => {
    const { id, name, identifier } = (c ?? {}) as Record<string, unknown>
    return typeof id === 'string' && typeof identifier === 'string'
      ? [{ id, identifier, name: typeof name === 'string' && name ? name : identifier }]
      : []
  })
}

function checkTime(when: string, now: number): string {
  if (when === 'draft') return new Date(now).toISOString()
  const at = Date.parse(when)
  if (!Number.isFinite(at) || at <= now) {
    throw { code: 'BAD_TIME', userMessage: 'Pick a time in the future for this post.' }
  }
  return when
}

const groupByKind = (channels: readonly PublishChannel[]): PublishChannel[][] =>
  [...new Set(channels.map((c) => c.identifier))].map((kind) => channels.filter((c) => c.identifier === kind))

export function createPostiz({ bin = 'postiz' }: { bin?: string } = {}): Postiz {
  const channelLimit = async (id: string): Promise<number> => {
    const data = parseCliJson(await run(bin, ['integrations:settings', id], LOOKUP_MS)) as { output?: { maxLength?: unknown } } | null
    const max = data?.output?.maxLength
    return typeof max === 'number' ? max : Infinity
  }

  const channels = async (): Promise<PublishChannel[]> => parseChannels(parseCliJson(await run(bin, ['integrations:list'], LOOKUP_MS)))

  const status = async (): Promise<PublishStatus> => {
    try {
      return { state: 'ready', channels: await channels() }
    } catch (e) {
      if (e instanceof MissingProgram) return { state: 'missing', channels: [] }
      return { state: /no subscription/i.test(String((e as Error).message)) ? 'no-subscription' : 'signed-out', channels: [] }
    }
  }

  const upload = async (video: string): Promise<string> => {
    const data = parseCliJson(await run(bin, ['upload', video], UPLOAD_MS)) as { path?: unknown } | null
    if (typeof data?.path !== 'string') throw new Error('no path in upload reply')
    return data.path
  }

  const create = (group: readonly PublishChannel[], req: PostRequest, media: string, date: string, caption: string, title: string): Promise<string> => {
    const settings = channelSettings(group[0].identifier, title)
    return run(bin, [
      'posts:create', '-c', caption, '-s', date, '-t', req.when === 'draft' ? 'draft' : 'schedule', '-m', media,
      '-i', group.map((c) => c.id).join(','),
      ...(Object.keys(settings).length ? ['--settings', JSON.stringify(settings)] : [])
    ], POST_MS)
  }

  const send = async (req: PostRequest): Promise<PublishResult> => {
    const date = checkTime(req.when, Date.now())
    const known = await channels().catch(() => {
      throw { code: 'POSTIZ_UNREACHABLE', userMessage: 'I could not reach Postiz. Check it is signed in, then try again.' }
    })
    const chosen = known.filter((c) => req.channelIds.includes(c.id))
    if (!chosen.length || chosen.length !== req.channelIds.length) {
      throw { code: 'BAD_CHANNEL', userMessage: 'Pick at least one account that is connected in Postiz.' }
    }
    // A caption starting with a dash would be read as a command flag. TikTok and YouTube get their adapted post.
    const noFlag = (s: string): string => s.replace(/^[-\s]+/, '')
    const textFor = (kind: string): { caption: string; title: string } => ({
      caption: noFlag(req.adapted?.[kind]?.caption ?? req.caption),
      title: req.adapted?.[kind]?.title ?? req.title
    })
    for (const channel of chosen) {
      const { caption } = textFor(channel.identifier)
      if (caption.length > (await channelLimit(channel.id))) {
        throw { code: 'TOO_LONG', userMessage: `This caption is too long for ${channel.name}. Shorten it and try again.` }
      }
    }
    const media = await upload(req.video).catch(() => {
      throw { code: 'UPLOAD_FAILED', userMessage: 'I could not upload your video to Postiz. Try again.' }
    })
    const sent: PublishChannel[] = []
    for (const group of groupByKind(chosen)) {
      try {
        const text = textFor(group[0].identifier)
        await create(group, req, media, date, text.caption, text.title)
      } catch {
        // A timed-out call may still have gone through, so never promise that it did not.
        const failed = `I could not confirm the post to ${group.map((c) => c.name).join(', ')}. Check Postiz before trying again.`
        if (!sent.length) throw { code: 'POST_FAILED', userMessage: failed }
        return { channels: sent.map((c) => c.name), sentIds: sent.map((c) => c.id), failed }
      }
      sent.push(...group)
    }
    return { channels: sent.map((c) => c.name), sentIds: sent.map((c) => c.id), failed: null }
  }

  return { status, send }
}
