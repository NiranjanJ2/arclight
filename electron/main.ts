import { app, BrowserWindow, Menu, clipboard, dialog, shell, type MenuItemConstructorOptions } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { createServer } from '../server/index'

// The renderer is the same client the browser loads, served over loopback rather
// than from file:// — a file:// origin would put the paper's HTML in the same
// origin as the app itself.
const HOST = '127.0.0.1'

// A fixed port, not an ephemeral one: localStorage is keyed by origin, so a port
// that changed each launch would hand the app a blank slate every time — losing
// highlights, chat history and the recent-papers list. 8788 leaves 8787 free for
// `npm start` so the browser build and the app keep separate, stable stores.
const PORT = Number(process.env.ARCLIGHT_PORT ?? 8788)

// In development the client is served from ./dist next to the sources; once
// packaged, electron-builder places it under the app bundle's resources.
function staticRoot(): string {
  const packaged = join(process.resourcesPath ?? '', 'dist')
  return app.isPackaged && existsSync(packaged) ? packaged : join(app.getAppPath(), 'dist')
}


// A GUI app launched from the Dock inherits a bare PATH (/usr/bin:/bin:/usr/sbin:
// /sbin), not the one from your shell profile. Codex and Claude live in places like
// /opt/homebrew/bin and ~/.local/bin, so without this every AI request fails with
// "Codex is not installed or is not available on your PATH" — while working fine
// when the same server is started from a terminal.
function resolveUserPath(): string {
  const known = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(homedir(), '.local/bin'),
    join(homedir(), '.bun/bin'),
    join(homedir(), '.cargo/bin'),
  ]
  let fromShell: string[] = []
  try {
    // Markers keep the value separable from anything the profile prints on startup.
    const shell = process.env.SHELL || '/bin/zsh'
    const output = execFileSync(shell, ['-ilc', 'printf "__ARC__%s__ARC__" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5_000,
    })
    fromShell = (output.match(/__ARC__(.*?)__ARC__/s)?.[1] ?? '').split(':').filter(Boolean)
  } catch { /* the known locations below still cover the common installs */ }
  const current = (process.env.PATH ?? '').split(':').filter(Boolean)
  return [...new Set([...fromShell, ...known, ...current])].join(':')
}

async function startServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer({ staticRoot: staticRoot() })
      // Port 0 takes whatever is free, so the app never collides with a dev server
      // already holding 8787. The client only uses relative URLs, so the port is
      // irrelevant to it.
      .listen(PORT, HOST, () => {
        const { port } = server.address() as AddressInfo
        resolve(`http://${HOST}:${port}`)
      })
    server.on('error', reject)
  })
}


// Electron's implicit default menu is close to right, but it is not guaranteed and
// carries no app-specific items. Declaring it makes the standard macOS shortcuts —
// Cmd+C/V/X/A, Cmd+Z, Cmd+W/Q/M, zoom, full screen — explicit rather than inherited.
function buildApplicationMenu() {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        // Page zoom is separate from ArcLight's own text-size control, which only
        // scales the article; this scales the whole interface.
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'arXiv', click: () => void shell.openExternal('https://arxiv.org') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Electron ships no context menu whatsoever, so right-clicking a paper does nothing
// until one is built. Selected text is the common case here.
function attachContextMenu(window: BrowserWindow) {
  window.webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = []
    if (params.linkURL) {
      template.push(
        { label: 'Open Link in Browser', click: () => void shell.openExternal(params.linkURL) },
        { label: 'Copy Link', click: () => clipboard.writeText(params.linkURL) },
        { type: 'separator' },
      )
    }
    if (params.isEditable) {
      template.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' })
    } else {
      if (params.selectionText) template.push({ role: 'copy' }, { type: 'separator' })
      template.push({ role: 'selectAll' })
    }
    Menu.buildFromTemplate(template).popup({ window })
  })
}

function createWindow(url: string) {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 720,
    minHeight: 560,
    show: false,
    title: 'ArcLight',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b0c0f',
    webPreferences: {
      // ArcLight renders third-party HTML from arXiv. These three are what keep a
      // sanitizer bypass at "bad XSS" instead of "code execution on this Mac".
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  attachContextMenu(window)

  // Anything that is not the local app opens in the real browser: an arXiv or
  // author link must never navigate the app window itself.
  const isLocal = (target: string) => target.startsWith(url)
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target) && !isLocal(target)) void shell.openExternal(target)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, target) => {
    if (isLocal(target)) return
    event.preventDefault()
    if (/^https?:\/\//.test(target)) void shell.openExternal(target)
  })

  void window.loadURL(url)
  return window
}

// One instance only, so two copies cannot fight over the fixed port; a second
// launch raises the window that already exists.
if (!app.requestSingleInstanceLock()) app.quit()

void app.whenReady().then(async () => {
  process.env.PATH = resolveUserPath()
  buildApplicationMenu()
  let url: string
  try {
    url = await startServer()
  } catch (error) {
    const busy = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
    dialog.showErrorBox('ArcLight could not start', busy
      ? `Port ${PORT} is already in use by another program. Free it, or set ARCLIGHT_PORT to a different port, then reopen ArcLight.`
      : `The local server failed to start: ${(error as Error).message}`)
    app.quit()
    return
  }
  const first = createWindow(url)

  app.on('second-instance', () => {
    if (first.isMinimized()) first.restore()
    first.focus()
  })

  // Standard macOS behaviour: clicking the Dock icon with no windows open reopens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url)
  })
})

// The server lives in this process, so closing the window really does stop it —
// the thing a browser tab could never do.
app.on('window-all-closed', () => app.quit())
