// Regenerates public/items.generated.json from CCP's Static Data Export.
// Run: npm run sync:items
//
// Three-tier source chain, first one that succeeds wins:
//   1. sde-enhanced — riftforeve's unofficial "Enhanced SDE" mirror. Only
//      source with repackagedVolume (-> Item.packagedVolume).
//   2. sde-ccp      — CCP's official jsonl export. Same line shape as tier 1
//      minus repackagedVolume.
//   3. fuzzwork     — invTypes.csv. Different shape entirely (flat typeName,
//      published as "1"/"0"), used only if both SDE sources are unreachable.
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import readline from 'node:readline'
import path from 'node:path'
import yauzl from 'yauzl'
import type { Item } from '../src/data/items.ts'

type SourceId = 'sde-enhanced' | 'sde-ccp' | 'fuzzwork'

const CACHE_DIR = path.resolve('.sde-cache')
const CACHE_META_PATH = path.join(CACHE_DIR, 'meta.json')
const OUTPUT_PATH = path.resolve('public/items.generated.json')
const OUTPUT_META_PATH = path.resolve('public/items.generated.meta.json')

const SOURCES: { id: Exclude<SourceId, 'fuzzwork'>; url: string }[] = [
  { id: 'sde-enhanced', url: 'https://sde.riftforeve.online/assets/eve-online-static-data-latest-enhanced-jsonl.zip' },
  { id: 'sde-ccp', url: 'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip' },
]
const FUZZWORK_URL = 'https://www.fuzzwork.co.uk/dump/latest/csv/invTypes.csv'

type CacheMeta = Record<string, { etag: string | null; lastModified: string | null }>

function loadCacheMeta(): CacheMeta {
  if (!existsSync(CACHE_META_PATH)) return {}
  return JSON.parse(readFileSync(CACHE_META_PATH, 'utf-8'))
}

function saveCacheMeta(meta: CacheMeta) {
  writeFileSync(CACHE_META_PATH, JSON.stringify(meta, null, 2))
}

/** Downloads a zip, following redirects, respecting a cached ETag/Last-Modified
 *  from the FINAL (post-redirect) response. Returns the local zip path, or
 *  null if the cached copy is still fresh (304). */
async function downloadZipConditional(sourceId: string, url: string, cacheMeta: CacheMeta): Promise<string | null> {
  const zipPath = path.join(CACHE_DIR, `${sourceId}.zip`)
  const cached = cacheMeta[sourceId]
  const headers: Record<string, string> = {}
  if (cached?.etag) headers['If-None-Match'] = cached.etag
  else if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified

  const res = await fetch(url, { redirect: 'follow', headers })

  if (res.status === 304 && existsSync(zipPath)) {
    console.log(`[${sourceId}] 304 Not Modified — using cached ${zipPath}`)
    return zipPath
  }
  if (!res.ok || !res.body) {
    throw new Error(`[${sourceId}] fetch failed: ${res.status} ${res.url}`)
  }

  console.log(`[${sourceId}] downloading ${res.url} (${res.headers.get('content-length') ?? '?'} bytes)`)
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(zipPath))

  cacheMeta[sourceId] = {
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
  }
  return zipPath
}

function extractTypesJsonlEntry(zipPath: string): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('failed to open zip'))
      let resolved = false
      zipfile.on('entry', entry => {
        if (entry.fileName !== 'types.jsonl') {
          zipfile.readEntry()
          return
        }
        zipfile.openReadStream(entry, (err2, stream) => {
          if (err2 || !stream) return reject(err2 ?? new Error('failed to open entry stream'))
          resolved = true
          resolve(stream)
        })
      })
      zipfile.on('end', () => {
        if (!resolved) reject(new Error('types.jsonl not found in zip'))
      })
      zipfile.readEntry()
    })
  })
}

/** Shared by tiers 1 (sde-enhanced) and 2 (sde-ccp) — identical jsonl line
 *  shape; tier 2 just lacks repackagedVolume. */
