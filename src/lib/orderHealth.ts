import { getTickSize } from '@/lib/utils'
import type { ActiveOrderUI, MonitorConfig } from '@/types/electron'

export interface BuyOrderHealth {
  /** Margin (pp) left if you re-bid to stay top-of-book; null when no sell-side price. */
  competeMargin: number | null
  /** How far below the top buy you currently sit, in pp (0 when not undercut). */
  gapPct: number
  ageDays: number
  capitalLocked: number
  /** Human-readable cancel reasons; empty = not a cancel candidate. */
  reasons: string[]
  /** Composite weakness, in percentage points. Higher = worse. */
  weakness: number
}

const STALE_DAYS = 3
const STALE_FILL_RATE = 0.1
const BURIED_GAP_PCT = 5

/**
 * Score a single buy order for "should I cancel this and find a better flip?".
 * Primary signal is dead flip margin (margin left if you stay competitive),
 * with undercut depth and staleness as secondary tie-breakers. All score
 * terms are in percentage points so `weakness` is a single interpretable number.
 * Returns null for sell orders.
 */
export function scoreBuyOrder(order: ActiveOrderUI, config: MonitorConfig): BuyOrderHealth | null {
  if (!order.isBuyOrder) return null

  const bf = config.brokerFee / 100
  const st = config.salesTax / 100
  const topBuy = order.currentMarketPrice

  // Price you'd need to bid to be top-of-book again.
  const competePrice = order.isUndercut && topBuy !== null
    ? topBuy + getTickSize(topBuy)
    : order.price

  const marketSell = order.marketSell
  const competeMargin = marketSell !== null
    ? ((marketSell * (1 - bf - st) - competePrice * (1 + bf)) / marketSell) * 100
    : null

  const gapPct = order.isUndercut && topBuy !== null && topBuy > 0
    ? ((topBuy - order.price) / topBuy) * 100
    : 0

  const ageDays = (Date.now() - Date.parse(order.issued)) / 86_400_000
  const fillRate = order.volumeTotal > 0
    ? (order.volumeTotal - order.volumeRemain) / order.volumeTotal
    : 0
  const capitalLocked = order.price * order.volumeRemain

  const reasons: string[] = []
  if (competeMargin !== null && competeMargin < config.minMargin) {
    reasons.push(competeMargin < 0
      ? 'Unprofitable flip'
      : `Margin gone (${competeMargin.toFixed(1)}% if you compete)`)
  }
  if (gapPct > BURIED_GAP_PCT) {
    reasons.push(`Buried — top buy is ${gapPct.toFixed(1)}% higher`)
  }
  if (ageDays > STALE_DAYS && fillRate < STALE_FILL_RATE) {
    reasons.push(`Stale — ${Math.floor(ageDays)}d old, ~0 filled`)
  }

  const marginDeficit = competeMargin !== null ? Math.max(0, config.minMargin - competeMargin) : 0
  const buriedPenalty = gapPct * 0.5
  const stalePenalty = (Math.min(ageDays, 30) / 30) * (1 - fillRate) * 10
  const weakness = marginDeficit + buriedPenalty + stalePenalty

  return { competeMargin, gapPct, ageDays, capitalLocked, reasons, weakness }
}

/**
 * Filter active orders to buy-order cancel candidates, ranked worst-first.
 * Orders with a real (non-null) margin deficit outrank illiquid ones scored
 * only on buried/stale penalties.
 */
export function getCancelCandidates(
  orders: ActiveOrderUI[],
  config: MonitorConfig,
): { order: ActiveOrderUI; health: BuyOrderHealth }[] {
  return orders
    .map(order => ({ order, health: scoreBuyOrder(order, config) }))
    .filter((x): x is { order: ActiveOrderUI; health: BuyOrderHealth } =>
      x.health !== null && x.health.reasons.length > 0)
    .sort((a, b) => {
      const aReal = a.health.competeMargin !== null
      const bReal = b.health.competeMargin !== null
      if (aReal !== bReal) return aReal ? -1 : 1
      return b.health.weakness - a.health.weakness
    })
}
