import { describe, expect, it } from 'vitest'
import { newCarousel } from '../src/shared/carousel'
import { NO_ASSETS, SLIDE_HEIGHT, SLIDE_WIDTH, headlineHtml, slideHtml } from '../src/shared/carousel-render'

const c = newCarousel({ id: 'c1', title: 'Your CV hides you', brand: 'acme', style: 'cut-paper', handle: '@acme', now: '2026-11-05T10:00:00.000Z' })

describe('headlineHtml', () => {
  it('draws the one highlighted word in the accent, keeping its case', () => {
    expect(headlineHtml('Your CV hides you', 'HIDES')).toBe('Your CV <span class="hl">hides</span> you')
  })
  it('only the first match, and plain text when there is none', () => {
    expect(headlineHtml('go go go', 'go')).toBe('<span class="hl">go</span> go go')
    expect(headlineHtml('Your CV', 'résumé')).toBe('Your CV')
    expect(headlineHtml('Your CV', '')).toBe('Your CV')
  })
  it('escapes everything the person typed', () => {
    expect(headlineHtml('<img src=x onerror=alert(1)> & "q"', '&')).toBe('&lt;img src=x onerror=alert(1)&gt; <span class="hl">&amp;</span> &quot;q&quot;')
  })
})

describe('slideHtml', () => {
  it('is a full 1080 × 1350 page with no script in it', () => {
    const html = slideHtml(c, 0, NO_ASSETS)
    expect(SLIDE_WIDTH).toBe(1080)
    expect(SLIDE_HEIGHT).toBe(1350)
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('width: 1080px; height: 1350px')
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain("default-src 'none'")
  })

  it('shows the slide number, the handle and the style', () => {
    const html = slideHtml(c, 1, NO_ASSETS)
    expect(html).toContain('2 / 6')
    expect(html).toContain('@acme')
    expect(html).toContain('class="slide style-cut-paper role-body"')
  })

  it('escapes the handle, kicker and body', () => {
    const evil = { ...c, handle: '<b>x</b>', slides: c.slides.map((s) => ({ ...s, kicker: '<i>', body: '</div><script>' })) }
    const html = slideHtml(evil, 0, NO_ASSETS)
    expect(html).not.toContain('<b>x</b>')
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('&lt;/div&gt;&lt;script&gt;')
  })

  it('draws the slide’s art only when the asset is there, and the logo on the last slide only', () => {
    const withArt = { ...c, slides: c.slides.map((s, i) => (i === 0 ? { ...s, art: '06-heart-dark.svg' } : s)) }
    const assets = { ...NO_ASSETS, logo: 'data:image/png;base64,AAA', art: { '06-heart-dark.svg': 'data:image/svg+xml;base64,BBB' } }
    expect(slideHtml(withArt, 0, assets)).toContain('data:image/svg+xml;base64,BBB')
    expect(slideHtml(withArt, 0, NO_ASSETS)).not.toContain('class="art"')
    expect(slideHtml(withArt, 0, assets)).not.toContain('data:image/png;base64,AAA')
    expect(slideHtml(withArt, 5, assets)).toContain('data:image/png;base64,AAA')
  })

  it('keeps the full-colour logo off the light Editorial page (the kit says: full colour on dark only)', () => {
    const assets = { ...NO_ASSETS, logo: 'data:image/png;base64,AAA' }
    expect(slideHtml({ ...c, style: 'editorial' }, 5, assets)).not.toContain('data:image/png;base64,AAA')
    expect(slideHtml({ ...c, style: 'midnight' }, 5, assets)).toContain('data:image/png;base64,AAA')
  })

  it('makes a long headline smaller than a short one', () => {
    const size = (h: string) => Number(/--headline-size: (\d+)px/.exec(slideHtml({ ...c, slides: [{ ...c.slides[1]!, headline: h }] }, 0, NO_ASSETS))![1])
    expect(size('Short one')).toBeGreaterThan(size('A much longer headline that keeps going for a while longer'))
  })

  it('refuses an asset that is not a data URL, so a slide never loads anything from outside', () => {
    const html = slideHtml({ ...c, slides: c.slides.map((s) => ({ ...s, art: 'x.svg' })) }, 5, { ...NO_ASSETS, logo: 'https://evil.example/x.png', art: { 'x.svg': 'file:///etc/passwd' } })
    expect(html).not.toContain('evil.example')
    expect(html).not.toContain('file:')
  })
})
