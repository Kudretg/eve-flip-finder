import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatISK, formatIskPrice } from '@/lib/utils'
import { useMonitor } from '@/hooks/useMonitor'
import { getCancelCandidates, scoreBuyOrder, sortUndercutOrders, type BuyOrderHealth } from '@/lib/orderHealth'
import type { MonitorConfig, ActiveOrderUI, RepriceSort } from '@/types/electron'

// Convert a keydown into an Electron accelerator string (e.g. "CommandOrControl+Shift+R").
// Requires at least one modifier; returns null for modifier-only presses.
function toAccelerator(e: React.KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  const k = e.key
  if (k === 'Control' || k === 'Meta' || k === 'Alt' || k === 'Shift') return null
  if (mods.length === 0) return null
  const named: Record<string, string> = {
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space',
  }
  const key = named[k] ?? (k.length === 1 ? k.toUpperCase() : k)
  return [...mods, key].join('+')
}

const REPRICE_SORT_LABELS: Record<RepriceSort, string> = {
  iskAtRisk: 'ISK at risk',
  margin: 'Thinnest margin',
  none: 'Monitor order',
}

function iskAtRisk(o: ActiveOrderUI): number {
  return o.price * o.volumeRemain
}

// How long an acted-on order stays hidden from the action lists. Aligned to the
// monitor poll + ESI order cache TTL, so fresh data lands by the time it expires.
const SNOOZE_MS = 5 * 60_000

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

