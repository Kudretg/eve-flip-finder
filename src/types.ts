export interface FlipItem {
  typeId: number
  typeName: string
  maxBuy: number
  minSell: number
  profit: number
  margin: number
  volume: number
}

export type SortKey = 'margin' | 'profit' | 'volumeDesc' | 'volumeAsc'

export interface Hub {
  label: string
  systemId: number
  regionId: number
}

export interface Category {
  label: string
  groupIds: number[]
}
