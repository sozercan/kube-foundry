/**
 * Cloud Provider Pricing Service
 *
 * Fetches real-time pricing from cloud provider APIs.
 * Currently supports:
 * - Azure Retail Prices API (no auth required)
 * - AWS Pricing API (requires credentials - TODO)
 * - GCP Cloud Billing Catalog API (requires credentials - TODO)
 */

import { logger } from '../lib/logger';

// Cache pricing data to avoid excessive API calls
interface PricingCache {
  data: Map<string, CachedPrice>;
  ttlMs: number;
}

interface CachedPrice {
  price: InstancePrice;
  fetchedAt: number;
}

export interface InstancePrice {
  instanceType: string;
  provider: 'azure' | 'aws' | 'gcp';
  region: string;
  hourlyPrice: number;
  currency: string;
  priceType: 'ondemand' | 'spot' | 'reserved';
  gpuCount?: number;
  gpuModel?: string;
  vcpus?: number;
  memoryGb?: number;
  lastUpdated: Date;
}

export interface PricingLookupResult {
  success: boolean;
  price?: InstancePrice;
  error?: string;
  cached?: boolean;
}

// Azure Retail Prices API response types
interface AzurePriceItem {
  currencyCode: string;
  tierMinimumUnits: number;
  retailPrice: number;
  unitPrice: number;
  armRegionName: string;
  location: string;
  effectiveStartDate: string;
  meterId: string;
  meterName: string;
  productId: string;
  skuId: string;
  productName: string;
  skuName: string;
  serviceName: string;
  serviceId: string;
  serviceFamily: string;
  unitOfMeasure: string;
  type: string;
  isPrimaryMeterRegion: boolean;
  armSkuName: string;
}

interface AzurePriceResponse {
  BillingCurrency: string;
  CustomerEntityId: string;
  CustomerEntityType: string;
  Items: AzurePriceItem[];
  NextPageLink: string | null;
  Count: number;
}

// GPU info extracted from instance types
const AZURE_GPU_INFO: Record<string, { gpuCount: number; gpuModel: string }> = {
  // NV A10 series
  Standard_NV6ads_A10_v5: { gpuCount: 0.167, gpuModel: 'A10' }, // 1/6 GPU
  Standard_NV12ads_A10_v5: { gpuCount: 0.333, gpuModel: 'A10' }, // 1/3 GPU
  Standard_NV18ads_A10_v5: { gpuCount: 0.5, gpuModel: 'A10' }, // 1/2 GPU
  Standard_NV36ads_A10_v5: { gpuCount: 1, gpuModel: 'A10' },
  Standard_NV72ads_A10_v5: { gpuCount: 2, gpuModel: 'A10' },
  // NC A100 series
  Standard_NC24ads_A100_v4: { gpuCount: 1, gpuModel: 'A100-80GB' },
  Standard_NC48ads_A100_v4: { gpuCount: 2, gpuModel: 'A100-80GB' },
  Standard_NC96ads_A100_v4: { gpuCount: 4, gpuModel: 'A100-80GB' },
  // NC H100 series
  Standard_NC40ads_H100_v5: { gpuCount: 1, gpuModel: 'H100' },
  Standard_NC80adis_H100_v5: { gpuCount: 2, gpuModel: 'H100' },
  // ND A100 series
  Standard_ND96asr_A100_v4: { gpuCount: 8, gpuModel: 'A100-40GB' },
  Standard_ND96amsr_A100_v4: { gpuCount: 8, gpuModel: 'A100-80GB' },
  // ND H100 series
  Standard_ND96isr_H100_v5: { gpuCount: 8, gpuModel: 'H100' },
  // NC T4 series
  Standard_NC4as_T4_v3: { gpuCount: 1, gpuModel: 'T4' },
  Standard_NC8as_T4_v3: { gpuCount: 1, gpuModel: 'T4' },
  Standard_NC16as_T4_v3: { gpuCount: 1, gpuModel: 'T4' },
  Standard_NC64as_T4_v3: { gpuCount: 4, gpuModel: 'T4' },
  // NC V100 series
  Standard_NC6s_v3: { gpuCount: 1, gpuModel: 'V100' },
  Standard_NC12s_v3: { gpuCount: 2, gpuModel: 'V100' },
  Standard_NC24s_v3: { gpuCount: 4, gpuModel: 'V100' },
  Standard_NC24rs_v3: { gpuCount: 4, gpuModel: 'V100' },
};

class CloudPricingService {
  private cache: PricingCache = {
    data: new Map(),
    ttlMs: 60 * 60 * 1000, // 1 hour cache
  };

  /**
   * Look up real-time pricing for an instance type
   */
  async getInstancePrice(
    instanceType: string,
    provider: 'azure' | 'aws' | 'gcp',
    region?: string
  ): Promise<PricingLookupResult> {
    const cacheKey = `${provider}:${instanceType}:${region || 'default'}`;

    // Check cache first
    const cached = this.cache.data.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < this.cache.ttlMs) {
      return { success: true, price: cached.price, cached: true };
    }

