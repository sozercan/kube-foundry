/**
 * Shared utilities for demo automation
 */

import chalk from 'chalk';
import { config } from './config';

/**
 * Pause execution for specified milliseconds
 * In fast-forward mode, use minimal pause
 */
export function pause(ms: number): Promise<void> {
  const actualMs = config.features.fastForward ? Math.min(ms, 100) : ms;
  return new Promise((resolve) => setTimeout(resolve, actualMs));
}

/**
 * Short pause (500ms)
 */
export function shortPause(): Promise<void> {
  return pause(config.timing.pauseShort);
}

/**
 * Medium pause (1500ms)
 */
export function mediumPause(): Promise<void> {
  return pause(config.timing.pauseMedium);
}

/**
 * Long pause (3000ms)
 */
export function longPause(): Promise<void> {
  return pause(config.timing.pauseLong);
}

/**
 * Very long pause (5000ms)
 */
export function veryLongPause(): Promise<void> {
  return pause(config.timing.pauseVeryLong);
}

/**
 * Log with timestamp and color
 */
export const log = {
  info: (message: string) => {
    console.log(chalk.blue(`[INFO] ${message}`));
  },
  
  success: (message: string) => {
    console.log(chalk.green(`[SUCCESS] ${message}`));
  },
  
  warning: (message: string) => {
    console.log(chalk.yellow(`[WARNING] ${message}`));
  },
  
  error: (message: string) => {
    console.log(chalk.red(`[ERROR] ${message}`));
  },
  
  phase: (phase: string) => {
    console.log('');
    console.log(chalk.magenta.bold(`═══════════════════════════════════════`));
    console.log(chalk.magenta.bold(`  ${phase}`));
    console.log(chalk.magenta.bold(`═══════════════════════════════════════`));
    console.log('');
  },
  
  step: (step: string) => {
    console.log(chalk.cyan(`  → ${step}`));
  },
  
  narration: (text: string) => {
    // Show full narration text, wrapping if needed
    console.log(chalk.gray.italic(`  🎙️  "${text}"`));
  },
  
  command: (cmd: string) => {
    console.log(chalk.white.bgBlack(`  $ ${cmd}`));
  },
};

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Get estimated narration duration based on text length
 * Assumes ~150 words per minute speaking rate
 */
export function estimateNarrationDuration(text: string): number {
  const words = text.split(/\s+/).length;
  const wordsPerSecond = 150 / 60; // 2.5 words per second
  return Math.ceil((words / wordsPerSecond) * 1000);
}

/**
 * Clear terminal screen
 */
export function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0f');
}

/**
 * Move cursor to position
 */
export function moveCursor(row: number, col: number): void {
  process.stdout.write(`\x1B[${row};${col}H`);
}

/**
 * Print a horizontal divider
 */
export function divider(): void {
  console.log(chalk.gray('─'.repeat(60)));
}
