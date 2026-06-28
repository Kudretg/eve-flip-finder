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
}

export type SortKey = 'margin' | 'profit' | 'liquidityDesc' | 'liquidityAsc'

export interface Hub {
  label: string
  systemId: number
  regionId: number
}

export interface Category {
  label: string
  groupIds: number[]
}
