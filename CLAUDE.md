# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Web (Vercel deployment)
npm run dev            # Vite dev server at localhost:5173
npm run build          # tsc -b && vite build
npm run lint           # oxlint (Rust-based, fast)

# Electron desktop app
npm run electron:dev   # compiles electron/ + starts Vite + launches Electron window
npm run electron:compile  # tsc -p tsconfig.electron.json → electron-dist/
npm run electron:build    # full production build → release/EVE Flip Finder Setup x.x.x.exe
```

No test suite is configured. TypeScript strict mode is the primary correctness check.

After any change to `electron/` files, run `electron:compile` before `electron:dev` (or just use `electron:dev` which compiles first).

## Architecture

Two separate build targets share the same React UI:

**Web** — Vite + React 19 SPA, deployed to Vercel. API calls go through `api/proxy.ts` (Vercel Edge Function) to bypass evetycoon.com CORS. `vite.config.ts` sets `base: './'` (required for Electron file:// protocol).

**Electron** — desktop app wrapping the same UI. `electron/main.ts` is the Node.js main process; `electron/preload.ts` bridges it to the renderer via `contextBridge`. All IPC is defined in `electron/preload.ts` and typed in `src/types/electron.d.ts`.

### Electron IPC channels

| Channel | Direction | Purpose |
|---|---|---|
| `config:get-client-id` / `config:set-client-id` | renderer → main | persist CCP Client ID |
| `auth:login` / `auth:logout` / `auth:status` | renderer → main | EVE SSO OAuth2 PKCE flow |
| `monitor:start` / `monitor:stop` / `monitor:status` | renderer → main | order polling loop |
| `monitor:update` | main → renderer | push status on each scan |
| `api:fetch` | renderer → main | proxy evetycoon API calls (bypasses CORS) |
| `clipboard:copy` | renderer → main | write price to clipboard |
| `ui:open-market` | renderer → main | POST to ESI `/ui/openwindow/marketdetails/` |

### Electron auth flow (`electron/auth.ts`)

OAuth2 PKCE — no client secret needed. Spins up `http.createServer` on port `3456` waiting for the SSO callback, exchanges the code for tokens, stores them in `electron-store`. Token refresh happens automatically before each ESI call in `refreshTokenIfNeeded()`. Character ID extracted from JWT sub: `"CHARACTER:EVE:{id}"`.

Required OAuth scopes:
- `esi-wallet.read_character_wallet.v1`
- `esi-markets.read_character_orders.v1`
- `esi-ui.open_window.v1`

If a user linked before `esi-ui.open_window.v1` was added, they must Unlink and re-link to grant the new scope.

### Monitor loop (`electron/monitor.ts`)

Polls every 5 minutes (matches ESI order cache TTL). On each iteration:
1. Fetches active orders + history + wallet balance via ESI
2. Compares against previous snapshot to detect **fills** (order disappeared and not in history = filled, not cancelled)
3. Fetches evetycoon market stats per order to detect **undercuts**
4. Pushes desktop notification + writes suggested price to clipboard on new alerts
5. Emits `monitor:update` IPC event to renderer

`isFirstScan` flag suppresses alerts on the first iteration to avoid false positives on startup. `previousUndercutState` prevents repeated alerts for the same undercut order.

### API routing (`src/lib/api.ts`)

```ts
const isElectron = typeof window !== 'undefined' && !!window.electronAPI
// In Electron: routes through IPC api:fetch (main process fetch, no CORS issue)
// On web: hits relative /api/v1 path (Vite proxy in dev, Vercel Edge Function in prod)
```

### Web data pipeline (`src/hooks/useFlips.ts`)

1. `Promise.all` → `getCachedGroupTypes(groupId)` per group → flat type list (cap `MAX_TYPES = 500`)
2. `runConcurrent(tasks, 20, signal)` — 20-worker pool fetches market stats (prevents 500 simultaneous requests)
3. Per-type stats cached in `statsCache` (Map keyed `regionId:typeId`, TTL 60s)
4. TanStack Query v5 `signal` threaded through to every `fetch()` for cancellation on hub/category switch

In Electron, the same hook works but `apiFetch` routes through IPC instead of direct HTTP.

## Fee adjustment formula

Applied in `adjustedData` useMemo in `App.tsx`:
```ts
adjProfit = minSell * (1 - brokerFee - salesTax) - maxBuy * (1 + brokerFee)
adjMargin = (adjProfit / minSell) * 100
```
Defaults: 3% broker, 8% sales tax. Changing fees does not re-fetch — only re-runs the memo.

## Top Trades scoring

```ts
score = margin * log10(profit + 1) * log10(liquidityScore + 1) * balance
// balance = min(buyVolume, sellVolume) / max(buyVolume, sellVolume)
```
`balance` penalises items where one volume side dwarfs the other.

## Extending item categories

Add to `ITEM_CATEGORIES` (not `CATEGORIES`) in `App.tsx`:
```ts
{ label: 'My Category', groupIds: [<leaf group IDs>] }
```

Only **leaf** groups work with evetycoon — groups where ESI returns non-empty `types[]`. Parent groups (e.g. "Command Ships") return nothing from evetycoon. Find leaf groups via:
```
GET https://esi.evetech.net/latest/markets/groups/{id}/  →  check types[] is non-empty
```

## Key constraints

- `sandbox: false` in `BrowserWindow.webPreferences` is required for ESM preload scripts in Electron 28+. Do not remove it.
- `electron-store` v11 is ESM-only. Import as `import Store from 'electron-store'`.
- `electron-dist/` and `release/win-unpacked/` are gitignored (compiled output). The installer `.exe` in `release/` is tracked on the `testing` branch.
- The `testing` branch holds Electron work. `main` is the stable web-only version.

## Styling

Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js`). Theme defined via `@theme inline` + CSS vars in `src/index.css`. Dark EVE palette: `--primary` gold, `--green` for profit/fills, `--destructive` for undercuts. UI primitives in `src/components/ui/` are hand-written (no Radix).

## evetycoon API

Base: `https://evetycoon.com/api/v1` (no auth required)
- `GET /market/stats/{regionId}/{typeId}` → `MarketStats` (`maxBuy`, `minSell`, volumes)
- `GET /market/groups/{groupId}/types` → `MarketType[]`

Guard all numeric fields with `Number.isFinite` — illiquid items return `0` or missing values.
