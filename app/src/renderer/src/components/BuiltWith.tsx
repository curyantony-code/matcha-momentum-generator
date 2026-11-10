import type { SavedScript } from '../../../shared/api'
import { STAGES, skillsUsedBy, sourceById } from '../../../shared/skills'
import './BuiltWith.css'

/** Which skill, file or research shaped this script, stage by stage: only what the writer really returned. */
export function BuiltWith({ script, onOpenEngine }: { script: SavedScript; onOpenEngine?: () => void }) {
  const used = skillsUsedBy(script)
  if (!used.length) return null
  return (
    <div className="built-with" data-testid="built-with">
      <div className="bw-head">
        <span className="field-label">Built with</span>
        {onOpenEngine && (
          <button className="link inline" onClick={onOpenEngine}>
            See every skill
          </button>
        )}
      </div>
      <ol>
        {STAGES.filter((st) => used.some((u) => u.stage === st.id)).map((st) => (
          <li key={st.id}>
            <span className="bw-stage">{st.label}</span>
            <span className="items">
              {used
                .filter((u) => u.stage === st.id)
                .map((u, k) => (
                  <span key={k} className="item">
                    <span className="src">{sourceById(u.source)?.name ?? u.source}</span>
                    <span className="what">{u.what}</span>
                  </span>
                ))}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
