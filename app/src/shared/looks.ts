import { OPENREEL_LOOKS } from './openreel-looks'
// Colour filters, as named in engine/reelengine/looks.py. `css` is only a stand-in for the tile previews.

// Matcha Momentum Generator's own seven, then OpenReel Video's 30 colour presets (openreel-looks.ts, generated, MIT), by group.
export type FilterName = string

export const FILTER_GROUPS = ['Basics', 'Cinematic', 'Vintage', 'Mood', 'Colour', 'Stylized'] as const

export const FILTERS: { key: FilterName; label: string; css: string; group: string; hint?: string }[] = [
  { key: 'none', label: 'None', css: 'none', group: 'Basics' },
  { key: 'warm', label: 'Warm', css: 'sepia(0.18) saturate(1.1)', group: 'Basics' },
  { key: 'cool', label: 'Cool', css: 'hue-rotate(-8deg) saturate(0.95) brightness(1.02)', group: 'Basics' },
  { key: 'vivid', label: 'Vivid', css: 'saturate(1.35) contrast(1.06)', group: 'Basics' },
  { key: 'film', label: 'Film', css: 'contrast(1.08) saturate(0.82) sepia(0.08)', group: 'Basics' },
  { key: 'faded', label: 'Faded', css: 'contrast(0.88) brightness(1.04) saturate(0.8)', group: 'Basics' },
  { key: 'mono', label: 'Black and white', css: 'grayscale(1) contrast(1.08)', group: 'Basics' },
  ...OPENREEL_LOOKS.map((l) => ({ key: l.key, label: l.label, css: l.css, group: l.group, hint: l.hint }))
]

export const isFilter = (v: unknown): v is FilterName => FILTERS.some((f) => f.key === v)

/** The look every new video starts with, set in Settings. */
export interface DefaultLook {
  filter: FilterName
  /** Subtitle style fields (size, position, color, box...), or null to keep the editor's own default. */
  captionStyle: Record<string, unknown> | null
  /** Pops, swishes and taps on text cards, animations and pictures (engine soundfx.py). */
  soundEffects: boolean
  /** Fix each take's brightness and white balance before the filter (engine autocolor.py). On unless turned off. */
  autoColor: boolean
  /** One look for every picture card (engine picstyle.py). Absent = as now. */
  pictureStyle?: PictureStyle
  /** Border colour for the notebook and outline picture styles. */
  pictureColor?: string
  /** A whole way of editing, beyond the look: 'upscale' = the Upscale reel edit (EDIT_STYLES). Absent = Matcha Momentum Generator's own. */
  editStyle?: EditStyle
}

/** Ways of editing a reel the AI editor follows on top of the look (ai/src/editor.ts reads project.look.editStyle). */
export type EditStyle = 'upscale'
export const EDIT_STYLES: { key: EditStyle; label: string; hint: string }[] = [
  {
    key: 'upscale',
    label: 'Upscale',
    hint: 'Dark and clean: 1 to 3 words on screen, one big serif key word per line, big words behind you, gentle push-ins, a hit, whoosh and chime'
  }
]
export const isEditStyle = (v: unknown): v is EditStyle => EDIT_STYLES.some((s) => s.key === v)

export const NO_DEFAULT_LOOK: DefaultLook = { filter: 'none', captionStyle: null, soundEffects: false, autoColor: true }

// Picture styles, as named in engine/reelengine/picstyle.py. `css` only draws the tiles on the settings page.
export type PictureStyle = 'as-is' | 'notebook' | 'rounded' | 'outline'
export const PICTURE_STYLES: { key: PictureStyle; label: string; hint: string; colour: boolean }[] = [
  { key: 'as-is', label: 'As now', hint: 'A slight tilt, rounded corners, a shadow', colour: false },
  { key: 'rounded', label: 'Rounded', hint: 'Level, soft rounded corners, a shadow', colour: false },
  { key: 'notebook', label: 'Notebook', hint: 'A paper border, tilted left and right in turn', colour: true },
  { key: 'outline', label: 'Outline', hint: 'Level and flat, with a thin coloured line', colour: true }
]
export const isPictureStyle = (v: unknown): v is PictureStyle => PICTURE_STYLES.some((s) => s.key === v)

const HEX = /^#[0-9a-f]{6}$/i

/** The picture fields of a look, only the ones that are set (no style = as now). */
function pictureFields(r: Record<string, unknown>): { pictureStyle?: PictureStyle; pictureColor?: string } {
  const style = isPictureStyle(r.pictureStyle) && r.pictureStyle !== 'as-is' ? { pictureStyle: r.pictureStyle } : {}
  const colour = typeof r.pictureColor === 'string' && HEX.test(r.pictureColor) ? { pictureColor: r.pictureColor.toUpperCase() } : {}
  return { ...style, ...colour }
}
/** Caption fonts that render through the subtitle renderer (libass), checked with a real render on 2026-11-02.
 * Inter and Fraunces are shipped too, but libass swaps them for another face, which the engine refuses. */
