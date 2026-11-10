import { useCallback, useEffect, useState } from 'react'
import type { HealthCheck, HealthView } from '../../../shared/overview'
import { reel, userMessage } from '../api'
import { Icon } from '../components/icons'
import './Overview.css'

const GROUPS: HealthCheck['group'][] = ['Video engine', 'AI editor', 'Listening model', 'Posting', 'App']

export function Health() {
  const [v, setV] = useState<HealthView | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(() => {
    setBusy(true)
    setError(null)
    reel.overview
      .health()
      .then(setV, (e) => setError(userMessage(e)))
      .finally(() => setBusy(false))
  }, [])
  useEffect(check, [check])

  const failing = v?.checks.filter((c) => !c.ok).length ?? 0

  return (
    <div className="page ov narrow" data-testid="health">
      <div className="page-head">
        <div>
          <h1>System health</h1>
          {v && (
            <p className={`ov-lede health-sum ${failing ? 'bad' : 'ok'}`} data-testid="health-summary">
              {failing ? `${failing} ${failing === 1 ? 'thing needs' : 'things need'} you` : 'Everything is working'}
            </p>
          )}
        </div>
        <button className="btn" onClick={check} disabled={busy} data-testid="health-recheck">
          {busy ? <span className="spin" /> : null}
          {busy ? 'Checking' : 'Check again'}
        </button>
      </div>

      {error && <div className="banner error"><span>{error}</span></div>}
      {!v && !error && <div className="ov-skeleton" aria-busy="true" />}

      {v && (
        <div className="health-groups">
          {GROUPS.map((g) => {
            const rows = v.checks.filter((c) => c.group === g)
            if (!rows.length) return null
            return (
              <section key={g} className="health-group">
                <h3>{g}</h3>
                <ul className="health-list">
                  {rows.map((c, k) => (
                    <li key={c.name + k} className={c.ok ? 'ok' : 'bad'} data-testid="health-check">
                      <span className="mark">
                        <Icon name={c.ok ? 'check' : 'x'} size={12} stroke={2.5} />
                        <span className="sr-only">{c.ok ? 'Working' : 'Needs you'}</span>
                      </span>
                      <span className="name">{c.name}</span>
                      <span>
                        <span className="detail">{c.detail}</span>
                        {!c.ok && c.fix && <div className="fix">{c.fix}</div>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
