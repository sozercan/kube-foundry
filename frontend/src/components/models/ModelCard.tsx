import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { type Model } from '@/lib/api'
import { Cpu, HardDrive, Layers } from 'lucide-react'

interface ModelCardProps {
  model: Model
}

export function ModelCard({ model }: ModelCardProps) {
  const navigate = useNavigate()

  const handleDeploy = () => {
    navigate(`/deploy/${encodeURIComponent(model.id)}`)
  }

  return (
    <Card className="flex flex-col transition-colors hover:border-nvidia/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight">{model.name}</CardTitle>
          <Badge variant="outline" className="shrink-0">
            {model.size}
          </Badge>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          {model.id}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground mb-4">
          {model.description}
        </p>

        <div className="space-y-2 text-sm">
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

        <div className="flex flex-wrap gap-1 mt-4">
          {model.supportedEngines.map((engine) => (
            <Badge key={engine} variant="secondary" className="text-xs">
              {engine.toUpperCase()}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter>
        <Button onClick={handleDeploy} className="w-full">
          Deploy Model
        </Button>
      </CardFooter>
    </Card>
  )
}
