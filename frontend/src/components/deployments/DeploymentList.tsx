import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DeploymentStatusBadge } from './DeploymentStatusBadge'
import { useDeleteDeployment, type DeploymentStatus } from '@/hooks/useDeployments'
import { useToast } from '@/hooks/useToast'
import { formatRelativeTime } from '@/lib/utils'
import { Eye, Trash2, Loader2 } from 'lucide-react'

interface DeploymentListProps {
  deployments: DeploymentStatus[]
}

export function DeploymentList({ deployments }: DeploymentListProps) {
  const { toast } = useToast()
  const deleteDeployment = useDeleteDeployment()
  const [deleteTarget, setDeleteTarget] = useState<DeploymentStatus | null>(null)

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      await deleteDeployment.mutateAsync({
        name: deleteTarget.name,
        namespace: deleteTarget.namespace,
      })
      toast({
        title: 'Deployment Deleted',
        description: `${deleteTarget.name} has been deleted`,
        variant: 'success',
      })
      setDeleteTarget(null)
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete deployment',
        variant: 'destructive',
      })
    }
  }

  if (deployments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          No deployments found
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          Deploy your first model to get started
        </p>
        <Link to="/">
          <Button>Deploy a Model</Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Model</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Engine</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Replicas</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Age</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {deployments.map((deployment) => (
              <tr key={deployment.name} className="border-b last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium">{deployment.name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {deployment.modelId}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">
                    {deployment.engine.toUpperCase()}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <DeploymentStatusBadge phase={deployment.phase} />
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm">
                    {deployment.replicas.ready}/{deployment.replicas.desired}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {formatRelativeTime(deployment.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link to={`/deployments/${deployment.name}?namespace=${deployment.namespace}`}>
                      <Button size="sm" variant="ghost">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(deployment)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Deployment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteDeployment.isPending}
            >
              {deleteDeployment.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
