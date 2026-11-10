import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildHowMade, cardsOf, estimateFromCut, wordTimes } from '../src/main/how-made'
import { appendTrace } from '../src/main/trace'

function project(): string {
  const d = mkdtempSync(join(tmpdir(), 'howmade-'))
  const put = (rel: string, v: unknown) => {
    mkdirSync(join(d, rel, '..'), { recursive: true })
    writeFileSync(join(d, rel), typeof v === 'string' ? v : JSON.stringify(v))
  }
  put('project.json', {
    captions: { emphasis: ['w2'] },
    zooms: [{ anchor: { from: 'w2', to: 'w3' }, scale: 1.06 }, { anchor: { from: 'w9', to: 'w9' }, scale: 1.2 }],
    broll: [{ id: 'b1', asset: 'work/assets/anim-list-reveal-1.mov', params: {} }, { id: 'b2', asset: 'Library/Images/school-bell.jpg', params: {} }],
    soundEffects: { enabled: true },
    music: { enabled: false, track: null },
    look: { editStyle: 'upscale', filter: 'none' }
  })
  put('work/captions.json', { cues: [{ s: 0, e: 0.4, text: 'my', ids: ['w1'] }, { s: 0.4, e: 0.9, text: 'hot take', ids: ['w2', 'w3'] }] })
  put('work/layers/layers.json', { items: [{ id: 'b1', treatment: 'animation', t0: 1, t1: 3 }, { id: 'b2', treatment: 'card-above-head', t0: 4, t1: 5.5 }, { id: 'b3', treatment: 'text-pop', t0: 6, t1: 7, text: '9 to 5' }, { id: 'b4', skipped: 'no file' }] })
  put('work/transcript.json', { words: [{ id: 'w1', s: 2, e: 2.3 }, { id: 'w99', s: 30, e: 31.5 }] })
  put('work/assets/anim-list-reveal-1.anim.json', { params: { items: ['In the shower', 'On the way to school'] } })
  put('versions/v1/render.json', { duration: 8, segmentsDetail: [{ source: 's1', src_start: 2, src_end: 5, out_start: 0 }, { source: 's1', src_start: 9, src_end: 14, out_start: 3 }] })
  put('versions/v1/verify.json', { checks: [{ name: 'loudness', status: 'PASS', detail: '-14 LUFS' }, { name: 'black frames', status: 'WARN', detail: '1 frame' }] })
  put('versions/v1/notes.md', '# v1\n\nFirst edit.\n\nI cut the pauses.')
  return d
}

describe('how it was made', () => {
  it('lays the edit out on the finished video\'s timeline', async () => {
    const d = project()
    await appendTrace(d, { type: 'job', at: 'x', kind: 'first-edit' })
    await appendTrace(d, { type: 'step', at: 'x', name: 'set_cut', args: {}, ok: true, summary: 'Kept the best take' })
    const h = await buildHowMade(d)
    expect(h.version).toBe(1)
    expect(h.duration).toBe(8)
    expect(h.lanes.cut).toEqual([{ t0: 0, t1: 3, source: 's1', from: 2, to: 5 }, { t0: 3, t1: 8, source: 's1', from: 9, to: 14 }])
    expect(h.lanes.words).toEqual([{ t0: 0, t1: 0.4, text: 'my', key: false }, { t0: 0.4, t1: 0.9, text: 'hot take', key: true }])
    expect(h.lanes.zooms).toEqual([{ t0: 0.4, t1: 0.9, scale: 1.06 }]) // the zoom on a word not in the cut is left out
    expect(h.lanes.cards.map((c) => [c.kind, c.label])).toEqual([['animation', 'In the shower · On the way to school'], ['picture', 'school bell'], ['text', '9 to 5']])
    expect(h.checks).toEqual([{ name: 'loudness', ok: true, warn: false, detail: '-14 LUFS' }, { name: 'black frames', ok: false, warn: true, detail: '1 frame' }])
    expect(h.summary).toBe('First edit.\n\nI cut the pauses.')
    expect(h.stats).toEqual({ keptSeconds: 8, sourceSeconds: 31.5, cuts: 1, keyWords: 1 })
    expect(h.sound).toEqual({ effects: true, music: null })
    expect(h.look).toEqual({ editStyle: 'upscale', filter: 'none' })
    expect(h.jobs).toEqual([{ kind: 'first-edit', at: 'x', entries: [{ type: 'step', at: 'x', name: 'set_cut', args: {}, ok: true, summary: 'Kept the best take' }] }])
  })

  it('a video with no render yet is an empty timeline, never an error', async () => {
    const d = mkdtempSync(join(tmpdir(), 'howmade-empty-'))
    const h = await buildHowMade(d)
    expect(h).toMatchObject({ version: null, duration: 0, lanes: { cut: [], words: [], cards: [], zooms: [] }, checks: [], jobs: [] })
  })

  it('maps each word to the first caption that shows it', () => {
    const at = wordTimes([{ s: 1, e: 2, ids: ['a', 'b'] }, { s: 3, e: 4, ids: ['b'] }, { s: 'x', e: 1, ids: ['c'] }])
    expect(at.get('b')).toEqual({ s: 1, e: 2 })
    expect(at.has('c')).toBe(false)
    expect(cardsOf([{ id: 'z', t0: 0, t1: 1, treatment: 'side-card' }], [])).toEqual([{ id: 'z', t0: 0, t1: 1, kind: 'picture', treatment: 'side-card', label: 'z', behind: false }])
  })

  it('rebuilds the cut and words from the kept takes when the render left no timing', async () => {
    const words = [
      { id: 'w0', s: 1, e: 1.5, w: 'um', source: 's1' },
      { id: 'w1', s: 2, e: 2.4, w: 'my', source: 's1' },
      { id: 'w2', s: 2.5, e: 3, w: 'take', source: 's1' },
      { id: 'w3', s: 10, e: 10.5, w: 'again', source: 's1' }
    ]
    const est = estimateFromCut([{ from: 'w1', to: 'w2' }, { from: 'w3', to: 'w3' }, { from: 'w9', to: 'w9' }], words)
    expect(est.cut).toEqual([{ t0: 0, t1: 1, source: 's1', from: 2, to: 3 }, { t0: 1, t1: 1.5, source: 's1', from: 10, to: 10.5 }])
    expect(est.words.map((w) => [w.text, w.s])).toEqual([['my', 0], ['take', 0.5], ['again', 1]])
    expect(est.duration).toBe(1.5)

    const d = mkdtempSync(join(tmpdir(), 'howmade-est-'))
    mkdirSync(join(d, 'work'), { recursive: true })
    mkdirSync(join(d, 'versions', 'v1'), { recursive: true })
    writeFileSync(join(d, 'project.json'), JSON.stringify({ cut: { keep: [{ from: 'w1', to: 'w2' }] }, captions: { emphasis: ['w2'] }, zooms: [{ anchor: { from: 'w1', to: 'w2' }, scale: 1.05 }] }))
    writeFileSync(join(d, 'work', 'transcript.json'), JSON.stringify({ words }))
    writeFileSync(join(d, 'versions', 'v1', 'render.json'), JSON.stringify({ version: 1 }))
    const h = await buildHowMade(d)
    expect(h.estimated).toBe(true)
    expect(h.duration).toBe(1)
    expect(h.lanes.words.map((w) => [w.text, w.key])).toEqual([['my', false], ['take', true]])
    expect(h.lanes.zooms).toEqual([{ t0: 0, t1: 1, scale: 1.05 }])
  })
})
