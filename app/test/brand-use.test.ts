import { describe, expect, it } from 'vitest'
import { parseBrandProfile } from '../src/shared/brand-profile'
import { brandSettings, lookByName, profileForWriting, styleFileName, profileKind } from '../src/shared/brand-use'

const PERSONAL = [
  '# Brand profile: Personal (Sam)',
  '## Voice',
  '- voice file: ~/matcha/content/video-agent/voice.md',
  '- personality file: ~/matcha/content/video-agent/brand.md',
  '- script rules: /abs/framework.md',
  '- words I never say: {{to fill}} (comma-separated)',
  '## Look: short-form video',
  '- default look: One-take studio',
  ''
].join('\n')

const ACME = [
  '# Brand profile: Acme (the page)',
  '## Identity',
  '- kind: company',
  '## Voice: {{Alex}}',
  '- voice file: {{Alex}} (to be written)',
  '- tone: {{Alex}}',
  '## Look: short-form video',
  '- default look: Acme brand',
  ''
].join('\n')

describe('a person or a company brand', () => {
  const kindOf = (lines: string) => profileKind(parseBrandProfile(`# Brand profile: X\n## Identity\n${lines}\n`))
  it('the kind line decides; without it, "speaks as" does; else a person', () => {
    expect(kindOf('- kind: company')).toBe('company')
    expect(kindOf('- kind: Brand')).toBe('company')
    expect(kindOf('- kind: influencer')).toBe('person')
    expect(kindOf('- speaks as: the product, "we" (mostly faceless)')).toBe('company')
    expect(kindOf('- speaks as: me, on camera (first person)')).toBe('person')
    expect(kindOf('- name: Alex')).toBe('person')
    expect(kindOf('- kind: {{to fill}}\n- speaks as: we')).toBe('company')
  })
})

describe('brandSettings', () => {
  it('reads the files and the look, with ~ as the home folder', () => {
    expect(brandSettings(parseBrandProfile(PERSONAL), '/Users/z')).toEqual({
      kind: 'person',
      voiceFile: '/Users/z/matcha/content/video-agent/voice.md',
      personalityFile: '/Users/z/matcha/content/video-agent/brand.md',
      scriptRulesFile: '/abs/framework.md',
      defaultLook: 'One-take studio'
    })
  })

  it('leaves out what is still waiting for an answer', () => {
    expect(brandSettings(parseBrandProfile(ACME), '/Users/z')).toEqual({
      kind: 'company',
      voiceFile: null,
      personalityFile: null,
      scriptRulesFile: null,
      defaultLook: 'Acme brand'
    })
  })

  it('ignores a file value that is not a path', () => {
    const p = parseBrandProfile('# Brand profile: X\n## Voice\n- voice file: the one Alex writes\n')
    expect(brandSettings(p, '/Users/z').voiceFile).toBeNull()
  })
})

describe('styleFileName', () => {
  it('keeps My style.json for Personal and for no brand, and gives other brands their own file', () => {
    expect(styleFileName(null)).toBe('My style.json')
    expect(styleFileName('personal')).toBe('My style.json')
    expect(styleFileName('acme')).toBe('My style (acme).json')
  })
})

describe('lookByName', () => {
  const templates = [
    { id: 'a', name: 'One-take studio', look: { filter: 'none' } },
    { id: 'b', name: 'Acme brand', look: { filter: 'warm' } }
  ]
  it('finds a saved look by its name, ignoring case and spaces', () => {
    expect(lookByName(templates, '  acme BRAND ')?.id).toBe('b')
  })
  it('returns null for a look that is not saved, or no name', () => {
    expect(lookByName(templates, 'Raw day')).toBeNull()
    expect(lookByName(templates, null)).toBeNull()
  })
})

describe('profileForWriting', () => {
  it('drops the lines and sections still waiting for an answer, so the writer never sees a placeholder', () => {
    const out = profileForWriting(ACME)
    expect(out).not.toMatch(/\{\{/)
    expect(out).toContain('- default look: Acme brand')
    expect(out).not.toContain('## Voice')
  })
  it('keeps everything that is filled in', () => {
    expect(profileForWriting(PERSONAL)).toContain('- script rules: /abs/framework.md')
    expect(profileForWriting(PERSONAL)).not.toContain('words I never say')
  })
})

describe('carouselDefaults', () => {
  const ACME_LOOK = [
    '# Brand profile: Acme (the page)',
    '## Identity',
    '- instagram: @acme.app',
    '## Look: short-form video',
    '- illustration: cut-paper style, from ~/kit/cut-paper (the -dark versions on Aubergine), at most one on screen',
    '- logo: ~/kit/logo-1200.png (full colour on dark only; never retype the wordmark)',
    '## Look: carousels',
    '- style preset: cut-paper (Acme’s own preset, built from the brand kit)',
    ''
  ].join('\n')

  it('reads the style, the handle and the paths out of the notes around them', async () => {
    const { carouselDefaults } = await import('../src/shared/brand-use')
    expect(carouselDefaults(parseBrandProfile(ACME_LOOK), '/Users/z')).toEqual({
      style: 'cut-paper',
      handle: '@acme.app',
      logo: '/Users/z/kit/logo-1200.png',
      artDir: '/Users/z/kit/cut-paper'
    })
  })

  it('falls back to Editorial, no handle and no files when they are not filled in', async () => {
    const { carouselDefaults } = await import('../src/shared/brand-use')
    expect(carouselDefaults(parseBrandProfile(PERSONAL), '/Users/z')).toEqual({ style: 'editorial', handle: '', logo: null, artDir: null })
  })
})

describe('carouselDefaults paths with spaces', () => {
  it('keeps a path with spaces whole, up to the note in brackets', async () => {
    const { carouselDefaults } = await import('../src/shared/brand-use')
    const p = parseBrandProfile('# Brand profile: X\n## Look\n- logo: ~/My Kit/logo one.png (full colour)\n- illustration: art, from /Users/z/Brand Kit/cut paper, at most one\n')
    expect(carouselDefaults(p, '/Users/z')).toMatchObject({ logo: '/Users/z/My Kit/logo one.png', artDir: '/Users/z/Brand Kit/cut paper' })
  })
})

describe('editBrief', () => {
  it('reads the sign-off and the ask, leaving out what is still to fill', async () => {
    const { editBrief } = await import('../src/shared/brand-use')
    const p = parseBrandProfile('# Brand profile: X\n## Voice\n- sign-off: "That\'s me, briefly. See you tomorrow."\n- call to action: a follow or the waitlist ("Waitlist link in bio.")\n')
    expect(editBrief(p)).toEqual({ signoff: '"That\'s me, briefly. See you tomorrow."', ask: 'a follow or the waitlist ("Waitlist link in bio.")' })
    const pending = parseBrandProfile('# Brand profile: X\n## Voice: {{Alex}}\n- call to action: the waitlist {{Alex}} to confirm\n')
    expect(editBrief(pending)).toEqual({})
  })
})
