import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatISK, formatIskPrice } from '@/lib/utils'
import { useMonitor } from '@/hooks/useMonitor'
import type { MonitorConfig, ActiveOrderUI } from '@/types/electron'

function OrderCard({ order, onCopy, onOpenEve }: {
  order: ActiveOrderUI
  onCopy: (price: number) => void
  onOpenEve: (typeId: number) => void
}) {
  return (
    <div className={`p-2.5 rounded text-[11px] border ${order.isUndercut ? 'border-destructive/50 bg-destructive/5' : 'border-border/40 bg-secondary/20'}`}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-medium text-foreground leading-tight">{order.typeName}</span>
        {order.isUndercut && (
          <span className="text-destructive text-[10px] shrink-0 font-semibold">UNDERCUT</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground mb-1.5">
        <span>Price: <span className="font-mono text-foreground">{formatISK(order.price)}</span></span>
        <span>Vol: <span className="text-foreground">{order.volumeRemain}/{order.volumeTotal}</span></span>
        {order.currentMarketPrice !== null && (
          <span className="col-span-2">
            Market: <span className={`font-mono ${order.isUndercut ? 'text-destructive' : 'text-foreground'}`}>
              {formatISK(order.currentMarketPrice)}
            </span>
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => onOpenEve(order.typeId)}
          className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
        >
          ⧉ Open in EVE
        </button>
        {order.isUndercut && order.suggestedPrice !== null && (
          <button
            onClick={() => onCopy(order.suggestedPrice!)}
            className="text-[10px] text-primary hover:underline font-mono"
          >
            Copy {formatIskPrice(order.suggestedPrice)} ISK
          </button>
        )}
      </div>
    </div>
  )
}

export function TraderPanel() {
  const { status, authStatus, clientId, loginError, isLoggingIn, login, logout, startMonitor, stopMonitor, copyPrice, saveClientId } = useMonitor()
  const [inputClientId, setInputClientId] = useState('')
  const [showClientIdInput, setShowClientIdInput] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [localConfig, setLocalConfig] = useState<MonitorConfig>(status.config)
  const [tab, setTab] = useState<'buy' | 'sell' | 'alerts'>('buy')
  const [openEveError, setOpenEveError] = useState<string | null>(null)

  useEffect(() => {
    if (clientId) setInputClientId(clientId)
  }, [clientId])

  const handleSaveAndLogin = () => {
    const id = inputClientId.trim()
    if (!id) return
    saveClientId(id).then(() => login(id)).catch(() => {})
  }

  const handleLinkAccount = () => {
    login(clientId).catch(() => {})
  }

  const handleStartMonitor = () => {
    startMonitor(localConfig).catch(() => {})
  }

  const handleOpenEve = useCallback(async (typeId: number) => {
    setOpenEveError(null)
    try {
      const result = await window.electronAPI?.openMarketWindow(typeId)
      if (result && !result.success) {
        const msg = result.error ?? 'Unknown error'
        if (msg.includes('403') || msg.includes('scope') || msg.includes('token')) {
          setOpenEveError('Missing scope — Unlink and re-link your account to grant EVE UI permission.')
        } else if (msg.includes('520') || msg.includes('not logged')) {
          setOpenEveError('Character must be logged into the EVE client.')
        } else {
          setOpenEveError(`Failed: ${msg}`)
        }
        setTimeout(() => setOpenEveError(null), 6000)
      }
    } catch (err) {
      setOpenEveError((err as Error).message)
      setTimeout(() => setOpenEveError(null), 6000)
    }
  }, [])

  const lastRunLabel = status.lastRun
    ? `${Math.floor((Date.now() - status.lastRun) / 60_000)}m ago`
    : 'never'

  const buyOrders = status.activeOrders.filter(o => o.isBuyOrder)
  const sellOrders = status.activeOrders.filter(o => !o.isBuyOrder)
  const recentAlerts = status.recentAlerts.filter(a => Date.now() - a.timestamp < 3_600_000)
  const undercutCount = status.activeOrders.filter(o => o.isUndercut).length

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Trader Dashboard</span>
          {authStatus.authenticated && (
            <button onClick={() => logout().catch(() => {})} className="text-[10px] text-muted-foreground hover:text-foreground">
              Unlink
            </button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-3">

        {!authStatus.authenticated ? (
          <div className="space-y-3">
            {clientId && !showClientIdInput ? (
              <div className="space-y-2">
                <Button className="w-full h-10 text-sm font-semibold" disabled={isLoggingIn} onClick={handleLinkAccount}>
                  {isLoggingIn ? 'Opening EVE Login…' : '🔗 Link EVE Account'}
                </Button>
                <button className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center" onClick={() => setShowClientIdInput(true)}>
                  Change Client ID
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Enter your CCP developer app Client ID.{' '}
                  <a href="https://developers.eveonline.com/" target="_blank" rel="noreferrer" className="underline">Register app</a>
                  {' — '}callback: <code className="text-[10px] select-all">http://localhost:3456/callback</code>
                </p>
                <input
                  type="text"
                  placeholder="CCP Client ID"
                  value={inputClientId}
                  onChange={e => setInputClientId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveAndLogin()}
                  className="w-full h-8 px-2 text-xs bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
                <Button className="w-full h-9 text-sm" disabled={isLoggingIn || !inputClientId.trim()} onClick={handleSaveAndLogin}>
                  {isLoggingIn ? 'Opening EVE Login…' : '🔗 Link EVE Account'}
                </Button>
                {clientId && (
                  <button className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center" onClick={() => { setInputClientId(clientId); setShowClientIdInput(false) }}>
                    Cancel
                  </button>
                )}
              </div>
            )}
            {loginError && <p className="text-[10px] text-destructive">{loginError}</p>}
          </div>
        ) : (
          <>
            {/* Character + wallet */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground font-medium">{authStatus.characterName}</span>
              {status.walletBalance !== null && (
                <span className="font-mono text-green text-[11px]">{formatISK(status.walletBalance)} ISK</span>
              )}
            </div>

            {/* Stats row */}
            {status.running && status.activeOrders.length > 0 && (
              <div className="flex gap-3 text-[10px]">
                <span className="text-muted-foreground">Buy: <span className="text-foreground">{buyOrders.length}</span></span>
                <span className="text-muted-foreground">Sell: <span className="text-foreground">{sellOrders.length}</span></span>
                {undercutCount > 0 && (
                  <span className="text-destructive font-semibold">{undercutCount} undercut</span>
                )}
              </div>
            )}

            {/* Monitor controls */}
            <div className="flex items-center gap-2">
              {!status.running ? (
                <Button size="sm" className="h-7 text-xs px-3" onClick={handleStartMonitor}>
                  Start Monitor
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => stopMonitor().catch(() => {})}>
                  Stop Monitor
                </Button>
              )}
              {status.running && (
                <span className="text-[10px] text-muted-foreground">Last: {lastRunLabel}</span>
              )}
              <button className="ml-auto text-[10px] text-muted-foreground hover:text-foreground" onClick={() => setConfigOpen(o => !o)}>
                {configOpen ? 'Hide' : 'Config'}
              </button>
            </div>

            {/* Config */}
            {configOpen && (
              <div className="space-y-2 p-3 bg-secondary/30 rounded-md">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: 'minMargin', label: 'Min Margin %', step: 1 },
                      { key: 'minProfit', label: 'Min Profit ISK', step: 100000 },
                      { key: 'maxBudgetPerItem', label: 'Max Budget (0=∞)', step: 1000000 },
                      { key: 'brokerFee', label: 'Broker %', step: 0.1 },
                      { key: 'salesTax', label: 'Tax %', step: 0.1 },
                    ] as { key: keyof MonitorConfig; label: string; step: number }[]
                  ).map(({ key, label, step }) => (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground">{label}</label>
                      <input
                        type="number"
                        step={step}
                        value={localConfig[key] as number}
                        onChange={e => setLocalConfig(c => ({ ...c, [key]: Number(e.target.value) }))}
                        className="h-7 px-2 text-xs bg-secondary border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  ))}
                </div>
                <Button size="sm" className="h-7 text-xs px-3 w-full" onClick={() => { handleStartMonitor(); setConfigOpen(false) }}>
                  Apply & Restart
                </Button>
              </div>
            )}

            {/* Open in EVE error */}
            {openEveError && (
              <p className="text-[10px] text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5 leading-relaxed">
                {openEveError}
              </p>
            )}

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
              {([
                { key: 'buy', label: 'Buy Orders', count: buyOrders.length },
                { key: 'sell', label: 'Sell Orders', count: sellOrders.length },
                { key: 'alerts', label: 'Alerts', count: recentAlerts.length },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`pb-1.5 text-[10px] px-2 transition-colors whitespace-nowrap ${
                    tab === t.key ? 'text-primary border-b border-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                  {t.count > 0 && <span className="ml-1 text-muted-foreground">({t.count})</span>}
                </button>
              ))}
            </div>

            {/* Buy Orders tab */}
            {tab === 'buy' && (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                {buyOrders.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2">
                    {status.running ? 'No active buy orders.' : 'Start monitor to load orders.'}
                  </p>
                ) : (
                  buyOrders.map(order => (
                    <OrderCard key={order.orderId} order={order} onCopy={p => copyPrice(p).catch(() => {})} onOpenEve={handleOpenEve} />
                  ))
                )}
              </div>
            )}

            {/* Sell Orders tab */}
            {tab === 'sell' && (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                {sellOrders.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2">
                    {status.running ? 'No active sell orders.' : 'Start monitor to load orders.'}
                  </p>
                ) : (
                  sellOrders.map(order => (
                    <OrderCard key={order.orderId} order={order} onCopy={p => copyPrice(p).catch(() => {})} onOpenEve={handleOpenEve} />
                  ))
                )}
              </div>
            )}

            {/* Alerts tab */}
            {tab === 'alerts' && (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                {recentAlerts.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2">No alerts in the last hour.</p>
                ) : (
                  recentAlerts.map((alert, i) => (
                    <div key={i} className="p-2.5 rounded text-[11px] border border-border/40 bg-secondary/20">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={
                          alert.type === 'undercut' ? 'text-destructive font-semibold' :
                          alert.type === 'fill' ? 'text-green font-semibold' : 'text-primary font-semibold'
                        }>
                          {alert.type === 'undercut' ? '⚠ Undercut' : alert.type === 'fill' ? '✓ Fill' : '★ Opportunity'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-foreground leading-snug">{alert.message}</p>
                      {alert.suggestedPrice !== null && (
                        <button
                          onClick={() => copyPrice(alert.suggestedPrice!).catch(() => {})}
                          className="mt-1 text-primary hover:underline font-mono text-[10px]"
                        >
                          Copy {formatIskPrice(alert.suggestedPrice)} ISK
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
