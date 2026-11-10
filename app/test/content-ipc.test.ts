import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MakerTool } from '../src/shared/api'
import { costApproval, makeClips, MAX_CLIPS, registerContentIpc, validPicks, type ContentDeps } from '../src/main/content-ipc'
import { createScriptStore } from '../src/main/scripts'

const pick = { start: 10, end: 40, title: 'One', hookLine: 'H', reason: 'R', score: 80 }
const posts = { carousel: [], thread: [], newsletter: { subject: 'S', body: 'B' } }

function harness(over: Partial<ContentDeps> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'content-'))
  mkdirSync(join(root, 'long', 'work'), { recursive: true })
  const handlers = new Map<string, (e: unknown, ...args: any[]) => unknown>()
  const order: string[] = []
  const engine: { command?: string; args?: string[] } = {}
  const deps: ContentDeps = {
    handle: (c, fn) => handlers.set(c, fn),
    ai: () => ({ writeScript: async () => ({ hook: 'H', script: 'S', onScreenText: [] }) }) as any,
    runEngine: (async (command: string, args: string[]) => {
      Object.assign(engine, { command, args })
      return { clips: [{ project: join(root, 'long-clip-01'), title: 'One' }, { project: join(root, 'long-clip-02'), title: 'Two' }] }
    }) as any,
    scripts: createScriptStore(join(root, 'scripts.json')),
    postiz: { status: async () => ({ state: 'ready', channels: [] }), send: async (r) => ({ channels: [r.video, r.title], sentIds: [], failed: null }) },
    maker: { installed: () => false, tools: async () => [], make: async () => '' },
    addToLibrary: async () => [],
    scriptContext: async () => ({}),
    capcut: async () => ({ folder: '', video: '', srt: '' }),
    openreel: async () => ({ folder: '/x/For OpenReel', edit: '/x/e.json', cuts: 2, pictures: 1, subtitles: 3 }),
    mediaUrl: (p) => p,
    isBusy: () => false,
    storyboardFirst: async () => false,
    defaultLook: async () => ({ filter: 'none', captionStyle: null, soundEffects: false, autoColor: false }),
    setDefaultLook: async () => {},
    projectSlugs: async () => [],
    lookTemplates: async () => [],
    setLookTemplates: async () => {},
    readProjectJson: async () => ({}) as any,
    writeProjectJson: async () => {},
    setStoryboardFirst: async () => {},
    motionCards: async () => true,
    theme: async () => 'dark',
    engineInputs: async () => ({ brand: null, voiceFile: null, templates: [], activeTemplate: null, styleRules: '', motionCards: true, scripts: [], skillFolders: [] }),
    healthInputs: () => ({ doctor: async () => ({ checks: [] }), ai: async () => ({ connected: false, id: 'none', label: 'No AI' }), model: async () => ({ installed: true, downloading: false, pct: 100, name: 'small.en' }), postiz: async () => ({ state: 'missing', channels: [] }), appVersion: '0.0.0', root: '/tmp' }),
    setTheme: async () => {},
    setMotionCards: async () => {},
    reveal: () => {},
    scriptSetup: async () => ({ voicePath: null, voiceFound: false, format: '', videoFormat: 'short-vertical', nicheFound: false, beatTemplates: [], beatTemplate: 'life-climb' }),
    chooseVoice: async () => null,
    setFormat: async (format) => ({ voicePath: null, voiceFound: false, format, videoFormat: 'short-vertical', nicheFound: false, beatTemplates: [], beatTemplate: 'life-climb' }),
    setVideoFormat: async (videoFormat) => ({ voicePath: null, voiceFound: false, format: '', videoFormat, nicheFound: false, beatTemplates: [], beatTemplate: 'life-climb' }),
    setBeatTemplate: async (id) => ({ voicePath: null, voiceFound: false, format: '', videoFormat: 'short-vertical', nicheFound: false, beatTemplates: [], beatTemplate: id }),
    saveBeatTemplate: async () => ({ voicePath: null, voiceFound: false, format: '', videoFormat: 'short-vertical', nicheFound: false, beatTemplates: [], beatTemplate: 'mine' }),
    removeBeatTemplate: async () => ({ voicePath: null, voiceFound: false, format: '', videoFormat: 'short-vertical', nicheFound: false, beatTemplates: [], beatTemplate: 'life-climb' }),
    dirOf: (slug) => join(root, slug),
    projectsRoot: () => root,
    markWorking: async (slug) => { order.push(`mark ${slug}`) },
    edit: async (slug) => { order.push(`start ${slug}`); await Promise.resolve(); order.push(`end ${slug}`) },
    latestVideo: async () => '/v/final.mp4',
    title: async () => 'My video',
    log: () => {},
    readResult: async () => ({ views: null, rating: null, postedOn: null }),
    writeResult: async () => {},
    firstWords: async () => '',
    swipeFile: async () => null,
    ...over
  }
  registerContentIpc(deps)
  return { root, deps, order, engine, call: (c: string, ...args: unknown[]) => handlers.get(c)!(null, ...args) as Promise<any> }
}
const settle = () => new Promise((r) => setTimeout(r, 5))

