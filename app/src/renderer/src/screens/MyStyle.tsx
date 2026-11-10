import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import type { StyleRule } from '../../../shared/api'
import { MAX_RULE_LENGTH, STARTER_RULES } from '../../../shared/style'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'

const SAME = (a: string, b: string): boolean => a.trim().replace(/[.!?]+$/, '').toLowerCase() === b.trim().replace(/[.!?]+$/, '').toLowerCase()

/** Enter saves, Shift+Enter is a new line, Escape cancels. */
function keys(onSave: () => void, onCancel?: () => void) {
  return (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSave()
    } else if (e.key === 'Escape' && onCancel) {
      e.preventDefault()
      onCancel()
    }
  }
}

interface RuleRowProps {
  rule: StyleRule
  onSaved: () => Promise<void>
}

function RuleRow({ rule, onSaved }: RuleRowProps) {
  const notify = useNotify()
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (draft === null || !draft.trim() || busy) return
    if (draft.trim() === rule.text) return setDraft(null)
    setBusy(true)
    try {
      await reel.style.update(rule.id, draft)
      setDraft(null)
      await onSaved()
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    try {
      await reel.style.remove(rule.id)
      await onSaved()
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }

  if (draft !== null) {
    return (
      <div className="list-item stack" style={{ alignItems: 'stretch' }} data-testid="style-rule-editing">
        <textarea
          className="textarea"
          style={{ minHeight: 64 }}
          value={draft}
          maxLength={MAX_RULE_LENGTH}
          autoFocus
          aria-label="Rule"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={keys(() => void save(), () => setDraft(null))}
          data-testid="style-rule-input"
        />
        <div className="row">
          <button className="btn small" onClick={() => void save()} disabled={busy || !draft.trim()} data-testid="style-rule-save">
            Save
          </button>
          <button className="btn small ghost" onClick={() => setDraft(null)} disabled={busy}>
            Cancel
          </button>
          <span className="spacer" />
          <span className="muted-sm">Enter to save, Esc to cancel</span>
        </div>
      </div>
    )
  }
  return (
    <div className="list-item" data-testid="style-rule">
      <span style={{ fontSize: 16 }}>{rule.text}</span>
      <span className="spacer" />
      <button className="btn small ghost" onClick={() => setDraft(rule.text)} aria-label={`Edit: ${rule.text}`} data-testid="style-rule-edit">
        Edit
      </button>
      <button className="btn small ghost danger" onClick={() => void remove()} aria-label={`Remove: ${rule.text}`}>
        Remove
      </button>
    </div>
  )
}

export function MyStyle() {
  const notify = useNotify()
  const [rules, setRules] = useState<StyleRule[] | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => reel.style.rules().then(setRules).catch((e) => notify(userMessage(e), 'error')), [notify])
  useEffect(() => {
    void load()
  }, [load])

  const add = async (text: string) => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await reel.style.add(text)
      setDraft('')
      await load()
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const ideas = STARTER_RULES.filter((s) => !rules?.some((r) => SAME(r.text, s)))

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>My style</h1>
          <p className="muted">Things I do on every video. Write them the way you'd tell an editor.</p>
        </div>
      </div>

      <section className="panel stack" aria-labelledby="add-rule">
        <h2 id="add-rule">Add a rule</h2>
        <textarea
          className="textarea"
          style={{ minHeight: 64 }}
          placeholder="Like: keep the first cut under two seconds"
          value={draft}
          maxLength={MAX_RULE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={keys(() => void add(draft))}
          aria-label="New rule"
          data-testid="style-add-input"
        />
        <div className="row">
          <button className="btn" onClick={() => void add(draft)} disabled={busy || !draft.trim()} data-testid="style-add">
            Add to my style
          </button>
          <span className="spacer" />
          <span className="muted-sm">One habit per rule. I'll also add one when a note says "always" or "from now on".</span>
        </div>
        {rules && rules.length < 3 && ideas.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="muted-sm">Or start with one of these:</span>
            <div className="row wrap" style={{ gap: 8 }}>
              {ideas.map((s) => (
                <button key={s} className="chip" onClick={() => void add(s)} disabled={busy} data-testid="style-idea">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {rules && rules.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No rules yet. Videos use my own judgement until you add one.</p>}
      {rules && rules.length > 0 && (
        <h2 style={{ marginTop: 28, marginBottom: 10 }}>
          Your rules <span className="muted-sm">({rules.length})</span>
        </h2>
      )}
      <div className="list">
        {rules?.map((r) => <RuleRow key={r.id} rule={r} onSaved={load} />)}
      </div>
    </div>
  )
}
