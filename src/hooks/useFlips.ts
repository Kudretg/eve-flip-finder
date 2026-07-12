import { useQuery } from '@tanstack/react-query'
import { getMarketStats, getMarketGroupTypes } from '@/lib/api'
import type { MarketStats, MarketType } from '@/lib/api'
import type { FlipItem } from '@/types'
import type { Item } from '@/data/items'
import { isExcludedFlipItem } from '@/lib/utils'

const MAX_TYPES = 25000 // safety rail, not an active truncation point for realistic category combos
const MIN_LIQUIDITY = 1
const CONCURRENCY = 20
const CATALOG_CONCURRENCY = 14 // full-catalog scan only — keep polite to evetycoon's free/unauthenticated API
const GROUP_TYPES_TTL = 5 * 60 * 1000
const STATS_TTL = 60_000
const CATALOG_STALE_TIME = 5 * 60_000

const groupTypesCache = new Map<number, { data: MarketType[]; ts: number }>()
const statsCache = new Map<string, { data: MarketStats; ts: number }>()

async function getCachedGroupTypes(groupId: number): Promise<MarketType[]> {
  const entry = groupTypesCache.get(groupId)
  if (entry && Date.now() - entry.ts < GROUP_TYPES_TTL) return entry.data
  const data = await getMarketGroupTypes(groupId)
  groupTypesCache.set(groupId, { data, ts: Date.now() })
  return data
}

export async function getCachedStats(regionId: number, typeId: number, signal?: AbortSignal): Promise<MarketStats> {
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

/** Shared by the bulk scan and the on-demand single-item add — raw (pre-fee)
 *  profit/margin/liquidity/color. Returns null only for degenerate/non-finite
 *  numbers (no real market on either side). Does NOT apply business-rule
 *  exclusions (profit<=0, low liquidity) — callers decide whether those matter. */
export function buildFlipItem(type: { typeID: number; typeName: string }, stats: MarketStats): FlipItem | null {
  const { minSell, maxBuy, sellVolume, buyVolume } = stats
  if (!Number.isFinite(minSell) || minSell <= 0) return null
  if (!Number.isFinite(maxBuy) || maxBuy <= 0) return null
  const profit = minSell - maxBuy
  if (!Number.isFinite(profit)) return null
  const margin = (profit / minSell) * 100
  if (!Number.isFinite(margin)) return null
  const bv = Number.isFinite(buyVolume) && buyVolume > 0 ? buyVolume : 0
  const sv = Number.isFinite(sellVolume) && sellVolume > 0 ? sellVolume : 0
  const liquidityScore = Math.min(bv, sv)
  return {
    typeId: type.typeID,
    typeName: type.typeName,
    maxBuy,
    minSell,
    profit,
    margin,
    buyVolume: bv,
    sellVolume: sv,
    liquidityScore,
    buyColor: volumeColor(bv, sv),
    sellColor: volumeColor(sv, bv),
  }
}

interface ScoreTypesOpts {
  concurrency?: number
  onProgress?: (done: number, total: number) => void
}

/** Shared by every scan mode: fetch stats per type (fault-tolerant — a failed
 *  request is skipped, not fatal), build flip items, apply business filters. */
async function scoreTypes(
  regionId: number,
  types: { typeID: number; typeName: string }[],
  signal: AbortSignal,
  opts: ScoreTypesOpts = {}
): Promise<FlipItem[]> {
  const { concurrency = CONCURRENCY, onProgress } = opts
  let done = 0

  // Skip blueprints & SKINs before the stats fetch — no wasted evetycoon calls.
  const scannable = types.filter(t => !isExcludedFlipItem(t.typeName))

  const tasks = scannable.map(t => async () => {
    try {
      const stats = await getCachedStats(regionId, t.typeID, signal)
      return { type: t, stats }
    } finally {
      done++
      onProgress?.(done, scannable.length)
    }
  })

  const statsResults = await runConcurrent(tasks, concurrency, signal)

  const flips: FlipItem[] = []
  for (const result of statsResults) {
    if (result.status !== 'fulfilled') continue
    const { type, stats } = result.value
    if (!stats) continue
    const flip = buildFlipItem(type, stats)
    if (!flip) continue
    if (flip.profit <= 0) continue
    if (flip.liquidityScore < MIN_LIQUIDITY) continue
    flips.push(flip)
  }
  return flips
}

async function fetchFlips(regionId: number, groupIds: number[], signal: AbortSignal): Promise<FlipItem[]> {
  const typeArrays = await Promise.all(groupIds.map(gid => getCachedGroupTypes(gid)))
  const types = typeArrays.flat().slice(0, MAX_TYPES)
  return scoreTypes(regionId, types, signal)
}

async function fetchAllItemsFlips(
  regionId: number,
  items: Item[],
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void
): Promise<FlipItem[]> {
  const types = items.map(item => ({ typeID: item.typeId, typeName: item.name }))
  return scoreTypes(regionId, types, signal, { concurrency: CATALOG_CONCURRENCY, onProgress })
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

export function useAllItemsFlips(
  regionId: number,
  items: Item[] | undefined,
  enabled: boolean,
  onProgress?: (done: number, total: number) => void
) {
  const query = useQuery({
    queryKey: ['flips-all', regionId],
    queryFn: ({ signal }) => fetchAllItemsFlips(regionId, items!, signal, onProgress),
    enabled: enabled && !!items?.length,
    staleTime: CATALOG_STALE_TIME,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
  })
  return { data: query.data, isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: query.refetch }
}
