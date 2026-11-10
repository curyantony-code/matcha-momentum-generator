import { useEffect, useState } from 'react'
import type { RepurposeResult } from '../../../shared/api'
import { reel, userMessage } from '../api'
import type { Go } from '../nav'
import { Spinner } from '../components/ui'
import { Icon } from '../components/icons'
import { useNotify } from '../App'

function Block({ title, text, onCopy, children }: { title: string; text: string; onCopy: (t: string) => void; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="row">
        <h2>{title}</h2>
        <span className="spacer" />
        <button className="btn small" onClick={() => onCopy(text)}>
          Copy
        </button>
      </div>
      {children}
    </section>
  )
}

export function Repurpose({ go, slug }: { go: Go; slug: string }) {
  const notify = useNotify()
  const [result, setResult] = useState<RepurposeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    reel.repurpose.load(slug).then(setResult).catch(() => {})
  }, [slug])

  const make = async () => {
    setBusy(true)
    setError(null)
    try {
      setResult(await reel.repurpose.make(slug))
    } catch (e) {
      setError(userMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const copy = async (t: string) => {
    await reel.app.copyText(t)
    notify('Copied.')
  }

  return (
    <div className="page narrow">
      <button className="back" onClick={() => go({ name: 'reel', slug })}>
        <Icon name="back" size={16} /> Back to this video
      </button>
      <div className="page-head">
        <div>
          <h1>Turn into other posts</h1>
          <p className="muted">A carousel, a thread and a newsletter, from what you said in this video.</p>
        </div>
      </div>
      <button className={`btn big${result ? '' : ' primary'}`} onClick={() => void make()} disabled={busy} data-testid="make-repurpose">
        {busy && <Spinner />} {result ? 'Write them again' : 'Write my posts'}
      </button>
      {error && (
        <div className="banner error" role="alert" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}
      {result && (
        <div data-testid="repurpose-result">
          <Block title="Carousel" text={result.carousel.map((s) => `${s.title}\n${s.body}`).join('\n\n')} onCopy={copy}>
            <ol className="slide-list">
              {result.carousel.map((s, i) => (
                <li key={i}>
                  <strong>{s.title}</strong>
                  <span>{s.body}</span>
                </li>
              ))}
            </ol>
          </Block>
          <Block title="Thread" text={result.thread.join('\n\n')} onCopy={copy}>
            {result.thread.map((p, i) => (
              <p className="copy-box" style={{ marginTop: 10 }} key={i}>
                {p}
              </p>
            ))}
          </Block>
          <Block title="Newsletter" text={`${result.newsletter.subject}\n\n${result.newsletter.body}`} onCopy={copy}>
            <p style={{ marginTop: 10 }}>
              <strong>{result.newsletter.subject}</strong>
            </p>
            <p className="copy-box" style={{ marginTop: 10 }}>
              {result.newsletter.body}
            </p>
          </Block>
        </div>
      )}
    </div>
  )
}
