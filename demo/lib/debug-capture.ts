/**
 * Debug Capture Utilities
 * Captures screenshots, DOM state, and console errors for debugging demo failures
 * Saves to workspace so Copilot agent can automatically access them
 */

import type { Page, ConsoleMessage } from 'playwright';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';

/**
 * Debug bundle directory - in workspace for Copilot visibility
 * Falls back to /tmp if workspace path can't be determined
 */
const WORKSPACE_DEBUG_DIR = resolve(dirname(import.meta.dir), 'debug');
const FAILURES_FILE = resolve(WORKSPACE_DEBUG_DIR, 'FAILURES.md');

/**
 * Captured context for a failed step
 */
export interface DebugContext {
  step: string;
  timestamp: number;
  error: string;
  screenshotPath: string;
  visibleTestIds: string[];
  consoleLogs: ConsoleLogEntry[];
  url: string;
  viewport: { width: number; height: number };
}

/**
 * Console log entry
 */
export interface ConsoleLogEntry {
  type: 'log' | 'error' | 'warning' | 'info';
  text: string;
  timestamp: number;
}

/**
 * Console log collector - attaches to page and collects logs
 */
export class ConsoleCollector {
  private logs: ConsoleLogEntry[] = [];
  private page: Page | null = null;
  private handler: ((msg: ConsoleMessage) => void) | null = null;

  /**
   * Start collecting console logs from a page
   */
  attach(page: Page): void {
    this.page = page;
    this.logs = [];
    
    this.handler = (msg: ConsoleMessage) => {
      const type = msg.type() as ConsoleLogEntry['type'];
      // Only collect errors and warnings to reduce noise
      if (type === 'error' || type === 'warning') {
        this.logs.push({
          type,
          text: msg.text(),
          timestamp: Date.now(),
        });
      }
    };
    
    page.on('console', this.handler);
  }

  /**
   * Get collected logs and optionally clear
   */
  getLogs(clear = false): ConsoleLogEntry[] {
    const logs = [...this.logs];
    if (clear) {
      this.logs = [];
    }
    return logs;
  }

  /**
   * Detach from page
   */
  detach(): void {
    if (this.page && this.handler) {
      this.page.off('console', this.handler);
    }
    this.page = null;
    this.handler = null;
    this.logs = [];
  }
}

/**
 * Ensure debug directory exists
 */
function ensureDebugDir(): void {
  if (!existsSync(WORKSPACE_DEBUG_DIR)) {
    mkdirSync(WORKSPACE_DEBUG_DIR, { recursive: true });
  }
}

/**
 * Generate a safe filename from step name
 */
function safeFilename(step: string): string {
  return step
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Capture full debug context for a failed step
 */
export async function captureDebugContext(
  page: Page,
  step: string,
  error: Error,
  consoleLogs: ConsoleLogEntry[]
): Promise<DebugContext> {
  ensureDebugDir();
  
  const timestamp = Date.now();
  const filename = `${safeFilename(step)}-${timestamp}`;
  const screenshotPath = `${WORKSPACE_DEBUG_DIR}/${filename}.png`;
  
  // Capture screenshot
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (screenshotError) {
    console.error(`Failed to capture screenshot: ${screenshotError}`);
  }
  
  // Get all visible data-testid elements
  let visibleTestIds: string[] = [];
  try {
    visibleTestIds = await page.$$eval('[data-testid]', (elements) =>
      elements
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => el.getAttribute('data-testid') ?? '')
        .filter(Boolean)
    );
  } catch {
    // Page might be in a bad state
  }
  
  // Get viewport info
  const viewport = page.viewportSize() ?? { width: 0, height: 0 };
  
  const context: DebugContext = {
    step,
    timestamp,
    error: error.message,
    screenshotPath,
    visibleTestIds,
    consoleLogs,
    url: page.url(),
    viewport,
  };
  
  // Save context as JSON
  const contextPath = `${WORKSPACE_DEBUG_DIR}/${filename}.json`;
  try {
    await Bun.write(contextPath, JSON.stringify(context, null, 2));
  } catch (writeError) {
    console.error(`Failed to write debug context: ${writeError}`);
  }
  
  // Update FAILURES.md for Copilot agent visibility
  await updateFailuresMarkdown(context);
  
  return context;
}

/**
 * Format debug context for console output
 */
