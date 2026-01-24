/**
 * UI Phase - Playwright browser automation
 * Demonstrates "the solution" using KubeFoundry
 */

import { chromium, type Browser, type Page } from 'playwright';
import chalk from 'chalk';
import { config } from './config';
import { pause, log, shortPause, mediumPause, longPause, veryLongPause } from './utils';
import { narrate, speak } from './narration';
import {
  initConsoleCollector,
  cleanupConsoleCollector,
  resilientClick,
  resilientWaitFor,
  resilientAction,
  printFailureSummary,
  getCapturedFailures,
} from './lib/resilient-action';
import { captureDebugContext, formatDebugContext, clearDebugCaptures, getDebugDir } from './lib/debug-capture';

let browser: Browser | null = null;
let page: Page | null = null;

/**
 * Debug helper: log scroll position and viewport info
 * Note: The app uses a flexbox layout where <main> is the scrollable container, not window
 */
async function debugScrollPosition(label: string): Promise<void> {
  if (!page) return;
  const info = await page.evaluate(() => {
    // Find the main scrollable container (the <main> element with overflow-auto)
    const mainEl = document.querySelector('main');
    if (mainEl) {
      return {
        scrollY: mainEl.scrollTop,
        scrollX: mainEl.scrollLeft,
        containerHeight: mainEl.clientHeight,
        scrollHeight: mainEl.scrollHeight,
        maxScrollY: mainEl.scrollHeight - mainEl.clientHeight,
      };
    }
    // Fallback to window if main not found
    return {
      scrollY: window.scrollY,
      scrollX: window.scrollX,
      containerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      maxScrollY: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  log.step(`[SCROLL DEBUG] ${label}: scrollY=${info.scrollY}/${info.maxScrollY}, containerHeight=${info.containerHeight}, scrollHeight=${info.scrollHeight}`);
}

/**
 * Safe scroll to element - ensures element exists and scrolls smoothly
 * Scrolls within the main content container (which has overflow-auto)
 */
async function scrollToElement(testId: string, label: string): Promise<boolean> {
  if (!page) return false;
  
  await debugScrollPosition(`Before scrolling to ${label}`);
  
  const found = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return false;
    
    // Find the scrollable main container
    const mainEl = document.querySelector('main');
    if (mainEl) {
      // Get element position relative to the main container
      const mainRect = mainEl.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      
      // Calculate scroll position to center the element
      const scrollTop = mainEl.scrollTop + elRect.top - mainRect.top - (mainRect.height / 2) + (elRect.height / 2);
      
      mainEl.scrollTo({
        top: Math.max(0, scrollTop),
        behavior: 'smooth'
      });
    } else {
      // Fallback to scrollIntoView
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return true;
  }, testId);
  
  if (found) {
    await pause(500); // Wait for smooth scroll to complete
    await debugScrollPosition(`After scrolling to ${label}`);
    log.success(`Scrolled to ${label}`);
  } else {
    log.warning(`Element not found for scroll: ${label} (data-testid="${testId}")`);
  }
  
  return found;
}

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
 * Path for persistent browser storage (cookies, localStorage, etc.)
 * This allows HuggingFace login to persist across demo runs
 */
const BROWSER_STORAGE_PATH = './browser-state.json';

/**
 * Launch browser and navigate to KubeFoundry
 * Uses persistent storage to maintain login sessions (e.g., HuggingFace)
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

  // Try to load existing browser state (cookies, localStorage) for persistent sessions
  let storageState: string | undefined;
  try {
    const stateFile = Bun.file(BROWSER_STORAGE_PATH);
    if (await stateFile.exists()) {
      storageState = BROWSER_STORAGE_PATH;
      log.step('Loading saved browser state (cookies, sessions)...');
    }
  } catch {
    // No saved state, start fresh
  }

  const context = await browser.newContext({
    viewport: config.browser.viewport,
    storageState: storageState,
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

  // Initialize console collector for debug capture (also clears previous captures)
  await initConsoleCollector(page);
  log.step('Debug console collector attached');

  log.success('Browser launched and KubeFoundry loaded');
  return page;
}

/**
 * Close browser and save storage state for next run
 */
async function closeBrowser(saveState = true): Promise<void> {
  // Cleanup console collector
  cleanupConsoleCollector();
  
  if (browser) {
    // Save browser state (cookies, localStorage) for persistent sessions
    if (saveState && page) {
      try {
        const context = page.context();
        await context.storageState({ path: BROWSER_STORAGE_PATH });
        log.step('Saved browser state for next run');
      } catch (error) {
        log.warning(`Could not save browser state: ${error}`);
      }
    }
    
    await browser.close();
    browser = null;
    page = null;
    log.step('Browser closed');
  }
}

/**
 * Wait for element and click it
 * Uses resilient action wrapper with retry and debug capture
 */
async function clickElement(testId: string, description: string): Promise<void> {
  if (!page) throw new Error('Browser not initialized');

  log.step(`Clicking: ${description}`);
  
  const success = await resilientClick(page, testId, description, {
    maxRetries: config.debug.maxRetries,
    retryDelay: config.debug.retryDelay,
  });
  
  if (success) {
    await shortPause();
  }
}

/**
 * Wait for element to be visible
 * Uses resilient action wrapper with retry and debug capture
 */
async function waitForElement(testId: string, description: string): Promise<void> {
  if (!page) throw new Error('Browser not initialized');

  log.step(`Waiting for: ${description}`);
  
  await resilientWaitFor(page, testId, description, {
    maxRetries: config.debug.maxRetries,
    retryDelay: config.debug.retryDelay,
  });
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
 * Screenshots are saved to demo/screenshots/ with sequential numbering
 */
let screenshotCounter = 0;
async function screenshot(name: string): Promise<void> {
  if (!page) return;

  screenshotCounter++;
  const paddedNum = String(screenshotCounter).padStart(3, '0');
  const screenshotDir = './screenshots';
  
  // Ensure directory exists
  try {
    await Bun.write(`${screenshotDir}/.gitkeep`, '');
  } catch {
    // Directory may already exist
  }
  
  const filepath = `${screenshotDir}/${paddedNum}-${name}.png`;
  await page.screenshot({ path: filepath, fullPage: false });
  log.step(`Screenshot ${paddedNum}: ${name}`);
}

/**
 * Navigate to a page using sidebar navigation
 */
async function navigateTo(navItem: 'models' | 'deployments' | 'settings'): Promise<void> {
  log.step(`Navigating to ${navItem}...`);
  
  try {
    await clickElement(`nav-${navItem}`, `${navItem} navigation`);
    await mediumPause();
    await screenshot(`page-${navItem}`);
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
 * Perform HuggingFace OAuth login flow
 * Handles the popup/redirect to HuggingFace and clicking authorize
 */
async function performHuggingFaceLogin(): Promise<void> {
  if (!page) throw new Error('Browser not initialized');
  
  // Check if already connected by looking for the green "Connected" badge
  try {
    const statusBadge = await page.$('[data-testid="hf-status"]');
    if (statusBadge) {
      const badgeText = await statusBadge.textContent();
      if (badgeText?.toLowerCase().includes('connected')) {
        log.info('HuggingFace already connected, skipping login flow');
        await mediumPause();
        return;
      }
    }
  } catch {
    // Continue with login flow
  }
  
  // Check if sign-in button exists
  const signInButton = await page.$('[data-testid="hf-signin-button"]');
  if (!signInButton) {
    log.info('HuggingFace sign-in button not found, may already be connected');
    await mediumPause();
    return;
  }
  
  log.step('Starting HuggingFace OAuth flow...');
  
  // Set up listener for new page (popup) before clicking
  const context = page.context();
  
  // Click the sign-in button - this will redirect to HuggingFace
  // We need to handle the OAuth flow on HuggingFace's site
  const [hfPage] = await Promise.all([
    context.waitForEvent('page', { timeout: 30000 }).catch(() => null),
    page.click('[data-testid="hf-signin-button"]'),
  ]);
  
  if (hfPage) {
    // OAuth opened in a new tab/popup
    log.step('HuggingFace OAuth page opened in new tab');
    
    try {
      await hfPage.waitForLoadState('networkidle', { timeout: 30000 });
      log.step('HuggingFace page loaded');
      
      // Look for the authorize button on HuggingFace
      // HuggingFace uses various button texts: "Authorize", "Allow", etc.
      const authorizeSelectors = [
        'button:has-text("Authorize")',
        'button:has-text("Allow")',
        'button[type="submit"]:has-text("Authorize")',
        'input[type="submit"][value*="Authorize"]',
        'button.btn-primary',
      ];
      
      let authorized = false;
      for (const selector of authorizeSelectors) {
        try {
          const btn = await hfPage.$(selector);
          if (btn) {
            log.step(`Found authorize button: ${selector}`);
            await btn.click();
            authorized = true;
            break;
          }
        } catch {
          // Try next selector
        }
      }
      
      if (!authorized) {
        // Maybe already authorized and HF is auto-redirecting
        log.step('No authorize button found, may be auto-redirecting');
      }
      
      // Wait for redirect back to our app (popup should close or redirect)
      await hfPage.waitForURL(/oauth\/callback|localhost/, { timeout: 30000 }).catch(() => {
        log.step('Popup waiting for redirect...');
      });
      
      // Close the popup if still open
      if (!hfPage.isClosed()) {
        await hfPage.close();
      }
    } catch (error) {
      log.warning(`HuggingFace popup handling: ${error}`);
      if (!hfPage.isClosed()) {
        await hfPage.close();
      }
    }
  } else {
    // OAuth happened via redirect (same page)
    log.step('HuggingFace OAuth via redirect...');
    
    try {
      // Wait for redirect to HuggingFace
      await page.waitForURL(/huggingface\.co/, { timeout: 10000 });
      log.step('Redirected to HuggingFace');
      
      await page.waitForLoadState('networkidle');
      
      // Look for authorize button
      const authorizeSelectors = [
        'button:has-text("Authorize")',
        'button:has-text("Allow")',
        'button[type="submit"]',
      ];
      
      for (const selector of authorizeSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            log.step(`Clicking authorize button: ${selector}`);
            await btn.click();
            break;
          }
        } catch {
          // Try next selector
        }
      }
      
      // Wait for redirect back to our callback page
      await page.waitForURL(/oauth\/callback|localhost:5173\/settings/, { timeout: 30000 });
      log.step('Redirected back from HuggingFace');
      
      // Wait for the callback to complete and redirect to settings
      await page.waitForURL(/settings/, { timeout: 30000 });
      await page.waitForLoadState('networkidle');
      
    } catch (error) {
      log.warning(`HuggingFace redirect flow: ${error}`);
    }
  }
  
  // Wait a moment and verify connection
  await longPause();
  
  // Navigate back to settings integrations tab to verify
  await navigateTo('settings');
  await clickElement('settings-tab-integrations', 'Integrations tab');
  await mediumPause();
  
  // Check if now connected
  try {
    const statusBadge = await page.$('[data-testid="hf-status"]');
    if (statusBadge) {
      log.success('HuggingFace connected successfully!');
    } else {
      log.warning('HuggingFace connection status unclear');
    }
  } catch {
    log.warning('Could not verify HuggingFace connection status');
  }
  
  await mediumPause();
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
 * Uses resilient action for the deploy button click
 */
async function openDeployModal(modelId: string, runtimeId: string): Promise<boolean> {
  log.step(`Opening deploy modal for: ${modelId} with runtime: ${runtimeId}`);

  // Click deploy button on model card
  // The testId uses the model.id which contains slashes like Qwen/Qwen3-0.6B
  if (!page) throw new Error('Browser not initialized');
  
  const testId = `model-deploy-button-${modelId}`;
  log.step(`Looking for deploy button: ${testId}`);
  
  // Use resilient action for the deploy button
  const success = await resilientAction(
    page,
    `Deploy button for ${modelId}`,
    async () => {
      const selector = `[data-testid="${testId}"]`;
      await page!.waitForSelector(selector, { state: 'visible', timeout: 30000 });
      await pause(200);
      await page!.click(selector);
      return true;
    },
    {
      maxRetries: config.debug.maxRetries,
      retryDelay: config.debug.retryDelay,
    }
  );

  if (!success) {
    log.warning('Deploy button click failed, continuing...');
    return false;
  }

  await mediumPause();

  // Select runtime
  await clickElement(`deploy-runtime-option-${runtimeId}`, `Select ${runtimeId} runtime`);
  await shortPause();
  
  return true;
}

/**
 * Submit the deployment (click Create Deployment button)
 * Call this after reviewing cost estimate and configurator
 */
async function submitDeployment(): Promise<void> {
  log.step('Submitting deployment...');
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
 * Monitor pod logs for inference activity
 * Waits until it detects that a response has been generated (user interacted via Ayna)
 * @param namespace - The namespace to look for pods
 * @param labelSelector - Label selector to find the right pods
 * @param timeout - Maximum time to wait in milliseconds
 * @returns true if inference activity was detected
 */
async function waitForInferenceInLogs(namespace: string, labelSelector: string, timeout: number = 120000): Promise<boolean> {
  log.step(`Monitoring pod logs in ${namespace} (selector: ${labelSelector || 'all pods'})...`);
  
  console.log('\n');
  console.log(chalk.cyan('═'.repeat(60)));
  console.log(chalk.cyan.bold('  WAITING FOR AYNA INTERACTION'));
  console.log(chalk.cyan('═'.repeat(60)));
  console.log();
  console.log(chalk.yellow('👆 Open Ayna and send a message to the model'));
  console.log(chalk.gray('   Monitoring pod logs for inference activity...'));
  console.log(chalk.cyan('═'.repeat(60)));
  console.log();
  
  const startTime = Date.now();
  
  // Patterns that indicate inference happened
  const inferencePatterns = [
    /generate|generated/i,
    /completion|completions/i,
    /tokens?.*generated/i,
    /request.*processed/i,
    /inference.*complete/i,
    /output.*tokens/i,
    /response.*sent/i,
    /POST.*chat.*completions/i,
    /finish_reason/i,
    // vLLM specific patterns
    /Avg generation throughput/i,
    /prompt_tokens|completion_tokens/i,
    /request_id/i,
    /Received request/i,
    /generation.*tokens/i,
    // Dynamo specific patterns  
    /prefill|decode/i,
    /kv.*cache/i,
    /sequence.*complete/i,
    // General API patterns
    /200\s+OK/i,
    /v1\/chat/i,
    /streaming.*response/i,
  ];
  
  // Get initial log line count to detect new activity
  let lastLogLength = 0;
  
  while (Date.now() - startTime < timeout) {
    try {
      // Build kubectl logs command
      const args = ['kubectl', 'logs', '-n', namespace];
      if (labelSelector) {
        args.push('-l', labelSelector);
      } else {
        // If no label selector, try to get logs from all pods in namespace
        args.push('--all-containers=true');
      }
      args.push('--tail=50', '--timestamps');
      
      const result = Bun.spawnSync(args, { timeout: 10000 });
      
      if (result.exitCode === 0) {
        const logs = result.stdout.toString();
        
        // Check if logs have grown (new activity)
        if (logs.length > lastLogLength) {
          const newLogs = logs.substring(lastLogLength);
          lastLogLength = logs.length;
          
          // Check for inference patterns in new logs
          for (const pattern of inferencePatterns) {
            if (pattern.test(newLogs)) {
              console.log();
              console.log(chalk.green('✓ ') + chalk.white('Inference activity detected in pod logs!'));
              console.log(chalk.cyan('═'.repeat(60)));
              console.log();
              
              // Show a snippet of the relevant log
              const lines = newLogs.split('\n').filter(l => pattern.test(l));
              if (lines.length > 0) {
                console.log(chalk.gray('Log snippet:'));
                console.log(chalk.dim(lines.slice(0, 3).join('\n')));
                console.log();
              }
              
              log.success('Response confirmed in pod logs');
              return true;
            }
          }
        }
      } else {
        // Log the error on first failure
        if (lastLogLength === 0) {
          const stderr = result.stderr.toString();
          log.step(`kubectl logs: ${stderr.substring(0, 100)}`);
        }
      }
    } catch (error) {
      log.step(`Log fetch error: ${error instanceof Error ? error.message : error}`);
    }
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    if (elapsed % 10 === 0) {
      log.step(`  Still waiting for inference activity... (${elapsed}s)`);
    }
    
    await pause(2000); // Check every 2 seconds
  }
  
  console.log();
  console.log(chalk.yellow('⚠ ') + chalk.white('No inference activity detected within timeout'));
  console.log(chalk.cyan('═'.repeat(60)));
  console.log();
  
  log.warning('Timeout waiting for inference activity in logs');
  return false;
}

/**
 * Find pods for a deployment and return namespace and label selector
 */
async function findDeploymentPods(modelPattern: string, knownNamespace?: string): Promise<{ namespace: string; labelSelector: string } | null> {
  try {
    // Look for pods matching the model pattern
    const namespaceArg = knownNamespace ? ['-n', knownNamespace] : ['-A'];
    const result = Bun.spawnSync(['kubectl', 'get', 'pods', ...namespaceArg, '-o', 'json']);
    if (result.exitCode !== 0) return null;
    
    const data = JSON.parse(result.stdout.toString());
    
    for (const pod of data.items || []) {
      const name = pod.metadata?.name || '';
      const ns = pod.metadata?.namespace || '';
      const labels = pod.metadata?.labels || {};
      
      // Match pods containing the model pattern (e.g., qwen3, llama)
      if (name.toLowerCase().includes(modelPattern.toLowerCase())) {
        // Find a useful label for selecting pods
        const appLabel = labels['app'] || labels['app.kubernetes.io/name'] || labels['dynamo.nvidia.com/graph'];
        if (appLabel) {
          log.step(`Found pod ${name} with app label: ${appLabel}`);
          return { namespace: ns, labelSelector: `app=${appLabel}` };
        }
        // Try dynamo-specific labels
        const dynamoLabel = labels['dynamo.nvidia.com/graph'];
        if (dynamoLabel) {
          log.step(`Found pod ${name} with dynamo label: ${dynamoLabel}`);
          return { namespace: ns, labelSelector: `dynamo.nvidia.com/graph=${dynamoLabel}` };
        }
        // Fallback: use the deployment/workspace name if available
        const workspaceLabel = labels['kaito.sh/workspace'];
        if (workspaceLabel) {
          log.step(`Found pod ${name} with KAITO workspace label: ${workspaceLabel}`);
          return { namespace: ns, labelSelector: `kaito.sh/workspace=${workspaceLabel}` };
        }
        // Last resort: just use pod name prefix
        const podPrefix = name.split('-').slice(0, -2).join('-');
        if (podPrefix) {
          log.step(`Found pod ${name}, using name prefix for selection`);
          return { namespace: ns, labelSelector: '' }; // Empty selector, we'll use --all-containers
        }
      }
    }
    
    // If no match by name, try searching in the known namespace
    if (knownNamespace) {
      log.step(`No pods matching '${modelPattern}', checking all pods in ${knownNamespace}...`);
      for (const pod of data.items || []) {
        const name = pod.metadata?.name || '';
        const ns = pod.metadata?.namespace || '';
        const phase = pod.status?.phase || '';
        
        // Only consider running pods in our namespace
        if (ns === knownNamespace && phase === 'Running') {
          const labels = pod.metadata?.labels || {};
          const appLabel = labels['app'] || labels['app.kubernetes.io/name'];
          if (appLabel) {
            log.step(`Found running pod ${name} in namespace ${ns}`);
            return { namespace: ns, labelSelector: `app=${appLabel}` };
          }
        }
      }
    }
  } catch (error) {
    log.error(`Failed to find pods: ${error}`);
  }
  return null;
}

/**
 * Set up port-forward and wait for user to interact via Ayna
 * Unlike runPortForwardAndChat, this doesn't send its own request - 
 * it waits for the user to use Ayna and monitors pod logs to detect the response
 */
async function setupPortForwardForAyna(modelPattern: string): Promise<void> {
  log.step('Setting up port-forward for Ayna...');
  
  const localPort = 8000;
  
  // Find the service
  log.step('Finding inference service via kubectl...');
  
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
        
        // Match service based on model pattern
        if (name.toLowerCase().includes(modelPattern.toLowerCase())) {
          // Prefer frontend services for Dynamo
          if (name.endsWith('-frontend') && !name.endsWith('-d') && !name.endsWith('-p')) {
            serviceName = name;
            namespace = ns;
            remotePort = port;
            log.step(`Found Dynamo frontend: ${ns}/${name}:${port}`);
            break;
          }
          // Prefer vLLM services for KAITO
          if (!serviceName && (name.endsWith('-vllm') || !name.includes('headless'))) {
            serviceName = name;
            namespace = ns;
            remotePort = port;
          }
        }
      }
    }
  } catch (error) {
    log.error(`kubectl failed: ${error}`);
  }
  
  if (!serviceName) {
    console.log('\n');
    console.log(chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold('  AYNA INFERENCE TEST'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log();
    console.log(chalk.yellow('⚠ ') + chalk.white('No matching service found - deployment may still be initializing'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log();
    return;
  }
  
  let portForwardProc: ReturnType<typeof Bun.spawn> | null = null;
  
  try {
    // Start port-forward process
    portForwardProc = Bun.spawn(['kubectl', 'port-forward', '-n', namespace, `svc/${serviceName}`, `${localPort}:${remotePort}`], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    // Wait for port-forward to be ready
    log.step('Waiting for port-forward to establish...');
    let portForwardReady = false;
    const startWait = Date.now();
    const maxWait = 15000;
    
    while (!portForwardReady && Date.now() - startWait < maxWait) {
      await pause(500);
      try {
        await fetch(`http://localhost:${localPort}/v1/models`, { signal: AbortSignal.timeout(1000) });
        portForwardReady = true;
        log.step('Port-forward connection established');
      } catch {
        // Keep waiting
      }
    }
    
    if (!portForwardReady && portForwardProc.exitCode !== null) {
      throw new Error(`Port-forward failed with exit code ${portForwardProc.exitCode}`);
    }
    
    // Show Ayna instructions
    console.log('\n');
    console.log(chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold('  AYNA INFERENCE TEST'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log();
    console.log(chalk.gray(`Port-forward: localhost:${localPort} -> ${serviceName}:${remotePort}`));
    console.log();
    
    // Click the Chat button in the UI to open Ayna
    if (page) {
      try {
        // First, make sure we're on the deployments page
        const currentUrl = page.url();
        if (!currentUrl.includes('/deployments')) {
          await page.goto(`${config.kubefoundry.url}/deployments`);
          await page.waitForLoadState('networkidle');
          await pause(1000);
        }
        
        // Give the page a moment to render
        await pause(1000);
        
        // Find chat button href directly from DOM (no visibility wait needed)
        const chatHref = await page.evaluate((pattern) => {
          // Look for chat links in both mobile and desktop views
          const allChatLinks = document.querySelectorAll('a[data-testid^="deployment-chat-"]');
          for (const link of allChatLinks) {
            const testId = link.getAttribute('data-testid') || '';
            // Check if it matches our pattern (case-insensitive)
            if (testId.toLowerCase().includes(pattern.toLowerCase())) {
              return (link as HTMLAnchorElement).href;
            }
          }
          // If no match, return the first one that has ayna:// scheme
          for (const link of allChatLinks) {
            const href = (link as HTMLAnchorElement).href;
            if (href.startsWith('ayna://')) {
              return href;
            }
          }
          return null;
        }, modelPattern);
        
        if (chatHref) {
          // Open the Ayna URL directly since clicking may not work due to visibility
          log.step(`Opening Ayna: ${chatHref.substring(0, 60)}...`);
          await page.evaluate((href) => {
            window.location.href = href;
          }, chatHref);
          await pause(1500); // Give Ayna time to open
          log.success('Opened Ayna via deep link');
        } else {
          log.warning('No Chat button found on deployments page');
        }
      } catch (error) {
        log.warning(`Could not open Ayna: ${error instanceof Error ? error.message : error}`);
      }
    }
    
    console.log(chalk.yellow.bold('👆 Send a message to the model in Ayna'));
    console.log(chalk.gray('   Endpoint: http://localhost:8000'));
    console.log();
    console.log(chalk.cyan('   Press ENTER when done to continue the demo...'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log();
    
    // Wait for user to press Enter (or timeout after 2 minutes)
    const waitForEnter = async () => {
      return new Promise<void>((resolve) => {
        // Set up a timeout as fallback
        const timeout = setTimeout(() => {
          log.step('Timeout reached, continuing demo...');
          resolve();
        }, 120000);
        
        // Listen for Enter key
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        rl.question('', () => {
          clearTimeout(timeout);
          rl.close();
          resolve();
        });
      });
    };
    
    await waitForEnter();
    console.log(chalk.green('✓ ') + chalk.white('Continuing demo...'));
    console.log(chalk.cyan('═'.repeat(60)));
    console.log();
    
  } finally {
    // Clean up port-forward process
    if (portForwardProc) {
      portForwardProc.kill();
      log.step('Port-forward process terminated');
    }
  }
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
    
    // First, try to discover available endpoints
    log.step('Checking available endpoints...');
    try {
      // Try /v1/models to see if OpenAI API is available
      const modelsResponse = await fetch(`http://localhost:${localPort}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });
      if (modelsResponse.ok) {
        const models = await modelsResponse.json();
        log.step(`Available models: ${JSON.stringify(models.data?.map((m: {id: string}) => m.id) || models)}`);
      }
    } catch {
      log.step('Could not query /v1/models');
    }
    
    // Try root to see what's there
    try {
      const rootResponse = await fetch(`http://localhost:${localPort}/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (rootResponse.ok) {
        const rootText = await rootResponse.text();
        log.step(`Root response: ${rootText.substring(0, 200)}...`);
      }
    } catch {
      log.step('Could not query root endpoint');
    }

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
    
    // Try different endpoints - Dynamo may use different paths
    const endpoints = [
      '/v1/chat/completions',
      '/chat/completions', 
      '/generate',
      '/v1/completions',
    ];
    
    let response: Response | null = null;
    let usedEndpoint = '';
    
    for (const endpoint of endpoints) {
      try {
        log.step(`Trying endpoint: ${endpoint}`);
        response = await fetch(`http://localhost:${localPort}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: AbortSignal.timeout(30000),
        });
        usedEndpoint = endpoint;
        if (response.ok || response.status !== 404) {
          break; // Found a valid endpoint
        }
      } catch (e) {
        log.step(`Endpoint ${endpoint} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (response && response.ok) {
      const data = await response.json();
      console.log(chalk.yellow(JSON.stringify(data, null, 2)));
      console.log();
      console.log(chalk.green('✓ ') + chalk.white(`OpenAI-compatible API working! (${elapsed}s) [${usedEndpoint}]`));
    } else if (response) {
      const errorText = await response.text();
      console.log(chalk.red(`Error ${response.status}: ${errorText}`));
      console.log();
      console.log(chalk.yellow('⚠ ') + chalk.white('API returned an error, but endpoint is reachable'));
    } else {
      console.log(chalk.red('All endpoints failed'));
      console.log();
      console.log(chalk.yellow('⚠ ') + chalk.white('Could not find working API endpoint'));
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
  
  // Wait for KAITO service to be available (polling)
  log.step('Waiting for KAITO inference service to be available...');
  
  let serviceName = '';
  let namespace = '';
  let remotePort = '8000';
  
  const serviceStartTime = Date.now();
  const serviceTimeout = 180000; // 3 minutes max wait for service
  
  while (!serviceName && Date.now() - serviceStartTime < serviceTimeout) {
    try {
      const result = Bun.spawnSync(['kubectl', 'get', 'svc', '-A', '-o', 'json']);
      if (result.exitCode === 0) {
        const data = JSON.parse(result.stdout.toString());
        
        for (const svc of data.items || []) {
          const name = svc.metadata?.name || '';
          const ns = svc.metadata?.namespace || '';
          const port = svc.spec?.ports?.[0]?.port?.toString() || '80';
          
          // Look for KAITO service:
          // 1. In kaito-workspace namespace with llama in the name (but not headless)
          // 2. Or ends with -vllm
          // 3. Or includes 'kaito' in name
          if (name.includes('llama') && !name.includes('headless')) {
            if (ns === 'kaito-workspace' || name.endsWith('-vllm') || name.includes('kaito')) {
              serviceName = name;
              namespace = ns;
              remotePort = port;
              log.step(`Found KAITO service: ${ns}/${name}:${port}`);
              break;
            }
          }
        }
      }
    } catch (error) {
      log.error(`kubectl failed: ${error}`);
    }
    
    if (!serviceName) {
      const elapsed = Math.floor((Date.now() - serviceStartTime) / 1000);
      log.step(`  Waiting for KAITO service... (${elapsed}s)`);
      await pause(5000); // Check every 5 seconds
    }
  }
  
  if (!serviceName) {
    console.log('\n');
    console.log(chalk.magenta('═'.repeat(60)));
    console.log(chalk.magenta.bold('  KAITO CPU INFERENCE TEST'));
    console.log(chalk.magenta('═'.repeat(60)));
    console.log();
    console.log(chalk.yellow('⚠ ') + chalk.white('No KAITO service found after 3 minutes - deployment may have issues'));
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
      model: config.modelCpu.apiModel,
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

  // Cleanup before starting: Delete any existing deployments, screenshots, and debug captures
  if (!config.features.skipCleanup) {
    log.phase('PRE-DEMO CLEANUP');
    log.step('Cleaning up any existing demo resources...');
    
    try {
      // Clear previous debug captures (screenshots, FAILURES.md, context files)
      log.step('Clearing debug captures...');
      await clearDebugCaptures();
      log.success(`Debug captures cleared (${getDebugDir()})`);
      
      // Delete screenshots from previous session
      log.step('Deleting old screenshots...');
      const screenshotDir = './screenshots';
      try {
        const { unlinkSync, readdirSync } = await import('fs');
        const files = readdirSync(screenshotDir);
        let deleted = 0;
        for (const file of files) {
          if (file.endsWith('.png')) {
            unlinkSync(`${screenshotDir}/${file}`);
            deleted++;
          }
        }
        if (deleted > 0) {
          log.success(`Deleted ${deleted} old screenshots`);
        }
      } catch {
        // Directory may not exist or be empty
      }
      
      // Delete existing Dynamo DGD (DynamoGpuDeployment)
      log.step('Deleting existing Dynamo deployments...');
      const dgdResult = Bun.spawnSync(['kubectl', 'delete', 'dgd', '--all', '-n', 'dynamo-system', '--ignore-not-found']);
      if (dgdResult.exitCode === 0) {
        const output = dgdResult.stdout.toString().trim();
        if (output && !output.includes('No resources found')) {
          log.success('Existing Dynamo DGDs deleted');
        }
      }
      
      // Delete existing KAITO Workspaces
      log.step('Deleting existing KAITO workspaces...');
      const workspaceResult = Bun.spawnSync(['kubectl', 'delete', 'workspace', '--all', '-n', 'kaito-workspace', '--ignore-not-found']);
      if (workspaceResult.exitCode === 0) {
        const output = workspaceResult.stdout.toString().trim();
        if (output && !output.includes('No resources found')) {
          log.success('Existing KAITO workspaces deleted');
        }
      }
    } catch (error) {
      log.warning(`Pre-cleanup error: ${error}`);
    }
  } else {
    log.info('Skipping cleanup (DEMO_SKIP_CLEANUP=true)');
  }
  
  // Reset screenshot counter
  screenshotCounter = 0;

  try {
    // Launch browser
    const p = await launchBrowser();
    await screenshot('01-launch-dashboard');

    // Introduction to KubeFoundry
    if (!config.features.skipIntro) {
      await narrate('kubefoundry_intro');
      await longPause();

      // Show dashboard
      await narrate('dashboard');
      await mediumPause();
    } else {
      log.info('Skipping intro (DEMO_SKIP_INTRO=true)');
    }

    // Navigate to Settings for runtime installation
    if (!config.features.skipSettings) {
      await navigateTo('settings');
      await mediumPause();

      // Click on Runtimes tab
      await clickElement('settings-tab-runtimes', 'Runtimes tab');
      await mediumPause();
      await screenshot('settings-runtimes-tab');

      // Scroll down to show install buttons
      if (page) {
        log.step('Scrolling to show runtime install buttons...');
        await page.evaluate(() => {
          const mainEl = document.querySelector('main');
          if (mainEl) mainEl.scrollBy({ top: 400, behavior: 'smooth' });
        });
        await shortPause();
      }

      // Runtime installation (skip if DEMO_SKIP_INSTALL is set, or if both deployments are skipped)
      const skipRuntimeInstall = config.features.skipInstall || 
        (config.features.skipDynamoDeploy && config.features.skipKaitoDeploy);
      
      if (!skipRuntimeInstall) {
        await narrate('installation');
        await mediumPause();

        // Install Dynamo runtime (only if we'll deploy to it)
        if (!config.features.skipDynamoDeploy) {
          log.step('Installing Dynamo runtime...');
          
          // Start narration in background while install runs
          const progressNarration = narrate('installation_progress', false);
          await installRuntime('dynamo');
          
          // Wait for progress narration to finish before speaking the next line
          await progressNarration;
          await narrate('installation_complete');
          await mediumPause();
        }

        // Install KAITO for CPU demo (only if we'll deploy to it)
        if (!config.features.skipKaitoDeploy) {
          log.step('Installing KAITO runtime for CPU inference...');
          await installRuntime('kaito');
          await mediumPause();
        }
      } else {
        log.info('Skipping runtime installation (deployments skipped or DEMO_SKIP_INSTALL=true)');
      }
    } else {
      log.info('Skipping settings navigation (DEMO_SKIP_SETTINGS=true)');
    }

    // Navigate to Models
    await navigateTo('models');
    await mediumPause();

    // Model discovery - stay on curated tab (default)
    await narrate('models');
    await longPause();

    // Show a model that's too large for the cluster (Llama 405B) using HuggingFace search
    if (!config.features.skipModelSearch) {
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
          await screenshot('hf-search-large-model');
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
        await page.evaluate(() => {
          const mainEl = document.querySelector('main');
          if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
        });
        await shortPause();
      }
    } else {
      log.info('Skipping model search (DEMO_SKIP_MODEL_SEARCH=true)');
    }

    // HuggingFace Login
    log.step('Demonstrating HuggingFace login...');
    await navigateTo('settings');
    await mediumPause();
    
    // Click Integrations tab
    await clickElement('settings-tab-integrations', 'Integrations tab');
    await mediumPause();
    await screenshot('settings-integrations-tab');
    
    await narrate('huggingface_login');
    await longPause();
    
    // Perform HuggingFace OAuth flow if not already connected (unless skipped)
    if (!config.features.skipHfLogin) {
      await performHuggingFaceLogin();
    } else {
      log.info('Skipping HuggingFace login (DEMO_SKIP_HF_LOGIN=true)');
      await mediumPause();
    }

    // Navigate back to Models for deployment
    await navigateTo('models');
    await mediumPause();

    // Deploy model with Dynamo (GPU)
    if (!config.features.skipDynamoDeploy) {
      await narrate('deploy_start');
      await shortPause();

      // Open deploy modal and select runtime (don't submit yet)
      const modalOpened = await openDeployModal(config.model.id, 'dynamo');
      if (!modalOpened) {
        log.warning('Failed to open deploy modal, skipping deployment');
        return;
      }
      await screenshot('deploy-form-dynamo');

      await narrate('deploy_config');
      await mediumPause();

    // ============================================
    // AI Configurator / Optimizer Demo
    // ============================================
    if (!config.features.skipAiConfigurator) {
      log.step('Running AI Configurator optimization demo...');
      await narrate('ai_configurator');
      await mediumPause();

      if (page) {
        try {
          // Wait for AI Configurator panel to be visible
          await page.waitForSelector('[data-testid="ai-configurator-panel"]', { 
            state: 'visible', 
            timeout: 10000 
          });

          // --- Latency Optimization (Demo disaggregated serving) ---
          log.step('Selecting latency optimization...');
          await narrate('ai_optimizer_latency');
          await mediumPause();
          
          // Click latency button
          await clickElement('ai-configurator-latency', 'Latency optimization');
          await shortPause();
          
          // Click Optimize button
          await clickElement('ai-configurator-optimize', 'Optimize button');
          
          // Wait for analysis to complete
          log.step('Waiting for latency analysis...');
          await page.waitForSelector('[data-testid="ai-configurator-result"]', { 
            state: 'visible', 
            timeout: 30000 
          });
          await screenshot('ai-config-latency-result');
          await narrate('ai_optimizer_latency_result');
          await longPause();

        // Apply latency configuration to show AI-optimized settings
        log.step('Applying latency configuration...');
        await clickElement('ai-configurator-apply', 'Apply Configuration');
        await mediumPause();
        
        // Scroll to show the form fields with "Optimized" badges
        log.step('Scrolling to show optimized settings...');
        const foundBadge = await scrollToElement('ai-optimized-badge', 'Optimized badge');
        if (!foundBadge) {
          // Fallback: try scrolling to deploy-engine-select which is near the badges
          await scrollToElement('deploy-engine-select', 'Engine selector');
        }
        await mediumPause();
        
        // Wait for the Optimized badge to appear
        try {
          await page.waitForSelector('[data-testid="ai-optimized-badge"]', { 
            state: 'visible', 
            timeout: 5000 
          });
          log.success('AI-optimized settings visible in form');
          await screenshot('ai-config-optimized-badges');
        } catch {
          log.step('Optimized badge not found, continuing...');
        }
        
        await narrate('ai_optimizer_settings_applied');
        await longPause();

        // Discard the latency settings before switching to throughput
        log.step('Discarding latency configuration...');
        // Scroll to AI Configurator panel
        await scrollToElement('ai-configurator-panel', 'AI Configurator panel');
        await shortPause();
        
        // Click Discard to clear the applied settings
        await clickElement('ai-configurator-discard', 'Discard button');
        await shortPause();

        // --- Switch to Throughput for deployment ---
        log.step('Switching to throughput optimization...');
        await narrate('ai_optimizer_throughput');
        await mediumPause();
        
        // Click throughput button
        await clickElement('ai-configurator-throughput', 'Throughput optimization');
        await shortPause();
        
        // Click Optimize button
        await clickElement('ai-configurator-optimize', 'Optimize button');
        
        // Wait for analysis to complete
        log.step('Waiting for throughput analysis...');
        await page.waitForSelector('[data-testid="ai-configurator-result"]', { 
          state: 'visible', 
          timeout: 30000 
        });
        await screenshot('ai-config-throughput-result');
        await narrate('ai_optimizer_throughput_result');
        await longPause();

        // Discard the throughput configuration (we'll deploy with aggregated mode)
        log.step('Discarding throughput configuration...');
        await clickElement('ai-configurator-discard', 'Discard button');
        await shortPause();
        
        // Select aggregated mode for deployment
        log.step('Selecting aggregated mode...');
        await clickElement('deploy-mode-aggregated', 'Aggregated mode');
        await shortPause();
        
        // Select vLLM engine for deployment
        log.step('Selecting vLLM engine...');
        await clickElement('deploy-engine-option-vllm', 'vLLM engine');
        await shortPause();
        log.success('Aggregated mode with vLLM selected for deployment');

        } catch (error) {
          log.warning(`AI Configurator: ${error instanceof Error ? error.message : error}`);
        }
      }
    } else {
      log.info('Skipping AI Configurator (DEMO_SKIP_AI_CONFIGURATOR=true)');
    }

    // Show Pricing Estimator (BEFORE deploying)
    if (!config.features.skipCostEstimate) {
      log.step('Showing pricing estimator...');
      if (page) {
        // Scroll to cost estimate card
        await scrollToElement('cost-estimate-card', 'Cost estimate card');
        await shortPause();
        
        // Wait for cost estimate to load and expand
        log.step('Waiting for cost estimate to load...');
        try {
          // Wait for pricing data to load first (the card re-renders when data arrives)
          // This avoids clicking on an unstable element
          await page.waitForSelector('[data-testid="cost-estimate-card"]', { 
            state: 'visible', 
            timeout: 10000 
          });
          
          // Wait a moment for React to finish any re-renders
          await pause(1000);
          
          // Wait for the cost data to be loaded before clicking
          // Check for either the loaded state OR the hourly cost (covers both cases)
          const loaded = await Promise.race([
            page.waitForSelector('[data-testid="cost-estimate-loaded"]', { timeout: 15000 }).then(() => true),
            page.waitForSelector('[data-testid="hourly-cost"]', { timeout: 15000 }).then(() => true),
          ]).catch(() => false);
          
          if (loaded) {
            log.success('Cost estimate data loaded');
          } else {
            log.step('Cost data still loading, will expand anyway...');
          }
          
          // Now click to expand using page.click which re-queries the element
          await page.click('[data-testid="cost-estimate-card"]', { timeout: 5000 });
          await mediumPause();
          log.success('Cost estimate panel expanded');
          await screenshot('cost-estimate-expanded');
          
        } catch (error) {
          log.warning(`Cost estimate: ${error instanceof Error ? error.message : error}`);
        }
      }
      await narrate('pricing_estimator');
      await longPause();
    } else {
      log.info('Skipping cost estimate (DEMO_SKIP_COST_ESTIMATE=true)');
    }

    // NOW submit the deployment after reviewing cost estimate
      await narrate('deploy_submit');
      await mediumPause();
      await submitDeployment();

      // Monitor deployment
      await navigateTo('deployments');
      await narrate('monitoring');
      await longPause();

      // Wait for deployment to reach Running state
      log.step('Waiting for deployment to reach Running state...');
      await waitForDeploymentRunning();
      await screenshot('deployment-running-dynamo');
      
      await narrate('deployment_ready');
      await mediumPause();
    } else {
      log.info('Skipping Dynamo deployment (DEMO_SKIP_DYNAMO_DEPLOY=true)');
      // Navigate to deployments page to show existing deployment
      await navigateTo('deployments');
      await mediumPause();
    }

    // Ayna inference test - set up port-forward and wait for user interaction
    if (!config.features.skipDynamoInference) {
      log.phase('LIVE INFERENCE TEST');
      await narrate('port_forward_intro');
      await mediumPause();
      
      // Set up port-forward and wait for Ayna interaction
      await setupPortForwardForAyna('qwen3');
      await longPause();
    } else {
      log.info('Skipping Dynamo inference (DEMO_SKIP_DYNAMO_INFERENCE=true)');
    }

    // Now show KAITO CPU deployment
    if (!config.features.skipKaitoDeploy) {
      log.phase('KAITO CPU INFERENCE');
      await narrate('kaito_cpu_intro');
      await mediumPause();

      // Navigate back to Models
      await navigateTo('models');
      await mediumPause();

      // Open deploy modal for KAITO CPU model
      const kaitoModalOpened = await openDeployModal(config.modelCpu.id, 'kaito');
      if (!kaitoModalOpened) {
        log.warning('Failed to open KAITO deploy modal, skipping deployment');
        return;
      }
      await screenshot('deploy-form-kaito-cpu');
      await narrate('kaito_cpu_deploy');
      await mediumPause();
      
      // Submit the KAITO deployment
      await submitDeployment();

      // Monitor KAITO deployment
      await navigateTo('deployments');
      await longPause();

      // Wait for KAITO deployment to reach Running state
      log.step('Waiting for KAITO CPU deployment to reach Running state...');
      await waitForDeploymentRunning();
      await screenshot('deployment-running-kaito-cpu');
      
      await narrate('kaito_cpu_ready');
      await mediumPause();
    } else {
      log.info('Skipping KAITO deployment (DEMO_SKIP_KAITO_DEPLOY=true)');
      // Navigate to deployments page to show existing deployment
      await navigateTo('deployments');
      await mediumPause();
    }

    // Ayna inference test for KAITO CPU
    if (!config.features.skipKaitoInference) {
      log.phase('KAITO CPU INFERENCE TEST');
      await narrate('kaito_port_forward_intro');
      await mediumPause();
      
      // Set up port-forward and wait for Ayna interaction
      await setupPortForwardForAyna('llama');
      await narrate('kaito_chat_response');
      await longPause();
    } else {
      log.info('Skipping KAITO inference (DEMO_SKIP_KAITO_INFERENCE=true)');
    }

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
    
    // Print failure summary if any failures were captured
    printFailureSummary();
  } catch (error) {
    log.error(`UI phase failed: ${error}`);
    
    // Print failure summary even on hard failure
    printFailureSummary();
    
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
