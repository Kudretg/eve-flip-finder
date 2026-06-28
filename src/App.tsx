import { useMemo, useState } from 'react'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFlips } from '@/hooks/useFlips'
import { formatISK, formatVolume } from '@/lib/utils'
import type { Hub, Category, SortKey } from '@/types'

const HUBS: Hub[] = [
  { label: 'Jita', systemId: 30000142, regionId: 10000002 },
  { label: 'Amarr', systemId: 30002187, regionId: 10000043 },
  { label: 'Dodixie', systemId: 30002659, regionId: 10000032 },
  { label: 'Rens', systemId: 30002510, regionId: 10000030 },
  { label: 'Hek', systemId: 30002053, regionId: 10000042 },
]

const CATEGORIES: Category[] = [
  { label: 'Standard Frigates', groupIds: [1616, 77, 72, 64, 61] },
  { label: 'Standard Destroyers', groupIds: [468, 467, 466, 465, 3755] },
  { label: 'Standard Cruisers', groupIds: [76, 75, 74, 73] },
  { label: 'Standard Battlecruisers', groupIds: [473, 472, 471, 470] },
  { label: 'Standard Battleships', groupIds: [81, 80, 79, 78] },
  { label: 'Faction Cruisers', groupIds: [1371, 1370, 3537] },
  { label: 'Faction Battleships', groupIds: [1380, 1379, 3538] },
  { label: 'Armor Modules', groupIds: [2527, 2509, 1687, 1669, 1063, 1062, 1061, 1060, 615, 1686, 1685, 1684, 1683] },
  { label: 'Shield Modules', groupIds: [688, 687, 2246, 1696, 1695, 1694, 1693, 1692, 778, 613, 612, 611, 610] },
  { label: 'Electronic Warfare', groupIds: [2249, 2154, 1937, 1936, 1935, 1426, 1085, 757, 686, 729, 728, 727] },
  { label: 'Propulsion', groupIds: [2135, 1650, 542, 2783, 1941, 1931, 1088, 1087, 1086, 131] },
  { label: 'Weapon Upgrades', groupIds: [2740, 2471, 2033, 2032, 801, 708, 707, 706, 648, 647, 646, 645] },
  { label: 'Smartbombs', groupIds: [383, 382, 381, 380] },
  { label: 'Combat Drones', groupIds: [911, 839, 838, 837] },
  { label: 'Implants', groupIds: [622, 621, 620, 619, 618, 2478, 2477, 2476, 2475, 2474] },
  { label: 'Skill Books', groupIds: [2152, 1824, 1823, 1748, 1747, 1746, 1745, 1323, 1110, 378, 377, 376] },
]

const SORT_OPTIONS: { label: string; value: SortKey }[] = [
  { label: 'Margin %', value: 'margin' },
  { label: 'Profit (ISK)', value: 'profit' },
  { label: 'Volume (High → Low)', value: 'volumeDesc' },
  { label: 'Volume (Low → High)', value: 'volumeAsc' },
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
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

export default function App() {
  const [hubIndex, setHubIndex] = useState(0)
  const [categoryIndex, setCategoryIndex] = useState(0)
  const [sort, setSort] = useState<SortKey>('margin')

  const hub = HUBS[hubIndex]
  const category = CATEGORIES[categoryIndex]

  const { data, isLoading, isError, error } = useFlips(hub.regionId, category.groupIds)

  const sorted = useMemo(() => {
    if (!data) return []
    const copy = [...data]
    switch (sort) {
      case 'margin': return copy.sort((a, b) => b.margin - a.margin)
      case 'profit': return copy.sort((a, b) => b.profit - a.profit)
      case 'volumeDesc': return copy.sort((a, b) => b.volume - a.volume)
      case 'volumeAsc': return copy.sort((a, b) => a.volume - b.volume)
    }
  }, [data, sort])

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary tracking-tight mb-1">
            EVE Market Flip Finder
          </h1>
          <p className="text-muted-foreground text-sm">
            Live buy/sell spread opportunities from evetycoon.com
          </p>
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

              <div className="flex flex-col gap-1.5 min-w-52">
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Category
                </label>
                <Select
                  value={categoryIndex.toString()}
                  onChange={e => setCategoryIndex(Number(e.target.value))}
                >
                  {CATEGORIES.map((c, i) => (
                    <option key={c.label} value={i}>{c.label}</option>
                  ))}
                </Select>
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

              {data && !isLoading && (
                <div className="ml-auto flex items-end pb-0.5">
                  <Badge variant="secondary" className="text-xs">
                    {sorted.length} flip{sorted.length !== 1 ? 's' : ''} found
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <span>{hub.label}</span>
              <span className="text-muted-foreground font-normal">·</span>
              <span className="text-muted-foreground font-normal">{category.label}</span>
            </CardTitle>
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
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <SkeletonRows />
                  ) : sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                        No profitable flips found in this category
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map(item => (
                      <TableRow key={item.typeId}>
                        <TableCell className="font-medium text-foreground">
                          {item.typeName}
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
                        <TableCell className="text-right text-muted-foreground font-mono text-xs">
                          {formatVolume(item.volume)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Data from evetycoon.com · Refreshes every 60s · Prices in ISK
        </p>
      </div>
    </div>
  )
}
