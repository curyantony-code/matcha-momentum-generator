import { useState } from 'react'
import type { ClipPick } from '../../../shared/api'
import { reel, userMessage } from '../api'
import type { Go } from '../nav'
import { Spinner } from '../components/ui'
import { Icon } from '../components/icons'

const stamp = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

export function Clips({ go, slug }: { go: Go; slug: string }) {
  const [busy, setBusy] = useState<'pick' | 'make' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picks, setPicks] = useState<ClipPick[] | null>(null)
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set())

  const find = async () => {
    setBusy('pick')
    setError(null)
    try {
      const found = await reel.clips.pick(slug)
      setPicks(found)
      setChosen(new Set(found.map((_, i) => i)))
    } catch (e) {
      setError(userMessage(e))
    } finally {
      setBusy(null)
    }
  }
  const make = async () => {
    setBusy('make')
    setError(null)
    try {
      await reel.clips.make(slug, (picks ?? []).filter((_, i) => chosen.has(i)))
      go({ name: 'home' })
    } catch (e) {
      setError(userMessage(e))
      setBusy(null)
    }
  }
  const toggle = (i: number) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (!next.delete(i)) next.add(i)
      return next
    })

  return (
    <div className="page narrow">
      <button className="back" onClick={() => go({ name: 'reel', slug })}>
        <Icon name="back" size={16} /> Back to this video
      </button>
      <div className="page-head">
        <div>
          <h1>Find short clips</h1>
          <p className="muted">I'll read a long video and find the moments that work on their own. Each one you keep becomes a new video.</p>
        </div>
      </div>
      {!picks && (
        <button className="btn primary big" onClick={() => void find()} disabled={!!busy} data-testid="find-clips">
          {busy === 'pick' && <Spinner />} Find my best moments
        </button>
      )}
      {error && (
        <div className="banner error" role="alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      {picks?.length === 0 && <p className="muted">I did not find a moment strong enough to stand alone.</p>}
      {!!picks?.length && (
        <>
          <ol className="clip-list" data-testid="clip-list">
            {picks.map((c, i) => (
              <li key={`${c.start}-${c.end}`} className={chosen.has(i) ? 'on' : undefined}>
                <label>
                  <input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(i)} />
                  <span className="clip-score" title="How strong this moment is, out of 100">
                    {Math.round(c.score)}
                  </span>
                  <span className="clip-body">
                    <strong>{c.title}</strong>
                    <span className="clip-hook">"{c.hookLine}"</span>
                    <span className="muted-sm">
                      {stamp(c.start)} to {stamp(c.end)}. {c.reason}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ol>
          <button className="btn primary big" onClick={() => void make()} disabled={!!busy || chosen.size === 0} data-testid="make-clips">
            {busy === 'make' && <Spinner />} Make {chosen.size === 1 ? '1 clip' : `${chosen.size} clips`}
          </button>
        </>
      )}
    </div>
  )
}
