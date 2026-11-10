import { useEffect, useState } from 'react'
import type { HouseLook } from '../../../shared/api'
import { reel, userMessage } from '../api'
import { useNotify } from '../App'

/**
 * The house look: one video's light and colour that every video is matched to, so they look like one series.
 * With `slug`, this video can become it; without, it only says which one it is and can be cleared (Settings).
 */
export function HouseLookRow({ slug, disabled }: { slug?: string; disabled?: boolean }) {
  const notify = useNotify()
  const [house, setHouse] = useState<HouseLook | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    reel.look.house().then(setHouse).catch(() => setHouse(null))
  }, [])
  const run = async (fn: () => Promise<HouseLook | null>, done: string) => {
    setBusy(true)
    try {
      setHouse(await fn())
      notify(done)
    } catch (e) {
      notify(userMessage(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack" style={{ gap: 6 }} data-testid="house-look">
      <p className="muted-sm" data-testid="house-look-status">
        {house
          ? `House look: every video's colour is matched to "${house.from}", so they all look like one series.`
          : 'No house look yet. Pick a video whose colour you love, and every video will be matched to it.'}
      </p>
      <div className="row">
        {slug && (
          <button
            className="btn small"
            disabled={busy || disabled}
            onClick={() => void run(() => reel.look.setHouse(slug), 'This is your house look now. Your other videos match it at their next version.')}
            data-testid="house-look-set"
          >
            Make this video's colour my house look
          </button>
        )}
        {house && (
          <button
            className="btn small ghost"
            disabled={busy}
            onClick={() => void run(() => reel.look.clearHouse().then(() => null), 'House look cleared. Each video is only fixed on its own now.')}
            data-testid="house-look-clear"
          >
            Clear the house look
          </button>
        )}
      </div>
    </div>
  )
}
