import { refreshTokenIfNeeded } from './auth.js'
import { getStore } from './store.js'

const ESI_BASE = 'https://esi.evetech.net/latest'

async function esiFetch<T>(path: string): Promise<T> {
  await refreshTokenIfNeeded()
  const token = getStore().get('accessToken', '')
  const res = await fetch(`${ESI_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`ESI ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

async function esiPost(path: string): Promise<void> {
  await refreshTokenIfNeeded()
  const token = getStore().get('accessToken', '')
  const res = await fetch(`${ESI_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`ESI ${res.status}: ${path}`)
}

export interface EsiOrder {
  order_id: number
  type_id: number
  location_id: number
  region_id: number
  volume_total: number
  volume_remain: number
  price: number
  is_buy_order: boolean
  duration: number
  issued: string
  range: string
  escrow?: number
}

export interface EsiOrderHistory {
  order_id: number
  type_id: number
  region_id: number
  price: number
  is_buy_order: boolean
  issued: string
  state: 'cancelled' | 'expired' | 'character_deleted'
}

export interface EsiCharacter {
  name: string
  corporation_id: number
}

export const getCharacterOrders = (characterId: number) =>
  esiFetch<EsiOrder[]>(`/characters/${characterId}/orders/`)

export const getCharacterOrderHistory = (characterId: number) =>
  esiFetch<EsiOrderHistory[]>(`/characters/${characterId}/orders/history/`)

export const getWalletBalance = (characterId: number) =>
  esiFetch<number>(`/characters/${characterId}/wallet/`)

const typeNameCache = new Map<number, string>()

export function openMarketWindow(typeId: number): Promise<void> {
  return esiPost(`/ui/openwindow/marketdetails/?type_id=${typeId}`)
}

export async function getTypeName(typeId: number): Promise<string> {
  const cached = typeNameCache.get(typeId)
  if (cached) return cached
  try {
    const res = await fetch(`${ESI_BASE}/universe/types/${typeId}/`)
    if (res.ok) {
      const data = await res.json() as { name: string }
      typeNameCache.set(typeId, data.name)
      return data.name
    }
  } catch {
    // ignore
  }
  return `Type ${typeId}`
}
