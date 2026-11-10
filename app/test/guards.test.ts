import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PAGE_PERMISSIONS, isNetworkPath, mayOpenLink, mayReveal, mayUseAsRoot } from '../src/main/guards'
import { nextIndex } from '../src/shared/keys'

const real = (p: string): Promise<string | null> => fs.realpath(p).catch(() => null)

describe('what the page may ask the computer for', () => {
  it('network paths are recognised on each system', () => {
    expect(isNetworkPath('\\\\attacker\\share', 'win32')).toBe(true)
    expect(isNetworkPath('//attacker/share', 'win32')).toBe(true)
    expect(isNetworkPath('\\\\?\\UNC\\host\\x', 'win32')).toBe(true)
    expect(isNetworkPath('\\\\?\\C:\\Users\\x', 'win32')).toBe(false)
    expect(isNetworkPath('C:\\Users\\x', 'win32')).toBe(false)
    expect(isNetworkPath('//host/share', 'darwin')).toBe(true)
    expect(isNetworkPath('/Users/x/Documents', 'darwin')).toBe(false)
  })

  it('reveals only what is inside the app folders, never an app bundle or a link out of them', async () => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'guard-')))
    const root = join(base, 'Matcha Momentum Generator')
    mkdirSync(join(root, 'Exports'), { recursive: true })
    writeFileSync(join(root, 'Exports', 'a.mp4'), 'v')
    mkdirSync(join(root, 'Library', 'Evil.app'), { recursive: true })
    mkdirSync(join(base, 'elsewhere'))
    symlinkSync(join(base, 'elsewhere'), join(root, 'out'))
    expect(await mayReveal(join(root, 'Exports', 'a.mp4'), [root], real)).toBe(true)
    expect(await mayReveal(root, [root], real)).toBe(true)
    expect(await mayReveal(join(base, 'elsewhere'), [root], real)).toBe(false)
    expect(await mayReveal(join(root, 'out'), [root], real)).toBe(false)
    expect(await mayReveal(join(root, 'Library', 'Evil.app'), [root], real)).toBe(false)
    expect(await mayReveal('/Applications/Calculator.app', [root], real)).toBe(false)
    expect(await mayReveal(join(root, 'missing.mp4'), [root], real)).toBe(false)
    expect(await mayReveal(42, [root], real)).toBe(false)
  })

  it('moves the root only to the folder just picked, never a share', () => {
    expect(mayUseAsRoot('/Users/x/Videos', '/Users/x/Videos', 'darwin')).toBe(true)
    expect(mayUseAsRoot('/Users/x/Other', '/Users/x/Videos', 'darwin')).toBe(false)
    expect(mayUseAsRoot('/Users/x/Videos', null, 'darwin')).toBe(false)
    expect(mayUseAsRoot('D:\\Videos', 'd:\\videos', 'win32')).toBe(true)
    expect(mayUseAsRoot('\\\\attacker\\share', '\\\\attacker\\share', 'win32')).toBe(false)
  })

  it('opens only https links to the sites the app uses', () => {
    expect(mayOpenLink('https://console.anthropic.com/settings/keys')).toBe(true)
    expect(mayOpenLink('https://www.instagram.com/')).toBe(true)
    expect(mayOpenLink('https://github.com/curyantony-code/reel-forge/releases')).toBe(true)
    expect(mayOpenLink('http://github.com/')).toBe(false)
    expect(mayOpenLink('https://evilgithub.com/')).toBe(false)
    expect(mayOpenLink('https://github.com.evil.io/')).toBe(false)
    // a login in the link (written in two parts so it is not taken for an e-mail address)
    expect(mayOpenLink('https://user:pw' + '@' + 'github.com/')).toBe(false)
    expect(mayOpenLink('file:///etc/passwd')).toBe(false)
    expect(mayOpenLink('not a url')).toBe(false)
  })

  it('the page gets fullscreen video and copying, nothing else', () => {
    expect([...PAGE_PERMISSIONS].sort()).toEqual(['clipboard-sanitized-write', 'fullscreen'])
  })
})

describe('arrow keys in tab rows and choices', () => {
  it('wraps around and jumps to the ends', () => {
    expect(nextIndex('ArrowRight', 2, 3)).toBe(0)
    expect(nextIndex('ArrowLeft', 0, 3)).toBe(2)
    expect(nextIndex('ArrowDown', 0, 3)).toBe(1)
    expect(nextIndex('Home', 2, 3)).toBe(0)
    expect(nextIndex('End', 0, 3)).toBe(2)
    expect(nextIndex('Enter', 0, 3)).toBe(-1)
    expect(nextIndex('ArrowRight', 0, 0)).toBe(-1)
  })
})
