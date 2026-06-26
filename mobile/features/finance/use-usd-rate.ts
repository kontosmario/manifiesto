import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface UsdRate {
  currency: string
  /** Unidades de moneda local por 1 USD (ej. ARS 1480 → 1 USD). */
  ratePerUsd: number
  /** Fuente: 'dolarapi:blue' | 'open.er-api' | 'identity'. */
  source: string
  /** Fecha de la cotización (ISO). */
  asOf: string
  cached?: boolean
  stale?: boolean
}

export const usdRateQueryKey = (currency: string) =>
  ['usd-rate', currency] as const

async function fetchUsdRate(currency: string): Promise<UsdRate> {
  const sessionResponse = await supabase.auth.getSession()
  const accessToken = sessionResponse.data.session?.access_token
  const { data, error } = await supabase.functions.invoke('usd-rate', {
    body: { currency },
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  })
  if (error) throw error
  return data as UsdRate
}

/**
 * Cotización USD para la moneda dada, traída del backend (edge function
 * `usd-rate`, que cachea 3h + tiene fallback). `staleTime` 1h porque el valor se
 * mueve pocas veces al día. Pasa la moneda del hogar (family_finance.local_currency).
 */
export function useUsdRate(currency: string | undefined) {
  return useQuery({
    queryKey: usdRateQueryKey(currency ?? 'ARS'),
    queryFn: () => fetchUsdRate(currency ?? 'ARS'),
    enabled: Boolean(currency),
    staleTime: 60 * 60_000,
    gcTime: 6 * 60 * 60_000,
    retry: 1,
  })
}

/** Convierte un monto en moneda local a USD. Devuelve null si no hay rate. */
export function toUsd(amountLocal: number, rate: UsdRate | undefined): number | null {
  if (!rate || !Number.isFinite(rate.ratePerUsd) || rate.ratePerUsd <= 0) {
    return null
  }
  return amountLocal / rate.ratePerUsd
}
