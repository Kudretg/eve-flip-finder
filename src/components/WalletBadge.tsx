import { formatISK } from '@/lib/utils'
import type { AuthStatus, MonitorStatus } from '@/types/electron'

interface Props {
  authStatus: AuthStatus
  status: MonitorStatus
}

export function WalletBadge({ authStatus, status }: Props) {
  if (!authStatus.authenticated) return null

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-muted-foreground">{authStatus.characterName}</span>
      {status.walletBalance !== null && (
        <span className="font-mono text-green">{formatISK(status.walletBalance)} ISK</span>
      )}
    </div>
  )
}
