import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export interface Profile {
  id: string
  display_name: string
  created_at: string
}

export const profileQueryKey = (userId?: string) => ['profile', userId] as const

export function useMyProfile(userId?: string) {
  return useQuery<Profile | null>({
    queryKey: profileQueryKey(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) {
        return null
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, created_at')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        throw error
      }

      return data
    },
  })
}

export function useUpdateDisplayName(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rawDisplayName: string) => {
      if (!userId) {
        throw new Error('No hay sesión activa para actualizar el nombre.')
      }

      const displayName = rawDisplayName.trim()
      if (!displayName) {
        throw new Error('El display name no puede estar vacío.')
      }

      const profileResponse = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', userId)

      if (profileResponse.error) {
        throw profileResponse.error
      }

      const authResponse = await supabase.auth.updateUser({
        data: { display_name: displayName },
      })

      if (authResponse.error) {
        throw authResponse.error
      }

      return displayName
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      ])
    },
  })
}
