import { useCallback, useEffect, useState } from 'react'
import type { PublishStatus } from '../../../shared/api'
import { reel, userMessage } from '../api'
import type { Go } from '../nav'
import { Spinner } from '../components/ui'
import { Icon } from '../components/icons'

function Setup({ status, onCheck }: { status: PublishStatus; onCheck: () => void }) {
  const missing = status.state === 'missing'
  if (status.state === 'no-subscription') {
    return (
      <section className="panel stack" data-testid="publish-setup">
        <h2>Your Postiz account needs a plan</h2>
        <p className="muted">You are signed in, but Postiz says this account has no subscription. Start one at postiz.com, then check again. Until then you can export your video and post it yourself.</p>
        <div>
          <button className="btn" onClick={onCheck} data-testid="publish-recheck">
            Check again
          </button>
        </div>
      </section>
    )
  }
  return (
    <section className="panel stack" data-testid="publish-setup">
      <h2>{missing ? 'Add Postiz to post from here' : 'Sign in to Postiz'}</h2>
      <p className="muted">Postiz is a separate program that posts to your accounts. Your login stays with it. Run this in a terminal, then check again.</p>
      <p className="copy-box">{missing ? 'npm install -g postiz\npostiz auth:login' : 'postiz auth:login'}</p>
      <div>
        <button className="btn" onClick={onCheck} data-testid="publish-recheck">
          Check again
        </button>
      </div>
    </section>
  )
}

export function Publish({ go, slug }: { go: Go; slug: string }) {
  const [status, setStatus] = useState<PublishStatus | null>(null)
  const [caption, setCaption] = useState('')
  const [chosen, setChosen] = useState<readonly string[]>([])
  const [mode, setMode] = useState<'draft' | 'schedule'>('draft')
  const [at, setAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const check = useCallback(() => {
    reel.publish.status().then(setStatus).catch((e) => setError(userMessage(e)))
  }, [])
  useEffect(() => {
    check()
    reel.projects
      .get(slug)
      .then((d) => {
        const post = d.project.post
        setCaption([post?.caption, post?.hashtags?.join(' ')].filter(Boolean).join('\n\n'))
      })
      .catch(() => {})
  }, [slug, check])

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  const needsTime = mode === 'schedule' && !at
  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      const when = mode === 'draft' ? 'draft' : new Date(at).toISOString()
      const r = await reel.publish.send(slug, { caption, channelIds: [...chosen], when })
      const names = r.channels.join(', ')
      if (r.failed) {
        // Those accounts have it: untick them, so trying again cannot post to them twice.
        setChosen((c) => c.filter((id) => !r.sentIds.includes(id)))
        setError(`This went to ${names}. ${r.failed}`)
      } else {
        setDone(mode === 'draft' ? `Saved as a draft in Postiz for ${names}. Nothing is live yet.` : `Scheduled for ${names}.`)
      }
    } catch (e) {
      setError(userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page narrow">
      <button className="back" onClick={() => go({ name: 'reel', slug })}>
        <Icon name="back" size={16} /> Back to this video
      </button>
      <div className="page-head">
        <div>
          <h1>Post it</h1>
          <p className="muted">Send this video to your accounts through Postiz.</p>
        </div>
      </div>
      {!status && !error && <Spinner />}
      {status && status.state !== 'ready' && <Setup status={status} onCheck={check} />}
      {status?.state === 'ready' && status.channels.length === 0 && (
        <section className="panel stack">
          <p className="muted">Postiz has no accounts connected yet. Connect them in Postiz, then check again.</p>
          <div>
            <button className="btn" onClick={check}>
              Check again
            </button>
          </div>
        </section>
      )}
      {status?.state === 'ready' && status.channels.length > 0 && !done && (
        <section className="panel stack" data-testid="publish-form">
          <fieldset className="plain">
            <legend className="field-label">Where</legend>
            {status.channels.map((c) => (
              <label className="check-row" key={c.id}>
                <input type="checkbox" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name} <span className="muted-sm">{c.identifier}</span>
              </label>
            ))}
          </fieldset>
          <label className="field-label" htmlFor="publish-caption">
            Caption
          </label>
          <textarea id="publish-caption" className="textarea" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <fieldset className="plain">
            <legend className="field-label">When</legend>
            <label className="check-row">
              <input type="radio" name="when" checked={mode === 'draft'} onChange={() => setMode('draft')} /> Save as a draft to review in Postiz
            </label>
            <label className="check-row">
              <input type="radio" name="when" checked={mode === 'schedule'} onChange={() => setMode('schedule')} data-testid="publish-schedule" /> Schedule it to go live
            </label>
            {mode === 'schedule' && <input type="datetime-local" className="input" aria-label="Date and time" value={at} onChange={(e) => setAt(e.target.value)} />}
          </fieldset>
          <div>
            <button className="btn primary big" onClick={() => void send()} disabled={busy || chosen.length === 0 || needsTime} data-testid="publish-send">
              {busy && <Spinner />} {mode === 'draft' ? 'Save draft' : 'Schedule post'}
            </button>
          </div>
        </section>
      )}
      {error && (
        <div className="banner error" role="alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      {done && (
        <p className="banner" role="status" data-testid="publish-done">
          {done}
        </p>
      )}
    </div>
  )
}
