import { spawn } from 'child_process';
import type { HelmRepo, HelmChart } from '../providers/types';

/**
 * NVIDIA GPU Operator Helm configuration
 */
export const GPU_OPERATOR_REPO: HelmRepo = {
  name: 'nvidia',
  url: 'https://helm.ngc.nvidia.com/nvidia',
};

export const GPU_OPERATOR_CHART: HelmChart = {
  name: 'gpu-operator',
  chart: 'nvidia/gpu-operator',
  namespace: 'gpu-operator',
  createNamespace: true,
};

/**
 * Result of a Helm command execution
 */
export interface HelmResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Helm release information from `helm list`
 */
export interface HelmRelease {
  name: string;
  namespace: string;
  revision: string;
  updated: string;
  status: string;
  chart: string;
  appVersion: string;
}

/**
 * Stream callback for real-time output
 */
export type StreamCallback = (data: string, stream: 'stdout' | 'stderr') => void;

/**
 * Helm Service
 * Provides Helm CLI integration for provider installation
 */
class HelmService {
  private helmPath: string;

  constructor() {
    // Use HELM_PATH env var or default to 'helm' in PATH
    this.helmPath = process.env.HELM_PATH || 'helm';
  }

  /**
   * Execute a Helm command
   */
  private async execute(
    args: string[],
    onStream?: StreamCallback,
    timeoutMs: number = 300000 // 5 minutes default timeout
  ): Promise<HelmResult> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      console.log(`[HelmService] Executing: ${this.helmPath} ${args.join(' ')}`);

