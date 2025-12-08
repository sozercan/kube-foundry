import { useParams, useNavigate } from 'react-router-dom'
import { useModel } from '@/hooks/useModels'
import { DeploymentForm } from '@/components/deployments/DeploymentForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft, Cpu, HardDrive, Layers } from 'lucide-react'

export function DeployPage() {
  const { modelId } = useParams<{ modelId: string }>()
  const navigate = useNavigate()
  const decodedModelId = modelId ? decodeURIComponent(modelId) : undefined
  const { data: model, isLoading, error } = useModel(decodedModelId)

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

      {/* Deployment Form */}
      <DeploymentForm model={model} />
    </div>
  )
}
