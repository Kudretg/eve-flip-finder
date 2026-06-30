import { Notification, clipboard, BrowserWindow } from 'electron'
import { getCharacterOrders, getCharacterOrderHistory, getWalletBalance, getTypeName } from './esi.js'
import { getStore, DEFAULT_MONITOR_CONFIG } from './store.js'
import type { EsiOrder } from './esi.js'
import type { MonitorConfig } from './store.js'

const EVETYCOON_BASE = 'https://evetycoon.com/api/v1'

interface MarketStats {
  maxBuy: number
  minSell: number
}

async function getTycoonStats(regionId: number, typeId: number): Promise<MarketStats | null> {
  try {
    const res = await fetch(`${EVETYCOON_BASE}/market/stats/${regionId}/${typeId}`)
    if (!res.ok) return null
    return res.json() as Promise<MarketStats>
  } catch {
    return null
  }
}

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

export interface MonitorStatus {
  running: boolean
  lastRun: number | null
  walletBalance: number | null
  character: { id: number; name: string } | null
  activeOrders: ActiveOrderUI[]
  recentAlerts: MonitorAlert[]
  config: MonitorConfig
}

let monitorInterval: ReturnType<typeof setInterval> | null = null
let previousOrderSnapshot = new Map<number, EsiOrder>()
let previousHistoryIds = new Set<number>()
let previousUndercutState = new Map<number, boolean>()
let recentAlerts: MonitorAlert[] = []
let isFirstScan = true

let lastStatus: MonitorStatus = {
  running: false,
  lastRun: null,
  walletBalance: null,
  character: null,
  activeOrders: [],
  recentAlerts: [],
  config: DEFAULT_MONITOR_CONFIG,
}

function pushAlert(alert: MonitorAlert, copyToClipboard: boolean) {
  recentAlerts = [alert, ...recentAlerts].slice(0, 50)

  try {
    new Notification({
      title: alert.type === 'undercut' ? 'Order Undercut' : alert.type === 'fill' ? 'Order Filled' : 'New Opportunity',
      body: alert.message,
    }).show()
  } catch {
    // Notifications not supported
  }

  if (copyToClipboard && alert.suggestedPrice !== null) {
    clipboard.writeText(alert.suggestedPrice.toFixed(2))
  }
}

function emitStatus(win: BrowserWindow | null, status: MonitorStatus) {
  lastStatus = status
  win?.webContents.send('monitor:update', status)
}

async function runIteration(win: BrowserWindow | null) {
  const store = getStore()
  const characterId = store.get('characterId', 0)
  if (!characterId) return

  const savedConfig = store.get('monitorConfig')
  const config: MonitorConfig = savedConfig ? { ...DEFAULT_MONITOR_CONFIG, ...savedConfig } : DEFAULT_MONITOR_CONFIG

  const [currentOrders, history, walletBalance] = await Promise.all([
    getCharacterOrders(characterId).catch(() => [] as EsiOrder[]),
    getCharacterOrderHistory(characterId).catch(() => []),
    getWalletBalance(characterId).catch(() => null),
  ])

  const currentOrderMap = new Map(currentOrders.map(o => [o.order_id, o]))
  const historyIds = new Set(history.map(o => o.order_id))

  // Detect fills: disappeared from active AND not in cancelled/expired history
  if (!isFirstScan) {
    for (const [orderId, prevOrder] of previousOrderSnapshot) {
      if (!currentOrderMap.has(orderId) && !historyIds.has(orderId) && !previousHistoryIds.has(orderId)) {
        const typeName = await getTypeName(prevOrder.type_id)
        const stats = prevOrder.is_buy_order
          ? await getTycoonStats(prevOrder.region_id, prevOrder.type_id)
          : null
        const suggestedPrice = stats ? stats.minSell - 0.01 : null

        pushAlert({
          timestamp: Date.now(),
          type: 'fill',
          typeName,
          message: prevOrder.is_buy_order
            ? `${typeName} buy filled!${suggestedPrice ? ` Sell at ${suggestedPrice.toFixed(2)} ISK — copied` : ''}`
            : `${typeName} sell filled!`,
          suggestedPrice: prevOrder.is_buy_order ? suggestedPrice : null,
        }, prevOrder.is_buy_order && suggestedPrice !== null)
      }
    }
  }

  // Check each active order for undercuts
  const activeOrdersUI: ActiveOrderUI[] = []
  const newUndercutState = new Map<number, boolean>()

  for (const order of currentOrders) {
    const typeName = await getTypeName(order.type_id)
    const stats = await getTycoonStats(order.region_id, order.type_id)

    let isUndercut = false
    let suggestedPrice: number | null = null
    let currentMarketPrice: number | null = null

    if (stats) {
      if (order.is_buy_order) {
        currentMarketPrice = stats.maxBuy
        // We're undercut if someone else has a higher buy order than us
        if (stats.maxBuy > order.price + 0.01) {
          isUndercut = true
          suggestedPrice = stats.maxBuy + 0.01
        }
      } else {
        currentMarketPrice = stats.minSell
        // We're undercut if someone else has a lower sell order than us
        if (stats.minSell < order.price - 0.01) {
          isUndercut = true
          suggestedPrice = stats.minSell - 0.01
        }
      }
    }

    newUndercutState.set(order.order_id, isUndercut)

    // Alert only when newly undercut (state changed from false → true, or first scan is skipped)
    if (isUndercut && suggestedPrice !== null && !isFirstScan) {
      const wasUndercut = previousUndercutState.get(order.order_id) ?? false
      if (!wasUndercut) {
        pushAlert({
          timestamp: Date.now(),
          type: 'undercut',
          typeName,
          message: `${typeName} ${order.is_buy_order ? 'buy' : 'sell'} order undercut! Update to ${suggestedPrice.toFixed(2)} ISK — copied`,
          suggestedPrice,
        }, true)
      }
    }

    activeOrdersUI.push({
      orderId: order.order_id,
      typeId: order.type_id,
      typeName,
      isBuyOrder: order.is_buy_order,
      price: order.price,
      volumeRemain: order.volume_remain,
      volumeTotal: order.volume_total,
      isUndercut,
      suggestedPrice,
      currentMarketPrice,
      issued: order.issued,
    })
  }

  previousOrderSnapshot = currentOrderMap
  previousHistoryIds = historyIds
  previousUndercutState = newUndercutState
  isFirstScan = false

  const character = characterId
    ? { id: characterId, name: store.get('characterName', '') }
    : null

  emitStatus(win, {
    running: true,
    lastRun: Date.now(),
    walletBalance,
    character,
    activeOrders: activeOrdersUI,
    recentAlerts,
    config,
  })
}

export function startMonitor(win: BrowserWindow | null, config: MonitorConfig) {
  if (monitorInterval) stopMonitor()

  const store = getStore()
  store.set('monitorConfig', config)

  isFirstScan = true
  previousOrderSnapshot = new Map()
  previousHistoryIds = new Set()
  previousUndercutState = new Map()

  const INTERVAL = 5 * 60 * 1000

  runIteration(win).catch(console.error)
  monitorInterval = setInterval(() => runIteration(win).catch(console.error), INTERVAL)

  lastStatus = { ...lastStatus, running: true, config }
  emitStatus(win, lastStatus)
}

export function stopMonitor(win?: BrowserWindow | null) {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
  lastStatus = { ...lastStatus, running: false }
  emitStatus(win ?? null, lastStatus)
}

export function getStatus(): MonitorStatus {
  return lastStatus
}
