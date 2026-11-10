// Every filesystem location the app uses lives here, so packaging can adjust one file.
// This module never imports electron: index.ts calls initPaths() with the electron values,
// and tests call it with temp folders.
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

export interface PathContext {
  isPackaged: boolean
  /** process.resourcesPath in production. */
  resourcesPath: string
  /** app.getPath('documents') */
  documentsDir: string
  /** app.getPath('userData') */
  userDataDir: string
  /** The app/ folder in dev (where package.json lives). */
  appDir: string
  /** Optional override of the app root (Settings > Storage). */
  rootOverride?: string | null
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
}

let ctx: PathContext | null = null

export function initPaths(c: PathContext): void {
  ctx = { platform: process.platform, env: process.env, ...c }
}

export function setRootOverride(root: string | null): void {
  need().rootOverride = root
}

function need(): PathContext {
  if (!ctx) throw new Error('paths not initialised')
  return ctx
}

const isWin = (): boolean => need().platform === 'win32'
const env = (): NodeJS.ProcessEnv => need().env ?? process.env

/** Repo root in dev (the folder holding app/, engine/, templates/). */
export function repoRoot(): string {
  return resolve(need().appDir, '..')
}

// ---- the app's root (user documents) ---------------------------------------------------------

/** Matcha Momentum Generator is a fork of Reel Studio (MIT): folders made before the rename keep their old name. */
export const APP_NAME = 'Matcha Momentum Generator'
export const LEGACY_NAME = 'Reel Studio'

export const BIN_FOLDERS = {
  raw: 'Raw takes',
  broll: 'B-roll',
  music: 'Music',
  images: 'Images',
  exports: 'Exports'
} as const

export type BinKey = keyof typeof BIN_FOLDERS

export function reelStudioRoot(): string {
  const c = need()
  if (env().REELSTUDIO_ROOT) return resolve(env().REELSTUDIO_ROOT as string)
  if (c.rootOverride) return c.rootOverride
  return defaultRoot(c.documentsDir)
}

/** The app's folder in Documents: "Matcha Momentum Generator", or the "Reel Studio" one from before the rename when it is there, so
 * an existing library carries over untouched. */
export function defaultRoot(documentsDir: string, exists: (p: string) => boolean = existsSync): string {
  const before = join(documentsDir, LEGACY_NAME)
  return exists(before) ? before : join(documentsDir, APP_NAME)
}

/** Where settings live (Application Support): the "Reel Studio" folder from before the rename when it is there. */
export function legacyUserData(appDataDir: string, exists: (p: string) => boolean = existsSync): string | null {
  const before = join(appDataDir, LEGACY_NAME)
  return exists(before) ? before : null
}

export const projectsDir = (): string => join(reelStudioRoot(), 'Projects')
export const libraryDir = (): string => join(reelStudioRoot(), 'Library')
export const binDir = (bin: BinKey): string => join(libraryDir(), BIN_FOLDERS[bin])
export const stylePath = (): string => join(reelStudioRoot(), 'My style.json')

// ---- App data (not user-facing) -------------------------------------------------------------

export const settingsDir = (): string => need().userDataDir
export const settingsFile = (): string => join(need().userDataDir, 'settings.json')
export const modelsDir = (): string => env().REELSTUDIO_MODELS_DIR ?? join(need().userDataDir, 'models')

// ---- Bundled resources -----------------------------------------------------------------------

function resource(...p: string[]): string {
  return join(need().resourcesPath, ...p)
}

/** The folder that contains the `reelengine` Python package. */
export function engineDir(): string {
  const e = env().REELSTUDIO_ENGINE_DIR
  if (e) return resolve(e)
  if (need().isPackaged) return resource('engine')
  const repoEngine = join(repoRoot(), 'engine')
  if (existsSync(join(repoEngine, 'reelengine', '__main__.py'))) return repoEngine
  return fakeEngineDir()
}

/** A tiny stand-in engine for UI work before the real one lands. Dev and tests only. */
export function fakeEngineDir(): string {
  return join(need().appDir, 'dev', 'fake-engine')
}

