import { useEffect, useRef, useState } from 'react'
import type { StudyReelDetail } from '../../../shared/study'
import { reel, userMessage } from '../api'
import type { Go } from '../nav'
import { Icon } from '../components/icons'
import { useNotify } from '../App'
import './HowMade.css'
import './Overview.css'
import './Study.css'

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const TABS = [
  { id: 'script', label: 'Script' },
  { id: 'formula', label: 'Formula' },
  { id: 'edit', label: 'Edit style' },
  { id: 'why', label: 'Why it works' }
] as const
type Tab = (typeof TABS)[number]['id']

const ROLE_LABEL: Record<string, string> = {
  hook: 'Hook', setup: 'Setup', claim: 'Claim', proof: 'Proof', story: 'Story', turn: 'Turn', rehook: 'Re-hook', payoff: 'Payoff', cta: 'Ask', signoff: 'Sign-off', other: 'Beat'
}
const EDIT_LABEL: Record<string, string> = {
  pace: 'Pace', captions: 'Captions', onScreen: 'On screen', broll: 'B-roll', camera: 'Camera', zooms: 'Zooms', sound: 'Sound', look: 'Look', muted: 'On mute'
}

export function StudyReel({ id, go }: { id: string; go: Go }) {
  const [d, setD] = useState<StudyReelDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('script')
  const [time, setTime] = useState(0)
  const [saving, setSaving] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const notify = useNotify()

  const load = (): void => void reel.study.get(id).then(setD, (e) => setError(userMessage(e)))
  useEffect(load, [id])

  const seek = (t: number): void => {
    if (video.current) {
      video.current.currentTime = t
      void video.current.play().catch(() => undefined)
    }
  }
  const save = async (what: 'concept' | 'template' | 'research'): Promise<void> => {
    setSaving(what)
    try {
      if (what === 'concept') {
        await reel.study.toConcept(id)
        notify('Added to your niche concepts. The script writer can build on it now.')
      } else if (what === 'template') {
        await reel.study.toTemplate(id)
        notify('Saved as a beat template. Pick it in Scripts.')
      } else {
        await reel.study.toResearch(id)
        notify('Saved to your research notes, where /studio-script reads it.')
      }
      load()
    } catch (e) {
      notify(userMessage(e))
    } finally {
      setSaving(null)
    }
  }

  if (error) return <div className="page"><div className="banner error"><span>{error}</span></div></div>
  if (!d) return <div className="page made"><div className="made-grid"><div className="phone skeleton-block" /><div className="lanes skeleton-block" /></div></div>
  const s = d.study
  const m = d.measure
  const dur = m?.durationSec || d.durationSec || 1
  const pct = (t: number): string => `${Math.max(0, Math.min(100, (t / dur) * 100))}%`
  const shots = m ? [0, ...m.cuts, dur] : [0, dur]

  return (
    <div className="page made study-reel" data-testid="study-reel-page">
      <button className="link back" onClick={() => go({ name: 'study' })}>
        <Icon name="back" size={14} /> Study reels
      </button>
      <div className="made-head">
        <h1>{d.creator ? `@${d.creator}` : 'A studied video'}</h1>
        {s && <p className="ov-lede">{s.summary}</p>}
        <p className="made-facts" data-testid="study-facts">
          {m && <span>{Math.round(m.durationSec)} s</span>}
          {m && <span>{m.cutsPerMin.toFixed(1)} cuts a minute</span>}
          {m && <span>{Math.round(m.wpm)} words a minute</span>}
          {m && <span>{m.musicLikely ? 'Music under the voice' : 'Voice only'}</span>}
          {d.views !== null && <span>{d.views.toLocaleString('en-US')} views</span>}
          {d.vsUsual !== null && <span className={d.vsUsual >= 1.5 ? 'good' : ''}>{d.vsUsual}× their usual</span>}
          <button className="link inline open-original" onClick={() => void reel.study.open(d.url)}>
            Open the original <Icon name="external" size={12} />
          </button>
        </p>
      </div>

      <div className="made-grid">
        <div className="made-left">
          <div className="phone">
            <div className="phone-screen">
              {d.video ? (
                <video ref={video} src={d.video} controls playsInline onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} data-testid="study-player" />
              ) : (
                <div className="phone-empty">The video file is gone.</div>
              )}
            </div>
          </div>
          {s && (
            <div className="study-actions" data-testid="study-actions">
              <button className="btn" onClick={() => void save('concept')} disabled={!!saving || d.saved.concept} data-testid="study-to-concept">
                <Icon name={d.saved.concept ? 'check' : 'sparkles'} size={15} />
                {d.saved.concept ? 'In your niche concepts' : 'Add to my niche concepts'}
              </button>
              <button className="btn" onClick={() => void save('template')} disabled={!!saving || d.saved.template} data-testid="study-to-template">
                <Icon name={d.saved.template ? 'check' : 'plus'} size={15} />
                {d.saved.template ? 'Saved as a template' : 'Save as a beat template'}
              </button>
              <button className="btn" onClick={() => void save('research')} disabled={!!saving} data-testid="study-to-research">
                <Icon name={d.saved.research ? 'check' : 'pen'} size={15} />
                {d.saved.research ? 'Saved to research (again?)' : 'Save to research notes'}
              </button>
            </div>
          )}
        </div>

        <div className="made-right">
          {m && (
            <section className="lanes" aria-label="Their video on a timeline">
              <div className="lane ruler-row">
                <span className="lane-name" />
                <div className="lane-track ruler">
                  {[0, 0.25, 0.5, 0.75].map((f) => (
                    <span key={f} style={{ left: `${f * 100}%` }}>{clock(f * dur)}</span>
                  ))}
                </div>
              </div>
              <div className="lane">
                <span className="lane-name" title="Every shot between two cuts">Shots</span>
                <div className="lane-track">
                  {shots.slice(0, -1).map((t, k) => (
                    <button key={k} className="clip cut" style={{ left: pct(t), width: `calc(${pct(shots[k + 1]! - t)} - 1px)` }} onClick={() => seek(t)} aria-label={`Shot at ${clock(t)}`} />
                  ))}
                </div>
              </div>
              <div className="lane">
                <span className="lane-name" title="When they are talking">Talking</span>
                <div className="lane-track">
                  {m.words.map((w, k) => (
                    <span key={k} className="clip word" style={{ left: pct(w.s), width: `max(2px, ${pct(w.e - w.s)})` }} />
                  ))}
                </div>
              </div>
              {s && (
                <div className="lane">
                  <span className="lane-name" title="The script's beats, from the breakdown">Beats</span>
                  <div className="lane-track">
                    {s.script.beats.map((b, k) => (
                      <button
                        key={k}
                        className={`clip beat role-${b.role}`}
                        style={{ left: pct(b.at), width: `calc(${pct((s.script.beats[k + 1]?.at ?? dur) - b.at)} - 2px)` }}
                        onClick={() => seek(b.at)}
                        title={`${ROLE_LABEL[b.role] ?? 'Beat'} at ${clock(b.at)}`}
                        aria-label={`${ROLE_LABEL[b.role] ?? 'Beat'} at ${clock(b.at)}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="playhead-layer" aria-hidden>
                <span className="playhead" style={{ left: pct(time) }} />
              </div>
            </section>
          )}

          {!s && (
            <p className="muted">
              {d.status === 'failed' ? d.error : 'Still being studied. This page fills in when it is done.'}
            </p>
          )}

          {s && (
            <>
              <div className="seg study-tabs" role="tablist" aria-label="What to look at">
                {TABS.map((t) => (
                  <button key={t.id} id={`study-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`study-panel-${t.id}`} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} data-testid={`study-tab-${t.id}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'script' && (
                <section className="made-section" role="tabpanel" id="study-panel-script" aria-labelledby="study-tab-script" data-testid="study-script">
                  <div className="study-hook">
                    <span className="field-label">
                      Hook at {clock(s.script.hook.at)} · {s.script.hook.shape}
                    </span>
                    <p className="hook-text">{/^\(.*\)$/.test(s.script.hook.text) ? s.script.hook.text : `“${s.script.hook.text}”`}</p>
                    <p className="muted-sm">{s.script.hook.why}</p>
                  </div>
                  <ol className="beats">
                    {s.script.beats.map((b, k) => (
                      <li key={k} className={`role-${b.role}`}>
                        <button className="t" onClick={() => seek(b.at)} aria-label={`Play from ${clock(b.at)}`}>
                          {clock(b.at)}
                        </button>
                        <span className="role">{ROLE_LABEL[b.role] ?? 'Beat'}</span>
                        <span className="said">“{b.said}”</span>
                        <span className="note">{b.note}</span>
                      </li>
                    ))}
                  </ol>
                  <dl className="study-dl">
                    <div><dt>Re-hook</dt><dd>{s.script.rehook ? `${clock(s.script.rehook.at)} (${Math.round((s.script.rehook.at / dur) * 100)}% in): “${s.script.rehook.text}”` : 'None'}</dd></div>
                    <div><dt>Payoff</dt><dd>{s.script.payoff || 'None'}</dd></div>
                    <div><dt>The ask</dt><dd>{s.script.cta.text ? `${s.script.cta.text} (${s.script.cta.kind})` : 'None'}</dd></div>
                    <div><dt>Loops back</dt><dd>{s.script.loop.loops ? 'Yes. ' : 'No. '}{s.script.loop.how}</dd></div>
                  </dl>
                </section>
              )}

              {tab === 'formula' && (
                <section className="made-section" role="tabpanel" id="study-panel-formula" aria-labelledby="study-tab-formula" data-testid="study-formula">
                  <div className="formula-head">
                    <span className="formula-name">{s.formula.name}</span>
                    <span className="muted">{s.formula.concept}</span>
                  </div>
                  <ol className="formula-steps">
                    {s.formula.steps.map((t, k) => (
                      <li key={k}>{t}</li>
                    ))}
                  </ol>
                  <dl className="study-dl">
                    <div><dt>Hook shape</dt><dd>{s.formula.hookShape || s.script.hook.shape}</dd></div>
                    <div>
                      <dt>Your closest template</dt>
                      <dd>
                        {s.formula.closestTemplate.name ? `${s.formula.closestTemplate.name} (${s.formula.closestTemplate.fit === 'close' ? 'close' : s.formula.closestTemplate.fit === 'partial' ? 'partly' : 'not close'}). ` : 'None. '}
                        {s.formula.closestTemplate.diff}
                      </dd>
                    </div>
                  </dl>
                </section>
              )}

              {tab === 'edit' && (
                <section className="made-section" role="tabpanel" id="study-panel-edit" aria-labelledby="study-tab-edit" data-testid="study-edit">
                  {m && (
                    <div className="edit-numbers">
                      <div><span className="big">{m.cutsPerMin.toFixed(1)}</span><span>cuts a minute</span></div>
                      <div><span className="big">{m.avgShotSec.toFixed(1)} s</span><span>a shot on average</span></div>
                      <div><span className="big">{Math.round(m.wpm)}</span><span>words a minute</span></div>
                      <div><span className="big">{m.firstWordAt === null ? 'None' : `${m.firstWordAt.toFixed(1)} s`}</span><span>to the first word</span></div>
                    </div>
                  )}
                  <dl className="study-dl">
                    {Object.entries(s.edit).map(([k, v]) => (
                      <div key={k}><dt>{EDIT_LABEL[k] ?? k}</dt><dd>{v}</dd></div>
                    ))}
                  </dl>
                  {m && m.frames.length > 0 && (
                    <div className="frames" aria-label="Frames the breakdown looked at">
                      {m.frames.map((f) => (
                        <button key={f.url} onClick={() => seek(f.at)} aria-label={`Frame at ${clock(f.at)}`}>
                          <img src={f.url} alt="" loading="lazy" />
                          <span>{clock(f.at)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {tab === 'why' && (
                <section className="made-section" role="tabpanel" id="study-panel-why" aria-labelledby="study-tab-why" data-testid="study-why">
                  <div className="why-cols">
                    <div>
                      <h3>Why it works</h3>
                      <ul>{s.why.map((w, k) => <li key={k}>{w}</li>)}</ul>
                    </div>
                    <div>
                      <h3>Borrow</h3>
                      <ul className="borrow-list">{s.borrow.map((w, k) => <li key={k}>{w}</li>)}</ul>
                    </div>
                    <div>
                      <h3>Don't copy</h3>
                      <ul className="avoid-list">{s.avoid.map((w, k) => <li key={k}>{w}</li>)}</ul>
                    </div>
                  </div>
                  {s.tryThis.idea && (
                    <div className="try-this">
                      <span className="field-label">Try this in your own videos</span>
                      <p>{s.tryThis.idea}</p>
                      {s.tryThis.hook && <p className="hook-text">“{s.tryThis.hook}”</p>}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
