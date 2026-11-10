// What kind of video it is: a vertical short (Reels, TikTok, Shorts), a horizontal short (YouTube, LinkedIn,
// X and Facebook feeds) or a long-form video (YouTube). It sets the frame, the script's length and shape, and
// the edit's pace. The keys, sizes and windows are mirrored in app/src/shared/formats.ts for the UI.

export const FORMATS = ['short-vertical', 'short-horizontal', 'long'] as const;
export type VideoFormat = (typeof FORMATS)[number];
export const DEFAULT_FORMAT: VideoFormat = 'short-vertical';

export const isFormat = (v: unknown): v is VideoFormat => (FORMATS as readonly unknown[]).includes(v);
export const formatOf = (v: unknown): VideoFormat => (isFormat(v) ? v : DEFAULT_FORMAT);

export interface FormatProfile {
  label: string;
  width: number;
  height: number;
  /** Spoken length window of a script, in seconds. */
  seconds: readonly [number, number];
  script: string;
  edit: string;
}

export const FORMAT_PROFILES: Record<VideoFormat, FormatProfile> = {
  'short-vertical': {
    label: 'Short, vertical',
    width: 1080,
    height: 1920,
    seconds: [20, 60],
    script: [
      'A vertical short, posted to Instagram Reels first, then TikTok and YouTube Shorts.',
      '- 20 to 60 seconds of talking, 25 to 45 is the sweet spot. The hook lands in the first second: no setup, start in the middle of the moment.',
      '- Say the topic keywords out loud in the first sentence (TikTok and Instagram search what is said), and put them in the on-screen text hook.',
      '- A third of viewers watch muted: the on-screen text hook must make sense alone.',
      '- Completion and rewatches decide reach: a re-hook about every 7 to 10 seconds (a turn, a new number, "but here is the part..."), and a last line that flows back into the first so the replay feels like one video.',
      '- Beats: hook 0 to 3 s, the problem or tension by about 8 s, the insight or method through the middle, one real example or proof just before the end, the ask (if any) in the last 5 s.',
      '- Write at least one line people would send to a friend or save to come back to. At most one ask, and "send this to" or "save this" beats "follow for more".',
    ].join('\n'),
    edit: [
      'A vertical short (1080 x 1920) for Reels, TikTok and Shorts.',
      '- Pace: the screen changes every 2 to 4 seconds; trim every pause.',
      "- Keep text and cards out of the bottom fifth (captions and the post's own text) and the right edge (the like, comment and share buttons) on all three apps.",
    ].join('\n'),
  },
  'short-horizontal': {
    label: 'Short, horizontal',
    width: 1920,
    height: 1080,
    seconds: [30, 90],
    script: [
      'A horizontal short (16:9) for feeds where video autoplays MUTED: YouTube, LinkedIn, X and Facebook.',
      '- 30 to 90 seconds. The on-screen text hook carries the first 3 seconds, so make it a full, specific claim.',
      '- Credibility early (one real result, a role, a number), then the point. The very first frame is the speaker mid-sentence, never a black or logo slate.',
      '- The wide frame has room beside the face: name what to show (a screen, a chart, a place) so it can sit next to you.',
      '- One re-hook near the middle, and end on one clear takeaway or a question that invites a thoughtful comment.',
    ].join('\n'),
    edit: [
      'A horizontal short (1920 x 1080). The frame is WIDE: the face sits near the middle with room on both sides.',
      '- Pictures go BESIDE the face: side-card (side left or right), phone-card, or split-top for something big. card-above-head rarely fits a wide frame; do not use it.',
      '- Pace: calmer, the screen changes every 4 to 6 seconds. Captions always on: most feeds play muted.',
      '- A take filmed upright stands in the middle with a blurred copy of itself at the sides: that side space is where pictures go (side-card).',
    ].join('\n'),
  },
  long: {
    label: 'Long-form',
    width: 1920,
    height: 1080,
    seconds: [180, 1200],
    script: [
      'A long-form YouTube video (3 to 20 minutes, horizontal).',
      '- The first 30 seconds decide everything: the hook, then the promise (what they will have by the end), 3 or 4 one-line "you will see" teasers, and about 10 seconds of why you can deliver it. No intro, no "before we start". Say the main search keyword in the first sentence.',
      '- Open at least 3 questions in the first few minutes and visibly close each one later. Tie every chapter back to the promise of the hook: a chapter that drifts from it is where viewers leave.',
      '- Build it in chapters, 3 to 6 of them, each opening with its own small hook and closing on an open loop into the next ("the third one is the one that actually worked").',
      '- A re-hook every 60 to 90 seconds, and a strong one at about 30%, 50% and 70% of the way through: a turn, a story beat, a number, a question back to the viewer. Chapters every 2 to 3 minutes.',
      '- Pay the promise off in full near the end, then one ask (the next video to watch, or one thing to do), never a list of asks.',
      '- "onScreenText" holds the chapter titles in order (2 to 5 words each), not overlays for every line.',
    ].join('\n'),
    edit: [
      'A long-form video (1920 x 1080). It is minutes long: pace it for watching, not scrolling.',
      '- A change of picture every 8 to 15 seconds, not every 3: about 4 to 6 pictures or animations and 2 to 4 zooms per minute. Never more than about 20 seconds of plain face.',
      '- At the start of each chapter, a text-pop with params.style "label" and the chapter title.',
      '- Pictures go beside the face (side-card, phone-card) or split-top; card-above-head rarely fits a wide frame.',
      '- A take filmed upright stands in the middle with a blurred copy of itself at the sides: put pictures in that side space.',
      '- Music sits quiet under the voice the whole way, or leave it out.',
      '- Cover (the thumbnail): a big clear expression and at most 3 words of text that add to the title, never repeat it, readable when the thumbnail is small.',
    ].join('\n'),
  },
};

/** The format block for a prompt: what kind of video this is and what it needs. */
export function formatBlock(f: VideoFormat, part: 'script' | 'edit'): string {
  return part === 'script' ? FORMAT_PROFILES[f].script : FORMAT_PROFILES[f].edit;
}

/** The format a project is, from project.format: its kind when set, else from its shape (wide = horizontal short). */
export function projectFormat(fmt: unknown): VideoFormat {
  const f = (fmt ?? {}) as { kind?: unknown; width?: unknown; height?: unknown };
  if (isFormat(f.kind)) return f.kind;
  return typeof f.width === 'number' && typeof f.height === 'number' && f.width > f.height ? 'short-horizontal' : 'short-vertical';
}
