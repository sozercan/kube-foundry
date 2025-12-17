import { Link } from 'react-router-dom'
import { useClusterStatus } from '@/hooks/useClusterStatus'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wifi, WifiOff, AlertTriangle, Menu } from 'lucide-react'
import { useSidebar } from './MainLayout'

export function Header() {
  const { data: clusterStatus, isLoading } = useClusterStatus()
  const { toggle } = useSidebar()

  const providerInstalled = clusterStatus?.providerInstallation?.installed ?? false
  const showProviderWarning = clusterStatus?.connected && !providerInstalled && !isLoading

  return (
    <header className="border-b bg-card">
      {showProviderWarning && (
        <div className="flex items-center justify-between gap-2 bg-yellow-100 px-4 md:px-6 py-2 text-sm text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="truncate">
              Provider "{clusterStatus?.provider?.name || 'Unknown'}" is not installed.
            </span>
          </div>
          <Link
            to="/settings"
            className="font-medium underline hover:no-underline whitespace-nowrap"
          >
            View instructions →
          </Link>
        </div>
      )}

      <div className="flex h-14 md:h-16 items-center justify-between px-4 md:px-6 gap-4">
        {/* Left side: hamburger + title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Hamburger menu - mobile only */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0 -ml-2"
            onClick={toggle}
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {/* Right side: status badges */}
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          {/* Connection status */}
          <div className="flex items-center">
            {isLoading ? (
              <Badge variant="outline" pulse className="gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                <span className="hidden sm:inline">Connecting...</span>
              </Badge>
            ) : clusterStatus?.connected ? (
              <Badge variant="success" className="gap-1.5">
                <Wifi className="h-3 w-3" />
                <span className="hidden sm:inline">Connected</span>
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1.5">
                <WifiOff className="h-3 w-3" />
                <span className="hidden sm:inline">Disconnected</span>
              </Badge>
            )}
          </div>

          {/* Cluster name - hide on small screens */}
          {clusterStatus?.clusterName && (
            <Badge variant="outline" className="hidden lg:inline-flex max-w-[150px]">
              <span className="truncate">{clusterStatus.clusterName}</span>
            </Badge>
          )}
        </div>
      </div>
    </header>
  )
}
