/**
 * UI Phase - Playwright browser automation
 * Demonstrates "the solution" using KubeFoundry
 */

import { chromium, type Browser, type Page } from 'playwright';
import chalk from 'chalk';
import { config } from './config';
import { pause, log, shortPause, mediumPause, longPause, veryLongPause } from './utils';
import { narrate, speak } from './narration';

let browser: Browser | null = null;
let page: Page | null = null;

/**
 * Check if KubeFoundry server is running
 */
async function checkServerRunning(): Promise<boolean> {
  try {
    // Try the page itself - works for both dev server and production
    const response = await fetch(config.kubefoundry.url);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Launch browser and navigate to KubeFoundry
 */
async function launchBrowser(): Promise<Page> {
  log.step('Launching browser...');

  // Check if server is running first
  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    throw new Error(
      `KubeFoundry server is not running at ${config.kubefoundry.url}. ` +
      `Please start the dev server first with 'bun run dev' in the root directory.`
    );
  }
  log.step('Server health check passed');

  browser = await chromium.launch({
    headless: config.browser.headless,
    slowMo: config.browser.slowMo,
  });
  log.step('Browser launched');

  const context = await browser.newContext({
    viewport: config.browser.viewport,
  });

  page = await context.newPage();
  log.step(`Navigating to ${config.kubefoundry.url}...`);
  
  await page.goto(config.kubefoundry.url);
  log.step('Page loaded, waiting for network idle...');
  
  await page.waitForLoadState('networkidle');
  log.step('Network idle, waiting for sidebar...');
  
  // Wait for the app to fully render - look for the sidebar
  try {
    await page.waitForSelector('[data-testid="nav-models"]', { state: 'visible', timeout: 30000 });
    log.step('Sidebar found');
  } catch (error) {
    // Take debug screenshot
    const debugPath = `/tmp/demo-debug-launch-${Date.now()}.png`;
    await page.screenshot({ path: debugPath, fullPage: true });
    log.error(`Sidebar not found. Debug screenshot: ${debugPath}`);
    
    // Log page content for debugging
    const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
    log.error(`Page body preview: ${bodyHtml}`);
    throw error;
  }

  log.success('Browser launched and KubeFoundry loaded');
  return page;
}

/**
 * Close browser
 */
async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    log.step('Browser closed');
  }
}

/**
 * Wait for element and click it
 */
async function clickElement(testId: string, description: string): Promise<void> {
  if (!page) throw new Error('Browser not initialized');

  log.step(`Clicking: ${description}`);
  const selector = `[data-testid="${testId}"]`;
  
  try {
    // Wait for element to be visible and stable
    await page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
    await pause(200); // Brief pause for any animations to settle
    await page.click(selector);
    await shortPause();
  } catch (error) {
    // Take a debug screenshot on failure
    const debugPath = `/tmp/demo-debug-click-${testId}-${Date.now()}.png`;
    await page.screenshot({ path: debugPath, fullPage: true });
    log.error(`Click failed on ${testId}. Debug screenshot saved to: ${debugPath}`);
    
    // Also log what elements ARE visible
    const allTestIds = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid]');
      return Array.from(elements).map(el => el.getAttribute('data-testid'));
    });
    log.info(`Visible data-testid elements: ${allTestIds.join(', ')}`);
    
    throw error;
  }
}

/**
 * Wait for element to be visible
 */
async function waitForElement(testId: string, description: string): Promise<void> {
  if (!page) throw new Error('Browser not initialized');

  log.step(`Waiting for: ${description}`);
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
}

/**
 * Type into an input field
 */
async function typeIntoField(testId: string, text: string, description: string): Promise<void> {
  if (!page) throw new Error('Browser not initialized');

  log.step(`Typing into: ${description}`);
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
  await page.fill(selector, text);
  await shortPause();
}

/**
 * Take a screenshot for reference
 */
async function screenshot(name: string): Promise<void> {
  if (!page) return;

  const filepath = `${config.paths.tempAudio}/screenshot-${name}-${Date.now()}.png`;
  await page.screenshot({ path: filepath });
  log.step(`Screenshot saved: ${filepath}`);
}

