import { useQuery } from '@tanstack/react-query'

/** Single source of truth for the item catalog shape — the generated JSON
 *  in public/items.generated.json conforms to this. */
export interface Item {
  typeId: number
  name: string
  marketGroupID: number
  volume?: number
  packagedVolume?: number
}

let cached: Item[] | null = null

async function fetchItemCatalog(): Promise<Item[]> {
  if (cached) return cached
  const res = await fetch(`${import.meta.env.BASE_URL}items.generated.json`)
  if (!res.ok) throw new Error(`Failed to load item catalog: ${res.status}`)
  cached = await res.json() as Item[]
  return cached
}

export function useItemCatalog() {
  return useQuery({
    queryKey: ['item-catalog'],
    queryFn: fetchItemCatalog,
    staleTime: Infinity,
  })
}

export interface CatalogSearchResult {
  results: Item[]
  hasMore: boolean
}

/** Case-insensitive, word-order-independent token match ("ballistic control ii"
 *  matches "Ballistic Control System II"), ranked prefix > word-start > substring. */
export function searchCatalog(items: Item[], query: string, limit = 50): CatalogSearchResult {
  const q = query.trim().toLowerCase()
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { results: [], hasMore: false }

  const tokenPatterns = tokens.map(t => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

  const scored: { item: Item; rank: number }[] = []
  for (const item of items) {
    const name = item.name.toLowerCase()
    if (!tokens.every(t => name.includes(t))) continue
    let rank: number
    if (name.startsWith(q)) rank = 0
    else if (tokenPatterns.every(p => p.test(name))) rank = 1
    else rank = 2
    scored.push({ item, rank })
  }

  scored.sort((a, b) => a.rank - b.rank || a.item.name.length - b.item.name.length)
  return { results: scored.slice(0, limit).map(s => s.item), hasMore: scored.length > limit }
}
