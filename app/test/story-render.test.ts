import { describe, expect, it } from 'vitest'
import { SCENE_TYPES, TRANSITIONS, WORLDS, type Story, type StoryAssets, type StoryLine } from '../src/shared/story'
import { estimateTiming, newStory, sceneTimes } from '../src/shared/story-logic'
import { EASES, EASE_SOURCE, createMotion } from '../src/shared/story-motion'
import { NO_STORY_ASSETS, PALETTES, STORY_CSP, dataUrl, lineWords, storyHtml } from '../src/shared/story-render'
import { findRange, rows } from '../src/shared/story-scenes'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const FONT = 'data:font/ttf;base64,AAEAAAALAIAAAwAwT1MvMg=='
const L = (shown: string, type: StoryLine['scene']['type'], world: StoryLine['scene']['world'], transition: StoryLine['scene']['transition'], params: StoryLine['scene']['params'] = {}): StoryLine => ({
  shown,
  spoken: '',
  scene: { type, world, transition, params }
})

const story = (palette: Story['palette'] = 'mono'): Story => ({
  ...newStory({ id: 's1', title: 'How it began', brand: null, palette, handle: '@acme', now: '2026-11-06T10:00:00.000Z' }),
  lines: [
    L('Nobody tells you how it began', 'title', 'ink', 'cut', { kicker: 'A true story', hero: 'began' }),
    L('It started with seven people', 'line', 'paper', 'flash', { hero: 'seven' }),
    L('They raised 124M dollars', 'stat', 'clay', 'zoom', { value: '$124M', label: 'in one round' }),
    L('AI should be helpful and honest', 'highlight', 'grey', 'wipe', { phrase: 'helpful and honest' }),
    L('Three rules shaped it', 'list', 'black', 'whip', { items: ['Be helpful', 'Be honest', 'Do no harm'] }),
    L('Then came the brand', 'logo', 'brand', 'iris', { hero: 'brand', image: null }),
    L('Arlo reads your week', 'art', 'paper', 'zoom', { hero: 'Arlo', art: 'arlo.png' }),
    L('And the world listened', 'photo', 'black', 'whip', { hero: 'listened', image: 'Images/p.png' }),
    L('Follow for the next one', 'line', 'clay', 'iris', { hero: 'Follow' })
  ]
})
const assets: StoryAssets = { fonts: { display: FONT, text: FONT, textBold: FONT, serif: '', condensed: '' }, logo: PNG, art: { 'arlo.png': PNG }, images: { 'Images/p.png': PNG } }
const film = (s = story(), a = assets): string => storyHtml(s, estimateTiming(s), a)

