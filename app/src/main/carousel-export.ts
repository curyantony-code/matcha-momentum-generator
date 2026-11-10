// Draws each carousel slide to a 1080 × 1350 PNG: the slide's own HTML (shared/carousel-render.ts) in an offscreen
// window, then capturePage. Same technique as capture.ts, locked down the same way: the page is generated from the
// person's words, has no script of its own, and may load nothing but the data: URLs inside it.
import { BrowserWindow, session, type Session } from 'electron'
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Carousel } from '../shared/carousel'
import { SLIDE_HEIGHT, SLIDE_WIDTH, slideHtml, type CarouselAssets } from '../shared/carousel-render'

const PARTITION = 'reelstudio-carousel' // memory only, gone when the app quits
let ses: Session | null = null
/** The one slide file an export may load right now (null between exports). */
let allowedFile: string | null = null

function exportSession(): Session {
  if (ses) return ses
  const s = session.fromPartition(PARTITION, { cache: false })
  s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  s.setPermissionCheckHandler(() => false)
  s.on('will-download', (e) => e.preventDefault())
  // Only the exact slide file being drawn and its data: URLs: nothing from the network or the rest of the disk.
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => cb({ cancel: !(d.url.startsWith('data:') || (allowedFile !== null && d.url === allowedFile)) }))
  ses = s
  return s
}

const pad = (n: number): string => String(n).padStart(2, '0')

// One export at a time: the session allows one slide file, and two exports would race over it.
let queue: Promise<unknown> = Promise.resolve()

/**
 * Writes 01.png … into `outDir` and returns their paths, in order. The slides are drawn into a temp folder first:
 * the old PNGs are replaced only once every new one is made, so a failed export leaves the last good set.
 */
export function exportCarousel(c: Carousel, assets: CarouselAssets, outDir: string): Promise<string[]> {
  const run = queue.catch(() => undefined).then(() => exportNow(c, assets, outDir))
  queue = run.catch(() => undefined)
  return run
}

async function exportNow(c: Carousel, assets: CarouselAssets, outDir: string): Promise<string[]> {
  const work = await mkdtemp(join(tmpdir(), 'reel-carousel-'))
  const win = new BrowserWindow({
    show: false, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, useContentSize: true, frame: false, resizable: false,
    enableLargerThanScreen: true, paintWhenInitiallyHidden: true, backgroundColor: '#000000',
    webPreferences: {
      session: exportSession(), offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
      webviewTag: false, devTools: false, backgroundThrottling: false, spellcheck: false, webgl: false, plugins: false
    }
  })
  try {
    win.setContentSize(SLIDE_WIDTH, SLIDE_HEIGHT)
    const wc = win.webContents
    wc.setWindowOpenHandler(() => ({ action: 'deny' }))
    wc.on('will-navigate', (e) => e.preventDefault())
    const drawn: string[] = []
    const file = join(work, 'slide.html')
    allowedFile = pathToFileURL(file).href
    for (let i = 0; i < c.slides.length; i++) {
      await writeFile(file, slideHtml(c, i, assets), 'utf8')
      await win.loadFile(file)
      // fonts are data: URLs, but still decode asynchronously: wait for them and two frames before the capture
      await wc.executeJavaScript('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))))', true)
      let img = await wc.capturePage()
      if (img.isEmpty()) throw { code: 'EXPORT_FAILED', userMessage: 'A slide came out empty. Try again.' }
      if (img.getSize().width !== SLIDE_WIDTH) img = img.resize({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, quality: 'best' })
      const png = join(work, `${pad(i + 1)}.png`)
      await writeFile(png, img.toPNG())
      drawn.push(png)
    }
    await mkdir(outDir, { recursive: true })
    for (const f of await readdir(outDir).catch(() => [] as string[])) if (/^\d\d\.png$/.test(f)) await rm(join(outDir, f), { force: true })
    const out: string[] = []
    for (const png of drawn) {
      const to = join(outDir, png.slice(work.length + 1))
      // the temp folder can be on another disk than Matcha Momentum Generator: then a rename cannot move it, a copy can
      await rename(png, to).catch(async (e: NodeJS.ErrnoException) => {
        if (e.code !== 'EXDEV') throw e
        await copyFile(png, to)
      })
      out.push(to)
    }
    return out
  } finally {
    allowedFile = null
    if (!win.isDestroyed()) win.destroy()
    await rm(work, { recursive: true, force: true })
  }
}
