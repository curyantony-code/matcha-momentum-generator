// The Studio tab: OpenReel Video's own web editor (openreel.video, MIT) shown inside the app window.
// It is someone else's website, so it gets nothing of the app: its own WebContentsView over the tab's area, a
// sandboxed page with no preload and no Node, its own saved session (so its projects survive restarts),
// navigation kept on openreel.video, other links in the system browser, and only the permissions an editor
// needs. Files reach it only the way they reach any website: the person drags them in or picks them.
import { BrowserWindow, WebContentsView, session, shell } from 'electron'
import { ALLOWED_PERMISSIONS, STUDIO_PARTITION, STUDIO_URL, isStudioUrl, type StudioBounds } from './studio-rules'
export { cleanBounds, isStudioUrl, openReelExports, STUDIO_URL } from './studio-rules'

export interface Studio {
  show(bounds: StudioBounds): void
  hide(): void
  reload(): void
  /** Opens OpenReel in the system browser instead. */
  openInBrowser(): void
}

export function createStudio(getWindow: () => BrowserWindow | null, opts: { offline?: boolean; log: (line: string) => void }): Studio {
  let view: WebContentsView | null = null

  const make = (win: BrowserWindow): WebContentsView => {
    const ses = session.fromPartition(STUDIO_PARTITION)
    ses.setPermissionRequestHandler((_wc, permission, done) => done(ALLOWED_PERMISSIONS.has(permission)))
    ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
    const v = new WebContentsView({
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        webviewTag: false,
        spellcheck: false
      }
    })
    const wc = v.webContents
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    wc.on('will-navigate', (e, url) => {
      if (isStudioUrl(url)) return
      e.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    })
    wc.on('will-attach-webview', (e) => e.preventDefault())
    wc.on('did-fail-load', (_e, code, desc, url) => opts.log(`[studio] could not load ${url}: ${code} ${desc}`))
    // tests never reach the network: an empty page stands in for the website
    void (opts.offline ? wc.loadURL('about:blank') : wc.loadURL(STUDIO_URL)).catch((e) => opts.log(`[studio] ${String(e)}`))
    win.contentView.addChildView(v)
    return v
  }

  return {
    show(bounds) {
      const win = getWindow()
      if (!win || win.isDestroyed()) return
      view ??= make(win)
      view.setBounds(bounds)
      view.setVisible(true)
    },
    hide() {
      view?.setVisible(false)
    },
    reload() {
      if (view && !opts.offline) view.webContents.loadURL(STUDIO_URL).catch((e) => opts.log(`[studio] ${String(e)}`))
    },
    openInBrowser() {
      void shell.openExternal(STUDIO_URL)
    }
  }
}
