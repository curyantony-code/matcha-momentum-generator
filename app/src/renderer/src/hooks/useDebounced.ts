import { useEffect, useState } from 'react'

/** `value`, once it has stopped changing for `ms` milliseconds (the first value at once). */
export function useDebounced<T>(value: T, ms: number): T {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (Object.is(value, shown)) return
    const t = setTimeout(() => setShown(value), ms)
    return () => clearTimeout(t)
  }, [value, ms, shown])
  return shown
}
