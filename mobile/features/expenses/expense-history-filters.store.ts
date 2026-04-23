import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { ALL_CATEGORIES_KEY, type PeriodFilter } from '@/features/expenses/expense-history'

interface ExpenseHistoryFiltersSnapshot {
  categorySelection: string
  periodFilter: PeriodFilter
  searchQuery: string
}

const DEFAULT_EXPENSE_HISTORY_FILTERS: ExpenseHistoryFiltersSnapshot = {
  categorySelection: ALL_CATEGORIES_KEY,
  periodFilter: 'cycle',
  searchQuery: '',
}

const filtersSnapshotByFamilyId = new Map<string, ExpenseHistoryFiltersSnapshot>()
const listeners = new Set<() => void>()

function emitChange() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

function getSnapshotForFamily(familyId?: string): ExpenseHistoryFiltersSnapshot {
  if (!familyId) {
    return DEFAULT_EXPENSE_HISTORY_FILTERS
  }

  return filtersSnapshotByFamilyId.get(familyId) ?? DEFAULT_EXPENSE_HISTORY_FILTERS
}

function setSnapshotForFamily(
  familyId: string,
  nextSnapshot: ExpenseHistoryFiltersSnapshot,
) {
  filtersSnapshotByFamilyId.set(familyId, nextSnapshot)
  emitChange()
}

export function useExpenseHistoryFilters(familyId?: string) {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => getSnapshotForFamily(familyId),
    () => getSnapshotForFamily(familyId),
  )

  const setCategorySelection = useCallback(
    (categorySelection: string) => {
      if (!familyId) {
        return
      }

      setSnapshotForFamily(familyId, {
        ...getSnapshotForFamily(familyId),
        categorySelection,
      })
    },
    [familyId],
  )

  const setPeriodFilter = useCallback(
    (periodFilter: PeriodFilter) => {
      if (!familyId) {
        return
      }

      setSnapshotForFamily(familyId, {
        ...getSnapshotForFamily(familyId),
        periodFilter,
      })
    },
    [familyId],
  )

  const setSearchQuery = useCallback(
    (searchQuery: string) => {
      if (!familyId) {
        return
      }

      setSnapshotForFamily(familyId, {
        ...getSnapshotForFamily(familyId),
        searchQuery,
      })
    },
    [familyId],
  )

  const clearFilters = useCallback(() => {
    if (!familyId) {
      return
    }

    setSnapshotForFamily(familyId, DEFAULT_EXPENSE_HISTORY_FILTERS)
  }, [familyId])

  const filtersAreDirty = useMemo(
    () =>
      snapshot.periodFilter !== 'cycle' ||
      snapshot.categorySelection !== ALL_CATEGORIES_KEY ||
      snapshot.searchQuery.trim().length > 0,
    [snapshot.categorySelection, snapshot.periodFilter, snapshot.searchQuery],
  )

  return {
    ...snapshot,
    clearFilters,
    filtersAreDirty,
    setCategorySelection,
    setPeriodFilter,
    setSearchQuery,
  }
}
