import { Fragment, useEffect, useState } from 'react'
import type { EngineView } from '../../../shared/overview'
import { niceDate, reel, userMessage } from '../api'
import type { Go } from '../nav'
import { Icon } from '../components/icons'
import { STAGES, sourceById } from '../../../shared/skills'
import { SkillsMap } from './SkillsMap'
import './Overview.css'

export function Engine({ go }: { go: Go }) {
  const [v, setV] = useState<EngineView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openScript, setOpenScript] = useState<string | null>(null)
  useEffect(() => {
    reel.overview.engine().then(setV, (e) => setError(userMessage(e)))
  }, [])

  const found = v?.files.filter((f) => f.found).length ?? 0

  return (
    <div className="page ov" data-testid="engine">
      <div className="page-head">
        <div>
          <h1>Content engine</h1>
          <p className="ov-lede">
            Everything the script writer reads before it writes for {v?.brand ? v.brand : 'you'}, and what it did with it.
          </p>
        </div>
      </div>

      {error && <div className="banner error"><span>{error}</span></div>}
      {!v && !error && <div className="ov-skeleton" aria-busy="true" />}

      {v && (
        <>
          <section className="ov-section" style={{ marginTop: 0 }}>
            <h2>
              What it reads <span className="ov-count">{found} of {v.files.length} found</span>
            </h2>
            <ul className="files">
              {v.files.map((f) => (
                <li key={f.key} className={f.found ? '' : 'missing'} title={f.path ?? undefined} data-testid={`engine-file-${f.key}`}>
                  <div className="top">
                    <span className="label">{f.label}</span>
                    <span className="state">{f.found ? (f.fact ?? 'Found') : 'Not set up'}</span>
                  </div>
                  <span className="what">{f.what}</span>
                  {f.updatedAt && <span className="meta">Updated {niceDate(f.updatedAt)}</span>}
                </li>
              ))}
            </ul>
            {found === 0 && (
              <p className="muted">
                Nothing here yet. Write a script once and set your voice in Scripts; the writer still works from the rules below meanwhile.
              </p>
            )}
          </section>

          <section className="ov-section">
            <h2>
              Skills behind every script <span className="ov-count">{v.skillFolders.length} installed on this computer</span>
            </h2>
            <p className="ov-lede" style={{ marginTop: 0 }}>
              Every rule the writer follows comes from one of these. A mark means it shapes that stage. Open a row to see its rules and where the app applies
              them.
            </p>
            <SkillsMap folders={v.skillFolders} />
            <p className="muted-sm">
              Motion cards are {v.motionCards ? 'on' : 'off'}:{' '}
              <button className="link inline" onClick={() => go({ name: 'settings' })}>
                change in Settings
              </button>
            </p>
          </section>

          <section className="ov-section">
            <h2>
              Templates and what they're based on <span className="ov-count">{v.templates.length}</span>
            </h2>
            <ul className="tpl-list">
              {v.templates.map((t) => (
                <li key={t.id} className={t.active ? 'active' : ''} data-testid={`engine-template-${t.id}`}>
                  <span className="rank" title={t.rank ? `Place ${t.rank.place} in rankings.md, scored ${t.rank.score} out of 10` : 'Not in the traction ranking'}>
                    {t.rank ? `#${t.rank.place}` : '–'}
                  </span>
                  <span className="body">
                    <span className="top">
                      <span className="name">{t.name}</span>
                      {t.active && <span className="tag">Picked</span>}
                      {t.rank && <span className="tpl-score">{t.rank.score}/10 online</span>}
                    </span>
                    <span className="from">{t.basis ? t.basis.from : 'Your own template'}</span>
                    {t.basis && t.basis.sources.length > 0 && (
                      <span className="basis">
                        {t.basis.sources.map((id) => (
                          <span key={id} className="tag-chip">{sourceById(id)?.name ?? id}</span>
                        ))}
                        <span className="tag-chip quiet">+ the 3 writing skills</span>
                      </span>
                    )}
                  </span>
                  <span className="beats">{t.beats} beats</span>
                </li>
              ))}
            </ul>
          </section>

          {v.concepts.length > 0 && (
            <section className="ov-section">
              <h2>
                Concepts that work in your niche <span className="ov-count">{v.concepts.length}</span>
              </h2>
              <ul className="rules">
                {v.concepts.map((c) => (
                  <li key={c}>
                    <Icon name="sparkles" size={15} />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {v.styleRules.length > 0 && (
            <section className="ov-section">
              <h2>
                Your style rules <span className="ov-count">{v.styleRules.length}</span>
              </h2>
              <ul className="rules">
                {v.styleRules.map((r) => (
                  <li key={r}>
                    <Icon name="check" size={15} stroke={2} />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="ov-section">
            <h2>
              What your scripts used <span className="ov-count">{v.scripts.length ? `newest ${v.scripts.length}` : ''}</span>
            </h2>
            {v.scripts.length === 0 ? (
              <p className="muted">No scripts yet. Write one in Scripts and it shows here with the hook shape, concept and template it used.</p>
            ) : (
              <table className="ov-table">
                <thead>
                  <tr><th>Hook</th><th>Hook shape</th><th>Concept</th><th>Best template</th><th>Skills used</th><th>AI phrases left</th></tr>
                </thead>
                <tbody>
                  {v.scripts.map((s) => {
                    const isOpen = openScript === s.id
                    const skills = new Set(s.used.map((u) => u.source)).size
                    return (
                      <Fragment key={s.id}>
                        <tr className={`clickable${isOpen ? ' open' : ''}`} onClick={() => setOpenScript(isOpen ? null : s.id)} data-testid="engine-script">
                          <td className="clip-text" title={s.hook}>
                            <button className="row-toggle" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); setOpenScript(isOpen ? null : s.id) }}>
                              <Icon name="chevron" size={11} />
                              <span>{s.hook}</span>
                            </button>
                          </td>
                          <td>{s.formula || <span className="muted-sm">None</span>}</td>
                          <td className="clip-text">{s.concept || <span className="muted-sm">None</span>}</td>
                          <td>{s.template ?? <span className="muted-sm">None</span>}</td>
                          <td>{skills ? `${skills} ${skills === 1 ? 'skill' : 'skills'}` : <span className="muted-sm">Not recorded</span>}</td>
                          <td className={s.slop ? 'num' : ''}>{s.slop || 'None'}</td>
                        </tr>
                        {isOpen && (
                          <tr className="used-row" data-testid="engine-script-used">
                            <td colSpan={6}>
                              {s.used.length === 0 ? (
                                <span className="muted-sm">Written before the app recorded this.</span>
                              ) : (
                                <ol className="used">
                                  {s.used.map((u, k) => (
                                    <li key={k}>
                                      <span className="used-stage">{STAGES.find((x) => x.id === u.stage)?.label}</span>
                                      <span className="src">{sourceById(u.source)?.name ?? u.source}</span>
                                      <span>{u.what}</span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  )
}
