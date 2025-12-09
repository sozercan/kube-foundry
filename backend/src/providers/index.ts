import type { Provider, ProviderInfo } from './types';
import { dynamoProvider } from './dynamo';
import { kuberayProvider } from './kuberay';
import logger from '../lib/logger';

// Re-export types
export * from './types';

/**
 * Provider Registry
 * Static registry of all available inference providers
 */
class ProviderRegistry {
  private providers: Map<string, Provider> = new Map();

  constructor() {
    // Register built-in providers
    this.register(dynamoProvider);
    this.register(kuberayProvider);
  }

  /**
   * Register a provider in the registry
   */
  register(provider: Provider): void {
    if (this.providers.has(provider.id)) {
      logger.warn({ providerId: provider.id }, `Provider '${provider.id}' is already registered. Overwriting.`);
    }
    this.providers.set(provider.id, provider);
  }

  /**
   * Get a provider by ID
   * @throws Error if provider not found
   */
  getProvider(id: string): Provider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider '${id}' not found. Available providers: ${this.listProviderIds().join(', ')}`);
    }
    return provider;
  }

  /**
   * Get a provider by ID, or undefined if not found
   */
  getProviderOrNull(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  /**
   * Check if a provider exists
   */
  hasProvider(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * List all registered providers
   */
  listProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * List provider IDs
   */
  listProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get provider info (metadata only) for all providers
   */
  listProviderInfo(): ProviderInfo[] {
    return this.listProviders().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      defaultNamespace: p.defaultNamespace,
    }));
  }

  /**
   * Get the default provider ID
   */
  getDefaultProviderId(): string {
    return 'dynamo';
  }
}

// Export singleton registry
export const providerRegistry = new ProviderRegistry();

// Convenience exports
export const getProvider = (id: string) => providerRegistry.getProvider(id);
export const listProviders = () => providerRegistry.listProviders();
export const listProviderInfo = () => providerRegistry.listProviderInfo();
