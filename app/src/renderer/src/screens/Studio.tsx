import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'

interface ExportRow {
  name: string
  path: string
  at: string
}

const when = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The Studio tab: OpenReel Video's editor, drawn by the main process over the area below the header. */
export function Studio() {
  const notify = useNotify()
  const host = useRef<HTMLDivElement>(null)
  const [exports, setExports] = useState<ExportRow[]>([])
  const [showSteps, setShowSteps] = useState(false)

  // Keep the editor exactly over the host area; hide it when the tab closes.
  const place = useCallback(() => {
    const el = host.current
    if (!el) return
    const r = el.getBoundingClientRect()
    void reel.studio.show({ x: r.left, y: r.top, width: r.width, height: r.height }).catch(() => undefined)
  }, [])
  useLayoutEffect(() => {
    const el = host.current
    if (!el) return
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
      void reel.studio.hide().catch(() => undefined)
    }
  }, [place, showSteps])

  useEffect(() => {
    reel.studio.exports().then(setExports).catch(() => setExports([]))
  }, [])

  const reveal = (path: string) => void reel.app.openFolder(path).catch((e) => notify(userMessage(e), 'error'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--titlebar))' }} data-testid="studio">
      <div className="row wrap" style={{ gap: 10, padding: '8px 20px 10px', borderBottom: '1px solid var(--line)' }}>
        <div style={{ marginRight: 'auto' }}>
          <h1 style={{ fontSize: 20 }}>Studio</h1>
          <p className="muted-sm">OpenReel Video, the free open-source editor, for hand-finishing an edit on a timeline.</p>
        </div>
        {exports.length > 0 && (
          <label className="row" style={{ gap: 6 }}>
            <span className="muted-sm">Your edits for OpenReel</span>
            <select
              className="input"
              style={{ minHeight: 34, maxWidth: 260 }}
              value=""
              onChange={(e) => e.target.value && reveal(e.target.value)}
              data-testid="studio-exports"
            >
              <option value="">Show one in Finder</option>
              {exports.map((x) => (
                <option key={x.path} value={x.path}>
                  {x.name} · {when(x.at)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="btn small ghost" onClick={() => setShowSteps((s) => !s)} aria-expanded={showSteps} data-testid="studio-steps-toggle">
          How to bring an edit in
        </button>
        <button className="btn small ghost" onClick={() => void reel.studio.reload()} data-testid="studio-reload">
          Reload
        </button>
        <button className="btn small ghost" onClick={() => void reel.studio.openInBrowser()}>
          Open in browser
        </button>
      </div>
      {showSteps && (
        <ol className="muted-sm" style={{ margin: 0, padding: '10px 20px 10px 40px', borderBottom: '1px solid var(--line)', lineHeight: 1.7 }} data-testid="studio-steps">
          <li>On a video’s page, press “Edit in OpenReel”. Its folder opens in Finder (or pick it above).</li>
          <li>Here, make a new project, portrait 1080 × 1920, and drag in every file from the folder’s “media”.</li>
          <li>Open the AI Editor panel, then “Edit JSON & reusable presets”, and import the .openreel-edit.json file.</li>
          <li>Each cut is its own clip: drag its edges to bring back what was cut. Export from OpenReel when done.</li>
        </ol>
      )}
      <div ref={host} style={{ flex: 1, minHeight: 200, background: '#0F0C12' }} data-testid="studio-host">
        <p className="muted-sm" style={{ padding: 20, color: '#8A8090' }}>
          Loading OpenReel… It needs an internet connection the first time.
        </p>
      </div>
    </div>
  )
}
