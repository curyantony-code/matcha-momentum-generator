import { useEffect, useMemo, useState } from 'react'
import {
  BROWSERS,
  DEFAULT_PER_CREATOR,
  PLATFORMS,
  STATUS_LABEL,
  readPaste,
  type Browser,
  type Platform,
  type StudyCreatorSummary,
  type StudyList,
  type StudyReelSummary
} from '../../../shared/study'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'
import type { Go } from '../nav'
import { Icon } from '../components/icons'
import './Overview.css'
import './Study.css'

const PREFS = 'study:prefs'
const BROWSER_LABEL: Record<Browser, string> = { chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox', edge: 'Edge', brave: 'Brave' }
const PLATFORM_LABEL: Record<Platform, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' }

interface Prefs { handles: Platform; perCreator: number; browser: Browser | null }
function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}') as Partial<Prefs>
    return { handles: p.handles ?? 'tiktok', perCreator: p.perCreator ?? DEFAULT_PER_CREATOR, browser: p.browser ?? null }
  } catch {
    return { handles: 'tiktok', perCreator: DEFAULT_PER_CREATOR, browser: null }
  }
}

const compact = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(n))
const working = (s: StudyReelSummary['status']): boolean => s !== 'done' && s !== 'failed'

export function Study({ go }: { go: Go }) {
  const [list, setList] = useState<StudyList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // a change pushed while the first list loads is newer: the first answer must not overwrite it
    let pushed = false
    const off = reel.study.onChanged((l) => {
      pushed = true
      setList(l)
    })
    reel.study.list().then((l) => !pushed && setList(l), (e) => setError(userMessage(e)))
    return off
  }, [])
  useEffect(() => localStorage.setItem(PREFS, JSON.stringify(prefs)), [prefs])

  const wanted = useMemo(() => readPaste(text, prefs.handles), [text, prefs.handles])
  const videos = wanted.filter((w) => w.kind === 'video').length
  const creators = wanted.filter((w) => w.kind === 'creator')
  const unknown = wanted.filter((w) => w.kind === 'unknown')
  const tiktokCreator = creators.some((c) => c.platform === 'tiktok')

  const add = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setList(await reel.study.add(text, prefs))
      setText('')
    } catch (e) {
      setError(userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const solo = list?.reels.filter((r) => !r.creatorKey) ?? []
  const loginNeeded = list?.reels.some((r) => r.errorCode === 'LOGIN_NEEDED') || list?.creators.some((c) => c.errorCode === 'LOGIN_NEEDED')

  return (
    <div className="page ov study" data-testid="study">
      <div className="page-head">
        <div>
          <h1>Study reels</h1>
          <p className="ov-lede">
            Paste videos or creators. Each one is downloaded, transcribed and measured on this computer, then broken down: the script with timestamps, its
            formula, the edit and why it works. Learn the shape, never the words.
          </p>
        </div>
      </div>

      <section className="study-paste" aria-label="What to study">
        <label className="field-label" htmlFor="study-text">
          Links or @handles, one per line
        </label>
        <textarea
          id="study-text"
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'https://www.instagram.com/reel/…\nhttps://www.tiktok.com/@someone/video/…\nhttps://www.youtube.com/shorts/…\n@creator'}
          rows={5}
          spellCheck={false}
          data-testid="study-text"
        />
        <div className="study-understood" aria-live="polite" aria-atomic="true" data-testid="study-understood">
          {wanted.length === 0 ? (
            <span className="muted-sm">Instagram reels, TikToks and YouTube Shorts. A creator studies their most viewed recent videos.</span>
          ) : (
            <>
              {videos > 0 && <span className="tag-chip">{videos === 1 ? '1 video' : `${videos} videos`}</span>}
              {creators.length > 0 && <span className="tag-chip">{creators.length === 1 ? '1 creator' : `${creators.length} creators`}</span>}
              {unknown.map((u) => (
                <span key={u.kind === 'unknown' ? u.text : ''} className="tag-chip bad" title={u.kind === 'unknown' ? u.why : ''}>
                  Not understood: {u.kind === 'unknown' ? u.text.slice(0, 30) : ''}
                </span>
              ))}
            </>
          )}
        </div>
        {tiktokCreator && (
          <p className="muted-sm study-warn">TikTok often blocks listing a profile. If it does, paste links to their videos instead.</p>
        )}

        <div className="study-options">
          <div className="opt">
            <span className="field-label" id="study-handles-label">@handles are on</span>
            <div className="seg small" role="radiogroup" aria-labelledby="study-handles-label">
              {PLATFORMS.map((p) => (
                <button key={p.id} role="radio" aria-checked={prefs.handles === p.id} className={prefs.handles === p.id ? 'on' : ''} onClick={() => setPrefs({ ...prefs, handles: p.id })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="opt">
            <span className="field-label" id="study-per-label">Videos per creator</span>
            <div className="seg small" role="radiogroup" aria-labelledby="study-per-label">
              {[3, 5, 10].map((n) => (
                <button key={n} role="radio" aria-checked={prefs.perCreator === n} className={prefs.perCreator === n ? 'on' : ''} onClick={() => setPrefs({ ...prefs, perCreator: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="opt">
            <span className="field-label">Use my browser's Instagram login</span>
            <select
              className="input"
              value={prefs.browser ?? ''}
              onChange={(e) => setPrefs({ ...prefs, browser: (e.target.value || null) as Browser | null })}
              data-testid="study-browser"
            >
              <option value="">Off</option>
              {BROWSERS.map((b) => (
                <option key={b} value={b}>
                  {BROWSER_LABEL[b]}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary study-go" onClick={() => void add()} disabled={busy || videos + creators.length === 0} data-testid="study-add">
            {busy ? <span className="spin" /> : <Icon name="study" size={16} />}
            Study {videos + creators.length > 1 ? 'them' : 'it'}
          </button>
        </div>
        {prefs.browser && (
          <p className="muted-sm">
            Only for links that need a login. The app asks {BROWSER_LABEL[prefs.browser]} for its Instagram cookies when downloading, and never stores them.
          </p>
        )}
        {loginNeeded && !prefs.browser && <p className="muted-sm study-warn">Some Instagram videos wanted a login. Pick your browser above, then Try again.</p>}
      </section>

      {error && <div className="banner error"><span>{error}</span></div>}
      {!list && !error && <div className="ov-skeleton" aria-busy="true" />}

      {list && list.creators.length > 0 && (
        <section className="ov-section">
          <h2>
            Creators <span className="ov-count">{list.creators.length}</span>
          </h2>
          {list.creators.map((c) => (
            <CreatorBlock key={c.key} c={c} reels={list.reels.filter((r) => r.creatorKey === c.key)} go={go} />
          ))}
        </section>
      )}

      {list && solo.length > 0 && (
        <section className="ov-section">
          <h2>
            Videos <span className="ov-count">{solo.length}</span>
          </h2>
          <ReelGrid reels={solo} go={go} />
        </section>
      )}

      {list && !list.reels.length && !list.creators.length && (
        <div className="study-empty" data-testid="study-empty">
          <Icon name="study" size={28} />
          <p>Nothing studied yet. Start with a video that did far better than its creator's usual: those teach the most.</p>
        </div>
      )}
    </div>
  )
}

function CreatorBlock({ c, reels, go }: { c: StudyCreatorSummary; reels: StudyReelSummary[]; go: Go }) {
  const notify = useNotify()
  const done = reels.filter((r) => r.status === 'done').length
  const p = c.patterns
  return (
    <article className="creator" data-testid="study-creator">
      <header className="creator-head">
        <div>
          <h3>@{c.handle}</h3>
          <p className="muted-sm">
            {PLATFORM_LABEL[c.platform]}
            {c.medianViews !== null && ` · usually ${compact(c.medianViews)} views`}
            {reels.length > 0 && ` · ${done} of ${reels.length} studied`}
            {c.status === 'listing' && ' · finding their videos'}
          </p>
        </div>
        <div className="row">
          {c.status === 'failed' && (
            <button className="btn small" onClick={() => void reel.study.retry(c.key).catch((e) => notify(userMessage(e)))}>
              Try again
            </button>
          )}
          <button className="btn small ghost" aria-label={`Remove @${c.handle}`} onClick={() => void reel.study.remove(c.key).catch((e) => notify(userMessage(e)))}>
            Remove
          </button>
        </div>
      </header>
      {c.error && <p className="study-error">{c.error}</p>}
      {p && (
        <div className="patterns" data-testid="creator-patterns">
          <p className="signature">{p.signature}</p>
          <dl>
            {(
              [
                ['Hooks', p.hooks],
                ['Structure', p.structure],
                ['Edit', p.edit],
                ['Length', p.length],
                ['Topics', p.topics]
              ] as const
            ).map(([k, v]) =>
              v ? (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ) : null
            )}
          </dl>
          {p.borrow.length > 0 && (
            <div className="borrow">
              <span className="field-label">Borrow</span>
              <ul>
                {p.borrow.map((b, k) => (
                  <li key={k}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {reels.length > 0 && <ReelGrid reels={reels} go={go} />}
    </article>
  )
}

function ReelGrid({ reels, go }: { reels: StudyReelSummary[]; go: Go }) {
  const notify = useNotify()
  const done = reels.filter((r) => r.status === 'done').length
  const failed = reels.filter((r) => r.status === 'failed').length
  return (
    <>
    <p className="sr-only" role="status">
      {`${done} of ${reels.length} studied${failed ? `, ${failed} did not work` : ''}`}
    </p>
    <ul className="study-grid">
      {reels.map((r) => (
        <li key={r.id} className={`study-card ${r.status}`} data-testid="study-reel" data-status={r.status}>
          <button
            className="study-poster"
            onClick={() => go({ name: 'studied', id: r.id })}
            disabled={r.status !== 'done'}
            aria-label={`${r.hook ?? (r.creator ? `@${r.creator}` : 'A video')}, ${STATUS_LABEL[r.status]}${working(r.status) && r.pct > 0 ? ` ${r.pct}%` : ''}${r.vsUsual !== null ? `, ${r.vsUsual}× their usual` : ''}`}
          >
            {r.poster ? <img src={r.poster} alt="" loading="lazy" /> : <span className="poster-blank" />}
            {working(r.status) && (
              <span className="working-overlay">
                <span className="spin" />
                <span>{STATUS_LABEL[r.status]}</span>
                {r.pct > 0 && r.pct < 100 && <span className="pct">{r.pct}%</span>}
              </span>
            )}
            {r.vsUsual !== null && <span className={`vs${r.vsUsual >= 2 ? ' hot' : ''}`}>{r.vsUsual}× usual</span>}
          </button>
          <div className="study-card-body">
            <span className="meta">
              {r.creator ? `@${r.creator}` : PLATFORM_LABEL[r.platform]}
              {r.views !== null && ` · ${compact(r.views)} views`}
            </span>
            {r.formula && <span className="formula">{r.formula}</span>}
            {r.hook && <span className="hook">“{r.hook}”</span>}
            {r.status === 'failed' && (
              <>
                <span className="study-error">{r.error}</span>
                <span className="row">
                  <button className="btn small" onClick={() => void reel.study.retry(r.id).catch((e) => notify(userMessage(e)))}>
                    Try again
                  </button>
                  <button className="btn small ghost" onClick={() => void reel.study.remove(r.id).catch((e) => notify(userMessage(e)))}>
                    Remove
                  </button>
                </span>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
    </>
  )
}
