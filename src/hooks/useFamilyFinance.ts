import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

interface FinanceStoragePayload {
  monthly_income: number
  savings_goal: number
  usd_exchange_rate: number
}

export interface FamilyFinance extends FinanceStoragePayload {
  source: 'supabase' | 'fallback'
}

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])
export const DEFAULT_USD_EXCHANGE_RATE = 1000

function financeStorageKey(familyId: string): string {
  return `family_finance_fallback:${familyId}`
}

function isMissingTableError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const message = error.message?.toLowerCase() ?? ''

  return (
    MISSING_TABLE_CODES.has(code) ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

function isMissingUsdExchangeRateColumnError(error: PostgrestError): boolean {
  const code = error.code ?? ''
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase()

  return MISSING_COLUMN_CODES.has(code) && text.includes('usd_exchange_rate')
}

function readFallbackFinance(familyId: string): FinanceStoragePayload {
  if (typeof window === 'undefined') {
    return {
      monthly_income: 0,
      savings_goal: 0,
      usd_exchange_rate: DEFAULT_USD_EXCHANGE_RATE,
    }
  }

  const raw = window.localStorage.getItem(financeStorageKey(familyId))
  if (!raw) {
    return {
      monthly_income: 0,
      savings_goal: 0,
      usd_exchange_rate: DEFAULT_USD_EXCHANGE_RATE,
    }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<FinanceStoragePayload>
    const usdExchangeRate = Number(parsed.usd_exchange_rate ?? DEFAULT_USD_EXCHANGE_RATE)

    return {
      monthly_income: Number(parsed.monthly_income ?? 0),
      savings_goal: Number(parsed.savings_goal ?? 0),
      usd_exchange_rate:
        Number.isFinite(usdExchangeRate) && usdExchangeRate > 0
          ? usdExchangeRate
          : DEFAULT_USD_EXCHANGE_RATE,
    }
  } catch {
    return {
      monthly_income: 0,
      savings_goal: 0,
      usd_exchange_rate: DEFAULT_USD_EXCHANGE_RATE,
    }
  }
}

function writeFallbackFinance(familyId: string, payload: FinanceStoragePayload): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(financeStorageKey(familyId), JSON.stringify(payload))
}

export const familyFinanceQueryKey = (familyId?: string) => ['family-finance', familyId] as const

export function useFamilyFinance(familyId?: string) {
  return useQuery<FamilyFinance>({
    queryKey: familyFinanceQueryKey(familyId),
    enabled: Boolean(familyId),
    queryFn: async () => {
      if (!familyId) {
        return {
          monthly_income: 0,
          savings_goal: 0,
          usd_exchange_rate: DEFAULT_USD_EXCHANGE_RATE,
          source: 'fallback',
        }
      }

      const fallbackValues = readFallbackFinance(familyId)

      const { data, error } = await supabase
        .from('family_finance')
        .select('*')
        .eq('family_id', familyId)
        .maybeSingle()

      if (error) {
        if (isMissingTableError(error)) {
          return {
            ...fallbackValues,
            source: 'fallback',
          }
        }

        return {
          ...fallbackValues,
          source: 'fallback',
        }
      }

      if (!data) {
        return {
          ...fallbackValues,
          source: 'fallback',
        }
      }

      return {
        monthly_income: Number(data.monthly_income ?? 0),
        savings_goal: Number(data.savings_goal ?? 0),
        usd_exchange_rate:
          Number(data.usd_exchange_rate ?? fallbackValues.usd_exchange_rate) > 0
            ? Number(data.usd_exchange_rate ?? fallbackValues.usd_exchange_rate)
            : DEFAULT_USD_EXCHANGE_RATE,
        source: 'supabase',
      }
    },
  })
}

interface UpsertFamilyFinanceInput {
  monthlyIncome: number
  savingsGoal: number
  usdExchangeRate: number
}

export function useUpsertFamilyFinance(familyId?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      monthlyIncome,
      savingsGoal,
      usdExchangeRate,
    }: UpsertFamilyFinanceInput) => {
      if (!familyId) {
        throw new Error('No hay familia activa para guardar métricas financieras.')
      }

      if (
        !Number.isFinite(monthlyIncome) ||
        !Number.isFinite(savingsGoal) ||
        !Number.isFinite(usdExchangeRate) ||
        monthlyIncome < 0 ||
        savingsGoal < 0 ||
        usdExchangeRate <= 0
      ) {
        throw new Error('Ingreso y ahorro objetivo deben ser válidos (>= 0) y dólar > 0.')
      }

      const payload: FinanceStoragePayload = {
        monthly_income: monthlyIncome,
        savings_goal: savingsGoal,
        usd_exchange_rate: usdExchangeRate,
      }

      writeFallbackFinance(familyId, payload)

      const { error } = await supabase.from('family_finance').upsert(
        {
          family_id: familyId,
          ...payload,
        },
        {
          onConflict: 'family_id',
        },
      )

      if (error) {
        if (isMissingUsdExchangeRateColumnError(error)) {
          const { error: legacyError } = await supabase.from('family_finance').upsert(
            {
              family_id: familyId,
              monthly_income: monthlyIncome,
              savings_goal: savingsGoal,
            },
            {
              onConflict: 'family_id',
            },
          )

          if (!legacyError) {
            return {
              ...payload,
              source: 'fallback' as const,
            }
          }
        }

        if (isMissingTableError(error)) {
          return {
            ...payload,
            source: 'fallback' as const,
          }
        }

        return {
          ...payload,
          source: 'fallback' as const,
        }
      }

      return {
        ...payload,
        source: 'supabase' as const,
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: familyFinanceQueryKey(familyId) })
    },
  })
}
