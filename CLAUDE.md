# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server at localhost:5173
npm run build      # tsc -b && vite build
npm run lint       # oxlint (fast Rust-based linter)
npm run preview    # preview production build
```

No test suite is configured.

## Architecture

Single-page Vite + React 19 + TypeScript app. All logic lives in `src/`. Deployed to Vercel at `eve-flip-finder.vercel.app`.

**Data pipeline (in order):**
1. `useFlips(regionId, groupIds)` → raw `FlipItem[]` (profit > 0, liquidityScore ≥ 1)
2. `adjustedData` useMemo → applies broker fee + sales tax, filters to adjusted margin ≥ 5%
3. `sorted` useMemo → sorts `adjustedData`, then filters by `search` string
4. `topTrades` useMemo → ranks `adjustedData` by score formula, slices top 10
5. `paginated` → slice of `sorted` for current page

**State in `App.tsx`:** `hubIndex`, `categoryIndex`, `sort`, `pageSize`, `page`, `brokerFee`, `salesTax`, `search`, `showSuggestions`

**Fee adjustment formula** (applied in `adjustedData`):
```ts
adjProfit = minSell * (1 - brokerFee - salesTax) - maxBuy * (1 + brokerFee)
adjMargin = (adjProfit / minSell) * 100
```
Fees default to 3% broker, 8% sales tax (EVE base rates, no skills). Changing fees does NOT invalidate the query cache — only the `adjustedData` useMemo re-runs.

**Top Trades scoring formula:**
```ts
score = margin * log10(profit + 1) * log10(liquidityScore + 1) * balance
// balance = min(buyVolume, sellVolume) / max(buyVolume, sellVolume)  →  0–1
```
Uses adjusted profit/margin. The `balance` factor penalises items where one volume side dwarfs the other.

**`HUBS` and `CATEGORIES`** are hardcoded in `App.tsx`. `CATEGORIES` prepends an `All Items` entry that spreads every `groupId` from `ITEM_CATEGORIES` — never edit `CATEGORIES` directly.

**Volume color gradient:** `hue = 142 * (vol / max(vol, otherVol))` → 0° red (bottleneck leg) to 142° green. Computed in `useFlips.ts` via `volumeColor(vol, otherVol)`.

**Search autocomplete:** `suggestions` useMemo ranks by starts-with before contains, caps at 10. Dropdown uses `onMouseDown` (not `onClick`) to fire before the input's `onBlur` closes it.

## useFlips.ts internals

`src/hooks/useFlips.ts` drives all fetching via TanStack Query v5.

- **Phase 1:** `Promise.all` on `getCachedGroupTypes(groupId)` for each group → flat type list (capped at `MAX_TYPES = 500`). Group types are cached 5 min in `groupTypesCache`.
- **Phase 2:** `runConcurrent(tasks, 20, signal)` — a 20-worker pool replaces the previous `Promise.allSettled`. Prevents 500 simultaneous requests to the Vercel proxy.
- **Per-type cache:** `statsCache` (Map keyed `regionId:typeId`, TTL 60s). Repeat visits to the same category/hub serve from memory.
- **Abort:** TanStack Query v5 passes `signal` to `queryFn`; it's threaded through to every `fetch()`. Switching hub/category mid-load cancels in-flight requests.

## API proxy

`src/lib/api.ts` uses `BASE = '/api/v1'` (relative, works in dev and prod). evetycoon.com sends no CORS headers so a proxy is required in both environments.

- **Dev:** Vite proxies `/api` → `https://evetycoon.com` (`vite.config.ts`)
- **Prod:** `api/proxy.ts` Vercel Edge Function. `vercel.json` rewrites `/api/v1/:path*` → `/api/proxy?path=:path*`

Both `getMarketStats` and `apiFetch` accept an optional `AbortSignal`.

## evetycoon API

Base: `https://evetycoon.com/api/v1` (no auth)

- `GET /market/stats/{regionId}/{typeId}` → `MarketStats`
- `GET /market/groups/{groupId}/types` → `MarketType[]`

`maxBuy` = best buy order; `minSell` = best sell order. Guard all fields with `Number.isFinite` — illiquid items may return `0` or missing values. `MarketStats` also includes `buyOrders`, `sellOrders`, `buyAvgFivePercent`, `sellAvgFivePercent` which are fetched but not currently displayed.

## Extending categories

Add an entry to `ITEM_CATEGORIES` (not `CATEGORIES`) in `App.tsx`:
```ts
{ label: 'My Category', groupIds: [<leaf group IDs>] }
```

**Finding leaf group IDs:** Use the CCP ESI API — evetycoon does not expose a group tree endpoint.
```
GET https://esi.evetech.net/latest/markets/groups/          → all group IDs
GET https://esi.evetech.net/latest/markets/groups/{id}/    → { name, parent_group_id, types[] }
```
A group is a **leaf** (has actual items) when its `types` array is non-empty. Parent/class-level groups (e.g. "Command Ships") have `types: []` and must NOT be used — evetycoon's `/market/groups/{id}/types` will return nothing for them. Always use the race-level sub-groups (e.g. Amarr Command Ships, Caldari Command Ships, etc.).

The `All Items` category updates automatically from `ITEM_CATEGORIES` — no manual change needed.

## Styling

Tailwind CSS v4 with `@tailwindcss/vite` (no `tailwind.config.js`). Theme via `@theme inline` + CSS vars in `src/index.css`. Dark EVE palette: `--primary` gold, `--green` for profit. UI components in `src/components/ui/` are hand-written (no Radix); `Select` wraps a native `<select>`.

**Types:** `src/types.ts` exports `FlipItem`, `SortKey`, `Hub`, `Category`. API shapes are in `src/lib/api.ts`.
