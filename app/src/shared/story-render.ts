// The film: a whole story as ONE self-contained HTML page, 1080 × 1920, every scene in it. The Stories page previews
// it in a sandboxed frame (postMessage seek) and main exports it frame by frame (__seek(t) then capture), so what is
// seen is what is posted. Every text is escaped; assets come in only as data: URLs. The look: MG V3, our own code.
import { STORY_HEIGHT, STORY_WIDTH, type Story, type StoryAssets, type StoryPalette, type StoryTiming, type Transition, type World } from './story'
import { sceneTimes, tokens, type SceneTime } from './story-logic'
import { appear, createMotion, runtimeScript, type Motion } from './story-motion'
import { PHOTO_INK, SAFE, STAGE, esc, sceneHtml, type Word, type WorldLook } from './story-scenes'

export const STORY_CSP = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
export const NO_STORY_ASSETS: StoryAssets = { fonts: { display: '', text: '', textBold: '', serif: '', condensed: '' }, logo: null, art: {}, images: {} }

const DATA_URL = /^data:(image|font|application)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i
/** A data: URL of an image or a font, or null (anything else, a path or an http URL, is dropped). */
export const dataUrl = (u: string | null | undefined): string | null => (typeof u === 'string' && DATA_URL.test(u) && !/^data:application\/(?!font|x-font|vnd\.ms-opentype)/i.test(u) ? u : null)
const imageUrl = (u: string | null | undefined): string | null => (dataUrl(u)?.startsWith('data:image/') ? u! : null)

// ---------------------------------------------------------------------------------------------------------------
// Palettes: brand (Aubergine / Pearl / Tangerine) and mono (paper / ink / clay / grey / black)

const look = (bg: string, ink: string, soft: string, hero: string, slab: string, accent: string, card: string, cardInk: string, dark: boolean): WorldLook =>
  ({ bg, ink, soft, hero, slab, accent, card, cardInk, dark })

export const PALETTES: Record<StoryPalette, Record<World, WorldLook>> = {
  mono: {
    paper: look('#E9E7E1', '#1C1B1E', '#6F6E6A', '#0F0E13', '#D97757', '#D97757', '#F3F2EF', '#1C1B1E', false),
    ink: look('#0F0E13', '#EDEBE6', 'rgba(237,235,230,0.56)', '#D97757', 'rgba(217,119,87,0.24)', '#D97757', '#F2EEE4', '#1C1B1E', true),
    clay: look('#D97757', '#1C1B1E', 'rgba(28,27,30,0.66)', '#F3F2EF', '#0F0E13', '#0F0E13', '#F3F2EF', '#1C1B1E', false),
    grey: look('#BEBEBC', '#1C1B1E', '#55564F', '#0F0E13', '#D97757', '#D97757', '#F3F2EF', '#1C1B1E', false),
    black: look('#000000', '#EDEBE6', 'rgba(237,235,230,0.52)', '#D97757', 'rgba(255,255,255,0.1)', '#D97757', '#F2EEE4', '#1C1B1E', true),
    brand: look('#17161B', '#EDEBE6', 'rgba(237,235,230,0.56)', '#F3F2EF', '#D97757', '#D97757', '#F2EEE4', '#1C1B1E', true)
  },
  brand: {
    paper: look('#F6F3F8', '#1E1524', 'rgba(30,21,36,0.6)', '#1E1524', '#F58D3D', '#F58D3D', '#FFFFFF', '#1E1524', false),
    ink: look('#1E1524', '#F6F3F8', 'rgba(246,243,248,0.58)', '#F58D3D', 'rgba(245,141,61,0.22)', '#F58D3D', '#F6F3F8', '#1E1524', true),
    clay: look('#F58D3D', '#1E1524', 'rgba(30,21,36,0.68)', '#F6F3F8', '#1E1524', '#1E1524', '#F6F3F8', '#1E1524', false),
    grey: look('#D3CBD7', '#1E1524', 'rgba(30,21,36,0.62)', '#1E1524', '#F58D3D', '#F58D3D', '#F6F3F8', '#1E1524', false),
    black: look('#0C0910', '#F6F3F8', 'rgba(246,243,248,0.52)', '#F58D3D', 'rgba(255,255,255,0.1)', '#F58D3D', '#F6F3F8', '#1E1524', true),
    brand: look('#2A1C33', '#F6F3F8', 'rgba(246,243,248,0.6)', '#F6F3F8', '#F58D3D', '#F58D3D', '#F6F3F8', '#1E1524', true)
  }
}

