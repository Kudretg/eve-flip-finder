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

# Item catalog (regenerate after a game patch)
npm run sync:items      # rebuilds public/items.generated.json from CCP's SDE
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

### Auto-update (`electron-updater`)

`electron/main.ts` calls `autoUpdater.checkForUpdatesAndNotify()` once on `app.whenReady()`, guarded by `!isDev` (no-op in `electron:dev`). The update feed is GitHub Releases, configured via `build.publish` in `package.json` (`owner`/`repo`, no token needed for a public repo's check+download) — electron-builder bakes this into `resources/app-update.yml` at build time. To ship an update: bump `version` in `package.json`, `npm run electron:build`, then `gh release create vX.Y.Z release/*.exe release/*.exe.blockmap` (tag must match the `version` field). No custom update UI is wired — `checkForUpdatesAndNotify` shows a native OS notification when a downloaded update is ready; the user still has to restart the app to apply it.

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

1. `Promise.all` → `getCachedGroupTypes(groupId)` per group → flat type list (`MAX_TYPES = 25000` is a safety rail, not an active truncation point for realistic category combos)
2. Shared `scoreTypes(regionId, types, signal, opts?)` does the concurrent stats fetch + `buildFlipItem` + business filters for every scan mode. `runConcurrent` isolates failures per-task (one bad request doesn't fail the batch) and reports progress via `opts.onProgress`.
3. Per-type stats cached in `statsCache` (Map keyed `regionId:typeId`, TTL 60s), exposed via exported `getCachedStats(regionId, typeId, signal?)`
4. TanStack Query v5 `signal` threaded through to every `fetch()` for cancellation on hub/category switch

Raw (pre-fee) profit/margin/liquidity/color computation lives in exported `buildFlipItem(type, stats)` — a pure function shared by every scan mode and the on-demand catalog-search add (see below). It returns `null` only for degenerate/non-finite numbers; business-rule exclusions (profit ≤ 0, low liquidity) are applied inside `scoreTypes` only, so manually-added items aren't subject to them.

**Full-catalog scan** (`useAllItemsFlips`, `App.tsx`'s "Scan Entire Catalog" toggle) — bypasses `getCachedGroupTypes`/evetycoon's per-group lookup entirely and feeds `public/items.generated.json` (all ~19k marketable items) straight into `scoreTypes`. Opt-in only: `enabled` requires the toggle to be on, not just the catalog being loaded, so it never fires on mount. Runs at `CATALOG_CONCURRENCY = 14` (separate constant from the category path's `CONCURRENCY = 20` — deliberately capped low to stay polite to evetycoon's free/unauthenticated API) and `staleTime: 5 * 60_000` (matches evetycoon's stats cache TTL, so toggling/remounting within 5 minutes doesn't re-trigger ~19k requests). No progressive rendering — the table paints once the full batch resolves; a `scanProgress` counter (wired via `onProgress`) shows "scanning X / Y items" while it's in flight instead.

In Electron, the same hook works but `apiFetch` routes through IPC instead of direct HTTP.

### Item catalog + full-catalog search

`public/items.generated.json` is a generated, committed-to-git snapshot of every marketable EVE item (~19k), built by `scripts/sync-items.ts` from CCP's Static Data Export. Three-tier source chain (first success wins, recorded in `public/items.generated.meta.json`'s `source` field):
1. `sde-enhanced` — `https://sde.riftforeve.online/assets/eve-online-static-data-latest-enhanced-jsonl.zip` (Nohus's unofficial mirror; only source with `repackagedVolume` → `Item.packagedVolume`)
2. `sde-ccp` — CCP's official jsonl export (same shape, no `repackagedVolume`)
3. `fuzzwork` — `invTypes.csv` (different shape: flat `typeName`, `published` is `"1"`/`"0"` not boolean — has its own mapper, not shared with the jsonl mapper)

Filter for "marketable": `published === true && marketGroupID != null`. Conditional GET against each tier's `-latest-` URL follows the redirect to a build-numbered file and reads `ETag`/`Last-Modified` off the *final* response (the redirect itself isn't versioned). Cache lives in `.sde-cache/` (gitignored).

`src/data/items.ts` is the single source of truth for the `Item` type (imported by the sync script too) and exposes `useItemCatalog()` (TanStack Query, `staleTime: Infinity`, fetches the JSON once) and `searchCatalog(items, query, limit)` — case-insensitive, word-order-independent token matching, ranked prefix > word-start > substring.

The search bar in `App.tsx` uses `searchCatalog` against the full catalog for its autocomplete dropdown (not just currently-scanned items). Selecting an item not already in the scanned set triggers an on-demand fetch via `getCachedStats`/`buildFlipItem` for the **currently selected hub**, shown as a loading row (`manualFlips` state) until it resolves, then merged into `adjustedData` before the fee-adjustment step. Manually-added items (`FlipItem.isManual`) skip the minMargin/min-buy/max-buy threshold filters — they were deliberately searched for, so they don't disappear right after being added — but still get the same fee-adjusted math and rendering as scanned rows. Switching hubs re-fetches all manually-added items against the new region.

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

`ITEM_CATEGORIES`' `groupIds` are the same ID space as the item catalog's `marketGroupID` (e.g. Rifter's `marketGroupID` is `64`, matching the `64` already listed under `Frigates`) — the catalog isn't a separate categorization scheme.

## Key constraints

- `sandbox: false` in `BrowserWindow.webPreferences` is required for ESM preload scripts in Electron 28+. Do not remove it.
- `electron-store` v11 is ESM-only. Import as `import Store from 'electron-store'`.
- `electron-dist/` and all of `release/` (including the built installer) are gitignored — the `.exe` is **not** committed. It's distributed via GitHub Releases instead (`gh release create` with the exe + blockmap as assets), which is also how `electron-updater` finds updates (see below).
- The `testing` branch holds Electron work. `main` is the stable web-only version.
- `npm run electron:build` / `electron-builder` can fail with `EPERM: ... rename '...win-unpacked.tmp' -> '...win-unpacked'`. This is usually a stray leftover `vite`/`npm run dev` process still holding a handle on the project directory, not an antivirus lock — kill orphaned `node.exe`/`vite` processes first (`tasklist`/`wmic process where "name='node.exe'"` to find them) before assuming it's Defender.

## Styling

Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js`). Theme defined via `@theme inline` + CSS vars in `src/index.css`. Dark EVE palette: `--primary` gold, `--green` for profit/fills, `--destructive` for undercuts. UI primitives in `src/components/ui/` are hand-written (no Radix).

## evetycoon API

Base: `https://evetycoon.com/api/v1` (no auth required)
- `GET /market/stats/{regionId}/{typeId}` → `MarketStats` (`maxBuy`, `minSell`, volumes)
- `GET /market/groups/{groupId}/types` → `MarketType[]`

Guard all numeric fields with `Number.isFinite` — illiquid items return `0` or missing values.
