import { useState } from 'react'
import type { AdaptedPost, ProjectJson } from '../../../shared/api'

type Tab = 'instagram' | 'tiktok' | 'youtube'
const TABS: { key: Tab; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' }
]

interface PostVersionsProps {
  post: ProjectJson['post']
  busy: boolean
  canAdapt: boolean
  onAdapt: () => void
  onCopy: (text: string) => void
}

const asText = (p: { caption: string; hashtags: string[] }): string => [p.caption, p.hashtags.join(' ')].filter(Boolean).join('\n\n')

/** The post, Instagram first, with its TikTok and YouTube versions one tab away. */
export function PostVersions({ post, busy, canAdapt, onAdapt, onCopy }: PostVersionsProps) {
  const [tab, setTab] = useState<Tab>('instagram')
  const caption = post?.caption?.trim() ?? ''
  if (!caption) return null
  const adapted = post?.adapted
  const stale = !!adapted && adapted.from.trim() !== caption
  const shown: AdaptedPost | null = tab === 'instagram' ? { caption, hashtags: post?.hashtags ?? [] } : (adapted?.[tab] ?? null)

  return (
    <section className="panel stack" data-testid="post-versions">
      <div className="row">
        <h2>Your post</h2>
        <span className="spacer" />
        {canAdapt && (
          <button className="btn small" onClick={onAdapt} disabled={busy} data-testid="adapt-post">
            {adapted ? 'Adapt again' : 'Adapt for TikTok and YouTube'}
          </button>
        )}
      </div>
      <div className="seg" role="tablist" aria-label="Which platform's post">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : undefined} onClick={() => setTab(t.key)} data-testid={`post-tab-${t.key}`}>
            {t.label}
          </button>
        ))}
      </div>
      {stale && tab !== 'instagram' && (
        <p className="muted-sm" data-testid="post-stale">
          You changed the Instagram caption after this was adapted. Adapt again so it matches.
        </p>
      )}
      {shown ? (
        <div className="stack" style={{ gap: 6 }} data-testid={`post-${tab}`}>
          {shown.title && (
            <p>
              <strong data-testid="post-title">{shown.title}</strong>
            </p>
          )}
          <p style={{ whiteSpace: 'pre-wrap' }}>{shown.caption}</p>
          <p className="muted-sm">{shown.hashtags.join(' ')}</p>
          <div className="row">
            {shown.title && (
              <button className="btn small" onClick={() => onCopy(shown.title ?? '')}>
                Copy title
              </button>
            )}
            <button className="btn small" onClick={() => onCopy(asText(shown))} data-testid={`copy-post-${tab}`}>
              Copy {tab === 'youtube' ? 'description' : 'caption'}
            </button>
          </div>
        </div>
      ) : (
        <p className="muted-sm" data-testid="post-not-adapted">
          {canAdapt ? 'Not adapted yet. Press "Adapt for TikTok and YouTube".' : 'Connect an AI editor to adapt your post for TikTok and YouTube.'}
        </p>
      )}
    </section>
  )
}
