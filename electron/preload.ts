import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getClientId: () => ipcRenderer.invoke('config:get-client-id') as Promise<string>,
  setClientId: (clientId: string) => ipcRenderer.invoke('config:set-client-id', clientId) as Promise<void>,

  // Auth
  login: (clientId: string) => ipcRenderer.invoke('auth:login', clientId) as Promise<{ success: boolean; error?: string }>,
  logout: () => ipcRenderer.invoke('auth:logout') as Promise<void>,
  getAuthStatus: () => ipcRenderer.invoke('auth:status') as Promise<{ authenticated: boolean; characterId: number; characterName: string }>,

  // Monitor
  startMonitor: (config: unknown) => ipcRenderer.invoke('monitor:start', config) as Promise<void>,
  stopMonitor: () => ipcRenderer.invoke('monitor:stop') as Promise<void>,
  getMonitorStatus: () => ipcRenderer.invoke('monitor:status') as Promise<unknown>,

  // Market data proxy (for renderer fetch calls in Electron)
  apiFetch: (path: string) => ipcRenderer.invoke('api:fetch', path) as Promise<unknown>,

  // Clipboard
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:copy', text) as Promise<void>,

  // EVE UI
  openMarketWindow: (typeId: number) => ipcRenderer.invoke('ui:open-market', typeId) as Promise<{ success: boolean; error?: string }>,

  // Notifications (re-price feedback while unfocused)
  showNotification: (opts: { body: string; silent?: boolean }) => ipcRenderer.invoke('notify:show', opts) as Promise<void>,

  // Events from main → renderer
  onMonitorUpdate: (callback: (status: unknown) => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: unknown) => callback(status)
    ipcRenderer.on('monitor:update', handler)
    return () => ipcRenderer.removeListener('monitor:update', handler)
  },

  onRepriceNext: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('hotkey:reprice-next', handler)
    return () => ipcRenderer.removeListener('hotkey:reprice-next', handler)
  },
})
