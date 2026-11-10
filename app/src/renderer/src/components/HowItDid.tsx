import { useEffect, useState } from 'react'
import { NO_RESULT, type VideoResult } from '../../../shared/results'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'

interface HowItDidProps {
  slug: string
}

const today = (): string => new Date().toISOString().slice(0, 10)
const STARS = [1, 2, 3, 4, 5]

/** After posting: the views and a quick rating, so the script writer learns which hooks work for this person. */
export function HowItDid({ slug }: HowItDidProps) {
  const notify = useNotify()
  const [saved, setSaved] = useState<VideoResult | null>(null)
  const [views, setViews] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [postedOn, setPostedOn] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    reel.results
      .get(slug)
      .then((r) => {
        setSaved(r)
        setViews(r.views === null ? '' : String(r.views))
        setRating(r.rating)
        setPostedOn(r.postedOn ?? '')
      })
      .catch(() => setSaved(NO_RESULT))
  }, [slug])
  if (!saved) return null

  const parsedViews = views.trim() === '' ? null : Number(views.replace(/[\s,]/g, ''))
  const viewsBad = parsedViews !== null && (!Number.isFinite(parsedViews) || parsedViews < 0)
  const changed = parsedViews !== saved.views || rating !== saved.rating || (postedOn || null) !== saved.postedOn

  const save = async () => {
    if (viewsBad || busy) return
    setBusy(true)
    try {
      const r = await reel.results.set(slug, { views: parsedViews, rating, postedOn: postedOn || null })
      setSaved(r)
      notify(r.views !== null ? 'Saved. I’ll learn from it when I write your next scripts.' : 'Saved.')
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel stack" data-testid="how-it-did" aria-labelledby={`how-${slug}`}>
      <div>
        <h2 id={`how-${slug}`}>How did it do?</h2>
        <p className="muted-sm">Once it’s posted, add its views. I compare every video with your usual and write the next hooks from what works.</p>
      </div>
      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-end' }}>
        <label className="look-field">
          <span>Views</span>
          <input
            className="input"
            inputMode="numeric"
            placeholder="e.g. 4,200"
            value={views}
            onChange={(e) => setViews(e.target.value)}
            aria-invalid={viewsBad}
            style={{ width: 140 }}
            data-testid="result-views"
          />
        </label>
        <label className="look-field">
          <span>Posted on</span>
          <input className="input" type="date" max={today()} value={postedOn} onChange={(e) => setPostedOn(e.target.value)} data-testid="result-posted" />
        </label>
        <div className="look-field" role="radiogroup" aria-label="How you felt about it">
          <span>Your rating</span>
          <div className="row" style={{ gap: 4 }}>
            {STARS.map((n) => (
              <button
                key={n}
                className={`chip${rating !== null && n <= rating ? ' active' : ''}`}
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} out of 5`}
                onClick={() => setRating(rating === n ? null : n)}
                data-testid={`result-rating-${n}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <button className="btn" onClick={() => void save()} disabled={busy || viewsBad || !changed} data-testid="result-save">
          Save
        </button>
      </div>
      {viewsBad && <p className="muted-sm" role="alert">Views should be a number, like 4200.</p>}
    </section>
  )
}
