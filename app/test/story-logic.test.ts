import { describe, expect, it } from 'vitest'
import { MAX_LINES, type Story, type StoryLine } from '../src/shared/story'
import {
  DEFAULT_VOICE,
  LIMITS,
  TAIL_SECONDS,
  checkStory,
  cleanStory,
  containsText,
  estimateTiming,
  isArtName,
  isLibraryPath,
  newStory,
  sceneTimes,
  sha256Hex,
  textHash
} from '../src/shared/story-logic'

const NOW = '2026-11-06T10:00:00.000Z'
const base = (): Story => newStory({ id: 's1', title: 'Nobody tells you this', brand: 'acme', palette: 'brand', handle: '@acme', now: NOW })
const withLines = (lines: StoryLine[]): Story => ({ ...base(), lines })
const L = (shown: string, type: StoryLine['scene']['type'] = 'line', world: StoryLine['scene']['world'] = 'paper', params: StoryLine['scene']['params'] = {}): StoryLine => ({
  shown,
  spoken: '',
  scene: { type, world, transition: 'cut', params }
})

describe('newStory', () => {
  it('is a valid story that already keeps every rule', () => {
    const s = base()
    expect(s.version).toBe(1)
    expect(s.lines).toHaveLength(6)
    expect(s.lines[0]!.shown).toBe('Nobody tells you this')
    expect(s.voice).toEqual(DEFAULT_VOICE)
    expect(checkStory(s)).toEqual([])
    expect(cleanStory(s)).toEqual(s)
  })
  it('uses every transition kind but cut at least once after the first', () => {
    const kinds = new Set(base().lines.slice(1).map((l) => l.scene.transition))
    expect([...kinds].sort()).toEqual(['flash', 'iris', 'whip', 'wipe', 'zoom'])
  })
})

describe('cleanStory', () => {
  it('refuses what is not a story', () => {
    expect(cleanStory(null)).toBeNull()
    expect(cleanStory('x')).toBeNull()
    expect(cleanStory([])).toBeNull()
    expect(cleanStory({ ...base(), id: '../x' })).toBeNull()
    expect(cleanStory({ ...base(), id: 'Has Caps' })).toBeNull()
    expect(cleanStory({ ...base(), lines: [] })).toBeNull()
    expect(cleanStory({ ...base(), lines: 'no' })).toBeNull()
  })

  it('whitelists every enum and falls back to safe defaults', () => {
    const raw = { ...base(), palette: 'neon', lines: [{ shown: 'x', scene: { type: 'video', world: 'space', transition: 'crossfade', params: {} } }] }
    const s = cleanStory(raw)!
    expect(s.palette).toBe('brand')
    expect(s.lines[0]!.scene).toEqual({ type: 'line', world: 'paper', transition: 'cut', params: {} })
    expect(s.lines[0]!.spoken).toBe('')
  })

  it('caps and squashes text, drops unknown fields', () => {
    const long = 'word '.repeat(200)
    const s = cleanStory({ ...base(), evil: 1, title: long, handle: `  @a \n b `, lines: [{ shown: long, spoken: long, scene: { type: 'stat', params: { value: '1'.repeat(50), label: long, hero: long, kicker: long, phrase: long, extra: 'x' } } }] })!
    expect('evil' in s).toBe(false)
    expect(s.title.length).toBeLessThanOrEqual(LIMITS.title)
    expect(s.handle).toBe('@a b')
    const l = s.lines[0]!
    expect(l.shown.length).toBeLessThanOrEqual(LIMITS.shown)
    expect(l.spoken.length).toBeLessThanOrEqual(LIMITS.spoken)
    expect(l.scene.params.value).toHaveLength(LIMITS.value)
    expect(l.scene.params.hero!.length).toBeLessThanOrEqual(LIMITS.hero)
    expect('extra' in l.scene.params).toBe(false)
  })

  it('keeps at most 20 lines and 5 cleaned list items', () => {
    const lines = Array.from({ length: 30 }, () => ({ shown: 'x', scene: { type: 'list', params: { items: [' a ', '', 3, 'b', 'c', 'd', 'e', 'f'] } } }))
    const s = cleanStory({ ...base(), lines })!
    expect(s.lines).toHaveLength(MAX_LINES)
    expect(s.lines[0]!.scene.params.items).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('never keeps a bad Library path or an art name that is a path', () => {
    const bad = ['/etc/passwd', '../x.png', 'Images/../../secret.png', 'http://evil.com/x.png', 'C:\\x.png', 'Images//x.png', '.hidden.png', '', 'a'.repeat(201)]
    for (const image of bad) {
      expect(isLibraryPath(image)).toBe(false)
      expect(cleanStory({ ...base(), lines: [{ shown: 'x', scene: { type: 'photo', params: { image } } }] })!.lines[0]!.scene.params.image).toBeNull()
    }
    expect(isLibraryPath('Images/My photo 2.png')).toBe(true)
    const kept = cleanStory({ ...base(), lines: [{ shown: 'x', scene: { type: 'photo', params: { image: 'Images/My photo 2.png', art: 'arlo.png' } } }] })!
    expect(kept.lines[0]!.scene.params).toEqual({ image: 'Images/My photo 2.png', art: 'arlo.png' })
    for (const art of ['kit/arlo.png', '../arlo.png', 'arlo.exe', 'arlo', '/arlo.png']) expect(isArtName(art)).toBe(false)
    expect(cleanStory({ ...base(), lines: [{ shown: 'x', scene: { type: 'art', params: { art: '../../x.svg' } } }] })!.lines[0]!.scene.params.art).toBeNull()
  })

  it('cleans the voice: kokoro ids, speed 0.7–1.3, a recording file in the story folder only', () => {
    const v = (voice: unknown): Story['voice'] => cleanStory({ ...base(), voice })!.voice
    expect(v({ kind: 'kokoro', voice: 'bm_george', speed: 3 })).toEqual({ kind: 'kokoro', voice: 'bm_george', speed: 1.3 })
    expect(v({ kind: 'kokoro', voice: '../x', speed: 0.1 })).toEqual({ kind: 'kokoro', voice: 'af_heart', speed: 0.7 })
    expect(v({ kind: 'recording', file: 'recording.m4a' })).toEqual({ kind: 'recording', file: 'recording.m4a' })
    expect(v({ kind: 'recording', file: 'audio/recording.wav' })).toEqual({ kind: 'recording', file: 'audio/recording.wav' })
    expect(v({ kind: 'recording', file: '/Users/me/x.wav' })).toEqual(DEFAULT_VOICE)
    expect(v('loud')).toEqual(DEFAULT_VOICE)
  })

  it('keeps clean hashtags and caption paragraphs', () => {
    const s = cleanStory({ ...base(), caption: 'a  b\n\n\n\nc', hashtags: ['#ok', 'ok', 'b<script>', 4] })!
    expect(s.caption).toBe('a b\n\nc')
    expect(s.hashtags).toEqual(['#ok', '#bscript'])
  })
})

describe('textHash', () => {
  it('is SHA-256 (known vectors)', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('x'.repeat(1000))).toBe('44f8354494a5ba03ba1792a8d3e9c534c47a9181980fde7a3f44b06ef2ae7c7f')
    expect(sha256Hex('Café — 27% 🚀\nnext')).toBe('aed1f12c7c8392896bf45849784ce90908c2775eed01d4519bb36b6522548ddb')
  })
  it('hashes the shown lines joined by "\\n", first 16 hex, like the engine', () => {
    expect(textHash(withLines([L('a'), L('b')]))).toBe('7e18f737311b2dc3')
    expect(textHash(withLines([{ ...L('a'), spoken: 'ay' }, L('b')]))).toBe('7e18f737311b2dc3')
  })
})

