import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFlips, clearStatsCache } from '@/hooks/useFlips'
import { formatISK, formatVolume } from '@/lib/utils'
import { TraderPanel } from '@/components/TraderPanel'
import { isElectron } from '@/hooks/useMonitor'
import type { Hub, Category, SortKey } from '@/types'

const HUBS: Hub[] = [
  { label: 'Jita',    systemId: 30000142, regionId: 10000002 },
  { label: 'Amarr',   systemId: 30002187, regionId: 10000043 },
  { label: 'Dodixie', systemId: 30002659, regionId: 10000032 },
  { label: 'Rens',    systemId: 30002510, regionId: 10000030 },
  { label: 'Hek',     systemId: 30002053, regionId: 10000042 },
]

const ITEM_CATEGORIES: Category[] = [
  // ── Ships (by class) ──────────────────────────────────────────────────────
  { label: 'Frigates', groupIds: [
    1616, 77, 72, 64, 61,             // T1 by race
    400, 401, 402, 403,               // Interceptors
    421, 422, 423, 424,               // Covert Ops + Stealth Bombers
    433, 434, 435, 436, 2536,         // Assault Frigates
    1066, 1067, 1068, 1069,           // Electronic Attack Frigates
    2147, 2148, 2149, 2150,           // Logistics Frigates
  ] },
  { label: 'Destroyers', groupIds: [
    468, 467, 466, 465, 3755,         // T1 by race
    826, 829, 832, 835,               // Interdictors
    2126, 2131, 2132, 2133, 2537, 3764, // Command Destroyers
    1952, 1953, 2021, 2034,           // Tactical Destroyers (T3)
  ] },
  { label: 'Cruisers', groupIds: [
    76, 75, 74, 73,                   // T1 by race
    449, 450, 451, 452, 2535,         // Heavy Assault Cruisers
    827, 830, 833, 836,               // Recon Ships
    1071, 1072, 1073, 1074,           // Heavy Interdiction Cruisers
    438, 439, 440, 441, 2526,         // Logistics Cruisers
    1139, 1140, 1141, 1142,           // Strategic Cruisers (T3)
    1371, 1370, 3537,                 // Faction Cruisers
  ] },
  { label: 'Battlecruisers', groupIds: [
    473, 472, 471, 470,               // T1 by race
    825, 828, 831, 834,               // Command Ships (T2)
  ] },
  { label: 'Battleships', groupIds: [
    81, 80, 79, 78,                   // T1 by race
    1081, 1082, 1083, 1084, 3744,     // Marauders
    1076, 1077, 1078, 1079,           // Black Ops
    1380, 1379, 3538,                 // Faction Battleships
  ] },
  { label: 'Capital Ships', groupIds: [
    762, 763, 764, 765,               // Dreadnoughts (by race)
    818, 819, 820, 821, 1392,         // Carriers + Supercarriers + Faction
    2272, 2273, 2274, 2275,           // Force Auxiliaries (by race)
    813, 814, 815, 816,               // Titans (by race)
  ] },
  { label: 'Industrial & Freighters', groupIds: [
    494,                              // Mining Barges
    874,                              // Exhumers
    629,                              // Transport Ships
    767, 768, 769, 770,               // Freighters (by race)
    1090, 1091, 1092, 1093,           // Jump Freighters (by race)
    1048,                             // Capital Industrial Ships (Rorqual)
  ] },
  // ── Turrets & Launchers ───────────────────────────────────────────────────
  { label: 'Energy Turrets', groupIds: [
    567, 568, 569,                    // Beam Lasers: S/M/L
    570, 572, 573,                    // Pulse Lasers: S/M/L
  ] },
  { label: 'Hybrid Turrets', groupIds: [
    561, 562, 563,                    // Blasters: S/M/L
    564, 565, 566,                    // Railguns: S/M/L
  ] },
  { label: 'Projectile Turrets', groupIds: [
    574, 575, 576,                    // Autocannons: S/M/L
    577, 578, 579,                    // Artillery: S/M/L
  ] },
  { label: 'Precursor Turrets', groupIds: [
    2433, 2434, 2435,                 // Entropic Disintegrators: S/M/L
  ] },
  { label: 'Missile Launchers', groupIds: [
    639,                              // Rocket Launchers
    640,                              // Light Missile Launchers
    641,                              // Rapid Light Missile Launchers
    642,                              // Heavy Launchers
    643,                              // Cruise Launchers
    644,                              // Torpedo Launchers
    777,                              // XL Launchers
    1827,                             // Rapid Heavy Missile Launchers
  ] },
  { label: 'Weapon Upgrades',  groupIds: [2740, 2471, 2033, 2032, 801, 708, 707, 706, 648, 647, 646, 645] },
  // ── Ammunition & Charges ─────────────────────────────────────────────────
  { label: 'Projectile Ammo', groupIds: [
    113, 112, 109,                    // T1 Standard: S/M/L
    856, 855, 854,                    // T2 Artillery: S/M/L
    859, 858, 857,                    // T2 Autocannon: S/M/L
    989, 988, 987, 1006,              // Faction: S/M/L/XL
  ] },
  { label: 'Hybrid Charges', groupIds: [
    107, 108, 106,                    // T1 Standard: S/M/L
    862, 861, 860,                    // T2 Blaster: S/M/L
    865, 864, 863,                    // T2 Railgun: S/M/L
    993, 992, 991, 1004,              // Faction: S/M/L/XL
  ] },
  { label: 'Laser Crystals', groupIds: [
    102, 103, 105,                    // T1 Standard: S/M/L
    868, 867, 866,                    // T2 Beam Laser: S/M/L
    871, 870, 869,                    // T2 Pulse Laser: S/M/L
    997, 996, 995, 1007,              // Faction: S/M/L/XL
  ] },
  { label: 'Missile Ammo', groupIds: [
    922, 928, 930, 999,               // Rockets: T1/T2 LR/T2 AS/Faction
    920, 917, 927, 998,               // Light Missiles: T1/T2 HP/T2 HD/Faction
    924, 919, 926, 1002,              // Heavy Missiles: T1/T2 HP/T2 HD/Faction
    1003,                             // Faction HAMs
    921, 918, 925, 1001,              // Cruise Missiles: T1/T2 HP/T2 HD/Faction
    923, 929, 931, 1000,              // Torpedoes: T1/T2 LR/T2 AS/Faction
    914,                              // Auto-Targeting Missiles
  ] },
  { label: 'Cap Booster Charges', groupIds: [139] },
  { label: 'Scripts',          groupIds: [1094] },
  { label: 'Probes',           groupIds: [1199] },
  // ── Modules ───────────────────────────────────────────────────────────────
  { label: 'Armor Modules',    groupIds: [2527, 2509, 1687, 1669, 1063, 1062, 1061, 1060, 615, 1686, 1685, 1684, 1683, 1682] },
  { label: 'Armor Hardeners',  groupIds: [1681, 1678, 1679, 1680] },  // EM/Thermal/Kinetic/Explosive
  { label: 'Shield Modules',   groupIds: [688, 687, 2246, 1696, 1695, 1694, 1693, 1692, 778, 613, 612, 611, 610] },
  { label: 'Electronic Warfare', groupIds: [2249, 2154, 1937, 1936, 1935, 1426, 1085, 757, 686, 729, 728, 727] },
  { label: 'Propulsion',       groupIds: [2135, 1650, 542, 2783, 1941, 1931, 1088, 1087, 1086, 131] },
  { label: 'Smartbombs',       groupIds: [383, 382, 381, 380] },
  { label: 'Combat Drones',    groupIds: [911, 839, 838, 837] },
  { label: 'Support Drones',   groupIds: [158, 842, 1646] },          // Mining / Logistic / Salvage
  { label: 'Rigs',             groupIds: [1206, 1207, 1208, 1234, 1235, 1236, 1210, 1211, 1212] },  // Armor/Shield/Astrogation S/M/L
  { label: 'Scanning & Hacking', groupIds: [1718] },                  // Data + Relic Analyzers
  { label: 'Mining Equipment', groupIds: [
    338, 1039,                        // Mining Lasers (T1 + T2)
    2151,                             // Ice Mining Lasers
    1040,                             // Strip Miners
    1038,                             // Ice Harvesters
    2795,                             // Gas Cloud Harvesters
    937, 935,                         // Mining Upgrades (T1 + T2)
    2806, 2807,                       // Asteroid + Moon Mining Crystals
  ] },
  // ── Materials ─────────────────────────────────────────────────────────────
  { label: 'Minerals',         groupIds: [1857] },
  { label: 'Gas Cloud Materials', groupIds: [
    983,                              // Booster Gas Clouds (Cytoserocin etc.)
    1859,                             // Fullerenes (C50–C540)
  ] },
  { label: 'Planetary Commodities', groupIds: [
    1333,                             // Raw (P0)
    1334,                             // Processed (P1)
    1335,                             // Refined (P2)
    1336,                             // Specialized (P3)
    1337,                             // Advanced (P4)
  ] },
  // ── Other ─────────────────────────────────────────────────────────────────
  { label: 'Boosters', groupIds: [
    2491, 2492, 2493, 2494, 2495, 2506, // Slot 01
    2496, 2497, 2498, 2499,             // Slot 02
    2500, 2501,                          // Slot 03
    2503, 2504, 2505,                    // Slot 11
    2531, 2790, 2791, 2792,              // Slots 14-17
  ] },
  { label: 'Implants',         groupIds: [622, 621, 620, 619, 618, 2478, 2477, 2476, 2475, 2474] },
  { label: 'Skill Books',      groupIds: [2152, 1824, 1823, 1748, 1747, 1746, 1745, 1323, 1110, 378, 377, 376] },
]

