/**
 * `fixed_expenses.id` is a Postgres `uuid` column. Optimistic mutations seed
 * the React Query cache with synthetic `temp-<ts>-<rand>` ids (see
 * `makeTentativeId` in use-fixed-expenses.ts) until the real server row lands.
 * Those synthetic ids must never reach a `.in('fixed_expense_id', …)` filter:
 * PostgREST forwards them verbatim and Postgres rejects the whole request with
 * `22P02 invalid input syntax for type uuid`, so the payments query 400s until
 * the refetch swaps in the real uuid. Keep only uuid-shaped ids at the query
 * boundary.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isPersistedFixedExpenseId(id: string): boolean {
  return UUID_RE.test(id)
}

export function keepPersistedFixedExpenseIds(
  ids: readonly string[],
): string[] {
  return ids.filter(isPersistedFixedExpenseId)
}
