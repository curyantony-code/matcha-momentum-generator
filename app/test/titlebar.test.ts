// The Windows title bar overlay (main/window.ts) is drawn by the OS outside the page, so the modal scrim in
// styles.css cannot reach it; while a modal is open it must take exactly the scrim's colour.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { blendHex, SURFACES, titleBarOverlay, WIN_TITLEBAR_HEIGHT } from '../src/main/window'

describe('titleBarOverlay', () => {
  it('matches each theme\'s page background and modal scrim, as styles.css draws them', () => {
    const css = readFileSync(join(__dirname, '../src/renderer/src/styles.css'), 'utf8')
    const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)))
    const token = (b: string, name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(b)?.[1]?.trim()
    for (const [surface, sel] of [['dark', ':root, :root[data-theme="dark"]'], ['light', ':root[data-theme="light"]']] as const) {
      const b = block(sel)
      expect(token(b, 'bg')).toBe(SURFACES[surface].bg)
      const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(token(b, 'scrim') ?? '')
      if (!m) throw new Error(`no rgba() --scrim for ${surface}`)
      const scrim = '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
      expect(scrim).toBe(SURFACES[surface].scrim)
      expect(Number(m[4])).toBe(SURFACES[surface].scrimAlpha)
      expect(titleBarOverlay(false, surface)).toEqual({ color: SURFACES[surface].bg, symbolColor: SURFACES[surface].ink, height: WIN_TITLEBAR_HEIGHT })
      expect(titleBarOverlay(true, surface).color).toBe(blendHex(SURFACES[surface].bg, SURFACES[surface].scrim, SURFACES[surface].scrimAlpha))
    }
    expect(css).toMatch(/\.modal-backdrop\s*\{[^}]*background:\s*var\(--scrim\)/)
  })

  it('blends per channel and rounds', () => {
    expect(blendHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(blendHex('#f7f5f1', '#1d1b18', 0)).toBe('#f7f5f1')
    expect(blendHex('#f7f5f1', '#1d1b18', 1)).toBe('#1d1b18')
  })
})
