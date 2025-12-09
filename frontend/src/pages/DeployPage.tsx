import { useParams, useNavigate } from 'react-router-dom'
import { useModel } from '@/hooks/useModels'
import { useGpuCapacity } from '@/hooks/useGpuOperator'
import { DeploymentForm } from '@/components/deployments/DeploymentForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, Cpu, HardDrive, Layers, AlertTriangle } from 'lucide-react'

export function DeployPage() {
  const { modelId } = useParams<{ modelId: string }>()
  const navigate = useNavigate()
  const decodedModelId = modelId ? decodeURIComponent(modelId) : undefined
  const { data: model, isLoading, error } = useModel(decodedModelId)
  const { data: gpuCapacity } = useGpuCapacity()

  // Calculate if model fits in cluster
  const modelMinGpus = model?.minGpus ?? 1
  const hasGpuWarning = gpuCapacity && (
    gpuCapacity.availableGpus < modelMinGpus ||
    gpuCapacity.maxContiguousAvailable < modelMinGpus
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !model) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-medium text-destructive">
          Model not found
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          The requested model could not be found
        </p>
        <Button onClick={() => navigate('/')}>
          Back to Catalog
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Deploy Model</h1>
          <p className="text-muted-foreground mt-1">
            Configure and deploy {model.name} to Kubernetes
          </p>
        </div>
      </div>

      {/* Model Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>{model.name}</CardTitle>
              <CardDescription>{model.id}</CardDescription>
            </div>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {model.size}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{model.description}</p>

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Cpu className="h-4 w-4" />
              <span>GPU: {model.minGpuMemory || 'N/A'}</span>
            </div>

            {model.contextLength && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Layers className="h-4 w-4" />
                <span>Context: {model.contextLength.toLocaleString()}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span className="capitalize">{model.task.replace('-', ' ')}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {model.supportedEngines.map((engine) => (
              <Badge key={engine} variant="secondary">
                {engine.toUpperCase()}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* GPU Warning Banner */}
      {hasGpuWarning && gpuCapacity && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  GPU Capacity Warning
                </p>
                <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                  {gpuCapacity.availableGpus < modelMinGpus && (
                    <p>
                      This model requires at least {modelMinGpus} GPU(s) but only {gpuCapacity.availableGpus} are available in the cluster.
                    </p>
                  )}
                  {gpuCapacity.maxContiguousAvailable < modelMinGpus && gpuCapacity.availableGpus >= modelMinGpus && (
                    <p>
                      This model requires {modelMinGpus} GPU(s) on a single node, but the largest available block is {gpuCapacity.maxContiguousAvailable} GPU(s).
                    </p>
                  )}
                  <p className="text-xs mt-2">
                    Cluster: {gpuCapacity.availableGpus}/{gpuCapacity.totalGpus} GPUs available • Max contiguous: {gpuCapacity.maxContiguousAvailable}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deployment Form */}
      <DeploymentForm model={model} />
    </div>
  )
}
