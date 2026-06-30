import { shell } from 'electron'
import http from 'http'
import crypto from 'crypto'
import { getStore } from './store.js'

const REDIRECT_URI = 'http://localhost:3456/callback'
const SCOPES = 'esi-wallet.read_character_wallet.v1 esi-markets.read_character_orders.v1 esi-ui.open_window.v1'
const EVE_SSO = 'https://login.eveonline.com/v2/oauth'

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

function waitForCallback(expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith('/callback')) return
      const params = new URLSearchParams(req.url.split('?')[1] ?? '')
      const code = params.get('code')
      const state = params.get('state')
      const error = params.get('error')

      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h2>EVE SSO Login Complete</h2><p>You can close this tab.</p></body></html>')
      server.close()

      if (error) { reject(new Error(`SSO error: ${error}`)); return }
      if (state !== expectedState) { reject(new Error('State mismatch')); return }
      if (!code) { reject(new Error('No code received')); return }
      resolve(code)
    })

    server.listen(3456, '127.0.0.1', () => {})
    server.on('error', reject)

    setTimeout(() => {
      server.close()
      reject(new Error('Login timed out'))
    }, 5 * 60 * 1000)
  })
}

async function exchangeCode(code: string, verifier: string, clientId: string) {
  const res = await fetch(`${EVE_SSO}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed: ${text}`)
  }
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }

  const store = getStore()
  store.set('accessToken', data.access_token)
  store.set('refreshToken', data.refresh_token)
  store.set('tokenExpiry', Date.now() + data.expires_in * 1000 - 60_000)

  const charId = extractCharacterId(data.access_token)
  store.set('characterId', charId)

  const charRes = await fetch(`https://esi.evetech.net/latest/characters/${charId}/`)
  if (charRes.ok) {
    const charData = await charRes.json() as { name: string }
    store.set('characterName', charData.name)
  }
}

function extractCharacterId(accessToken: string): number {
  const [, payload] = accessToken.split('.')
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string }
  const match = decoded.sub.match(/CHARACTER:EVE:(\d+)/)
  return match ? parseInt(match[1]) : 0
}

export async function startOAuthFlow(clientId: string): Promise<void> {
  const { verifier, challenge } = generatePKCE()
  const state = crypto.randomBytes(16).toString('hex')

  const authUrl = new URL(`${EVE_SSO}/authorize`)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  const callbackPromise = waitForCallback(state)
  await shell.openExternal(authUrl.toString())
  const code = await callbackPromise
  await exchangeCode(code, verifier, clientId)
}

export async function refreshTokenIfNeeded(): Promise<void> {
  const store = getStore()
  const expiry = store.get('tokenExpiry', 0)
  if (Date.now() < expiry) return

  const refreshToken = store.get('refreshToken', '')
  const clientId = store.get('clientId', '')
  if (!refreshToken || !clientId) throw new Error('Not authenticated')

  const res = await fetch(`${EVE_SSO}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }

  store.set('accessToken', data.access_token)
  store.set('refreshToken', data.refresh_token)
  store.set('tokenExpiry', Date.now() + data.expires_in * 1000 - 60_000)
}

export function logout(): void {
  const store = getStore()
  store.delete('accessToken')
  store.delete('refreshToken')
  store.delete('tokenExpiry')
  store.delete('characterId')
  store.delete('characterName')
}

export function getAuthStatus(): { authenticated: boolean; characterId: number; characterName: string } {
  const store = getStore()
  const characterId = store.get('characterId', 0)
  return {
    authenticated: !!characterId && !!store.get('refreshToken', ''),
    characterId,
    characterName: store.get('characterName', ''),
  }
}
