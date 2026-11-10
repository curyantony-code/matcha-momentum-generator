import type { FilterName } from '../../../shared/looks'
import { FILTER_GROUPS, FILTERS, OPENREEL_CAPTION_LOOKS } from '../../../shared/looks'
import { SubtitleSample, lookFromStyle, type SubtitleLook } from './Player'

// Caption controls in plain words. Defaults = the proven look (engine DEFAULT_CAPTION_STYLE):
// 105 px, line centre at 0.75 of the height (just under the chin), white with a solid black outline.
export type CapStyle = Record<string, unknown>
export const SIZES = [
  { key: 'small', label: 'Small', size: 84 },
  { key: 'medium', label: 'Medium', size: 105 },
  { key: 'big', label: 'Big', size: 126 }
]
export const POSITIONS = [
  { key: 'higher', label: 'Higher', position: 0.66 },
  { key: 'lower', label: 'Lower', position: 0.75 }
]
export const LOOKS: { key: string; label: string; style: CapStyle }[] = [
  { key: 'white', label: 'Plain', style: { color: '#FFFFFF', outlineColor: '#000000', box: false } },
  { key: 'yellow', label: 'Yellow', style: { color: '#FFD60A', outlineColor: '#000000', box: false } },
  { key: 'box', label: 'Black box', style: { color: '#FFFFFF', outlineColor: '#000000', box: true } }
]
export function sizeKey(st: CapStyle): string {
  const n = Number(st.size ?? 105)
  return n < 95 ? 'small' : n > 115 ? 'big' : 'medium'
}
export function positionKey(st: CapStyle): string {
  return Number(st.position ?? 0.75) < 0.69 ? 'higher' : 'lower'
}
export function lookKey(st: CapStyle): string {
  if (st.box) return 'box'
  return String(st.color ?? '#FFFFFF').toUpperCase() === '#FFFFFF' ? 'white' : 'yellow'
}

export function Seg({ value, options, onPick, testid }: { value: string; options: { key: string; label: string }[]; onPick: (k: string) => void; testid: string }) {
  return (
    <div className="seg" role="radiogroup" data-testid={testid}>
      {options.map((o) => (
        <button key={o.key} role="radio" aria-checked={o.key === value} className={o.key === value ? 'on' : ''} onClick={() => onPick(o.key)} data-testid={`${testid}-${o.key}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Style swatches: a tiny phone frame with a sample line in each look (delight 3). */
/** OpenReel's 7 caption looks: one click sets the font, size, colours, box and height together. */
export function CaptionPresets({ style, text, onPick }: { style: CapStyle; text: string; onPick: (s: CapStyle) => void }) {
  const current = OPENREEL_CAPTION_LOOKS.find((o) => Object.entries(o.style).every(([k, v]) => style[k as keyof CapStyle] === v))
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="muted-sm">Caption looks from OpenReel</span>
      <div className="swatches" role="radiogroup" aria-label="Caption looks from OpenReel" data-testid="cap-openreel">
        {OPENREEL_CAPTION_LOOKS.map((o) => {
          const look: SubtitleLook = { ...lookFromStyle({ ...style, ...o.style }), position: 0.5 }
          const on = current?.key === o.key
          return (
            <button
              key={o.key}
              role="radio"
              aria-checked={on}
              title={`OpenReel’s ${o.label} caption (${o.note})`}
              className={`swatch${on ? ' on' : ''}`}
              onClick={() => onPick({ ...style, ...o.style })}
              data-testid={`cap-openreel-${o.key}`}
            >
              <span className="swatch-label">{o.label}</span>
              <span className="swatch-frame">
                <SubtitleSample look={{ ...look, size: Math.min(look.size, 105) }} text={text} width={92} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Swatches({ value, style, text, onPick }: { value: string; style: CapStyle; text: string; onPick: (k: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Subtitle style" data-testid="cap-look">
      {LOOKS.map((o) => {
        const look: SubtitleLook = { ...lookFromStyle({ ...style, ...o.style }), position: 0.5 }
        return (
          <button
            key={o.key}
            role="radio"
            aria-checked={o.key === value}
            className={`swatch${o.key === value ? ' on' : ''}`}
            onClick={() => onPick(o.key)}
            data-testid={`cap-look-${o.key}`}
          >
            {/* the name first: under the picture it fell below the drawer's footer (grandma3 #15) */}
            <span className="swatch-label">{o.label}</span>
            <span className="swatch-frame">
              <SubtitleSample look={{ ...look, size: Math.min(look.size, 105) }} text={text} width={92} />
            </span>
          </button>
        )
      })}
    </div>
  )
}


/** Colour filters as tiles. The tile is a close CSS stand-in; the video itself uses the engine's filter. */
export function FilterPicker({ value, onPick, sample, testid = 'filter' }: { value: FilterName; onPick: (f: FilterName) => void; sample: string | null; testid?: string }) {
  return (
    <div className="stack" style={{ gap: 14 }} role="radiogroup" aria-label="Colour filter" data-testid={testid}>
      {FILTER_GROUPS.map((group) => (
        <div key={group} className="stack" style={{ gap: 6 }}>
          <span className="muted-sm">{group === 'Basics' ? 'Basics' : `${group} (from OpenReel)`}</span>
          <div className="filter-grid">
            {FILTERS.filter((f) => f.group === group).map((f) => (
              <button
                key={f.key}
                role="radio"
                aria-checked={f.key === value}
                title={f.hint}
                className={`filter-tile${f.key === value ? ' on' : ''}`}
                onClick={() => onPick(f.key)}
                data-testid={`${testid}-${f.key}`}
              >
                <span className="filter-sample" style={{ filter: f.css, ...(sample ? { backgroundImage: `url("${sample}")` } : {}) }} />
                <span className="swatch-label">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