// DM Serif Display, Anton and Caveat Bold were added 2026-11-03 for the brand, each proven in a real libass render
// (engine tests/test_brand_fonts.py).
// Figtree (a clean, round brand face) and Bricolage Grotesque were added 2026-11-04, proven the same way.
export const CAPTION_FONTS = ['Montserrat SemiBold', 'Roboto Medium', 'Roboto', 'DM Serif Display', 'Anton', 'Caveat Bold', 'Figtree SemiBold', 'Figtree Bold', 'Bricolage Grotesque Bold'] as const

/** OpenReel Video's 7 subtitle presets (SUBTITLE_STYLE_PRESETS in its subtitle-engine.ts, MIT) as caption styles.
 * Its sizes are for its own preview: x4 gives the same share of a 1080-wide frame. Its fonts are system fonts
 * Matcha Momentum Generator can't ship, so each uses the nearest shipped face (said in `note`). Its backgrounds become the box. */
export const OPENREEL_CAPTION_LOOKS: { key: string; label: string; note: string; style: Record<string, unknown> }[] = [
  { key: 'or-classic', label: 'Classic', note: 'Arial, so Roboto', style: { font: 'Roboto', size: 96, color: '#FFFFFF', outlineColor: '#000000', box: true, position: 0.8, case: 'as-is' } },
  { key: 'or-modern', label: 'Modern', note: 'Helvetica Neue, so Roboto Medium', style: { font: 'Roboto Medium', size: 112, color: '#FFFFFF', outlineColor: '#000000', box: true, position: 0.8, case: 'as-is' } },
  { key: 'or-cinematic', label: 'Cinematic', note: 'Georgia, so DM Serif Display', style: { font: 'DM Serif Display', size: 104, color: '#F0F0F0', outlineColor: '#000000', box: false, position: 0.8, case: 'as-is' } },
  { key: 'or-bold', label: 'Bold', note: 'Impact, so Anton', style: { font: 'Anton', size: 128, color: '#FFFF00', outlineColor: '#000000', box: true, position: 0.8, case: 'as-is' } },
  { key: 'or-minimal', label: 'Minimal', note: 'Roboto, as in OpenReel', style: { font: 'Roboto', size: 88, color: '#FFFFFF', outlineColor: '#000000', box: false, position: 0.8, case: 'as-is' } },
  { key: 'or-top', label: 'Top', note: 'Arial, so Roboto', style: { font: 'Roboto', size: 96, color: '#FFFFFF', outlineColor: '#000000', box: true, position: 0.18, case: 'as-is' } },
  { key: 'or-centered', label: 'Centered', note: 'Arial, so Roboto', style: { font: 'Roboto', size: 96, color: '#FFFFFF', outlineColor: '#000000', box: true, position: 0.5, case: 'as-is' } }
]
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Only subtitle fields the engine knows, each inside its schema limits (engine project.schema.json). */
function cleanCaptionStyle(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const size = num(r.size)
  if (size !== null) out.size = clamp(size, 10, 300)
  const position = num(r.position)
  if (position !== null) out.position = clamp(position, 0.05, 0.95)
  const outline = num(r.outline)
  if (outline !== null) out.outline = clamp(outline, 0, 40)
  const maxWords = num(r.maxWords)
  if (maxWords !== null) out.maxWords = clamp(Math.round(maxWords), 1, 12)
  for (const k of ['color', 'outlineColor', 'emphasisColor'] as const) if (typeof r[k] === 'string' && HEX.test(r[k] as string)) out[k] = (r[k] as string).toUpperCase()
  if (typeof r.box === 'boolean') out.box = r.box
  if (typeof r.font === 'string' && (CAPTION_FONTS as readonly string[]).includes(r.font)) out.font = r.font
  if (r.case === 'upper' || r.case === 'lower' || r.case === 'as-is' || r.case === 'title') out.case = r.case
  // key words (the Upscale edit style): the chosen word in its own face and size
  if (typeof r.keyFont === 'string' && (CAPTION_FONTS as readonly string[]).includes(r.keyFont)) out.keyFont = r.keyFont
  const keyScale = num(r.keyScale)
  if (keyScale !== null) out.keyScale = clamp(keyScale, 1, 3)
  if (typeof r.keyItalic === 'boolean') out.keyItalic = r.keyItalic
  return Object.keys(out).length ? out : null
}

/** One video's look from the page, made safe to save: a filter the engine knows, auto colour on/off,
 * and the picture style. Anything else is dropped; a missing field means the engine's default. */
export function cleanVideoLook(raw: unknown): { filter?: FilterName; autoColor?: boolean; pictureStyle?: PictureStyle; pictureColor?: string } {
  if (typeof raw !== 'object' || raw === null) return {}
  const r = raw as Record<string, unknown>
  return {
    ...(isFilter(r.filter) ? { filter: r.filter } : {}),
    ...(typeof r.autoColor === 'boolean' ? { autoColor: r.autoColor } : {}),
    ...pictureFields(r)
  }
}

