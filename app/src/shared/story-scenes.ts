// The scene library: one function per SceneType, each returning the scene's content HTML and adding its keys to the
// film's motion. Every text is escaped here; images arrive as checked data: URLs only. Layout is for 1080 × 1920 with
// the Instagram-safe stage (x 72–1008, y 220–1540). The look follows MG V3 (our own code): the line's words land on
// their onsets in mixed tiers, one hero word, one physical action per scene, one accent colour.
import type { SceneType, StoryLine } from './story'
import { land, appear, type Motion } from './story-motion'

export const SAFE = { left: 72, right: 1008, top: 220, bottom: 1540 } as const
/** Where the scene's words go: inside the safe area, under the micro labels and over the ticket. */
export const STAGE = { left: SAFE.left, top: 300, width: SAFE.right - SAFE.left, height: 1160 } as const
export const STAGE_W = STAGE.width
/** Text on a photo always sits light on the dark gradient. */
export const PHOTO_INK = '#F3F2EF'

/** The colours of one world in one palette. */
export interface WorldLook {
  bg: string
  ink: string
  soft: string
  /** The hero word's colour on this ground. */
  hero: string
  /** The slab behind the hero word / the highlighter. */
  slab: string
  /** The one accent, for graphics (rings, rules, index numbers). */
  accent: string
  /** A paper card on this ground, and its text. */
  card: string
  cardInk: string
  dark: boolean
}

export interface Word {
  text: string
  t: number
}

export interface SceneCtx {
  m: Motion
  i: number
  line: StoryLine
  words: Word[]
  start: number
  end: number
  look: WorldLook
  /** The image for logo/photo, the illustration for art: checked data: URLs, or null. */
  image: string | null
  art: string | null
  /** The story's title, for the logo monogram when there is no logo. */
  title: string
}

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const key = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}%]/gu, '')

/** Where `phrase` (one or more words) sits in the words, ignoring case and punctuation: [from, to) or null. */
export function findRange(words: readonly string[], phrase: string | undefined): [number, number] | null {
  const want = (phrase ?? '').trim().split(/\s+/).map(key).filter(Boolean)
  if (!want.length) return null
  const have = words.map(key)
  for (let a = 0; a + want.length <= have.length; a++) {
    if (want.every((w, k) => have[a + k] === w)) return [a, a + want.length]
  }
  return null
}

/** Bigger for a short text, smaller for a long one: `em` is the face's average glyph width. */
export const fit = (chars: number, max: number, width = STAGE_W, em = 0.6): number =>
  Math.floor(Math.min(max, width / (Math.max(1, chars) * em)))

/** One word as its own span, landing on its onset. */
function word(c: SceneCtx, w: Word, cls: string, from: Parameters<typeof land>[3] = 'rise'): string {
  const id = c.m.id()
  land(c.m, id, w.t, from)
  return `<span class="w ${cls}" id="${id}">${esc(w.text)}</span>`
}

const words = (c: SceneCtx, list: Word[], cls: string, from?: Parameters<typeof land>[3]): string =>
  list.map((w) => word(c, w, cls, from)).join(' ')

const first = (c: SceneCtx, list: Word[]): number => list[0]?.t ?? c.start + 0.15
const chars = (list: Word[]): number => list.reduce((n, w) => n + w.text.length + 1, 0)

// ---------------------------------------------------------------------------------------------------------------
// line: thin connectors, one hero word huge over a slab that sweeps in, the rest in italic serif

