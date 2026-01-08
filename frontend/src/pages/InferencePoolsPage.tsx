import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Network, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { useToast } from '@/hooks/useToast'

interface InferencePool {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace: string
    labels: Record<string, string>
  }
  spec: {
    modelName: string
    backend: {
      service: {
        name: string
        port: number
      }
    }
    loadBalancing: {
      strategy: string
    }
  }
  _kubefoundry: {
    deploymentName: string
    deploymentNamespace: string
    provider: string
    modelId: string
    phase: string
    replicas: any
  }
}

interface InferencePoolsResponse {
  items: InferencePool[]
  count: number
}

export function InferencePoolsPage() {
  const [inferencePools, setInferencePools] = useState<InferencePool[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPools, setExpandedPools] = useState<Set<string>>(new Set())
  const [copiedYaml, setCopiedYaml] = useState<string | null>(null)
  const { toast } = useToast()

  const fetchInferencePools = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/inferencepools')

      if (!response.ok) {
        throw new Error('Failed to fetch InferencePools')
      }

      const data: InferencePoolsResponse = await response.json()
      setInferencePools(data.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchInferencePools()
  }, [])

  const toggleExpanded = (poolName: string) => {
    const newExpanded = new Set(expandedPools)
    if (newExpanded.has(poolName)) {
      newExpanded.delete(poolName)
    } else {
      newExpanded.add(poolName)
    }
    setExpandedPools(newExpanded)
  }

  const copyYamlToClipboard = async (pool: InferencePool) => {
    const yamlContent = `apiVersion: ${pool.apiVersion}
kind: ${pool.kind}
metadata:
  name: ${pool.metadata.name}
  namespace: ${pool.metadata.namespace}
  labels:
    app.kubernetes.io/name: kubefoundry
    app.kubernetes.io/instance: ${pool.metadata.labels['app.kubernetes.io/instance']}
    app.kubernetes.io/managed-by: kubefoundry
    kubefoundry.io/provider: ${pool.metadata.labels['kubefoundry.io/provider']}
spec:
  modelName: ${pool.spec.modelName}
  backend:
    service:
      name: ${pool.spec.backend.service.name}
      port: ${pool.spec.backend.service.port}
  loadBalancing:
    strategy: ${pool.spec.loadBalancing.strategy}`

    try {
      await navigator.clipboard.writeText(yamlContent)
      setCopiedYaml(pool.metadata.name)
      toast({
        title: 'Copied to clipboard',
        description: 'InferencePool YAML configuration copied successfully',
      })

      setTimeout(() => setCopiedYaml(null), 2000)
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      })
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-medium text-destructive">
          Failed to load InferencePools
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          {error}
        </p>
        <Button onClick={fetchInferencePools}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-7 w-7 text-primary" />
            InferencePools
          </h1>
          <p className="text-muted-foreground mt-1">
            Gateway API inference pool configurations for intelligent routing
            {!isLoading && inferencePools.length > 0 && (
              <span className="ml-2 text-foreground font-medium">
                · {inferencePools.length} pools
              </span>
            )}
          </p>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={fetchInferencePools}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCw className={`h-4 w-4 transition-transform ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin" />
        </div>
      ) : inferencePools.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Network className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No InferencePools Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Deploy models with Gateway Routing enabled to see InferencePools here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {inferencePools.map((pool) => {
            const isExpanded = expandedPools.has(pool.metadata.name)
            const isCopied = copiedYaml === pool.metadata.name

            return (
              <Card key={pool.metadata.name} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpanded(pool.metadata.name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg font-medium">
                        {pool.metadata.name}
                      </CardTitle>
                      <Badge variant="outline">
                        {pool.metadata.labels['kubefoundry.io/provider']}
                      </Badge>
                      <Badge
                        variant={pool._kubefoundry.phase === 'Running' ? 'default' : 'secondary'}
                      >
                        {pool._kubefoundry.phase}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          copyYamlToClipboard(pool)
                        }}
                        className="h-8 px-2"
                      >
                        {isCopied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Namespace: {pool.metadata.namespace} • Model: {pool.spec.modelName}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 border-t bg-muted/25">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="font-medium mb-2">Deployment Info</h4>
                          <dl className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Deployment:</dt>
                              <dd>{pool._kubefoundry.deploymentName}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Provider:</dt>
                              <dd>{pool._kubefoundry.provider}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Model ID:</dt>
                              <dd className="text-xs truncate max-w-48" title={pool._kubefoundry.modelId}>
                                {pool._kubefoundry.modelId}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Pool Configuration</h4>
                          <dl className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Backend Service:</dt>
                              <dd>{pool.spec.backend.service.name}:{pool.spec.backend.service.port}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Load Balancing:</dt>
                              <dd>{pool.spec.loadBalancing.strategy}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">API Version:</dt>
                              <dd>{pool.apiVersion}</dd>
                            </div>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
