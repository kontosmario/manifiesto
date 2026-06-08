import { describe, it, expect } from 'vitest'
import {
  groupForKind,
  iconForKind,
  pillForSeverity,
  formatRelativeNotificationTime,
  timeSectionForDate,
  NOTIFICATION_KIND_GROUPS,
  notificationSectionTitles,
} from '@/utils/notifications'

describe('groupForKind', () => {
  it('expense* → gastos', () => {
    expect(groupForKind('expense')).toBe('gastos')
    expect(groupForKind('expense_logged')).toBe('gastos')
  })

  it('income_logged → ingresos', () => {
    expect(groupForKind('income_logged')).toBe('ingresos')
  })

  it('fixed_* → fijos', () => {
    expect(groupForKind('fixed_created')).toBe('fijos')
    expect(groupForKind('fixed_paid')).toBe('fijos')
    expect(groupForKind('fixed_upcoming')).toBe('fijos')
  })

  it('streak_/shield_/checkin_ → racha', () => {
    expect(groupForKind('streak_milestone')).toBe('racha')
    expect(groupForKind('shield_earned')).toBe('racha')
    expect(groupForKind('checkin_morning')).toBe('racha')
  })

  it('goal_* → meta', () => {
    expect(groupForKind('goal_created')).toBe('meta')
    expect(groupForKind('goal_achieved')).toBe('meta')
  })

  it('kind desconocido → otros', () => {
    expect(groupForKind('weird_unknown_kind')).toBe('otros')
  })
})

describe('iconForKind', () => {
  it('mapea por grupo + overrides streak-specific', () => {
    expect(iconForKind('expense')).toBe('🛒')
    expect(iconForKind('income_logged')).toBe('💵')
    expect(iconForKind('fixed_paid')).toBe('💳')
    expect(iconForKind('goal_achieved')).toBe('🎯')
    expect(iconForKind('streak_milestone')).toBe('🔥')
    // override
    expect(iconForKind('shield_earned')).toBe('🛡️')
    expect(iconForKind('shield_used')).toBe('🛡️')
  })

  it('member_left tiene icon propio dentro de otros', () => {
    expect(iconForKind('member_left')).toBe('👋')
  })

  it('default → 🔔', () => {
    expect(iconForKind('totally_unknown')).toBe('🔔')
  })
})

describe('pillForSeverity', () => {
  it('success/warning/alert devuelven pill con label correcto', () => {
    expect(pillForSeverity('success', false)?.label).toBe('Logro')
    expect(pillForSeverity('warning', false)?.label).toBe('Atención')
    expect(pillForSeverity('alert', false)?.label).toBe('Alerta')
  })

  it('info devuelve null (sin pill)', () => {
    expect(pillForSeverity('info', false)).toBeNull()
  })

  it('isDark cambia los colores pero mantiene label', () => {
    const light = pillForSeverity('success', false)!
    const dark = pillForSeverity('success', true)!
    expect(dark.label).toBe(light.label)
    expect(dark.ink).not.toBe(light.ink)
  })
})

describe('formatRelativeNotificationTime', () => {
  const now = new Date('2026-06-08T12:00:00')

  it('< 1 min (delta = 0 min) → "ahora"', () => {
    const ts = new Date(now.getTime() - 10_000).toISOString()
    expect(formatRelativeNotificationTime(ts, now)).toBe('ahora')
  })

  it('< 60 min → "hace X min"', () => {
    const ts = new Date(now.getTime() - 5 * 60_000).toISOString()
    expect(formatRelativeNotificationTime(ts, now)).toBe('hace 5 min')
  })

  it('mismo día con horas < 12 → "hace X h"', () => {
    const ts = new Date(now.getTime() - 3 * 3_600_000).toISOString()
    expect(formatRelativeNotificationTime(ts, now)).toMatch(/^hace 3 h$/)
  })

  it('día anterior → "ayer HH:MM"', () => {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(9, 30, 0, 0)
    const result = formatRelativeNotificationTime(yesterday.toISOString(), now)
    expect(result.startsWith('ayer')).toBe(true)
  })

  it('fecha inválida → "Sin fecha"', () => {
    expect(formatRelativeNotificationTime('not-a-date', now)).toBe('Sin fecha')
  })
})

describe('timeSectionForDate', () => {
  const now = new Date('2026-06-08T12:00:00')

  it('hoy → today', () => {
    const ts = new Date('2026-06-08T08:00:00').toISOString()
    expect(timeSectionForDate(ts, now)).toBe('today')
  })

  it('ayer → yesterday', () => {
    const ts = new Date('2026-06-07T20:00:00').toISOString()
    expect(timeSectionForDate(ts, now)).toBe('yesterday')
  })

  it('hace 3 días → thisWeek', () => {
    const ts = new Date('2026-06-05T08:00:00').toISOString()
    expect(timeSectionForDate(ts, now)).toBe('thisWeek')
  })

  it('hace 10 días → older', () => {
    const ts = new Date('2026-05-29T08:00:00').toISOString()
    expect(timeSectionForDate(ts, now)).toBe('older')
  })

  it('fecha inválida → older', () => {
    expect(timeSectionForDate('bad-date', now)).toBe('older')
  })
})

describe('NOTIFICATION_KIND_GROUPS — invariants', () => {
  it('contiene los 6 grupos canónicos', () => {
    const keys = Object.keys(NOTIFICATION_KIND_GROUPS)
    expect(keys).toContain('gastos')
    expect(keys).toContain('ingresos')
    expect(keys).toContain('fijos')
    expect(keys).toContain('racha')
    expect(keys).toContain('meta')
    expect(keys).toContain('otros')
  })

  it('cada kind pertenece a un solo grupo (sin duplicados)', () => {
    const seen = new Set<string>()
    for (const kinds of Object.values(NOTIFICATION_KIND_GROUPS)) {
      for (const k of kinds) {
        expect(seen.has(k)).toBe(false)
        seen.add(k)
      }
    }
  })
})

describe('notificationSectionTitles', () => {
  it('cubre las 5 secciones', () => {
    expect(notificationSectionTitles.unread).toBe('Sin leer')
    expect(notificationSectionTitles.today).toBe('Hoy')
    expect(notificationSectionTitles.yesterday).toBe('Ayer')
    expect(notificationSectionTitles.thisWeek).toBe('Esta semana')
    expect(notificationSectionTitles.older).toBe('Antes')
  })
})