/** A default look from the page, made safe to save. */
export function cleanDefaultLook(raw: unknown): DefaultLook {
  if (typeof raw !== 'object' || raw === null) return NO_DEFAULT_LOOK
  const r = raw as Record<string, unknown>
  return {
    filter: isFilter(r.filter) ? r.filter : 'none',
    captionStyle: cleanCaptionStyle(r.captionStyle),
    soundEffects: r.soundEffects === true,
    autoColor: r.autoColor !== false,
    ...pictureFields(r),
    ...(isEditStyle(r.editStyle) ? { editStyle: r.editStyle } : {})
  }
}

/** A named look the person saved: a filter, a subtitle style and sound, to reuse as the default or on one video. */
export interface LookTemplate {
  id: string
  name: string
  look: DefaultLook
  /** Comes with the app: it can be used, never edited or deleted. */
  builtIn?: true
}

/**
 * Looks that come with the app, listed before the person's own. "Upscale" is the Upscale reel edit
 * (upscalecreativeclub.com/reel-edit, a free guide): near-black and soft text, 1 to 3 words, one big serif italic key
 * word per line (DM Serif Display, the shipped serif: the guide's Instrument Serif is not shipped), the pastel accent
 * #F6BDD8 on numbers, sound effects on. Its cut, motion and sound rules go to the AI editor (editStyle).
 */
export const BUILT_IN_LOOKS: LookTemplate[] = [
  {
    id: 'builtin-upscale',
    name: 'Upscale',
    builtIn: true,
    look: {
      filter: 'none',
      captionStyle: {
        font: 'Figtree SemiBold', size: 62, color: '#F5F5F4', outlineColor: '#09090A', outline: 3, box: false,
        position: 0.74, maxWords: 3, case: 'as-is', emphasisColor: '#F6BDD8',
        keyFont: 'DM Serif Display', keyScale: 1.9, keyItalic: true
      },
      soundEffects: true,
      autoColor: true,
      pictureStyle: 'rounded',
      editStyle: 'upscale'
    }
  }
]
export const isBuiltInLook = (id: unknown): boolean => BUILT_IN_LOOKS.some((t) => t.id === id)

export const MAX_TEMPLATE_NAME = 40
export const MAX_TEMPLATES = 20

export function cleanTemplate(raw: unknown): LookTemplate | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, MAX_TEMPLATE_NAME) : ''
  if (typeof r.id !== 'string' || !r.id || !name) return null
  return { id: r.id, name, look: cleanDefaultLook(r.look) }
}

/** One video with a template applied. Unlike a default for new videos, it also sets things back to none. */
export function applyTemplateToVideo<P extends Lookable>(
  p: P,
  d: DefaultLook
): P & { look: { filter: FilterName; autoColor: boolean; pictureStyle?: PictureStyle; pictureColor?: string; editStyle?: EditStyle }; soundEffects: { enabled: boolean } } {
  const captions = d.captionStyle
    ? { captions: { ...(p.captions ?? {}), style: { ...(p.captions?.style ?? {}), ...d.captionStyle, preset: 'mine' } } }
    : {}
  const look = { filter: d.filter, autoColor: d.autoColor, ...pictureFields(d as unknown as Record<string, unknown>), ...(d.editStyle ? { editStyle: d.editStyle } : {}) }
  return { ...p, ...captions, look, soundEffects: { enabled: d.soundEffects } }
}

type Lookable = { captions?: { style?: Record<string, unknown>; [k: string]: unknown }; look?: unknown; soundEffects?: unknown }

/** A project with the default look applied: the filter, the subtitle style marked as the person's own, sound effects. */
export function withDefaultLook<P extends Lookable>(
  p: P,
  d: DefaultLook
): P & { look?: { filter?: FilterName; autoColor?: true; pictureStyle?: PictureStyle; pictureColor?: string; editStyle?: EditStyle }; soundEffects?: { enabled: boolean } } {
  const filter = d.filter !== 'none' ? { filter: d.filter } : {}
  const auto = d.autoColor ? { autoColor: true as const } : {}
  const pictures = pictureFields(d as unknown as Record<string, unknown>)
  const edit = d.editStyle ? { editStyle: d.editStyle } : {}
  const fields = { ...filter, ...auto, ...pictures, ...edit }
  const look = Object.keys(fields).length ? { look: fields } : {}
  const captions = d.captionStyle
    ? { captions: { ...(p.captions ?? {}), style: { ...(p.captions?.style ?? {}), ...d.captionStyle, preset: 'mine' } } }
    : {}
  const sounds = d.soundEffects ? { soundEffects: { enabled: true } } : {}
  return { ...p, ...look, ...captions, ...sounds }
}
