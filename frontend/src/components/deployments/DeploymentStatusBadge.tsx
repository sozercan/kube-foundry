import { Badge } from '@/components/ui/badge'
import { type DeploymentStatus } from '@/lib/api'

interface DeploymentStatusBadgeProps {
  phase: DeploymentStatus['phase']
}

export function DeploymentStatusBadge({ phase }: DeploymentStatusBadgeProps) {
  const variants: Record<DeploymentStatus['phase'], 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'info'> = {
    Pending: 'warning',
    Deploying: 'info',
    Running: 'success',
    Failed: 'destructive',
    Terminating: 'secondary',
  }

  return (
    <Badge variant={variants[phase]}>
      {phase}
    </Badge>
  )
}