function worldVars(l: WorldLook): string {
  return `--bg:${l.bg};--ink:${l.ink};--soft:${l.soft};--hero:${l.hero};--slab:${l.slab};--accent:${l.accent};--card:${l.card};--card-ink:${l.cardInk}`
}

// ---------------------------------------------------------------------------------------------------------------
// Worlds: the ground of a scene, each with something drifting in it (the camera is never still)

function ground(m: Motion, w: World, i: number, t: SceneTime): string {
  const dir = i % 2 ? -1 : 1
  const drift = (cls: string, dx: number, dy: number, s0 = 1, s1 = 1): string => {
    const id = m.id()
    m.key(id, 'x', t.start, t.end, -dx * dir, dx * dir, 'linear')
    m.key(id, 'y', t.start, t.end, -dy, dy, 'linear')
    if (s0 !== s1) m.key(id, 's', t.start, t.end, s0, s1, 'linear')
    return `<i class="${cls}" id="${id}"></i>`
  }
  const deco: Record<World, () => string> = {
    paper: () => `<i class="grid"></i>${drift('blob b1', 60, 20)}${drift('blob b2', -50, 30)}`,
    ink: () => `${drift('rings', 0, 0, 0.92, 1.06)}<i class="dots"></i>`,
    clay: () => `${drift('glow', 40, 20)}<i class="hatch"></i>`,
    grey: () => `<i class="doc"></i><i class="floor"></i>${drift('blob b1 soft', 40, 10)}`,
    black: () => `${drift('spot', 30, 10, 1, 1.08)}<i class="vig"></i>`,
    brand: () => `${drift('sun', 50, 30, 0.96, 1.04)}${drift('rings', 0, 0, 0.94, 1.04)}`
  }
  return `<div class="ground g-${w}">${deco[w]()}</div>`
}

// ---------------------------------------------------------------------------------------------------------------
// Garnish: mono micro label, italic index number, crosshairs, a ticket with the handle and a barcode

/** Bars from the line's text: deterministic, never random. */
function barcode(seed: string): string {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  const bars: string[] = []
  for (let k = 0; k < 26; k++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
    bars.push(`<i style="width:${1 + (h % 4)}px;margin-right:${1 + ((h >>> 4) % 3)}px"></i>`)
  }
  return `<span class="bars">${bars.join('')}</span>`
}

function garnish(m: Motion, story: Story, i: number, t: SceneTime, onPhoto: boolean): string {
  const id = m.id()
  appear(m, id, t.start + 0.08, 0.3)
  const n = story.lines.length
  const type = story.lines[i]!.scene.type.toUpperCase()
  const handle = story.handle ? esc(story.handle) : ''
  return `<div class="garnish${onPhoto ? ' on-photo' : ''}" id="${id}">
  <div class="micro t-mono">${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')} &nbsp;·&nbsp; ${esc(type)}</div>
  <div class="index t-ital">${String(i + 1).padStart(3, '0')}</div>
  <i class="cross c1"></i><i class="cross c2"></i>
  <div class="ticket"><span class="t-mono">${handle}</span>${barcode(story.lines[i]!.shown + i)}</div>
</div>`
}

// ---------------------------------------------------------------------------------------------------------------
// Transitions: how scene i arrives at its start b. Never a crossfade.

export const TRANSITION_SECONDS: Record<Transition, number> = { cut: 0, flash: 0.22, zoom: 0.34, whip: 0.28, wipe: 0.46, iris: 0.5 }
const WHIP_LEAD = 0.16
/** How long the scene before stays on screen under this one. */
const overlap = (tr: Transition | undefined): number => (tr && tr !== 'flash' ? TRANSITION_SECONDS[tr] : 0)