/**
 * Navigate to a page using sidebar navigation
 */
async function navigateTo(navItem: 'models' | 'deployments' | 'settings'): Promise<void> {
  log.step(`Navigating to ${navItem}...`);
  
  try {
    await clickElement(`nav-${navItem}`, `${navItem} navigation`);
    await mediumPause();
  } catch (error) {
    // Take a debug screenshot on failure
    if (page) {
      const debugPath = `/tmp/demo-debug-nav-${navItem}-${Date.now()}.png`;
      await page.screenshot({ path: debugPath });
      log.error(`Navigation failed. Debug screenshot saved to: ${debugPath}`);
    }
    throw error;
  }
}

/**
 * Install a runtime from the Settings page
 */
async function installRuntime(runtimeId: string): Promise<void> {
  log.step(`Installing runtime: ${runtimeId}`);

  // First, click on the runtime card to select it
  try {
    await clickElement(`runtime-card-${runtimeId}`, `Select ${runtimeId} runtime`);
    await shortPause();
  } catch {
    log.info(`Runtime card ${runtimeId} not found or already selected`);
  }

  // Check if already installed by looking at CRD and Operator status
  try {
    const crdSelector = `[data-testid="runtime-crd-status-${runtimeId}"]`;
    const operatorSelector = `[data-testid="runtime-operator-status-${runtimeId}"]`;
    
    const crdElement = await page?.$(crdSelector);
    const operatorElement = await page?.$(operatorSelector);
    
    if (crdElement && operatorElement) {
      const crdStatus = await crdElement.getAttribute('data-status');
      const operatorStatus = await operatorElement.getAttribute('data-status');
      
      if (crdStatus === 'installed' && operatorStatus === 'installed') {
        log.info(`Runtime ${runtimeId} is already installed (CRD and Operator both green)`);
        return;
      }
    }
  } catch {
    // Status elements might not exist, continue with install
  }

  // Click install button
  await clickElement(`runtime-install-${runtimeId}`, `Install ${runtimeId}`);

  // Wait for installation to complete - wait for both CRD and Operator to be green
  log.step('Waiting for CRD and Operator to be installed...');
  const startTime = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes

  while (Date.now() - startTime < timeout) {
    try {
      const crdSelector = `[data-testid="runtime-crd-status-${runtimeId}"]`;
      const operatorSelector = `[data-testid="runtime-operator-status-${runtimeId}"]`;
      
      const crdElement = await page?.$(crdSelector);
      const operatorElement = await page?.$(operatorSelector);
      
      if (crdElement && operatorElement) {
        const crdStatus = await crdElement.getAttribute('data-status');
        const operatorStatus = await operatorElement.getAttribute('data-status');
        
        log.step(`  CRD: ${crdStatus}, Operator: ${operatorStatus}`);
        
        if (crdStatus === 'installed' && operatorStatus === 'installed') {
          log.success(`Runtime ${runtimeId} installed successfully (CRD and Operator both green)`);
          return;
        }
      }
    } catch {
      // Continue waiting
    }
    await pause(3000); // Check every 3 seconds
  }

  log.warning(`Runtime installation timed out after ${timeout / 1000}s`);
}

/**
 * Deploy a model using the UI
 */
async function deployModel(modelId: string, runtimeId: string): Promise<void> {
  log.step(`Deploying model: ${modelId} with runtime: ${runtimeId}`);

  // Click deploy button on model card
  // The testId uses the model.id which contains slashes like Qwen/Qwen3-0.6B
  // We need to escape the selector properly
  if (!page) throw new Error('Browser not initialized');
  
  const selector = `[data-testid="model-deploy-button-${modelId}"]`;
  log.step(`Looking for deploy button: ${selector}`);
  
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout: 30000 });
    await pause(200);
    await page.click(selector);
    await shortPause();
  } catch (error) {
    // Take a debug screenshot on failure
    const debugPath = `/tmp/demo-debug-deploy-${Date.now()}.png`;
    await page.screenshot({ path: debugPath, fullPage: true });
    log.error(`Deploy button not found. Debug screenshot: ${debugPath}`);
    
    // Log available model cards
    const modelCards = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid^="model-deploy-button-"]');
      return Array.from(elements).map(el => el.getAttribute('data-testid'));
    });
    log.info(`Available deploy buttons: ${modelCards.join(', ')}`);
    
    throw error;
  }

  await mediumPause();

  // Select runtime
  await clickElement(`deploy-runtime-option-${runtimeId}`, `Select ${runtimeId} runtime`);
  await shortPause();

  // Click deploy button
  await clickElement('deploy-submit-button', 'Create Deployment');
  await mediumPause();
}

