import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ffmpegPath, ffprobePath, initPaths } from '../src/main/paths'
import { setupPaths } from './helpers'

function devRepo(withRuntime: boolean, env: NodeJS.ProcessEnv = {}): string {
  const repo = mkdtempSync(join(tmpdir(), 'repo-'))
  const bin = join(repo, 'packaging', 'runtime', 'mac-arm64', 'ffmpeg')
  if (withRuntime) {
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'ffmpeg'), '')
    writeFileSync(join(bin, 'ffprobe'), '')
  }
  mkdirSync(join(repo, 'app'))
  initPaths({ isPackaged: false, resourcesPath: '', documentsDir: repo, userDataDir: repo, appDir: join(repo, 'app'), platform: 'darwin', env: { PATH: '', ...env } })
  return bin
}

describe('ffmpeg in development', () => {
  afterEach(() => void setupPaths())

  it('prefers the pinned build over whatever is on PATH', () => {
    const bin = devRepo(true)
    expect(ffmpegPath()).toBe(join(bin, 'ffmpeg'))
    expect(ffprobePath()).toBe(join(bin, 'ffprobe'))
  })
  it('falls back to PATH when the pinned build was not fetched', () => {
    devRepo(false)
    expect(ffmpegPath()).toBe('ffmpeg')
  })
  it('still lets an explicit setting win', () => {
    devRepo(true, { REELENGINE_FFMPEG: '/custom/ffmpeg' })
    expect(ffmpegPath()).toBe('/custom/ffmpeg')
  })
})
