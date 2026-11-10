import { useEffect, useState } from 'react'
import type { StoryProgress } from '../../../shared/api'
import type { Story, StoryTiming, StoryVoice as VoiceSetting, StoryVoiceOption, VoiceModelStatus } from '../../../shared/story'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'

const MIN_SPEED = 0.7
const MAX_SPEED = 1.3
const DEFAULT_VOICE = 'af_heart'

interface StoryVoiceProps {
  story: Story
  timing: StoryTiming | null
  /** The lines, how they are said, the voice or the recording changed since the voice was made. */
  stale: boolean
  /** The editor is busy (the AI writes, an export runs): no voice job now. */
  locked: boolean
  saveNow: () => Promise<boolean>
  onVoice: (voice: VoiceSetting) => void
  onTiming: (t: StoryTiming) => void
  /** After "Use my own recording": main changed the story's voice setting; reload it. */
  onRecordingUsed: (t: StoryTiming) => void
  onBusy: (busy: boolean) => void
}

const mb = (n: number): string => `${Math.round(n / 1_000_000)} MB`

/** The voice: Kokoro (free, on this computer) with a voice and a speed, or the person's own recording. */
export function StoryVoicePanel({ story, timing, stale, locked, saveNow, onVoice, onTiming, onRecordingUsed, onBusy }: StoryVoiceProps) {
  const notify = useNotify()
  const [model, setModel] = useState<VoiceModelStatus | null>(null)
  const [voices, setVoices] = useState<StoryVoiceOption[]>([])
  const [job, setJob] = useState<StoryProgress | null>(null)
  const [working, setWorking] = useState<'download' | 'voice' | 'recording' | null>(null)

  const refresh = async (): Promise<void> => {
    try {
      const m = await reel.stories.voiceModel()
      setModel(m)
      if (m.installed && !m.packageMissing) setVoices(await reel.stories.voices())
    } catch (e) {
      notify(userMessage(e), 'error')
    }
  }
  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(
    () =>
      reel.stories.onProgress((p) => {
        if (p.id === '' || p.id === story.id) setJob(p)
      }),
    [story.id]
  )

  const guard = async (kind: 'download' | 'voice' | 'recording', fn: () => Promise<void>): Promise<void> => {
    setWorking(kind)
    setJob(null)
    onBusy(true)
    try {
      await fn()
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setWorking(null)
      setJob(null)
      onBusy(false)
    }
  }

  const download = (): Promise<void> =>
    guard('download', async () => {
      setModel(await reel.stories.downloadVoiceModel())
      await refresh()
    })
  const make = (): Promise<void> =>
    guard('voice', async () => {
      // The engine reads the story from disk: never make a voice from a save that did not happen.
      if (!(await saveNow())) return
      onTiming(await reel.stories.makeVoice(story.id))
      notify('The voice is ready. Press Play to hear it.', 'info')
    })
  const record = (): Promise<void> =>
    guard('recording', async () => {
      if (!(await saveNow())) return
      const t = await reel.stories.useRecording(story.id)
      if (t) onRecordingUsed(t)
    })

  const kokoro = story.voice.kind === 'kokoro' ? story.voice : null
  const busy = working !== null
  const pct = job ? Math.round(Math.min(100, Math.max(0, job.pct))) : null
  const ready = !!model?.installed && !model.packageMissing
  const recording = story.voice.kind === 'recording'

  return (
    <section className="panel stack" aria-labelledby="story-voice-title" data-testid="story-voice">
      <h2 id="story-voice-title">Voice</h2>

      {model?.packageMissing && (
        <p className="muted" data-testid="story-voice-addon">
          The free voice add-on is not installed on this computer, so it cannot make a voice here. You can still use your own recording.
        </p>
      )}
      {model && !model.installed && !model.packageMissing && (
        <div className="stack">
          <p className="muted">The free voice runs on this computer. It needs a one-time download.</p>
          <div className="row">
            <button className="btn" onClick={() => void download()} disabled={busy || locked} data-testid="story-voice-get">
              Get the free voice (about 340 MB)
            </button>
            {model.downloaded > 0 && working !== 'download' && <span className="muted-sm">{mb(model.downloaded)} of {mb(model.total)} already downloaded. Pressing the button carries on.</span>}
          </div>
        </div>
      )}

      {ready && (
        <div className="row wrap">
          <label className="row">
            <span className="field-label">Voice</span>
            <select
              className="input story-select"
              value={kokoro?.voice ?? ''}
              onChange={(e) => onVoice({ kind: 'kokoro', voice: e.target.value, speed: kokoro?.speed ?? 1 })}
              disabled={busy || locked}
              data-testid="story-voice-select"
            >
              {!kokoro && <option value="">Your recording</option>}
              {voices.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <label className="row story-speed">
            <span className="field-label">Speed</span>
            <input
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={0.05}
              value={kokoro?.speed ?? 1}
              onChange={(e) => onVoice({ kind: 'kokoro', voice: kokoro?.voice ?? voices[0]?.id ?? DEFAULT_VOICE, speed: Number(e.target.value) })}
              disabled={busy || locked}
              aria-valuetext={`${(kokoro?.speed ?? 1).toFixed(2)} times`}
              data-testid="story-voice-speed"
            />
            <span className="muted-sm">{(kokoro?.speed ?? 1).toFixed(2)}×</span>
          </label>
        </div>
      )}

      <div className="row wrap">
        {ready && (
          <button className="btn primary" onClick={() => void make()} disabled={busy || locked || recording} data-testid="story-make-voice">
            {working === 'voice' ? 'Making the voice…' : timing ? 'Make the voice again' : 'Make the voice'}
          </button>
        )}
        <button className="btn" onClick={() => void record()} disabled={busy || locked} data-testid="story-use-recording">
          {working === 'recording' ? 'Finding your lines…' : 'Use my own recording'}
        </button>
      </div>
      {recording && ready && <p className="muted-sm">Your recording is in use. Pick a voice above and make it to switch back.</p>}

      {job && pct !== null && (
        <div className="stack" aria-live="polite">
          <progress className="story-progress" max={100} value={pct} aria-label={job.message || 'Progress'} data-testid="story-voice-progress" />
          <span className="muted-sm">{job.message || (job.stage === 'download' ? 'Downloading the voice…' : 'Working…')} {pct}%</span>
        </div>
      )}

      {timing && stale && (
        <p className="carousel-confirm" role="status" data-testid="story-stale">
          The lines or the voice changed since it was made: make it again.
        </p>
      )}
      {timing && !stale && <p className="muted-sm" data-testid="story-voice-ok">The voice matches the lines ({Math.round(timing.duration)} seconds).</p>}
      {!timing && <p className="muted-sm">No voice yet. The preview plays silently until you make one.</p>}
    </section>
  )
}
