import { useEffect, useState } from 'react'
import type { AppInfo } from '../../../shared/api'
import { UPDATE_CHECK_ON, UPDATE_PAGE_URL } from '../../../shared/config'
import { reel, userMessage } from '../api'
import type { Go } from '../nav'
import { ConnectAI, DevProviders, ModelDownload, usingLine } from '../components/connect'
import { FOLDER_APP } from '../components/ui'
import { Icon } from '../components/icons'
import { YourLook } from '../components/YourLook'
import { useNotify } from '../App'
import { loadTheme, saveTheme, type ThemeChoice } from '../theme'

const THEMES: { key: ThemeChoice; label: string }[] = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'system', label: 'Match system' }
]

export function Settings({ info, onInfo }: { info: AppInfo; onInfo: (i: AppInfo) => void; go?: Go }) {
  const notify = useNotify()
  const [checkUpdates, setCheckUpdates] = useState<boolean | null>(null)
  const [storyboardFirst, setStoryboardFirst] = useState(false)
  const [motionCards, setMotionCards] = useState(true)
  const [theme, setTheme] = useState<ThemeChoice>('dark')
  useEffect(() => {
    loadTheme().then(setTheme).catch(() => {})
  }, [])
  useEffect(() => {
    reel.storyboard.enabled().then(setStoryboardFirst).catch(() => {})
    reel.motion.enabled().then(setMotionCards).catch(() => {})
  }, [])
  useEffect(() => {
    reel.update
      .status()
      .then((st) => setCheckUpdates(st.enabled))
      .catch(() => {})
  }, [])
  const toggleUpdates = async (on: boolean) => {
    setCheckUpdates(on)
    try {
      setCheckUpdates((await reel.update.setEnabled(on)).enabled)
    } catch (e) {
      setCheckUpdates(!on)
      notify(userMessage(e), 'error')
    }
  }

  const change = async () => {
    const p = await reel.app.chooseFolder()
    if (!p) return
    try {
      onInfo(await reel.app.setRoot(p))
      notify('New videos will be kept there. Your old videos stay where they were.')
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <section className="panel">
        <h2>Your AI editor</h2>
        <p className="muted" style={{ margin: '6px 0 14px' }}>
          It picks your best takes, adds pictures that match what you say, and changes your video from your notes.
        </p>
        <ConnectAI onConnected={(p) => notify(usingLine(p))} />
      </section>

      <section className="panel">
        <h2>Appearance</h2>
        <div className="seg" role="radiogroup" aria-label="Appearance" style={{ marginTop: 12 }} data-testid="theme">
          {THEMES.map((t) => (
            <button
              key={t.key}
              role="radio"
              aria-checked={theme === t.key}
              className={theme === t.key ? 'on' : ''}
              onClick={() =>
                void saveTheme(t.key)
                  .then(setTheme)
                  .catch((err) => notify(userMessage(err), 'error'))
              }
              data-testid={`theme-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="muted-sm" style={{ marginTop: 8 }}>Dark is easiest on the eyes when you judge footage.</p>
      </section>

      <YourLook />

      <section className="panel">
        <h2>Motion cards</h2>
        <label className="check-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={motionCards}
            onChange={(e) => {
              const on = e.target.checked
              setMotionCards(on)
              void reel.motion
                .setEnabled(on)
                .then(setMotionCards)
                .catch((err) => {
                  setMotionCards(!on)
                  notify(userMessage(err), 'error')
                })
            }}
            data-testid="motion-cards"
          />
          Add animated cards on their own
        </label>
        <p className="muted-sm">
          The AI puts a card on your numbers, your lists, your strongest lines and anything you describe typing, in your
          brand colours. Honest moments and your intro stay on your face. Turn it off for fewer cards.
        </p>
      </section>

      <section className="panel">
        <h2>Storyboard first</h2>
        <label className="check-row" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={storyboardFirst}
            onChange={(e) =>
              void reel.storyboard
                .setEnabled(e.target.checked)
                .then(setStoryboardFirst)
                .catch((err) => notify(userMessage(err), 'error'))
            }
            data-testid="storyboard-first"
          />
          Show me the scenes to approve before the final video
        </label>
        <p className="muted-sm">The first edit stops at a quick preview. Change anything in the notes, then press Make the final video.</p>
      </section>

      <section className="panel">
        <h2>Listening model</h2>
        <p className="muted" style={{ margin: '6px 0 12px' }}>
          Turns your voice into words. About 500 MB, one time only.
        </p>
        <ModelDownload secondary />
      </section>

      <section className="panel">
        <h2>Where your videos are kept</h2>
        <p className="folder-line" title={info.root} data-testid="root-display">
          <Icon name="folder" /> {info.rootDisplay}
        </p>
        <div className="row">
          <button className="btn" onClick={() => reel.app.openFolder(info.root)}>
            Show in {FOLDER_APP}
          </button>
          <button className="btn ghost" onClick={change}>
            Change…
          </button>
        </div>
      </section>

      {info.dev && (
        <section className="panel">
          <h2>Developer: AI provider</h2>
          <p className="muted-sm" style={{ margin: '6px 0 12px' }}>Shown because REELSTUDIO_DEV=1.</p>
          <DevProviders />
        </section>
      )}

      <section className="panel">
        <h2>About</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Matcha Momentum Generator {info.version}. Open source (MIT). No accounts, no tracking.
        </p>
        {UPDATE_CHECK_ON && checkUpdates !== null && (
          <>
            <label className="toggle" style={{ marginTop: 12 }}>
              <input type="checkbox" checked={checkUpdates} onChange={(e) => void toggleUpdates(e.target.checked)} data-testid="check-updates" />
              Check for updates
            </label>
            <p className="muted-sm" style={{ margin: '2px 0 0 30px' }}>
              Once a day, Matcha Momentum Generator asks its update server if there is a newer version. Nothing about you or your videos is sent.
            </p>
          </>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          {/* Opens the site's download page in the browser (window open handler). The automatic check is main/update-check.ts. */}
          <a className="btn ghost" href={UPDATE_PAGE_URL} target="_blank" rel="noreferrer">
            <Icon name="external" size={16} /> Get a newer version
          </a>
        </div>
        {info.engine.mode === 'fake' && (
          <p className="muted-sm" style={{ marginTop: 6 }}>
            Test engine in use.
          </p>
        )}
      </section>
    </div>
  )
}
