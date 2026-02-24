import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface RawFixedExpense {
  id: string
  family_id: string
  name: string
  amount: number | string
  created_at: string
  updated_at: string
}

export interface FixedExpense {
  id: string
  family_id: string
  name: string
  amount: number
  created_at: string
  updated_at: string
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

function isMissingFixedExpensesTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return (
    MISSING_TABLE_CODES.has(code) ||
    text.includes('does not exist') ||
    text.includes('schema cache')
  )
}

function asFixedExpense(row: RawFixedExpense): FixedExpense {
  return {
    ...row,
    amount: Number(row.amount ?? 0),
  }
}

export const fixedExpensesQueryKey = (familyId?: string) => ['fixed-expenses', familyId] as const

export function useFixedExpenses(familyId?: string) {
  return useQuery<FixedExpense[]>({
    queryKey: fixedExpensesQueryKey(familyId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      if (!familyId) {
        return []
      }

      const { data, error } = await supabase
        .from('fixed_expenses')
        .select('id, family_id, name, amount, created_at, updated_at')
        .eq('family_id', familyId)
        .order('created_at', { ascending: true })

      if (error) {
        if (isMissingFixedExpensesTableError(error)) {
          return []
        }

        throw error
      }

      return ((data as RawFixedExpense[] | null) ?? []).map(asFixedExpense)
    },
  })
}

interface CreateFixedExpenseInput {
  name: string
  amount: number
}

export function useCreateFixedExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, amount }: CreateFixedExpenseInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para crear un gasto fijo.')
      }

      const normalizedName = name.trim()
      if (!normalizedName) {
        throw new Error('El nombre del gasto fijo no puede estar vacío.')
      }

      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('El monto del gasto fijo debe ser válido (>= 0).')
      }

      const { error } = await supabase.from('fixed_expenses').insert({
        family_id: familyId,
        name: normalizedName,
        amount,
      })

      if (error) {
        if (isMissingFixedExpensesTableError(error)) {
          throw new Error('Falta correr la migración SQL para habilitar Gastos Fijos.')
        }

        throw error
      }
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fixedExpensesQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['family-notifications', familyId] }),
      ])

      if (familyId) {
        const pushBody = `${variables.name.trim()} · $${variables.amount}`
        void supabase.functions
          .invoke('send-family-push', {
            body: {
              familyId,
              title: 'Nuevo gasto fijo',
              body: pushBody,
              kind: 'fixed_expense',
              url: '/app/fixed-expenses',
            },
          })
          .catch(() => {})
      }
    },
  })
}

interface UpdateFixedExpenseInput {
  fixedExpenseId: string
  name: string
  amount: number
}

export function useUpdateFixedExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ fixedExpenseId, name, amount }: UpdateFixedExpenseInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para editar un gasto fijo.')
      }

      const normalizedName = name.trim()
      if (!normalizedName) {
        throw new Error('El nombre del gasto fijo no puede estar vacío.')
      }

      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error('El monto del gasto fijo debe ser válido (>= 0).')
      }

      const { error } = await supabase
        .from('fixed_expenses')
        .update({
          name: normalizedName,
          amount,
        })
        .eq('id', fixedExpenseId)
        .eq('family_id', familyId)

      if (error) {
        if (isMissingFixedExpensesTableError(error)) {
          throw new Error('Falta correr la migración SQL para habilitar Gastos Fijos.')
        }

        throw error
      }
    },
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fixedExpensesQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['family-notifications', familyId] }),
      ])

      if (familyId) {
        const pushBody = `${variables.name.trim()} · $${variables.amount}`
        void supabase.functions
          .invoke('send-family-push', {
            body: {
              familyId,
              title: 'Gasto fijo actualizado',
              body: pushBody,
              kind: 'fixed_expense',
              url: '/app/fixed-expenses',
            },
          })
          .catch(() => {})
      }
    },
  })
}

export function useDeleteFixedExpense(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (fixedExpenseId: string) => {
      if (!familyId) {
        throw new Error('No hay familia activa para borrar un gasto fijo.')
      }

      const { error } = await supabase
        .from('fixed_expenses')
        .delete()
        .eq('id', fixedExpenseId)
        .eq('family_id', familyId)

      if (error) {
        if (isMissingFixedExpensesTableError(error)) {
          throw new Error('Falta correr la migración SQL para habilitar Gastos Fijos.')
        }

        throw error
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: fixedExpensesQueryKey(familyId) }),
        queryClient.invalidateQueries({ queryKey: ['family-notifications', familyId] }),
      ])

      if (familyId) {
        void supabase.functions
          .invoke('send-family-push', {
            body: {
              familyId,
              title: 'Gasto fijo eliminado',
              body: 'Se eliminó un gasto fijo.',
              kind: 'fixed_expense',
              url: '/app/fixed-expenses',
            },
          })
          .catch(() => {})
      }
    },
  })
}
