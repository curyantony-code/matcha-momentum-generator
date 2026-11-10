import { describe, expect, it } from 'vitest'
import { FILTER_GROUPS, FILTERS, MAX_TEMPLATE_NAME, NO_DEFAULT_LOOK, PICTURE_STYLES, applyTemplateToVideo, cleanDefaultLook, cleanVideoLook, cleanTemplate, isFilter, withDefaultLook } from '../src/shared/looks'

const project = { title: 'T', captions: { enabled: true, style: { size: 105, color: '#FFFFFF' }, corrections: [] } }
const NOTHING = { ...NO_DEFAULT_LOOK, autoColor: false }

describe('default look', () => {
  it('adds the filter and marks the subtitle style as the person’s own, keeping the rest', () => {
    const out = withDefaultLook(project, { filter: 'warm', captionStyle: { size: 126, box: true }, soundEffects: false, autoColor: false })
    expect(out.look).toEqual({ filter: 'warm' })
    expect(out.captions).toEqual({ enabled: true, corrections: [], style: { size: 126, color: '#FFFFFF', box: true, preset: 'mine' } })
    expect(out.title).toBe('T')
  })

  it('changes nothing when there is no default', () => {
    expect(withDefaultLook(project, NOTHING)).toEqual(project)
  })

  it('does not change the project it was given', () => {
    const before = JSON.parse(JSON.stringify(project))
    withDefaultLook(project, { filter: 'mono', captionStyle: { size: 84 }, soundEffects: false, autoColor: true })
    expect(project).toEqual(before)
  })

  it('keeps only known filters and subtitle fields from the page', () => {
    expect(cleanDefaultLook({ filter: 'sepia; drop', captionStyle: { size: 9999, evil: 'x', color: 'red', box: 'yes' } })).toEqual({
      filter: 'none',
      captionStyle: { size: 300 },
      soundEffects: false,
      autoColor: true
    })
    expect(cleanDefaultLook({ filter: 'film', captionStyle: { position: 0.66, color: '#ffd60a', outlineColor: '#000000', box: true } })).toEqual({
      filter: 'film',
      captionStyle: { position: 0.66, color: '#FFD60A', outlineColor: '#000000', box: true },
      soundEffects: false,
      autoColor: true
    })
    expect(cleanDefaultLook(null)).toEqual(NO_DEFAULT_LOOK)
    expect(cleanDefaultLook({ filter: 'vivid', captionStyle: {} })).toEqual({ filter: 'vivid', captionStyle: null, soundEffects: false, autoColor: true })
  })

  it('can turn sound effects on for new videos, and only a real true counts', () => {
    expect(withDefaultLook(project, { ...NOTHING, soundEffects: true })).toMatchObject({ soundEffects: { enabled: true } })
    expect(withDefaultLook(project, NOTHING)).not.toHaveProperty('soundEffects')
    expect(cleanDefaultLook({ filter: 'none', soundEffects: 'yes' }).soundEffects).toBe(false)
    expect(cleanDefaultLook({ filter: 'none', soundEffects: true }).soundEffects).toBe(true)
  })

  it('turns auto colour on for new videos unless the person turned it off', () => {
    expect(cleanDefaultLook({ filter: 'warm' }).autoColor).toBe(true) // settings saved before the feature
    expect(cleanDefaultLook({ filter: 'warm', autoColor: false }).autoColor).toBe(false)
    expect(withDefaultLook(project, { ...NOTHING, autoColor: true }).look).toEqual({ autoColor: true })
    expect(withDefaultLook(project, { ...NOTHING, filter: 'film', autoColor: true }).look).toEqual({ filter: 'film', autoColor: true })
    expect(withDefaultLook(project, NOTHING)).not.toHaveProperty('look')
  })

  it('keeps a caption font only when the app ships it', () => {
    expect(cleanDefaultLook({ filter: 'none', captionStyle: { font: 'Roboto Medium' } }).captionStyle).toEqual({ font: 'Roboto Medium' })
    expect(cleanDefaultLook({ filter: 'none', captionStyle: { font: 'Comic Sans' } }).captionStyle).toBeNull()
    expect(cleanDefaultLook({ filter: 'none', captionStyle: { font: 'Inter SemiBold' } }).captionStyle).toBeNull() // shipped, but swapped by libass
  })

  it('keeps a template only with a name and a clean look, and caps the name', () => {
    const t = cleanTemplate({ id: 'a1', name: '  Raw day  ', look: { filter: 'mono', captionStyle: { color: '#ffffff', evil: 1 }, soundEffects: true } })
    expect(t).toEqual({ id: 'a1', name: 'Raw day', look: { filter: 'mono', captionStyle: { color: '#FFFFFF' }, soundEffects: true, autoColor: true } })
    expect(cleanTemplate({ id: 'a2', name: '   ', look: {} })).toBeNull()
    expect(cleanTemplate({ name: 'No id', look: {} })).toBeNull()
    expect(cleanTemplate({ id: 'a3', name: 'x'.repeat(80), look: {} })!.name.length).toBe(MAX_TEMPLATE_NAME)
  })

  it('applies a template to one video: its filter, auto colour, subtitle style and sound, even back to none', () => {
    const video = { title: 'T', captions: { enabled: true, style: { size: 105 } }, look: { filter: 'warm' as const }, soundEffects: { enabled: true } }
    const out = applyTemplateToVideo(video, NOTHING)
    expect(out.look).toEqual({ filter: 'none', autoColor: false })
    expect(out.soundEffects).toEqual({ enabled: false })
    expect(out.captions.style).toEqual({ size: 105 })
    const styled = applyTemplateToVideo(video, { filter: 'mono', captionStyle: { size: 84 }, soundEffects: true, autoColor: true })
    expect(styled.captions.style).toEqual({ size: 84, preset: 'mine' })
    expect(styled.look).toEqual({ filter: 'mono', autoColor: true })
  })

  it('keeps a picture style only when it is one the engine knows, and "as now" means nothing stored', () => {
    expect(cleanDefaultLook({ filter: 'none', pictureStyle: 'rounded' }).pictureStyle).toBe('rounded')
    expect(cleanDefaultLook({ filter: 'none', pictureStyle: 'polaroid' })).not.toHaveProperty('pictureStyle')
    expect(cleanDefaultLook({ filter: 'none', pictureStyle: 'as-is' })).not.toHaveProperty('pictureStyle')
    expect(cleanDefaultLook({ filter: 'none', pictureColor: '#f58d3d' }).pictureColor).toBe('#F58D3D')
    expect(cleanDefaultLook({ filter: 'none', pictureColor: 'orange' })).not.toHaveProperty('pictureColor')
  })

  it('gives new videos the picture style, and a template sets it for one video', () => {
    expect(withDefaultLook(project, { ...NOTHING, pictureStyle: 'rounded' }).look).toEqual({ pictureStyle: 'rounded' })
    expect(withDefaultLook(project, { ...NOTHING, filter: 'warm', autoColor: true, pictureStyle: 'notebook', pictureColor: '#F6F3F8' }).look)
      .toEqual({ filter: 'warm', autoColor: true, pictureStyle: 'notebook', pictureColor: '#F6F3F8' })
    const video = { title: 'T', look: { filter: 'warm' as const, pictureStyle: 'outline' as const } }
    expect(applyTemplateToVideo(video, { ...NOTHING, pictureStyle: 'rounded' }).look).toEqual({ filter: 'none', autoColor: false, pictureStyle: 'rounded' })
    expect(applyTemplateToVideo(video, NOTHING).look).toEqual({ filter: 'none', autoColor: false }) // back to as now
  })

  it('keeps every look field a video can change, and drops anything else', () => {
    expect(cleanVideoLook({ filter: 'warm', autoColor: false, pictureStyle: 'rounded', pictureColor: '#ffffff', evil: 'x' }))
      .toEqual({ filter: 'warm', autoColor: false, pictureStyle: 'rounded', pictureColor: '#FFFFFF' })
    expect(cleanVideoLook({ filter: 'sepia', autoColor: 'yes', pictureStyle: 'polaroid' })).toEqual({})
    expect(cleanVideoLook({ pictureStyle: 'as-is', filter: 'none' })).toEqual({ filter: 'none' })
    expect(cleanVideoLook(null)).toEqual({})
  })

  it('names every picture style the engine knows', () => {
    expect(PICTURE_STYLES.map((s) => s.key)).toEqual(['as-is', 'rounded', 'notebook', 'outline'])
  })

  it('names every filter the engine knows: its own seven, then OpenReel’s 30 colour presets in groups', () => {
    expect(FILTERS.slice(0, 7).map((f) => f.key)).toEqual(['none', 'warm', 'cool', 'vivid', 'film', 'faded', 'mono'])
    expect(FILTERS).toHaveLength(37)
    expect(isFilter('mono')).toBe(true)
    expect(isFilter('cinematic-teal-orange')).toBe(true)
    expect(isFilter('sepia')).toBe(false)
    expect(new Set(FILTERS.map((f) => f.key)).size).toBe(37) // no name twice
    for (const f of FILTERS) expect(FILTER_GROUPS).toContain(f.group)
    expect(cleanVideoLook({ filter: 'mood-golden-hour' })).toEqual({ filter: 'mood-golden-hour' })
  })
})