describe('clip picks', () => {
  it('refuses an empty list, bad times and too many', () => {
    for (const bad of [[], 'x', null, [{ ...pick, end: 1 }], [{ ...pick, start: -1 }], Array(MAX_CLIPS + 1).fill(pick)]) {
      expect(() => { try { validPicks(bad) } catch (e) { throw new Error((e as { code: string }).code) } }).toThrow('BAD_PICKS')
    }
  })
})

describe('making clips', () => {
  it('hands the engine only the times and titles', async () => {
    const h = harness()
    await makeClips(h.deps, 'long', [pick])
    expect(h.engine.command).toBe('clip')
    const file = h.engine.args![h.engine.args!.indexOf('--segments') + 1]
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ segments: [{ start: 10, end: 40, title: 'One' }] })
    expect(h.engine.args).toContain(h.root)
  })

  it('returns the new videos and edits them one after another', async () => {
    const h = harness()
    expect((await makeClips(h.deps, 'long', [pick])).slugs).toEqual(['long-clip-01', 'long-clip-02'])
    await settle()
    expect(h.order).toEqual(['mark long-clip-01', 'mark long-clip-02', 'start long-clip-01', 'end long-clip-01', 'start long-clip-02', 'end long-clip-02'])
  })

  it('still edits the next clip when one fails', async () => {
    const seen: string[] = []
    const h = harness({ edit: async (slug) => { seen.push(slug); if (slug.endsWith('01')) throw new Error('boom') } })
    await makeClips(h.deps, 'long', [pick])
    await settle()
    expect(seen).toEqual(['long-clip-01', 'long-clip-02'])
  })
})

