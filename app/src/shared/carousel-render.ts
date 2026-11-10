// One carousel slide as a whole HTML page, 1080 × 1350 (Instagram 4:5). The Carousels page previews it in a
// sandboxed frame and main exports it to PNG from the same HTML, so what is seen is what is posted.
// Every word is text in code (never drawn by an image model); assets come in only as data: URLs.
import type { Carousel, CarouselStyle, Slide } from './carousel'

export const SLIDE_WIDTH = 1080
export const SLIDE_HEIGHT = 1350

/** Fonts, logo and art as data: URLs (main reads the files). Anything else is ignored. */
export interface CarouselAssets {
  fonts: { display: string; text: string; textBold: string }
  logo: string | null
  /** Art file name → data URL. */
  art: Record<string, string>
}

export const NO_ASSETS: CarouselAssets = { fonts: { display: '', text: '', textBold: '' }, logo: null, art: {} }

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
const dataUrl = (u: string | null | undefined): string | null => (u && /^data:(image|font)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(u) ? u : null)

/** The headline, escaped, with the first match of `highlight` (any case) in the accent. */
export function headlineHtml(headline: string, highlight: string): string {
  const h = highlight.trim()
  const at = h ? headline.toLowerCase().indexOf(h.toLowerCase()) : -1
  if (at < 0) return esc(headline)
  return `${esc(headline.slice(0, at))}<span class="hl">${esc(headline.slice(at, at + h.length))}</span>${esc(headline.slice(at + h.length))}`
}

/** Bigger for a short line, smaller for a long one, so a headline always fits its band. */
function headlineSize(s: Slide): number {
  const n = s.headline.length
  const top = s.role === 'body' ? 104 : 128
  if (n <= 18) return top
  if (n <= 32) return top - 16
  if (n <= 50) return top - 32
  if (n <= 80) return top - 48
  return top - 60
}

interface Palette {
  bg: string
  ink: string
  soft: string
  accent: string
  /** The display face for headlines: the serif for editorial, the sans otherwise. */
  display: 'display' | 'textBold'
  /** A dark ground: the only kind a full-colour logo may sit on. */
  dark: boolean
}

const PALETTES: Record<CarouselStyle, Palette> = {
  // Aubergine ground, pearl words, tangerine for the one key word.
  'cut-paper': { bg: '#1E1524', ink: '#F6F3F8', soft: 'rgba(246,243,248,0.72)', accent: '#F58D3D', display: 'textBold', dark: true },
  editorial: { bg: '#F6F3F8', ink: '#1E1524', soft: 'rgba(30,21,36,0.68)', accent: '#C9561C', display: 'display', dark: false },
  midnight: { bg: '#0D0C11', ink: '#FFFFFF', soft: 'rgba(255,255,255,0.7)', accent: '#F58D3D', display: 'textBold', dark: true }
}

function fontFaces(a: CarouselAssets): string {
  const face = (name: string, url: string | null, weight: number): string =>
    url ? `@font-face { font-family: '${name}'; src: url(${url}); font-weight: ${weight}; font-display: block; }` : ''
  return [face('Display', dataUrl(a.fonts.display), 700), face('Text', dataUrl(a.fonts.text), 600), face('TextBold', dataUrl(a.fonts.textBold), 700)].join('\n')
}

function styleCss(p: Palette, size: number): string {
  const display = p.display === 'display' ? "'Display', Georgia, serif" : "'TextBold', 'Helvetica Neue', Arial, sans-serif"
  return `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px; overflow: hidden; background: ${p.bg}; }
  .slide { position: relative; width: ${SLIDE_WIDTH}px; height: ${SLIDE_HEIGHT}px; padding: 110px 96px 120px; display: flex; flex-direction: column;
    color: ${p.ink}; background: ${p.bg}; font-family: 'Text', 'Helvetica Neue', Arial, sans-serif; --headline-size: ${size}px; }
  .top { display: flex; justify-content: space-between; align-items: center; font-size: 28px; letter-spacing: 0.08em; text-transform: uppercase; color: ${p.soft}; }
  .main { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 36px; max-width: 860px; }
  .kicker { font-family: 'TextBold', 'Text', sans-serif; font-size: 34px; letter-spacing: 0.06em; text-transform: uppercase; color: ${p.accent}; }
  .headline { font-family: ${display}; font-size: var(--headline-size); line-height: 1.04; letter-spacing: -0.02em; font-weight: 700; text-wrap: balance; }
  .hl { color: ${p.accent}; }
  .body { font-size: 40px; line-height: 1.38; color: ${p.soft}; max-width: 780px; text-wrap: pretty; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; font-size: 30px; color: ${p.soft}; min-height: 72px; }
  .logo { height: 64px; width: auto; }
  .art { position: absolute; right: 64px; bottom: 150px; width: 380px; height: 380px; object-fit: contain; pointer-events: none; }
  .role-hook .main, .role-cta .main { max-width: 820px; }
  /* editorial: a printed page, hairlines and a big serif */
  .style-editorial .top { border-bottom: 2px solid ${p.ink}; padding-bottom: 22px; color: ${p.ink}; }
  .style-editorial .hl { font-style: italic; }
  .style-editorial .foot { border-top: 2px solid ${p.ink}; padding-top: 22px; color: ${p.ink}; }
  /* midnight: the one key word in a glass capsule */
  .style-midnight .hl { color: ${p.ink}; padding: 0 0.18em; border-radius: 0.3em; background: rgba(245,141,61,0.22); box-shadow: inset 0 0 0 3px ${p.accent}; }
  .style-midnight .slide, .style-midnight { background: radial-gradient(120% 80% at 80% 0%, #24202e 0%, ${p.bg} 55%); }
  /* cut-paper: a soft paper grain on the Aubergine */
  .style-cut-paper { background-image: radial-gradient(rgba(246,243,248,0.035) 1px, transparent 1px); background-size: 6px 6px; }
  `
}

export function slideHtml(c: Carousel, index: number, assets: CarouselAssets): string {
  const s = c.slides[index]
  if (!s) return ''
  const p = PALETTES[c.style]
  const art = s.art ? dataUrl(assets.art[s.art]) : null
  const logo = p.dark && (s.role === 'cta' || index === c.slides.length - 1) ? dataUrl(assets.logo) : null
  const csp = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${fontFaces(assets)}${styleCss(p, headlineSize(s))}</style></head>
<body><div class="slide style-${c.style} role-${s.role}">
  <div class="top"><span>${esc(c.handle)}</span><span>${index + 1} / ${c.slides.length}</span></div>
  <div class="main">
    ${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ''}
    <h1 class="headline">${headlineHtml(s.headline, s.highlight)}</h1>
    ${s.body ? `<p class="body">${esc(s.body)}</p>` : ''}
  </div>
  <div class="foot">${logo ? `<img class="logo" src="${logo}" alt="">` : '<span></span>'}<span>${s.role === 'hook' ? 'Swipe →' : ''}</span></div>
  ${art ? `<img class="art" src="${art}" alt="">` : ''}
</div></body></html>`
}