describe('sceneTimes', () => {
  const s = withLines([L('one'), L('two'), L('three')])
  it('runs from each line start to the next, the last to the end plus the tail', () => {
    const t = sceneTimes(s, { duration: 6, lines: [{ start: 0.12, end: 1 }, { start: 2, end: 3 }, { start: 4, end: 6 }], words: [], textHash: '' })
    expect(t).toEqual([{ start: 0.12, end: 2 }, { start: 2, end: 4 }, { start: 4, end: 6 + TAIL_SECONDS }])
  })
  it('gives scenes a timing does not cover two seconds each', () => {
    const t = sceneTimes(s, { duration: 1, lines: [{ start: 0.1, end: 1 }], words: [], textHash: '' })
    expect(t.map((x) => x.start)).toEqual([0.1, 2.1, 4.1])
    expect(t[2]!.end).toBeCloseTo(4.1 + TAIL_SECONDS)
  })
})

describe('estimateTiming', () => {
  it('speaks 2.6 words a second with the engine lead and gaps', () => {
    const s = withLines([L('one two three four five six seven eight nine ten eleven twelve thirteen.'), L('a b')])
    const t = estimateTiming(s)
    expect(t.lines[0]!.start).toBe(0.12)
    expect(t.lines[0]!.end).toBeCloseTo(0.12 + 13 / 2.6, 2)
    expect(t.lines[1]!.start).toBeCloseTo(t.lines[0]!.end + 0.18 + 0.12, 2) // + more after a full stop
    expect(t.lines[1]!.end - t.lines[1]!.start).toBeCloseTo(0.8, 2) // a short line still holds
    expect(t.words).toHaveLength(15)
    expect(t.words.filter((w) => w.line === 1).map((w) => w.w)).toEqual(['a', 'b'])
    expect(t.duration).toBe(t.lines[1]!.end)
    expect(t.textHash).toBe(textHash(s))
  })
})

