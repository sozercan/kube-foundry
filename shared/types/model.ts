export type Engine = 'vllm' | 'sglang' | 'trtllm';
export type ModelTask = 'text-generation' | 'chat' | 'fill-mask';

export interface Model {
  id: string;                    // HuggingFace model ID (e.g., "Qwen/Qwen3-0.6B")
  name: string;                  // Display name
  description: string;           // Brief description
  size: string;                  // Parameter count (e.g., "0.6B")
  task: ModelTask;
  parameters?: number;           // Actual parameter count
  contextLength?: number;        // Max context length
  license?: string;              // Model license
  supportedEngines: Engine[];    // Compatible inference engines
  minGpuMemory?: string;         // Minimum GPU memory (e.g., "8GB")
}
