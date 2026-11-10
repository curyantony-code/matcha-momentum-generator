// Draws a story to an MP4: the story's HTML (shared/story-render.ts) in an offscreen window, stepped frame by
// frame with __seek(t), the raw pixels piped to ffmpeg with the voiceover. Locked down like carousel-export.ts:
// the page is generated from the person's words and may load nothing but data: URLs and its own file.
import { BrowserWindow, session, type Session } from 'electron'
import { spawn } from 'node:child_process'
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { STORY_FPS, STORY_HEIGHT, STORY_WIDTH } from '../shared/story'
import { ffmpegPath } from './paths'

const PARTITION = 'reelstudio-story' // memory only, gone when the app quits
const PROGRESS_EVERY_MS = 150
let ses: Session | null = null
/** The one story file an export may load right now (null between exports). */
let allowedFile: string | null = null

function exportSession(): Session {
  if (ses) return ses
  const s = session.fromPartition(PARTITION, { cache: false })
  s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  s.setPermissionCheckHandler(() => false)
  s.on('will-download', (e) => e.preventDefault())
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => cb({ cancel: !(d.url.startsWith('data:') || (allowedFile !== null && d.url === allowedFile)) }))
  ses = s
  return s
}

const cancelled = (): { code: string; userMessage: string } => ({ code: 'CANCELLED', userMessage: 'Stopped.' })

/** ffmpeg arguments: raw BGRA frames on stdin plus the audio, to H.264 + AAC. */
export function ffmpegArgs(audio: string, out: string): string[] {
  return [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${STORY_WIDTH}x${STORY_HEIGHT}`, '-r', String(STORY_FPS), '-i', '-',
    '-i', audio,
    // the audio is padded with silence so the film keeps its tail after the last word
    '-af', 'apad', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(STORY_FPS),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', '-f', 'mp4', out
  ]
}

interface Encoder {
  write(frame: Buffer): Promise<void>
  finish(): Promise<void>
  abort(): void
}

function startEncoder(audio: string, out: string): Encoder {
  const child = spawn(ffmpegPath(), ffmpegArgs(audio, out), { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
  const tail: string[] = []
  let failure: { code: string; userMessage: string } | null = null
  child.stderr.on('data', (c: Buffer) => {
    tail.push(c.toString('utf8'))
    if (tail.length > 20) tail.shift()
  })
  child.stdin.on('error', () => {}) // a dead ffmpeg surfaces through its exit, not as an EPIPE here
  const closed = new Promise<void>((resolve, reject) => {
    child.on('error', (e: NodeJS.ErrnoException) => {
      failure = { code: e.code === 'ENOENT' ? 'FFMPEG_MISSING' : 'EXPORT_FAILED', userMessage: 'Matcha Momentum Generator could not start its video maker. Try reinstalling it.' }
      reject(failure)
    })
    child.on('close', (code) => {
      if (code === 0) return resolve()
      failure = { code: 'EXPORT_FAILED', userMessage: 'The video could not be put together. Try again.' }
      reject(Object.assign(failure, { message: tail.join('').slice(-600) }))
    })
  })
  closed.catch(() => {})
  return {
    async write(frame) {
      if (failure) throw failure
      if (!child.stdin.write(frame)) await new Promise<void>((r) => child.stdin.once('drain', r).once('close', r))
    },
    async finish() {
      child.stdin.end()
      await closed
    },
    abort() {
      child.stdin.destroy()
      child.kill('SIGKILL')
    }
  }
}

// One export at a time: the session allows one story file, and two exports would race over it.
let queue: Promise<unknown> = Promise.resolve()

export interface ExportProgress {
  (pct: number, message: string): void
}

/**
 * Renders `html` (1080x1920, window.__seek) for `duration` seconds at 30 fps to `outPath`, with `audio` as AAC.
 * Written to a temp file beside the target and renamed over it only when ffmpeg finished, so a failed or
 * cancelled export leaves the last good file.
 */
export function exportStory(html: string, duration: number, audio: string, outPath: string, onProgress: ExportProgress, signal?: AbortSignal): Promise<string> {
  const run = queue.catch(() => undefined).then(() => exportNow(html, duration, audio, outPath, onProgress, signal))
  queue = run.catch(() => undefined)
  return run
}

async function openWindow(file: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false, width: STORY_WIDTH, height: STORY_HEIGHT, useContentSize: true, frame: false, resizable: false,
    enableLargerThanScreen: true, paintWhenInitiallyHidden: true, backgroundColor: '#000000',
    webPreferences: {
      session: exportSession(), offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false,
      webviewTag: false, devTools: false, backgroundThrottling: false, spellcheck: false, webgl: false, plugins: false
    }
  })
  win.setContentSize(STORY_WIDTH, STORY_HEIGHT)
  const wc = win.webContents
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (e) => e.preventDefault())
  allowedFile = pathToFileURL(file).href
  // Not yet handed to the caller: if the page fails to start, this window must not be left behind.
  try {
    await win.loadFile(file)
    const ready = await wc.executeJavaScript("document.fonts.ready.then(() => typeof window.__seek === 'function')", true)
    if (ready !== true) throw { code: 'EXPORT_FAILED', userMessage: 'The story page did not start. Try again.' }
    return win
  } catch (e) {
    if (!win.isDestroyed()) win.destroy()
    throw e
  }
}

async function drawFrame(win: BrowserWindow, t: number): Promise<Buffer> {
  const wc = win.webContents
  await wc.executeJavaScript(`window.__seek(${t.toFixed(4)}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))`, true)
  let img = await wc.capturePage()
  if (img.isEmpty()) throw { code: 'EXPORT_FAILED', userMessage: 'A frame came out empty. Try again.' }
  if (img.getSize().width !== STORY_WIDTH) img = img.resize({ width: STORY_WIDTH, height: STORY_HEIGHT, quality: 'best' })
  return img.toBitmap() // BGRA on macOS, Windows and Linux (Skia's N32)
}

async function exportNow(html: string, duration: number, audio: string, outPath: string, onProgress: ExportProgress, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw cancelled()
  const frames = Math.max(1, Math.ceil(duration * STORY_FPS))
  const work = await mkdtemp(join(tmpdir(), 'reel-story-'))
  const tmpOut = join(dirname(outPath), `.${process.pid}-${Date.now()}.mp4.part`)
  let win: BrowserWindow | null = null
  let enc: Encoder | null = null
  const onAbort = (): void => enc?.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const file = join(work, 'story.html')
    await writeFile(file, html, 'utf8')
    win = await openWindow(file)
    enc = startEncoder(audio, tmpOut)
    let last = 0
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw cancelled()
      await enc.write(await drawFrame(win, i / STORY_FPS))
      const now = Date.now()
      if (now - last >= PROGRESS_EVERY_MS) {
        last = now
        onProgress(Math.min(99, Math.round(((i + 1) / frames) * 100)), 'Drawing the film')
      }
    }
    await enc.finish()
    if (signal?.aborted) throw cancelled()
    await rename(tmpOut, outPath)
    onProgress(100, 'Done')
    return outPath
  } catch (e) {
    enc?.abort()
    throw signal?.aborted ? cancelled() : e
  } finally {
    signal?.removeEventListener('abort', onAbort)
    allowedFile = null
    if (win && !win.isDestroyed()) win.destroy()
    await rm(tmpOut, { force: true })
    await rm(work, { recursive: true, force: true })
  }
}