interface Arrival {
  /** Elements added to the scene for its transition (slab, iris ring). */
  extra: string
}

function arrive(m: Motion, tr: Transition, tw: string, b: number): Arrival {
  if (tr === 'zoom') {
    m.key(tw, 's', b, b + 0.34, 1.32, 1, 'outExpo')
    m.key(tw, 'b', b, b + 0.3, 18, 0, 'outCubic')
  } else if (tr === 'whip') {
    // Arrives with the old scene's push: it is already on its way in for the last WHIP_LEAD seconds of that one.
    m.key(tw, 'x', b - WHIP_LEAD, b, STORY_WIDTH, 480, 'inCubic')
    m.key(tw, 'x', b, b + 0.28, 480, 0, 'outExpo')
    m.key(tw, 'b', b - WHIP_LEAD, b, 26, 26, 'linear')
    m.key(tw, 'b', b, b + 0.24, 26, 0, 'outCubic')
  } else if (tr === 'cut' || tr === 'flash') {
    m.key(tw, 's', b, b + 0.24, 1.05, 1, 'outCubic')
  } else if (tr === 'wipe') {
    m.key(tw, 'ct', b + 0.08, b + 0.46, 100, 0, 'outExpo')
    const slab = m.id()
    m.key(slab, 'ct', b, b + 0.34, 100, 0, 'outExpo')
    m.key(slab, 'cb', b + 0.08, b + 0.46, 0, 100, 'outExpo')
    m.set(slab, 'o', b + 0.47, 0)
    return { extra: `<i class="tslab" id="${slab}"></i>` }
  } else if (tr === 'iris') {
    m.key(tw, 'iris', b, b + 0.5, 0, 100, 'inOutCubic')
    const ring = m.id()
    m.key(ring, 's', b, b + 0.5, 0.02, 1.3, 'inOutCubic')
    m.key(ring, 'o', b + 0.35, b + 0.5, 1, 0, 'linear')
    m.set(ring, 'o', b - 0.001, 1)
    return { extra: `<i class="tiris" id="${ring}"></i>` }
  }
  return { extra: '' }
}

/** How scene i leaves when the next one arrives at `b` with `next` (zoom and whip push the old scene out first). */
function leave(m: Motion, next: Transition | undefined, tw: string, b: number, own: SceneTime): void {
  const t0 = next === 'whip' ? b - WHIP_LEAD : Math.max(own.start + 0.5, b - 0.16)
  if (t0 >= b || t0 < own.start) return
  if (next === 'zoom') {
    m.key(tw, 's', t0, b, 1, 1.4, 'inCubic')
    m.key(tw, 'b', t0, b, 0, 20, 'inCubic')
  } else if (next === 'whip') {
    m.key(tw, 'x', t0, b, 0, -600, 'inCubic')
    m.key(tw, 'b', t0, b, 0, 26, 'inCubic')
  }
}

/** The flash between worlds: a white bloom and an anamorphic streak in the accent, peaking at the cut. */
function flashKeys(m: Motion, flash: string, streak: string, b: number): void {
  m.key(flash, 'o', b - 0.07, b, 0, 0.95, 'inCubic')
  m.key(flash, 'o', b, b + 0.22, 0.95, 0, 'outCubic')
  m.key(streak, 'sx', b - 0.1, b + 0.04, 0, 1, 'outCubic')
  m.key(streak, 'o', b - 0.1, b - 0.06, 0, 1, 'linear')
  m.key(streak, 'o', b + 0.04, b + 0.22, 1, 0, 'outCubic')
}

// ---------------------------------------------------------------------------------------------------------------
// Words on their onsets