export function formatDebugContext(context: DebugContext): string {
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║                    DEBUG CAPTURE                              ║',
    '╠══════════════════════════════════════════════════════════════╣',
    `║ Step: ${context.step.padEnd(54)}║`,
    `║ Error: ${context.error.substring(0, 53).padEnd(53)}║`,
    `║ URL: ${context.url.substring(0, 55).padEnd(55)}║`,
    '╠══════════════════════════════════════════════════════════════╣',
    `║ Screenshot: ${context.screenshotPath.padEnd(48)}║`,
    '╠══════════════════════════════════════════════════════════════╣',
    '║ Visible test IDs:                                            ║',
  ];
  
  const testIds = context.visibleTestIds.slice(0, 10);
  for (const testId of testIds) {
    lines.push(`║   - ${testId.substring(0, 55).padEnd(55)}║`);
  }
  if (context.visibleTestIds.length > 10) {
    lines.push(`║   ... and ${context.visibleTestIds.length - 10} more`.padEnd(63) + '║');
  }
  
  if (context.consoleLogs.length > 0) {
    lines.push('╠══════════════════════════════════════════════════════════════╣');
    lines.push('║ Console errors/warnings:                                     ║');
    for (const log of context.consoleLogs.slice(-5)) {
      const prefix = log.type === 'error' ? '❌' : '⚠️';
      lines.push(`║ ${prefix} ${log.text.substring(0, 55).padEnd(55)}║`);
    }
  }
  
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push('Copilot agent can auto-analyze: open demo/debug/FAILURES.md');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Get the debug directory path
 */
export function getDebugDir(): string {
  return WORKSPACE_DEBUG_DIR;
}

/**
 * Get the failures markdown file path
 */
export function getFailuresFile(): string {
  return FAILURES_FILE;
}

/**
 * Update FAILURES.md with a new failure entry
 * This file is designed to be read by Copilot agent for automatic debugging
 */
async function updateFailuresMarkdown(context: DebugContext): Promise<void> {
  ensureDebugDir();
  
  const screenshotRelPath = context.screenshotPath.replace(WORKSPACE_DEBUG_DIR + '/', '');
  const jsonRelPath = screenshotRelPath.replace('.png', '.json');
  const timestamp = new Date(context.timestamp).toISOString();
  
  const entry = `
## Failure: ${context.step}

**Time:** ${timestamp}  
**Error:** \`${context.error}\`  
**URL:** ${context.url}

### Screenshot
![${context.step}](${screenshotRelPath})

### Context File
See [${jsonRelPath}](${jsonRelPath}) for full context.

### Visible Test IDs
${context.visibleTestIds.length > 0 ? context.visibleTestIds.map(id => `- \`${id}\``).join('\n') : '_None found_'}

### Console Errors
${context.consoleLogs.length > 0 ? context.consoleLogs.map(log => `- [${log.type}] ${log.text}`).join('\n') : '_None_'}

---
`;

  // Check if file exists and append, otherwise create with header
  let content = '';
  try {
    const file = Bun.file(FAILURES_FILE);
    if (await file.exists()) {
      content = await file.text();
    }
  } catch {
    // File doesn't exist yet
  }
  
  if (!content) {
    content = `# Demo Failures

This file is automatically generated when demo steps fail.
Copilot agent can read this file to understand and debug failures.

**Debug Directory:** \`demo/debug/\`

---
`;
  }
  
  // Append the new failure
  content += entry;
  
  await Bun.write(FAILURES_FILE, content);
}

/**
 * Clear all debug files and reset FAILURES.md
 * Call this at the start of a new demo run
 */
export async function clearDebugCaptures(): Promise<void> {
  ensureDebugDir();
  
  try {
    // Remove all files in debug directory
    const files = readdirSync(WORKSPACE_DEBUG_DIR);
    for (const file of files) {
      try {
        unlinkSync(resolve(WORKSPACE_DEBUG_DIR, file));
      } catch {
        // Ignore errors for individual files
      }
    }
  } catch {
    // Directory might not exist yet
  }
}

/**
 * Clean up old debug files (optional utility)
 */
export async function cleanDebugDir(): Promise<void> {
  ensureDebugDir();
  const files = await Bun.file(WORKSPACE_DEBUG_DIR).exists();
  // Could implement cleanup of files older than X hours
}
