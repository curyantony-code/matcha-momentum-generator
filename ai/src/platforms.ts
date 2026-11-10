// The post kit: the text that goes under the video. It is written for Instagram first (write_post), then adapted
// for TikTok and YouTube (adaptPost), each in the way that platform's search and feed read it.
import type { VideoFormat } from './formats';

/** Every post kit's hashtag count sits in this range; the YouTube title cap. */
export const MIN_HASHTAGS = 3;
export const MAX_HASHTAGS = 5;
export const MAX_TITLE = 100;

/** Where the post kit is written first. */
export const PRIMARY = 'instagram' as const;
/** Where it is adapted to after that. */
export const ADAPTED = ['tiktok', 'youtube'] as const;
export type AdaptedPlatform = (typeof ADAPTED)[number];

export interface PostKit {
  label: string;
  /** Exactly this many hashtags. */
  hashtags: number;
  /** Has a title (YouTube). */
  title: boolean;
  rules: string;
}

export const INSTAGRAM: PostKit = {
  label: 'Instagram',
  hashtags: 5,
  title: false,
  rules: 'Caption: a hook line of 60 to 80 characters with the words someone would search for, then one or two sentences of context or payoff, then at most one ask. Exactly 5 hashtags (Instagram allows no more).',
};

/** The adapted kits. YouTube depends on the format: a Short, or a long video with a real description. */
export function adaptedKit(p: AdaptedPlatform, format: VideoFormat): PostKit {
  if (p === 'tiktok') {
    return {
      label: 'TikTok',
      hashtags: 4,
      title: false,
      rules: 'One or two short lines, the search keyword in the first three words, said the way a viewer would type it, under 150 characters. Casual, like the video. Exactly 4 hashtags: the topic, the niche, the audience, one broader tag.',
    };
  }
  if (format === 'long') {
    return {
      label: 'YouTube',
      hashtags: 3,
      title: true,
      rules: 'Title: 50 to 60 characters (never over 70), the searchable keyword first, a promise or a question, a specific number when there is one (47, not 50); weigh several before choosing; no clickbait the video does not keep. Description: the first 150 characters say what the viewer gets with the keyword in them (that is what search shows), then 2 or 3 short paragraphs on what the video covers, then one ask. Exactly 3 hashtags.',
    };
  }
  return {
    label: 'YouTube Shorts',
    hashtags: 3,
    title: true,
    rules: 'Title: at most 60 characters, the searchable keyword first; it is what search and the Shorts feed show. Description: one or two lines. Exactly 3 hashtags (only the first 3 show above the title).',
  };
}

/** One adapted post kit, as stored in project.post.adapted. */
export interface AdaptedPost { caption: string; hashtags: string[]; title?: string }