/** The shown words of line i, each with its onset: the voice's word times when they exist, spread evenly otherwise. */
export function lineWords(story: Story, timing: StoryTiming, i: number, t: SceneTime): Word[] {
  const shown = tokens(story.lines[i]!.shown)
  const timed = timing.words.filter((w) => w.line === i && Number.isFinite(w.s)).map((w) => w.s).sort((a, b) => a - b)
  const span = timing.lines[i]
  const a = span && Number.isFinite(span.start) ? span.start : t.start
  const z = span && Number.isFinite(span.end) && span.end > a ? span.end : Math.min(t.end, a + shown.length / 2.6)
  const latest = Math.max(t.start, t.end - 0.2)
  let prev = t.start
  return shown.map((text, k) => {
    const raw = timed.length ? timed[Math.min(timed.length - 1, Math.floor((k * timed.length) / shown.length))]! : a + ((z - a) * k) / Math.max(1, shown.length)
    const at = Math.min(latest, Math.max(prev, t.start, raw))
    prev = at
    return { text, t: at }
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Fonts

function fontFaces(a: StoryAssets): string {
  const f = a.fonts ?? NO_STORY_ASSETS.fonts
  const face = (name: string, url: string | undefined, weight: number, style = 'normal'): string => {
    const u = dataUrl(url)
    return u ? `@font-face{font-family:'${name}';src:url(${u});font-weight:${weight};font-style:${style};font-display:block}` : ''
  }
  return [
    face('SDisplay', f.display, 700),
    face('SText', f.text, 600),
    face('STextBold', f.textBold, 700),
    face('SSerif', f.serif || f.display, 400),
    face('SSerif', f.serif || f.display, 700),
    face('SCond', f.condensed || f.textBold, 800)
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// The page

function sceneImage(story: Story, i: number, assets: StoryAssets): { image: string | null; art: string | null } {
  const p = story.lines[i]!.scene.params
  const type = story.lines[i]!.scene.type
  const lib = p.image ? imageUrl(assets.images?.[p.image]) : null
  const image = type === 'logo' ? lib ?? imageUrl(assets.logo) : type === 'photo' ? lib : null
  const art = type === 'art' && p.art ? imageUrl(assets.art?.[p.art]) : null
  return { image, art }
}

interface Built {
  html: string
  window: [string, number, number]
}

function buildScene(m: Motion, story: Story, timing: StoryTiming, times: SceneTime[], i: number, duration: number, assets: StoryAssets): Built {
  const line = story.lines[i]!
  const t = times[i]!
  const l = PALETTES[story.palette][line.scene.world]
  const { image, art } = sceneImage(story, i, assets)
  const sid = m.id()
  const tw = m.id()
  const cam = m.id()
  const dir = i % 2 ? -1 : 1
  m.key(cam, 's', t.start, t.end, 1, 1.05, 'linear')
  m.key(cam, 'x', t.start, t.end, -8 * dir, 8 * dir, 'linear')
  m.key(cam, 'r', t.start, t.end, -0.35 * dir, 0.35 * dir, 'linear')
  const tr = i === 0 ? 'cut' : line.scene.transition
  const { extra } = i === 0 ? { extra: '' } : arrive(m, tr, tw, t.start)
  const next = story.lines[i + 1]?.scene.transition
  if (i < story.lines.length - 1) leave(m, next, tw, times[i + 1]!.start, t)
  const words = lineWords(story, timing, i, t)
  const content = sceneHtml({ m, i, line, words, start: t.start, end: t.end, look: l, image, art, title: story.title })
  const onPhoto = line.scene.type === 'photo' && image !== null
  const html = `<section class="scene w-${line.scene.world} s-${line.scene.type}${l.dark ? ' dark' : ''}" id="${sid}" style="z-index:${i + 1};${worldVars(l)}">
<div class="tw" id="${tw}"><div class="cam" id="${cam}">${ground(m, line.scene.world, i, t)}<div class="content">${content}</div></div>${garnish(m, story, i, t, onPhoto)}</div>${extra}
</section>`
  const from = i === 0 ? 0 : tr === 'whip' ? Math.max(times[i - 1]!.start, t.start - WHIP_LEAD) : t.start
  const to = i === story.lines.length - 1 ? duration + 1 : t.end + overlap(next)
  return { html, window: [sid, from, to] }
}

// ---------------------------------------------------------------------------------------------------------------
// The stylesheet (static: every colour comes from the world's variables set on its scene)

const GRAIN = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.9 0'/></filter><rect width='240' height='240' filter='url(%23n)'/></svg>").replace(/%2523/g, '%23')}")`

const SANS = "'SText','Helvetica Neue',Arial,sans-serif"
const BOLD = "'STextBold','SText','Helvetica Neue',Arial,sans-serif"
const SERIF = "'SSerif','SDisplay',Georgia,'Times New Roman',serif"
const DISPLAY = "'SDisplay','SSerif',Georgia,serif"
const COND = "'SCond','STextBold','Arial Narrow','Helvetica Neue',Arial,sans-serif"
const MONO = "'SF Mono',Menlo,Consolas,ui-monospace,monospace"

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${STORY_WIDTH}px;height:${STORY_HEIGHT}px;overflow:hidden;background:#000}
#film{position:relative;width:${STORY_WIDTH}px;height:${STORY_HEIGHT}px;overflow:hidden;font-family:${SANS};-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.scene{position:absolute;inset:0;display:none;color:var(--ink);overflow:hidden}
.tw,.cam,.content,.ground{position:absolute;inset:0}
.tw{background:var(--bg);transform-origin:50% 50%}
.cam{transform-origin:50% 46%}
.ground{overflow:hidden;pointer-events:none}
.ground i,.garnish i{display:block}
.stage{position:absolute;left:${STAGE.left}px;top:${STAGE.top}px;width:${STAGE.width}px;height:${STAGE.height}px;display:flex;flex-direction:column;justify-content:center}
.w{display:inline-block;white-space:pre}
.t-display{font-family:${DISPLAY};font-weight:700;letter-spacing:-0.035em;line-height:0.92}
.t-thin{font-family:${SANS};font-weight:600;color:var(--soft);letter-spacing:-0.01em}
.t-bold{font-family:${BOLD};font-weight:700;letter-spacing:-0.025em}
.t-ital{font-family:${SERIF};font-style:italic;font-weight:400;letter-spacing:-0.02em}
.t-serif{font-family:${SERIF};font-weight:400;letter-spacing:-0.015em}
.t-cond{font-family:${COND};font-weight:800;text-transform:uppercase;letter-spacing:-0.035em;line-height:0.86}
.t-mono{font-family:${MONO};font-size:22px;font-weight:500;letter-spacing:0.16em;text-transform:uppercase}
.t-track{font-family:${BOLD};font-weight:700;letter-spacing:0.28em;text-transform:uppercase}
`

const GROUND_CSS = `
.grid{position:absolute;inset:-90px;background-image:linear-gradient(rgba(0,0,0,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.055) 1px,transparent 1px);background-size:90px 90px}
.blob{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(0,0,0,.09) 0,rgba(0,0,0,0) 68%)}
.b1{width:900px;height:900px;left:-300px;top:200px}.b2{width:760px;height:760px;right:-260px;top:1000px}
.blob.soft{background:radial-gradient(circle,rgba(255,255,255,.35) 0,rgba(255,255,255,0) 68%)}
.rings{position:absolute;left:50%;top:44%;width:1800px;height:1800px;margin:-900px 0 0 -900px;border-radius:50%;background:repeating-radial-gradient(circle,rgba(255,255,255,0) 0 128px,rgba(255,255,255,.075) 128px 130px)}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.08) 1.5px,transparent 2px);background-size:54px 54px}
.glow{position:absolute;left:-260px;top:-160px;width:1400px;height:1400px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.3) 0,rgba(255,255,255,0) 64%)}
.hatch{position:absolute;left:0;right:0;bottom:0;height:42%;background:repeating-linear-gradient(135deg,rgba(0,0,0,.06) 0 2px,transparent 2px 24px);-webkit-mask-image:linear-gradient(transparent,#000)}
.doc{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.035) 0 2px,transparent 2px 46px)}
.floor{position:absolute;left:0;right:0;bottom:0;height:40%;background:linear-gradient(180deg,rgba(85,86,79,0),rgba(85,86,79,.55))}
.spot{position:absolute;inset:-200px;background:radial-gradient(circle at 50% 40%,rgba(255,255,255,.13) 0,rgba(255,255,255,0) 46%)}
.vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,rgba(0,0,0,0) 45%,rgba(0,0,0,.75) 100%)}
.sun{position:absolute;right:-420px;top:860px;width:1300px;height:1300px;border-radius:50%;background:radial-gradient(circle,var(--slab) 0,rgba(0,0,0,0) 66%);opacity:.6}
.g-brand .rings{top:62%;left:78%}
`

const GARNISH_CSS = `
.garnish{position:absolute;inset:0;pointer-events:none;color:var(--soft)}
.garnish.on-photo{color:rgba(243,242,239,.78)}
.micro{position:absolute;left:${SAFE.left}px;top:236px;font-size:21px;white-space:nowrap}
.index{position:absolute;right:${SAFE.left}px;top:222px;font-size:56px;line-height:1;color:var(--accent)}
.on-photo .index{color:var(--film-accent)}
.cross{position:absolute;width:30px;height:30px}
.cross::before,.cross::after{content:'';position:absolute;background:currentColor}
.cross::before{left:14px;top:0;width:2px;height:30px}.cross::after{top:14px;left:0;height:2px;width:30px}
.c1{left:${SAFE.left - 15}px;top:1440px}.c2{right:${SAFE.left - 15}px;top:286px}
.ticket{position:absolute;left:${SAFE.left}px;right:${SAFE.left}px;top:1482px;border-top:2px solid currentColor;padding-top:14px;display:flex;justify-content:space-between;align-items:flex-start;opacity:.85}
.ticket .t-mono{font-size:20px}
.bars{display:flex;height:30px}.bars i{height:30px;background:currentColor}
.flash{position:absolute;inset:0;background:#fff;z-index:1000;opacity:0}
.streak{position:absolute;left:-10%;width:120%;top:50%;height:16px;margin-top:-8px;z-index:1001;opacity:0;background:linear-gradient(90deg,rgba(255,255,255,0),var(--film-accent) 28%,#fff 50%,var(--film-accent) 72%,rgba(255,255,255,0));box-shadow:0 0 60px 16px rgba(255,255,255,.55)}
.grain{position:absolute;inset:0;z-index:1002;pointer-events:none;opacity:.09;background-image:${GRAIN};background-size:240px 240px;mix-blend-mode:overlay}
.tslab{position:absolute;inset:0;background:var(--film-accent);z-index:5}
.tiris{position:absolute;left:50%;top:50%;width:2400px;height:2400px;margin:-1200px 0 0 -1200px;border-radius:50%;border:12px solid var(--film-accent);z-index:5}
`

const SCENE_CSS = `
.st-line .pre{font-size:62px;line-height:1.14;margin-bottom:18px;max-width:900px}
.herobox{position:relative;align-self:flex-start;isolation:isolate}
.herobox .slab{position:absolute;left:-28px;right:-28px;bottom:4%;height:40%;background:var(--slab);transform-origin:0 50%;z-index:-1}
.hero{color:var(--hero);line-height:0.9}
.st-line .post{font-size:88px;line-height:1.04;margin-top:34px;color:var(--ink);max-width:900px}
.plain-text{font-family:${BOLD};line-height:1.06;color:var(--ink)}
.plain-text .t-ital{color:var(--hero)}
.w-paper .plain-text .t-ital,.w-grey .plain-text .t-ital{color:var(--accent)}
.st-line .rule{display:block;width:300px;height:12px;margin-top:48px;background:var(--accent);transform-origin:0 50%}
.kicker{display:flex;align-items:center;gap:22px;font-size:28px;color:var(--accent);margin-bottom:48px}
.kicker i{display:block;width:72px;height:3px;background:currentColor}
.stack{position:relative;isolation:isolate;color:var(--ink)}
.stack .row{display:block;white-space:nowrap}
.stack .is-hero{color:var(--accent)}
.w-clay .stack .is-hero{color:var(--hero)}
.stack .bar{position:absolute;left:-${SAFE.left}px;width:56%;top:34%;height:30%;background:var(--slab);transform-origin:0 50%;z-index:-1;opacity:.9}
.st-stat{align-items:center;text-align:center}
.st-stat .cap{font-size:58px;line-height:1.14;max-width:880px;margin-bottom:56px}
.numbox{position:relative;display:flex;justify-content:center;align-items:center}
.ring{position:absolute;left:50%;top:50%;border-radius:50%;border:4px solid var(--accent)}
.num{position:relative;display:flex;color:var(--hero);line-height:1;font-variant-numeric:tabular-nums}
.dg{display:inline-block;height:1em;overflow:hidden}
.col{display:flex;flex-direction:column}
.col b{display:block;height:1em;line-height:1;font-weight:inherit}
.ch{display:inline-block;line-height:1}
.ticks{display:block;width:560px;height:22px;margin-top:48px;background:repeating-linear-gradient(90deg,var(--ink) 0 2px,transparent 2px 28px);opacity:.5}
.st-stat .label{font-size:78px;margin-top:26px;color:var(--ink)}
.st-highlight{align-items:center}
.pmove{width:920px}
.paper{position:relative;transform:rotate(-3deg);background:var(--card);color:var(--card-ink);padding:60px 64px 54px;box-shadow:0 50px 90px rgba(0,0,0,.30),0 8px 18px rgba(0,0,0,.18)}
.paper::before{content:'';position:absolute;top:-28px;left:50%;width:200px;height:56px;margin-left:-100px;background:rgba(255,255,255,.55);transform:rotate(3deg);box-shadow:0 2px 6px rgba(0,0,0,.12)}
.phead{display:flex;justify-content:space-between;color:rgba(0,0,0,.5);border-bottom:2px solid rgba(0,0,0,.18);padding-bottom:18px;margin-bottom:40px}
.ptext{line-height:1.24}
.hw{position:relative;display:inline-block;isolation:isolate}
.mk{position:absolute;left:-8px;right:-8px;top:22%;bottom:4%;background:var(--film-accent);opacity:.9;transform-origin:0 50%;z-index:-1;border-radius:3px}
.pfoot{margin-top:44px}.pfoot i{display:block;height:14px;background:rgba(0,0,0,.08);margin-top:18px}
.pfoot i:nth-child(1){width:100%}.pfoot i:nth-child(2){width:90%}.pfoot i:nth-child(3){width:56%}
.lhead{font-size:72px;line-height:1.06;margin-bottom:72px;color:var(--ink)}
.item{margin-bottom:36px}
.irow{display:flex;align-items:baseline;gap:30px}
.ix{font-size:66px;color:var(--accent);min-width:92px;line-height:1}
.it{font-family:${BOLD};font-weight:700;letter-spacing:-0.025em;line-height:1.04;color:var(--ink)}
.dot{width:20px;height:20px;border-radius:50%;background:var(--accent);margin-left:auto;align-self:center;flex:none}
.irule{display:block;height:2px;background:var(--ink);opacity:.22;margin-top:32px;transform-origin:0 50%}
.st-logo{align-items:center}
.discbox{position:relative;width:620px;height:620px;flex:none}
.disc{position:absolute;inset:0;border-radius:50%;background:var(--card);overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:0 40px 90px rgba(0,0,0,.28),inset 0 0 0 8px var(--film-accent)}
.mark{width:64%;height:64%;display:flex;align-items:center;justify-content:center}
.mark-img{max-width:100%;max-height:100%;object-fit:contain}
.mono-letter{font-size:380px;color:var(--film-accent);line-height:1}
.sheen{position:absolute;top:0;bottom:0;left:50%;width:420px;margin-left:-210px;background:linear-gradient(105deg,rgba(255,255,255,0) 30%,rgba(255,255,255,.7) 50%,rgba(255,255,255,0) 70%)}
.echo{position:absolute;inset:-14px;border-radius:50%;border:3px solid var(--accent)}
.ltext{margin-top:80px;font-size:62px;line-height:1.12;text-align:center;max-width:900px}
.ltext .is-hero{font-size:124px;color:var(--hero);display:inline-block}
.st-art{align-items:center;text-align:center}
.acap{position:absolute;left:0;right:0;bottom:70px;font-size:60px;line-height:1.12;z-index:3}
.abig{position:absolute;left:0;right:0;z-index:1;color:var(--hero);line-height:.9;white-space:nowrap}
.afly{position:absolute;left:50%;width:640px;height:640px;margin-left:-320px;z-index:2;display:flex;align-items:center;justify-content:center}
.acap .cap-hero{color:var(--ink)}
.w-clay .art-blob i:first-child{background:var(--slab)}
.art-img{max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 34px 40px rgba(0,0,0,.32))}
.art-blob{position:relative;display:block;width:520px;height:520px}
.art-blob i{position:absolute;border-radius:50%;display:block}
.art-blob i:first-child{inset:0;background:var(--film-accent);box-shadow:18px 26px 0 rgba(0,0,0,.22)}
.art-blob i:last-child{width:46%;height:46%;right:-4%;top:-6%;background:var(--card);box-shadow:10px 14px 0 rgba(0,0,0,.18)}
.ph{position:absolute;inset:0;overflow:hidden}
.ph img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.18) brightness(.92)}
.ph-empty{position:absolute;inset:0;background:radial-gradient(circle at 50% 30%,#3b3a37 0,#0b0b0c 70%)}
.ph-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35) 0,rgba(0,0,0,0) 26%,rgba(0,0,0,.45) 56%,rgba(0,0,0,.9) 100%)}
.crop{position:absolute;left:${SAFE.left}px;right:${SAFE.left}px;top:300px;bottom:460px}
.crop i{position:absolute;width:72px;height:72px;border:0 solid var(--photo-ink)}
.crop i:nth-child(1){left:0;top:0;border-width:5px 0 0 5px}.crop i:nth-child(2){right:0;top:0;border-width:5px 5px 0 0}
.crop i:nth-child(3){left:0;bottom:0;border-width:0 0 5px 5px}.crop i:nth-child(4){right:0;bottom:0;border-width:0 5px 5px 0}
.st-photo{justify-content:flex-end;padding:0 24px 60px}
.st-photo .stack{color:var(--photo-ink)}
.st-photo .stack .is-hero{color:var(--film-accent)}
`

export const STORY_CSS = BASE_CSS + GROUND_CSS + GARNISH_CSS + SCENE_CSS

/** The whole film as one page: __duration, a synchronous deterministic __seek(t), and a postMessage seek listener. */
export function storyHtml(story: Story, timing: StoryTiming, assets: StoryAssets): string {
  const safe: StoryAssets = assets ?? NO_STORY_ASSETS
  const m = createMotion()
  const times = sceneTimes(story, timing)
  const duration = times.length ? times[times.length - 1]!.end : 0
  const built = story.lines.map((_, i) => buildScene(m, story, timing, times, i, duration, safe))
  const flash = m.id()
  const streak = m.id()
  m.set(flash, 'o', 0, 0)
  m.set(streak, 'o', 0, 0)
  story.lines.forEach((l, i) => {
    if (i > 0 && l.scene.transition === 'flash') flashKeys(m, flash, streak, times[i]!.start)
  })
  const accent = PALETTES[story.palette].paper.accent
  const script = runtimeScript({ duration: Math.round(duration * 1000) / 1000, scenes: built.map((b) => b.window), keys: m.rows() })
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${STORY_CSP}">
<meta name="viewport" content="width=${STORY_WIDTH}">
<title>${esc(story.title)}</title>
<style>
${fontFaces(safe)}
${STORY_CSS}
#film{--film-accent:${accent};--photo-ink:${PHOTO_INK};--safe-top:${SAFE.top}px;--safe-bottom:${STORY_HEIGHT - SAFE.bottom}px}
</style></head>
<body><div id="film" class="p-${story.palette}">
${built.map((b) => b.html).join('\n')}
<i class="flash" id="${flash}"></i><i class="streak" id="${streak}"></i><i class="grain"></i>
</div>
<script>${script}</script>
</body></html>`
}
