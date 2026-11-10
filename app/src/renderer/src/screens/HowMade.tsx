import { useEffect, useMemo, useRef, useState } from 'react'
import type { HowMade as Report, HowMadeCard, ProjectDetail, TraceEntry } from '../../../shared/api'
import { reel, userMessage } from '../api'
import type { Go } from '../nav'
import { Icon, type IconName } from '../components/icons'
import './HowMade.css'

/** The AI's tools, named for what they did to the video. */
const STEP_NAMES: Record<string, string> = {
  get_project: 'Read the project',
  get_transcript: 'Read what you said',
  set_cut: 'Chose your takes',
  set_gap_cap: 'Set how tight the cuts are',
  set_caption_style: 'Styled the subtitles',
  set_filter: 'Picked a colour filter',
  set_auto_color: 'Balanced the colour',
  set_picture_style: 'Styled the pictures',
  set_sound_effects: 'Set the sound effects',
  add_caption_correction: 'Fixed a misheard word',
  remove_caption_correction: 'Undid a word fix',
  list_library: 'Looked through your Library',
  choose_music: 'Chose the music',
  set_music_automation: 'Shaped the music level',
  add_broll: 'Placed something on screen',
  update_broll: 'Adjusted something on screen',
  remove_broll: 'Took something off screen',
  search_images: 'Searched for a picture',
  fetch_image: 'Downloaded a picture',
  capture_website: 'Captured a web page',
  make_animation: 'Made an animated card',
  set_zoom: 'Set the zooms',
  set_mirror: 'Flipped the picture',
  cover_candidates: 'Looked for a cover',
  set_cover: 'Chose the cover',
  write_post: 'Wrote the post',
  add_style_rule: 'Noticed a style rule',
  render_draft: 'Watched a draft',
  look_at_frames: 'Checked frames',
  finish: 'Finished'
}

const KIND_ICON: Record<HowMadeCard['kind'], IconName> = { picture: 'image', animation: 'sparkles', text: 'type' }
const KIND_NAME: Record<HowMadeCard['kind'], string> = { picture: 'Picture', animation: 'Animated card', text: 'Text' }

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const JOB_NAMES: Record<string, string> = { 'first-edit': 'First edit', note: 'Note', rerender: 'Remake', export: 'Export' }

type Step = Extract<TraceEntry, { type: 'step' }>

/** The steps worth reading: every change and every refusal; reads and drafts are folded into a count. */
function readable(entries: Report['jobs'][number]['entries']): { shown: Report['jobs'][number]['entries']; quiet: number } {
  const quietTools = new Set(['get_project', 'get_transcript', 'list_library', 'render_draft', 'look_at_frames'])
  let quiet = 0
  const shown = entries.filter((e) => {
    if (e.type === 'step' && e.ok && quietTools.has(e.name)) {
      quiet++
      return false
    }
    return true
  })
  return { shown, quiet }
}

