import { describe, expect, it } from 'vitest'
import { FORMAT_OPTIONS, formatOf, frameFor, isPortraitTake, projectFormat, viralityChecks, type CheckedScript, type VideoFormat } from '../src/shared/formats'
import { adaptedFor } from '../src/main/content-ipc'
import { FORMATS, FORMAT_PROFILES } from '../../ai/src/formats'

describe('video formats', () => {
  it('match the AI package: same keys, labels, frames and length windows', () => {
    expect(FORMAT_OPTIONS.map((f) => f.key)).toEqual([...FORMATS])
    for (const f of FORMAT_OPTIONS) {
      const ai = FORMAT_PROFILES[f.key]
      expect([f.label, f.width, f.height, ...f.seconds]).toEqual([ai.label, ai.width, ai.height, ...ai.seconds])
    }
  })

  it('give a new video its frame, and read a project back', () => {
    expect(frameFor('short-vertical')).toEqual({ width: 1080, height: 1920, fps: 30, kind: 'short-vertical' })
    expect(frameFor('long', 25)).toEqual({ width: 1920, height: 1080, fps: 25, kind: 'long' })
    expect(projectFormat({ width: 1920, height: 1080 })).toBe('short-horizontal')
    expect(projectFormat({ width: 1920, height: 1080, kind: 'long' })).toBe('long')
    expect(projectFormat(undefined)).toBe('short-vertical')
    expect(formatOf('square')).toBe('short-vertical')
  })

  it('know an upright phone take, also when it is stored sideways', () => {
    expect(isPortraitTake({ width: 1080, height: 1920, rotation: 0 })).toBe(true)
    expect(isPortraitTake({ width: 1920, height: 1080, rotation: 90 })).toBe(true)
    expect(isPortraitTake({ width: 1920, height: 1080, rotation: 0 })).toBe(false)
    expect(isPortraitTake({})).toBe(false)
  })
})

describe('virality checklist', () => {
  const good: CheckedScript = {
    hook: 'I spent 45 days posting every single day.',
    onScreenText: ['45 days, 0 sales'],
    script: ['I spent 45 days posting every single day.', 'Nobody bought anything.', 'But here is the part nobody says.', 'The views were never the problem.', 'The offer was.', 'Fix the offer first.'].join('\n'),
    seconds: 30
  }
  const failing = (s: CheckedScript, f: VideoFormat = 'short-vertical'): string[] =>
    viralityChecks(s, f)
      .filter((c) => !c.ok)
      .map((c) => c.key)

  it('passes a short, cold, specific hook with a re-hook and the right length', () => {
    expect(failing(good)).toEqual([])
  })

  it('flags a greeting, a long vague hook, a repeated on-screen hook and no re-hook', () => {
    const hook = 'Hey guys so today I want to talk about something really important to me'
    expect(failing({ hook, onScreenText: [hook], script: 'Hey guys.\nOne.\nTwo.\nThree.\nFour.', seconds: 30 })).toEqual(['hook-short', 'hook-cold', 'hook-specific', 'screen-hook', 'rehook'])
  })

  it('counts a name as specific, and flags only the length of a 14-word hook', () => {
    expect(failing({ ...good, hook: 'I look Italian, talk like I’m Greek, and grew up in the West Island.' })).toEqual(['hook-short'])
    expect(failing({ ...good, hook: 'I look Italian. I’m Palestinian.' })).toEqual([])
  })

  it('judges length by the format, and wants chapters for long-form', () => {
    expect(failing({ ...good, seconds: 75 }, 'short-horizontal')).toEqual([])
    expect(failing({ ...good, seconds: 75 })).toEqual(['length'])
    expect(failing({ ...good, seconds: 480 }, 'long')).toEqual(['screen-hook'])
    expect(failing({ ...good, seconds: 480, onScreenText: ['The mistake', 'The fix', 'The result'] }, 'long')).toEqual([])
  })
})

describe('adapted posts when publishing', () => {
  const adapted = {
    from: 'The Instagram caption',
    tiktok: { caption: 'TikTok words', hashtags: ['#a', '#b', '#c', '#d'] },
    youtube: { caption: 'The description', hashtags: ['#a', '#b', '#c'], title: 'A title' }
  }
  it('go to TikTok and YouTube with their hashtags and title', () => {
    expect(adaptedFor('The Instagram caption', adapted)).toEqual({
      tiktok: { caption: 'TikTok words\n\n#a #b #c #d' },
      youtube: { caption: 'The description\n\n#a #b #c', title: 'A title' }
    })
  })
  it('are left out once the Instagram caption changed, so nothing stale is posted', () => {
    expect(adaptedFor('A new caption', adapted)).toEqual({})
    expect(adaptedFor('x', undefined)).toEqual({})
  })
})
