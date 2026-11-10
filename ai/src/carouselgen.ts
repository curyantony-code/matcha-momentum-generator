// A carousel draft from the model: 5 to 7 slides (a hook, one idea each, a call to action), a caption and hashtags.
// The app keeps its own copy of the carousel rules (app/src/shared/carousel.ts); this only reads what the model sent.

export type DraftRole = 'hook' | 'body' | 'cta';

export interface DraftSlide {
  role: DraftRole;
  kicker: string;
  headline: string;
  highlight: string;
  body: string;
}

export interface CarouselDraft {
  slides: DraftSlide[];
  caption: string;
  hashtags: string[];
}

export const DRAFT_MIN_SLIDES = 5;
export const DRAFT_MAX_SLIDES = 7;
const MAX_HASHTAGS = 8;
const LIMITS = { kicker: 60, headline: 200, highlight: 60, body: 400, caption: 2200, hashtag: 40 };
// Pictographs only: an emoji is never on screen (the app's rule), but letters, digits and punctuation in any language are.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

const text = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(EMOJI, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';

function slideOf(raw: unknown): DraftSlide | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const headline = text(r.headline, LIMITS.headline);
  if (!headline) return null;
  const highlight = text(r.highlight, LIMITS.highlight);
  return {
    role: r.role === 'hook' || r.role === 'cta' ? r.role : 'body',
    kicker: text(r.kicker, LIMITS.kicker),
    headline,
    // one word of the headline, or none: a highlight the headline does not hold would draw nothing
    highlight: highlight && headline.toLowerCase().includes(highlight.toLowerCase()) ? highlight : '',
    body: text(r.body, LIMITS.body),
  };
}

/** The caption keeps its paragraphs (Instagram shows line breaks); everything else is cleaned like the slides. */
const captionOf = (v: unknown): string =>
  typeof v === 'string'
    ? v.replace(EMOJI, '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.caption)
    : '';

const hashtagOf = (v: unknown): string | null => {
  const t = text(v, LIMITS.hashtag).replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  return t ? `#${t}` : null;
};

/** The draft, or null when it cannot be one (fewer than 5 usable slides, a slide with no headline). */
export function parseCarouselDraft(raw: unknown): CarouselDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.slides)) return null;
  // Too many: keep the opening ones and the real last slide (the call to action), dropping from the middle.
  const kept = r.slides.length > DRAFT_MAX_SLIDES ? [...r.slides.slice(0, DRAFT_MAX_SLIDES - 1), r.slides[r.slides.length - 1]] : r.slides;
  const parsed = kept.map(slideOf);
  if (parsed.length < DRAFT_MIN_SLIDES || parsed.some((s) => s === null)) return null;
  const slides = (parsed as DraftSlide[]).map((s, i, all): DraftSlide => ({
    ...s,
    // the shape is fixed: the hook opens, the call to action closes, everything between is one idea each
    role: i === 0 ? 'hook' : i === all.length - 1 ? 'cta' : 'body',
  }));
  const tags = Array.isArray(r.hashtags) ? r.hashtags.map(hashtagOf).filter((t): t is string => t !== null) : [];
  return { slides, caption: captionOf(r.caption), hashtags: Array.from(new Set(tags)).slice(0, MAX_HASHTAGS) };
}
