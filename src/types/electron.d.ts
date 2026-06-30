export interface ActiveOrderUI {
  orderId: number
  typeId: number
  typeName: string
  isBuyOrder: boolean
  price: number
  volumeRemain: number
  volumeTotal: number
  isUndercut: boolean
  suggestedPrice: number | null
  currentMarketPrice: number | null
  issued: string
}

export interface MonitorAlert {
  timestamp: number
  type: 'undercut' | 'fill' | 'opportunity'
  typeName: string
  message: string
  suggestedPrice: number | null
}

export interface MonitorConfig {
  minMargin: number
  minProfit: number
  maxBudgetPerItem: number
  hubIndex: number
  brokerFee: number
  salesTax: number
}

export interface MonitorStatus {
  running: boolean
  lastRun: number | null
  walletBalance: number | null
  character: { id: number; name: string } | null
  activeOrders: ActiveOrderUI[]
  recentAlerts: MonitorAlert[]
  config: MonitorConfig
}

export interface AuthStatus {
  authenticated: boolean
  characterId: number
  characterName: string
}

export interface ElectronAPI {
  getClientId: () => Promise<string>
  setClientId: (clientId: string) => Promise<void>
  login: (clientId: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  getAuthStatus: () => Promise<AuthStatus>
  startMonitor: (config: MonitorConfig) => Promise<void>
  stopMonitor: () => Promise<void>
  getMonitorStatus: () => Promise<MonitorStatus>
  apiFetch: (path: string) => Promise<unknown>
  copyToClipboard: (text: string) => Promise<void>
  openMarketWindow: (typeId: number) => Promise<{ success: boolean; error?: string }>
  onMonitorUpdate: (callback: (status: MonitorStatus) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
