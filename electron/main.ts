import { app, BrowserWindow, ipcMain, clipboard } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { startOAuthFlow, logout, getAuthStatus } from './auth.js'
import { getStore, DEFAULT_MONITOR_CONFIG } from './store.js'
import { startMonitor, stopMonitor, getStatus } from './monitor.js'
import { openMarketWindow } from './esi.js'
import type { MonitorConfig } from './store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

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

app.whenReady().then(() => {
  app.setAppUserModelId('com.eveflipper.app')
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch(console.error)

app.on('window-all-closed', () => {
  stopMonitor()
  if (process.platform !== 'darwin') app.quit()
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
  logout()
})

ipcMain.handle('auth:status', () => {
  return getAuthStatus()
})

// ── Monitor IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('monitor:start', (_, config: Partial<MonitorConfig>) => {
  const merged: MonitorConfig = { ...DEFAULT_MONITOR_CONFIG, ...config }
  startMonitor(mainWindow, merged)
})

ipcMain.handle('monitor:stop', () => {
  stopMonitor(mainWindow)
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

// ── EVE UI IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('ui:open-market', async (_, typeId: number) => {
  try {
    await openMarketWindow(typeId)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
})
