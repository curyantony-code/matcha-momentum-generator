import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrandDoc, BrandEdit, BrandField, BrandItem, BrandList, BrandSection, Placeholder } from '../../../shared/brand-profile'
import { pendingOf, teammateOf } from '../../../shared/brand-profile'
import { KIND_LABEL, profileKind } from '../../../shared/brand-use'
import { errorCode, reel, userMessage } from '../api'
import { useNotify } from '../App'
import './Brands.css'

/** Unsaved values per brand, by 0-based line in its file. */
type Drafts = Record<string, Record<number, string>>

const pendingLabel = (p: Placeholder, teammate: string | null): string => (p === 'you' ? 'To fill' : `For ${teammate ?? 'a teammate'}`)
/** "{{to fill}} @handle" shows as an empty box with "@handle" as the hint, so typing replaces the placeholder. */
const hintOf = (value: string): string => value.replace(/\{\{[^}]*\}\}/g, '').trim()
const shown = (value: string): string => (pendingOf(value) ? '' : value)
const NAMES: Record<string, string> = { tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', instagram: 'Instagram' }
/** "speaks as" → "Speaks as", with platform names spelled their way. */
const labelOf = (key: string): string =>
  key.split(' ').map((w, i) => NAMES[w] ?? (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ')

interface ValueProps {
  value: string
  draft: string | undefined
  label: string
  multiline: boolean
  invalid?: boolean
  onDraft: (v: string) => void
}

function ValueBox({ value, draft, label, multiline, invalid, onDraft }: ValueProps) {
  const pending = pendingOf(value)
  // Still unanswered while the box is empty: keep the colour and the hint even after typing then clearing.
  const open = pending && !draft?.trim() ? pending : null
  const common = {
    className: `${multiline ? 'textarea' : 'input'} brand-value${open ? ` pending-${open}` : ''}${invalid ? ' invalid' : ''}`,
    value: draft ?? shown(value),
    placeholder: pending ? hintOf(value) || pendingLabel(pending, teammateOf(value)) : undefined,
    'aria-invalid': invalid || undefined,
    'aria-label': label,
    onChange: (e: { target: { value: string } }) => onDraft(e.target.value.replace(/[\r\n]+/g, ' '))
  }
  return multiline ? <textarea rows={1} {...common} /> : <input {...common} />
}

interface SectionProps {
  index: number
  section: BrandSection
  /** Who the file's teammate blanks are for. */
  teammate: string | null
  drafts: Record<number, string>
  onDraft: (line: number, v: string) => void
}

function SectionPanel({ index, section, teammate, drafts, onDraft }: SectionProps) {
  const headingId = `brand-sec-${index}`
  const field = (f: BrandField) => (
    <label key={f.line} className="brand-field">
      <span className="field-label">{labelOf(f.key)}</span>
      <ValueBox value={f.value} draft={drafts[f.line]} label={f.key} multiline={f.value.length > 28} onDraft={(v) => onDraft(f.line, v)} />
    </label>
  )
  const item = (it: BrandItem, i: number) => (
    <ValueBox key={it.line} value={it.text} draft={drafts[it.line]} label={`${section.heading} ${i + 1}`} multiline invalid={drafts[it.line] !== undefined && !drafts[it.line]!.trim()} onDraft={(v) => onDraft(it.line, v)} />
  )
  return (
    <section className="panel stack" aria-labelledby={headingId} data-testid="brand-section">
      <div className="row">
        <h2 id={headingId}>{section.heading}</h2>
        {section.pending && <span className={`badge pending-${section.pending}`}>{pendingLabel(section.pending, teammate)}</span>}
      </div>
      {section.fields.length > 0 && <div className="brand-fields">{section.fields.map(field)}</div>}
      {section.items.length > 0 && <div className="stack">{section.items.map(item)}</div>}
    </section>
  )
}

/** The value on each editable line, as the parser read it (one source of truth with what main applies). */
type Original = { value: string; item: boolean }
const originalsOf = (doc: BrandDoc): Map<number, Original> =>
  new Map(
    doc.profile.sections.flatMap((s): [number, Original][] => [
      ...s.fields.map((f): [number, Original] => [f.line, { value: f.value, item: false }]),
      ...s.items.map((it): [number, Original] => [it.line, { value: it.text, item: true }])
    ])
  )

/** Real changes only, and how many rules were emptied (a rule can't be saved empty). */
const editsOf = (doc: BrandDoc, d: Record<number, string>): { edits: BrandEdit[]; emptyRules: number } => {
  const originals = originalsOf(doc)
  const edits = Object.entries(d)
    .map(([line, value]) => ({ line: Number(line), value }))
    .filter((e) => originals.has(e.line) && e.value.trim() !== shown(originals.get(e.line)!.value))
  const emptyRules = edits.filter((e) => originals.get(e.line)!.item && !e.value.trim()).length
  return { edits, emptyRules }
}

interface BrandsProps {
  /** The brand new work is made for (sidebar switch). */
  active: string | null
  onActive: (id: string | null) => void
  /** A brand file was saved: the sidebar switch reloads its names. */
  onSaved: () => void
}

export function Brands({ active, onActive, onSaved }: BrandsProps) {
  const notify = useNotify()
  const [list, setList] = useState<BrandList | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({})
  const [saving, setSaving] = useState(false)
  // Read by load() to open on the brand in use, without reloading the files every time the pick changes.
  const activeRef = useRef(active)
  activeRef.current = active

  const load = useCallback(async () => {
    try {
      const l = await reel.brands.list()
      setList(l)
      setActiveId((id) => (id && l.brands.some((b) => b.id === id) ? id : (l.brands.find((b) => b.id === activeRef.current)?.id ?? l.brands[0]?.id ?? null)))
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }, [notify])
  useEffect(() => void load(), [load])

  const doc = list?.brands.find((b) => b.id === activeId) ?? null
  const mine = (doc && drafts[doc.id]) || {}
  const { edits, emptyRules } = doc ? editsOf(doc, mine) : { edits: [], emptyRules: 0 }

  const setDraft = (line: number, v: string) =>
    doc && setDrafts((d) => ({ ...d, [doc.id]: { ...(d[doc.id] ?? {}), [line]: v } }))
  const discard = () => doc && setDrafts((d) => ({ ...d, [doc.id]: {} }))

  const makeActive = async () => {
    if (!doc) return
    try {
      await reel.brands.setActive(doc.id)
      onActive(doc.id)
      notify(`New scripts and videos are now made for ${doc.profile.title || doc.id}.`, 'info')
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }

  const save = async () => {
    if (!doc || edits.length === 0 || emptyRules > 0 || saving) return
    setSaving(true)
    try {
      const next = await reel.brands.save(doc.id, doc.text, edits)
      setList((l) => l && { ...l, brands: l.brands.map((b) => (b.id === next.id ? next : b)) })
      discard()
      onSaved()
      notify('Saved.', 'info')
    } catch (e) {
      notify(userMessage(e), 'error')
      // Its line numbers may not match the changed file any more: start from the file as it is now.
      if (errorCode(e) === 'BRAND_CHANGED') {
        discard()
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  if (!list) return <div className="page narrow" />
  if (!doc) {
    return (
      <div className="page narrow" data-testid="brands-empty">
        <div className="page-head"><h1>Brands</h1></div>
        <div className="panel stack">
          <p className="muted">No brand profiles yet. Put one file per brand in {list.folder}, starting with “# Brand profile:”.</p>
          <div className="row"><button className="btn small" onClick={() => void reel.brands.reveal('')}>Show the folder</button></div>
        </div>
      </div>
    )
  }

  const { you, teammate } = doc.profile.pending
  const who = doc.profile.teammate ?? 'a teammate'
  return (
    <div className="page narrow" data-testid="brands">
      <div className="page-head">
        <div>
          <h1>Brands</h1>
          <p className="muted">One profile per brand. Its voice, look and rules are what Matcha Momentum Generator follows when you make for it.</p>
        </div>
      </div>
      <div className="row wrap brand-picker" role="group" aria-label="Brand">
        {list.brands.map((b) => (
          <button key={b.id} aria-pressed={b.id === doc.id} className={`chip${b.id === doc.id ? ' active' : ''}`} onClick={() => setActiveId(b.id)} data-testid={`brand-${b.id}`}>
            {b.profile.title || b.id}
            {b.id === active && <span className="brand-in-use"> · in use</span>}
            {Object.keys(drafts[b.id] ?? {}).length > 0 && b.id !== doc.id && <span aria-label="unsaved changes"> •</span>}
          </button>
        ))}
      </div>
      <div className="row brand-summary">
        <span
          className={`brand-kind ${profileKind(doc.profile)}`}
          title={profileKind(doc.profile) === 'company'
            ? 'Scripts speak as the brand ("we"), with the customer\'s problem and the product carrying them. Set with "- kind:" in the profile.'
            : 'Scripts are said by this person, in the first person, from their own story. Set with "- kind:" in the profile.'}
          data-testid="brand-kind"
        >
          {KIND_LABEL[profileKind(doc.profile)]}
        </span>
        <span className="muted-sm" data-testid="brand-pending">
          {you || teammate ? [you && `${you} to fill`, teammate && `${teammate} waiting on ${who}`].filter(Boolean).join(' · ') : 'Everything is filled in.'}
        </span>
        <span className="spacer" />
        {doc.id !== active && (
          <button className="btn small" onClick={() => void makeActive()} data-testid="brand-make-active">
            Make for this brand
          </button>
        )}
        <button className="btn small ghost" onClick={() => void reel.brands.reveal(doc.id)}>Open file</button>
      </div>
      {doc.profile.sections.map((s, i) => (
        <SectionPanel key={`${doc.id}-${i}`} index={i} section={s} teammate={doc.profile.teammate} drafts={mine} onDraft={setDraft} />
      ))}
      {edits.length > 0 && (
        <div className="brand-savebar" role="region" aria-label="Unsaved changes">
          <span>
            {emptyRules > 0
              ? 'A rule can’t be empty: write it again, or delete it with Open file.'
              : `${edits.length === 1 ? '1 change' : `${edits.length} changes`} to ${doc.profile.title || doc.id}`}
          </span>
          <span className="spacer" />
          <button className="btn small ghost" onClick={discard} disabled={saving}>Discard</button>
          <button className="btn small primary" onClick={() => void save()} disabled={saving || emptyRules > 0} data-testid="brand-save">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}
