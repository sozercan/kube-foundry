/**
 * Demo configuration
 * All timing parameters, URLs, and environment variables
 */

export const config = {
  // Azure OpenAI TTS settings
  azure: {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT ?? '',
    apiKey: process.env.AZURE_OPENAI_API_KEY ?? '',
    ttsDeployment: process.env.AZURE_OPENAI_TTS_DEPLOYMENT ?? 'gpt-4o-mini-tts',
    ttsVoice: 'onyx' as const, // Deep, authoritative, professional
    ttsSpeed: 1.0,
  },

  // KubeFoundry settings
  kubefoundry: {
    // Default to Vite dev server, use 3001 for production backend
    url: process.env.DEMO_KUBEFOUNDRY_URL ?? 'http://localhost:5173',
  },

  // Demo model
  model: {
    id: process.env.DEMO_MODEL ?? 'Qwen/Qwen3-0.6B',
    name: 'Qwen3-0.6B',
  },

  // Runtime to use in demo
  runtime: process.env.DEMO_RUNTIME ?? 'kaito',

  // Timing settings (milliseconds)
  timing: {
    typewriterSpeed: parseInt(process.env.DEMO_TYPEWRITER_SPEED ?? '50', 10),
    pauseShort: 500,
    pauseMedium: 1500,
    pauseLong: 3000,
    pauseVeryLong: 5000,
    waitForElement: 10000,
    waitForDeployment: 300000, // 5 minutes for model to deploy
  },

  // Browser settings
  browser: {
    headless: false,
    slowMo: 100, // Slow down actions for visibility
    viewport: { width: 1920, height: 1080 },
  },

  // Paths
  paths: {
    assets: './assets',
    tempAudio: '/tmp',
  },

  // Feature flags
  features: {
    skipNarration: process.env.DEMO_SKIP_NARRATION === 'true',
    skipCli: process.env.DEMO_SKIP_CLI === 'true',
    skipUi: process.env.DEMO_SKIP_UI === 'true',
    skipInstall: process.env.DEMO_SKIP_INSTALL === 'true',
    fastForward: process.env.DEMO_FAST_FORWARD === 'true',
  },
} as const;

/**
 * Validate required configuration
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.features.skipNarration) {
    if (!config.azure.endpoint) {
      errors.push('AZURE_OPENAI_ENDPOINT environment variable is required for TTS');
    }
    if (!config.azure.apiKey) {
      errors.push('AZURE_OPENAI_API_KEY environment variable is required for TTS');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export type Config = typeof config;
