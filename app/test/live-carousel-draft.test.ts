// A live carousel draft through the person's own connected AI, for each brand, with the same writer context the app
// builds. Skipped unless LIVE_DRAFT=1 (it uses their AI and reads their real brand files, never writes them).
// LIVE_DRAFT_OUT=<folder> keeps the drafts as JSON there.
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { activeBrand, defaultBrandsDir, writerFilesFor } from '../src/main/brands'
import { styleFileName } from '../src/shared/brand-use'
import { applyDraft, checkCarousel, newCarousel, type CarouselDraft } from '../src/shared/carousel'

const LIVE = process.env.LIVE_DRAFT === '1'
const ROOT = join(homedir(), 'Documents', 'Matcha Momentum Generator')
const AI_SETTINGS = join(homedir(), 'Library', 'Application Support', 'Matcha Momentum Generator', 'ai')
const TOPICS: Record<string, string> = {
  personal: 'Being good at many things in a world that wants you to be one thing',
  acme: 'Your CV hides who you are'
}

async function rulesText(file: string): Promise<string> {
  const j = (await fs.readFile(file, 'utf8').then(JSON.parse).catch(() => null)) as { rules?: { text?: unknown }[] } | null
  return (j?.rules ?? []).flatMap((r) => (typeof r?.text === 'string' && r.text.trim() ? [`- ${r.text.trim()}`] : [])).join('\n')
}

describe.skipIf(!LIVE)('live carousel draft', () => {
  for (const id of Object.keys(TOPICS)) {
    it(`drafts for ${id}`, async () => {
      // ai/dist is build output (not in git): load it by path at run time, so typechecking never needs it built
      const dist = '../../ai/dist/index.js'
      const { createAI } = (await import(/* @vite-ignore */ dist)) as { createAI: (o: unknown) => { draftCarousel: (...a: unknown[]) => Promise<CarouselDraft> } }
      const brand = await activeBrand(defaultBrandsDir(), id, homedir())
      expect(brand).not.toBeNull()
      const files = await writerFilesFor(id, brand, null)
      const voice = files.voiceFile ? (await fs.readFile(files.voiceFile, 'utf8').catch(() => '')).slice(0, 20_000) : ''
      const ai = createAI({ host: { reelStudioRoot: () => ROOT } as never, settingsDir: AI_SETTINGS })
      const started = Date.now()
      const draft = await ai.draftCarousel(TOPICS[id]!, () => undefined, undefined, {
        voice, brand: files.brand, framework: files.framework, styleRules: await rulesText(join(ROOT, styleFileName(id))), slides: 6
      })
      const c = applyDraft(newCarousel({ id: 'live', title: TOPICS[id]!, brand: id, style: 'cut-paper', handle: '', now: new Date().toISOString() }), draft)
      const out = { brand: id, topic: TOPICS[id], seconds: Math.round((Date.now() - started) / 1000), voiceUsed: !!voice, notes: checkCarousel(c), draft }
      if (process.env.LIVE_DRAFT_OUT) await fs.writeFile(join(process.env.LIVE_DRAFT_OUT, `draft-${id}.json`), JSON.stringify(out, null, 2))
      expect(draft.slides.length).toBeGreaterThanOrEqual(5)
    }, 300_000)
  }
})
