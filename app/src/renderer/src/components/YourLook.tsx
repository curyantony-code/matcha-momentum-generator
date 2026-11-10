import { HouseLookRow } from './HouseLookRow'
import { useCallback, useEffect, useState } from 'react'
import { CAPTION_FONTS, type DefaultLook, type LookTemplate } from '../../../shared/looks'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'
import { CaptionPresets, FilterPicker, Swatches, lookKey, LOOKS, type CapStyle } from './LookControls'
import { PicturePicker } from './PicturePicker'

const SAMPLE = 'This is your look'
const DEFAULT_STYLE: CapStyle = { size: 105, position: 0.75, color: '#FFFFFF', outlineColor: '#000000', box: false, case: 'upper', maxWords: 3 }
const CASES = [
  { key: 'as-is', label: 'As said' },
  { key: 'upper', label: 'ALL CAPS' },
  { key: 'lower', label: 'all lower' }
]

/** Colours, type and templates for every new video. Each change is saved at once. */
export function YourLook() {
  const notify = useNotify()
  const [look, setLook] = useState<DefaultLook | null>(null)
  const [templates, setTemplates] = useState<LookTemplate[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const loadTemplates = useCallback(() => reel.look.templates().then(setTemplates).catch(() => {}), [])
  useEffect(() => {
    reel.look.default().then(setLook).catch(() => {})
    void loadTemplates()
  }, [loadTemplates])
  if (!look) return null

  const save = (next: DefaultLook) => {
    setLook(next)
    reel.look
      .setDefault(next)
      .then(setLook)
      .catch((e) => notify(userMessage(e), 'error'))
  }
  const style: CapStyle = { ...DEFAULT_STYLE, ...(look.captionStyle ?? {}) }
  const setStyle = (extra: CapStyle) => save({ ...look, captionStyle: { ...style, ...extra } })
  const own = !!look.captionStyle

  const saveTemplate = async () => {
    try {
      const t = await reel.look.saveTemplate({ name, look })
      setName('')
      await loadTemplates()
      notify(`Saved "${t.name}".`)
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }
  const useTemplate = async (t: LookTemplate) => {
    try {
      setLook(await reel.look.useTemplate(t.id))
      notify(`New videos now start with "${t.name}".`)
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }
  const applyAll = async () => {
    setBusy(true)
    try {
      const r = await reel.look.applyAll()
      const skipped = r.skipped.length ? ` Skipped ${r.skipped.length} I was still working on.` : ''
      notify(`Updated ${r.updated} ${r.updated === 1 ? 'video' : 'videos'}. Each one uses it from its next version.${skipped}`)
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel stack" data-testid="your-look">
      <div>
        <h2>Your look</h2>
        <p className="muted-sm">Every new video starts with this. Change any one video in "Edit it myself".</p>
      </div>

      <h3>Colour filter</h3>
      <label className="check-row">
        <input type="checkbox" checked={look.autoColor} onChange={(e) => save({ ...look, autoColor: e.target.checked })} data-testid="default-auto-color" />
        Auto colour: fix each take's brightness and white balance so your takes match (before the filter)
      </label>
      {look.autoColor && <HouseLookRow />}
      <FilterPicker value={look.filter} sample={null} onPick={(f) => save({ ...look, filter: f })} testid="default-filter" />

      <h3>Pictures</h3>
      <PicturePicker
        value={look.pictureStyle ?? 'as-is'}
        colour={look.pictureColor}
        onPick={(s) => save({ ...look, pictureStyle: s })}
        onColour={(c) => save({ ...look, pictureColor: c })}
        testid="default-picture-style"
      />

      <h3>Subtitles</h3>
      <label className="check-row">
        <input type="checkbox" checked={own} onChange={(e) => save({ ...look, captionStyle: e.target.checked ? { ...DEFAULT_STYLE } : null })} data-testid="default-subs-mine" />
        Use my own subtitle style (off: the editor picks)
      </label>
      {own && (
        <div className="look-grid" data-testid="default-caption-controls">
          <Swatches value={lookKey(style)} style={style} text={SAMPLE} onPick={(k) => setStyle(LOOKS.find((x) => x.key === k)!.style)} />
          <CaptionPresets style={style} text={SAMPLE} onPick={(s) => setStyle(s)} />
          <label className="look-field">
            <span>Text colour</span>
            <input type="color" value={String(style.color)} onChange={(e) => setStyle({ color: e.target.value })} data-testid="cap-color" />
          </label>
          <label className="look-field">
            <span>{style.box ? 'Box colour' : 'Outline colour'}</span>
            <input type="color" value={String(style.outlineColor)} onChange={(e) => setStyle({ outlineColor: e.target.value })} data-testid="cap-outline-color" />
          </label>
          <label className="look-field">
            <span>Box behind the words</span>
            <input type="checkbox" checked={!!style.box} onChange={(e) => setStyle({ box: e.target.checked })} data-testid="cap-box" />
          </label>
          <label className="look-field">
            <span>Font</span>
            <select className="input" value={String(style.font ?? CAPTION_FONTS[0])} onChange={(e) => setStyle({ font: e.target.value })} data-testid="cap-font">
              {CAPTION_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="look-field">
            <span>Size: {Math.round(Number(style.size))}</span>
            <input type="range" min={70} max={140} step={2} value={Number(style.size)} onChange={(e) => setStyle({ size: Number(e.target.value) })} data-testid="cap-size-range" />
          </label>
          <label className="look-field">
            <span>Height on screen</span>
            <input
              type="range"
              min={0.55}
              max={0.85}
              step={0.01}
              value={Number(style.position)}
              onChange={(e) => setStyle({ position: Number(e.target.value) })}
              aria-valuetext={Number(style.position) < 0.69 ? 'higher' : 'lower'}
              data-testid="cap-position-range"
            />
          </label>
          <label className="look-field">
            <span>Letters</span>
            <select className="input" value={String(style.case)} onChange={(e) => setStyle({ case: e.target.value })} data-testid="cap-case">
              {CASES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="look-field">
            <span>Words at a time</span>
            <select className="input" value={String(style.maxWords)} onChange={(e) => setStyle({ maxWords: Number(e.target.value) })} data-testid="cap-words">
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <h3>Sound</h3>
      <label className="check-row">
        <input type="checkbox" checked={look.soundEffects} onChange={(e) => save({ ...look, soundEffects: e.target.checked })} data-testid="default-sound-effects" />
        Sound effects: a pop on text cards, a swish on animations, a tap on pictures
      </label>

      <h3>Templates</h3>
      <p className="muted-sm">Save this look under a name to switch back to it, or to use on one video.</p>
      {templates.length > 0 && (
        <ul className="saved-list" data-testid="look-templates">
          {templates.map((t) => (
            <li key={t.id}>
              <span>
                {t.name}
                {t.builtIn && <span className="muted-sm"> · comes with the app</span>}
              </span>
              <span className="row" style={{ gap: 6 }}>
                <button className="btn small" onClick={() => void useTemplate(t)} data-testid={`template-use-${t.name}`}>
                  Use for new videos
                </button>
                {!t.builtIn && (
                  <button
                    className="btn small ghost"
                    aria-label={`Delete template ${t.name}`}
                    onClick={() => void reel.look.removeTemplate(t.id).then(loadTemplates).catch((e) => notify(userMessage(e), 'error'))}
                  >
                    Delete
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <input className="input" placeholder="Template name, like Raw day" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-testid="template-name" />
        <button className="btn" onClick={() => void saveTemplate()} disabled={!name.trim()} data-testid="template-save">
          Save as template
        </button>
      </div>

      <div>
        <button className="btn" onClick={() => void applyAll()} disabled={busy} data-testid="look-apply-all">
          Use on all my videos
        </button>
      </div>
    </section>
  )
}
