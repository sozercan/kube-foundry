import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Route, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { useToast } from '@/hooks/useToast'

interface HTTPRoute {
  apiVersion: string
  kind: string
  metadata: {
    name: string
    namespace: string
    labels: Record<string, string>
  }
  spec: {
    parentRefs: Array<{
      name: string
      namespace: string
    }>
    rules: Array<{
      matches: Array<{
        headers: Array<{
          type: string
          name: string
          value: string
        }>
      }>
      backendRefs: Array<{
        group: string
        kind: string
        name: string
      }>
    }>
  }
  _kubefoundry: {
    deploymentName: string
    deploymentNamespace: string
    provider: string
    modelId: string
    servedModelName?: string
    phase: string
    replicas: any
  }
}

interface HTTPRoutesResponse {
  items: HTTPRoute[]
  count: number
}

export function HTTPRoutesPage() {
  const [httpRoutes, setHttpRoutes] = useState<HTTPRoute[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set())
  const [copiedYaml, setCopiedYaml] = useState<string | null>(null)
  const { toast } = useToast()

  const fetchHTTPRoutes = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/httproutes')

      if (!response.ok) {
        throw new Error('Failed to fetch HTTPRoutes')
      }

      const data: HTTPRoutesResponse = await response.json()
      setHttpRoutes(data.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchHTTPRoutes()
  }, [])

  const toggleExpanded = (routeName: string) => {
    const newExpanded = new Set(expandedRoutes)
    if (newExpanded.has(routeName)) {
      newExpanded.delete(routeName)
    } else {
      newExpanded.add(routeName)
    }
    setExpandedRoutes(newExpanded)
  }

  const copyYamlToClipboard = async (route: HTTPRoute) => {
    const yamlContent = `apiVersion: ${route.apiVersion}
kind: ${route.kind}
metadata:
  name: ${route.metadata.name}
  namespace: ${route.metadata.namespace}
  labels:
    app.kubernetes.io/name: kubefoundry
    app.kubernetes.io/instance: ${route.metadata.labels['app.kubernetes.io/instance']}
    app.kubernetes.io/managed-by: kubefoundry
    kubefoundry.io/provider: ${route.metadata.labels['kubefoundry.io/provider']}
spec:
  parentRefs:
  - name: ${route.spec.parentRefs[0].name}
    namespace: ${route.spec.parentRefs[0].namespace}
  rules:
  - matches:
    - headers:
      - type: ${route.spec.rules[0].matches[0].headers[0].type}
        name: ${route.spec.rules[0].matches[0].headers[0].name}
        value: ${route.spec.rules[0].matches[0].headers[0].value}
    backendRefs:
    - group: ${route.spec.rules[0].backendRefs[0].group}
      kind: ${route.spec.rules[0].backendRefs[0].kind}
      name: ${route.spec.rules[0].backendRefs[0].name}`

    try {
      await navigator.clipboard.writeText(yamlContent)
      setCopiedYaml(route.metadata.name)
      toast({
        title: 'Copied to clipboard',
        description: 'HTTPRoute YAML configuration copied successfully',
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
          Failed to load HTTPRoutes
        </p>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          {error}
        </p>
        <Button onClick={fetchHTTPRoutes}>
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
            <Route className="h-7 w-7 text-primary" />
            HTTPRoutes
          </h1>
          <p className="text-muted-foreground mt-1">
            Gateway API routing configurations for intelligent model selection
            {!isLoading && httpRoutes.length > 0 && (
              <span className="ml-2 text-foreground font-medium">
                · {httpRoutes.length} routes
              </span>
            )}
          </p>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={fetchHTTPRoutes}
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
      ) : httpRoutes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Route className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No HTTPRoutes Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Deploy models with Gateway Routing enabled to see HTTPRoutes here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {httpRoutes.map((route) => {
            const isExpanded = expandedRoutes.has(route.metadata.name)
            const isCopied = copiedYaml === route.metadata.name
            const firstRule = route.spec.rules[0]
            const modelHeaderMatch = firstRule?.matches[0]?.headers[0]
            const backendRef = firstRule?.backendRefs[0]

            return (
              <Card key={route.metadata.name} className="overflow-hidden">
                <CardHeader
                  className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
                  onClick={() => toggleExpanded(route.metadata.name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg font-medium">
                        {route.metadata.name}
                      </CardTitle>
                      <Badge variant="outline">
                        {route.metadata.labels['kubefoundry.io/provider']}
                      </Badge>
                      <Badge
                        variant={route._kubefoundry.phase === 'Running' ? 'default' : 'secondary'}
                      >
                        {route._kubefoundry.phase}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          copyYamlToClipboard(route)
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
                    Namespace: {route.metadata.namespace} • Header Match: {modelHeaderMatch?.value}
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
                              <dd>{route._kubefoundry.deploymentName}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Provider:</dt>
                              <dd>{route._kubefoundry.provider}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Model ID:</dt>
                              <dd className="text-xs truncate max-w-48" title={route._kubefoundry.modelId}>
                                {route._kubefoundry.modelId}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">Route Configuration</h4>
                          <dl className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Gateway:</dt>
                              <dd>{route.spec.parentRefs[0].name} ({route.spec.parentRefs[0].namespace})</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Backend:</dt>
                              <dd>{backendRef?.name} ({backendRef?.kind})</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-muted-foreground">Header Match:</dt>
                              <dd>{modelHeaderMatch?.name}: {modelHeaderMatch?.value}</dd>
                            </div>
                          </dl>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium mb-2">Routing Rules</h4>
                        <div className="bg-background border rounded-md p-3 text-sm font-mono">
                          <div className="text-muted-foreground mb-1">
                            When request header matches:
                          </div>
                          <div className="text-green-600 font-medium">
                            {modelHeaderMatch?.name}: "{modelHeaderMatch?.value}"
                          </div>
                          <div className="text-muted-foreground mt-2 mb-1">
                            Route to:
                          </div>
                          <div className="text-blue-600 font-medium">
                            {backendRef?.kind}/{backendRef?.name}
                          </div>
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