describe('script generator', () => {
  it('writes with the voice file and format, and keeps the other hooks', async () => {
    let seen: any
    const h = harness({
      ai: () => ({ writeScript: async (_idea: string, _e: unknown, _s: unknown, ctx: unknown) => { seen = ctx; return { hook: 'H', script: 'S', onScreenText: [], hooks: [{ text: 'H2', formula: 'f', words: 1, seconds: 0 }], hookFormula: 'flip', seconds: 9 } } }) as any,
      scriptContext: async () => ({ voice: 'VOICE', format: 'FORMAT' })
    })
    const saved = await h.call('script:write', 'an idea')
    expect(seen).toEqual({ voice: 'VOICE', format: 'FORMAT', results: '' }) // '' = not enough posted videos yet
    expect(saved).toMatchObject({ hook: 'H', hookFormula: 'flip', seconds: 9, hooks: [{ text: 'H2' }] })
  })
  it('keeps the kind of video a script was written for, and only takes a known format', async () => {
    const h = harness({ ai: () => ({ writeScript: async () => ({ hook: 'H', script: 'S', onScreenText: [], videoFormat: 'long', concept: 'A question, then a blunt answer' }) }) as any })
    expect(await h.call('script:write', 'an idea')).toMatchObject({ videoFormat: 'long', concept: 'A question, then a blunt answer' })
    expect(await h.call('script:setVideoFormat', 'short-horizontal')).toMatchObject({ videoFormat: 'short-horizontal' })
    expect(await h.call('script:setVideoFormat', 'square')).toMatchObject({ videoFormat: 'short-vertical' })
  })
  it('suggests ideas that skip the topics already saved', async () => {
    let seen: any
    const h = harness({ ai: () => ({ suggestIdeas: async (_e: unknown, _s: unknown, ctx: unknown) => { seen = ctx; return [{ idea: 'I', hook: 'K' }] } }) as any })
    await h.deps.scripts.save({ hook: 'Old hook', script: 'S', onScreenText: [] })
    expect(await h.call('script:ideas')).toEqual([{ idea: 'I', hook: 'K' }])
    expect(seen.avoid).toEqual(['Old hook'])
  })
  it('says what is needed when the AI cannot suggest ideas', async () => {
    await expect(Promise.resolve().then(() => harness().call('script:ideas'))).rejects.toMatchObject({ code: 'NO_AI' })
  })
  it("saves the person's own edits", async () => {
    const h = harness()
    const saved = await h.deps.scripts.save({ hook: 'H', script: 'S', onScreenText: [] })
    expect(await h.call('script:update', saved.id, { hook: 'Mine', script: 'My words' })).toMatchObject({ hook: 'Mine', script: 'My words' })
  })
})

describe('scripts', () => {
  it('saves each script it writes', async () => {
    const h = harness()
    const saved = await h.call('script:write', 'an idea')
    expect(saved.id).toBeTruthy()
    expect((await h.call('script:list')).length).toBe(1)
  })
  it('asks for an idea first', async () => {
    await expect(harness().call('script:write', '  ')).rejects.toMatchObject({ code: 'EMPTY' })
  })
})

describe('repurpose', () => {
  it('keeps what it made, so it is not paid for twice', async () => {
    const h = harness({ ai: () => ({ repurpose: async () => posts }) as any })
    expect(await h.call('repurpose:load', 'long')).toBeNull()
    await h.call('repurpose:make', 'long')
    expect(await h.call('repurpose:load', 'long')).toEqual(posts)
  })
  it('says what is needed when no AI can do it', async () => {
    const h = harness()
    await expect(Promise.resolve().then(() => h.call('repurpose:make', 'long'))).rejects.toMatchObject({ code: 'NO_AI' })
  })
})

describe('generated media', () => {
  const tool = (costUsd: number | null): MakerTool => ({ name: 'gen', provider: 'p', capability: 'video_generation', costUsd })

  it('needs agreement to the real price, not a price from the page', () => {
    expect(costApproval(tool(0.5), 0.5)).toEqual({ maxCostUsd: 0.5, acceptUnknownCost: false })
    for (const agreed of [null, 0, 0.1, 99, '0.5', undefined]) {
      expect(() => { try { costApproval(tool(0.5), agreed) } catch (e) { throw new Error((e as { code: string }).code) } }).toThrow('NEEDS_OK')
    }
  })
  it('needs agreement to an unknown price, and none for a free tool', () => {
    expect(costApproval(tool(null), null)).toEqual({ maxCostUsd: 0, acceptUnknownCost: true })
    expect(() => { try { costApproval(tool(null), 5) } catch (e) { throw new Error((e as { code: string }).code) } }).toThrow('NEEDS_OK')
    expect(costApproval(tool(0), undefined)).toEqual({ maxCostUsd: 0, acceptUnknownCost: false })
  })
  it('adds what it made to the Library and cleans up', async () => {
    let asked: any
    let added: string[] = []
    const h = harness({
      maker: {
        installed: () => true,
        tools: async () => [tool(0)],
        make: async (r) => { asked = r; writeFileSync(r.outputPath, 'x'); return r.outputPath }
      },
      addToLibrary: async (files) => { added = files; return [] }
    })
    await h.call('maker:make', { tool: 'gen', prompt: 'a cat', agreedCostUsd: 0 })
    expect(asked.prompt).toBe('a cat')
    expect(asked.outputPath.endsWith('.mp4')).toBe(true)
    expect(added).toEqual([asked.outputPath])
    expect(existsSync(asked.outputPath)).toBe(false)
  })
  it('refuses a tool the bridge does not offer', async () => {
    await expect(harness().call('maker:make', { tool: 'gone', prompt: 'p', agreedCostUsd: 0 })).rejects.toMatchObject({ code: 'BAD_TOOL' })
  })
})

