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

Single-page Vite + React 19 + TypeScript app. All logic lives in `src/`.

**Data flow:**
1. `App.tsx` holds the three pieces of UI state: `hubIndex`, `categoryIndex`, `sort`
2. `HUBS` and `CATEGORIES` are hardcoded constants in `App.tsx` — hubs map to `regionId` (used for API calls), and categories map to lists of evetycoon market group IDs (leaf groups, pre-computed from the EVE market group tree)
3. `useFlips(regionId, groupIds)` in `src/hooks/useFlips.ts` drives all data fetching via TanStack Query v5:
   - Phase 1: `Promise.all` on `getMarketGroupTypes(groupId)` for each group ID → list of item types
   - Phase 2: `Promise.allSettled` on `getMarketStats(regionId, typeID)` for each type → raw stats
   - Filters out items where `profit ≤ 0` or any numeric field is non-finite (the evetycoon API can return missing/zero fields for items with no active orders)
   - Returns `FlipItem[]`; sorting happens in `App.tsx` via `useMemo`
4. Query key is `['flips', regionId, ...groupIds]`; results are cached for 60 seconds

**API proxy:** `src/lib/api.ts` uses `BASE = '/api/v1'` (relative). The Vite dev server proxies `/api` → `https://evetycoon.com` (`vite.config.ts`). This is required because evetycoon.com does not send CORS headers — direct browser fetches are blocked. There is no backend; the proxy only exists in dev.

**Styling:** Tailwind CSS v4 with `@tailwindcss/vite` (no `tailwind.config.js`). Theme is configured via `@theme inline` + CSS custom properties in `src/index.css`. Dark EVE-themed palette — `--primary` is gold (`hsl(38 95% 55%)`), `--green` is used for profit values. shadcn-style UI components in `src/components/ui/` are hand-written wrappers (no Radix primitives); the `Select` component uses a native `<select>`.

**Types:** `src/types.ts` exports `FlipItem`, `SortKey`, `Hub`, `Category`. API response shapes are defined in `src/lib/api.ts` as `MarketStats` and `MarketType`.

## evetycoon API

Base: `https://evetycoon.com/api/v1` (no auth required)

- `GET /market/stats/{regionId}/{typeId}` → `MarketStats` (buy/sell prices, volumes)
- `GET /market/groups/{groupId}/types` → `MarketType[]` (item list for a market group)

`maxBuy` = best buy order price; `minSell` = best sell order price. Flip profit = `minSell - maxBuy`. The API may return `0` or omit fields for illiquid items — always guard with `Number.isFinite`.

## Extending categories

To add a new item category, add an entry to `CATEGORIES` in `App.tsx`:
```ts
{ label: 'My Category', groupIds: [<leaf group IDs>] }
```
Leaf group IDs (those with `hasTypes: true`) must come from the evetycoon market groups tree (`GET /market/groups`). The MCP server `eve-tycoon-mcp` at `~/Projects/eve-tycoon-mcp/` exposes `get_market_groups` and `get_market_group_types` tools for exploring this.
