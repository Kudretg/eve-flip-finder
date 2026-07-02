import electronUpdater from 'electron-updater'
import type { UpdateInfo, ProgressInfo } from 'electron-updater'
import { app, BrowserWindow } from 'electron'

const { autoUpdater } = electronUpdater
const isDev = !app.isPackaged

export type UpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterStatus {
  state: UpdaterState
  currentVersion: string
  manual: boolean
  version?: string        // available / downloaded
  percent?: number        // downloading (0-100)
  bytesPerSecond?: number
  transferred?: number
  total?: number
  message?: string        // error
}

let getWin: () => BrowserWindow | null = () => null
let manualCheck = false
let lastStatus: UpdaterStatus = { state: 'idle', currentVersion: '', manual: false }

function emit(partial: Omit<UpdaterStatus, 'currentVersion' | 'manual'>) {
  lastStatus = { currentVersion: app.getVersion(), manual: manualCheck, ...partial }
  getWin()?.webContents.send('updater:status', lastStatus)
}

export function getUpdaterStatus(): UpdaterStatus {
  return { ...lastStatus, currentVersion: app.getVersion() }
}

export function initUpdater(winGetter: () => BrowserWindow | null) {
  getWin = winGetter
  // We drive download/install ourselves so the UI can prompt at each step.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => emit({ state: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => emit({ state: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => emit({ state: 'not-available' }))
  autoUpdater.on('download-progress', (p: ProgressInfo) =>
    emit({ state: 'downloading', percent: p.percent, bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total }))
  // update-downloaded fires only after the sha512 checksum from latest.yml
  // matches — the file is intact (no trusted code signature on a self-signed build).
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => emit({ state: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err: Error | null) =>
    emit({ state: 'error', message: err == null ? 'unknown error' : (err.message || String(err)) }))
}

export async function checkForUpdates(manual: boolean) {
  manualCheck = manual
  if (isDev) {
    if (manual) emit({ state: 'error', message: 'Updates are disabled in development.' })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emit({ state: 'error', message: (err as Error).message })
  }
}

export async function downloadUpdate() {
  if (isDev) return
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    emit({ state: 'error', message: (err as Error).message })
  }
}

export function installUpdate() {
  if (isDev) return
  // isSilent + isForceRunAfter: with oneClick:false the bare call would run the
  // full assisted wizard on every auto-update. Silent install, then relaunch.
  autoUpdater.quitAndInstall(true, true)
}
