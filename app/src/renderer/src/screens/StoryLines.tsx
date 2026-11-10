import { useState } from 'react'
import type { Scene, SceneParams, SceneType, StoryAssets, StoryLine, Transition, World } from '../../../shared/story'
import { SCENE_TYPES, TRANSITIONS, WORLDS } from '../../../shared/story'

const TYPE_LABELS: Record<SceneType, string> = {
  line: 'Words',
  title: 'Title card',
  stat: 'Number',
  highlight: 'Highlight',
  list: 'List',
  logo: 'Logo',
  art: 'Illustration',
  photo: 'Photo'
}
const WORLD_LABELS: Record<World, string> = { paper: 'Paper', ink: 'Ink', clay: 'Clay', grey: 'Grey', black: 'Black', brand: 'Brand' }
const TRANSITION_LABELS: Record<Transition, string> = { cut: 'Cut', flash: 'Flash', zoom: 'Zoom', whip: 'Whip', wipe: 'Wipe', iris: 'Iris' }
const MAX_ITEMS = 5

const strip = (w: string): string => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const wordsOf = (s: string): string[] => s.split(/\s+/).filter(Boolean)
const artLabel = (n: string): string => n.replace(/^\d+-|-dark|\.\w+$/g, '').replace(/-/g, ' ')

/** The 0-based word range of `phrase` in `shown`, or null. */
function phraseRange(shown: string, phrase: string): [number, number] | null {
  const ws = wordsOf(shown).map(strip)
  const ps = wordsOf(phrase).map(strip)
  if (!ps.length) return null
  for (let i = 0; i + ps.length <= ws.length; i++) if (ps.every((p, k) => ws[i + k]!.toLowerCase() === p.toLowerCase())) return [i, i + ps.length - 1]
  return null
}

interface ParamsProps {
  line: StoryLine
  assets: StoryAssets
  onParams: (patch: Partial<SceneParams>) => void
}

function HeroPicker({ line, onParams }: ParamsProps) {
  const words = Array.from(new Set(wordsOf(line.shown).map(strip).filter(Boolean)))
  const hero = line.scene.params.hero ?? ''
  if (!words.length) return null
  return (
    <div className="stack carousel-field">
      <span className="field-label" id="hero-label">Big word (one per line)</span>
      <div className="row wrap" role="group" aria-labelledby="hero-label">
        {words.map((w) => (
          <button key={w} className={`chip small${hero.toLowerCase() === w.toLowerCase() ? ' active' : ''}`} aria-pressed={hero.toLowerCase() === w.toLowerCase()} onClick={() => onParams({ hero: hero.toLowerCase() === w.toLowerCase() ? '' : w })}>
            {w}
          </button>
        ))}
      </div>
    </div>
  )
}