describe('the built-in Upscale look', () => {
  it('keeps its key-word captions and edit style through cleaning', async () => {
    const { BUILT_IN_LOOKS, cleanDefaultLook } = await import('../src/shared/looks')
    const up = BUILT_IN_LOOKS.find((t) => t.name === 'Upscale')!
    expect(cleanDefaultLook(up.look)).toEqual(up.look)
    expect(up.look.captionStyle).toMatchObject({ maxWords: 3, keyFont: 'DM Serif Display', keyItalic: true })
    expect(up.look.editStyle).toBe('upscale')
  })

  it('refuses a key font the app does not ship, and clamps the key size', async () => {
    const { cleanDefaultLook } = await import('../src/shared/looks')
    const l = cleanDefaultLook({ captionStyle: { size: 64, keyFont: 'Comic Sans', keyScale: 9, keyItalic: 'yes' } })
    expect(l.captionStyle).toEqual({ size: 64, keyScale: 3 })
  })

  it('carries the edit style into a new video and into one video', async () => {
    const { BUILT_IN_LOOKS, withDefaultLook, applyTemplateToVideo } = await import('../src/shared/looks')
    const up = BUILT_IN_LOOKS[0]!.look
    expect(withDefaultLook({}, up).look).toMatchObject({ editStyle: 'upscale', pictureStyle: 'rounded' })
    expect(applyTemplateToVideo({ look: { filter: 'warm' } }, up).look).toMatchObject({ editStyle: 'upscale', filter: 'none' })
    expect((withDefaultLook({}, up) as any).captions.style).toMatchObject({ preset: 'mine', keyFont: 'DM Serif Display' })
  })
})
