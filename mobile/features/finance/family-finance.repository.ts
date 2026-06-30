import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'
import { supabase } from '@/lib/supabase'
import {
  defaultFinanceValues,
  financeInputToStoragePayload,
  isMissingFinanceColumnError,
  isMissingTableError,
  mapFamilyFinanceRecord,
  normalizeFinancePayload,
  validateFamilyFinanceInput,
  type FamilyFinance,
  type FinanceStoragePayload,
  type UpsertFamilyFinanceInput,
} from '@/features/finance/family-finance.model'

function financeStorageKey(familyId: string): string {
  return `family_finance_fallback:${familyId}`
}

export async function readFallbackFinance(familyId: string): Promise<FinanceStoragePayload> {
  const raw = await getPersistentValue(financeStorageKey(familyId))
  if (!raw) {
    return defaultFinanceValues()
  }

  try {
    return normalizeFinancePayload(JSON.parse(raw) as Partial<FinanceStoragePayload>)
  } catch {
    return defaultFinanceValues()
  }
}

export async function writeFallbackFinance(
  familyId: string,
  payload: FinanceStoragePayload,
): Promise<void> {
  await setPersistentValue(financeStorageKey(familyId), JSON.stringify(payload))
}

export async function fetchFamilyFinance(familyId?: string): Promise<FamilyFinance> {
  if (!familyId) {
    return mapFamilyFinanceRecord(defaultFinanceValues(), 'fallback')
  }

  const fallbackValues = await readFallbackFinance(familyId)

  const { data, error } = await supabase
    .from('family_finance')
    .select('*')
    .eq('family_id', familyId)
    .maybeSingle()

  if (error || !data) {
    return mapFamilyFinanceRecord(fallbackValues, 'fallback')
  }

  return mapFamilyFinanceRecord(data, 'supabase')
}

export async function upsertFamilyFinance(
  familyId: string,
  input: UpsertFamilyFinanceInput,
): Promise<FamilyFinance> {
  const payload = validateFamilyFinanceInput(input)
  await writeFallbackFinance(familyId, payload)

  // Build the upsert body, then strip columnas que NO son editables vía la UI:
  //  · `monthly_reserve_amount`: la escribe el RPC de cierre de mes; enviarla
  //    pisaría la reserva acumulada.
  //  · `monthly_income`: es DERIVADA (= Σ de monthly_income_contribution de los
  //    miembros, vía trigger recompute_family_income). Escribirla desde la UI la
  //    pisaría con un valor que excluye a otros miembros. El ingreso se setea vía
  //    el RPC update_my_income_contribution. La columna tiene DEFAULT 0, así que
  //    omitirla del INSERT es seguro y el trigger la recalcula.
  const {
    monthly_reserve_amount: _omitReserve,
    monthly_income: _omitIncome,
    ...storagePayload
  } = financeInputToStoragePayload(input)
  void _omitReserve
  void _omitIncome
  const upsertBody: Record<string, unknown> = {
    family_id: familyId,
    ...storagePayload,
  }

  // `select().single()` devuelve el row updated (con la reserva real
  // tal como vive en DB) → lo usamos para que el caller pueda
  // setQueryData con data fresh y evitar flashes de cache stale.
  const runUpsert = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from('family_finance')
      .upsert(body, { onConflict: 'family_id' })
      .select('*')
      .maybeSingle()
    return { data, error }
  }

  let { data: upsertData, error: upsertError } = await runUpsert(upsertBody)
  const optionalColumns: Array<
    | 'daily_budget_checkin_hour'
    | 'daily_budget_nudges_enabled'
    | 'daily_budget_buffer_value'
    | 'daily_budget_buffer_mode'
    | 'last_salary_confirmed_at'
    | 'salary_payment_day'
    | 'savings_goal_percent'
    | 'usd_exchange_rate'
    | 'local_currency'
    | 'usd_rate_enabled'
    | 'current_cycle_starting_balance'
    | 'current_cycle_anchor'
  > = [
    'daily_budget_checkin_hour',
    'daily_budget_nudges_enabled',
    'daily_budget_buffer_value',
    'daily_budget_buffer_mode',
    'last_salary_confirmed_at',
    'salary_payment_day',
    'savings_goal_percent',
    'usd_exchange_rate',
    'local_currency',
    'usd_rate_enabled',
    'current_cycle_starting_balance',
    'current_cycle_anchor',
  ]

  for (const columnName of optionalColumns) {
    if (!upsertError || !isMissingFinanceColumnError(upsertError, columnName)) {
      continue
    }

    delete upsertBody[columnName]
    const retry = await runUpsert(upsertBody)
    upsertError = retry.error
    upsertData = retry.data
  }

  if (upsertError) {
    if (isMissingTableError(upsertError)) {
      return mapFamilyFinanceRecord(payload, 'fallback')
    }

    return mapFamilyFinanceRecord(payload, 'fallback')
  }

  // Preferimos el row real devuelto por el upsert: garantiza que
  // campos no editables vía UI (e.g. `monthly_reserve_amount`)
  // queden con su valor canónico de DB en el cache de React Query.
  if (upsertData) {
    return mapFamilyFinanceRecord(upsertData, 'supabase')
  }
  return mapFamilyFinanceRecord(payload, 'supabase')
}
