import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments = req.query.path
  const path = Array.isArray(segments) ? segments.join('/') : (segments ?? '')
  const url = `https://evetycoon.com/api/v1/${path}`

  try {
    const upstream = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    const text = await upstream.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return res.status(502).json({ error: 'Non-JSON response from upstream', body: text.slice(0, 200) })
    }

    res
      .setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30')
      .status(upstream.status)
      .json(data)
  } catch (err) {
    res.status(502).json({ error: 'Upstream fetch failed', detail: String(err) })
  }
}
