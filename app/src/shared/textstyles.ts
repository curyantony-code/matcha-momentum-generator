// OpenReel Video's 8 text styles and 4 overlay templates (MIT), as the engine draws them (engine/reelengine/
// textstyles.py). Only names, the fonts a text card may use, and each overlay's fields live here.

export const TEXT_STYLE_OPTIONS = [
  { key: 'heading', label: 'Heading' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'lower-third', label: 'Lower Third' },
  { key: 'caption', label: 'Caption' },
  { key: 'hero', label: 'Hero' },
  { key: 'quote', label: 'Quote' },
  { key: 'outline', label: 'Outline' },
  { key: 'badge', label: 'Badge' }
] as const

/** Inter is OpenReel's text face; the others are the brand fonts (Figtree is a clean, round brand face). */
export const TEXT_FONT_OPTIONS = ['Inter', 'Figtree Bold', 'Bricolage Grotesque Bold', 'DM Serif Display', 'Anton', 'Caveat Bold'] as const

export type OverlayField = 'text' | 'name' | 'role' | 'accent'

export const OVERLAY_OPTIONS: { key: string; label: string; hint: string; fields: OverlayField[] }[] = [
  { key: 'subtitle-bar', label: 'Subtitle Bar', hint: 'A line of text on a dark bar near the bottom', fields: ['text'] },
  { key: 'lower-third', label: 'Lower Third', hint: 'Your name and role on a card, bottom left', fields: ['name', 'role', 'accent'] },
  { key: 'hashtag-strip', label: 'Hashtag Strip', hint: 'Hashtags along the bottom', fields: ['text'] },
  { key: 'facecam-frame', label: 'Facecam Frame', hint: 'A white rounded frame around your face', fields: [] }
]

const MAX_TEXT = 120
const HEX = /^#[0-9a-f]{6}$/i

/** A text card's params from the form, made safe: the words (trimmed, capped), a known style and font. */
export function textCardParams(raw: { text: unknown; textStyle: unknown; font: unknown }): Record<string, string> | null {
  const text = typeof raw.text === 'string' ? raw.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : ''
  const style = TEXT_STYLE_OPTIONS.find((s) => s.key === raw.textStyle)
  if (!text || !style) return null
  const font: Record<string, string> = (TEXT_FONT_OPTIONS as readonly string[]).includes(raw.font as string) && raw.font !== 'Inter' ? { font: raw.font as string } : {}
  return { text, textStyle: style.key, ...font }
}

/** An overlay's params from the form, made safe: only the template's own fields, text capped, colour checked. */
export function overlayParams(template: unknown, raw: Partial<Record<OverlayField, unknown>>): Record<string, string> | null {
  const opt = OVERLAY_OPTIONS.find((o) => o.key === template)
  if (!opt) return null
  const out: Record<string, string> = { template: opt.key }
  for (const f of opt.fields) {
    const v = typeof raw[f] === 'string' ? (raw[f] as string).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) : ''
    if (f === 'accent') {
      if (HEX.test(v)) out.accent = v.toUpperCase()
    } else if (v) out[f] = v
  }
  return out
}
