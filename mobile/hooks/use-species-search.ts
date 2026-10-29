import type { Species } from '@/components/plants/species-picker'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

// Artensuche für SpeciesPicker (Hook, wird bei jedem Rendern mit dem aktuellen Suchtext aufgerufen).
export function useSpeciesSearch(search: string): Species[] {
  const query = search.trim()
  const results = useQuery(api.plant_species.searchPlantSpecies, query ? { search: query } : 'skip')
  return (results ?? []).slice(0, 5).map((species) => ({ id: species.id, common_name: species.common_name, name: species.name }))
}
