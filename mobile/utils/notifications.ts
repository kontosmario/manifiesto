import type { NotificationSeverity } from '@/features/notifications/use-notifications'

const notificationDateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const notificationDayMonthFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
})

const notificationTimeFormatter = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
})

export function notificationKindLabel(kind: string): string {
  switch (kind) {
    case 'expense':
    case 'expense_logged':
      return 'Gasto'
    case 'fixed_expense':
    case 'fixed_created':
      return 'Gasto fijo'
    case 'fixed_edited':
      return 'Fijo actualizado'
    case 'fixed_deleted':
      return 'Fijo eliminado'
    case 'fixed_paid':
      return 'Fijo pagado'
    case 'streak_milestone':
      return 'Racha'
    case 'streak_broken':
      return 'Racha perdida'
    case 'shield_used':
      return 'Escudo usado'
    case 'shield_earned':
      return 'Escudo ganado'
    case 'goal_created':
      return 'Meta creada'
    case 'goal_contribution':
      return 'Aporte a meta'
    case 'goal_milestone':
      return 'Meta: hito'
    case 'goal_achieved':
      return 'Meta alcanzada'
    default:
      return 'Info'
  }
}

export type NotificationGroup = 'gastos' | 'fijos' | 'racha' | 'meta' | 'otros'

/**
 * Canonical mapping from `NotificationGroup` → kinds that belong to it.
 * Keep this in sync with `groupForKind` — it's the source of truth the
 * preferences UI uses to toggle `kinds_muted` in bulk.
 */
export const NOTIFICATION_KIND_GROUPS: Record<NotificationGroup, string[]> = {
  gastos: ['expense', 'expense_logged'],
  fijos: [
    'fixed_expense',
    'fixed_created',
    'fixed_edited',
    'fixed_deleted',
    'fixed_paid',
    'fixed_upcoming',
  ],
  racha: [
    'streak_milestone',
    'streak_broken',
    'streak_at_risk',
    'shield_used',
    'shield_earned',
    'shield_auto_hint',
    'checkin_morning',
    'checkin_midday',
    'checkin_evening',
  ],
  meta: ['goal_created', 'goal_contribution', 'goal_milestone', 'goal_achieved', 'goal_behind'],
  otros: ['zombie_detected'],
}

export const NOTIFICATION_GROUP_LABELS: Record<NotificationGroup, string> = {
  gastos: 'Gastos',
  fijos: 'Fijos',
  racha: 'Racha y check-ins',
  meta: 'Metas',
  otros: 'Otros',
}

export function groupForKind(kind: string): NotificationGroup {
  switch (kind) {
    case 'expense':
    case 'expense_logged':
      return 'gastos'
    case 'fixed_expense':
    case 'fixed_created':
    case 'fixed_edited':
    case 'fixed_deleted':
    case 'fixed_paid':
    case 'fixed_upcoming':
      return 'fijos'
    case 'streak_milestone':
    case 'streak_broken':
    case 'streak_at_risk':
    case 'shield_used':
    case 'shield_earned':
    case 'shield_auto_hint':
    case 'checkin_morning':
    case 'checkin_midday':
    case 'checkin_evening':
      return 'racha'
    case 'goal_created':
    case 'goal_contribution':
    case 'goal_milestone':
    case 'goal_achieved':
    case 'goal_behind':
      return 'meta'
    default:
      return 'otros'
  }
}

export function iconForKind(kind: string): string {
  switch (groupForKind(kind)) {
    case 'gastos':
      return '🛒'
    case 'fijos':
      return '💳'
    case 'racha':
      // streak-specific overrides
      if (kind === 'shield_earned' || kind === 'shield_used') return '🛡️'
      return '🔥'
    case 'meta':
      return '🎯'
    default:
      return '🔔'
  }
}

export interface SeverityPill {
  surface: string
  ink: string
  label: string
}

export function pillForSeverity(
  severity: NotificationSeverity,
  isDark: boolean,
): SeverityPill | null {
  switch (severity) {
    case 'success':
      return isDark
        ? { surface: 'rgba(158,224,178,0.16)', ink: '#9EE0B2', label: 'Logro' }
        : { surface: 'rgba(46,125,91,0.10)', ink: '#2E7D5B', label: 'Logro' }
    case 'warning':
      return isDark
        ? { surface: 'rgba(242,181,138,0.16)', ink: '#F2B58A', label: 'Atención' }
        : { surface: 'rgba(194,90,62,0.10)', ink: '#C25A3E', label: 'Atención' }
    case 'alert':
      return isDark
        ? { surface: 'rgba(232,138,112,0.18)', ink: '#E88A70', label: 'Alerta' }
        : { surface: 'rgba(192,58,42,0.10)', ink: '#C03A2A', label: 'Alerta' }
    default:
      return null
  }
}

export function formatNotificationDate(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha'
  }

  return notificationDateTimeFormatter.format(parsed)
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function formatRelativeNotificationTime(value: string, now: Date = new Date()): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha'
  }

  const diffMs = now.getTime() - parsed.getTime()
  const diffMin = Math.round(diffMs / 60_000)
  const diffHours = Math.round(diffMs / 3_600_000)

  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`

  const startToday = startOfDay(now)
  const startMsg = startOfDay(parsed)
  const dayDiff = Math.round(
    (startToday.getTime() - startMsg.getTime()) / 86_400_000,
  )

  if (dayDiff === 0) {
    if (diffHours < 12) return `hace ${diffHours} h`
    return notificationTimeFormatter.format(parsed)
  }

  if (dayDiff === 1) {
    return `ayer ${notificationTimeFormatter.format(parsed)}`
  }

  if (dayDiff < 7) {
    return notificationDayMonthFormatter.format(parsed)
  }

  return notificationDayMonthFormatter.format(parsed)
}

export type NotificationSectionKey = 'unread' | 'today' | 'yesterday' | 'thisWeek' | 'older'

export const notificationSectionTitles: Record<NotificationSectionKey, string> = {
  unread: 'Sin leer',
  today: 'Hoy',
  yesterday: 'Ayer',
  thisWeek: 'Esta semana',
  older: 'Antes',
}

export function timeSectionForDate(
  createdAt: string,
  now: Date = new Date(),
): Exclude<NotificationSectionKey, 'unread'> {
  const parsed = new Date(createdAt)
  if (Number.isNaN(parsed.getTime())) return 'older'
  const startToday = startOfDay(now)
  const startMsg = startOfDay(parsed)
  const dayDiff = Math.round(
    (startToday.getTime() - startMsg.getTime()) / 86_400_000,
  )
  if (dayDiff <= 0) return 'today'
  if (dayDiff === 1) return 'yesterday'
  if (dayDiff < 7) return 'thisWeek'
  return 'older'
}
