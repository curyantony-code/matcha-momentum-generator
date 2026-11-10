import { describe, expect, it } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createOpenMontage } from '../src/main/openmontage'

/** A stand-in bridge: keeps the request it read, prints a fixed reply. */
function fakeBridge(reply: string, exit = 0): { bin: string; request: () => any } {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-'))
  const bin = join(dir, 'run.sh')
  writeFileSync(bin, `#!/bin/sh\ncat > "${dir}/request.json"\necho "noise" >&2\necho '${reply}'\nexit ${exit}\n`)
  chmodSync(bin, 0o755)
  return { bin, request: () => JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8')) }
}

const dest = (): string => join(mkdtempSync(join(tmpdir(), 'made-')), 'made.mp4')
const tool = { name: 'grok_video', provider: 'grok', capability: 'video_generation', costUsd: 0.5 }

// The OpenMontage bridge is a shell script (~/matcha/bridge/run.sh), so it runs on macOS and Linux only; these
// stand-ins are shell scripts too, which Windows cannot start (spawn EFTYPE).
describe.skipIf(process.platform === 'win32')('openmontage', () => {
  it('reports it is not set up when there is no bridge', async () => {
    const om = createOpenMontage({ bin: '/nope/run.sh' })
    expect(om.installed()).toBe(false)
    expect(await om.tools()).toEqual([])
  })

  it('lists the tools the bridge reports', async () => {
    const bridge = fakeBridge(JSON.stringify({ ok: true, tools: [tool] }))
    expect(await createOpenMontage({ bin: bridge.bin }).tools()).toEqual([tool])
    expect(bridge.request()).toEqual({ action: 'list' })
  })

  it('sends the prompt, destination and cost limit, and returns the file', async () => {
    const out = dest()
    const bridge = fakeBridge(JSON.stringify({ ok: true, path: out }))
    writeFileSync(out, 'x')
    const got = await createOpenMontage({ bin: bridge.bin }).make({ tool: 'grok_video', prompt: 'a cat', maxCostUsd: 0.5, acceptUnknownCost: false, outputPath: out })
    expect(got).toBe(out)
    expect(bridge.request()).toEqual({ action: 'run', tool: 'grok_video', inputs: { prompt: 'a cat' }, outputPath: out, maxCostUsd: 0.5, acceptUnknownCost: false })
  })

  it('refuses an empty prompt without starting the bridge', async () => {
    const bridge = fakeBridge('{}')
    const om = createOpenMontage({ bin: bridge.bin })
    await expect(om.make({ tool: 't', prompt: '  ', maxCostUsd: 0, acceptUnknownCost: false, outputPath: dest() })).rejects.toMatchObject({ code: 'EMPTY' })
    expect(existsSync(join(dirname(bridge.bin), 'request.json'))).toBe(false)
  })

  it('passes on a refusal or failure in plain words', async () => {
    const bridge = fakeBridge(JSON.stringify({ ok: false, error: 'grok_video costs about $0.50; it needs maxCostUsd' }), 1)
    await expect(createOpenMontage({ bin: bridge.bin }).make({ tool: 't', prompt: 'p', maxCostUsd: 0, acceptUnknownCost: false, outputPath: dest() })).rejects.toMatchObject({ code: 'MAKE_FAILED' })
  })

  it('does not trust a reply with no file behind it', async () => {
    const bridge = fakeBridge(JSON.stringify({ ok: true, path: '/nope/made.mp4' }))
    await expect(createOpenMontage({ bin: bridge.bin }).make({ tool: 't', prompt: 'p', maxCostUsd: 0, acceptUnknownCost: false, outputPath: dest() })).rejects.toMatchObject({ code: 'MAKE_FAILED' })
  })

  it('treats a garbled reply as no tools', async () => {
    expect(await createOpenMontage({ bin: fakeBridge('not json').bin }).tools()).toEqual([])
  })
})
