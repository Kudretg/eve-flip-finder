import { useQuery } from '@tanstack/react-query'
import { getMarketStats, getMarketGroupTypes } from '@/lib/api'
import type { MarketStats, MarketType } from '@/lib/api'
import type { FlipItem } from '@/types'

const MAX_TYPES = 500
const MIN_LIQUIDITY = 1
const CONCURRENCY = 20
const GROUP_TYPES_TTL = 5 * 60 * 1000
const STATS_TTL = 60_000

const groupTypesCache = new Map<number, { data: MarketType[]; ts: number }>()
const statsCache = new Map<string, { data: MarketStats; ts: number }>()

async function getCachedGroupTypes(groupId: number): Promise<MarketType[]> {
  const entry = groupTypesCache.get(groupId)
  if (entry && Date.now() - entry.ts < GROUP_TYPES_TTL) return entry.data
  const data = await getMarketGroupTypes(groupId)
  groupTypesCache.set(groupId, { data, ts: Date.now() })
  return data
}

async function getCachedStats(regionId: number, typeId: number, signal: AbortSignal): Promise<MarketStats> {
  const key = `${regionId}:${typeId}`
  const entry = statsCache.get(key)
  if (entry && Date.now() - entry.ts < STATS_TTL) return entry.data
  const data = await getMarketStats(regionId, typeId, signal)
  statsCache.set(key, { data, ts: Date.now() })
  return data
}

async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  signal: AbortSignal
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const i = index++
      if (signal.aborted) {
        results[i] = { status: 'rejected', reason: new DOMException('Aborted', 'AbortError') }
        continue
      }
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() }
      } catch (e) {
        results[i] = { status: 'rejected', reason: e }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
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

async function fetchFlips(regionId: number, groupIds: number[], signal: AbortSignal): Promise<FlipItem[]> {
  const typeArrays = await Promise.all(groupIds.map(gid => getCachedGroupTypes(gid)))
  const types = typeArrays.flat().slice(0, MAX_TYPES)

  const tasks = types.map(t => () =>
    getCachedStats(regionId, t.typeID, signal).then(stats => ({ type: t, stats }))
  )

  const statsResults = await runConcurrent(tasks, CONCURRENCY, signal)

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

export function clearStatsCache() {
  statsCache.clear()
}

export function useFlips(regionId: number, groupIds: number[]) {
  const query = useQuery({
    queryKey: ['flips', regionId, ...groupIds],
    queryFn: ({ signal }) => fetchFlips(regionId, groupIds, signal),
    enabled: groupIds.length > 0,
    staleTime: 60_000,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
  })
  return { data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: query.refetch }
}
