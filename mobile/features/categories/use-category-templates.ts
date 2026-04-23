import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface RawCategoryTemplate {
  id: string
  name: string
  quick_descriptions: string[] | null
  sort_order: number
}

export interface CategoryTemplate {
  id: string
  name: string
  quickDescriptions: string[]
  sortOrder: number
}

export const categoryTemplatesQueryKey = ['category-templates'] as const

export function useCategoryTemplates() {
  return useQuery<CategoryTemplate[]>({
    queryKey: categoryTemplatesQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('category_templates')
        .select('id, name, quick_descriptions, sort_order')
        .order('sort_order', { ascending: true })

      if (error) {
        throw error
      }

      return ((data as RawCategoryTemplate[] | null) ?? []).map((template) => ({
        id: template.id,
        name: template.name,
        quickDescriptions: template.quick_descriptions ?? [],
        sortOrder: template.sort_order,
      }))
    },
  })
}
