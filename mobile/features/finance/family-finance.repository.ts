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

  const upsertBody: Record<string, unknown> = {
    family_id: familyId,
    ...financeInputToStoragePayload(input),
  }

  const runUpsert = async (body: Record<string, unknown>) => {
    const { error } = await supabase.from('family_finance').upsert(body, {
      onConflict: 'family_id',
    })
    return error
  }

  let upsertError = await runUpsert(upsertBody)
  const optionalColumns: Array<
    | 'daily_budget_checkin_hour'
    | 'daily_budget_nudges_enabled'
    | 'daily_budget_buffer_value'
    | 'daily_budget_buffer_mode'
    | 'last_salary_confirmed_at'
    | 'salary_payment_day'
    | 'savings_goal_percent'
    | 'usd_exchange_rate'
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
    'current_cycle_starting_balance',
    'current_cycle_anchor',
  ]

  for (const columnName of optionalColumns) {
    if (!upsertError || !isMissingFinanceColumnError(upsertError, columnName)) {
      continue
    }

    delete upsertBody[columnName]
    upsertError = await runUpsert(upsertBody)
  }

  if (upsertError) {
    if (isMissingTableError(upsertError)) {
      return mapFamilyFinanceRecord(payload, 'fallback')
    }

    return mapFamilyFinanceRecord(payload, 'fallback')
  }

  return mapFamilyFinanceRecord(payload, 'supabase')
}
