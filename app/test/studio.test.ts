import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ALLOWED_PERMISSIONS, cleanBounds, isStudioUrl, openReelExports } from '../src/main/studio-rules'

describe('the Studio tab only shows OpenReel', () => {
  it('stays on openreel.video over https', () => {
    expect(isStudioUrl('https://openreel.video/')).toBe(true)
    expect(isStudioUrl('https://openreel.video/editor?project=1')).toBe(true)
    expect(isStudioUrl('https://app.openreel.video/')).toBe(true)
  })

  it('sends everything else out of the app', () => {
    expect(isStudioUrl('http://openreel.video/')).toBe(false) // not https
    expect(isStudioUrl('https://openreel.video.evil.com/')).toBe(false)
    expect(isStudioUrl('https://evilopenreel.video/')).toBe(false)
    expect(isStudioUrl('file:///etc/passwd')).toBe(false)
    expect(isStudioUrl('javascript:alert(1)')).toBe(false)
    expect(isStudioUrl('not a url')).toBe(false)
  })

  it('allows only the permissions an editor needs', () => {
    expect([...ALLOWED_PERMISSIONS].sort()).toEqual(['clipboard-sanitized-write', 'fullscreen'])
    for (const p of ['media', 'geolocation', 'notifications', 'midi', 'openExternal']) expect(ALLOWED_PERMISSIONS.has(p)).toBe(false)
  })
})

describe('the area the page asks for', () => {
  it('is rounded to whole pixels', () => {
    expect(cleanBounds({ x: 212.4, y: 96.6, width: 1067.5, height: 700.2 })).toEqual({ x: 212, y: 97, width: 1068, height: 700 })
  })

  it('is refused when missing, tiny or not numbers, and clamped when absurd', () => {
    expect(cleanBounds(null)).toBeNull()
    expect(cleanBounds({ x: 0, y: 0, width: 10, height: 10 })).toBeNull()
    expect(cleanBounds({ x: '0', y: 0, width: 500, height: 500 })).toBeNull()
    expect(cleanBounds({ x: -40, y: 0, width: 1e9, height: 500 })).toEqual({ x: 0, y: 0, width: 20000, height: 500 })
  })
})

describe('your edits for OpenReel', () => {
  it('lists only "for OpenReel" folders, newest first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'exports-'))
    mkdirSync(join(dir, 'Day 1 for OpenReel'))
    mkdirSync(join(dir, 'Day 2 for OpenReel'))
    mkdirSync(join(dir, 'Day 2 for CapCut'))
    writeFileSync(join(dir, 'Fake for OpenReel'), 'a file, not a folder')
    utimesSync(join(dir, 'Day 1 for OpenReel'), new Date('2026-11-01'), new Date('2026-11-01'))
    utimesSync(join(dir, 'Day 2 for OpenReel'), new Date('2026-11-02'), new Date('2026-11-02'))
    expect((await openReelExports(dir)).map((e) => e.name)).toEqual(['Day 2', 'Day 1'])
  })

  it('is empty when there is no exports folder yet', async () => {
    expect(await openReelExports(join(tmpdir(), 'no-such-folder-matcha-momentum-generator'))).toEqual([])
  })
})