async function parseSdeJsonl(stream: NodeJS.ReadableStream): Promise<Item[]> {
  const items: Item[] = []
  const rl = readline.createInterface({ input: stream })
  for await (const line of rl) {
    if (!line.trim()) continue
    const rec = JSON.parse(line)
    if (rec.published !== true) continue
    if (rec.marketGroupID == null) continue
    items.push({
      typeId: rec._key,
      name: rec.name?.en ?? `Type ${rec._key}`,
      marketGroupID: rec.marketGroupID,
      volume: typeof rec.volume === 'number' ? rec.volume : undefined,
      packagedVolume: typeof rec.repackagedVolume === 'number' ? rec.repackagedVolume : undefined,
    })
  }
  return items
}

/** Tier 3 only — separate mapper. invTypes.csv columns:
 *  typeID, groupID, typeName, description, mass, volume, capacity,
 *  portionSize, raceID, basePrice, published, marketGroupID, iconID,
 *  soundID, graphicID, factionID, metaLevel, techLevel, shipTreeGroupID
 *  `published` is "1"/"0" (string), not a boolean. No repackagedVolume. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { fields.push(cur); cur = '' }
      else cur += c
    }
  }
  fields.push(cur)
  return fields
}

async function fetchFuzzworkItems(): Promise<Item[]> {
  console.log('[fuzzwork] fetching invTypes.csv')
  const res = await fetch(FUZZWORK_URL, { redirect: 'follow' })
  if (!res.ok) throw new Error(`[fuzzwork] fetch failed: ${res.status}`)
  const text = await res.text()
  const lines = text.split('\n')
  const header = parseCsvLine(lines[0])
  const idx = {
    typeID: header.indexOf('typeID'),
    typeName: header.indexOf('typeName'),
    volume: header.indexOf('volume'),
    published: header.indexOf('published'),
    marketGroupID: header.indexOf('marketGroupID'),
  }
  const items: Item[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const cols = parseCsvLine(line)
    if (cols[idx.published] !== '1') continue
    const marketGroupID = cols[idx.marketGroupID]
    if (!marketGroupID) continue
    const volume = Number(cols[idx.volume])
    items.push({
      typeId: Number(cols[idx.typeID]),
      name: cols[idx.typeName],
      marketGroupID: Number(marketGroupID),
      volume: Number.isFinite(volume) ? volume : undefined,
    })
  }
  return items
}

async function tryParseSdeSource(id: Exclude<SourceId, 'fuzzwork'>, url: string, cacheMeta: CacheMeta): Promise<Item[]> {
  const zipPath = await downloadZipConditional(id, url, cacheMeta)
  if (!zipPath) throw new Error(`[${id}] no zip available`)
  const stream = await extractTypesJsonlEntry(zipPath)
  return parseSdeJsonl(stream)
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true })
  const cacheMeta = loadCacheMeta()

  let items: Item[] | null = null
  let source: SourceId | null = null

  for (const { id, url } of SOURCES) {
    try {
      items = await tryParseSdeSource(id, url, cacheMeta)
      source = id
      break
    } catch (e) {
      console.warn(`[${id}] failed: ${(e as Error).message} — trying next tier`)
    }
  }

  if (!items) {
    try {
      items = await fetchFuzzworkItems()
      source = 'fuzzwork'
    } catch (e) {
      console.error(`[fuzzwork] failed: ${(e as Error).message}`)
      throw new Error('All three sources failed — aborting, not overwriting existing catalog')
    }
  }

  saveCacheMeta(cacheMeta)

  items.sort((a, b) => a.typeId - b.typeId)
  writeFileSync(OUTPUT_PATH, JSON.stringify(items))
  writeFileSync(OUTPUT_META_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source,
    itemCount: items.length,
  }, null, 2))

  console.log(`\nWrote ${items.length} items from source "${source}" to ${OUTPUT_PATH}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