function lineScene(c: SceneCtx): string {
  const r = findRange(c.words.map((w) => w.text), c.line.scene.params.hero)
  if (!r) return plainLine(c)
  const pre = c.words.slice(0, r[0])
  const hero = c.words.slice(r[0], r[1])
  const post = c.words.slice(r[1])
  const longest = Math.max(...hero.map((w) => w.text.length))
  const size = Math.min(fit(longest, 300, STAGE_W, 0.56), fit(chars(hero), 300, STAGE_W * 2, 0.56))
  const slab = c.m.id()
  const t = first(c, hero)
  c.m.key(slab, 'sx', t - 0.12, t + 0.3, 0, 1, 'outExpo')
  return `<div class="stage st-line">
  ${pre.length ? `<div class="pre">${words(c, pre, 't-thin')}</div>` : ''}
  <div class="herobox"><i class="slab" id="${slab}"></i><div class="hero t-display" style="font-size:${size}px">${words(c, hero, '', 'slam')}</div></div>
  ${post.length ? `<div class="post">${words(c, post, 't-ital')}</div>` : ''}
</div>`
}

function plainLine(c: SceneCtx): string {
  const last = c.words.slice(-1)
  const body = c.words.slice(0, -1)
  const size = Math.max(70, Math.min(120, Math.floor(1700 / Math.sqrt(Math.max(1, chars(c.words))) / 1.6)))
  const rule = c.m.id()
  const t = first(c, last)
  c.m.key(rule, 'sx', t, t + 0.45, 0, 1, 'outExpo')
  return `<div class="stage st-line plain">
  <div class="plain-text" style="font-size:${size}px">${words(c, body, 't-bold')} ${words(c, last, 't-ital accent-ink')}</div>
  <i class="rule" id="${rule}"></i>
</div>`
}

// ---------------------------------------------------------------------------------------------------------------
// title: a small kicker, then huge stacked heavy caps, rows sliding in from alternate sides

/** Words grouped into stacked rows: a row takes another word while it stays short; never more than maxRows. */
export function rows(list: Word[], maxChars = 11, maxRows = 6): Word[][] {
  const out: Word[][] = []
  for (const w of list) {
    const row = out[out.length - 1]
    if (row && row.length < 3 && chars(row) + w.text.length <= maxChars) row.push(w)
    else out.push([w])
  }
  while (out.length > maxRows) {
    const last = out.pop()!
    out[out.length - 1]!.push(...last)
  }
  return out
}

function titleScene(c: SceneCtx): string {
  const kick = c.line.scene.params.kicker ?? ''
  const hero = findRange(c.words.map((w) => w.text), c.line.scene.params.hero)
  const stack = rows(c.words)
  const longest = Math.max(...stack.map((r) => chars(r) - 1), 1)
  const size = Math.floor(Math.min(270, STAGE_W / (longest * 0.64), 1080 / (stack.length * 0.9)))
  const kid = c.m.id()
  appear(c.m, kid, c.start + 0.05, 0.2)
  c.m.key(kid, 'x', c.start + 0.05, c.start + 0.5, -40, 0, 'outExpo')
  let k = 0
  const body = stack
    .map((row, ri) => {
      const html = row
        .map((w) => {
          const on = hero !== null && k >= hero[0] && k < hero[1]
          k++
          return word(c, w, on ? 'is-hero' : '', ri % 2 ? 'right' : 'left')
        })
        .join(' ')
      return `<div class="row">${html}</div>`
    })
    .join('')
  const bar = c.m.id()
  c.m.key(bar, 'sx', c.start, c.start + 0.55, 0, 1, 'outExpo')
  return `<div class="stage st-title">
  ${kick ? `<div class="kicker t-track" id="${kid}"><i></i>${esc(kick)}</div>` : ''}
  <div class="stack t-cond" style="font-size:${size}px"><i class="bar" id="${bar}"></i>${body}</div>
</div>`
}

// ---------------------------------------------------------------------------------------------------------------
// stat: the line small, the number rolling up like an odometer, rings echoing out, the label in italic serif