describe('work that must not overlap', () => {
  it('refuses a second publish while one is running', async () => {
    let release = (): void => {}
    const gate = new Promise<void>((r) => { release = r })
    const h = harness({ latestVideo: async () => { await gate; return '/v.mp4' } })
    const first = h.call('publish:send', 'long', { caption: 'C', channelIds: ['a'], when: 'draft' })
    await expect(h.call('publish:send', 'long', { caption: 'C', channelIds: ['a'], when: 'draft' })).rejects.toMatchObject({ code: 'BUSY' })
    release()
    await first
    await expect(h.call('publish:send', 'long', { caption: 'C', channelIds: ['a'], when: 'draft' })).resolves.toBeTruthy()
  })
  it('refuses a second clip run on the same video while one is running', async () => {
    let release = (): void => {}
    const gate = new Promise<void>((r) => { release = r })
    const h = harness({ runEngine: (async () => { await gate; return { clips: [] } }) as any })
    const first = h.call('clips:make', 'long', [pick])
    await expect(h.call('clips:make', 'long', [pick])).rejects.toMatchObject({ code: 'BUSY' })
    release()
    await first
  })
})

describe('storyboard', () => {
  it('lays out the scenes with stills the page can load, and refuses while the video is busy', async () => {
    const scenes = [{ n: 1, t0: 0, t1: 2.6, text: 'I lost 45 days.', overlays: ['Text card: 45 DAYS'], still: 'work/storyboard/scene-01.jpg' }, { n: 2, t0: 2.8, t1: 4.9, text: 'Nobody warned me.', overlays: [], still: null }]
    let asked: string[] = []
    const h = harness({
      runEngine: (async (command: string, args: string[]) => { asked = [command, ...args]; return { video: 'v', scenes } }) as any,
      mediaUrl: (p) => `media:${p}`
    })
    const out = await h.call('storyboard:get', 'long')
    expect(asked).toEqual(['storyboard', '--project', join(h.root, 'long')])
    expect(out.scenes[0]).toMatchObject({ text: 'I lost 45 days.', overlays: ['Text card: 45 DAYS'], still: `media:${join(h.root, 'long', 'work/storyboard/scene-01.jpg')}` })
    expect(out.scenes[1].still).toBeNull()
    const busy = harness({ isBusy: () => true })
    await expect(busy.call('storyboard:get', 'long')).rejects.toMatchObject({ code: 'BUSY' })
  })
  it('keeps the setting', async () => {
    let on = false
    const h = harness({ storyboardFirst: async () => on, setStoryboardFirst: async (v) => { on = v } })
    expect(await h.call('storyboard:enabled')).toBe(false)
    expect(await h.call('storyboard:setEnabled', true)).toBe(true)
    expect(await h.call('storyboard:setEnabled', 'yes')).toBe(false) // only a real true turns it on
  })
})

