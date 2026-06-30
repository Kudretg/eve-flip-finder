import { useCallback, useEffect, useRef, useState } from 'react'
import type { MonitorStatus, AuthStatus, MonitorConfig } from '@/types/electron'

export const isElectron = typeof window !== 'undefined' && !!window.electronAPI

const DEFAULT_STATUS: MonitorStatus = {
  running: false,
  lastRun: null,
  walletBalance: null,
  character: null,
  activeOrders: [],
  recentAlerts: [],
  config: {
    minMargin: 5,
    minProfit: 500_000,
    maxBudgetPerItem: 0,
    hubIndex: 0,
    brokerFee: 3,
    salesTax: 8,
  },
}

export function useMonitor() {
  const [status, setStatus] = useState<MonitorStatus>(DEFAULT_STATUS)
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ authenticated: false, characterId: 0, characterName: '' })
  const [clientId, setClientIdState] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!isElectron) return

    window.electronAPI!.getClientId().then(setClientIdState).catch(() => {})
    window.electronAPI!.getAuthStatus().then(setAuthStatus).catch(() => {})
    window.electronAPI!.getMonitorStatus().then(s => setStatus(s as MonitorStatus)).catch(() => {})

    unsubRef.current = window.electronAPI!.onMonitorUpdate(s => setStatus(s))
    return () => { unsubRef.current?.() }
  }, [])

  const login = useCallback(async (id: string) => {
    if (!isElectron) return
    setIsLoggingIn(true)
    setLoginError(null)
    try {
      const result = await window.electronAPI!.login(id)
      if (result.success) {
        const auth = await window.electronAPI!.getAuthStatus()
        setAuthStatus(auth)
        setClientIdState(id)
      } else {
        setLoginError(result.error ?? 'Login failed')
      }
    } catch (err) {
      setLoginError((err as Error).message)
    } finally {
      setIsLoggingIn(false)
    }
  }, [])

  const logoutFn = useCallback(async () => {
    if (!isElectron) return
    await window.electronAPI!.logout()
    setAuthStatus({ authenticated: false, characterId: 0, characterName: '' })
    setStatus(DEFAULT_STATUS)
  }, [])

  const startMonitor = useCallback(async (config: MonitorConfig) => {
    if (!isElectron) return
    await window.electronAPI!.startMonitor(config)
  }, [])

  const stopMonitor = useCallback(async () => {
    if (!isElectron) return
    await window.electronAPI!.stopMonitor()
  }, [])

  const copyPrice = useCallback(async (price: number) => {
    if (!isElectron) return
    await window.electronAPI!.copyToClipboard(price.toFixed(2))
  }, [])

  const saveClientId = useCallback(async (id: string) => {
    if (!isElectron) return
    await window.electronAPI!.setClientId(id)
    setClientIdState(id)
  }, [])

  return {
    status,
    authStatus,
    clientId,
    loginError,
    isLoggingIn,
    login,
    logout: logoutFn,
    startMonitor,
    stopMonitor,
    copyPrice,
    saveClientId,
  }
}