function odometer(c: SceneCtx, value: string, size: number, t: number): string {
  let col = 0
  // The roll ends before the scene does, however short the line: the last frame always reads the number.
  const room = Math.max(0.35, c.end - 0.3 - t)
  const digitsIn = Array.from(value).filter((ch) => /[0-9]/.test(ch)).length
  const step = Math.min(0.14, (room * 0.4) / Math.max(1, digitsIn))
  const base = Math.min(0.8, room - step * digitsIn)
  return Array.from(value)
    .map((ch) => {
      if (!/[0-9]/.test(ch)) return `<span class="ch">${esc(ch)}</span>`
      const d = Number(ch)
      const id = c.m.id()
      const travel = (10 + d) * size
      c.m.key(id, 'y', t, t + base + col * step, 0, -travel, 'outQuint')
      col++
      const digits = Array.from({ length: 20 }, (_, k) => `<b>${k % 10}</b>`).join('')
      return `<span class="dg"><span class="col" id="${id}">${digits}</span></span>`
    })
    .join('')
}

function statScene(c: SceneCtx): string {
  const p = c.line.scene.params
  const value = p.value || '—'
  const at = c.words.find((w) => /[0-9]/.test(w.text))
  const t = at ? at.t : c.start + 0.25
  const size = fit(value.length, 400, STAGE_W, 0.62)
  const num = c.m.id()
  appear(c.m, num, t - 0.04, 0.12)
  const ring1 = c.m.id()
  const ring2 = c.m.id()
  c.m.key(ring1, 's', t - 0.05, t + 0.7, 0.3, 1, 'outExpo')
  appear(c.m, ring1, t - 0.05, 0.1)
  c.m.key(ring2, 's', t + 0.1, t + 1.4, 0.4, 1.35, 'outCubic')
  c.m.key(ring2, 'o', t + 0.1, t + 1.4, 0.9, 0, 'outCubic')
  const tick = c.m.id()
  c.m.key(tick, 'sx', t + 0.2, t + 0.9, 0, 1, 'outExpo')
  const d = Math.min(1060, Math.round(Math.max(size * 1.7, value.length * size * 0.6 + 140)))
  const ring = `width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px`
  const label = p.label ? word(c, { text: p.label, t: t + 0.5 }, 't-ital', 'rise') : ''
  return `<div class="stage st-stat">
  <div class="cap">${words(c, c.words, 't-thin')}</div>
  <div class="numbox"><i class="ring" id="${ring1}" style="${ring}"></i><i class="ring" id="${ring2}" style="${ring}"></i>
    <div class="num t-cond" id="${num}" style="font-size:${size}px">${odometer(c, value, size, t)}</div></div>
  <i class="ticks" id="${tick}"></i>
  <div class="label">${label}</div>
</div>`
}

// ---------------------------------------------------------------------------------------------------------------
// highlight: the line printed on a tilted paper card that slides up; the highlighter sweeps the phrase word by word

function highlightScene(c: SceneCtx): string {
  const r = findRange(c.words.map((w) => w.text), c.line.scene.params.phrase)
  const mover = c.m.id()
  c.m.key(mover, 'y', c.start, c.start + 0.6, 1100, 0, 'outExpo')
  c.m.key(mover, 'r', c.start, c.start + 0.7, -9, 0, 'outExpo')
  c.m.key(mover, 'r', c.start + 0.7, c.end, 0, 1.2, 'inOutSine')
  const size = Math.round(Math.max(52, Math.min(96, Math.sqrt((790 * 520) / (Math.max(1, chars(c.words)) * 0.62)))))
  let sweep = 0
  const text = c.words
    .map((w, k) => {
      if (!r || k < r[0] || k >= r[1]) return word(c, w, '')
      const mk = c.m.id()
      const t = Math.max(w.t, sweep) + 0.08
      c.m.key(mk, 'sx', t, t + 0.22, 0, 1, 'outCubic')
      sweep = t + 0.18
      return `<span class="hw"><i class="mk" id="${mk}"></i>${word(c, w, '')}</span>`
    })
    .join(' ')
  return `<div class="stage st-highlight"><div class="pmove" id="${mover}"><div class="paper">
  <div class="phead t-mono"><span>FILE ${String(c.i + 1).padStart(3, '0')}</span><span>— EXCERPT</span></div>
  <div class="ptext t-serif" style="font-size:${size}px">${text}</div>
  <div class="pfoot"><i></i><i></i><i></i></div>
</div></div></div>`
}

