import { useQuery } from '@tanstack/react-query'
import { modelsApi, type Model } from '@/lib/api'

// Fallback static models for when API is unavailable
const fallbackModels: Model[] = [
  {
    id: 'Qwen/Qwen3-0.6B',
    name: 'Qwen3 0.6B',
    description: 'Small, efficient model ideal for development and testing',
    size: '0.6B',
    task: 'text-generation',
    contextLength: 32768,
    supportedEngines: ['vllm', 'sglang', 'trtllm'],
    minGpuMemory: '4GB',
  },
  {
    id: 'Qwen/Qwen2.5-1.5B-Instruct',
    name: 'Qwen2.5 1.5B Instruct',
    description: 'Instruction-tuned model with strong performance',
    size: '1.5B',
    task: 'chat',
    contextLength: 32768,
    supportedEngines: ['vllm', 'sglang', 'trtllm'],
    minGpuMemory: '6GB',
  },
  {
    id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-8B',
    name: 'DeepSeek R1 Distill 8B',
    description: 'Reasoning-focused model with strong analytical capabilities',
    size: '8B',
    task: 'chat',
    contextLength: 16384,
    supportedEngines: ['vllm', 'sglang'],
    minGpuMemory: '16GB',
  },
  {
    id: 'meta-llama/Llama-3.2-1B-Instruct',
    name: 'Llama 3.2 1B Instruct',
    description: 'Compact Llama model optimized for instruction following',
    size: '1B',
    task: 'chat',
    contextLength: 131072,
    supportedEngines: ['vllm', 'sglang', 'trtllm'],
    minGpuMemory: '4GB',
  },
  {
    id: 'meta-llama/Llama-3.2-3B-Instruct',
    name: 'Llama 3.2 3B Instruct',
    description: 'Balanced Llama model for various tasks',
    size: '3B',
    task: 'chat',
    contextLength: 131072,
    supportedEngines: ['vllm', 'sglang', 'trtllm'],
    minGpuMemory: '8GB',
  },
  {
    id: 'mistralai/Mistral-7B-Instruct-v0.3',
    name: 'Mistral 7B Instruct v0.3',
    description: 'Powerful instruction-tuned model from Mistral AI',
    size: '7B',
    task: 'chat',
    contextLength: 32768,
    supportedEngines: ['vllm', 'sglang', 'trtllm'],
    minGpuMemory: '16GB',
  },
  {
    id: 'microsoft/Phi-3-mini-4k-instruct',
    name: 'Phi-3 Mini 4K Instruct',
    description: "Microsoft's efficient small language model",
    size: '3.8B',
    task: 'chat',
    contextLength: 4096,
    supportedEngines: ['vllm', 'sglang'],
    minGpuMemory: '8GB',
  },
  {
    id: 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
    name: 'TinyLlama 1.1B Chat',
    description: 'Lightweight chat model for resource-constrained environments',
    size: '1.1B',
    task: 'chat',
    contextLength: 2048,
    supportedEngines: ['vllm', 'sglang', 'trtllm'],
    minGpuMemory: '4GB',
  },
]

export function useModels() {
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      try {
        const data = await modelsApi.list()
        return data.models
      } catch {
        // Return fallback models if API is unavailable
        return fallbackModels
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useModel(id: string | undefined) {
  const { data: models } = useModels()

  return useQuery({
    queryKey: ['model', id],
    queryFn: async () => {
      if (!id) return null

      // First try to find in already loaded models
      const localModel = models?.find(m => m.id === id)
      if (localModel) return localModel

      // Otherwise fetch from API
      try {
        return await modelsApi.get(id)
      } catch {
        // Try fallback
        return fallbackModels.find(m => m.id === id) || null
      }
    },
    enabled: !!id,
  })
}