export function HowMade({ slug, go }: { slug: string; go: Go }) {
  const [report, setReport] = useState<Report | null>(null)
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState(0)
  const [reasoning, setReasoning] = useState(false)
  const [time, setTime] = useState(0)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let live = true
    Promise.all([reel.howMade.get(slug), reel.projects.get(slug)])
      .then(([r, d]) => {
        if (!live) return
        setReport(r)
        setDetail(d)
        setJob(Math.max(0, r.jobs.length - 1))
      })
      .catch((e) => live && setError(userMessage(e)))
    return () => {
      live = false
    }
  }, [slug])

  const shown = useMemo(() => {
    if (!detail || !report) return null
    const finished = detail.versions.filter((v) => !v.draft)
    return finished.find((v) => v.n === report.version) ?? finished[finished.length - 1] ?? null
  }, [detail, report])

  const seek = (t: number): void => {
    const v = video.current
    if (!v) return
    v.currentTime = t
    void v.play().catch(() => undefined)
  }

  if (error) {
    return (
      <div className="page">
        <button className="back" onClick={() => go({ name: 'home' })}>
          <Icon name="back" size={16} /> My videos
        </button>
        <div className="banner error">
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (!report || !detail) {
    return (
      <div className="page made" aria-busy="true">
        <div className="made-grid">
          <div className="phone skeleton-block" />
          <div className="stack">
            <div className="skeleton-line wide" />
            <div className="lanes skeleton-block" />
          </div>
        </div>
      </div>
    )
  }

  const d = report.duration || 1
  const pct = (t: number): string => `${Math.max(0, Math.min(100, (t / d) * 100))}%`
  const span = (a: number, b: number) => ({ left: pct(a), width: `max(2px, ${Math.max(0, ((b - a) / d) * 100)}%)` })
  const failed = report.checks.filter((c) => !c.ok && !c.warn)
  const current = report.jobs[job]
  const steps = current ? readable(reasoning ? current.entries : current.entries.filter((e) => e.type === 'step')) : null
  const ticks = Array.from({ length: Math.floor(d / 10) + 1 }, (_, i) => i * 10)

  return (
    <div className="page made" data-testid="how-made">
      <button className="back" onClick={() => go({ name: 'reel', slug })}>
        <Icon name="back" size={16} /> {detail.title}
      </button>
      <div className="made-head">
        <h1>How it was made</h1>
        <p className="made-facts" data-testid="made-facts">
          {report.stats.sourceSeconds ? `${Math.round(report.stats.keptSeconds)} s kept from ${Math.round(report.stats.sourceSeconds)} s` : `${Math.round(report.stats.keptSeconds)} s long`}
          <span>{report.stats.cuts} cuts</span>
          <span>
            {report.lanes.cards.length} {report.lanes.cards.length === 1 ? 'thing' : 'things'} on screen
          </span>
          <span>{report.lanes.zooms.length} zooms</span>
          {report.estimated && (
            <span title="This render left no timing of its own, so it is rebuilt from the takes you kept" data-testid="made-estimated">
              Timing is approximate
            </span>
          )}
          {report.checks.length > 0 && (
            <span className={failed.length ? 'bad' : 'good'}>
              {failed.length ? `${failed.length} ${failed.length === 1 ? 'check' : 'checks'} failed` : `All ${report.checks.length} checks passed`}
            </span>
          )}
        </p>
      </div>

      <div className="made-grid">
        <div className="made-left">
          <div className="phone">
            <div className="phone-screen">
              {shown ? (
                <video ref={video} src={shown.video} controls playsInline onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} data-testid="made-player" />
              ) : (
                <div className="phone-empty">No finished version yet.</div>
              )}
            </div>
          </div>
          {report.version !== null && <span className="muted-sm">Version {report.version}</span>}
        </div>

        <div className="made-right">
          <section className="lanes" aria-label="The edit on its timeline">
            <div className="lane ruler-row" aria-hidden>
              <span />
              <div className="lane-track ruler">
                {ticks.map((t) => (
                  <span key={t} style={{ left: pct(t) }}>
                    {clock(t)}
                  </span>
                ))}
              </div>
            </div>
            <Lane name="Cut" testId="lane-cut" hint="The stretches of your take that were kept">
              {report.lanes.cut.map((c, i) => (
                <button key={i} className="clip cut" style={span(c.t0, c.t1)} onClick={() => seek(c.t0)} title={`${clock(c.t0)} to ${clock(c.t1)}, from ${clock(c.from)} in your take`} aria-label={`Kept: ${clock(c.t0)} to ${clock(c.t1)}`} />
              ))}
            </Lane>
            <Lane name="Words" testId="lane-words" hint="Each subtitle; tall marks are the key words">
              {report.lanes.words.map((w, i) => (
                <button key={i} className={`clip word${w.key ? ' key' : ''}`} style={span(w.t0, w.t1)} onClick={() => seek(w.t0)} title={w.text} aria-label={w.text} tabIndex={-1} />
              ))}
            </Lane>
            <Lane name="On screen" testId="lane-cards" hint="Pictures, animated cards and text">
              {report.lanes.cards.map((c) => (
                <button key={c.id} className={`clip card-clip ${c.kind}`} style={span(c.t0, c.t1)} onClick={() => seek(c.t0)} title={`${KIND_NAME[c.kind]}: ${c.label}`} aria-label={`${KIND_NAME[c.kind]}: ${c.label}, at ${clock(c.t0)}`} />
              ))}
            </Lane>
            <Lane name="Zooms" testId="lane-zooms" hint="Each push-in and how far">
              {report.lanes.zooms.map((z, i) => (
                <button key={i} className="clip zoom" style={span(z.t0, z.t1)} onClick={() => seek(z.t0)} title={`${Math.round((z.scale - 1) * 100)}% push-in`} aria-label={`${Math.round((z.scale - 1) * 100)}% push-in at ${clock(z.t0)}`} />
              ))}
            </Lane>
            <div className="playhead-layer" aria-hidden>
              <div className="playhead" style={{ left: pct(time) }} />
            </div>
          </section>

          {report.lanes.cards.length > 0 && (
            <section className="made-section">
              <h2>On screen</h2>
              <ol className="on-screen">
                {report.lanes.cards.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => seek(c.t0)} data-testid="made-card">
                      <span className="t">{clock(c.t0)}</span>
                      <Icon name={KIND_ICON[c.kind]} size={16} />
                      <span className="label">{c.label}</span>
                      <span className="muted-sm">{KIND_NAME[c.kind]}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="made-section">
            <div className="made-section-head">
              <h2>What the editor did</h2>
              {report.jobs.length > 1 && (
                <div className="seg small" role="tablist" aria-label="Which edit">
                  {report.jobs.map((j, i) => (
                    <button key={j.at + i} role="tab" aria-selected={i === job} className={i === job ? 'on' : ''} onClick={() => setJob(i)}>
                      {JOB_NAMES[j.kind] ?? j.kind}
                      {j.note ? `: ${j.note.slice(0, 24)}${j.note.length > 24 ? '…' : ''}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!current && (
              <p className="muted" data-testid="made-no-steps">
                This video was made before the editor kept its steps. Your next edit or note will show every decision here.
              </p>
            )}
            {current && steps && (
              <>
                <label className="check-row reasoning-toggle">
                  <input type="checkbox" checked={reasoning} onChange={(e) => setReasoning(e.target.checked)} data-testid="made-reasoning" />
                  Show its reasoning
                </label>
                <ol className="steps-list">
                  {steps.shown.map((e, i) =>
                    e.type === 'thought' ? (
                      <li key={i} className="thought">
                        {e.text}
                      </li>
                    ) : (
                      <StepRow key={i} step={e} />
                    )
                  )}
                </ol>
                {steps.quiet > 0 && (
                  <p className="muted-sm">
                    Plus {steps.quiet} {steps.quiet === 1 ? 'look' : 'looks'} at your project, drafts and frames.
                  </p>
                )}
              </>
            )}
            {report.summary && <p className="made-summary">{report.summary}</p>}
          </section>

          {report.checks.length > 0 && (
            <section className="made-section">
              <h2>Checks on the finished file</h2>
              <ul className="checks-grid">
                {report.checks.map((c) => (
                  <li key={c.name} className={c.ok ? 'ok' : c.warn ? 'warn' : 'bad'} title={c.detail} data-testid="made-check">
                    <Icon name={c.ok ? 'check' : 'x'} size={14} stroke={2} />
                    {c.name.charAt(0).toUpperCase() + c.name.slice(1)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function Lane({ name, hint, testId, children }: { name: string; hint: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="lane" data-testid={testId}>
      <span className="lane-name" title={hint}>
        {name}
      </span>
      <div className="lane-track">{children}</div>
    </div>
  )
}

function StepRow({ step }: { step: Step }) {
  return (
    <li className={step.ok ? 'step' : 'step refused'} data-testid="made-step">
      <span className="what">{STEP_NAMES[step.name] ?? step.name.replace(/_/g, ' ')}</span>
      {step.ok ? step.summary && <span className="why">{step.summary}</span> : <span className="why">Refused: {step.error}</span>}
    </li>
  )
}
