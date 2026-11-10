import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { ProjectSummary } from '../../../shared/api'
import { MIN_SCORED, type Insights } from '../../../shared/results'
import { niceDate, reel } from '../api'
import type { Go } from '../nav'
import { Icon } from '../components/icons'
import './Home.css'

const STATUS: Record<ProjectSummary['status'], string> = {
  new: 'Getting started',
  working: 'Working on it',
  ready: 'Ready',
  interrupted: 'Paused',
  failed: 'Did not finish'
}

/** "My very long video title from Tuesday" -> "My very long vid…om Tuesday": keeps the start and the end. */
function middle(title: string, max = 34): string {
  if (title.length <= max) return title
  const head = Math.ceil((max - 1) * 0.6)
  return `${title.slice(0, head).trimEnd()}…${title.slice(title.length - (max - 1 - head)).trimStart()}`
}

const times = (n: number): string => `${n >= 10 ? Math.round(n) : n.toFixed(1)}×`

/** One plain sentence about what is working, from real posted results only; null when there is nothing to say yet. */
export function workingLine(i: Insights | null): { lead: string; rest: string } | null {
  if (!i || i.scored === 0) return null
  if (!i.enough) {
    const more = MIN_SCORED - i.scored
    return { lead: `${i.scored} of ${MIN_SCORED} videos scored.`, rest: ` Add the views of ${more} more posted ${more === 1 ? 'video' : 'videos'} and I'll show what works.` }
  }
  const best = i.formulas.filter((f) => f.videos >= 2).sort((a, b) => b.average - a.average)[0]
  if (best && best.average >= 1.2) return { lead: `${best.formula} hooks do best.`, rest: ` ${times(best.average)} your usual views across ${best.videos} videos.` }
  const top = i.winners[0]
  return top?.score ? { lead: `“${middle(top.title, 40)}” is your best so far.`, rest: ` ${times(top.score)} your usual views.` } : null
}

export function Home({ go }: { go: Go }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [insights, setInsights] = useState<Insights | null>(null)
  const reduce = useReducedMotion()
  const opening = useRef<string | null>(null)

  useEffect(() => {
    let live = true
    const load = () => reel.projects.list().then((p) => live && setProjects(p))
    void load()
    reel.results.insights().then((i) => live && setInsights(i)).catch(() => {})
    const off = reel.jobs.onEvent((e) => {
      if (e.type !== 'status') void load()
    })
    return () => {
      live = false
      opening.current = null
      off()
    }
  }, [])

  const open = (p: ProjectSummary) => {
    opening.current = p.slug
    const show = (name: 'reel' | 'working') => {
      if (opening.current === p.slug) go({ name, slug: p.slug })
    }
    if (p.status === 'ready') go({ name: 'reel', slug: p.slug })
    else void reel.projects.get(p.slug).then(
      (d) => show(d.job?.kind === 'note' || d.job?.kind === 'rerender' || (!d.job && d.versions.length > 0) ? 'reel' : 'working'),
      () => show('working')
    )
  }

  const score = new Map((insights?.rows ?? []).filter((r) => r.score !== null && !r.growing).map((r) => [r.slug, r.score as number]))
  const working = workingLine(insights)

  return (
    <div className="page home">
      <div className="page-head">
        <div>
          <h1>Your videos</h1>
          {working ? (
            <p className="working-line" data-testid="working-line">
              <strong>{working.lead}</strong>
              {working.rest}
            </p>
          ) : (
            <p className="muted">Drop in a raw video and I'll turn it into a reel.</p>
          )}
        </div>
        <button className="btn primary big" onClick={() => go({ name: 'new' })} data-testid="new-video">
          <Icon name="plus" /> New video
        </button>
      </div>

      {!projects && <div className="sheet" aria-hidden>{[0, 1, 2, 3].map((i) => <div key={i} className="poster skeleton" />)}</div>}

      {projects && projects.length === 0 && (
        <div className="drop tall">
          <div className="drop-icon">
            <Icon name="video" size={28} />
          </div>
          <h2>Make your first reel</h2>
          <p className="muted">Drag your video anywhere onto this window, or click New video.</p>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="sheet">
          {projects.map((p, i) => {
            const s = score.get(p.slug)
            return (
              <motion.div
                key={p.slug}
                className="poster-wrap"
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: Math.min(i, 10) * 0.04, ease: [0.16, 1, 0.3, 1] }}
              >
                <button className="card poster" onClick={() => open(p)} data-testid="project-card" title={p.title}>
                  <div className="thumb">
                    {p.thumbnail ? <img src={p.thumbnail} alt="" /> : <Icon name="video" size={34} className="placeholder" />}
                    {s !== undefined && (
                      <span className={`score${s >= 1.5 ? ' win' : s <= 0.6 ? ' low' : ''}`} data-testid="poster-score">
                        {times(s)} your usual
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    <div className="card-title">{middle(p.title)}</div>
                    <div className="poster-meta">
                      <span className={`badge ${p.status}`} data-testid="card-status">
                        {p.status === 'ready' && p.version ? `Ready · Version ${p.version}` : STATUS[p.status]}
                      </span>
                      <span className="muted-sm">{niceDate(p.updatedAt)}</span>
                    </div>
                  </div>
                </button>
                {p.version > 0 && (
                  <button className="how-made-link" onClick={() => go({ name: 'made', slug: p.slug })} data-testid="poster-how-made">
                    How it was made
                  </button>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
