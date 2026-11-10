import { Fragment, useState } from 'react'
import { SOURCES, STAGES, installedFolder, type Source } from '../../../shared/skills'
import { Icon } from '../components/icons'

const KIND_LABEL: Record<Source['kind'], string> = { skill: 'Skills', yours: 'Yours', research: 'Research' }
const KINDS: Source['kind'][] = ['skill', 'yours', 'research']

/** Which source shapes which stage of a script: a row per source, a column per stage, a mark where it is used. */
export function SkillsMap({ folders }: { folders: string[] }) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="skills-map" role="table" aria-label="Which skill shapes which stage of a script" data-testid="skills-map">
      <div className="sm-row sm-head" role="row">
        <span role="columnheader">Source</span>
        {STAGES.map((s) => (
          <span key={s.id} role="columnheader" className="sm-stage">{s.label}</span>
        ))}
      </div>
      {KINDS.map((kind) => (
        <Fragment key={kind}>
          <div className="sm-kind" role="row"><span role="cell">{KIND_LABEL[kind]}</span></div>
          {SOURCES.filter((s) => s.kind === kind).map((s) => {
            const folder = installedFolder(s, folders)
            const missing = s.kind === 'skill' && !folder
            const isOpen = open === s.id
            return (
              <Fragment key={s.id}>
                <div className={`sm-row${isOpen ? ' open' : ''}${missing ? ' missing' : ''}`} role="row" data-testid={`skill-${s.id}`}>
                  <span role="rowheader" className="sm-name-cell">
                  <button className="sm-name" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                    <Icon name="chevron" size={12} />
                    <span>
                      <span className="n">{s.name}</span>
                      {s.kind === 'skill' && <span className="state">{folder ? 'Installed' : 'Not installed'}</span>}
                    </span>
                  </button>
                  </span>
                  {STAGES.map((st) => {
                    const n = s.uses.filter((u) => u.stage === st.id).length
                    return (
                      <span key={st.id} role="cell" className="sm-cell">
                        {n > 0 && <span className="sm-dot" aria-hidden />}
                        <span className="sr-only">{n ? `${st.label}: used` : `${st.label}: not used`}</span>
                      </span>
                    )
                  })}
                </div>
                {isOpen && (
                  <div className="sm-detail" role="row">
                    <div role="cell">
                      <p className="what">{s.what}{folder && folder !== s.folder ? ` Installed as ${folder}.` : ''}</p>
                      <ul>
                        {s.uses.map((u) => (
                          <li key={u.rule}>
                            <span className="sm-stage-label">{STAGES.find((x) => x.id === u.stage)!.label}</span>
                            <span>{u.rule}</span>
                            <span className="where">{u.where}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </Fragment>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}
