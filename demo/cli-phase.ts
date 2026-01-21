/**
 * CLI Phase - Terminal automation with typewriter effect
 * Demonstrates "the problem" of deploying LLMs on Kubernetes manually
 */

import chalk from 'chalk';
import { $ } from 'bun';
import { config } from './config';
import { pause, log, clearScreen, divider } from './utils';
import { narrate, speak } from './narration';

/**
 * Typewriter effect for displaying text character by character
 */
async function typewriter(text: string, speed = config.timing.typewriterSpeed): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    await pause(speed);
  }
  console.log(); // New line at end
}

/**
 * Display a command prompt and type a command
 */
async function typeCommand(cmd: string): Promise<void> {
  process.stdout.write(chalk.green('$ '));
  await typewriter(cmd, config.timing.typewriterSpeed);
  await pause(config.timing.pauseShort);
}

/**
 * Display file content with syntax highlighting for YAML
 */
async function displayYamlFile(filename: string): Promise<void> {
  const filepath = `${config.paths.assets}/${filename}`;
  const content = await Bun.file(filepath).text();

  // Count lines to show complexity
  const lines = content.split('\n').length;

  console.log(chalk.gray(`# ${filename} (${lines} lines)`));
  divider();

  // Display with basic YAML highlighting
  for (const line of content.split('\n')) {
    // Skip lines that are only comments (pain point annotations)
    if (line.trim().startsWith('#')) {
      // Check if it's a pain point annotation
      if (line.includes('PAIN POINT') || line.includes('Pain point') || line.includes('⚠️') || line.includes('🔴')) {
        console.log(chalk.red.bold(line));
        // Extra pause on pain points so viewer can read them
        await pause(800);
      } else {
        console.log(chalk.gray(line));
        await pause(30);
      }
    } else if (line.includes(':')) {
      // Highlight YAML keys
      const [key, ...rest] = line.split(':');
      const value = rest.join(':');
      console.log(chalk.cyan(key) + chalk.white(':') + chalk.yellow(value));
      await pause(25);
    } else {
      console.log(chalk.white(line));
      await pause(20);
    }
  }

  divider();
  console.log(chalk.gray(`End of ${filename}`));
  console.log();
}

/**
 * Simulate kubectl command with fake output
 */
async function simulateKubectl(cmd: string, output: string): Promise<void> {
  await typeCommand(`kubectl ${cmd}`);
  await pause(config.timing.pauseShort);
  console.log(output);
  await pause(config.timing.pauseMedium);
}

/**
 * Run the CLI phase of the demo
 */
export async function runCliPhase(): Promise<void> {
  log.phase('PHASE 1: THE PROBLEM');
  log.step('Showing the complexity of manual LLM deployment on Kubernetes');

  // Clear screen for dramatic effect
  clearScreen();

  // Introduction - wait for narration to complete fully
  await narrate('intro');
  await pause(config.timing.pauseLong);

  // Show NVIDIA Dynamo example (the most complex)
  log.step('Displaying NVIDIA Dynamo DynamoGraphDeployment YAML...');
  await typeCommand('cat dynamo-deployment.yaml');
  await displayYamlFile('dynamo-deployment.yaml');
  await narrate('dynamo');
  await pause(config.timing.pauseLong);

  // Try to apply Dynamo deployment
  log.step('Attempting to apply Dynamo deployment...');
  await narrate('apply_attempt');
  await pause(config.timing.pauseShort);

  await simulateKubectl(
    'apply -f dynamo-deployment.yaml',
    chalk.green('dynamographdeployment.dynamo.nvidia.com/llama-3-1-8b created')
  );

  // Show pending pods
  await simulateKubectl(
    'get pods -n dynamo -w',
    `NAME                                    READY   STATUS    RESTARTS   AGE\nllama-3-1-8b-worker-0                   0/1     ${chalk.yellow('Pending')}   0          5s\nllama-3-1-8b-frontend-0                 0/1     ${chalk.yellow('Pending')}   0          5s`
  );

  // Show describe output
  await simulateKubectl(
    'describe pod llama-3-1-8b-worker-0 -n dynamo | tail -20',
    `Events:\n  Type     Reason            Age   From               Message\n  ----     ------            ----  ----               -------\n  Warning  FailedScheduling  10s   default-scheduler  ${chalk.red('0/3 nodes are available:')}\n           ${chalk.red('3 Insufficient nvidia.com/gpu.')}\n           ${chalk.yellow('preemption: 0/3 nodes are available:')}\n           ${chalk.yellow('3 No preemption victims found for incoming pod.')}`
  );

  await narrate('pending_pods');
  await pause(config.timing.pauseLong);

  // Transition
  console.log();
  console.log(chalk.yellow.bold('━'.repeat(60)));
  console.log();

  await narrate('transition');
  await pause(config.timing.pauseVeryLong);

  log.success('CLI phase complete');
}

/**
 * Run CLI phase only (for testing)
 */
export async function runCliPhaseOnly(): Promise<void> {
  log.info('Running CLI phase only');
  await runCliPhase();
  log.success('Demo complete (CLI only)');
}
