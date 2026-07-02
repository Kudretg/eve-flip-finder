import { app, BrowserWindow, ipcMain, clipboard, Menu, globalShortcut, Notification } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { startOAuthFlow, logout, getAuthStatus } from './auth.js'
import { getStore, DEFAULT_MONITOR_CONFIG } from './store.js'
import { startMonitor, stopMonitor, getStatus } from './monitor.js'
import { openMarketWindow } from './esi.js'
import { initUpdater, checkForUpdates, downloadUpdate, installUpdate, getUpdaterStatus } from './updater.js'
import type { MonitorConfig } from './store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let registeredHotkey: string | null = null

// Re-price global hotkey: active only while the monitor runs. Fires an IPC to
// the renderer, which owns the undercut list + stepper index. Returns whether
// the accelerator was actually claimed (false = collision / invalid).
function registerRepriceHotkey(config: MonitorConfig): boolean {
  unregisterRepriceHotkey()
  if (!config.repriceHotkeyEnabled || !config.repriceHotkey) return false
  try {
    const ok = globalShortcut.register(config.repriceHotkey, () => {
      mainWindow?.webContents.send('hotkey:reprice-next')
    })
    if (ok) registeredHotkey = config.repriceHotkey
    return ok
  } catch {
    return false
  }
}

function unregisterRepriceHotkey() {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey)
    registeredHotkey = null
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(console.error)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')).catch(console.error)
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' as const },
            { label: 'Check for Updates…', click: () => checkForUpdates(true) },
            { type: 'separator' as const },
            { role: 'quit' as const },
          ],
        }]
      : []),
    { role: 'fileMenu' as const },
    { role: 'editMenu' as const },
    { role: 'viewMenu' as const },
    { role: 'windowMenu' as const },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates…', click: () => checkForUpdates(true) },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.eveflipper.app')
  buildMenu()
  createWindow()
  initUpdater(() => mainWindow)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  if (!isDev) {
    checkForUpdates(false)
  }
}).catch(console.error)

app.on('window-all-closed', () => {
  stopMonitor()
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// ── Config IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('config:get-client-id', () => {
  return getStore().get('clientId', '')
})

ipcMain.handle('config:set-client-id', (_, clientId: string) => {
  getStore().set('clientId', clientId)
})

// ── Auth IPC ──────────────────────────────────────────────────────────────────

ipcMain.handle('auth:login', async (_, clientId: string) => {
  try {
    if (clientId) getStore().set('clientId', clientId)
    await startOAuthFlow(clientId || getStore().get('clientId', ''))
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('auth:logout', () => {
  stopMonitor(mainWindow)
  unregisterRepriceHotkey()
  logout()
})

ipcMain.handle('auth:status', () => {
  return getAuthStatus()
})

// ── Monitor IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('monitor:start', (_, config: Partial<MonitorConfig>) => {
  const merged: MonitorConfig = { ...DEFAULT_MONITOR_CONFIG, ...config }
  startMonitor(mainWindow, merged)
  const hotkeyRegistered = registerRepriceHotkey(merged)
  return { hotkeyRegistered }
})

ipcMain.handle('monitor:stop', () => {
  stopMonitor(mainWindow)
  unregisterRepriceHotkey()
})

ipcMain.handle('monitor:status', () => {
  return getStatus()
})

// ── Market API Proxy IPC ──────────────────────────────────────────────────────

ipcMain.handle('api:fetch', async (_, apiPath: string) => {
  const res = await fetch(`https://evetycoon.com/api/v1${apiPath}`)
  if (!res.ok) throw new Error(`API ${res.status}: ${apiPath}`)
  return res.json()
})

// ── Clipboard IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('clipboard:copy', (_, text: string) => {
  clipboard.writeText(text)
})

// ── Notification IPC ──────────────────────────────────────────────────────────
// Re-price feedback: the renderer builds the message (it owns the counter +
// item name); main fires the native notification since the app is unfocused.

ipcMain.handle('notify:show', (_, opts: { body: string; silent?: boolean }) => {
  try {
    new Notification({ title: 'EVE Flip Finder', body: opts.body, silent: opts.silent ?? false }).show()
  } catch {
    // Notifications not supported
  }
})

// ── Updater IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('updater:check', () => checkForUpdates(true))
ipcMain.handle('updater:download', () => downloadUpdate())
ipcMain.handle('updater:install', () => installUpdate())
ipcMain.handle('updater:get-status', () => getUpdaterStatus())

// ── EVE UI IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('ui:open-market', async (_, typeId: number) => {
  try {
    await openMarketWindow(typeId)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})