describe('checkStory', () => {
  const rules = (s: Story): string[] => checkStory(s).map((n) => `${n.line}:${n.rule}`)
  const good = (): StoryLine[] => base().lines

  it('wants 6 to 20 lines', () => {
    expect(rules(withLines(good().slice(0, 3)))).toContain('null:count')
    expect(rules(withLines([...good(), ...good(), ...good(), ...good()].slice(0, 21)))).toContain('null:count')
  })
  it('wants a short hook first and a follow or waitlist ask last', () => {
    const lines = good()
    lines[0] = L('word '.repeat(14).trim(), 'title', 'ink')
    lines[5] = L('Comment below', 'line', 'paper')
    expect(rules(withLines(lines))).toEqual(expect.arrayContaining(['1:hook-first', '6:cta-last']))
    lines[5] = L('Join the waitlist', 'line', 'paper')
    expect(rules(withLines(lines))).not.toContain('6:cta-last')
  })
  it('flags the same world twice in a row, an empty line, a hero or phrase not in its line, a stat with no value, a short list', () => {
    const lines = good()
    lines[1] = L('', 'line', 'ink', { hero: 'missing' })
    lines[2] = L('It took years', 'stat', 'clay', { value: '' })
    lines[3] = L('The answer was here', 'highlight', 'grey', { phrase: 'not there' })
    lines[4] = L('Three things', 'list', 'black', { items: ['one'] })
    expect(rules(withLines(lines))).toEqual(['2:empty', '2:world-repeat', '2:hero', '3:stat-value', '4:phrase', '5:list-items'])
  })
  it('matches heroes ignoring case and punctuation', () => {
    expect(containsText('Seven people, walked out.', 'SEVEN people')).toBe(true)
    expect(containsText('It cost $4.2M', '$4.2M')).toBe(true)
    expect(containsText('abc', 'abd')).toBe(false)
  })
})

describe('isUntouchedStory', () => {
  it('tells a fresh story from one the person wrote in', async () => {
    const { isUntouchedStory, newStory } = await import('../src/shared/story-logic')
    const s = newStory({ id: 's1', title: 'Why recruiters skip your CV', brand: null, palette: 'mono', handle: '', now: '2026-11-06T00:00:00.000Z' })
    expect(isUntouchedStory(s)).toBe(true)
    expect(isUntouchedStory({ ...s, lines: s.lines.map((l, i) => (i === 2 ? { ...l, shown: 'My own words' } : l)) })).toBe(false)
    expect(isUntouchedStory({ ...s, lines: s.lines.slice(0, 5) })).toBe(false)
  })
})

describe('voice freshness', () => {
  const base = async () => {
    const { newStory } = await import('../src/shared/story-logic')
    return newStory({ id: 's1', title: 'Why recruiters skip your CV', brand: null, palette: 'mono', handle: '', now: '2026-11-06T00:00:00.000Z' })
  }

  it('hashes the lines as they are saved, so spaces typed around them change nothing', async () => {
    const { textHash } = await import('../src/shared/story-logic')
    const s = await base()
    const typed = { ...s, lines: s.lines.map((l, i) => (i === 1 ? { ...l, shown: `  ${l.shown}   ` } : l)) }
    expect(textHash(typed)).toBe(textHash(s))
  })

  it('a voice made for these lines, said this way, with this voice, is current; any of those changing is not', async () => {
    const { voiceKey, isVoiceCurrent, textHash } = await import('../src/shared/story-logic')
    const s = await base()
    const timing = { duration: 10, lines: [], words: [], textHash: textHash(s), voiceKey: voiceKey(s) }
    expect(isVoiceCurrent(s, timing)).toBe(true)
    expect(isVoiceCurrent({ ...s, lines: s.lines.map((l, i) => (i === 2 ? { ...l, spoken: 'it took three years' } : l)) }, timing)).toBe(false)
    expect(isVoiceCurrent({ ...s, voice: { kind: 'kokoro', voice: 'am_adam', speed: 1 } }, timing)).toBe(false)
    expect(isVoiceCurrent({ ...s, voice: { kind: 'kokoro', voice: 'af_heart', speed: 1.1 } }, timing)).toBe(false)
    expect(isVoiceCurrent({ ...s, voice: { kind: 'recording', file: 'recording.m4a' } }, timing)).toBe(false)
  })

  it('a recording only depends on what is shown and which file, not on how a voice would say it', async () => {
    const { voiceKey } = await import('../src/shared/story-logic')
    const s = { ...(await base()), voice: { kind: 'recording' as const, file: 'recording.m4a' } }
    expect(voiceKey({ ...s, lines: s.lines.map((l) => ({ ...l, spoken: 'anything' })) })).toBe(voiceKey(s))
  })

  it('falls back to the text hash for a timing made before voice keys existed', async () => {
    const { isVoiceCurrent, textHash } = await import('../src/shared/story-logic')
    const s = await base()
    expect(isVoiceCurrent(s, { duration: 1, lines: [], words: [], textHash: textHash(s) })).toBe(true)
    expect(isVoiceCurrent(s, { duration: 1, lines: [], words: [], textHash: 'nope' })).toBe(false)
  })
})