// ---------------------------------------------------------------------------------------------------------------
// list: the line as the heading, then 2–5 items building one per beat, each with an index and a rule

function listScene(c: SceneCtx): string {
  const items = (c.line.scene.params.items ?? []).slice(0, 5)
  const n = Math.max(1, items.length)
  const a = Math.min(c.start + 0.55, (c.words[c.words.length - 1]?.t ?? c.start) + 0.2)
  const b = Math.max(a + 0.25 * n, c.end - 0.3)
  const longest = Math.max(1, ...items.map((s) => s.length))
  const size = fit(longest, 116, 700, 0.56)
  const rowsHtml = items
    .map((item, k) => {
      const t = a + (k * (b - a)) / n
      const row = c.m.id()
      land(c.m, row, t, 'left')
      const rule = c.m.id()
      c.m.key(rule, 'sx', t + 0.05, t + 0.5, 0, 1, 'outExpo')
      const dot = c.m.id()
      land(c.m, dot, t + 0.1, 'pop')
      return `<div class="item"><div class="irow" id="${row}"><span class="ix t-ital">${String(k + 1).padStart(2, '0')}</span><span class="it" style="font-size:${size}px">${esc(item)}</span><i class="dot" id="${dot}"></i></div><i class="irule" id="${rule}"></i></div>`
    })
    .join('')
  return `<div class="stage st-list">
  <div class="lhead">${words(c, c.words, 't-bold')}</div>
  <div class="items">${rowsHtml}</div>
</div>`
}

// ---------------------------------------------------------------------------------------------------------------
// logo: a disc pops, the mark focuses in (blur 22 → 0), a sheen crosses it, the words sit under it

function logoScene(c: SceneCtx): string {
  const disc = c.m.id()
  c.m.key(disc, 's', c.start, c.start + 0.55, 0.4, 1, 'outBack')
  appear(c.m, disc, c.start, 0.15)
  const mark = c.m.id()
  const t = c.start + 0.2
  c.m.key(mark, 'b', t, t + 0.45, 22, 0, 'outCubic')
  c.m.key(mark, 's', t, t + 0.6, 0.8, 1, 'outExpo')
  appear(c.m, mark, t, 0.2)
  c.m.key(mark, 's', t + 0.6, c.end, 1, 1.04, 'inOutSine')
  const sheen = c.m.id()
  c.m.key(sheen, 'x', t + 0.55, t + 1.25, -760, 760, 'inOutCubic')
  const echo = c.m.id()
  c.m.key(echo, 's', t + 0.3, t + 1.5, 1, 1.4, 'outCubic')
  c.m.key(echo, 'o', t + 0.3, t + 1.5, 0.8, 0, 'outCubic')
  const inner = c.image
    ? `<img class="mark-img" src="${c.image}" alt="">`
    : `<span class="mono-letter t-display">${esc(Array.from(c.title.trim() || '•')[0]!.toUpperCase())}</span>`
  const hero = findRange(c.words.map((w) => w.text), c.line.scene.params.hero)
  const text = c.words.map((w, k) => word(c, w, hero && k >= hero[0] && k < hero[1] ? 'is-hero t-display' : 't-thin')).join(' ')
  return `<div class="stage st-logo">
  <div class="discbox"><i class="echo" id="${echo}"></i><div class="disc" id="${disc}"><div class="mark" id="${mark}">${inner}</div><i class="sheen" id="${sheen}"></i></div></div>
  <div class="ltext">${text}</div>
</div>`
}

// ---------------------------------------------------------------------------------------------------------------
// art: the hero word huge, the illustration flies in spinning, parks over it (30–55 % covered) and keeps turning

