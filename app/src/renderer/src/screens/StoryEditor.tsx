import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StoryProgress } from '../../../shared/api'
import type { Scene, SceneParams, Story, StoryAssets, StoryLine, StoryPalette, StoryTiming, StoryVoice } from '../../../shared/story'
import { MAX_LINES, WORLDS } from '../../../shared/story'
import { checkStory, estimateTiming, isVoiceCurrent, sceneTimes } from '../../../shared/story-logic'
import { storyHtml } from '../../../shared/story-render'
import { useDebounced } from '../hooks/useDebounced'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'
import { EMPTY_STORY_ASSETS, StoryPlayer } from '../components/StoryPlayer'
import { StoryLines } from './StoryLines'
import { StoryVoicePanel } from './StoryVoice'
import { StoryCaption, StoryWriter } from './StoryWriter'

const SAVE_DELAY_MS = 500
/** The preview redraws once typing pauses this long: each redraw is a new frame with the fonts inlined. */
const PREVIEW_DELAY_MS = 250
const PALETTES: { id: StoryPalette; label: string }[] = [
  { id: 'brand', label: 'Brand colours' },
  { id: 'mono', label: 'Paper and ink' }
]
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const imageKey = (s: Story): string =>
  s.lines.map((l) => `${l.scene.params.image ?? ''}|${l.scene.params.art ?? ''}`).join('\n')

/** A world that differs from the one before and after, for a line added between them. */
function freshWorld(lines: StoryLine[], at: number): Scene['world'] {
  const near = [lines[at - 1]?.scene.world, lines[at]?.scene.world]
  return WORLDS.find((w) => !near.includes(w)) ?? 'paper'
}

