import { useQuery } from '@tanstack/react-query'
import { getMarketStats, getMarketGroupTypes } from '@/lib/api'
import type { MarketType } from '@/lib/api'
import type { FlipItem } from '@/types'

const MAX_TYPES = 500
const MIN_LIQUIDITY = 1

const GROUP_TYPES_TTL = 5 * 60 * 1000
const groupTypesCache = new Map<number, { data: MarketType[]; ts: number }>()

async function getCachedGroupTypes(groupId: number): Promise<MarketType[]> {
  const entry = groupTypesCache.get(groupId)
  if (entry && Date.now() - entry.ts < GROUP_TYPES_TTL) return entry.data
  const data = await getMarketGroupTypes(groupId)
  groupTypesCache.set(groupId, { data, ts: Date.now() })
  return data
}

function volumeColor(vol: number, otherVol: number): string {
  const max = Math.max(vol, otherVol)
  if (max === 0) return 'hsl(0 90% 50%)'
  const ratio = vol / max
  const hue = Math.round(142 * ratio)
  const sat = Math.round(90 - 20 * ratio)
  const light = Math.round(50 - 5 * ratio)
  return `hsl(${hue} ${sat}% ${light}%)`
}

async function fetchFlips(regionId: number, groupIds: number[]): Promise<FlipItem[]> {
  const typeArrays = await Promise.all(groupIds.map(gid => getCachedGroupTypes(gid)))
  const types = typeArrays.flat().slice(0, MAX_TYPES)

  const statsResults = await Promise.allSettled(
    types.map(t =>
      getMarketStats(regionId, t.typeID).then(stats => ({ type: t, stats }))
    )
  )

  const flips: FlipItem[] = []
  for (const result of statsResults) {
    if (result.status !== 'fulfilled') continue
    const { type, stats } = result.value
    if (!stats) continue
    const { minSell, maxBuy, sellVolume, buyVolume } = stats
    if (!Number.isFinite(minSell) || minSell <= 0) continue
    if (!Number.isFinite(maxBuy) || maxBuy <= 0) continue
    const profit = minSell - maxBuy
    if (!Number.isFinite(profit) || profit <= 0) continue
    const margin = (profit / minSell) * 100
    if (!Number.isFinite(margin)) continue
    const bv = Number.isFinite(buyVolume) && buyVolume > 0 ? buyVolume : 0
    const sv = Number.isFinite(sellVolume) && sellVolume > 0 ? sellVolume : 0
    // liquidityScore = bottleneck: you need sellers to fill your buy order AND buyers to fill your sell order
    const liquidityScore = Math.min(bv, sv)
    if (liquidityScore < MIN_LIQUIDITY) continue
    flips.push({
      typeId: type.typeID,
      typeName: type.typeName,
      maxBuy: stats.maxBuy,
      minSell: stats.minSell,
      profit,
      margin,
      buyVolume: bv,
      sellVolume: sv,
      liquidityScore,
      buyColor: volumeColor(bv, sv),
      sellColor: volumeColor(sv, bv),
    })
  }
  return flips
}

export function useFlips(regionId: number, groupIds: number[]) {
  return useQuery({
    queryKey: ['flips', regionId, ...groupIds],
    queryFn: () => fetchFlips(regionId, groupIds),
    enabled: groupIds.length > 0,
    staleTime: 60_000,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
  })
}
