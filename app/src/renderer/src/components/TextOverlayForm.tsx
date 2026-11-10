import { useState } from 'react'
import { OVERLAY_OPTIONS, TEXT_FONT_OPTIONS, TEXT_STYLE_OPTIONS, overlayParams, textCardParams } from '../../../shared/textstyles'
import { previewFont } from './Player'

interface TextOverlayFormProps {
  /** Wait for the word it goes on (the Pictures tab's word picker). */
  onPlace: (treatment: 'text-pop' | 'overlay', params: Record<string, string>) => void
  /** An overlay for the whole video. */
  onWholeVideo: (params: Record<string, string>) => void
}

/** "Add text or an overlay": OpenReel's 8 text styles in Inter or a brand font, and 4 of its overlay templates. */
export function TextOverlayForm({ onPlace, onWholeVideo }: TextOverlayFormProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [textStyle, setTextStyle] = useState<string>('heading')
  const [font, setFont] = useState<string>('Inter')
  const [template, setTemplate] = useState(OVERLAY_OPTIONS[0].key)
  const [fields, setFields] = useState<Record<string, string>>({ accent: '#F58D3D' })
  const card = textCardParams({ text, textStyle, font })
  const tpl = OVERLAY_OPTIONS.find((o) => o.key === template)!
  const overlay = overlayParams(template, fields)
  const overlayReady = !!overlay && tpl.fields.filter((f) => f !== 'accent').every((f) => overlay[f])

  if (!open) {
    return (
      <div className="row">
        <p className="muted" style={{ flex: 1 }}>Or add words on screen, or an overlay (styles from OpenReel).</p>
        <button className="btn small" onClick={() => setOpen(true)} data-testid="text-overlay-open">
          Add text or an overlay
        </button>
      </div>
    )
  }
  return (
    <div className="panel stack" style={{ padding: 14 }} data-testid="text-overlay-form">
      <h3>Words on screen</h3>
      <input className="input" placeholder="The words, like: Nobody is just a job title" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} data-testid="text-card-words" />
      <div className="row wrap" style={{ gap: 10 }}>
        <label className="look-field">
          <span>Style</span>
          <select className="input" value={textStyle} onChange={(e) => setTextStyle(e.target.value)} data-testid="text-card-style">
            {TEXT_STYLE_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="look-field">
          <span>Font</span>
          <select className="input" value={font} onChange={(e) => setFont(e.target.value)} style={previewFont(font)} data-testid="text-card-font">
            {TEXT_FONT_OPTIONS.map((f) => (
              <option key={f} value={f} style={previewFont(f)}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <button className="btn small primary" disabled={!card} onClick={() => card && onPlace('text-pop', card)} data-testid="text-card-place">
          Pick its word
        </button>
      </div>

      <h3>Overlay</h3>
      <div className="row wrap" style={{ gap: 10 }}>
        <label className="look-field">
          <span>Template</span>
          <select className="input" value={template} onChange={(e) => setTemplate(e.target.value)} data-testid="overlay-template">
            {OVERLAY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {tpl.fields.includes('text') && (
          <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder={template === 'hashtag-strip' ? '#acme #buildinpublic' : 'Day 1 of 30'} value={fields.text ?? ''} maxLength={120} onChange={(e) => setFields({ ...fields, text: e.target.value })} data-testid="overlay-text" />
        )}
        {tpl.fields.includes('name') && (
          <input className="input" placeholder="Name" value={fields.name ?? ''} maxLength={120} onChange={(e) => setFields({ ...fields, name: e.target.value })} data-testid="overlay-name" />
        )}
        {tpl.fields.includes('role') && (
          <input className="input" placeholder="Role, like Host, Acme Studio" value={fields.role ?? ''} maxLength={120} onChange={(e) => setFields({ ...fields, role: e.target.value })} data-testid="overlay-role" />
        )}
        {tpl.fields.includes('accent') && (
          <label className="look-field">
            <span>Accent</span>
            <input type="color" value={fields.accent ?? '#F58D3D'} onChange={(e) => setFields({ ...fields, accent: e.target.value })} data-testid="overlay-accent" />
          </label>
        )}
      </div>
      <p className="muted-sm">{tpl.hint}.</p>
      <div className="row">
        <button className="btn small primary" disabled={!overlayReady} onClick={() => overlay && onWholeVideo(overlay)} data-testid="overlay-whole">
          Whole video
        </button>
        <button className="btn small" disabled={!overlayReady} onClick={() => overlay && onPlace('overlay', overlay)} data-testid="overlay-place">
          Pick a word
        </button>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </div>
  )
}