function artScene(c: SceneCtx): string {
  const r = findRange(c.words.map((w) => w.text), c.line.scene.params.hero)
  const heroWords = r ? c.words.slice(r[0], r[1]) : []
  const rest = c.words
  const fly = c.m.id()
  const t = c.start + 0.12
  c.m.key(fly, 'x', t, t + 0.75, 820, 0, 'outExpo')
  c.m.key(fly, 'y', t, t + 0.75, -520, 0, 'outExpo')
  c.m.key(fly, 'r', t, t + 0.8, 48, -5, 'outExpo')
  c.m.key(fly, 'r', t + 0.8, c.end, -5, 3, 'inOutSine')
  c.m.key(fly, 's', t, t + 0.75, 0.45, 1, 'outExpo')
  c.m.key(fly, 'y', t + 0.75, c.end, 0, -24, 'inOutSine')
  const art = c.art
    ? `<img class="art-img" src="${c.art}" alt="">`
    : `<span class="art-blob"><i></i><i></i></span>`
  const big = heroWords.length ? heroWords : rest.slice(-1)
  const inBig = (k: number): boolean => (r ? k >= r[0] && k < r[1] : k === c.words.length - 1)
  const caption = c.words.map((w, k) => word(c, w, inBig(k) ? 't-ital cap-hero' : 't-thin')).join(' ')
  const size = fit(chars(big), 300, STAGE_W, 0.56)
  const top = 150
  return `<div class="stage st-art">
  <div class="acap">${caption}</div>
  <div class="abig t-display" style="font-size:${size}px;top:${top}px">${words(c, big, 'is-hero', 'slam')}</div>
  <div class="afly" id="${fly}" style="top:${Math.round(top + size * 0.68)}px">${art}</div>
</div>`
}

// ---------------------------------------------------------------------------------------------------------------
// photo: a B&W photo pushing in full-bleed, crop marks closing on it, the words stacked in heavy caps over a gradient

function photoScene(c: SceneCtx): string {
  const ph = c.m.id()
  c.m.key(ph, 's', c.start, c.end, 1.08, 1.18, 'linear')
  c.m.key(ph, 'x', c.start, c.end, -18, 18, 'inOutSine')
  const marks = c.m.id()
  c.m.key(marks, 's', c.start, c.start + 0.6, 1.25, 1, 'outExpo')
  appear(c.m, marks, c.start, 0.2)
  const hero = findRange(c.words.map((w) => w.text), c.line.scene.params.hero)
  const stack = rows(c.words, 12, 5)
  const longest = Math.max(...stack.map((r) => chars(r) - 1), 1)
  const size = Math.floor(Math.min(190, STAGE_W / (longest * 0.64), 640 / (stack.length * 0.92)))
  let k = 0
  const body = stack
    .map((row) => {
      const html = row
        .map((w) => {
          const on = hero !== null && k >= hero[0] && k < hero[1]
          k++
          return word(c, w, on ? 'is-hero' : '', 'slam')
        })
        .join(' ')
      return `<div class="row">${html}</div>`
    })
    .join('')
  const img = c.image ? `<img src="${c.image}" alt="">` : '<span class="ph-empty"></span>'
  return `<div class="ph" id="${ph}">${img}</div><div class="ph-shade"></div>
<div class="crop" id="${marks}"><i></i><i></i><i></i><i></i></div>
<div class="stage st-photo"><div class="stack t-cond" style="font-size:${size}px">${body}</div></div>`
}

export const SCENES: Record<SceneType, (c: SceneCtx) => string> = {
  line: lineScene,
  title: titleScene,
  stat: statScene,
  highlight: highlightScene,
  list: listScene,
  logo: logoScene,
  art: artScene,
  photo: photoScene
}

/** The scene's content, by its type (an unknown type draws as a line). */
export function sceneHtml(c: SceneCtx): string {
  return (SCENES[c.line.scene.type] ?? lineScene)(c)
}