    try {
      let price: InstancePrice | undefined;

      switch (provider) {
        case 'azure':
          price = await this.fetchAzurePrice(instanceType, region);
          break;
        case 'aws':
          // TODO: Implement AWS pricing lookup
          return {
            success: false,
            error: 'AWS pricing API not yet implemented',
          };
        case 'gcp':
          // TODO: Implement GCP pricing lookup
          return {
            success: false,
            error: 'GCP pricing API not yet implemented',
          };
      }

      if (price) {
        // Cache the result
        this.cache.data.set(cacheKey, {
          price,
          fetchedAt: Date.now(),
        });
        return { success: true, price, cached: false };
      }

      return { success: false, error: 'Price not found' };
    } catch (error) {
      logger.error({ error, instanceType, provider }, 'Failed to fetch pricing');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Fetch pricing from Azure Retail Prices API
   * https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices
   */
  private async fetchAzurePrice(
    instanceType: string,
    region?: string
  ): Promise<InstancePrice | undefined> {
    // Build filter query
    // We want Linux VM consumption (pay-as-you-go) pricing
    let filter = `armSkuName eq '${instanceType}' and priceType eq 'Consumption' and contains(meterName, 'Spot') eq false`;

    if (region) {
      filter += ` and armRegionName eq '${region}'`;
    }

    const url = `https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}`;

    logger.debug({ url, instanceType, region }, 'Fetching Azure pricing');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Azure pricing API returned ${response.status}: ${response.statusText}`);
    }

    const data: AzurePriceResponse = await response.json();

    if (data.Items.length === 0) {
      logger.warn({ instanceType, region }, 'No pricing found for instance type');
      return undefined;
    }

    // Find the Linux VM price (not Windows, not Low Priority/Spot)
    const linuxPrice = data.Items.find(
      (item) =>
        item.productName.includes('Virtual Machines') &&
        !item.productName.includes('Windows') &&
        !item.meterName.includes('Low Priority') &&
        !item.meterName.includes('Spot') &&
        item.unitOfMeasure === '1 Hour'
    );

    if (!linuxPrice) {
      // Fall back to first item if no Linux-specific price found
      const fallback = data.Items.find((item) => item.unitOfMeasure === '1 Hour');
      if (!fallback) {
        logger.warn({ instanceType, items: data.Items.length }, 'No hourly price found');
        return undefined;
      }
      return this.mapAzurePriceToInstancePrice(fallback, instanceType);
    }

    return this.mapAzurePriceToInstancePrice(linuxPrice, instanceType);
  }

  private mapAzurePriceToInstancePrice(
    item: AzurePriceItem,
    instanceType: string
  ): InstancePrice {
    const gpuInfo = AZURE_GPU_INFO[instanceType];

    return {
      instanceType,
      provider: 'azure',
      region: item.armRegionName,
      hourlyPrice: item.retailPrice,
      currency: item.currencyCode,
      priceType: 'ondemand',
      gpuCount: gpuInfo?.gpuCount,
      gpuModel: gpuInfo?.gpuModel,
      lastUpdated: new Date(item.effectiveStartDate),
    };
  }

  /**
   * Get pricing for all GPU node pools in the cluster
   */
  async getNodePoolPricing(
    nodePools: Array<{ name: string; instanceType?: string; region?: string }>
  ): Promise<Map<string, PricingLookupResult>> {
    const results = new Map<string, PricingLookupResult>();

    for (const pool of nodePools) {
      if (!pool.instanceType) {
        results.set(pool.name, {
          success: false,
          error: 'Instance type not available',
        });
        continue;
      }

      // Detect provider from instance type naming
      const provider = this.detectProvider(pool.instanceType);
      if (!provider) {
        results.set(pool.name, {
          success: false,
          error: `Unknown provider for instance type: ${pool.instanceType}`,
        });
        continue;
      }

      const result = await this.getInstancePrice(pool.instanceType, provider, pool.region);
      results.set(pool.name, result);
    }

    return results;
  }

  /**
   * Detect cloud provider from instance type naming convention
   */
  detectProvider(instanceType: string): 'azure' | 'aws' | 'gcp' | undefined {
    // Azure: Standard_*, Basic_*
    if (instanceType.startsWith('Standard_') || instanceType.startsWith('Basic_')) {
      return 'azure';
    }

    // AWS: starts with letter+number (p4d.24xlarge, g5.xlarge, etc.)
    if (/^[a-z][0-9]/.test(instanceType.toLowerCase())) {
      return 'aws';
    }

    // GCP: contains dashes (n1-standard-4, a2-highgpu-1g, etc.)
    if (instanceType.includes('-') && !instanceType.startsWith('Standard_')) {
      return 'gcp';
    }

    return undefined;
  }

  /**
   * Clear the pricing cache
   */
  clearCache(): void {
    this.cache.data.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.data.size,
      ttlMs: this.cache.ttlMs,
    };
  }
}

export const cloudPricingService = new CloudPricingService();
