/**
 * Resilient Action Wrapper
 * Wraps Playwright actions with retry logic and debug capture on failure
 */

import type { Page } from 'playwright';
import {
  captureDebugContext,
  formatDebugContext,
  ConsoleCollector,
  clearDebugCaptures,
  getDebugDir,
  getFailuresFile,
  type DebugContext,
} from './debug-capture';
import { config } from '../config';
import { log, pause } from '../utils';

/**
 * Resilient action options
 */
export interface ResilientActionOptions {
  /** Maximum number of retry attempts (default: 1) */
  maxRetries?: number;
  /** Extra wait time before retry in ms (default: 2000) */
  retryDelay?: number;
  /** Timeout for waiting for elements in ms (default: 30000) */
  timeout?: number;
  /** Whether to capture debug info on failure (default: true) */
  captureOnFailure?: boolean;
  /** Whether to throw after all retries fail (default: depends on DEMO_FAIL_FAST) */
  throwOnFailure?: boolean;
}

const DEFAULT_OPTIONS: Required<ResilientActionOptions> = {
  maxRetries: 1,
  retryDelay: 2000,
  timeout: 30000,
  captureOnFailure: true,
  throwOnFailure: config.features.failFast,
};

/**
 * Console collector instance - shared across all resilient actions
 */
let consoleCollector: ConsoleCollector | null = null;

/**
 * Initialize the console collector for a page
 * Call this once after launching the browser
 */
export async function initConsoleCollector(page: Page): Promise<void> {
  consoleCollector = new ConsoleCollector();
  consoleCollector.attach(page);
  log.step('Debug console collector initialized');
}

/**
 * Cleanup the console collector
 * Call this before closing the browser
 */
export function cleanupConsoleCollector(): void {
  if (consoleCollector) {
    consoleCollector.detach();
    consoleCollector = null;
  }
}

/**
 * Track all captured debug contexts for summary
 */
const capturedFailures: DebugContext[] = [];

/**
 * Get all captured failures
 */
export function getCapturedFailures(): DebugContext[] {
  return [...capturedFailures];
}

/**
 * Clear captured failures
 */
export function clearCapturedFailures(): void {
  capturedFailures.length = 0;
}

/**
 * Run an action with retry and debug capture
 */
export async function resilientAction<T>(
  page: Page,
  stepName: string,
  action: () => Promise<T>,
  options: ResilientActionOptions = {}
): Promise<T | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await action();
      return result;
    } catch (error) {
      const isLastAttempt = attempt === opts.maxRetries;
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      if (!isLastAttempt) {
        // Retry
        log.warning(`Step "${stepName}" failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), retrying...`);
        await pause(opts.retryDelay);
        continue;
      }
      
      // Final failure
      log.error(`Step "${stepName}" failed after ${opts.maxRetries + 1} attempts`);
      
      // Capture debug context
      if (opts.captureOnFailure) {
        const consoleLogs = consoleCollector?.getLogs(true) ?? [];
        const context = await captureDebugContext(page, stepName, errorObj, consoleLogs);
        capturedFailures.push(context);
        
        // Print debug info
        console.log(formatDebugContext(context));
      }
      
      // Throw or return null based on fail-fast setting
      if (opts.throwOnFailure) {
        throw errorObj;
      }
      
      log.warning(`Continuing demo (DEMO_FAIL_FAST=false)`);
      return null;
    }
  }
  
  // Should never reach here
  return null;
}

/**
 * Click an element with resilient retry
 */
export async function resilientClick(
  page: Page,
  testId: string,
  description: string,
  options: ResilientActionOptions = {}
): Promise<boolean> {
  const result = await resilientAction(
    page,
    `Click: ${description} (${testId})`,
    async () => {
      const selector = `[data-testid="${testId}"]`;
      await page.waitForSelector(selector, { 
        state: 'visible', 
        timeout: options.timeout ?? DEFAULT_OPTIONS.timeout 
      });
      await pause(200); // Brief pause for animations
      await page.click(selector);
      return true;
    },
    options
  );
  
  return result === true;
}

/**
 * Wait for an element with resilient retry
 */
export async function resilientWaitFor(
  page: Page,
  testId: string,
  description: string,
  options: ResilientActionOptions = {}
): Promise<boolean> {
  const result = await resilientAction(
    page,
    `Wait for: ${description} (${testId})`,
    async () => {
      const selector = `[data-testid="${testId}"]`;
      await page.waitForSelector(selector, { 
        state: 'visible', 
        timeout: options.timeout ?? DEFAULT_OPTIONS.timeout 
      });
      return true;
    },
    options
  );
  
  return result === true;
}

/**
 * Type into a field with resilient retry
 */
export async function resilientType(
  page: Page,
  testId: string,
  text: string,
  description: string,
  options: ResilientActionOptions = {}
): Promise<boolean> {
  const result = await resilientAction(
    page,
    `Type: ${description} (${testId})`,
    async () => {
      const selector = `[data-testid="${testId}"]`;
      await page.waitForSelector(selector, { 
        state: 'visible', 
        timeout: options.timeout ?? DEFAULT_OPTIONS.timeout 
      });
      await page.fill(selector, text);
      return true;
    },
    options
  );
  
  return result === true;
}

/**
 * Navigate to a page with resilient retry
 */
export async function resilientNavigate(
  page: Page,
  url: string,
  description: string,
  options: ResilientActionOptions = {}
): Promise<boolean> {
  const result = await resilientAction(
    page,
    `Navigate: ${description}`,
    async () => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      return true;
    },
    options
  );
  
  return result === true;
}

/**
 * Print summary of all failures at the end
 */
export function printFailureSummary(): void {
  if (capturedFailures.length === 0) {
    log.success('Demo completed with no captured failures');
    return;
  }
  
  const debugDir = getDebugDir();
  const failuresFile = getFailuresFile();
  
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    FAILURE SUMMARY                           ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║ Total failures: ${capturedFailures.length.toString().padEnd(44)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  
  for (const failure of capturedFailures) {
    console.log(`║ • ${failure.step.substring(0, 57).padEnd(57)}║`);
  }
  
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║ Debug files saved to: demo/debug/                            ║');
  console.log('║                                                              ║');
  console.log('║ Copilot agent can auto-analyze:                              ║');
  console.log('║   Open demo/debug/FAILURES.md in VS Code                     ║');
  console.log('║   Copilot will see screenshots + context automatically       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`📁 Full path: ${debugDir}`);
  console.log(`📄 Failures:  ${failuresFile}`);
  console.log('');
}
