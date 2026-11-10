import { describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { channelSettings, createPostiz, parseCliJson, searchPath } from '../src/main/postiz'

/** A stand-in `postiz` program: records its arguments, answers like the real one (header line, then JSON). */
function fakeCli(script: string): { bin: string; calls: () => string[][] } {
  const dir = mkdtempSync(join(tmpdir(), 'postiz-'))
  const log = join(dir, 'calls.log')
  const bin = join(dir, 'postiz')
  writeFileSync(log, '')
  writeFileSync(bin, `#!/bin/sh\nfor a in "$@"; do printf '%s\\037' "$a" >> "${log}"; done; echo >> "${log}"\n${script}\n`)
  chmodSync(bin, 0o755)
  return {
    bin,
    calls: () => readFileSync(log, 'utf8').trim().split('\n').map((l) => l.split('\x1f').filter(Boolean))
  }
}

const HAPPY = `case "$1" in
  integrations:list) echo "Integrations:"; echo '[{"id":"t1","name":"My TikTok","identifier":"tiktok"},{"id":"i1","name":"My IG","identifier":"instagram"}]';;
  integrations:settings) echo '{"output":{"maxLength":2200}}';;
  upload) echo '{"path":"https://cdn.example/v.mp4"}';;
  posts:create) echo '[{"postId":"p1"}]';;
esac`

const post = { video: '/v/export.mp4', caption: 'My post', title: 'My video', channelIds: ['t1'] }
const flag = (args: string[], name: string): string => args[args.indexOf(name) + 1]

// Postiz runs on macOS and Linux for now: its program lookup builds a ':' PATH of Unix folders, and these stand-ins are
// shell scripts Windows cannot start (spawn EFTYPE). Windows support needs a .cmd-aware runner first.
const UNIX_ONLY = process.platform === 'win32'

describe('reading the CLI output', () => {
  it('skips the header line printed before the JSON', () => {
    expect(parseCliJson('Integrations:\n[{"id":"a"}]\n')).toEqual([{ id: 'a' }])
    expect(parseCliJson('{"path":"x"}')).toEqual({ path: 'x' })
  })
  it('gives null for output that holds no JSON', () => {
    expect(parseCliJson('Something broke')).toBeNull()
  })
})

describe('channel settings', () => {
  it('publishes to TikTok for real, never to the TikTok inbox', () => {
    expect(channelSettings('tiktok', 'T').content_posting_method).toBe('DIRECT_POST')
  })
  it('gives YouTube the title it requires', () => {
    expect(channelSettings('youtube', 'My video')).toMatchObject({ title: 'My video', type: 'public' })
  })
  it('gives Instagram a post type and leaves others alone', () => {
    expect(channelSettings('instagram', 'T')).toEqual({ post_type: 'post' })
    expect(channelSettings('bluesky', 'T')).toEqual({})
  })
})

describe.skipIf(UNIX_ONLY)('finding the program', () => {
  it('looks where npm puts global programs, not only on PATH', () => {
    expect(searchPath('/usr/bin', '/Users/me')).toContain('/Users/me/.npm-global/bin')
    expect(searchPath('/usr/bin', '/Users/me')).toContain('/opt/homebrew/bin')
    expect(searchPath('/usr/bin', '/Users/me').split(':')[0]).toBe('/usr/bin')
  })
})

describe.skipIf(UNIX_ONLY)('postiz', () => {
  it('says so when the program is not installed', async () => {
    const p = createPostiz({ bin: '/nope/postiz' })
    expect(await p.status()).toEqual({ state: 'missing', channels: [] })
  })

  it('says so when the program is installed but not signed in', async () => {
    const p = createPostiz({ bin: fakeCli('echo "Not authenticated" >&2; exit 1').bin })
    expect(await p.status()).toEqual({ state: 'signed-out', channels: [] })
  })

  it('tells a missing plan apart from a missing login', async () => {
    const script = `echo 'Failed to list integrations: Request failed: API Error (401): {"msg":"No subscription found"}' >&2; exit 1`
    expect(await createPostiz({ bin: fakeCli(script).bin }).status()).toEqual({ state: 'no-subscription', channels: [] })
  })

  it('lists the connected channels', async () => {
    const p = createPostiz({ bin: fakeCli(HAPPY).bin })
    const s = await p.status()
    expect(s.state).toBe('ready')
    expect(s.channels.map((c) => c.id)).toEqual(['t1', 'i1'])
  })

  it('uploads first, then creates a draft that uses the uploaded file', async () => {
    const cli = fakeCli(HAPPY)
    await createPostiz({ bin: cli.bin }).send({ ...post, when: 'draft' })
    const calls = cli.calls()
    expect(calls.map((c) => c[0])).toEqual(['integrations:list', 'integrations:settings', 'upload', 'posts:create'])
    const create = calls[3]
    expect(flag(create, '-t')).toBe('draft')
    expect(flag(create, '-m')).toBe('https://cdn.example/v.mp4')
    expect(flag(create, '-c')).toBe('My post')
    expect(flag(create, '-i')).toBe('t1')
    expect(JSON.parse(flag(create, '--settings')).content_posting_method).toBe('DIRECT_POST')
  })

  it('makes one post per kind of channel, with its own settings, from a single upload', async () => {
    const cli = fakeCli(HAPPY)
    await createPostiz({ bin: cli.bin }).send({ ...post, channelIds: ['t1', 'i1'], when: 'draft' })
    const calls = cli.calls()
    expect(calls.filter((c) => c[0] === 'upload').length).toBe(1)
    const creates = calls.filter((c) => c[0] === 'posts:create')
    expect(creates.map((c) => flag(c, '-i'))).toEqual(['t1', 'i1'])
    expect(JSON.parse(flag(creates[1], '--settings'))).toEqual({ post_type: 'post' })
  })

  it('gives TikTok its adapted caption and the other accounts the Instagram one', async () => {
    const cli = fakeCli(HAPPY)
    await createPostiz({ bin: cli.bin }).send({ ...post, channelIds: ['t1', 'i1'], when: 'draft', adapted: { tiktok: { caption: 'TikTok words #a #b #c #d' } } })
    const creates = cli.calls().filter((c) => c[0] === 'posts:create')
    expect(creates.map((c) => flag(c, '-c'))).toEqual(['TikTok words #a #b #c #d', post.caption])
  })

  it('schedules at the chosen time', async () => {
    const cli = fakeCli(HAPPY)
    const when = new Date(Date.now() + 3_600_000).toISOString()
    await createPostiz({ bin: cli.bin }).send({ ...post, when })
    const create = cli.calls().find((c) => c[0] === 'posts:create')!
    expect(flag(create, '-s')).toBe(when)
    expect(flag(create, '-t')).toBe('schedule')
  })

  it('refuses a time in the past or a bad time before uploading anything', async () => {
    const cli = fakeCli(HAPPY)
    const p = createPostiz({ bin: cli.bin })
    await expect(p.send({ ...post, when: '2001-01-01T00:00:00Z' })).rejects.toMatchObject({ code: 'BAD_TIME' })
    await expect(p.send({ ...post, when: 'tomorrow' })).rejects.toMatchObject({ code: 'BAD_TIME' })
    expect(cli.calls().flat()).not.toContain('upload')
  })

  it('refuses a channel that is not connected, and an empty choice', async () => {
    const p = createPostiz({ bin: fakeCli(HAPPY).bin })
    await expect(p.send({ ...post, channelIds: ['ghost'], when: 'draft' })).rejects.toMatchObject({ code: 'BAD_CHANNEL' })
    await expect(p.send({ ...post, channelIds: [], when: 'draft' })).rejects.toMatchObject({ code: 'BAD_CHANNEL' })
  })

  it('refuses a caption over the channel limit before uploading', async () => {
    const cli = fakeCli(HAPPY)
    const long = 'x'.repeat(2201)
    await expect(createPostiz({ bin: cli.bin }).send({ ...post, caption: long, when: 'draft' })).rejects.toMatchObject({ code: 'TOO_LONG' })
    expect(cli.calls().flat()).not.toContain('upload')
  })

  it('never lets a caption be read as a command flag', async () => {
    const cli = fakeCli(HAPPY)
    await createPostiz({ bin: cli.bin }).send({ ...post, caption: '--json /etc/passwd', when: 'draft' })
    const create = cli.calls().find((c) => c[0] === 'posts:create')!
    expect(flag(create, '-c').startsWith('-')).toBe(false)
  })

  it('says which accounts got the post when only some did, so a retry cannot post twice', async () => {
    const script = HAPPY.replace(`posts:create) echo '[{"postId":"p1"}]';;`, `posts:create) case "$*" in *"-i i1"*) exit 1;; *) echo '[{"postId":"p1"}]';; esac;;`)
    const out = await createPostiz({ bin: fakeCli(script).bin }).send({ ...post, channelIds: ['t1', 'i1'], when: 'draft' })
    expect(out.sentIds).toEqual(['t1'])
    expect(out.channels).toEqual(['My TikTok'])
    expect(out.failed).toContain('My IG')
  })

  it('tells the person to look in Postiz before retrying, because a failed call may still have posted', async () => {
    const script = HAPPY.replace(`posts:create) echo '[{"postId":"p1"}]';;`, 'posts:create) exit 1;;')
    await expect(createPostiz({ bin: fakeCli(script).bin }).send({ ...post, when: 'draft' })).rejects.toMatchObject({ userMessage: expect.stringContaining('Check Postiz') })
  })

  it('says Postiz could not be reached, not that no account was picked', async () => {
    const p = createPostiz({ bin: fakeCli('exit 1').bin })
    await expect(p.send({ ...post, when: 'draft' })).rejects.toMatchObject({ code: 'POSTIZ_UNREACHABLE' })
  })

  it('reports a failed post plainly, naming the channel', async () => {
    const script = HAPPY.replace(`posts:create) echo '[{"postId":"p1"}]';;`, 'posts:create) echo "rejected" >&2; exit 1;;')
    await expect(createPostiz({ bin: fakeCli(script).bin }).send({ ...post, when: 'draft' })).rejects.toMatchObject({ code: 'POST_FAILED', userMessage: expect.stringContaining('My TikTok') })
  })
})
