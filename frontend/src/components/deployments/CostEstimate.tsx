import { useState, useEffect } from 'react'
import { DollarSign, Info, AlertCircle, Loader2, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { NodePoolInfo, NodePoolCostEstimate, CostBreakdown, CloudProvider } from '@/lib/api'
import { costsApi } from '@/lib/api'

// GPU pricing data (embedded for client-side calculation)
// This mirrors the backend pricing for instant UI updates
const GPU_PRICING: Record<string, { hourlyRate: { aws?: number; azure?: number; gcp?: number }; memoryGb: number }> = {
  'H100-80GB': { hourlyRate: { aws: 5.50, azure: 5.20, gcp: 5.35 }, memoryGb: 80 },
  'A100-80GB': { hourlyRate: { aws: 4.10, azure: 3.67, gcp: 3.93 }, memoryGb: 80 },
  'A100-40GB': { hourlyRate: { aws: 3.40, azure: 3.06, gcp: 3.22 }, memoryGb: 40 },
  'L40S': { hourlyRate: { aws: 1.85, azure: 1.70, gcp: 1.75 }, memoryGb: 48 },
  'L4': { hourlyRate: { aws: 0.81, azure: 0.75, gcp: 0.70 }, memoryGb: 24 },
  'A10G': { hourlyRate: { aws: 1.01, azure: 0.90, gcp: 0.95 }, memoryGb: 24 },
  'A10': { hourlyRate: { aws: 1.10, azure: 1.00, gcp: 1.05 }, memoryGb: 24 },
  'T4': { hourlyRate: { aws: 0.53, azure: 0.45, gcp: 0.35 }, memoryGb: 16 },
  'V100': { hourlyRate: { aws: 3.06, azure: 2.75, gcp: 2.48 }, memoryGb: 32 },
}

// GPU model aliases for normalization
const GPU_ALIASES: Record<string, string> = {
  'NVIDIA-H100-80GB-HBM3': 'H100-80GB',
  'NVIDIA-H100-SXM5-80GB': 'H100-80GB',
  'NVIDIA-H100-PCIe': 'H100-80GB',
  'H100': 'H100-80GB',
  'NVIDIA-A100-SXM4-80GB': 'A100-80GB',
  'NVIDIA-A100-80GB-PCIe': 'A100-80GB',
  'NVIDIA-A100-SXM4-40GB': 'A100-40GB',
  'NVIDIA-A100-PCIE-40GB': 'A100-40GB',
  'A100': 'A100-40GB',
  'NVIDIA-L40S': 'L40S',
  'NVIDIA-L4': 'L4',
  'NVIDIA-A10G': 'A10G',
  'NVIDIA-A10': 'A10',
  'Tesla-T4': 'T4',
  'NVIDIA-Tesla-T4': 'T4',
  'Tesla-V100-SXM2-16GB': 'V100',
  'Tesla-V100-SXM2-32GB': 'V100',
  'NVIDIA-V100': 'V100',
}

const HOURS_PER_MONTH = 730

/**
 * Normalize GPU model name from Kubernetes label to pricing key
 */
function normalizeGpuModel(gpuLabel: string | undefined): string {
  if (!gpuLabel) return 'A100-40GB' // Default

  // Check direct match
  if (GPU_PRICING[gpuLabel]) return gpuLabel

  // Check aliases
  if (GPU_ALIASES[gpuLabel]) return GPU_ALIASES[gpuLabel]

  // Try to find partial match
  for (const [alias, normalized] of Object.entries(GPU_ALIASES)) {
    if (gpuLabel.toLowerCase().includes(alias.toLowerCase())) {
      return normalized
    }
  }

  // Try to extract from common patterns
  const gpuFamilies = ['H100', 'A100', 'L40S', 'L4', 'A10G', 'A10', 'T4', 'V100']
  for (const family of gpuFamilies) {
    if (gpuLabel.toUpperCase().includes(family)) {
      // Check for memory suffix
      const memMatch = gpuLabel.match(/(\d+)\s*GB/i)
      if (memMatch) {
        const withMem = `${family}-${memMatch[1]}GB`
        if (GPU_PRICING[withMem]) return withMem
      }
      // Return first matching model
      for (const model of Object.keys(GPU_PRICING)) {
        if (model.startsWith(family)) return model
      }
    }
  }

  return 'A100-40GB' // Default fallback
}

/**
 * Calculate cost estimate for a given configuration
 */
function calculateCost(gpuModel: string, gpuCount: number, replicas: number): CostBreakdown | null {
  const normalizedModel = normalizeGpuModel(gpuModel)
  const pricing = GPU_PRICING[normalizedModel]

  if (!pricing) return null

  const totalGpus = gpuCount * replicas
  const rates = [pricing.hourlyRate.aws, pricing.hourlyRate.azure, pricing.hourlyRate.gcp].filter(
    (r): r is number => r !== undefined && r > 0
  )
  const avgRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0

  const hourly = avgRate * totalGpus
  const monthly = hourly * HOURS_PER_MONTH

  const byProvider: { provider: CloudProvider; hourly: number; monthly: number }[] = []
  if (pricing.hourlyRate.aws) byProvider.push({ provider: 'aws', hourly: pricing.hourlyRate.aws * totalGpus, monthly: pricing.hourlyRate.aws * totalGpus * HOURS_PER_MONTH })
  if (pricing.hourlyRate.azure) byProvider.push({ provider: 'azure', hourly: pricing.hourlyRate.azure * totalGpus, monthly: pricing.hourlyRate.azure * totalGpus * HOURS_PER_MONTH })
  if (pricing.hourlyRate.gcp) byProvider.push({ provider: 'gcp', hourly: pricing.hourlyRate.gcp * totalGpus, monthly: pricing.hourlyRate.gcp * totalGpus * HOURS_PER_MONTH })

  return {
    estimate: {
      hourly: Math.round(hourly * 100) / 100,
      monthly: Math.round(monthly * 100) / 100,
      currency: 'USD',
      source: 'static',
      confidence: byProvider.length >= 2 ? 'high' : 'medium',
    },
    perGpu: {
      hourly: Math.round(avgRate * 100) / 100,
      monthly: Math.round(avgRate * HOURS_PER_MONTH * 100) / 100,
    },
    totalGpus,
    gpuModel,
    normalizedGpuModel: normalizedModel,
    byProvider,
    notes: [
      'Prices are approximate on-demand rates',
      'Spot instances can be 60-80% cheaper',
    ],
  }
}

interface CostEstimateProps {
  /** Node pools with GPU info */
  nodePools?: NodePoolInfo[]
  /** Number of GPUs per replica */
  gpuCount: number
  /** Number of replicas */
  replicas: number
  /** Show compact version */
  compact?: boolean
  /** Additional CSS class */
  className?: string
}

/**
 * Display cost estimates for GPU deployments
 * Fetches real-time pricing from cloud provider APIs with static fallback
 */
export function CostEstimate({
  nodePools,
  gpuCount,
  replicas,
  compact = false,
  className = '',
}: CostEstimateProps) {
  const [nodePoolCosts, setNodePoolCosts] = useState<NodePoolCostEstimate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [pricingSource, setPricingSource] = useState<string>('')

  // Fetch real-time pricing from backend API
  useEffect(() => {
    if (!nodePools || nodePools.length === 0) return

    const fetchPricing = async () => {
      setIsLoading(true)
      try {
        const response = await costsApi.getNodePoolCosts(gpuCount, replicas)
        if (response.success && response.nodePoolCosts) {
          setNodePoolCosts(response.nodePoolCosts)
          setPricingSource((response as unknown as { pricingSource?: string }).pricingSource || 'static')
        }
      } catch (error) {
        console.error('Failed to fetch real-time pricing:', error)
        // Fall back to client-side static calculation
        const fallbackCosts = nodePools
          .filter((pool) => pool.gpuModel)
          .map((pool) => ({
            poolName: pool.name,
            gpuModel: pool.gpuModel!,
            availableGpus: pool.availableGpus ?? 0,
            costBreakdown: calculateCost(pool.gpuModel!, gpuCount, replicas)!,
          }))
          .filter((item) => item.costBreakdown !== null)
        setNodePoolCosts(fallbackCosts)
        setPricingSource('static-client')
      } finally {
        setIsLoading(false)
      }
    }

    fetchPricing()
  }, [nodePools, gpuCount, replicas])

  // If no pools with GPU info, show nothing
  if (!nodePools || nodePools.length === 0 || nodePoolCosts.length === 0) {
    if (isLoading) {
      return (
        <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading pricing...</span>
        </div>
      )
    }
    return null
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  // Helper to get best pricing (realtime preferred)
  const getBestPricing = (poolCost: NodePoolCostEstimate) => {
    if (poolCost.realtimePricing) {
      return {
        hourly: poolCost.realtimePricing.hourlyPrice,
        monthly: poolCost.realtimePricing.monthlyPrice,
        source: poolCost.realtimePricing.source,
        instanceType: poolCost.realtimePricing.instanceType,
        region: poolCost.realtimePricing.region,
      }
    }
    return {
      hourly: poolCost.costBreakdown.estimate.hourly,
      monthly: poolCost.costBreakdown.estimate.monthly,
      source: 'static' as const,
      instanceType: undefined,
      region: undefined,
    }
  }

  // Compact view - just show primary estimate
  if (compact) {
    const primaryCost = nodePoolCosts[0]
    if (!primaryCost) return null

    const pricing = getBestPricing(primaryCost)
    const isRealtime = pricing.source === 'realtime' || pricing.source === 'cached'

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 text-sm text-muted-foreground ${className}`}>
              {isRealtime && <Zap className="h-4 w-4 text-green-500" />}
              {!isRealtime && <DollarSign className="h-4 w-4" />}
              <span>
                ~{formatCurrency(pricing.hourly)}/hr
              </span>
              <span className="text-xs">
                ({formatCurrency(pricing.monthly)}/mo)
              </span>
              {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <p className="font-medium">
                {primaryCost.availableGpus} × {primaryCost.gpuModel}
              </p>
              {pricing.instanceType && (
                <p className="text-green-600 dark:text-green-400">
                  {pricing.instanceType} ({pricing.region})
                </p>
              )}
              <p>
                {isRealtime 
                  ? 'Real-time Azure pricing' 
                  : 'Based on average cloud provider rates'}
              </p>
              <p className="text-muted-foreground">Spot instances can be 60-80% cheaper</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Full view - show per-pool breakdown
  return (
    <Card className={className} data-testid="cost-estimate-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Estimated Cost
          {pricingSource.includes('realtime') && (
            <Badge variant="secondary" className="text-xs font-normal gap-1">
              <Zap className="h-3 w-3" />
              Live
            </Badge>
          )}
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  {pricingSource.includes('realtime')
                    ? 'Real-time pricing from Azure Retail Prices API. Reflects current on-demand VM costs.'
                    : 'Estimates based on average on-demand cloud rates.'}
                  {' '}Actual costs vary by commitment level. Spot instances can save 60-80%.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {nodePoolCosts.map((poolCost) => {
          const pricing = getBestPricing(poolCost)
          const isRealtime = pricing.source === 'realtime' || pricing.source === 'cached'
          const cost = poolCost.costBreakdown

          return (
            <div key={poolCost.poolName} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{poolCost.poolName}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {poolCost.gpuModel}
                  </Badge>
                  {isRealtime && (
                    <Badge variant="secondary" className="text-xs font-normal text-green-600 dark:text-green-400">
                      Live
                    </Badge>
                  )}
                </div>
              </div>

              {/* Instance type info for realtime pricing */}
              {pricing.instanceType && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Zap className="h-3 w-3 text-green-500" />
                  <span>{pricing.instanceType}</span>
                  {pricing.region && <span className="text-muted-foreground">({pricing.region})</span>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Hourly</p>
                  <p className="text-lg font-semibold" data-testid="hourly-cost">
                    {formatCurrency(pricing.hourly)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Monthly (24/7)</p>
                  <p className="text-lg font-semibold" data-testid="monthly-cost">
                    {formatCurrency(pricing.monthly)}
                  </p>
                </div>
              </div>

              {/* Show static provider breakdown only if no realtime pricing */}
              {!isRealtime && cost.byProvider && cost.byProvider.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1.5">By Provider (Static Estimates)</p>
                  <div className="flex flex-wrap gap-2">
                    {cost.byProvider.map((provider) => (
                      <Badge key={provider.provider} variant="secondary" className="text-xs font-normal">
                        {provider.provider.toUpperCase()}: {formatCurrency(provider.hourly)}/hr
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Low confidence warning */}
              {!isRealtime && cost.estimate.confidence === 'low' && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3 w-3" />
                  <span>Limited pricing data available for this GPU</span>
                </div>
              )}
            </div>
          )
        })}

        {/* Notes */}
        <div className="pt-2 border-t text-xs text-muted-foreground space-y-0.5">
          <p>• Spot/preemptible instances can save 60-80%</p>
          <p>• Reserved instances (1-3 yr) can save 30-60%</p>
          {pricingSource.includes('realtime') && (
            <p className="text-green-600 dark:text-green-400">• Prices from Azure Retail Prices API</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default CostEstimate