/** Runs the page's script against a tiny fake DOM: enough to call __seek and read the styles it sets. */
function run(html: string): { seek: (t: number) => void; duration: number; style: (id: string) => Record<string, string>; post: (d: unknown) => void } {
  const script = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const nodes = new Map<string, { style: Record<string, string> }>()
  const ids = new Set(Array.from(html.matchAll(/ id="([^"]+)"/g), (m) => m[1]!))
  const document = { getElementById: (id: string) => (ids.has(id) ? nodes.get(id) ?? nodes.set(id, { style: {} }).get(id)! : null) }
  const listeners: ((e: { data: unknown }) => void)[] = []
  const window: Record<string, unknown> = { addEventListener: (_: string, f: (e: { data: unknown }) => void) => listeners.push(f) }
  new Function('window', 'document', script)(window, document)
  return {
    seek: window.__seek as (t: number) => void,
    duration: window.__duration as number,
    style: (id) => ({ ...(nodes.get(id)?.style ?? {}) }),
    post: (data) => listeners.forEach((f) => f({ data }))
  }
}

describe('storyHtml: the page', () => {
  it('is one 1080 × 1920 document with the CSP, __duration, __seek and the message listener', () => {
    const html = film()
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${STORY_CSP}">`)
    expect(STORY_CSP).toBe("default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'")
    expect(html).toContain('width:1080px;height:1920px')
    expect(html).toContain('window.__duration=')
    expect(html).toContain('window.__seek=seek')
    expect(html).toContain("addEventListener('message'")
    expect(html.match(/<script/g)).toHaveLength(1)
  })

  it('loads nothing from outside: every src and url() is a data: URL', () => {
    const html = film()
    expect(html).not.toMatch(/https?:\/\//)
    for (const m of html.matchAll(/src="([^"]*)"/g)) expect(m[1]).toMatch(/^data:image\//)
    for (const m of html.matchAll(/url\(([^)]*)\)/g)) expect(m[1]!.replace(/^["']/, '')).toMatch(/^data:/)
  })

  it('drops assets that are not data: URLs', () => {
    const bad: StoryAssets = {
      fonts: { display: 'https://evil.com/f.ttf', text: 'file:///etc/passwd', textBold: '', serif: '', condensed: '' },
      logo: 'http://evil.com/logo.png',
      art: { 'arlo.png': 'javascript:alert(1)' },
      images: { 'Images/p.png': '/Users/me/p.png' }
    }
    const html = film(story(), bad)
    expect(html).not.toContain('evil.com')
    expect(html).not.toContain('passwd')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('/Users/me')
    expect(html).not.toContain('<img')
    expect(dataUrl('data:text/html;base64,PGI+')).toBeNull()
    expect(dataUrl('data:image/png;base64,abc"onload=x')).toBeNull()
    expect(dataUrl(PNG)).toBe(PNG)
  })

  it('escapes every text field: no markup gets through', () => {
    const x = '<script>alert(1)</script>"><img src=x onerror=alert(2)>'
    const s = story()
    const evil: Story = {
      ...s,
      title: x,
      handle: x,
      lines: s.lines.map((l) => ({
        ...l,
        shown: `${l.shown} ${x}`,
        scene: { ...l.scene, params: { ...l.scene.params, hero: x, kicker: x, value: x, label: x, phrase: x, items: [x, x] } }
      }))
    }
    const html = film(evil)
    expect(html.match(/<script/g)).toHaveLength(1)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;&gt;&lt;img')
  })

  it('is deterministic: the same story gives the same page', () => {
    expect(film()).toBe(film())
    expect(film(story('brand'))).toBe(film(story('brand')))
    expect(film(story('brand'))).not.toBe(film(story('mono')))
  })

  it('draws with no assets at all', () => {
    const html = film(story(), NO_STORY_ASSETS)
    expect(html).not.toContain('@font-face')
    expect(html).toContain('mono-letter')
    expect(html).toContain('art-blob')
    expect(html).toContain('ph-empty')
  })
})

describe('storyHtml: scenes, worlds and transitions', () => {
  const html = film()
  it('renders every scene type with its params', () => {
    for (const t of SCENE_TYPES) expect(html).toContain(`s-${t}`)
    expect(html).toContain('A true story')
    expect(html.match(/class="dg"/g)).toHaveLength(3) // $124M: three rolling digits
    expect(html).toContain('<span class="ch">$</span>')
    expect(html).toContain('in one round')
    expect(html.match(/class="mk"/g)).toHaveLength(3) // highlighter on helpful / and / honest
    for (const item of ['Be helpful', 'Be honest', 'Do no harm']) expect(html).toContain(item)
    expect(html).toContain(`class="mark-img" src="${PNG}"`) // no Library image: the brand logo
    expect(html).toContain(`class="art-img" src="${PNG}"`)
    expect(html).toContain('class="ph"')
    expect(html).toMatch(/class="hero t-display"[^>]*><span class="w "[^>]*>seven</)
  })

  it('puts each world on its scene and draws the wipe slab and iris ring', () => {
    for (const w of WORLDS) expect(html).toContain(`w-${w}`)
    expect(html).toContain('class="tslab"')
    expect(html).toContain('class="tiris"')
    expect(html).toContain(`--bg:${PALETTES.mono.clay.bg}`)
    expect(film(story('brand'))).toContain(`--bg:${PALETTES.brand.ink.bg}`)
  })

  it('has a look for every world in both palettes, with the contract colours', () => {
    for (const p of ['brand', 'mono'] as const) for (const w of WORLDS) expect(PALETTES[p][w].bg).toMatch(/^#[0-9A-F]{6}$/i)
    expect(PALETTES.brand.ink.bg).toBe('#1E1524')
    expect(PALETTES.brand.paper.bg).toBe('#F6F3F8')
    expect(PALETTES.brand.clay.bg).toBe('#F58D3D')
    expect(PALETTES.mono.paper.bg).toBe('#E9E7E1')
    expect(PALETTES.mono.ink.bg).toBe('#0F0E13')
    expect(PALETTES.mono.clay.bg).toBe('#D97757')
    expect(PALETTES.mono.grey.bg).toBe('#BEBEBC')
    expect(PALETTES.mono.black.bg).toBe('#000000')
  })

  it('renders every transition kind', () => {
    for (const tr of TRANSITIONS) {
      const s = story()
      const lines = s.lines.map((l, i) => (i === 3 ? { ...l, scene: { ...l.scene, transition: tr } } : l))
      expect(() => film({ ...s, lines })).not.toThrow()
    }
  })
})

describe('__seek', () => {
  const s = story()
  const timing = estimateTiming(s)
  const html = storyHtml(s, timing, assets)
  const times = sceneTimes(s, timing)

  it('reports the duration: the last scene end', () => {
    expect(run(html).duration).toBeCloseTo(times[times.length - 1]!.end, 3)
  })

  it('draws a frame from t alone, whatever came before', () => {
    const a = run(html)
    a.seek(5)
    const once = Array.from({ length: 60 }, (_, k) => a.style(`e${k}`))
    a.seek(1)
    a.seek(17)
    a.seek(5)
    expect(Array.from({ length: 60 }, (_, k) => a.style(`e${k}`))).toEqual(once)
    const b = run(html)
    b.seek(5)
    expect(Array.from({ length: 60 }, (_, k) => b.style(`e${k}`))).toEqual(once)
  })

  it('shows one scene at a time outside transitions and lands words on their onsets', () => {
    const p = run(html)
    const sceneIds = Array.from(html.matchAll(/<section[^>]* id="([^"]+)"/g), (m) => m[1]!)
    expect(sceneIds).toHaveLength(s.lines.length)
    const mid = (times[2]!.start + times[2]!.end) / 2
    p.seek(mid)
    expect(sceneIds.map((id) => p.style(id).display)).toEqual(sceneIds.map((_, i) => (i === 2 ? 'block' : 'none')))
    const firstWord = html.match(/<span class="w [^"]*" id="([^"]+)">Nobody</)![1]!
    const words = lineWords(s, timing, 0, times[0]!)
    p.seek(Math.max(0, words[0]!.t - 0.01))
    expect(Number(p.style(firstWord).opacity)).toBe(0)
    p.seek(words[0]!.t + 0.3)
    expect(Number(p.style(firstWord).opacity)).toBe(1)
    expect(p.style(firstWord).filter).toBe('none')
  })

  it('answers seek messages and ignores others', () => {
    const p = run(html)
    const sceneIds = Array.from(html.matchAll(/<section[^>]* id="([^"]+)"/g), (m) => m[1]!)
    p.post({ type: 'seek', t: times[4]!.start + 0.6 })
    expect(p.style(sceneIds[4]!).display).toBe('block')
    p.post({ type: 'other', t: 0 })
    p.post('seek')
    expect(p.style(sceneIds[4]!).display).toBe('block')
    p.seek(Number.NaN)
    expect(p.style(sceneIds[0]!).display).toBe('block')
  })
})

describe('helpers', () => {
  it('finds a hero or phrase ignoring case and punctuation', () => {
    expect(findRange(['It', 'started', 'with', 'Seven,', 'people.'], 'seven people')).toEqual([3, 5])
    expect(findRange(['a', 'b'], 'c')).toBeNull()
    expect(findRange(['a'], '')).toBeNull()
  })
  it('stacks words into at most the rows asked for', () => {
    const w = 'one two three four five six seven eight nine ten'.split(' ').map((text) => ({ text, t: 0 }))
    const r = rows(w, 11, 4)
    expect(r).toHaveLength(4)
    expect(r.flat().map((x) => x.text)).toEqual(w.map((x) => x.text))
  })
  it('gives each shown word an onset from the voice, never going back in time', () => {
    const s = story()
    const timing = { ...estimateTiming(s), words: [{ w: 'nobody', s: 0.5, e: 0.7, line: 0 }, { w: 'tells', s: 0.4, e: 0.6, line: 0 }] }
    const ws = lineWords(s, timing, 0, sceneTimes(s, timing)[0]!)
    expect(ws.map((w) => w.text)).toEqual(['Nobody', 'tells', 'you', 'how', 'it', 'began'])
    for (let k = 1; k < ws.length; k++) expect(ws[k]!.t).toBeGreaterThanOrEqual(ws[k - 1]!.t)
  })
  it('keeps the easing list and its source in step', () => {
    expect(new Function(`return ${EASE_SOURCE}`)()).toHaveLength(EASES.length)
    const m = createMotion()
    m.key(m.id(), 'o', 2, 1, 0, 1)
    expect(m.rows()[0]!.slice(2, 4)).toEqual([2, 2]) // t1 never before t0
  })
})
