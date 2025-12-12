import { Card, CardContent } from '@/components/ui/card';
import { Cpu, Loader2 } from 'lucide-react';
import type { DetailedClusterCapacity } from '@/lib/api';

interface ClusterCapacityWidgetProps {
  capacity?: DetailedClusterCapacity;
  isLoading?: boolean;
}

export function ClusterCapacityWidget({ capacity, isLoading }: ClusterCapacityWidgetProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading GPU capacity...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!capacity || capacity.totalGpus === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Cpu className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">GPU Capacity</p>
              <p className="text-xs text-muted-foreground mt-1">
                No GPUs detected in cluster
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const utilizationPercent = (capacity.allocatedGpus / capacity.totalGpus) * 100;
  const availabilityPercent = (capacity.availableGpus / capacity.totalGpus) * 100;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Cpu className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">GPU Capacity</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {capacity.availableGpus} / {capacity.totalGpus} available ({availabilityPercent.toFixed(0)}%)
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                Max per node: {capacity.maxNodeGpuCapacity}
              </p>
              <p className="text-xs text-muted-foreground">
                {capacity.gpuNodeCount} GPU node{capacity.gpuNodeCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-primary transition-all"
              style={{ width: `${utilizationPercent}%` }}
            />
          </div>

          {capacity.nodePools.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View node pools ({capacity.nodePools.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {capacity.nodePools.map((pool) => (
                  <li key={pool.name} className="flex justify-between items-center py-1 px-2 rounded bg-muted/50">
                    <span className="font-medium">{pool.name}</span>
                    <span className="text-muted-foreground">
                      {pool.availableGpus}/{pool.gpuCount} GPUs • {pool.nodeCount} node{pool.nodeCount !== 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {capacity.totalMemoryGb && (
            <p className="text-xs text-muted-foreground pt-2 border-t">
              {capacity.totalMemoryGb.toFixed(0)} GB per GPU
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
