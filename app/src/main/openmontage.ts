// Generated clips and pictures through the OpenMontage bridge. OpenMontage is AGPL, so nothing of it is in this app:
// the bridge is a separate program in its own repo, reached with one JSON request and one JSON reply. What it makes
// goes into the Library as an ordinary file, so renders stay repeatable.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { MakerTool } from '../shared/api'

export interface MakeRequest {
  tool: string
  prompt: string
  /** The cost the person agreed to; a tool above it is refused by the bridge. */
  maxCostUsd: number
  /** The person agreed to a tool that does not say what it costs. */
  acceptUnknownCost: boolean
  outputPath: string
}

export interface OpenMontage {
  installed(): boolean
  tools(): Promise<MakerTool[]>
  make(req: MakeRequest): Promise<string>
}

const LIST_MS = 60_000
const MAKE_MS = 30 * 60_000
const OUTPUT_LIMIT = 4 * 1024 * 1024

export const defaultBridge = (): string => process.env.REELFORGE_BRIDGE || join(homedir(), 'matcha', 'bridge', 'run.sh')

type Reply = { ok?: boolean; error?: unknown; path?: unknown; tools?: unknown }

function ask(bin: string, request: unknown, timeout: number): Promise<Reply> {
  return new Promise((resolve) => {
    const child = execFile(bin, [], { timeout, maxBuffer: OUTPUT_LIMIT }, (err, stdout) => {
      try {
        resolve(JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as Reply)
      } catch {
        resolve({ ok: false, error: err?.message ?? 'no reply' })
      }
    })
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(JSON.stringify(request))
  })
}

export function createOpenMontage({ bin = defaultBridge() }: { bin?: string } = {}): OpenMontage {
  const installed = (): boolean => existsSync(bin)
  return {
    installed,
    tools: async () => {
      if (!installed()) return []
      const reply = await ask(bin, { action: 'list' }, LIST_MS)
      return reply.ok && Array.isArray(reply.tools) ? (reply.tools as MakerTool[]) : []
    },
    make: async ({ tool, prompt, maxCostUsd, acceptUnknownCost, outputPath }) => {
      if (!prompt.trim()) throw { code: 'EMPTY', userMessage: 'Say what you want it to make first.' }
      const reply = await ask(bin, { action: 'run', tool, inputs: { prompt }, outputPath, maxCostUsd, acceptUnknownCost }, MAKE_MS)
      if (!reply.ok || typeof reply.path !== 'string' || !existsSync(reply.path)) {
        throw { code: 'MAKE_FAILED', userMessage: `I could not make that. ${typeof reply.error === 'string' ? reply.error : 'Try again.'}` }
      }
      return reply.path
    }
  }
}
