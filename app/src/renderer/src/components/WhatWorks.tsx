import { useEffect, useState } from 'react'
import { MIN_SCORED, type Insights, type ScoredRow } from '../../../shared/results'
import { reel } from '../api'

function HookList({ title, rows, testid }: { title: string; rows: ScoredRow[]; testid: string }) {
  if (!rows.length) return null
  return (
    <div className="stack" style={{ gap: 6 }} data-testid={testid}>
      <h3>{title}</h3>
      <ul className="saved-list">
        {rows.map((r) => (
          <li key={r.slug}>
            <span>
              “{r.hook}”{r.formula && <span className="muted-sm"> · {r.formula}</span>}
            </span>
            <span className="muted-sm" title={`${r.result.views} views`}>
              {r.score}x
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** What the person's own posted videos say about their hooks: the same lesson the script writer reads. */
export function WhatWorks() {
  const [i, setI] = useState<Insights | null>(null)
  useEffect(() => {
    reel.results.insights().then(setI).catch(() => setI(null))
  }, [])
  if (!i) return null

  if (!i.enough) {
    const more = MIN_SCORED - i.scored
    return (
      <section className="panel" data-testid="what-works">
        <h2>What works for you</h2>
        <p className="muted-sm">
          Add the views of {more} more posted {more === 1 ? 'video' : 'videos'} (on each video’s page, under “How did it do?”) and I’ll start writing hooks from what works for you.
        </p>
      </section>
    )
  }
  return (
    <section className="panel stack" data-testid="what-works">
      <div>
        <h2>What works for you</h2>
        <p className="muted-sm">
          {i.scored} posted videos, each compared with your usual {Math.round(i.median ?? 0).toLocaleString()} views. Your next scripts lean toward the top and away from the bottom.
        </p>
      </div>
      <HookList title="Did better than usual" rows={i.winners.slice(0, 5)} testid="what-works-winners" />
      <HookList title="Did worse than usual" rows={i.flops.slice(0, 3)} testid="what-works-flops" />
      {!i.winners.length && !i.flops.length && <p className="muted-sm">No clear standouts yet: every video is close to your usual.</p>}
      {i.formulas.length > 1 && (
        <p className="muted-sm" data-testid="what-works-formulas">
          Hook shapes, best first: {i.formulas.map((f) => `${f.formula} ${f.average}x`).join(' · ')}
        </p>
      )}
    </section>
  )
}