function CancelCard({ order, health, onCancelAction }: {
  order: ActiveOrderUI
  health: BuyOrderHealth
  onCancelAction: (order: ActiveOrderUI) => void
}) {
  return (
    <div className="p-2.5 rounded text-[11px] border border-destructive/40 bg-destructive/5">
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-medium text-foreground leading-tight">{order.typeName}</span>
        {health.competeMargin !== null && (
          <span className="text-destructive text-[10px] shrink-0 font-mono font-semibold">
            {health.competeMargin.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground mb-1.5">
        <span>Price: <span className="font-mono text-foreground">{formatISK(order.price)}</span></span>
        <span>Vol: <span className="text-foreground">{order.volumeRemain}/{order.volumeTotal}</span></span>
        <span>Age: <span className="text-foreground">{Math.floor(health.ageDays)}d</span></span>
        <span>Locked: <span className="font-mono text-foreground">{formatISK(health.capitalLocked)}</span></span>
      </div>
      <ul className="mb-1.5 space-y-0.5">
        {health.reasons.map((r, i) => (
          <li key={i} className="text-destructive/90 leading-snug">• {r}</li>
        ))}
      </ul>
      <button
        onClick={() => onCancelAction(order)}
        className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
      >
        ⧉ Open in EVE to cancel
      </button>
    </div>
  )
}

function RepriceCard({ order, config, justRepriced, emphasized, onReprice }: {
  order: ActiveOrderUI
  config: MonitorConfig
  justRepriced: boolean
  emphasized: boolean
  onReprice: (order: ActiveOrderUI) => void
}) {
  const health = order.isBuyOrder ? scoreBuyOrder(order, config) : null
  const marginWarn = health?.competeMargin != null && health.competeMargin < config.minMargin
  const metric = config.repriceSort === 'margin' && health?.competeMargin != null
    ? `${health.competeMargin.toFixed(1)}% margin`
    : `${formatISK(iskAtRisk(order))} at risk`
  return (
    <div className={`p-2.5 rounded text-[11px] border transition-colors ${emphasized ? 'border-primary/60 bg-primary/10' : 'border-destructive/40 bg-destructive/5'}`}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-medium text-foreground leading-tight">{order.typeName}</span>
        <span className="text-[9px] shrink-0 font-semibold text-muted-foreground">{order.isBuyOrder ? 'BUY' : 'SELL'}</span>
      </div>
      <div className="text-muted-foreground mb-1">
        <span className="font-mono text-foreground">{formatISK(order.price)}</span>
        {' → '}
        <span className="font-mono text-primary">{formatIskPrice(order.suggestedPrice!)}</span>
      </div>
      <div className="text-[10px] text-muted-foreground mb-1.5">
        {metric}{emphasized && <span className="text-primary font-semibold"> · Next up</span>}
      </div>
      {marginWarn && (
        <p className="text-[10px] text-amber-400 leading-snug mb-1.5">
          Re-pricing drops margin to {health!.competeMargin!.toFixed(1)}% — consider cancelling instead
        </p>
      )}
      <button
        onClick={() => onReprice(order)}
        className={`w-full h-7 rounded text-[11px] font-medium transition-colors ${justRepriced ? 'bg-green/20 text-green' : 'bg-primary text-primary-foreground hover:opacity-90'}`}
      >
        {justRepriced ? '✓ copied — Modify in EVE' : 'Re-price'}
      </button>
    </div>
  )
}

function SnoozedPanel({ items, open, onToggle, onUndo }: {
  items: { order: ActiveOrderUI; remainingMs: number }[]
  open: boolean
  onToggle: () => void
  onUndo: (orderId: number) => void
}) {
  if (items.length === 0) return null
  return (
    <div>
      <button onClick={onToggle} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
        {items.length} snoozed {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-1 space-y-1 p-2 bg-secondary/30 rounded">
          {items.map(({ order, remainingMs }) => (
            <div key={order.orderId} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate text-muted-foreground">{order.typeName}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-muted-foreground">{Math.ceil(remainingMs / 60_000)}m</span>
                <button onClick={() => onUndo(order.orderId)} className="text-primary hover:underline">Undo</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TraderPanel() {
  const { status, authStatus, clientId, loginError, isLoggingIn, login, logout, startMonitor, stopMonitor, copyPrice, saveClientId } = useMonitor()
  const [inputClientId, setInputClientId] = useState('')
  const [showClientIdInput, setShowClientIdInput] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [localConfig, setLocalConfig] = useState<MonitorConfig>(status.config)
  const [tab, setTab] = useState<'buy' | 'sell' | 'cancel' | 'reprice' | 'alerts'>('buy')
  const [openEveError, setOpenEveError] = useState<string | null>(null)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const [repriceIdx, setRepriceIdx] = useState(0)
  const [stepperOn, setStepperOn] = useState(false)
  const [repricedId, setRepricedId] = useState<number | null>(null)
  const [preArm, setPreArm] = useState(false)
  const [capturingHotkey, setCapturingHotkey] = useState(false)
  // Acted-on orders are hidden from the action lists for SNOOZE_MS; each entry
  // records the price at action time so we can early-clear once the Modify lands.
  const [snoozed, setSnoozed] = useState<Map<number, { expiry: number; priceAtAction: number }>>(new Map())
  const [showSnoozed, setShowSnoozed] = useState(false)
  const [snoozeTick, setSnoozeTick] = useState(0)

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
    startMonitor(localConfig).then(res => {
      if (res && !res.hotkeyRegistered && localConfig.repriceHotkeyEnabled) {
        setHotkeyError(`Couldn't register ${localConfig.repriceHotkey} — likely in use by another app`)
      } else {
        setHotkeyError(null)
      }
    }).catch(() => {})
  }

  const handleOpenEve = useCallback(async (typeId: number): Promise<{ ok: boolean; error?: string }> => {
    setOpenEveError(null)
    try {
      const result = await window.electronAPI?.openMarketWindow(typeId)
      if (result && !result.success) {
        const raw = result.error ?? 'Unknown error'
        let msg: string
        if (raw.includes('403') || raw.includes('scope') || raw.includes('token')) {
          msg = 'Missing scope — Unlink and re-link your account to grant EVE UI permission.'
        } else if (raw.includes('520') || raw.includes('not logged')) {
          msg = 'Character must be logged into the EVE client.'
        } else {
          msg = `Failed: ${raw}`
        }
        setOpenEveError(msg)
        setTimeout(() => setOpenEveError(null), 6000)
        return { ok: false, error: msg }
      }
      return { ok: true }
    } catch (err) {
      const msg = (err as Error).message
      setOpenEveError(msg)
      setTimeout(() => setOpenEveError(null), 6000)
      return { ok: false, error: msg }
    }
  }, [])

  const lastRunLabel = status.lastRun
    ? `${Math.floor((Date.now() - status.lastRun) / 60_000)}m ago`
    : 'never'

  const buyOrders = status.activeOrders.filter(o => o.isBuyOrder)
  const sellOrders = status.activeOrders.filter(o => !o.isBuyOrder)
  const recentAlerts = status.recentAlerts.filter(a => Date.now() - a.timestamp < 3_600_000)
  const undercutCount = status.activeOrders.filter(o => o.isUndercut).length

  // Snooze bookkeeping. An entry is "active" (still hiding its order) only while
  // the order is present, unexpired, and its price is unchanged — a price change
  // means the in-client Modify landed, so we early-clear and let the live state decide.
  const activeOrderMap = useMemo(
    () => new Map(status.activeOrders.map(o => [o.orderId, o])),
    [status.activeOrders]
  )
  // Recomputed each render (cheap); the 20s tick + monitor updates drive re-renders.
  const snoozedList: { order: ActiveOrderUI; remainingMs: number }[] = []
  {
    const now = Date.now()
    for (const [orderId, { expiry, priceAtAction }] of snoozed) {
      const order = activeOrderMap.get(orderId)
      if (!order || now >= expiry || order.price !== priceAtAction) continue
      snoozedList.push({ order, remainingMs: expiry - now })
    }
  }
  const snoozedIds = new Set(snoozedList.map(s => s.order.orderId))

  const snooze = useCallback((order: ActiveOrderUI) => {
    setSnoozed(m => new Map(m).set(order.orderId, { expiry: Date.now() + SNOOZE_MS, priceAtAction: order.price }))
  }, [])
  const unsnooze = useCallback((orderId: number) => {
    setSnoozed(m => { const n = new Map(m); n.delete(orderId); return n })
  }, [])

  // Tick so expiry/early-clear surface without a monitor event.
  useEffect(() => {
    const id = setInterval(() => setSnoozeTick(t => t + 1), 20_000)
    return () => clearInterval(id)
  }, [])

  // Early-clear: prune expired / gone / price-changed entries from the map.
  useEffect(() => {
    setSnoozed(prev => {
      const now = Date.now()
      let changed = false
      const next = new Map(prev)
      for (const [orderId, { expiry, priceAtAction }] of prev) {
        const order = activeOrderMap.get(orderId)
        if (!order || now >= expiry || order.price !== priceAtAction) { next.delete(orderId); changed = true }
      }
      return changed ? next : prev
    })
  }, [activeOrderMap, snoozeTick])

  const cancelCandidates = getCancelCandidates(status.activeOrders, status.config)
    .filter(({ order }) => !snoozedIds.has(order.orderId))

  // One sorted undercut list feeds the list, stepper, and hotkey.
  const undercutOrders = useMemo(
    () => sortUndercutOrders(status.activeOrders, status.config),
    [status.activeOrders, status.config]
  ).filter(o => !snoozedIds.has(o.orderId))

  // Keep refs current so the once-registered hotkey handler reads fresh state.
  const undercutRef = useRef(undercutOrders)
  undercutRef.current = undercutOrders
  const idxRef = useRef(repriceIdx)
  idxRef.current = repriceIdx
  const soundRef = useRef(status.config.repriceSound)
  soundRef.current = status.config.repriceSound

  const stepOrder = undercutOrders.length
    ? undercutOrders[Math.min(repriceIdx, undercutOrders.length - 1)]
    : null

  // Copy tick-correct price + open the item's market window in EVE. The single
  // point where the stepper index advances (once per successful re-price).
  const repriceCore = useCallback(async (order: ActiveOrderUI): Promise<{ ok: boolean; error?: string }> => {
    if (!order || order.suggestedPrice === null) return { ok: false }
    await copyPrice(order.suggestedPrice)
    const res = await handleOpenEve(order.typeId)
    // On success the order is snoozed out of the list; that removal slides the
    // next order into this index, so there's no separate advance (that would
    // skip one). On failure it stays put so the user can retry.
    if (res.ok) snooze(order)
    setRepricedId(order.orderId)
    window.setTimeout(() => setRepricedId(id => (id === order.orderId ? null : id)), 2500)
    return res
  }, [copyPrice, handleOpenEve, snooze])

  // Cancel action: open the market window to cancel in-client, then snooze it
  // out of the list (early-clears once the order actually disappears).
  const handleCancelAction = useCallback(async (order: ActiveOrderUI) => {
    const res = await handleOpenEve(order.typeId)
    if (res.ok) snooze(order)
  }, [handleOpenEve, snooze])

  // Clamp / reset stepper when the undercut list changes.
  useEffect(() => {
    setRepriceIdx(i => (undercutOrders.length === 0 ? 0 : Math.min(i, undercutOrders.length - 1)))
    if (undercutOrders.length === 0) setStepperOn(false)
  }, [undercutOrders.length])

  // Hotkey fires "re-price next" while the app is unfocused (EVE has focus).
  const onHotkey = async () => {
    const list = undercutRef.current
    if (list.length === 0) {
      window.electronAPI?.showNotification({ body: 'No undercut orders', silent: true }).catch(() => {})
      return
    }
    const i = Math.min(idxRef.current, list.length - 1)
    const order = list[i]
    const position = i + 1
    const total = list.length
    const res = await repriceCore(order)
    let body: string
    if (!res.ok) {
      body = res.error ?? 'Re-price failed — check the app'
    } else if (position >= total) {
      body = 'All undercuts re-priced'
    } else {
      body = `Copied ${formatIskPrice(order.suggestedPrice!)} — Modify ${order.typeName} (${position} of ${total})`
    }
    // Errors always audible so you notice while in EVE.
    window.electronAPI?.showNotification({ body, silent: res.ok ? !soundRef.current : false }).catch(() => {})
  }
  const onHotkeyRef = useRef(onHotkey)
  onHotkeyRef.current = onHotkey

  useEffect(() => {
    const unsub = window.electronAPI?.onRepriceNext(() => onHotkeyRef.current())
    return () => unsub?.()
  }, [])

  // Focus-loss pre-arm: after a button re-price steals focus to EVE, highlight
  // the next order (index already advanced) so returning fires it instantly.
  useEffect(() => {
    const onBlur = () => { if (stepperOn) setPreArm(true) }
    const onFocus = () => setPreArm(false)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [stepperOn])

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

                {/* Re-price assistant settings */}
                <div className="pt-1 border-t border-border/50 space-y-2">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Re-price Assistant</p>
                  <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localConfig.repriceHotkeyEnabled}
                      onChange={e => setLocalConfig(c => ({ ...c, repriceHotkeyEnabled: e.target.checked }))}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    Global hotkey (re-price next)
                  </label>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">Hotkey — click and press a combo</label>
                    <input
                      type="text"
                      readOnly
                      value={capturingHotkey ? 'Press keys… (Esc to cancel)' : localConfig.repriceHotkey}
                      onFocus={() => setCapturingHotkey(true)}
                      onBlur={() => setCapturingHotkey(false)}
                      onKeyDown={e => {
                        e.preventDefault()
                        if (e.key === 'Escape') { setCapturingHotkey(false); e.currentTarget.blur(); return }
                        const acc = toAccelerator(e)
                        if (acc) setLocalConfig(c => ({ ...c, repriceHotkey: acc }))
                      }}
                      disabled={!localConfig.repriceHotkeyEnabled}
                      className="h-7 px-2 text-xs bg-secondary border border-border rounded text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 cursor-pointer"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localConfig.repriceSound}
                      onChange={e => setLocalConfig(c => ({ ...c, repriceSound: e.target.checked }))}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    Notification sound
                  </label>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted-foreground">Priority order</label>
                    <select
                      value={localConfig.repriceSort}
                      onChange={e => setLocalConfig(c => ({ ...c, repriceSort: e.target.value as RepriceSort }))}
                      className="h-7 px-2 text-xs bg-secondary border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {(Object.keys(REPRICE_SORT_LABELS) as RepriceSort[]).map(k => (
                        <option key={k} value={k}>{REPRICE_SORT_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
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

            {/* Hotkey registration error */}
            {hotkeyError && (
              <p className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1.5 leading-relaxed">
                {hotkeyError}
              </p>
            )}

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border">
              {([
                { key: 'buy', label: 'Buy Orders', count: buyOrders.length, danger: false },
                { key: 'sell', label: 'Sell Orders', count: sellOrders.length, danger: false },
                { key: 'cancel', label: 'Cancel', count: cancelCandidates.length, danger: true },
                { key: 'reprice', label: 'Re-price', count: undercutOrders.length, danger: true },
                { key: 'alerts', label: 'Alerts', count: recentAlerts.length, danger: false },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`pb-1.5 text-[10px] px-2 transition-colors whitespace-nowrap ${
                    tab === t.key ? 'text-primary border-b border-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span className={`ml-1 ${t.danger ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                      ({t.count})
                    </span>
                  )}
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

            {/* Cancel tab */}
            {tab === 'cancel' && (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                <SnoozedPanel items={snoozedList} open={showSnoozed} onToggle={() => setShowSnoozed(s => !s)} onUndo={unsnooze} />
                {cancelCandidates.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2">
                    {status.running ? 'No weak buy orders — your book looks healthy.' : 'Start monitor to load orders.'}
                  </p>
                ) : (
                  cancelCandidates.map(({ order, health }) => (
                    <CancelCard key={order.orderId} order={order} health={health} onCancelAction={handleCancelAction} />
                  ))
                )}
              </div>
            )}

            {/* Re-price tab */}
            {tab === 'reprice' && (
              <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-0.5">
                <SnoozedPanel items={snoozedList} open={showSnoozed} onToggle={() => setShowSnoozed(s => !s)} onUndo={unsnooze} />
                {undercutOrders.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground py-2">
                    {status.running ? 'No undercut orders right now.' : 'Start monitor to load orders.'}
                  </p>
                ) : stepperOn && stepOrder ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <button onClick={() => setStepperOn(false)} className="hover:text-foreground">← Back to list</button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setRepriceIdx(i => Math.max(0, i - 1))}
                          disabled={repriceIdx === 0}
                          className="disabled:opacity-40 hover:text-foreground text-sm"
                        >‹</button>
                        <span className="font-mono">{Math.min(repriceIdx + 1, undercutOrders.length)} / {undercutOrders.length}</span>
                        <button
                          onClick={() => setRepriceIdx(i => Math.min(undercutOrders.length - 1, i + 1))}
                          disabled={repriceIdx >= undercutOrders.length - 1}
                          className="disabled:opacity-40 hover:text-foreground text-sm"
                        >›</button>
                      </div>
                    </div>
                    <RepriceCard
                      order={stepOrder}
                      config={status.config}
                      justRepriced={repricedId === stepOrder.orderId}
                      emphasized={preArm}
                      onReprice={o => repriceCore(o)}
                    />
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      className="h-7 text-xs px-3 w-full"
                      onClick={() => { setRepriceIdx(0); setStepperOn(true) }}
                    >
                      Walk through ({undercutOrders.length})
                    </Button>
                    {undercutOrders.map(order => (
                      <RepriceCard
                        key={order.orderId}
                        order={order}
                        config={status.config}
                        justRepriced={repricedId === order.orderId}
                        emphasized={false}
                        onReprice={o => repriceCore(o)}
                      />
                    ))}
                  </>
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
