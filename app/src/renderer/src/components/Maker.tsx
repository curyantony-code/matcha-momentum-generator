import { useEffect, useState } from 'react'
import type { MakerTool } from '../../../shared/api'
import { reel, userMessage } from '../api'
import { Spinner } from './ui'

const costLabel = (cost: number | null): string =>
  cost === null ? 'cost not stated' : cost === 0 ? 'free' : `about $${cost.toFixed(2)}`

/** Generated clips and pictures. Shows nothing unless the OpenMontage bridge is set up. */
export function Maker({ onMade }: { onMade: (text: string) => void }) {
  const [tools, setTools] = useState<MakerTool[] | null>(null)
  const [installed, setInstalled] = useState(false)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    reel.maker
      .tools()
      .then((r) => {
        setInstalled(r.installed)
        setTools(r.tools)
        setName(r.tools[0]?.name ?? '')
      })
      .catch(() => setTools([]))
  }, [])

  if (!tools || !installed) return null
  if (!tools.length) {
    return (
      <section className="panel" data-testid="maker-empty" style={{ marginBottom: 16 }}>
        <h2>Make a clip with AI</h2>
        <p className="muted">OpenMontage is set up, but no generator is ready. Add a provider key to its .env file.</p>
      </section>
    )
  }

  const tool = tools.find((t) => t.name === name) ?? tools[0]
  const costs = tool.costUsd !== 0
  const make = async () => {
    setBusy(true)
    setError(null)
    try {
      await reel.maker.make({ tool: tool.name, prompt, agreedCostUsd: tool.costUsd })
      setPrompt('')
      setAgreed(false)
      onMade('Made it and added it to your Library.')
    } catch (e) {
      setError(userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel stack" data-testid="maker" style={{ marginBottom: 16 }}>
      <h2>Make a clip with AI</h2>
      <label className="field-label" htmlFor="maker-tool">
        Generator
      </label>
      <select
        id="maker-tool"
        className="input"
        value={tool.name}
        onChange={(e) => {
          setName(e.target.value)
          setAgreed(false)
        }}
      >
        {tools.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name} ({costLabel(t.costUsd)})
          </option>
        ))}
      </select>
      <textarea className="textarea" aria-label="What to make" placeholder="What should it show?" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      {costs && (
        <label className="check-row">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="maker-agree" />
          {tool.costUsd === null ? 'This may cost money, and it does not say how much. Go ahead.' : `This will cost ${costLabel(tool.costUsd)} on your provider account.`}
        </label>
      )}
      <div>
        <button className="btn primary" onClick={() => void make()} disabled={busy || !prompt.trim() || (costs && !agreed)} data-testid="maker-make">
          {busy && <Spinner />} Make it
        </button>
      </div>
      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
    </section>
  )
}