function PhrasePicker({ line, onParams }: ParamsProps) {
  const tokens = wordsOf(line.shown)
  const range = phraseRange(line.shown, line.scene.params.phrase ?? '')
  const pick = (i: number): void => {
    if (range && range[0] === range[1] && range[0] === i) return onParams({ phrase: '' })
    // A second word after a single one stretches the phrase between them; otherwise it starts a new one.
    const [a, b] = range && range[0] === range[1] && range[0] !== i ? [Math.min(range[0], i), Math.max(range[0], i)] : [i, i]
    onParams({ phrase: strip(tokens.slice(a, b + 1).join(' ')) })
  }
  if (!tokens.length) return null
  return (
    <div className="stack carousel-field">
      <span className="field-label" id="phrase-label">Highlighted words: pick the first word, then the last</span>
      <div className="row wrap" role="group" aria-labelledby="phrase-label">
        {tokens.map((w, i) => {
          const on = !!range && i >= range[0] && i <= range[1]
          return (
            <button key={`${i}-${w}`} className={`chip small${on ? ' active' : ''}`} aria-pressed={on} onClick={() => pick(i)}>
              {w}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ItemsEditor({ line, onParams }: ParamsProps) {
  const items = line.scene.params.items ?? []
  const set = (next: string[]): void => onParams({ items: next })
  return (
    <div className="stack carousel-field">
      <span className="field-label">Items (2 to {MAX_ITEMS}, short)</span>
      {items.map((it, i) => (
        <div className="row" key={i}>
          <input className="input story-grow" aria-label={`Item ${i + 1}`} value={it} onChange={(e) => set(items.map((x, k) => (k === i ? e.target.value : x)))} />
          <button className="btn small ghost danger" aria-label={`Remove item ${i + 1}`} onClick={() => set(items.filter((_, k) => k !== i))}>Remove</button>
        </div>
      ))}
      <div className="row">
        <button className="btn small" onClick={() => set([...items, ''])} disabled={items.length >= MAX_ITEMS}>Add item</button>
      </div>
    </div>
  )
}

function ImagePicker({ line, assets, onParams }: ParamsProps) {
  const image = line.scene.params.image ?? null
  const names = Object.keys(assets.images)
  const isLogo = line.scene.type === 'logo'
  const [path, setPath] = useState(image && !names.includes(image) ? image : '')
  return (
    <div className="stack carousel-field">
      <span className="field-label" id="image-label">{isLogo ? 'Logo (the brand’s, or a Library image)' : 'Photo (from the Library)'}</span>
      <div className="carousel-art" role="group" aria-labelledby="image-label">
        <button className={`carousel-art-none${image === null ? ' active' : ''}`} aria-pressed={image === null} onClick={() => onParams({ image: null })}>
          {isLogo ? 'Brand logo' : 'None'}
        </button>
        {names.map((n) => (
          <button key={n} className={image === n ? 'active' : ''} aria-pressed={image === n} aria-label={n} onClick={() => onParams({ image: n })}>
            <img src={assets.images[n]} alt="" />
          </button>
        ))}
      </div>
      <label className="stack carousel-field">
        <span className="field-label">Another Library image</span>
        <input
          className="input"
          placeholder="Images/photo.jpg"
          value={path}
          onChange={(e) => {
            setPath(e.target.value)
            onParams({ image: e.target.value.trim() || null })
          }}
          data-testid="story-image-path"
        />
      </label>
      <p className="muted-sm">A path inside your Library, like Images/photo.jpg (JPG or PNG, under 8 MB). The picture shows once the story has saved.</p>
    </div>
  )
}

function ArtPicker({ line, assets, onParams }: ParamsProps) {
  const art = line.scene.params.art ?? null
  const names = Object.keys(assets.art)
  if (!names.length) return <p className="muted-sm">This brand has no illustrations in its kit.</p>
  return (
    <div className="stack carousel-field">
      <span className="field-label" id="story-art-label">Illustration</span>
      <div className="carousel-art" role="group" aria-labelledby="story-art-label">
        <button className={`carousel-art-none${art === null ? ' active' : ''}`} aria-pressed={art === null} onClick={() => onParams({ art: null })}>None</button>
        {names.map((n) => (
          <button key={n} className={art === n ? 'active' : ''} aria-pressed={art === n} aria-label={artLabel(n)} onClick={() => onParams({ art: n })}>
            <img src={assets.art[n]} alt="" />
          </button>
        ))}
      </div>
    </div>
  )
}

function SceneParamsForm(p: ParamsProps) {
  const { line, onParams } = p
  const params = line.scene.params
  switch (line.scene.type) {
    case 'line':
      return <HeroPicker {...p} />
    case 'title':
      return (
        <>
          <label className="stack carousel-field">
            <span className="field-label">Small line above (optional)</span>
            <input className="input" value={params.kicker ?? ''} onChange={(e) => onParams({ kicker: e.target.value })} />
          </label>
          <HeroPicker {...p} />
        </>
      )
    case 'stat':
      return (
        <div className="row wrap story-stat">
          <label className="stack carousel-field">
            <span className="field-label">Number as shown</span>
            <input className="input" placeholder="27%" value={params.value ?? ''} onChange={(e) => onParams({ value: e.target.value })} data-testid="story-stat-value" />
          </label>
          <label className="stack carousel-field story-grow">
            <span className="field-label">What it measures</span>
            <input className="input" placeholder="of CVs are never opened" value={params.label ?? ''} onChange={(e) => onParams({ label: e.target.value })} />
          </label>
        </div>
      )
    case 'highlight':
      return <PhrasePicker {...p} />
    case 'list':
      return <ItemsEditor {...p} />
    case 'logo':
    case 'photo':
      return (
        <>
          <ImagePicker {...p} />
          {line.scene.type === 'photo' && <HeroPicker {...p} />}
        </>
      )
    case 'art':
      return (
        <>
          <ArtPicker {...p} />
          <HeroPicker {...p} />
        </>
      )
  }
}

interface LineFormProps {
  index: number
  line: StoryLine
  assets: StoryAssets
  onLine: (patch: Partial<StoryLine>) => void
  onScene: (patch: Partial<Scene>) => void
  onParams: (patch: Partial<SceneParams>) => void
}

function LineForm({ index, line, assets, onLine, onScene, onParams }: LineFormProps) {
  const n = index + 1
  return (
    <div className="stack story-line-form" data-testid="story-line-form">
      <label className="stack carousel-field">
        <span className="field-label">Shown and said</span>
        <textarea className="textarea carousel-headline" rows={2} value={line.shown} onChange={(e) => onLine({ shown: e.target.value.replace(/\n/g, ' ') })} data-testid="story-shown" />
      </label>
      <details className="story-said" open={!!line.spoken}>
        <summary>How it’s said</summary>
        <label className="stack carousel-field">
          <span className="field-label">Spoken version (optional): write numbers and names the way you say them</span>
          <input className="input" placeholder="twenty twenty-one" value={line.spoken} onChange={(e) => onLine({ spoken: e.target.value })} aria-label={`How line ${n} is said`} />
        </label>
      </details>
      <div className="story-scene-type">
        <span className="field-label" id={`type-${index}`}>Scene</span>
        <div className="seg story-seg" role="group" aria-labelledby={`type-${index}`}>
          {SCENE_TYPES.map((t) => (
            <button key={t} className={`tab${line.scene.type === t ? ' active' : ''}`} aria-pressed={line.scene.type === t} onClick={() => onScene({ type: t })} data-testid={`story-type-${t}`}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="row wrap">
        <label className="row">
          <span className="field-label">World</span>
          <select className="input story-select" value={line.scene.world} onChange={(e) => onScene({ world: e.target.value as World })} data-testid="story-world">
            {WORLDS.map((w) => <option key={w} value={w}>{WORLD_LABELS[w]}</option>)}
          </select>
        </label>
        <label className="row">
          <span className="field-label">Arrives with</span>
          <select className="input story-select" value={line.scene.transition} onChange={(e) => onScene({ transition: e.target.value as Transition })} disabled={index === 0} data-testid="story-transition">
            {TRANSITIONS.map((t) => <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>)}
          </select>
        </label>
      </div>
      <SceneParamsForm line={line} assets={assets} onParams={onParams} />
    </div>
  )
}

export interface StoryLinesProps {
  lines: StoryLine[]
  sel: number
  assets: StoryAssets
  maxLines: number
  onSelect: (i: number) => void
  onLine: (i: number, patch: Partial<StoryLine>) => void
  onScene: (i: number, patch: Partial<Scene>) => void
  onParams: (i: number, patch: Partial<SceneParams>) => void
  onAdd: () => void
  onRemove: (i: number) => void
  onMove: (i: number, to: number) => void
}

/** The lines: a list (one row each), the chosen one open below it with its scene and that scene's settings. */
export function StoryLines(p: StoryLinesProps) {
  const line = p.lines[p.sel] ?? p.lines[0]
  return (
    <section className="panel stack" aria-label="Lines" data-testid="story-lines">
      <div className="row">
        <h2>Lines</h2>
        <span className="spacer" />
        <button className="btn small" onClick={p.onAdd} disabled={p.lines.length >= p.maxLines} data-testid="story-add-line">Add line</button>
      </div>
      <ol className="story-line-list">
        {p.lines.map((l, i) => (
          <li key={i}>
            <button className={`story-line-row${i === p.sel ? ' active' : ''}`} aria-current={i === p.sel ? 'true' : undefined} onClick={() => p.onSelect(i)} data-testid={`story-line-${i + 1}`}>
              <span className="story-line-n">{i + 1}</span>
              <span className="story-line-text">{l.shown || 'Empty line'}</span>
              <span className="story-line-type">{TYPE_LABELS[l.scene.type]}</span>
            </button>
          </li>
        ))}
      </ol>
      {line && (
        <>
          <div className="row wrap">
            <h2>Line {p.sel + 1}</h2>
            <span className="spacer" />
            <button className="btn small ghost" onClick={() => p.onMove(p.sel, p.sel - 1)} disabled={p.sel === 0}>↑ Up</button>
            <button className="btn small ghost" onClick={() => p.onMove(p.sel, p.sel + 1)} disabled={p.sel >= p.lines.length - 1}>↓ Down</button>
            <button className="btn small ghost danger" onClick={() => p.onRemove(p.sel)} disabled={p.lines.length <= 1}>Remove</button>
          </div>
          <LineForm
            key={p.sel}
            index={p.sel}
            line={line}
            assets={p.assets}
            onLine={(patch) => p.onLine(p.sel, patch)}
            onScene={(patch) => p.onScene(p.sel, patch)}
            onParams={(patch) => p.onParams(p.sel, patch)}
          />
        </>
      )}
    </section>
  )
}