describe('built-in looks', () => {
  it('lists Upscale first, uses it, and never deletes or overwrites it', async () => {
    let saved: any[] = [{ id: 'mine-1', name: 'Raw day', look: { filter: 'warm' } }]
    let def: any = null
    const h = harness({ lookTemplates: async () => saved, setLookTemplates: async (t) => { saved = t }, setDefaultLook: async (d) => { def = d } })
    const list = await h.call('look:templates')
    expect(list.map((t: any) => t.name)).toEqual(['Upscale', 'Raw day'])
    expect(list[0].builtIn).toBe(true)
    expect((await h.call('look:useTemplate', 'builtin-upscale')).editStyle).toBe('upscale')
    expect(def.editStyle).toBe('upscale')
    await expect(h.call('look:removeTemplate', 'builtin-upscale')).rejects.toMatchObject({ code: 'BUILT_IN' })
    await expect(h.call('look:saveTemplate', { name: 'upscale', look: {} })).rejects.toMatchObject({ code: 'BUILT_IN' })
    expect(saved.map((t) => t.name)).toEqual(['Raw day'])
  })
})

describe('appearance', () => {
  it('keeps the theme, dark unless set, and refuses anything else', async () => {
    let t = 'dark'
    const h = harness({ theme: async () => t, setTheme: async (v) => { t = v } })
    expect(await h.call('theme:get')).toBe('dark')
    expect(await h.call('theme:set', 'light')).toBe('light')
    expect(t).toBe('light')
    expect(await h.call('theme:set', 'neon')).toBe('dark')
    expect(await h.call('theme:set', 'system')).toBe('system')
  })
})

describe('motion cards', () => {
  it('keeps the setting, on unless turned off', async () => {
    let on = true
    const h = harness({ motionCards: async () => on, setMotionCards: async (v) => { on = v } })
    expect(await h.call('motion:enabled')).toBe(true)
    expect(await h.call('motion:setEnabled', false)).toBe(false)
    expect(on).toBe(false)
    expect(await h.call('motion:setEnabled', 'yes')).toBe(false) // only a real true turns it on
    expect(await h.call('motion:setEnabled', true)).toBe(true)
  })
})

describe('default look', () => {
  it('saves a cleaned default and gives it back', async () => {
    let saved: any = null
    const h = harness({ defaultLook: async () => saved ?? { filter: 'none', captionStyle: null }, setDefaultLook: async (d) => { saved = d } })
    expect(await h.call('look:setDefault', { filter: 'mono', captionStyle: { size: 126, hack: 1 } })).toEqual({ filter: 'mono', captionStyle: { size: 126 }, soundEffects: false, autoColor: true })
    expect(await h.call('look:default')).toEqual({ filter: 'mono', captionStyle: { size: 126 }, soundEffects: false, autoColor: true })
  })
  it('puts the default on every video that is not busy, and says which were skipped', async () => {
    const written: Record<string, any> = {}
    const h = harness({
      defaultLook: async () => ({ filter: 'warm', captionStyle: { size: 84 }, soundEffects: false, autoColor: false }),
      projectSlugs: async () => ['a', 'b', 'c'],
      isBusy: (slug) => slug === 'b',
      readProjectJson: async (slug) => ({ title: slug, captions: { enabled: true, style: {} } }) as any,
      writeProjectJson: async (slug, p) => { written[slug] = p }
    })
    expect(await h.call('look:applyAll')).toEqual({ updated: 2, skipped: ['b'] })
    expect(Object.keys(written)).toEqual(['a', 'c'])
    expect(written.a.look).toEqual({ filter: 'warm' })
    expect(written.a.captions.style).toEqual({ size: 84, preset: 'mine' })
  })
})

