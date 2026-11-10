// Turning one finished reel's transcript into other formats. This only checks the model's reply is publishable.

export interface CarouselSlide { title: string; body: string }

export interface RepurposeResult {
  carousel: CarouselSlide[];
  thread: string[];
  newsletter: { subject: string; body: string };
}

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 10;
export const THREAD_POST_LIMIT = 280;

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function parseSlide(v: unknown): CarouselSlide | null {
  if (typeof v !== 'object' || v === null) return null;
  const { title, body } = v as Record<string, unknown>;
  return isText(title) && isText(body) ? { title, body } : null;
}

/** The result, or null when any part is missing or too long to post (the caller then asks again). */
export function parseRepurpose(reply: unknown): RepurposeResult | null {
  if (typeof reply !== 'object' || reply === null) return null;
  const { carousel, thread, newsletter } = reply as Record<string, unknown>;
  if (!Array.isArray(carousel) || carousel.length < MIN_SLIDES || carousel.length > MAX_SLIDES) return null;
  const slides = carousel.map(parseSlide);
  if (slides.some((s) => s === null)) return null;
  if (!Array.isArray(thread) || thread.length === 0) return null;
  if (!thread.every((p) => isText(p) && p.length <= THREAD_POST_LIMIT)) return null;
  if (typeof newsletter !== 'object' || newsletter === null) return null;
  const { subject, body } = newsletter as Record<string, unknown>;
  if (!isText(subject) || !isText(body)) return null;
  return { carousel: slides as CarouselSlide[], thread: thread as string[], newsletter: { subject, body } };
}
