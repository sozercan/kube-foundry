import { useState, useMemo } from 'react'
import { useModels } from '@/hooks/useModels'
import { ModelGrid } from '@/components/models/ModelGrid'
import { ModelSearch } from '@/components/models/ModelSearch'
import { Loader2 } from 'lucide-react'

type Engine = 'vllm' | 'sglang' | 'trtllm'

export function ModelsPage() {
  const { data: models, isLoading, error } = useModels()
  const [search, setSearch] = useState('')
  const [selectedEngines, setSelectedEngines] = useState<Engine[]>([])

  const filteredModels = useMemo(() => {
    if (!models) return []

    return models.filter((model) => {
      // Filter by search
      const searchMatch = search === '' ||
        model.name.toLowerCase().includes(search.toLowerCase()) ||
        model.id.toLowerCase().includes(search.toLowerCase()) ||
        model.description.toLowerCase().includes(search.toLowerCase())

      // Filter by engine
      const engineMatch = selectedEngines.length === 0 ||
        selectedEngines.some((engine) => model.supportedEngines.includes(engine))

      return searchMatch && engineMatch
    })
  }, [models, search, selectedEngines])

  const handleEngineToggle = (engine: Engine) => {
    setSelectedEngines((prev) =>
      prev.includes(engine)
        ? prev.filter((e) => e !== engine)
        : [...prev, engine]
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-lg font-medium text-destructive">
          Failed to load models
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Model Catalog</h1>
        <p className="text-muted-foreground mt-1">
          Select a model to deploy to your Kubernetes cluster
        </p>
      </div>

      <ModelSearch
        search={search}
        onSearchChange={setSearch}
        selectedEngines={selectedEngines}
        onEngineToggle={handleEngineToggle}
      />

      <ModelGrid models={filteredModels} />
    </div>
  )
}