export function engineMode(): 'real' | 'fake' {
  return resolve(engineDir()) === resolve(fakeEngineDir()) ? 'fake' : 'real'
}

export function pythonExe(): string {
  const e = env().REELSTUDIO_PYTHON
  if (e) return e
  if (need().isPackaged) {
    return isWin() ? resource('python', 'python.exe') : resource('python', 'bin', 'python3')
  }
  const venv = join(engineDir(), '.venv')
  const venvPy = isWin() ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python')
  if (existsSync(venvPy)) return venvPy
  return isWin() ? 'python' : 'python3'
}

/** First match for an executable on PATH, or null. */
export function which(name: string): string | null {
  const exts = isWin() ? (env().PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : ['']
  for (const dir of (env().PATH ?? env().Path ?? '').split(isWin() ? ';' : ':')) {
    if (!dir) continue
    for (const ext of exts) {
      const p = join(dir.replace(/^"|"$/g, ''), name + ext)
      if (existsSync(p)) return p
    }
  }
  return null
}

function bundledBin(name: 'ffmpeg' | 'ffprobe'): string {
  const exe = isWin() ? `${name}.exe` : name
  if (need().isPackaged) return resource('ffmpeg', exe)
  // dev: the pinned build from `fetch_runtime.py --ffmpeg-only` if it is here. A system ffmpeg may lack the subtitles
  // filter (no libass), and then every captioned render fails.
  const pinned = join(repoRoot(), 'packaging', 'runtime', isWin() ? 'win-x64' : 'mac-arm64', 'ffmpeg', exe)
  if (existsSync(pinned)) return pinned
  return which(name) ?? name
}

export function ffmpegPath(): string {
  return env().REELENGINE_FFMPEG ?? bundledBin('ffmpeg')
}

export function ffprobePath(): string {
  return env().REELENGINE_FFPROBE ?? bundledBin('ffprobe')
}

export function fontsDir(): string | null {
  if (need().isPackaged) return resource('fonts')
  const p = join(repoRoot(), 'packaging', 'fonts')
  return existsSync(p) ? p : null
}

export function templatesDir(): string {
  if (need().isPackaged) return resource('templates')
  return join(repoRoot(), 'templates')
}

/** Small test template shipped with the app, used to prove the animation renderer. */
export function testAnimationDir(): string {
  if (need().isPackaged) return resource('test-animation')
  return join(need().appDir, 'resources', 'test-animation')
}

/** Environment for every engine process. */
export function engineEnv(): NodeJS.ProcessEnv {
  const base = { ...env() }
  // Electron-hosted shells set this; it must never leak into child processes.
  delete base.ELECTRON_RUN_AS_NODE
  // The user's own Python setup must not reach the bundled engine. The engine runs
  // with -s -E (engine.ts), which already ignores these; they are removed for any python it starts.
  for (const k of ['PYTHONHOME', 'PYTHONSTARTUP', 'PYTHONSAFEPATH', 'PYTHONINSPECT', 'PYTHONUSERBASE']) delete base[k]
  const out: NodeJS.ProcessEnv = {
    ...base,
    PYTHONPATH: engineDir(),
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
    PYTHONUNBUFFERED: '1',
    PYTHONNOUSERSITE: '1',
    REELENGINE_MODELS: modelsDir(),
    REELENGINE_ROOT: reelStudioRoot()
  }
  // The engine's cache default ignores Electron's isolated userData directory.
  if (out.REELENGINE_CACHE === undefined && env().REELSTUDIO_USER_DATA) out.REELENGINE_CACHE = settingsDir()
  if (out.REELENGINE_CACHE_DIR === undefined && env().REELSTUDIO_USER_DATA) out.REELENGINE_CACHE_DIR = join(settingsDir(), 'cache')
  // Only absolute paths: a bare name means "not found", and the engine does its own PATH search.
  if (isAbsolute(ffmpegPath())) out.REELENGINE_FFMPEG = ffmpegPath()
  if (isAbsolute(ffprobePath())) out.REELENGINE_FFPROBE = ffprobePath()
  const fonts = fontsDir()
  if (fonts) out.REELENGINE_FONTS = fonts
  return out
}
