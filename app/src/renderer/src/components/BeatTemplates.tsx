import { useEffect, useState } from 'react'
import type { ScriptSetup } from '../../../shared/api'
import { MAX_TEMPLATE_NAME } from '../../../shared/beats'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'

interface BeatTemplatesProps {
  setup: ScriptSetup
  onChange: (s: ScriptSetup) => void
}

/** Pick the beats scripts are written in, edit them, and save them as your own. */
export function BeatTemplates({ setup, onChange }: BeatTemplatesProps) {
  const notify = useNotify()
  const active = setup.beatTemplates.find((t) => t.id === setup.beatTemplate) ?? setup.beatTemplates[0]
  const [beats, setBeats] = useState(active?.beats ?? '')
  const [naming, setNaming] = useState<string | null>(null)
  useEffect(() => {
    setBeats(active?.beats ?? '')
    setNaming(null)
  }, [active?.id, active?.beats])
  if (!active) return null
  const dirty = beats.trim() !== active.beats.trim()
  const run = async (fn: () => Promise<ScriptSetup>, done: string) => {
    try {
      onChange(await fn())
      notify(done)
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }
  const builtIns = setup.beatTemplates.filter((t) => t.builtIn)
  const mine = setup.beatTemplates.filter((t) => !t.builtIn)

  return (
    <div className="stack" style={{ gap: 6 }} data-testid="beat-templates">
      <label className="field-label" htmlFor="beat-template">
        Beat template: how your scripts are built
      </label>
      <select
        id="beat-template"
        className="input"
        value={active.id}
        onChange={(e) => void run(() => reel.script.setBeatTemplate(e.target.value), 'Scripts will use these beats.')}
        data-testid="beat-template-picker"
      >
        <optgroup label="Built in">
          {builtIns.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </optgroup>
        {mine.length > 0 && (
          <optgroup label="Mine">
            {mine.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="muted-sm" data-testid="beat-template-hint">
        {active.hint}
      </p>
      <textarea
        className="textarea"
        style={{ minHeight: 190, fontFamily: 'inherit' }}
        aria-label="The beats, one per line"
        value={beats}
        onChange={(e) => setBeats(e.target.value)}
        data-testid="beat-template-beats"
      />
      {naming !== null ? (
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            autoFocus
            maxLength={MAX_TEMPLATE_NAME}
            placeholder="Name it, e.g. My one-take"
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            data-testid="beat-template-name"
          />
          <button
            className="btn primary small"
            disabled={!naming.trim()}
            onClick={() => void run(() => reel.script.saveBeatTemplate({ name: naming, beats, hint: 'My own template.' }), `Saved "${naming.trim()}". Scripts will use it.`)}
            data-testid="beat-template-save-new"
          >
            Save
          </button>
          <button className="btn ghost small" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          {!active.builtIn && dirty && (
            <button
              className="btn primary small"
              onClick={() => void run(() => reel.script.saveBeatTemplate({ id: active.id, name: active.name, beats, hint: active.hint }), 'Saved your changes.')}
              data-testid="beat-template-save"
            >
              Save changes
            </button>
          )}
          <button className="btn small" onClick={() => setNaming(active.builtIn ? `My ${active.name}`.slice(0, MAX_TEMPLATE_NAME) : '')} data-testid="beat-template-save-as">
            {active.builtIn ? 'Customize and save as mine' : 'Save as a new template'}
          </button>
          {dirty && (
            <button className="btn ghost small" onClick={() => setBeats(active.beats)}>
              Undo changes
            </button>
          )}
          {!active.builtIn && (
            <button
              className="btn ghost small"
              onClick={() => void run(() => reel.script.removeBeatTemplate(active.id), `Deleted "${active.name}".`)}
              data-testid="beat-template-delete"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