      const proc = spawn(this.helmPath, args, {
        env: { ...process.env },
        shell: false,
      });

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeoutMs);

      proc.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        if (onStream) {
          onStream(text, 'stdout');
        }
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        if (onStream) {
          onStream(text, 'stderr');
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        
        if (timedOut) {
          resolve({
            success: false,
            stdout,
            stderr: stderr + '\nCommand timed out',
            exitCode: null,
          });
        } else {
          resolve({
            success: code === 0,
            stdout,
            stderr,
            exitCode: code,
          });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          stdout,
          stderr: `Failed to execute helm: ${err.message}`,
          exitCode: null,
        });
      });
    });
  }

  /**
   * Check if Helm is available
   */
  async checkHelmAvailable(): Promise<{ available: boolean; version?: string; error?: string }> {
    const result = await this.execute(['version', '--short']);
    
    if (result.success) {
      return {
        available: true,
        version: result.stdout.trim(),
      };
    }

    return {
      available: false,
      error: result.stderr || 'Helm not found. Please install Helm CLI.',
    };
  }

  /**
   * Add a Helm repository
   */
  async repoAdd(repo: HelmRepo, onStream?: StreamCallback): Promise<HelmResult> {
    return this.execute(['repo', 'add', repo.name, repo.url, '--force-update'], onStream);
  }

  /**
   * Update Helm repositories
   */
  async repoUpdate(onStream?: StreamCallback): Promise<HelmResult> {
    return this.execute(['repo', 'update'], onStream);
  }

  /**
   * List Helm releases in a namespace
   */
  async list(namespace?: string): Promise<{ success: boolean; releases: HelmRelease[]; error?: string }> {
    const args = ['list', '--output', 'json'];
    if (namespace) {
      args.push('--namespace', namespace);
    } else {
      args.push('--all-namespaces');
    }

    const result = await this.execute(args);

    if (!result.success) {
      return {
        success: false,
        releases: [],
        error: result.stderr,
      };
    }

    try {
      const releases = JSON.parse(result.stdout || '[]') as HelmRelease[];
      return {
        success: true,
        releases,
      };
    } catch {
      return {
        success: true,
        releases: [],
      };
    }
  }

  /**
   * Install a Helm chart
   */
  async install(
    chart: HelmChart,
    onStream?: StreamCallback
  ): Promise<HelmResult> {
    const args = ['install', chart.name, chart.chart];
    
    args.push('--namespace', chart.namespace);
    
    if (chart.createNamespace) {
      args.push('--create-namespace');
    }

    if (chart.version) {
      args.push('--version', chart.version);
    }

    if (chart.values) {
      args.push('--set-json', JSON.stringify(chart.values));
    }

    args.push('--wait', '--timeout', '10m');

    return this.execute(args, onStream);
  }

  /**
   * Upgrade a Helm release (or install if not exists)
   */
  async upgrade(
    chart: HelmChart,
    onStream?: StreamCallback
  ): Promise<HelmResult> {
    const args = ['upgrade', chart.name, chart.chart, '--install'];
    
    args.push('--namespace', chart.namespace);
    
    if (chart.createNamespace) {
      args.push('--create-namespace');
    }

    if (chart.version) {
      args.push('--version', chart.version);
    }

    if (chart.values) {
      args.push('--set-json', JSON.stringify(chart.values));
    }

    args.push('--wait', '--timeout', '10m');

    return this.execute(args, onStream);
  }

  /**
   * Uninstall a Helm release
   */
  async uninstall(
    releaseName: string,
    namespace: string,
    onStream?: StreamCallback
  ): Promise<HelmResult> {
    return this.execute(['uninstall', releaseName, '--namespace', namespace], onStream);
  }

  /**
   * Get release status
   */
  async status(releaseName: string, namespace: string): Promise<HelmResult> {
    return this.execute(['status', releaseName, '--namespace', namespace]);
  }

  /**
   * Install all required repos and charts for a provider
   */
  async installProvider(
    repos: HelmRepo[],
    charts: HelmChart[],
    onStream?: StreamCallback
  ): Promise<{ success: boolean; results: Array<{ step: string; result: HelmResult }> }> {
    const results: Array<{ step: string; result: HelmResult }> = [];

    // Add repos
    for (const repo of repos) {
      if (onStream) {
        onStream(`Adding Helm repository: ${repo.name}\n`, 'stdout');
      }
      const result = await this.repoAdd(repo, onStream);
      results.push({ step: `repo-add-${repo.name}`, result });
      if (!result.success) {
        return { success: false, results };
      }
    }

    // Update repos
    if (repos.length > 0) {
      if (onStream) {
        onStream('Updating Helm repositories...\n', 'stdout');
      }
      const updateResult = await this.repoUpdate(onStream);
      results.push({ step: 'repo-update', result: updateResult });
      if (!updateResult.success) {
        return { success: false, results };
      }
    }

    // Install charts
    for (const chart of charts) {
      if (onStream) {
        onStream(`Installing chart: ${chart.chart}\n`, 'stdout');
      }
      const result = await this.install(chart, onStream);
      results.push({ step: `install-${chart.name}`, result });
      if (!result.success) {
        return { success: false, results };
      }
    }

    return { success: true, results };
  }

  /**
   * Get the Helm commands that would be run for provider installation
   * Useful for displaying to users before actually running
   */
  getInstallCommands(repos: HelmRepo[], charts: HelmChart[]): string[] {
    const commands: string[] = [];

    for (const repo of repos) {
      commands.push(`helm repo add ${repo.name} ${repo.url}`);
    }

    if (repos.length > 0) {
      commands.push('helm repo update');
    }

    for (const chart of charts) {
      let cmd = `helm install ${chart.name} ${chart.chart}`;
      cmd += ` --namespace ${chart.namespace}`;
      if (chart.createNamespace) {
        cmd += ' --create-namespace';
      }
      if (chart.version) {
        cmd += ` --version ${chart.version}`;
      }
      commands.push(cmd);
    }

    return commands;
  }

  /**
   * Install the NVIDIA GPU Operator
   */
  async installGpuOperator(
    onStream?: StreamCallback
  ): Promise<{ success: boolean; results: Array<{ step: string; result: HelmResult }> }> {
    return this.installProvider([GPU_OPERATOR_REPO], [GPU_OPERATOR_CHART], onStream);
  }

  /**
   * Get the Helm commands for GPU Operator installation
   */
  getGpuOperatorCommands(): string[] {
    return this.getInstallCommands([GPU_OPERATOR_REPO], [GPU_OPERATOR_CHART]);
  }
}

// Export singleton instance
export const helmService = new HelmService();
