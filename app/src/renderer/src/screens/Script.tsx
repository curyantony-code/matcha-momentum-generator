import { lifeLabel } from '../../../shared/life'
import { useCallback, useEffect, useState } from 'react'
import type { IdeaOption, ProviderInfo, SavedScript, ScriptSetup } from '../../../shared/api'
import { reel, userMessage } from '../api'
import type { Go } from '../nav'
import { Spinner } from '../components/ui'
import { ScriptEditor } from '../components/ScriptEditor'
import { WhatWorks } from '../components/WhatWorks'
import { FormatPicker } from '../components/FormatPicker'
import { BeatTemplates } from '../components/BeatTemplates'
import { useNotify } from '../App'

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path

/** What the generator writes from: the voice file and the format. */
function Setup({ setup, onChange }: { setup: ScriptSetup; onChange: (s: ScriptSetup) => void }) {
  const choose = async () => {
    const next = await reel.script.chooseVoice()
    if (next) onChange(next)
  }
  return (
    <section className="panel stack" data-testid="script-setup">
      <div className="row">
        <div>
          <h2>Your voice</h2>
          <p className="muted-sm" data-testid="voice-file">
            {setup.voiceFound && setup.voicePath
              ? `Writing from ${fileName(setup.voicePath)}: who you are, how you talk, what you can prove.`
              : setup.voicePath
                ? `I can't find ${fileName(setup.voicePath)} any more. Choose it again.`
                : 'No voice file yet, so scripts will sound general. Choose your voice.md.'}
          </p>
        </div>
        <span className="spacer" />
        <button className="btn small" onClick={() => void choose()} data-testid="choose-voice">
          {setup.voicePath ? 'Change' : 'Choose file'}
        </button>
      </div>
      <span className="field-label">What kind of video</span>
      <FormatPicker value={setup.videoFormat} onChange={(f) => void reel.script.setVideoFormat(f).then(onChange)} />
      <p className="muted-sm" data-testid="framework-status">
        {setup.frameworkFound
          ? 'Every script follows your framework (framework.md and brand.md, next to your voice file).'
          : 'No framework.md next to your voice file yet: scripts follow your format only.'}
      </p>
      <p className="muted-sm" data-testid="niche-status">
        {setup.nicheFound
          ? 'Building on what over-performs in your niche (the Concepts in swipe.md, next to your voice file).'
          : 'No niche research yet. Run /studio-script viral in Claude Code to fill swipe.md, and scripts will build on what over-performs in your niche.'}
      </p>
      <BeatTemplates setup={setup} onChange={onChange} />
    </section>
  )
}

export function Script({ go }: { go: Go }) {
  const notify = useNotify()
  const [idea, setIdea] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [setup, setSetup] = useState<ScriptSetup | null>(null)
  const [saved, setSaved] = useState<SavedScript[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [ideas, setIdeas] = useState<IdeaOption[]>([])
  const [provider, setProvider] = useState<ProviderInfo | null>(null)
  const aiOff = !!provider && (!provider.connected || provider.id === 'none')

  const refresh = useCallback(() => reel.script.list().then(setSaved).catch(() => {}), [])
  useEffect(() => {
    reel.ai.active().then(setProvider).catch(() => {})
    reel.script.setup().then(setSetup).catch(() => {})
    void refresh()
  }, [refresh])

  const run = async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(label)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(userMessage(e))
      return null
    } finally {
      setBusy(null)
    }
  }
  const write = async (text: string) => {
    const made = await run(`Writing: ${text}`, () => reel.script.write(text))
    if (!made) return
    await refresh()
    setOpenId(made.id)
    setIdeas((list) => list.filter((i) => i.idea !== text))
  }
  const writeAll = async () => {
    for (const i of ideas) await write(i.idea)
  }
  const suggest = async () => {
    const found = await run('Finding ideas', () => reel.script.ideas())
    if (found) setIdeas(found)
  }
  const open = saved.find((s) => s.id === openId) ?? null

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Scripts</h1>
          <p className="muted">Ideas and scripts in your voice. Rewrite anything, then read it on the teleprompter.</p>
        </div>
      </div>
      {setup && <Setup setup={setup} onChange={setSetup} />}
      <WhatWorks />

      <section className="panel stack">
        <textarea className="textarea" aria-label="Your idea" placeholder="What is your video about? A rough sentence is fine." value={idea} onChange={(e) => setIdea(e.target.value)} />
        <div className="row">
          <button className="btn primary" onClick={() => void write(idea.trim())} disabled={!idea.trim() || !!busy || aiOff} data-testid="write-script">
            Write my script
          </button>
          <button className="btn" onClick={() => void suggest()} disabled={!!busy || aiOff} data-testid="suggest-ideas">
            Suggest ideas
          </button>
          {busy && (
            <span className="muted-sm" data-testid="script-busy">
              <Spinner /> {busy}
            </span>
          )}
        </div>
        {aiOff && (
          <p className="muted-sm" data-testid="script-needs-ai">
            Script help needs an AI editor.{' '}
            <button className="link inline" onClick={() => go({ name: 'connect', back: { name: 'script' } })}>
              Connect one
            </button>
          </p>
        )}
        {error && (
          <div className="banner error" role="alert">
            {error}
          </div>
        )}
      </section>

      {ideas.length > 0 && (
        <section className="panel" data-testid="idea-list">
          <div className="row">
            <h2>Ideas</h2>
            <span className="spacer" />
            <button className="btn small" onClick={() => void writeAll()} disabled={!!busy} data-testid="write-all">
              Write all {ideas.length}
            </button>
          </div>
          <ul className="idea-list">
            {ideas.map((i) => (
              <li key={i.idea}>
                <div>
                  <strong>"{i.hook}"</strong>
                  <span className="muted-sm">{i.idea}</span>
                </div>
                <button className="btn small" onClick={() => void write(i.idea)} disabled={!!busy}>
                  Write it
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && (
        <ScriptEditor
          script={open}
          onSave={async (patch) => {
            await reel.script.update(open.id, patch)
            await refresh()
            notify('Saved.')
          }}
          onTag={(patch) => void reel.script.update(open.id, patch).then(refresh)}
          onCopy={(t) => void reel.app.copyText(t).then(() => notify('Copied.'))}
          onPrompter={() => go({ name: 'teleprompter', scriptId: open.id })}
          onFilmed={() => go({ name: 'new', scriptId: open.id })}
          onOpenEngine={() => go({ name: 'engine' })}
        />
      )}

      {saved.length > 0 && (
        <section className="panel" data-testid="saved-scripts">
          <h2>My scripts</h2>
          <ul className="saved-list">
            {saved.map((s) => (
              <li key={s.id} className={s.id === openId ? 'on' : undefined}>
                <button className="link" onClick={() => setOpenId(s.id)}>
                  {s.day ? `Day ${s.day}: ` : ''}
                  {s.hook || 'Untitled script'}
                </button>
                {lifeLabel(s.theme) && (
                  <span className="muted-sm" data-testid="script-life-tag">
                    {lifeLabel(s.theme)}
                  </span>
                )}
                <button
                  className="btn small ghost"
                  aria-label={`Delete script: ${s.hook}`}
                  onClick={() =>
                    void reel.script.remove(s.id).then(() => {
                      if (openId === s.id) setOpenId(null)
                      return refresh()
                    })
                  }
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
