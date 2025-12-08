import { Link } from 'react-router-dom'
import { useDeployments } from '@/hooks/useDeployments'
import { DeploymentList } from '@/components/deployments/DeploymentList'
import { Button } from '@/components/ui/button'
import { Loader2, Plus, RefreshCw } from 'lucide-react'

export function DeploymentsPage() {
  const { data: deployments, isLoading, error, refetch, isFetching } = useDeployments()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-medium text-destructive">
          Failed to load deployments
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
        <Button onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deployments</h1>
          <p className="text-muted-foreground mt-1">
            Manage your Dynamo model deployments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>

          <Link to="/">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Deployment
            </Button>
          </Link>
        </div>
      </div>

      <DeploymentList deployments={deployments || []} />

      {deployments && deployments.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Status refreshes automatically every 10 seconds
        </p>
      )}
    </div>
  )
}
