import { useEffect, useState } from 'react'
import type { PerformanceView } from '../../../shared/overview'
import { MIN_SCORED } from '../../../shared/results'
import { reel, userMessage } from '../api'
import type { Go } from '../nav'
import './Overview.css'

const times = (n: number): string => `${n >= 10 ? Math.round(n) : n.toFixed(1)}×`
const secs = (s: number | null): string => (s === null ? '' : `${Math.round(s)} s`)

/** The strongest single finding: the best row of the grouping with the widest spread, when it beats your usual. */
function headline(v: PerformanceView): { big: string; what: string; why: string } | null {
  let best: { big: string; what: string; why: string; spread: number } | null = null
  for (const g of v.groups) {
    const top = g.rows[0]!
    const low = g.rows[g.rows.length - 1]!
    const spread = top.average - low.average
    if (top.average < 1.2 || top.videos < 2) continue
    if (!best || spread > best.spread)
      best = { big: times(top.average), what: g.dimension === 'hook' ? `${top.name} hooks` : top.name, why: `your usual views, across ${top.videos} videos (${g.label.toLowerCase()})`, spread }
  }
  return best && { big: best.big, what: best.what, why: best.why }
}

export function Performing({ go }: { go: Go }) {
  const [v, setV] = useState<PerformanceView | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    reel.overview.performance().then(setV, (e) => setError(userMessage(e)))
  }, [])

  const i = v?.insights
  const top = v && headline(v)
  const maxAvg = Math.max(2, ...(v?.groups.flatMap((g) => g.rows.map((r) => r.average)) ?? [0]))

  return (
    <div className="page ov" data-testid="performing">
      <div className="page-head">
        <div>
          <h1>What's performing</h1>
          <p className="ov-lede">
            Each posted video against your usual views, grouped by how it was made. Add views on a video's page under "How did it do?".
          </p>
        </div>
      </div>

      {error && <div className="banner error"><span>{error}</span></div>}
      {!v && !error && <div className="ov-skeleton" aria-busy="true" />}

      {i && !i.enough && (
        <div className="drop" data-testid="performing-empty">
          <h2>{i.scored ? `${i.scored} of ${MIN_SCORED} videos scored` : 'Nothing scored yet'}</h2>
          <p className="muted" style={{ maxWidth: '52ch' }}>
            Once {MIN_SCORED} posted videos have their views (3 days after posting, so the numbers settle), this page shows which hooks, styles and lengths
            win for you. Nothing here is guessed.
          </p>
          <button className="btn" onClick={() => go({ name: 'home' })}>
            Open my videos
          </button>
        </div>
      )}

      {v && i?.enough && (
        <>
          {top ? (
            <div className="headline-stat" data-testid="performing-headline">
              <span className="big">{top.big}</span>
              <span className="what">{top.what}</span>
              <span className="why">{top.why}</span>
            </div>
          ) : (
            <p className="ov-lede">No choice stands out yet: keep posting, and the patterns show up here.</p>
          )}

          {v.groups.length > 0 && (
            <section className="ov-section">
              <h2>By how they were made</h2>
              <div className="groups">
                {v.groups.map((g) => (
                  <div className="group" key={g.dimension} data-testid={`group-${g.dimension}`}>
                    <h3>{g.label}</h3>
                    <ul className="bars">
                      {g.rows.map((r, k) => (
                        <li key={r.name} className={k === 0 && r.average >= 1.2 ? 'best' : ''}>
                          <span className="name" title={r.name}>{r.name}</span>
                          <span className="track" aria-hidden>
                            <span className="fill" style={{ width: `${(r.average / maxAvg) * 100}%` }} />
                            <span className="usual" style={{ left: `${(1 / maxAvg) * 100}%` }} title="your usual" />
                          </span>
                          <span className="val">
                            {times(r.average)} <small>{r.videos === 1 ? '1 video' : `${r.videos} videos`}</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="muted-sm">The thin line is your usual views (1×). A group with 1 video is a hint, not a pattern.</p>
            </section>
          )}

          <section className="ov-section">
            <h2>
              Every scored video <span className="ov-count">{v.videos.length}</span>
            </h2>
            <table className="ov-table">
              <thead>
                <tr><th>Video</th><th>Views vs usual</th><th>Hook shape</th><th>Style</th><th>Motion cards</th><th>Length</th></tr>
              </thead>
              <tbody>
                {[...v.videos].sort((a, b) => b.score - a.score).map((x) => (
                  <tr key={x.slug} className="clickable" onClick={() => go({ name: 'made', slug: x.slug })} data-testid="performing-video">
                    <td className="clip-text">
                      <button className="row-toggle" onClick={(e) => { e.stopPropagation(); go({ name: 'made', slug: x.slug }) }} aria-label={`How it was made: ${x.title}`}>
                        <span>{x.title}</span>
                      </button>
                    </td>
                    <td className={`num${x.score >= 1.5 ? ' win' : ''}`}>{times(x.score)}</td>
                    <td>{x.formula || <span className="muted-sm">Not recorded</span>}</td>
                    <td>{x.editStyle}</td>
                    <td>{x.cards || 'None'}</td>
                    <td>{secs(x.seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