/**
 * Wait for any deployment to reach Running state
 */
async function waitForDeploymentRunning(): Promise<void> {
  log.step('Waiting for deployment to reach Running state...');

  const startTime = Date.now();
  const timeout = config.timing.waitForDeployment;

  while (Date.now() - startTime < timeout) {
    try {
      // Look for any deployment status that shows "Running"
      if (page) {
        const runningElements = await page.$$('[data-testid^="deployment-status-"]');
        for (const el of runningElements) {
          const statusText = await el.textContent();
          if (statusText?.toLowerCase().includes('running')) {
            log.success('Deployment is now Running!');
            return;
          }
          log.step(`  Current status: ${statusText}`);
        }
      }
    } catch {
      // Continue waiting
    }
    await pause(5000); // Check every 5 seconds
  }

  log.warning(`Deployment did not reach Running state within ${timeout / 1000}s`);
}

/**
 * Run port-forward and send a chat request from terminal
 * Uses kubectl to find the correct service directly
 */
async function runPortForwardAndChat(): Promise<void> {
  log.step('Running port-forward and chat request in terminal...');
  
  const localPort = 8000;
  
  // Use kubectl to find the service directly - this is the most reliable approach
  log.step('Finding inference service via kubectl...');
  
  let serviceName = '';
  let namespace = '';
  let remotePort = '8000';
  
  try {
    // Get all services and find ones matching our model
    const result = Bun.spawnSync(['kubectl', 'get', 'svc', '-A', '-o', 'json']);
    if (result.exitCode === 0) {
      const data = JSON.parse(result.stdout.toString());
      
      for (const svc of data.items || []) {
        const name = svc.metadata?.name || '';
        const ns = svc.metadata?.namespace || '';
        const port = svc.spec?.ports?.[0]?.port?.toString() || '8000';
        
        // Priority 1: Dynamo frontend (not disaggregated -d or -p variants)
        if (name.includes('qwen3') && name.endsWith('-frontend') && !name.endsWith('-d') && !name.endsWith('-p')) {
          serviceName = name;
          namespace = ns;
          remotePort = port;
          log.step(`Found Dynamo frontend: ${ns}/${name}:${port}`);
          break;
        }
        
        // Priority 2: KAITO vLLM service
        if (!serviceName && name.includes('qwen3') && name.endsWith('-vllm')) {
          serviceName = name;
          namespace = ns;
          remotePort = port;
          log.step(`Found KAITO vLLM: ${ns}/${name}:${port}`);
        }
        
        // Priority 3: Any qwen3 service that's not headless
        if (!serviceName && name.includes('qwen3') && !name.includes('headless')) {
          serviceName = name;
          namespace = ns;
          remotePort = port;
        }
      }
    }
  } catch (error) {
    log.error(`kubectl failed: ${error}`);
  }
  
  if (!serviceName) {
    console.log('\n');
    console.log(chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold('  LIVE INFERENCE TEST'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log();
    console.log(chalk.yellow('⚠ ') + chalk.white('No matching service found - deployment may still be initializing'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log();
    await longPause();
    return;
  }
  
  // This will print to the terminal where the demo is running
  console.log('\n');
  console.log(chalk.cyan('═'.repeat(60)));
  console.log(chalk.cyan.bold('  LIVE INFERENCE TEST'));
  console.log(chalk.cyan('═'.repeat(60)));
  console.log();
  
  // Show the port-forward command
  const portForwardCmd = `kubectl port-forward svc/${serviceName} ${localPort}:${remotePort} -n ${namespace}`;
  console.log(chalk.green('$ ') + chalk.white(portForwardCmd + ' &'));
  
  let portForwardProc: ReturnType<typeof Bun.spawn> | null = null;
  
  try {
    // Start port-forward process
    portForwardProc = Bun.spawn(['kubectl', 'port-forward', '-n', namespace, `svc/${serviceName}`, `${localPort}:${remotePort}`], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    // Wait for port-forward to be ready by checking stderr for "Forwarding from" message
    log.step('Waiting for port-forward to establish...');
    let portForwardReady = false;
    const startWait = Date.now();
    const maxWait = 15000; // 15 seconds max
    
    while (!portForwardReady && Date.now() - startWait < maxWait) {
      await pause(500);
      
      // Try to connect to the port
      try {
        const testResponse = await fetch(`http://localhost:${localPort}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        portForwardReady = true;
        log.step('Port-forward connection established');
      } catch {
        // Also try the OpenAI endpoint in case /health doesn't exist
        try {
          const testResponse = await fetch(`http://localhost:${localPort}/v1/models`, {
            signal: AbortSignal.timeout(1000),
          });
          portForwardReady = true;
          log.step('Port-forward connection established');
        } catch {
          // Keep waiting
        }
      }
    }
    
    if (!portForwardReady) {
      // Check if port-forward process died
      if (portForwardProc.exitCode !== null) {
        log.error(`Port-forward exited with code ${portForwardProc.exitCode}`);
        throw new Error(`Port-forward failed with exit code ${portForwardProc.exitCode}`);
      }
      log.warning('Port-forward may not be fully ready, attempting request anyway...');
    }
    
    console.log(chalk.gray(`Forwarding from 127.0.0.1:${localPort} -> ${remotePort}`));
    console.log();
    
    // Prepare curl command
    const requestBody = JSON.stringify({
      model: config.model.id,
      messages: [{ role: 'user', content: 'Hello, what can you do?' }],
      max_tokens: 100,
    });
    
    const curlCmd = `curl -s http://localhost:${localPort}/v1/chat/completions -H "Content-Type: application/json" -d '...'`;
    console.log(chalk.green('$ ') + chalk.white(curlCmd));
    console.log();
    
    // Send real curl request
    log.step('Sending chat completion request...');
    const startTime = Date.now();
    
    const response = await fetch(`http://localhost:${localPort}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (response.ok) {
      const data = await response.json();
      console.log(chalk.yellow(JSON.stringify(data, null, 2)));
      console.log();
      console.log(chalk.green('✓ ') + chalk.white(`OpenAI-compatible API working! (${elapsed}s)`));
    } else {
      const errorText = await response.text();
      console.log(chalk.red(`Error ${response.status}: ${errorText}`));
      console.log();
      console.log(chalk.yellow('⚠ ') + chalk.white('API returned an error, but endpoint is reachable'));
    }
  } catch (error) {
    console.log(chalk.red(`Request failed: ${error instanceof Error ? error.message : error}`));
    console.log();
    console.log(chalk.yellow('⚠ ') + chalk.white('Could not connect to service - model may still be loading'));
  } finally {
    // Clean up port-forward process
    if (portForwardProc) {
      portForwardProc.kill();
      log.step('Port-forward process terminated');
    }
  }
  
  console.log(chalk.cyan('═'.repeat(60)));
  console.log();
  
  await longPause();
}

/**
 * Run port-forward and send a chat request for KAITO CPU deployment
 * Similar to runPortForwardAndChat but for KAITO-specific services
 */
async function runPortForwardAndChatKaito(): Promise<void> {
  log.step('Running port-forward and chat request for KAITO CPU deployment...');
  
  const localPort = 8001; // Use different port to avoid conflicts
  
  // Use kubectl to find the KAITO service
  log.step('Finding KAITO inference service via kubectl...');
  
  let serviceName = '';
  let namespace = '';
  let remotePort = '8000';
  
  try {
    const result = Bun.spawnSync(['kubectl', 'get', 'svc', '-A', '-o', 'json']);
    if (result.exitCode === 0) {
      const data = JSON.parse(result.stdout.toString());
      
      for (const svc of data.items || []) {
        const name = svc.metadata?.name || '';
        const ns = svc.metadata?.namespace || '';
        const port = svc.spec?.ports?.[0]?.port?.toString() || '8000';
        
        // Look for KAITO llama service
        if (name.includes('llama') && (name.endsWith('-vllm') || name.includes('kaito'))) {
          serviceName = name;
          namespace = ns;
          remotePort = port;
          log.step(`Found KAITO service: ${ns}/${name}:${port}`);
          break;
        }
      }
    }
  } catch (error) {
    log.error(`kubectl failed: ${error}`);
  }
  
  if (!serviceName) {
    console.log('\n');
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.magenta.bold('  KAITO CPU INFERENCE TEST'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log();
    console.log(chalk.yellow('⚠ ') + chalk.white('No KAITO service found - deployment may still be initializing'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log();
    await longPause();
    return;
  }
  
  console.log('\n');
  console.log(chalk.magenta('═'.repeat(60)));
  console.log(chalk.magenta.bold('  KAITO CPU INFERENCE TEST'));
  console.log(chalk.magenta('═'.repeat(60)));
  console.log();
  
  const portForwardCmd = `kubectl port-forward svc/${serviceName} ${localPort}:${remotePort} -n ${namespace}`;
  console.log(chalk.green('$ ') + chalk.white(portForwardCmd + ' &'));
  
  let portForwardProc: ReturnType<typeof Bun.spawn> | null = null;
  
  try {
    portForwardProc = Bun.spawn(['kubectl', 'port-forward', '-n', namespace, `svc/${serviceName}`, `${localPort}:${remotePort}`], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    log.step('Waiting for port-forward to establish...');
    let portForwardReady = false;
    const startWait = Date.now();
    const maxWait = 15000;
    
    while (!portForwardReady && Date.now() - startWait < maxWait) {
      await pause(500);
      
      try {
        await fetch(`http://localhost:${localPort}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        portForwardReady = true;
        log.step('Port-forward connection established');
      } catch {
        try {
          await fetch(`http://localhost:${localPort}/v1/models`, {
            signal: AbortSignal.timeout(1000),
          });
          portForwardReady = true;
          log.step('Port-forward connection established');
        } catch {
          // Keep waiting
        }
      }
    }
    
    if (!portForwardReady) {
      if (portForwardProc.exitCode !== null) {
        log.error(`Port-forward exited with code ${portForwardProc.exitCode}`);
        throw new Error(`Port-forward failed with exit code ${portForwardProc.exitCode}`);
      }
      log.warning('Port-forward may not be fully ready, attempting request anyway...');
    }
    
    console.log(chalk.gray(`Forwarding from 127.0.0.1:${localPort} -> ${remotePort}`));
    console.log();
    
    const requestBody = JSON.stringify({
      model: config.modelCpu.id,
      messages: [{ role: 'user', content: 'Hello! What can you help me with?' }],
      max_tokens: 100,
    });
    
    const curlCmd = `curl -s http://localhost:${localPort}/v1/chat/completions -H "Content-Type: application/json" -d '...'`;
    console.log(chalk.green('$ ') + chalk.white(curlCmd));
    console.log();
    
    log.step('Sending chat completion request to KAITO CPU...');
    const startTime = Date.now();
    
    const response = await fetch(`http://localhost:${localPort}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (response.ok) {
      const data = await response.json();
      console.log(chalk.yellow(JSON.stringify(data, null, 2)));
      console.log();
      console.log(chalk.green('✓ ') + chalk.white(`KAITO CPU inference working! (${elapsed}s)`));
    } else {
      const errorText = await response.text();
      console.log(chalk.red(`Error ${response.status}: ${errorText}`));
      console.log();
      console.log(chalk.yellow('⚠ ') + chalk.white('API returned an error, but endpoint is reachable'));
    }
  } catch (error) {
    console.log(chalk.red(`Request failed: ${error instanceof Error ? error.message : error}`));
    console.log();
    console.log(chalk.yellow('⚠ ') + chalk.white('Could not connect to KAITO service - model may still be loading'));
  } finally {
    if (portForwardProc) {
      portForwardProc.kill();
      log.step('Port-forward process terminated');
    }
  }
  
  console.log(chalk.magenta('═'.repeat(60)));
  console.log();
  
  await longPause();
}

/**
 * Wait for deployment to be ready (legacy function)
 */
async function waitForDeploymentReady(deploymentName: string): Promise<void> {
  log.step(`Waiting for deployment ${deploymentName} to be ready...`);

  const startTime = Date.now();
  const timeout = config.timing.waitForDeployment;

  // Navigate to deployments page first
  await navigateTo('deployments');

  while (Date.now() - startTime < timeout) {
    try {
      const statusSelector = `[data-testid="deployment-status-${deploymentName}"]`;
      const statusElement = await page?.$(statusSelector);
      if (statusElement) {
        const statusText = await statusElement.textContent();
        if (statusText?.toLowerCase().includes('running') || statusText?.toLowerCase().includes('ready')) {
          log.success(`Deployment ${deploymentName} is ready`);
          return;
        }
        log.step(`Deployment status: ${statusText}`);
      }
    } catch {
      // Continue waiting
    }
    await pause(10000); // Check every 10 seconds
  }

  log.warning(`Deployment readiness timed out after ${timeout / 1000}s`);
}

/**
 * Run the UI phase of the demo
 */
export async function runUiPhase(): Promise<void> {
  log.phase('PHASE 2: THE SOLUTION');
  log.step('Demonstrating KubeFoundry UI');

  try {
    // Launch browser
    const p = await launchBrowser();

    // Introduction to KubeFoundry
    await narrate('kubefoundry_intro');
    await longPause();

    // Show dashboard
    await narrate('dashboard');
    await mediumPause();

    // Navigate to Settings for runtime installation
    await navigateTo('settings');
    await mediumPause();

    // Click on Runtimes tab
    await clickElement('settings-tab-runtimes', 'Runtimes tab');
    await mediumPause();

    // Scroll down to show install buttons
    if (page) {
      log.step('Scrolling to show runtime install buttons...');
      await page.evaluate(() => window.scrollBy(0, 400));
      await shortPause();
    }

    // Runtime installation (skip if DEMO_SKIP_INSTALL is set)
    if (!config.features.skipInstall) {
      await narrate('installation');
      await mediumPause();

      // Install Dynamo runtime
      log.step('Installing Dynamo runtime...');
      await installRuntime('dynamo');
      await narrate('installation_progress', false); // Don't wait, let it play during install

      await narrate('installation_complete');
      await mediumPause();

      // Also install KAITO for CPU demo
      log.step('Installing KAITO runtime for CPU inference...');
      await installRuntime('kaito');
      await mediumPause();
    } else {
      log.info('Skipping runtime installation (DEMO_SKIP_INSTALL=true)');
    }

    // Navigate to Models
    await navigateTo('models');
    await mediumPause();

    // Model discovery - stay on curated tab (default)
    await narrate('models');
    await longPause();

    // Show a model that's too large for the cluster (Llama 405B) using HuggingFace search
    log.step('Showing GPU fit indicator for large model via HuggingFace search...');
    
    // Click on HuggingFace search tab
    await clickElement('models-hf-search-tab', 'HuggingFace Search tab');
    await mediumPause();
    
    // Search for Llama 405B
    if (page) {
      const searchInput = await page.$('input[placeholder*="Search"]');
      if (searchInput) {
        await searchInput.fill('llama-3.1-405b');
        await longPause(); // Wait for search results
      }
    }
    
    await narrate('large_model_warning');
    await longPause();
    
    // Look for the red GPU fit indicator in search results
    // Just pause to let the viewer see the red GPU fit indicators
    await longPause();

    // Go back to curated tab for deployment
    await clickElement('models-curated-tab', 'Curated Models tab');
    await shortPause();

    // Scroll back up
    if (page) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await shortPause();
    }

    // HuggingFace Login
    log.step('Demonstrating HuggingFace login...');
    await navigateTo('settings');
    await mediumPause();
    
    // Click Integrations tab
    await clickElement('settings-tab-integrations', 'Integrations tab');
    await mediumPause();
    
    await narrate('huggingface_login');
    await longPause();
    
    // Show the HuggingFace sign in section (don't actually click if already signed in)
    // Just highlight the capability
    await mediumPause();

    // Navigate back to Models for deployment
    await navigateTo('models');
    await mediumPause();

    // Deploy model with Dynamo (GPU)
    await narrate('deploy_start');
    await shortPause();

    // Find and click deploy on the model from curated list
    await deployModel(config.model.id, 'dynamo');

    await narrate('deploy_config');
    await mediumPause();

    // Show AI Configurator for Dynamo
    log.step('Showing Dynamo AI Configurator...');
    await narrate('ai_configurator');
    await longPause();

    // Show Pricing Estimator
    log.step('Showing pricing estimator...');
    // Scroll down to make sure cost estimate is visible
    if (page) {
      await page.evaluate(() => window.scrollBy(0, 300));
      await shortPause();
      
      // Try to expand the cost estimate card if collapsed
      try {
        const costCard = await page.$('[data-testid="cost-estimate-card"]');
        if (costCard) {
          await costCard.click();
          await shortPause();
        }
      } catch {
        // Card might already be expanded or not present
      }
    }
    await narrate('pricing_estimator');
    await longPause();

    await narrate('deploy_submit');
    await mediumPause();

    // Monitor deployment
    await navigateTo('deployments');
    await narrate('monitoring');
    await longPause();

    // Wait for deployment to reach Running state
    log.step('Waiting for deployment to reach Running state...');
    await waitForDeploymentRunning();
    
    await narrate('deployment_ready');
    await mediumPause();

    // Port-forward and chat demo
    log.phase('LIVE INFERENCE TEST');
    await narrate('port_forward_intro');
    await mediumPause();
    
    // Run port-forward and chat in terminal
    await runPortForwardAndChat();
    await longPause();

    // Now show KAITO CPU deployment
    log.phase('KAITO CPU INFERENCE');
    await narrate('kaito_cpu_intro');
    await mediumPause();

    // Navigate back to Models
    await navigateTo('models');
    await mediumPause();

    // Deploy Llama GGUF model with KAITO CPU
    await deployModel(config.modelCpu.id, 'kaito');
    await narrate('kaito_cpu_deploy');
    await mediumPause();

    // Monitor KAITO deployment
    await navigateTo('deployments');
    await longPause();

    // Wait for KAITO deployment to reach Running state
    log.step('Waiting for KAITO CPU deployment to reach Running state...');
    await waitForDeploymentRunning();
    
    await narrate('kaito_cpu_ready');
    await mediumPause();

    // Port-forward and chat demo for KAITO CPU
    log.phase('KAITO CPU INFERENCE TEST');
    await narrate('kaito_port_forward_intro');
    await mediumPause();
    
    // Run port-forward and chat for KAITO
    await runPortForwardAndChatKaito();
    await narrate('kaito_chat_response');
    await longPause();

    await narrate('api_access');
    await longPause();

    // Summary and closing
    log.phase('CLOSING');

    await narrate('summary');
    await longPause();

    await narrate('closing');
    await mediumPause();

    await narrate('call_to_action');
    await veryLongPause();

    log.success('UI phase complete');
  } catch (error) {
    log.error(`UI phase failed: ${error}`);
    throw error;
  } finally {
    await closeBrowser();
  }
}

/**
 * Run UI phase only (for testing)
 */
export async function runUiPhaseOnly(): Promise<void> {
  log.info('Running UI phase only');
  await runUiPhase();
  log.success('Demo complete (UI only)');
}
