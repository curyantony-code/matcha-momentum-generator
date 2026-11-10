import { useEffect, useState } from 'react'
import type { BrandDoc } from '../../../shared/brand-profile'
import { reel, userMessage } from '../api'
import './BrandSwitch.css'

/** "Acme (the page)" → "Acme": the sidebar has room for the name only. */
const shortName = (b: BrandDoc): string => (b.profile.title || b.id).replace(/\s*\([^)]*\)\s*$/, '') || b.id

interface BrandSwitchProps {
  active: string | null
  /** Changes whenever the brand list may have changed (screen change, a save on the Brands tab): the list reloads. */
  refreshKey: unknown
  onChange: (id: string | null) => void
  onError: (message: string) => void
}

/** "Making for": the brand whose voice, look and My style rules new scripts and videos use. Hidden with no brands. */
export function BrandSwitch({ active, refreshKey, onChange, onError }: BrandSwitchProps) {
  const [brands, setBrands] = useState<BrandDoc[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    reel.brands.list().then((l) => setBrands(l.brands)).catch(() => setBrands([]))
  }, [active, refreshKey])

  if (!brands.length) return null

  const pick = async (raw: string) => {
    const id = raw || null
    setBusy(true)
    try {
      await reel.brands.setActive(id)
      onChange(id)
    } catch (e) {
      onError(userMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="brand-switch" data-testid="brand-switch">
      <span className="brand-switch-label">Making for</span>
      <select className="brand-switch-select" value={active ?? ''} disabled={busy} onChange={(e) => void pick(e.target.value)}>
        {!active && <option value="">Pick a brand</option>}
        {/* Picked, but its file is gone: say so, instead of showing another brand's name. */}
        {active && !brands.some((b) => b.id === active) && (
          <option value={active} disabled>
            {active} (file missing)
          </option>
        )}
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {shortName(b)}
          </option>
        ))}
      </select>
    </label>
  )
}