const SHIP_LABELS = new Set(['Frigates', 'Destroyers', 'Cruisers', 'Battlecruisers', 'Battleships', 'Capital Ships', 'Industrial & Freighters'])

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Margin %',              value: 'margin' },
  { label: 'Profit (ISK)',          value: 'profit' },
  { label: 'Liquidity (High → Low)', value: 'liquidityDesc' },
  { label: 'Liquidity (Low → High)', value: 'liquidityAsc' },
  { label: 'Buy Volume',             value: 'buyVolume' },
  { label: 'Sell Volume',            value: 'sellVolume' },
]

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

const PAGE_SIZES = [25, 50, 100, null] as const
type PageSize = typeof PAGE_SIZES[number]

function pageLabel(ps: PageSize) {
  return ps === null ? 'All' : String(ps)
}

function buildPageButtons(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

export default function App() {
  const [hubIndex, setHubIndex] = useState(0)
  const [includeShips, setIncludeShips] = useState(true)
  const [sort, setSort] = useState<SortKey>('margin')
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [page, setPage] = useState(1)
  const [brokerFee, setBrokerFee] = useState(3)
  const [salesTax, setSalesTax] = useState(8)
  const [search, setSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [minMargin, setMinMargin] = useState(5)
  const [minBuyPrice, setMinBuyPrice] = useState(0)
  const [maxBuyPrice, setMaxBuyPrice] = useState(0)
  const [refreshCooldownUntil, setRefreshCooldownUntil] = useState(0)
  const [, setTick] = useState(0)

  const hub = HUBS[hubIndex]

  const activeGroupIds = useMemo(
    () => ITEM_CATEGORIES
      .filter(c => includeShips || !SHIP_LABELS.has(c.label))
      .flatMap(c => c.groupIds),
    [includeShips]
  )

  const { data, isLoading, isError, error, refetch } = useFlips(hub.regionId, activeGroupIds)

  const REFRESH_COOLDOWN = 15_000
  const onCooldown = Date.now() < refreshCooldownUntil
  const secondsLeft = Math.ceil((refreshCooldownUntil - Date.now()) / 1000)

  useEffect(() => {
    if (!onCooldown) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [onCooldown])

  function handleRefresh() {
    clearStatsCache()
    refetch()
    setRefreshCooldownUntil(Date.now() + REFRESH_COOLDOWN)
  }

  // Apply broker fee + sales tax, then filter to >= 5% post-fee margin
  const adjustedData = useMemo(() => {
    if (!data) return []
    const bf = brokerFee / 100
    const st = salesTax / 100
    return data
      .map(item => {
        // Buy order cost: maxBuy + broker fee on buy side
        // Sell order revenue: minSell - broker fee on sell side - sales tax
        const adjProfit = item.minSell * (1 - bf - st) - item.maxBuy * (1 + bf)
        const adjMargin = (adjProfit / item.minSell) * 100
        return { ...item, profit: adjProfit, margin: adjMargin }
      })
      .filter(item => item.margin >= minMargin)
      .filter(item => maxBuyPrice === 0 || item.maxBuy <= maxBuyPrice)
      .filter(item => minBuyPrice === 0 || item.maxBuy >= minBuyPrice)
  }, [data, brokerFee, salesTax, minMargin, maxBuyPrice, minBuyPrice])

  const sorted = useMemo(() => {
    const copy = [...adjustedData]
    switch (sort) {
      case 'margin':        copy.sort((a, b) => b.margin - a.margin); break
      case 'profit':        copy.sort((a, b) => b.profit - a.profit); break
      case 'liquidityDesc': copy.sort((a, b) => b.liquidityScore - a.liquidityScore); break
      case 'liquidityAsc':  copy.sort((a, b) => a.liquidityScore - b.liquidityScore); break
      case 'buyVolume':     copy.sort((a, b) => b.buyVolume  - a.buyVolume);  break
      case 'sellVolume':    copy.sort((a, b) => b.sellVolume - a.sellVolume); break
    }
    if (!search.trim()) return copy
    const q = search.toLowerCase()
    return copy.filter(item => item.typeName.toLowerCase().includes(q))
  }, [adjustedData, sort, search])

  const topTrades = useMemo(() => {
    const score = (item: typeof adjustedData[0]) => {
      const mx = Math.max(item.buyVolume, item.sellVolume)
      const balance = mx === 0 ? 0 : Math.min(item.buyVolume, item.sellVolume) / mx
      return item.margin * Math.log10(item.profit + 1) * Math.log10(item.liquidityScore + 1) * balance
    }
    return [...adjustedData].sort((a, b) => score(b) - score(a)).slice(0, 10)
  }, [adjustedData])

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    const names = adjustedData.map(item => item.typeName)
    const startsWith = names.filter(n => n.toLowerCase().startsWith(q))
    const contains   = names.filter(n => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q))
    return [...startsWith, ...contains].slice(0, 10)
  }, [adjustedData, search])

  const totalPages = pageSize === null ? 1 : Math.ceil(sorted.length / pageSize)
  const paginated = pageSize === null ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => { setPage(1) }, [sorted, pageSize])

  const pageButtons = useMemo(() => buildPageButtons(page, totalPages), [page, totalPages])

  return (
    <div className="min-h-screen bg-background">
      <div className={`mx-auto px-4 py-8 ${isElectron ? 'flex gap-6 max-w-[1600px]' : 'max-w-7xl'}`}>
      {isElectron && (
        <div className="w-80 shrink-0">
          <TraderPanel />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary tracking-tight mb-1">
              EVE Market Flip Finder
            </h1>
            <p className="text-muted-foreground text-sm">
              Live buy/sell spread opportunities from evetycoon.com
            </p>
          </div>
          <a href="https://github.com/Kudretg/eve-flip-finder" target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="text-xs gap-1.5">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              GitHub
            </Button>
          </a>
        </div>

        {/* Controls */}
        <Card className="mb-6">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1.5 min-w-36">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Trade Hub
                </label>
                <Select
                  value={hubIndex.toString()}
                  onChange={e => setHubIndex(Number(e.target.value))}
                >
                  {HUBS.map((h, i) => (
                    <option key={h.label} value={i}>{h.label}</option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide invisible">
                  Ships
                </label>
                <label className="flex items-center gap-2 h-9 cursor-pointer text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={includeShips}
                    onChange={e => setIncludeShips(e.target.checked)}
                    className="accent-primary w-4 h-4"
                  />
                  Include Ships
                </label>
              </div>

              <div className="flex flex-col gap-1.5 min-w-48">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Sort By
                </label>
                <Select
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                >
                  {SORT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5 min-w-48 relative">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Search
                </label>
                <input
                  type="text"
                  placeholder="Filter items..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSuggestions(true) }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  className="h-9 px-3 text-xs bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-md shadow-lg overflow-hidden">
                    {suggestions.map(name => (
                      <button
                        key={name}
                        type="button"
                        onMouseDown={() => { setSearch(name); setShowSuggestions(false) }}
                        className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Broker %
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.1"
                  value={brokerFee}
                  onChange={e => setBrokerFee(Math.max(0, Number(e.target.value)))}
                  className="h-9 w-20 px-3 text-xs bg-secondary border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Tax %
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.1"
                  value={salesTax}
                  onChange={e => setSalesTax(Math.max(0, Number(e.target.value)))}
                  className="h-9 w-20 px-3 text-xs bg-secondary border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Min Margin %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={minMargin}
                  onChange={e => setMinMargin(Math.max(0, Number(e.target.value)))}
                  className="h-9 w-20 px-3 text-xs bg-secondary border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Min Buy Price
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000000"
                  value={minBuyPrice}
                  placeholder="0 = no limit"
                  onChange={e => setMinBuyPrice(Math.max(0, Number(e.target.value)))}
                  className="h-9 w-32 px-3 text-xs bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Max Buy Price
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000000"
                  value={maxBuyPrice}
                  placeholder="0 = no limit"
                  onChange={e => setMaxBuyPrice(Math.max(0, Number(e.target.value)))}
                  className="h-9 w-32 px-3 text-xs bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Per Page
                </label>
                <div className="flex gap-1">
                  {PAGE_SIZES.map(ps => (
                    <Button
                      key={String(ps)}
                      size="sm"
                      variant={pageSize === ps ? 'default' : 'outline'}
                      className="px-2.5 text-xs h-9"
                      onClick={() => setPageSize(ps)}
                    >
                      {pageLabel(ps)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide invisible">
                  Refresh
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 px-3 text-xs"
                  disabled={onCooldown || isLoading}
                  onClick={handleRefresh}
                >
                  {onCooldown ? `Refresh (${secondsLeft}s)` : 'Refresh'}
                </Button>
              </div>

            </div>
          </CardContent>
        </Card>

        {/* Top Trades */}
        <div className="mb-6">
          <h2 className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">
            Top Trades — {includeShips ? 'All Items' : 'All Items (no ships)'} · {hub.label}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <Card key={i} className="border-border/50">
                    <CardContent className="pt-3 pb-3 px-3 flex flex-col gap-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-3 w-20" />
                    </CardContent>
                  </Card>
                ))
              : topTrades.map((item, i) => (
                  <Card key={item.typeId} className="border-border/50 hover:border-primary/40 transition-colors">
                    <CardContent className="pt-3 pb-3 px-3 flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[10px] text-muted-foreground font-mono">#{i + 1}</span>
                        <Badge
                          variant={item.margin >= 10 ? 'success' : item.margin >= 5 ? 'default' : 'secondary'}
                          className="font-mono text-[10px] px-1.5"
                        >
                          {item.margin.toFixed(1)}%
                        </Badge>
                      </div>
                      <a
                        href={`https://evetycoon.com/market/${item.typeId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-foreground leading-tight line-clamp-2 hover:text-primary transition-colors"
                      >
                        {item.typeName}
                      </a>
                      <p className="text-[10px] text-green font-mono">+{formatISK(item.profit)} ISK</p>
                      <div className="flex gap-2 mt-0.5">
                        <span className="text-[10px] font-mono" style={{ color: item.buyColor }}>
                          ↑{formatVolume(item.buyVolume)}
                        </span>
                        <span className="text-[10px] font-mono" style={{ color: item.sellColor }}>
                          ↓{formatVolume(item.sellVolume)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
            }
          </div>
        </div>

        {/* Results */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base flex items-center gap-2">
                <span>{hub.label}</span>
                <span className="text-muted-foreground font-normal">·</span>
                <span className="text-muted-foreground font-normal">{includeShips ? 'All Items' : 'All Items (no ships)'}</span>
              </CardTitle>
              {data && !isLoading && (
                <div className="flex items-center gap-1.5">
                  {totalPages > 1 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="px-2.5 text-xs"
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                      >
                        ‹
                      </Button>
                      {pageButtons.map((btn, i) =>
                        btn === '…' ? (
                          <span key={`ellipsis-${i}`} className="text-muted-foreground text-xs px-1">…</span>
                        ) : (
                          <Button
                            key={btn}
                            size="sm"
                            variant={btn === page ? 'default' : 'outline'}
                            className="px-2.5 text-xs min-w-8"
                            onClick={() => setPage(btn)}
                          >
                            {btn}
                          </Button>
                        )
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="px-2.5 text-xs"
                        disabled={page === totalPages}
                        onClick={() => setPage(p => p + 1)}
                      >
                        ›
                      </Button>
                      <span className="text-muted-foreground text-xs mx-1">·</span>
                    </>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {sorted.length} flip{sorted.length !== 1 ? 's' : ''} found
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isError && (
              <div className="px-6 py-12 text-center">
                <p className="text-destructive font-medium mb-1">Failed to load market data</p>
                <p className="text-muted-foreground text-sm">{(error as Error).message}</p>
              </div>
            )}

            {!isError && (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border">
                    <TableHead className="w-[220px]">Item</TableHead>
                    <TableHead className="text-right">Buy Price</TableHead>
                    <TableHead className="text-right">Sell Price</TableHead>
                    <TableHead className="text-right">Profit (after fees)</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right" title="Daily units bought (how fast your sell order fills)">Buy Vol</TableHead>
                    <TableHead className="text-right" title="Daily units sold (how fast your buy order fills)">Sell Vol</TableHead>
                    {isElectron && <TableHead className="w-8" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <SkeletonRows />
                  ) : sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                        No profitable flips found in this category
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map(item => (
                      <TableRow key={item.typeId}>
                        <TableCell className="font-medium text-foreground">
                          <a
                            href={`https://evetycoon.com/market/${item.typeId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-primary transition-colors"
                          >
                            {item.typeName}
                          </a>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono text-xs">
                          {formatISK(item.maxBuy)} ISK
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground font-mono text-xs">
                          {formatISK(item.minSell)} ISK
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-green font-mono text-xs font-medium">
                            +{formatISK(item.profit)} ISK
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={item.margin >= 10 ? 'success' : item.margin >= 5 ? 'default' : 'secondary'}
                            className="font-mono text-xs"
                          >
                            {item.margin.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          <span style={{ color: item.buyColor }}>
                            {formatVolume(item.buyVolume)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          <span style={{ color: item.sellColor }}>
                            {formatVolume(item.sellVolume)}
                          </span>
                        </TableCell>
                        {isElectron && (
                          <TableCell className="text-right">
                            <button
                              title="Open market window in EVE"
                              onClick={() => window.electronAPI?.openMarketWindow(item.typeId)}
                              className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                            >
                              ⧉
                            </button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>


        <p className="text-xs text-muted-foreground text-center mt-4">
          Data from evetycoon.com · Refreshes every 60s · Profits shown after broker &amp; tax fees
        </p>
      </div>
      </div>
    </div>
  )
}