export function StoryEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const notify = useNotify()
  const [s, setS] = useState<Story | null>(null)
  const [assets, setAssets] = useState<StoryAssets>(EMPTY_STORY_ASSETS)
  const [timing, setTiming] = useState<StoryTiming | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const [jump, setJump] = useState<{ t: number; n: number }>({ t: 0, n: 0 })
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saveError, setSaveError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportJob, setExportJob] = useState<StoryProgress | null>(null)
  const [exported, setExported] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const latest = useRef<Story | null>(null)
  latest.current = s
  /** What is on disk: the story as last saved (or loaded). Anything else is unsaved. */
  const saved = useRef<Story | null>(null)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const deleted = useRef(false)
  const assetsKey = useRef('')

  const loadMedia = useCallback(async (): Promise<void> => {
    const [t, a] = await Promise.all([reel.stories.timing(id), reel.stories.audioUrl(id)])
    setTiming(t)
    setAudioUrl(t ? a : null)
  }, [id])

  useEffect(() => {
    let live = true
    Promise.all([reel.stories.list(), reel.stories.assets(id), reel.stories.timing(id), reel.stories.audioUrl(id)])
      .then(([all, a, t, url]) => {
        if (!live) return
        const found = all.find((x) => x.id === id) ?? null
        saved.current = found
        assetsKey.current = found ? imageKey(found) : ''
        setS(found)
        setAssets(a)
        setTiming(t)
        setAudioUrl(t ? url : null)
        setLoaded(true)
      })
      .catch((e) => {
        notify(userMessage(e), 'error')
        setLoaded(true)
      })
    return () => {
      live = false
    }
  }, [id, notify])

  useEffect(
    () =>
      reel.stories.onProgress((p) => {
        if (p.id === id && p.stage === 'export') setExportJob(p)
      }),
    [id]
  )

  /**
   * Saves what is on screen. One save at a time (main reads then writes, so two at once could put old text back);
   * true when what is on screen is on disk. A failure stops the autosave until the next edit or Retry.
   */
  const saveNow = useCallback(async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current
    const cur = latest.current
    if (!cur || deleted.current) return true
    if (saved.current === cur) return true
    setSaveState('saving')
    const run = reel.stories.save(cur).then(
      () => {
        saved.current = cur
        setSaveError('')
        setSaveState(latest.current === cur ? 'saved' : 'dirty')
        return true
      },
      (e: unknown) => {
        setSaveError(userMessage(e))
        setSaveState('error')
        return false
      }
    )
    inFlight.current = run
    try {
      return await run
    } finally {
      if (inFlight.current === run) inFlight.current = null
    }
  }, [])

  useEffect(() => {
    if (saveState !== 'dirty') return
    const t = setTimeout(() => void saveNow(), SAVE_DELAY_MS)
    return () => clearTimeout(t)
  }, [s, saveState, saveNow])

  // Leaving the page (another tab, the back link) still keeps the last edit.
  useEffect(
    () => () => {
      const cur = latest.current
      if (cur && !deleted.current && saved.current !== cur) void reel.stories.save(cur).catch(() => {})
    },
    []
  )

  // A picture or illustration chosen in a line shows once the save is on disk (main reads the images from the file).
  useEffect(() => {
    if (saveState !== 'saved' || !s) return
    const key = imageKey(s)
    if (key === assetsKey.current) return
    assetsKey.current = key
    reel.stories.assets(id).then(setAssets, (e) => notify(userMessage(e), 'error'))
  }, [saveState, s, id, notify])

  // The voice no longer fits: a line, how it is said, the voice or the recording changed since it was made.
  const stale = !!s && !!timing && !isVoiceCurrent(s, timing)
  // The voice only fits the lines it was made for: after an edit the preview goes back to the estimate.
  const shown = useDebounced(s, PREVIEW_DELAY_MS)
  const shownStale = !!shown && !!timing && !isVoiceCurrent(shown, timing)
  const previewTiming = useMemo(() => (shown ? (timing && !shownStale ? timing : estimateTiming(shown)) : null), [shown, timing, shownStale])
  const html = useMemo(() => (shown && previewTiming ? storyHtml(shown, previewTiming, assets) : ''), [shown, previewTiming, assets])
  const lineStarts = useMemo(() => (shown && previewTiming ? sceneTimes(shown, previewTiming) : []), [shown, previewTiming])
  const duration = lineStarts.at(-1)?.end ?? previewTiming?.duration ?? 1
  const playVoice = !!timing && !shownStale

  if (!s) {
    return (
      <div className="page">
        {loaded && (
          <div className="panel stack" data-testid="story-missing">
            <p className="muted">That story is gone. It may have been deleted or moved.</p>
            <div className="row"><button className="btn small" onClick={onBack}>Back to Stories</button></div>
          </div>
        )}
      </div>
    )
  }

  const update = (fn: (x: Story) => Story): void => {
    setS((x) => (x ? fn(x) : x))
    setSaveState('dirty')
    setExported(false)
  }
  const setLine = (i: number, patch: Partial<StoryLine>): void => update((x) => ({ ...x, lines: x.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }))
  const setScene = (i: number, patch: Partial<Scene>): void => update((x) => ({ ...x, lines: x.lines.map((l, k) => (k === i ? { ...l, scene: { ...l.scene, ...patch } } : l)) }))
  const setParams = (i: number, patch: Partial<SceneParams>): void =>
    update((x) => ({ ...x, lines: x.lines.map((l, k) => (k === i ? { ...l, scene: { ...l.scene, params: { ...l.scene.params, ...patch } } } : l)) }))
  const addLine = (): void => {
    const at = sel + 1
    update((x) => ({
      ...x,
      lines: [...x.lines.slice(0, at), { shown: 'A new line', spoken: '', scene: { type: 'line', world: freshWorld(x.lines, at), transition: 'cut', params: {} } }, ...x.lines.slice(at)]
    }))
    setSel(at)
  }
  const removeLine = (i: number): void => {
    update((x) => ({ ...x, lines: x.lines.filter((_, k) => k !== i) }))
    setSel(Math.max(0, Math.min(i, s.lines.length - 2)))
  }
  const moveLine = (i: number, to: number): void => {
    if (to < 0 || to >= s.lines.length) return
    update((x) => {
      const lines = x.lines.slice()
      const [l] = lines.splice(i, 1)
      lines.splice(to, 0, l!)
      return { ...x, lines }
    })
    setSel(to)
  }
  const pickLine = (i: number): void => {
    setSel(i)
    const start = previewTiming?.lines[i]?.start
    if (start !== undefined) setJump((j) => ({ t: start, n: j.n + 1 }))
  }
  const setVoice = (voice: StoryVoice): void => update((x) => ({ ...x, voice }))
  const afterRecording = async (): Promise<void> => {
    // Main set the story's voice to the recording; take that, keeping nothing that was not saved (it was, just before).
    try {
      const fresh = (await reel.stories.list()).find((x) => x.id === id)
      if (fresh) {
        saved.current = fresh
        setS(fresh)
        setSaveState('saved')
      }
      await loadMedia()
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }
  const back = async (): Promise<void> => {
    if (await saveNow()) onBack()
  }
  const doExport = async (): Promise<void> => {
    setExporting(true)
    setExportJob(null)
    setExported(false)
    try {
      // Main draws the film from the file on disk: never export from a save that did not happen.
      if (!(await saveNow())) return
      await reel.stories.export(s.id)
      setExported(true)
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setExporting(false)
      setExportJob(null)
    }
  }
  const remove = async (): Promise<void> => {
    try {
      deleted.current = true
      await reel.stories.remove(s.id)
      onBack()
    } catch (e) {
      deleted.current = false
      notify(userMessage(e), 'error')
    }
  }

  const notes = checkStory(s)
  const locked = drafting || voiceBusy || exporting
  const canExport = !!timing && !stale && !locked
  const exportPct = exportJob ? Math.round(Math.min(100, Math.max(0, exportJob.pct))) : null
  return (
    <div className="page carousel-editor story-editor" data-testid="story-editor">
      <div className="page-head">
        <div className="stack carousel-head">
          <button className="link" onClick={() => void back()}>← Stories</button>
          <input className="input carousel-name" aria-label="Story name" disabled={locked} value={s.title} onChange={(e) => update((x) => ({ ...x, title: e.target.value }))} />
        </div>
        <span className="row carousel-save" aria-live="polite">
          {saveState === 'error' ? (
            <>
              <span className="carousel-save-error" data-testid="story-save-state">Not saved: {saveError}</span>
              <button className="btn small" onClick={() => void saveNow()}>Retry</button>
            </>
          ) : (
            <span className="muted-sm" data-testid="story-save-state">{saveState === 'saved' ? 'Saved' : 'Saving…'}</span>
          )}
        </span>
      </div>

      <div className="story-layout">
        <section className="story-preview" aria-label="Preview">
          <StoryPlayer html={html} duration={duration} audioUrl={playVoice ? audioUrl : null} jumpTo={jump} />
        </section>

        <div className="stack carousel-side-col">
          <StoryWriter
            story={s}
            onBusy={setDrafting}
            beforeDraft={saveNow}
            onDrafted={(next) => {
              saved.current = next
              setS(next)
              setSel(0)
              setSaveState('saved')
              setExported(false)
            }}
          />
          <StoryVoicePanel
            story={s}
            timing={timing}
            stale={stale}
            locked={drafting || exporting}
            saveNow={saveNow}
            onVoice={setVoice}
            onTiming={(t) => {
              setTiming(t)
              void loadMedia()
              setExported(false)
            }}
            onRecordingUsed={() => void afterRecording()}
            onBusy={setVoiceBusy}
          />
          {/* While the AI writes or a voice is made, the words are fixed: edits would be overwritten or not fit. */}
          <fieldset className="carousel-fieldset stack" disabled={locked} aria-busy={locked}>
            <section className="panel row wrap" aria-label="Look">
              <div className="seg" role="group" aria-label="Palette">
                {PALETTES.map((p) => (
                  <button key={p.id} className={`tab${s.palette === p.id ? ' active' : ''}`} aria-pressed={s.palette === p.id} onClick={() => update((x) => ({ ...x, palette: p.id }))} data-testid={`story-palette-${p.id}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input className="input carousel-handle" aria-label="Handle" placeholder="@handle" value={s.handle} onChange={(e) => update((x) => ({ ...x, handle: e.target.value }))} />
            </section>
            <StoryLines
              lines={s.lines}
              sel={Math.min(sel, s.lines.length - 1)}
              assets={assets}
              maxLines={MAX_LINES}
              onSelect={pickLine}
              onLine={setLine}
              onScene={setScene}
              onParams={setParams}
              onAdd={addLine}
              onRemove={removeLine}
              onMove={moveLine}
            />
            <StoryCaption key={s.updatedAt} story={s} onChange={(patch) => update((x) => ({ ...x, ...patch }))} />
          </fieldset>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="panel carousel-notes" data-testid="story-notes">
          <strong>Before you export</strong>
          <ul>
            {notes.map((n, i) => (
              <li key={i}>
                {n.line !== null ? <button className="link" onClick={() => pickLine(n.line!)}>Line {n.line + 1}</button> : null} {n.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row wrap carousel-actions">
        <button className="btn primary" onClick={() => void doExport()} disabled={!canExport} data-testid="story-export">
          {exporting ? 'Making the video…' : 'Export MP4'}
        </button>
        {!timing && <span className="muted-sm">Make the voice first: the video is timed to it.</span>}
        {timing && stale && <span className="muted-sm">Make the voice again first: the lines or the voice changed.</span>}
        {exporting && exportPct !== null && (
          <span className="row" aria-live="polite">
            <progress className="story-progress" max={100} value={exportPct} aria-label="Export progress" data-testid="story-export-progress" />
            <span className="muted-sm">{exportPct}%</span>
          </span>
        )}
        {exported && (
          <>
            <span className="muted-sm" data-testid="story-exported">Video saved.</span>
            <button className="btn small ghost" onClick={() => void reel.stories.reveal(s.id)}>Open folder</button>
          </>
        )}
        <span className="spacer" />
        {confirmDelete ? (
          <>
            <span className="muted-sm">Delete this story, its voice and its video?</span>
            <button className="btn small danger-solid" onClick={() => void remove()}>Delete</button>
            <button className="btn small ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </>
        ) : (
          <button className="btn small ghost danger" onClick={() => setConfirmDelete(true)} disabled={exporting || voiceBusy}>Delete…</button>
        )}
      </div>
    </div>
  )
}
