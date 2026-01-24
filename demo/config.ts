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
    ttsInstructions: 'Speak in a calm, professional tone. Keep a consistent pace and energy level throughout. Avoid dramatic inflections or excitement.',
  },

  // KubeFoundry settings
  kubefoundry: {
    // Default to Vite dev server, use 3001 for production backend
    url: process.env.DEMO_KUBEFOUNDRY_URL ?? 'http://localhost:5173',
  },

  // Demo model for GPU (Dynamo)
  model: {
    id: process.env.DEMO_MODEL ?? 'Qwen/Qwen3-0.6B',
    name: 'Qwen3-0.6B',
  },

  // Demo model for CPU (KAITO with GGUF)
  modelCpu: {
    id: process.env.DEMO_MODEL_CPU ?? 'kaito/llama3.2-1b', // UI element test ID
    apiModel: 'llama-3.2-1b-instruct', // Model name for inference API calls
    name: 'Llama 3.2 1B',
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
    skipHfLogin: process.env.DEMO_SKIP_HF_LOGIN === 'true',
    fastForward: process.env.DEMO_FAST_FORWARD === 'true',
    /** If true, stop on first failure. If false, capture and continue. */
    failFast: process.env.DEMO_FAIL_FAST !== 'false', // Default true
    
    // Granular stage skip flags
    skipCleanup: process.env.DEMO_SKIP_CLEANUP === 'true',
    skipIntro: process.env.DEMO_SKIP_INTRO === 'true',
    skipSettings: process.env.DEMO_SKIP_SETTINGS === 'true',
    skipModelSearch: process.env.DEMO_SKIP_MODEL_SEARCH === 'true',
    skipAiConfigurator: process.env.DEMO_SKIP_AI_CONFIGURATOR === 'true',
    skipCostEstimate: process.env.DEMO_SKIP_COST_ESTIMATE === 'true',
    skipDynamoDeploy: process.env.DEMO_SKIP_DYNAMO_DEPLOY === 'true',
    skipDynamoInference: process.env.DEMO_SKIP_DYNAMO_INFERENCE === 'true',
    skipKaitoDeploy: process.env.DEMO_SKIP_KAITO_DEPLOY === 'true',
    skipKaitoInference: process.env.DEMO_SKIP_KAITO_INFERENCE === 'true',
  },

  // Debug/self-testing options
  debug: {
    /** Directory for debug captures (screenshots, context) - in workspace for Copilot */
    captureDir: process.env.DEMO_DEBUG_PATH ?? './debug',
    /** Number of retries before capturing failure (default: 1) */
    maxRetries: parseInt(process.env.DEMO_MAX_RETRIES ?? '1', 10),
    /** Delay between retries in ms (default: 2000) */
    retryDelay: parseInt(process.env.DEMO_RETRY_DELAY ?? '2000', 10),
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