describe('look templates', () => {
  function templateHarness() {
    let saved: any[] = []
    let current: any = { filter: 'none', captionStyle: null, soundEffects: false }
    const h = harness({
      lookTemplates: async () => saved,
      setLookTemplates: async (t) => { saved = t },
      defaultLook: async () => current,
      setDefaultLook: async (d) => { current = d }
    })
    return { h, saved: () => saved, current: () => current }
  }
  it('saves a named template, cleaned, and lists it', async () => {
    const { h } = templateHarness()
    const t = await h.call('look:saveTemplate', { name: 'Raw day', look: { filter: 'mono', captionStyle: { size: 96, bad: 1 }, soundEffects: true } })
    expect(t).toMatchObject({ name: 'Raw day', look: { filter: 'mono', captionStyle: { size: 96 }, soundEffects: true } })
    expect(typeof t.id).toBe('string')
    expect((await h.call('look:templates')).map((x: any) => x.name)).toEqual(['Upscale', 'Raw day']) // built-in first
  })
  it('replaces a template of the same name instead of adding a second', async () => {
    const { h, saved } = templateHarness()
    await h.call('look:saveTemplate', { name: 'Raw day', look: { filter: 'mono' } })
    await h.call('look:saveTemplate', { name: 'raw day', look: { filter: 'faded' } })
    expect(saved().length).toBe(1)
    expect(saved()[0].look.filter).toBe('faded')
  })
  it('refuses a nameless template and too many templates', async () => {
    const { h } = templateHarness()
    await expect(h.call('look:saveTemplate', { name: ' ', look: {} })).rejects.toMatchObject({ code: 'BAD_TEMPLATE' })
    for (let i = 0; i < 20; i++) await h.call('look:saveTemplate', { name: `T${i}`, look: {} })
    await expect(h.call('look:saveTemplate', { name: 'One more', look: {} })).rejects.toMatchObject({ code: 'TOO_MANY' })
  })
  it('makes a template the default look, and removes one', async () => {
    const { h, current } = templateHarness()
    const t = await h.call('look:saveTemplate', { name: 'Raw day', look: { filter: 'mono', soundEffects: true } })
    expect(await h.call('look:useTemplate', t.id)).toMatchObject({ filter: 'mono', soundEffects: true })
    expect(current().filter).toBe('mono')
    await h.call('look:removeTemplate', t.id)
    expect((await h.call('look:templates')).filter((t: any) => !t.builtIn)).toEqual([]) // only the built-in is left
    await expect(h.call('look:useTemplate', t.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('CapCut', () => {
  it('exports, then shows the files', async () => {
    const shown: string[] = []
    const h = harness({ capcut: async (slug) => ({ folder: `/out/${slug}`, video: 'v', srt: 's' }), reveal: (p) => void shown.push(p) })
    expect(await h.call('projects:capcut', 'long')).toEqual({ folder: '/out/long', video: 'v', srt: 's' })
    expect(shown).toEqual(['/out/long'])
  })
})

describe('publish', () => {
  it('makes the OpenReel files and shows their folder', async () => {
    const shown: string[] = []
    const out = await harness({ reveal: (p) => shown.push(p) }).call('projects:openreel', 'long')
    expect(out).toMatchObject({ cuts: 2, pictures: 1, subtitles: 3 })
    expect(shown).toEqual(['/x/For OpenReel'])
  })

  it('posts the full-quality file under the project title', async () => {
    const out = await harness().call('publish:send', 'long', { caption: 'C', channelIds: ['a'], when: 'draft' })
    expect(out.channels).toEqual(['/v/final.mp4', 'My video'])
  })
})

describe('results: learning which hooks work', () => {
  const projects: Record<string, any> = {
    a: { title: 'Day 1', script: { hook: 'I look Italian.', hookFormula: 'Confession' } },
    b: { title: 'Day 2' },
    c: { title: 'Day 3', script: { hook: 'Nobody is just a job title.', hookFormula: 'Contrarian' } },
    d: { title: 'Day 4', script: { hook: 'Google your full name.' } }
  }
  const old = (views: number) => ({ views, rating: null, postedOn: '2026-10-01' })

  function withResults(start: Record<string, unknown>, over: Partial<ContentDeps> = {}) {
    const stored: Record<string, any> = { ...start }
    const h = harness({
      projectSlugs: async () => Object.keys(projects),
      readProjectJson: async (slug) => projects[slug],
      readResult: async (slug) => stored[slug] ?? { views: null, rating: null, postedOn: null },
      writeResult: async (slug, r) => {
        stored[slug] = r
      },
      firstWords: async () => 'People guess my background wrong all the time and I never correct them anymore because honestly',
      ...over
    })
    return { ...h, stored }
  }
  const swipeWith = (text: string): string => {
    const file = join(mkdtempSync(join(tmpdir(), 'swipe-')), 'swipe.md')
    writeFileSync(file, text)
    return file
  }

  it('saves a cleaned result and leaves out what the page should never send', async () => {
    const { call, stored } = withResults({})
    expect(await call('results:set', 'a', { views: 1500.4, rating: 9, postedOn: 'nope', extra: 1 })).toEqual({ views: 1500, rating: null, postedOn: null })
    expect(stored.a).toEqual({ views: 1500, rating: null, postedOn: null })
  })

  it('reads each video’s hook from its script, else from the first words heard', async () => {
    const i = await withResults({ a: old(100), b: old(200), c: old(900), d: old(150) }).call('results:insights')
    expect(i.median).toBe(175)
    expect(i.winners.map((r: any) => [r.hook, r.formula])).toEqual([['Nobody is just a job title.', 'Contrarian']])
    expect(i.rows.find((r: any) => r.slug === 'b').hook).toBe('People guess my background wrong all the time and I never correct them anymore')
  })

  it('tells the script writer what worked once there is enough', async () => {
    let seen: any = null
    const writeScript = async (_i: string, _e: unknown, _s: unknown, ctx: any) => {
      seen = ctx
      return { hook: 'H', script: 'S', onScreenText: [] }
    }
    const { call } = withResults({ a: old(100), b: old(200), c: old(900) }, { ai: () => ({ writeScript }) as any })
    await call('script:write', 'my background')
    expect(seen.results).toMatch(/4.5x "Nobody is just a job title." \(Contrarian\)/)
  })

  it('writes My outliers into swipe.md next to the voice file, and keeps the rest of it', async () => {
    const file = swipeWith('# Swipe file\n\n## Concepts\n\n### Day in the life\n')
    const { call } = withResults({ a: old(100), b: old(200) }, { swipeFile: async () => file })
    await call('results:set', 'c', old(900))
    const swipe = readFileSync(file, 'utf8')
    expect(swipe).toMatch(/## My outliers/)
    expect(swipe).toMatch(/\| 4.5x \| 900 \| "Nobody is just a job title." \| Contrarian \|/)
    expect(swipe).toMatch(/## Concepts\n\n### Day in the life/)
  })

  it('leaves swipe.md alone until three videos can be scored', async () => {
    const file = swipeWith('# Swipe file\n')
    const { call } = withResults({ a: old(100) }, { swipeFile: async () => file })
    await call('results:set', 'c', old(900))
    expect(readFileSync(file, 'utf8')).toBe('# Swipe file\n')
  })
})

describe('the house look', () => {
  it('is set by the engine from one video, read back by name, and cleared', async () => {
    const base = mkdtempSync(join(tmpdir(), 'house-'))
    const projects = join(base, 'Projects')
    mkdirSync(projects, { recursive: true })
    let asked: string[] = []
    const h = harness({
      projectsRoot: () => projects,
      dirOf: (slug) => join(projects, slug),
      runEngine: (async (command: string, args: string[]) => {
        asked = [command, ...args]
        mkdirSync(join(base, 'Library'), { recursive: true })
        writeFileSync(join(base, 'Library', 'house-look.json'), JSON.stringify({ stats: { y: 145 }, from: { project: 'Day 1' } }))
        return {}
      }) as any
    })
    expect(await h.call('look:house')).toBeNull()
    expect(await h.call('look:setHouse', 'day-1')).toEqual({ from: 'Day 1' })
    expect(asked).toEqual(['house-look', '--project', join(projects, 'day-1'), '--root', base])
    expect(await h.call('look:house')).toEqual({ from: 'Day 1' })
    await h.call('look:clearHouse')
    expect(existsSync(join(base, 'Library', 'house-look.json'))).toBe(false)
    expect(await h.call('look:house')).toBeNull()
  })

  it('waits while the video is being worked on', async () => {
    const h = harness({ isBusy: () => true })
    await expect(h.call('look:setHouse', 'busy')).rejects.toMatchObject({ code: 'BUSY' })
  })
})
