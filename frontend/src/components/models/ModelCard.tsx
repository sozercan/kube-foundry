import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { type Model } from '@/lib/api'
import { Cpu, HardDrive, Layers, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModelCardProps {
  model: Model
}

export function ModelCard({ model }: ModelCardProps) {
  const navigate = useNavigate()

  const handleDeploy = () => {
    navigate(`/deploy/${encodeURIComponent(model.id)}`)
  }

  return (
    <Card
      interactive
      data-testid={`model-card-${model.id}`}
      className={cn(
        "flex flex-col h-full group",
        "hover:border-nvidia/50 hover:shadow-glow",
        "[--glow-color:theme(colors.nvidia.DEFAULT/0.15)]"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight group-hover:text-nvidia transition-colors duration-200">
            {model.name}
          </CardTitle>
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            {model.size}
          </Badge>
        </div>
        <CardDescription className="text-xs text-muted-foreground font-mono truncate">
          {model.id}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 pt-0">
        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
          {model.description}
        </p>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cpu className="h-4 w-4 shrink-0" />
            <span className="truncate">GPU: {model.minGpuMemory || 'N/A'}</span>
          </div>

          {model.contextLength && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4 shrink-0" />
              <span>Context: {model.contextLength.toLocaleString()}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive className="h-4 w-4 shrink-0" />
            <span className="capitalize">{model.task.replace('-', ' ')}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-4">
          {model.supportedEngines.map((engine) => (
            <Badge
              key={engine}
              variant="secondary"
              className="text-xs font-medium"
            >
              {engine.toUpperCase()}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="pt-4">
        <Button
          onClick={handleDeploy}
          className="w-full group/btn"
          data-testid={`model-deploy-button-${model.id}`}
        >
          <Rocket className="mr-2 h-4 w-4 transition-transform duration-200 group-hover/btn:-translate-y-0.5" />
          Deploy Model
        </Button>
      </CardFooter>
    </Card>
  )
}
