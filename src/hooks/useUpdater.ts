import { useCallback, useEffect, useState } from 'react'
import type { UpdaterStatus } from '@/types/electron'
import { isElectron } from '@/hooks/useMonitor'

const INITIAL: UpdaterStatus = { state: 'idle', currentVersion: '', manual: false }

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterStatus>(INITIAL)

  useEffect(() => {
    if (!isElectron) return
    window.electronAPI!.getUpdaterStatus().then(setStatus).catch(() => {})
    const unsub = window.electronAPI!.onUpdaterStatus(setStatus)
    return () => unsub()
  }, [])

  const check = useCallback(() => {
    if (!isElectron) return
    window.electronAPI!.checkForUpdates().catch(() => {})
  }, [])

  const download = useCallback(() => {
    if (!isElectron) return
    window.electronAPI!.downloadUpdate().catch(() => {})
  }, [])

  const install = useCallback(() => {
    if (!isElectron) return
    window.electronAPI!.installUpdate().catch(() => {})
  }, [])

  // Local-only dismiss for transient manual states (up-to-date / error).
  const dismiss = useCallback(() => setStatus(s => ({ ...s, state: 'idle', manual: false })), [])

  return { status, check, download, install, dismiss }
}
