#!/usr/bin/env bun
/**
 * KubeFoundry Demo - Main Orchestrator
 * Runs the complete automated demo with CLI and UI phases
 */

import { config, validateConfig } from './config';
import { log, pause, formatDuration } from './utils';
import { runCliPhase, runCliPhaseOnly } from './cli-phase';
import { runUiPhase, runUiPhaseOnly } from './ui-phase';
import { checkTtsAvailable, narrate } from './narration';

/**
 * Parse command-line arguments
 */
function parseArgs(): {
  cliOnly: boolean;
  uiOnly: boolean;
  narrationOnly: boolean;
  fastForward: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  const fastForward = args.includes('--fast') || args.includes('-f');
  
  // If fast-forward, also set the env var so config picks it up
  if (fastForward) {
    process.env.DEMO_FAST_FORWARD = 'true';
    process.env.DEMO_SKIP_NARRATION = 'true';
  }
  
  return {
    cliOnly: args.includes('--cli-only'),
    uiOnly: args.includes('--ui-only'),
    narrationOnly: args.includes('--narration-only'),
    fastForward,
    help: args.includes('--help') || args.includes('-h'),
  };
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
KubeFoundry Demo Automation
===========================

Usage: bun run start [options]

Options:
  --cli-only        Run only the CLI phase (terminal automation)
  --ui-only         Run only the UI phase (Playwright automation)
  --narration-only  Test narration system only
  --fast, -f        Fast-forward mode (skip pauses and narration)
  --help, -h        Show this help message

Environment Variables:
  AZURE_OPENAI_ENDPOINT       Azure OpenAI endpoint URL (required for TTS)
  AZURE_OPENAI_API_KEY        Azure OpenAI API key (required for TTS)
  AZURE_OPENAI_TTS_DEPLOYMENT TTS model deployment name (default: gpt-4o-mini-tts)
  
  DEMO_KUBEFOUNDRY_URL        KubeFoundry URL (default: http://localhost:3001)
  DEMO_MODEL                  Model to deploy (default: Qwen/Qwen3-0.6B)
  DEMO_RUNTIME                Runtime to use (default: kaito)
  DEMO_TYPEWRITER_SPEED       Typewriter effect speed in ms (default: 50)
  
  DEMO_SKIP_NARRATION         Skip TTS narration (default: false)
  DEMO_SKIP_CLI               Skip CLI phase (default: false)
  DEMO_SKIP_UI                Skip UI phase (default: false)
  DEMO_SKIP_INSTALL           Skip runtime installation (default: false)
  DEMO_FAST_FORWARD           Fast-forward mode, minimal pauses (default: false)

Examples:
  # Run full demo
  bun run start
  
  # Run CLI phase only
  bun run start --cli-only
  
  # Run without TTS (for testing)
  DEMO_SKIP_NARRATION=true bun run start
  
  # Run with custom model
  DEMO_MODEL=microsoft/phi-3-mini-4k bun run start
`);
}

/**
 * Test narration system
 */
async function testNarration(): Promise<void> {
  log.phase('NARRATION TEST');

  const available = await checkTtsAvailable();
  if (!available) {
    log.error('TTS is not available. Check Azure OpenAI credentials.');
    return;
  }

  log.success('TTS is available');
  log.step('Playing test narration...');

  await narrate('intro');

  log.success('Narration test complete');
}

/**
 * Pre-flight checks
 */
async function preflightChecks(): Promise<boolean> {
  log.phase('PRE-FLIGHT CHECKS');

  // Validate configuration
  const { valid, errors } = validateConfig();
  if (!valid && !config.features.skipNarration) {
    for (const error of errors) {
      log.warning(error);
    }
    log.info('Continuing without TTS narration');
  }

  // Check TTS availability
  if (!config.features.skipNarration) {
    log.step('Checking TTS availability...');
    const ttsAvailable = await checkTtsAvailable();
    if (ttsAvailable) {
      log.success('TTS is available');
    } else {
      log.warning('TTS is not available, narration will be text-only');
    }
  }

  // Check if KubeFoundry is running (for UI phase)
  if (!config.features.skipUi) {
    log.step('Checking KubeFoundry availability...');
    try {
      // Try the page itself - works for both dev server and production
      const response = await fetch(config.kubefoundry.url);
      if (response.ok) {
        log.success(`KubeFoundry is running at ${config.kubefoundry.url}`);
      } else {
        log.warning(`KubeFoundry returned status ${response.status}`);
      }
    } catch (error) {
      log.error(`Cannot reach KubeFoundry at ${config.kubefoundry.url}`);
      log.info('Make sure KubeFoundry is running: bun run dev (in the root directory)');
      return false;
    }
  }

  // Check for required YAML files
  if (!config.features.skipCli) {
    log.step('Checking demo assets...');
    const requiredFiles = [
      'kuberay-rayservice.yaml',
      'dynamo-deployment.yaml',
      'kaito-workspace.yaml',
    ];

    for (const file of requiredFiles) {
      const filepath = `${config.paths.assets}/${file}`;
      const exists = await Bun.file(filepath).exists();
      if (!exists) {
        log.error(`Missing required file: ${filepath}`);
        return false;
      }
    }
    log.success('All demo assets found');
  }

  log.success('Pre-flight checks passed');
  return true;
}

/**
 * Run the complete demo
 */
async function runDemo(): Promise<void> {
  const startTime = Date.now();

  log.phase('KUBEFOUNDRY DEMO');
  log.info(`Model: ${config.model.id}`);
  log.info(`Runtime: ${config.runtime}`);
  log.info(`URL: ${config.kubefoundry.url}`);
  console.log();

  // Pre-flight checks
  const checksPass = await preflightChecks();
  if (!checksPass) {
    log.error('Pre-flight checks failed. Exiting.');
    process.exit(1);
  }

  await pause(config.timing.pauseMedium);

  // Run phases
  try {
    // Phase 1: CLI (The Problem)
    if (!config.features.skipCli) {
      await runCliPhase();
      await pause(config.timing.pauseLong);
    }

    // Phase 2: UI (The Solution)
    if (!config.features.skipUi) {
      await runUiPhase();
    }

    const duration = Date.now() - startTime;
    log.phase('DEMO COMPLETE');
    log.success(`Total duration: ${formatDuration(duration)}`);
  } catch (error) {
    log.error(`Demo failed: ${error}`);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return;
  }

  if (args.narrationOnly) {
    await testNarration();
    return;
  }

  if (args.cliOnly) {
    await runCliPhaseOnly();
    return;
  }

  if (args.uiOnly) {
    await runUiPhaseOnly();
    return;
  }

  // Run full demo
  await runDemo();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log.warning('Interrupted. Cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.warning('Terminated. Cleaning up...');
  process.exit(0);
});

// Run
main().catch((error) => {
  log.error(`Fatal error: ${error}`);
  process.exit(1);
});
