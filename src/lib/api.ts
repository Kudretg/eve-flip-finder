const BASE = '/api/v1'

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export interface MarketStats {
  buyVolume: number
  sellVolume: number
  buyOrders: number
  sellOrders: number
  buyOutliers: number
  sellOutliers: number
  buyThreshold: number
  sellThreshold: number
  buyAvgFivePercent: number
  sellAvgFivePercent: number
  maxBuy: number
  minSell: number
}

export interface MarketType {
  typeID: number
  groupID: number
  typeName: string
  iconID: number
  marketGroupID: number
  metaGroupID: number
  description: string
}

export const getMarketStats = (regionId: number, typeId: number) =>
  apiFetch<MarketStats>(`/market/stats/${regionId}/${typeId}`)

export const getMarketGroupTypes = (groupId: number) =>
  apiFetch<MarketType[]>(`/market/groups/${groupId}/types`)
