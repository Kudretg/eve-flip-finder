export interface FlipItem {
  typeId: number
  typeName: string
  maxBuy: number
  minSell: number
  profit: number
  margin: number
  buyVolume: number
  sellVolume: number
  liquidityScore: number  // min(buyVolume, sellVolume) — the bottleneck leg of the flip
  buyColor: string
  sellColor: string
  isManual?: boolean  // added via catalog search, not the bulk scan — skips margin/price threshold filters
}

export type SortKey = 'margin' | 'profit' | 'liquidityDesc' | 'liquidityAsc' | 'buyVolume' | 'sellVolume'

export interface Hub {
  label: string
  systemId: number
  regionId: number
}

export interface Category {
  label: string
  groupIds: number[]
}
