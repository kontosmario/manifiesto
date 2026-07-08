import { describe, it, expect } from 'vitest'
import {
  streakQueryKey,
  markedDaysQueryKey,
} from '@/features/streaks/streak-query-keys'
import { incomeEventQueryKeys } from '@/features/income/income-event-query-keys'
import { notificationQueryKeys } from '@/features/notifications/notification-query-keys'
import { monthlyEditionsQueryKey } from '@/features/wrapped/monthly-editions-query-keys'

describe('streakQueryKey', () => {
  // Racha FAMILIAR (2026-07-08): keys scopeadas por familia, sin userId,
  // para que los miembros compartan cache y no fragmente por usuario.
  it('normaliza familyId undefined a null', () => {
    expect(streakQueryKey()).toEqual(['family-streak', null])
    expect(streakQueryKey('fam-1')).toEqual(['family-streak', 'fam-1'])
  })

  it('markedDaysQueryKey usa namespace propio (no colisiona con streakQueryKey)', () => {
    const a = streakQueryKey('fam-1')
    const b = markedDaysQueryKey('fam-1')
    expect(a[0]).not.toBe(b[0])
    expect(b).toEqual(['streak-marked-days', 'fam-1'])
  })
})

describe('incomeEventQueryKeys', () => {
  it('all es estable', () => {
    expect(incomeEventQueryKeys.all).toEqual(['income-events'])
  })

  it('list normaliza undefined a "unknown"', () => {
    expect(incomeEventQueryKeys.list(undefined)).toEqual(['income-events', 'unknown'])
    expect(incomeEventQueryKeys.list('fam-1')).toEqual(['income-events', 'fam-1'])
  })

  it('cycleSum incluye familyId + window y normaliza missing → "na"', () => {
    expect(
      incomeEventQueryKeys.cycleSum('fam-1', '2026-03-01', '2026-04-01'),
    ).toEqual(['income-events-cycle-sum', 'fam-1', '2026-03-01', '2026-04-01'])
    expect(incomeEventQueryKeys.cycleSum(undefined, undefined, undefined)).toEqual([
      'income-events-cycle-sum',
      'unknown',
      'na',
      'na',
    ])
  })

  it('list y cycleSum usan namespaces distintos', () => {
    expect(incomeEventQueryKeys.list('f').slice(0, 1)).not.toEqual(
      incomeEventQueryKeys.cycleSum('f', 's', 'e').slice(0, 1),
    )
  })
})

describe('notificationQueryKeys', () => {
  it('all = ["family-notifications"]', () => {
    expect(notificationQueryKeys.all).toEqual(['family-notifications'])
  })

  it('family scopea por familyId', () => {
    expect(notificationQueryKeys.family('fam-1')).toEqual([
      'family-notifications',
      'fam-1',
    ])
  })

  it('list incluye limit default 30', () => {
    expect(notificationQueryKeys.list('fam-1', 'u-1')).toEqual([
      'family-notifications',
      'fam-1',
      'u-1',
      30,
    ])
  })

  it('list con limit custom lo respeta', () => {
    expect(notificationQueryKeys.list('fam-1', 'u-1', 50)).toEqual([
      'family-notifications',
      'fam-1',
      'u-1',
      50,
    ])
  })

  it('list normaliza userId null/undefined a null', () => {
    expect(notificationQueryKeys.list('fam-1', null)).toEqual([
      'family-notifications',
      'fam-1',
      null,
      30,
    ])
    expect(notificationQueryKeys.list('fam-1', undefined)).toEqual([
      'family-notifications',
      'fam-1',
      null,
      30,
    ])
  })

  it('unreadCount usa namespace propio', () => {
    expect(notificationQueryKeys.unreadCount('fam-1', 'u-1')).toEqual([
      'family-notifications',
      'fam-1',
      'u-1',
      'unread-count',
    ])
  })
})

describe('monthlyEditionsQueryKey', () => {
  it('normaliza familyId undefined a null', () => {
    expect(monthlyEditionsQueryKey(undefined)).toEqual(['monthly-editions', null])
  })

  it('preserva familyId cuando se pasa', () => {
    expect(monthlyEditionsQueryKey('fam-1')).toEqual(['monthly-editions', 'fam-1'])
  })
})
