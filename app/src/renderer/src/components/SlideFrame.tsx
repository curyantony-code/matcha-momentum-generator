import { memo } from 'react'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../../../shared/carousel-render'

interface SlideFrameProps {
  /** The slide's full HTML (shared/carousel-render.ts slideHtml): the same page the export draws. */
  html: string
  /** Shown width in CSS pixels; the slide keeps its 4:5 shape. */
  width: number
  label: string
}

/** A short, fast fingerprint of the slide's HTML (FNV-1a), to give each version of it its own frame. */
function fingerprint(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * One slide exactly as it exports, in a sandboxed frame (no script, no navigation), drawn at 1080 × 1350 and scaled
 * down. Memoised on the HTML string, so a slide that did not change keeps its frame. A changed slide gets a new frame
 * rather than a new srcdoc: swapping a sandboxed frame's srcdoc while it is still loading can leave it blank for good.
 */
export const SlideFrame = memo(function SlideFrame({ html, width, label }: SlideFrameProps) {
  const scale = width / SLIDE_WIDTH
  return (
    <div className="slide-frame" style={{ width, height: SLIDE_HEIGHT * scale }} role="img" aria-label={label}>
      <iframe
        key={fingerprint(html)}
        title={label}
        sandbox=""
        tabIndex={-1}
        srcDoc={html}
        width={SLIDE_WIDTH}
        height={SLIDE_HEIGHT}
        style={{ transform: `scale(${scale})` }}
      />
    </div>
  )
})
