import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = req.query.path
  const path = Array.isArray(segments) ? segments.join('/') : (segments ?? '')

  try {
    const upstream = await fetch(`https://evetycoon.com/api/v1/${path}`)
    const data = await upstream.json()
    res
      .setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
      .status(upstream.status)
      .json(data)
  } catch {
    res.status(502).json({ error: 'Upstream fetch failed' })
  }
}
