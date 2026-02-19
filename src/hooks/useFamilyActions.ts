import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { generateFamilyCode } from '../utils/generateFamilyCode'
import { familyQueryKey } from './useFamily'

interface FamilyRpcResult {
  family_id: string
  family_code: string
}

function pickRpcResult(data: unknown): FamilyRpcResult {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No se pudo obtener la familia desde Supabase.')
  }

  return data[0] as FamilyRpcResult
}

export function useBootstrapFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error('No hay sesión activa para crear la familia.')
      }

      const { data, error } = await supabase.rpc('bootstrap_family', {
        p_preferred_code: generateFamilyCode(6),
      })

      if (error) {
        throw error
      }

      return pickRpcResult(data)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      ])
    },
  })
}

export function useJoinFamily(userId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rawCode: string) => {
      if (!userId) {
        throw new Error('No hay sesión activa para unirse a la familia.')
      }

      const normalizedCode = rawCode.trim().toUpperCase()
      if (!normalizedCode) {
        throw new Error('Ingresá un código de familia válido.')
      }

      const { data, error } = await supabase.rpc('join_family_by_code', {
        p_code: normalizedCode,
      })

      if (error) {
        throw error
      }

      return pickRpcResult(data)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: familyQueryKey(userId) }),
        queryClient.invalidateQueries({ queryKey: ['categories'] }),
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
      ])
    },
  })
}
