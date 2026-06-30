import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatISK } from '@/lib/utils'
import { useMonitor } from '@/hooks/useMonitor'
import type { MonitorConfig } from '@/types/electron'

export function TraderPanel() {
  const { status, authStatus, clientId, loginError, isLoggingIn, login, logout, startMonitor, stopMonitor, copyPrice, saveClientId } = useMonitor()
  const [inputClientId, setInputClientId] = useState('')
  const [showClientIdInput, setShowClientIdInput] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [localConfig, setLocalConfig] = useState<MonitorConfig>(status.config)
  const [tab, setTab] = useState<'orders' | 'alerts'>('orders')

  // Sync saved clientId into local state once loaded
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

  const lastRunLabel = status.lastRun
    ? `${Math.floor((Date.now() - status.lastRun) / 60_000)}m ago`
    : 'never'

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
      <CardContent className="pb-4 space-y-4">

        {!authStatus.authenticated ? (
          <div className="space-y-3">
            {/* Primary link button — shows when client ID is already stored */}
            {clientId && !showClientIdInput ? (
              <div className="space-y-2">
                <Button
                  className="w-full h-10 text-sm font-semibold"
                  disabled={isLoggingIn}
                  onClick={handleLinkAccount}
                >
                  {isLoggingIn ? 'Opening EVE Login…' : '🔗 Link EVE Account'}
                </Button>
                <button
                  className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center"
                  onClick={() => setShowClientIdInput(true)}
                >
                  Change Client ID
                </button>
              </div>
            ) : (
              /* Setup: enter client ID */
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Enter your CCP developer app Client ID.{' '}
                  <a href="https://developers.eveonline.com/" target="_blank" rel="noreferrer" className="underline">
                    Register app
                  </a>
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
                <Button
                  className="w-full h-9 text-sm"
                  disabled={isLoggingIn || !inputClientId.trim()}
                  onClick={handleSaveAndLogin}
                >
                  {isLoggingIn ? 'Opening EVE Login…' : '🔗 Link EVE Account'}
                </Button>
                {clientId && (
                  <button
                    className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center"
                    onClick={() => { setInputClientId(clientId); setShowClientIdInput(false) }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {loginError && (
              <p className="text-[10px] text-destructive">{loginError}</p>
            )}
          </div>
        ) : (
          <>
            {/* Character info */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground font-medium">{authStatus.characterName}</span>
              {status.walletBalance !== null && (
                <span className="font-mono text-green">{formatISK(status.walletBalance)} ISK</span>
              )}
            </div>

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
              <button
                className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => setConfigOpen(o => !o)}
              >
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

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
              {(['orders', 'alerts'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`pb-1 text-[10px] px-2 capitalize transition-colors ${
                    tab === t ? 'text-primary border-b border-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t}
                  {t === 'orders' && status.activeOrders.length > 0 && (
                    <span className="ml-1 text-muted-foreground">({status.activeOrders.length})</span>
                  )}
                  {t === 'alerts' && status.recentAlerts.filter(a => Date.now() - a.timestamp < 3_600_000).length > 0 && (
                    <span className="ml-1 text-muted-foreground">({status.recentAlerts.filter(a => Date.now() - a.timestamp < 3_600_000).length})</span>
                  )}
                </button>
              ))}
            </div>

            {/* Orders tab */}
            {tab === 'orders' && (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {status.activeOrders.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2">
                    {status.running ? 'No active orders.' : 'Start monitor to load orders.'}
                  </p>
                ) : (
                  status.activeOrders.map(order => (
                    <div
                      key={order.orderId}
                      className={`p-2 rounded text-[10px] border ${order.isUndercut ? 'border-destructive/40 bg-destructive/5' : 'border-border/40 bg-secondary/20'}`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <span className="font-medium text-foreground truncate">{order.typeName}</span>
                        <Badge variant={order.isBuyOrder ? 'default' : 'secondary'} className="text-[9px] px-1 shrink-0">
                          {order.isBuyOrder ? 'BUY' : 'SELL'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span className="font-mono">{formatISK(order.price)} ISK</span>
                        <span>{order.volumeRemain}/{order.volumeTotal}</span>
                        {order.currentMarketPrice !== null && (
                          <span className="font-mono">mkt: {formatISK(order.currentMarketPrice)}</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <button
                          title="Open market window in EVE"
                          onClick={() => window.electronAPI?.openMarketWindow(order.typeId)}
                          className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                        >
                          ⧉ Open in EVE
                        </button>
                        {order.isUndercut && order.suggestedPrice !== null && (
                          <button
                            onClick={() => copyPrice(order.suggestedPrice!).catch(() => {})}
                            className="text-primary hover:underline font-mono text-[10px]"
                          >
                            Copy {order.suggestedPrice.toFixed(2)} ISK
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Alerts tab */}
            {tab === 'alerts' && (
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {status.recentAlerts.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2">No alerts yet.</p>
                ) : (
                  status.recentAlerts.map((alert, i) => (
                    <div key={i} className="p-2 rounded text-[10px] border border-border/40 bg-secondary/20">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={
                          alert.type === 'undercut' ? 'text-destructive' :
                          alert.type === 'fill' ? 'text-green' : 'text-primary'
                        }>
                          {alert.type === 'undercut' ? '⚠ Undercut' : alert.type === 'fill' ? '✓ Fill' : '★ Opportunity'}
                        </span>
                        <span className="text-muted-foreground">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-foreground">{alert.message}</p>
                      {alert.suggestedPrice !== null && (
                        <button
                          onClick={() => copyPrice(alert.suggestedPrice!).catch(() => {})}
                          className="mt-1 text-primary hover:underline font-mono"
                        >
                          Copy {alert.suggestedPrice.toFixed(2)} ISK
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
