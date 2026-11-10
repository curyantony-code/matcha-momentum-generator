import type { CSSProperties } from 'react'
import { PICTURE_STYLES, type PictureStyle } from '../../../shared/looks'

const DEFAULT_COLOUR: Record<PictureStyle, string> = { 'as-is': '#FFFFFF', rounded: '#FFFFFF', notebook: '#F6F3F8', outline: '#FFFFFF' }

/** A small card drawn the way the engine draws it (picstyle.py), on a dark tile so borders show. */
function cardLook(style: PictureStyle, colour: string): CSSProperties {
  const base: CSSProperties = {
    width: 58,
    height: 40,
    background: 'linear-gradient(135deg, #8A6A9E, #C49AD8 55%, #F3EADB)',
    boxSizing: 'border-box'
  }
  switch (style) {
    case 'rounded':
      return { ...base, borderRadius: 9, boxShadow: '0 4px 10px rgba(0,0,0,.45)' }
    case 'notebook':
      return { ...base, borderRadius: 1, border: `4px solid ${colour}`, transform: 'rotate(-3deg)', boxShadow: '0 4px 10px rgba(0,0,0,.45)' }
    case 'outline':
      return { ...base, borderRadius: 4, border: `2px solid ${colour}` }
    default:
      return { ...base, borderRadius: 5, transform: 'rotate(-2.5deg)', boxShadow: '0 4px 10px rgba(0,0,0,.45)' }
  }
}

interface PicturePickerProps {
  value: PictureStyle
  colour: string | undefined
  onPick: (style: PictureStyle) => void
  onColour: (colour: string) => void
  testid?: string
}

/** One style for every picture card: tiles, plus a border colour for the styles that have a border. */
export function PicturePicker({ value, colour, onPick, onColour, testid = 'picture-style' }: PicturePickerProps) {
  const chosen = PICTURE_STYLES.find((s) => s.key === value) ?? PICTURE_STYLES[0]
  const shown = colour ?? DEFAULT_COLOUR[value]
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row wrap" style={{ gap: 10 }} role="radiogroup" aria-label="Picture style" data-testid={testid}>
        {PICTURE_STYLES.map((s) => (
          <button
            key={s.key}
            role="radio"
            aria-checked={s.key === value}
            className={`chip${s.key === value ? ' active' : ''}`}
            style={{ height: 'auto', padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, borderRadius: 12 }}
            onClick={() => onPick(s.key)}
            data-testid={`${testid}-${s.key}`}
          >
            <span style={{ width: 84, height: 60, borderRadius: 8, background: '#1E1524', display: 'grid', placeItems: 'center' }}>
              <span style={cardLook(s.key, colour ?? DEFAULT_COLOUR[s.key])} />
            </span>
            {s.label}
          </button>
        ))}
      </div>
      <p className="muted-sm">{chosen.hint}. Every picture card uses it; full-screen pictures and phones stay as they are.</p>
      {chosen.colour && (
        <label className="look-field" style={{ maxWidth: 220 }}>
          <span>Border colour</span>
          <input type="color" value={shown} onChange={(e) => onColour(e.target.value)} data-testid={`${testid}-colour`} />
        </label>
      )}
    </div>
  )
}
