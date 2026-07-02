import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/utils'
import { useUpdater } from '@/hooks/useUpdater'

export function UpdaterBanner() {
  const { status, check, download, install, dismiss } = useUpdater()
  const { state, manual, version, percent, bytesPerSecond, message, currentVersion } = status

  const showBanner =
    state === 'checking' ||
    state === 'available' ||
    state === 'downloading' ||
    state === 'downloaded' ||
    (manual && (state === 'not-available' || state === 'error'))

  // Idle (and any silent, non-manual not-available/error): just a reachable check link.
  if (!showBanner) {
    return (
      <div className="flex justify-end mb-2">
        <button onClick={check} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          Check for updates
        </button>
      </div>
    )
  }

  const isError = state === 'error'
  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-xs flex items-center gap-3 ${
      isError ? 'border-destructive/40 bg-destructive/10' : 'border-primary/40 bg-primary/10'
    }`}>
      <div className="flex-1 min-w-0">
        {state === 'checking' && <span className="text-muted-foreground">Checking for updates…</span>}

        {state === 'available' && (
          <span className="text-foreground">Version <span className="font-semibold">{version}</span> is available.</span>
        )}

        {state === 'downloading' && (
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-muted-foreground">
              <span>Downloading update…</span>
              <span className="font-mono">{(percent ?? 0).toFixed(0)}% · {formatBytes(bytesPerSecond ?? 0)}/s</span>
            </div>
            <div className="h-1.5 w-full rounded bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${percent ?? 0}%` }} />
            </div>
          </div>
        )}

        {state === 'downloaded' && (
          <span className="text-foreground">Version <span className="font-semibold">{version}</span> downloaded — restart to install.</span>
        )}

        {state === 'not-available' && (
          <span className="text-muted-foreground">You're on the latest version (v{currentVersion}).</span>
        )}

        {isError && <span className="text-destructive">Update failed: {message}</span>}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {state === 'available' && (
          <>
            <Button size="sm" className="h-7 text-xs px-3" onClick={download}>Download</Button>
            <button onClick={dismiss} className="text-[10px] text-muted-foreground hover:text-foreground">Later</button>
          </>
        )}
        {state === 'downloaded' && (
          <Button size="sm" className="h-7 text-xs px-3" onClick={install}>Restart &amp; Install</Button>
        )}
        {(state === 'not-available' || isError) && (
          <button onClick={dismiss} className="text-[10px] text-muted-foreground hover:text-foreground">Dismiss</button>
        )}
      </div>
    </div>
  )
}
