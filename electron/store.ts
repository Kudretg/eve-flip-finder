import Store from 'electron-store'

export interface MonitorConfig {
  minMargin: number
  minProfit: number
  maxBudgetPerItem: number
  hubIndex: number
  brokerFee: number
  salesTax: number
}

interface StoreSchema {
  clientId: string
  accessToken: string
  refreshToken: string
  tokenExpiry: number
  characterId: number
  characterName: string
  monitorConfig: MonitorConfig | undefined
}

let _store: Store<StoreSchema> | null = null

export function getStore(): Store<StoreSchema> {
  if (!_store) {
    _store = new Store<StoreSchema>({
      name: 'eve-flip-finder',
      encryptionKey: 'eve-flip-finder-tokens',
    })
  }
  return _store
}

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  minMargin: 5,
  minProfit: 500_000,
  maxBudgetPerItem: 0,
  hubIndex: 0,
  brokerFee: 3,
  salesTax: 8,
}
