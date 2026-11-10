import { useEffect, useState } from 'react'
import type { StoryboardScene } from '../../../shared/api'
import { reel, userMessage } from '../api'
import { Spinner } from './ui'

const stamp = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

interface Props {
  slug: string
  /** Changes when a new preview lands, so the scenes are laid out again. */
  previewKey: string
  onApprove: () => void
}

/** The scenes of the preview, to approve before the full-quality render. Changes go through the notes box. */
export function StoryboardPanel({ slug, previewKey, onApprove }: Props) {
  const [scenes, setScenes] = useState<StoryboardScene[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setScenes(null)
    setError(null)
    reel.storyboard
      .get(slug)
      .then((s) => live && setScenes(s.scenes))
      .catch((e) => live && setError(userMessage(e)))
    return () => {
      live = false
    }
  }, [slug, previewKey])

  return (
    <section className="panel storyboard" data-testid="storyboard">
      <div className="row">
        <div>
          <h2>Storyboard</h2>
          <p className="muted-sm">Check each scene. Want a change? Type it in the notes below and I'll make a new preview.</p>
        </div>
        <span className="spacer" />
        <button className="btn primary" onClick={onApprove} disabled={!scenes} data-testid="approve-storyboard">
          Looks good. Make the final video
        </button>
      </div>
      {!scenes && !error && <Spinner />}
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      {scenes && (
        <ol className="scene-grid">
          {scenes.map((s) => (
            <li key={s.n} className="scene" data-testid="scene">
              <div className="scene-still">{s.still ? <img src={s.still} alt={`Scene ${s.n}`} loading="lazy" /> : <span className="muted-sm">No preview yet</span>}</div>
              <span className="scene-time">
                {s.n} · {stamp(s.t0)} to {stamp(s.t1)}
              </span>
              <p className="scene-text">{s.text}</p>
              {s.overlays.length > 0 && (
                <ul className="scene-overlays">
                  {s.overlays.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
