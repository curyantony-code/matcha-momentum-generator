import { CLIMB, THEMES, THEME_HINT, isTheme, type Level, type Theme } from '../../../shared/life'
import { useEffect, useState } from 'react'
import type { SavedScript } from '../../../shared/api'
import { DEFAULT_WPM, formatLength, readSeconds } from '../../../shared/teleprompter'
import { formatOf, formatOption, viralityChecks } from '../../../shared/formats'
import { BuiltWith } from './BuiltWith'

/** Puts a new opening in place of the old one: the hook, and the script's first line when it was that hook. */
export function swapHook(script: string, oldHook: string, newHook: string): string {
  const [first, ...rest] = script.split('\n')
  return first.trim() === oldHook.trim() ? [newHook, ...rest].join('\n') : [newHook, script].join('\n')
}

interface Props {
  script: SavedScript
  onSave: (patch: { hook: string; script: string }) => Promise<void>
  /** Changes its L.I.F.E. theme or level (saved straight away). */
  onTag: (patch: { theme?: Theme; level?: Level }) => void
  onCopy: (text: string) => void
  onPrompter: () => void
  onFilmed: () => void
  /** Opens the Content engine (every skill, what it does). */
  onOpenEngine?: () => void
}

/** One saved script, editable. The person's rewrite is the version that counts. */
export function ScriptEditor({ script, onSave, onTag, onCopy, onPrompter, onFilmed, onOpenEngine }: Props) {
  const [hook, setHook] = useState(script.hook)
  const [body, setBody] = useState(script.script)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setHook(script.hook)
    setBody(script.script)
  }, [script.id, script.hook, script.script])

  const dirty = hook !== script.hook || body !== script.script
  const seconds = readSeconds(body, DEFAULT_WPM)
  // Every opening stays one click away, the original included, except the one in use.
  const openings = [{ text: script.hook, formula: script.hookFormula ?? '' }, ...(script.hooks ?? [])]
  const unique = openings.filter((o, i) => o.text && openings.findIndex((x) => x.text === o.text) === i)
  const formula = unique.find((o) => o.text === hook)?.formula ?? ''
  const others = unique.filter((o) => o.text !== hook)
  const videoFormat = formatOf(script.videoFormat)
  // Re-counted on every keystroke, so a rewrite is checked too.
  const checks = viralityChecks({ hook, script: body, onScreenText: script.onScreenText, seconds }, videoFormat)
  const passed = checks.filter((c) => c.ok).length
  const save = async () => {
    setSaving(true)
    try {
      await onSave({ hook, script: body })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel stack" data-testid="script-editor">
      <div className="row">
        <h2>Your script</h2>
        <span className="spacer" />
        <span className="muted-sm" data-testid="script-length">
          About {formatLength(seconds)} at {DEFAULT_WPM} words a minute
        </span>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }} data-testid="script-life">
        <span className="field-label">L.I.F.E.</span>
        <select
          className="input"
          style={{ width: 'auto' }}
          aria-label="Theme"
          value={script.theme ?? ''}
          onChange={(e) => isTheme(e.target.value) && onTag({ theme: e.target.value })}
          data-testid="script-theme"
        >
          {!script.theme && <option value="">Pick a theme</option>}
          {THEMES.map((t) => (
            <option key={t} value={t}>
              {t} ({THEME_HINT[t]})
            </option>
          ))}
        </select>
        <span className="muted-sm" data-testid="script-climb">
          climbs {CLIMB.join(' → ')}
        </span>
      </div>
      <label className="field-label" htmlFor="script-hook">
        Hook{formula ? <span className="muted-sm"> · {formula}</span> : null}
      </label>
      <input id="script-hook" className="input" value={hook} onChange={(e) => setHook(e.target.value)} />
      {others.length > 0 && !!script.hooks?.length && (
        <div className="hook-options" data-testid="other-hooks">
          <span className="muted-sm">Other openings:</span>
          {others.map((h) => (
            <button
              key={h.text}
              className="hook-option"
              onClick={() => {
                setBody((b) => swapHook(b, hook, h.text))
                setHook(h.text)
              }}
            >
              <span>{h.text}</span>
              <span className="muted-sm">
                {h.formula ? `${h.formula} · ` : ''}
                {h.text.split(/\s+/).filter(Boolean).length} words
              </span>
            </button>
          ))}
        </div>
      )}
      <label className="field-label" htmlFor="script-body">
        What to say (rewrite it in your words)
      </label>
      <textarea id="script-body" className="textarea script-body" value={body} onChange={(e) => setBody(e.target.value)} />
      {script.onScreenText.length > 0 && (
        <p className="muted-sm" data-testid="on-screen-text">
          On screen: {script.onScreenText.join(' · ')}
        </p>
      )}
      {script.firstFrame && (
        <p className="muted-sm" data-testid="script-first-frame">
          First second on screen: {script.firstFrame}
        </p>
      )}
      {(script.slop?.length ?? 0) > 0 && (
        <p className="muted-sm" data-testid="script-slop">
          Still sounds written, not said: {script.slop!.map((s) => `“${s}”`).join(', ')}. Say those lines your way.
        </p>
      )}
      {(script.cards?.length ?? 0) > 0 && (
        <div className="stack" style={{ gap: 4 }} data-testid="script-cards">
          <span className="field-label">Motion cards the edit will add</span>
          <ul className="check-list">
            {script.cards!.map((c) => (
              <li key={`${c.line}-${c.card}`}>
                Line {c.line} · {CARD_NAMES[c.card] ?? c.card}
                {c.text ? `: ${c.text}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <RankedPicks ranked={script.ranked} />
      <BuiltWith script={script} onOpenEngine={onOpenEngine} />
      <div className="stack" style={{ gap: 4 }} data-testid="virality-checks">
        <span className="field-label">
          Made to travel as a {formatOption(videoFormat).label.toLowerCase()} video: {passed} of {checks.length}
        </span>
        {script.concept && (
          <span className="muted-sm" data-testid="script-concept">
            Built on what works in your niche: {script.concept}
          </span>
        )}
        <ul className="check-list">
          {checks.map((c) => (
            <li key={c.key} className={c.ok ? 'ok' : 'miss'} data-testid={`check-${c.key}`} data-ok={c.ok}>
              <span aria-hidden="true">{c.ok ? '✓' : '○'}</span> {c.label}
              {!c.ok && <span className="muted-sm"> · {c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => void save()} disabled={!dirty || saving} data-testid="save-script">
          {dirty ? 'Save my changes' : 'Saved'}
        </button>
        <button className="btn" onClick={() => onCopy(body)}>
          Copy
        </button>
        <span className="spacer" />
        <button className="btn" onClick={onPrompter} disabled={dirty} title={dirty ? 'Save your changes first' : undefined} data-testid="open-prompter">
          Read it on the teleprompter
        </button>
        <button className="btn" onClick={onFilmed} data-testid="filmed-it">
          I filmed it
        </button>
      </div>
    </section>
  )
}

/** What each motion card is called on screen (templates/animations ids). */
const CARD_NAMES: Record<string, string> = {
  'stat-count-up': 'Number counting up',
  'big-quote': 'Quote, word by word',
  'list-reveal': 'List, one row at a time',
  'logo-pop': 'Logo pop',
  'price-tag': 'Price tag',
  'typing-terminal': 'Typing'
}

const RANK_GROUPS: { key: 'templates' | 'hooks' | 'concepts'; label: string }[] = [
  { key: 'templates', label: 'Templates' },
  { key: 'hooks', label: 'Hooks' },
  { key: 'concepts', label: 'Concepts' }
]

/** The writer's top picks for this idea, best first, each with why (rankings.md, their results, the fit). */
function RankedPicks({ ranked }: { ranked?: SavedScript['ranked'] }) {
  const groups = RANK_GROUPS.filter((g) => (ranked?.[g.key]?.length ?? 0) > 0)
  if (!ranked || !groups.length) return null
  return (
    <div className="stack" style={{ gap: 4 }} data-testid="script-ranked">
      <span className="field-label">Best for this idea</span>
      {groups.map((g) => (
        <div key={g.key} className="muted-sm" data-testid={`ranked-${g.key}`}>
          <strong>{g.label}:</strong>{' '}
          {ranked[g.key].map((r, i) => (
            <span key={r.name}>
              {i > 0 ? ' · ' : ''}
              {i + 1}. {r.name}
              {r.why ? ` (${r.why})` : ''}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
