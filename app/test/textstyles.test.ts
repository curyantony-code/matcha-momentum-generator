import { describe, expect, it } from 'vitest'
import { CAPTION_FONTS, OPENREEL_CAPTION_LOOKS } from '../src/shared/looks'
import { OVERLAY_OPTIONS, TEXT_FONT_OPTIONS, TEXT_STYLE_OPTIONS, overlayParams, textCardParams } from '../src/shared/textstyles'

describe('text cards in OpenReel’s styles', () => {
  it('offers its 8 styles and the brand fonts', () => {
    expect(TEXT_STYLE_OPTIONS.map((s) => s.key)).toEqual(['heading', 'subtitle', 'lower-third', 'caption', 'hero', 'quote', 'outline', 'badge'])
    expect([...TEXT_FONT_OPTIONS]).toEqual(['Inter', 'Figtree Bold', 'Bricolage Grotesque Bold', 'DM Serif Display', 'Anton', 'Caveat Bold'])
  })

  it('keeps the words, a known style and a known font; Inter is the default, so it is not stored', () => {
    expect(textCardParams({ text: '  Nobody is   just a job title ', textStyle: 'quote', font: 'DM Serif Display' }))
      .toEqual({ text: 'Nobody is just a job title', textStyle: 'quote', font: 'DM Serif Display' })
    expect(textCardParams({ text: 'Day 1', textStyle: 'hero', font: 'Inter' })).toEqual({ text: 'Day 1', textStyle: 'hero' })
    expect(textCardParams({ text: 'Day 1', textStyle: 'hero', font: 'Comic Sans' })).toEqual({ text: 'Day 1', textStyle: 'hero' })
  })

  it('refuses no words or an unknown style, and caps long text', () => {
    expect(textCardParams({ text: '   ', textStyle: 'quote', font: 'Inter' })).toBeNull()
    expect(textCardParams({ text: 'x', textStyle: 'wordart', font: 'Inter' })).toBeNull()
    expect(textCardParams({ text: 'x'.repeat(300), textStyle: 'heading', font: 'Inter' })!.text).toHaveLength(120)
  })
})

describe('OpenReel overlays', () => {
  it('offers the four templates', () => {
    expect(OVERLAY_OPTIONS.map((o) => o.key)).toEqual(['subtitle-bar', 'lower-third', 'hashtag-strip', 'facecam-frame'])
  })

  it('keeps only the template’s own fields, with a checked colour', () => {
    expect(overlayParams('lower-third', { name: ' Sam Rivera ', role: 'Host', accent: '#f58d3d', text: 'ignored' }))
      .toEqual({ template: 'lower-third', name: 'Sam Rivera', role: 'Host', accent: '#F58D3D' })
    expect(overlayParams('lower-third', { name: 'A', accent: 'orange' })).toEqual({ template: 'lower-third', name: 'A' })
    expect(overlayParams('facecam-frame', { text: 'x' })).toEqual({ template: 'facecam-frame' })
    expect(overlayParams('rainbow', {})).toBeNull()
  })
})

describe('OpenReel caption looks', () => {
  it('are its 7 presets, each in a font Matcha Momentum Generator ships and inside the engine’s limits', () => {
    expect(OPENREEL_CAPTION_LOOKS.map((o) => o.label)).toEqual(['Classic', 'Modern', 'Cinematic', 'Bold', 'Minimal', 'Top', 'Centered'])
    for (const o of OPENREEL_CAPTION_LOOKS) {
      expect(CAPTION_FONTS as readonly string[]).toContain(o.style.font)
      expect(o.style.size as number).toBeGreaterThanOrEqual(10)
      expect(o.style.position as number).toBeGreaterThanOrEqual(0.05)
      expect(o.style.position as number).toBeLessThanOrEqual(0.95)
    }
    expect(OPENREEL_CAPTION_LOOKS.find((o) => o.label === 'Bold')!.style).toMatchObject({ font: 'Anton', color: '#FFFF00', box: true })
  })
})
