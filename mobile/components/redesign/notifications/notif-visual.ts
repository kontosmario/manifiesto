import type { AvatarSlug } from '@/assets/avatars'
import type {
  FamilyNotification,
  NotificationSeverity,
} from '@/features/notifications/use-notifications'
import { formatRelativeNotificationTime, groupForKind, iconForKind } from '@/utils/notifications'

/**
 * Mapeo de una notificación REAL (FamilyNotification) al view-model del
 * rediseño de notificaciones (Turno 6). El mockup 7a mostraba 4 tipos
 * (🔥 resumen / 🌙 cierre / ☀️ medio día / 🌱 jardín); acá se cubren
 * TODOS los `kind` del backend + el caso "notif con autor" (avatar del
 * miembro) que el feed vigente ya distingue.
 *
 * Icono del tile, en orden de prioridad:
 *   1. Autor (created_by = miembro) → su avatar (mismo criterio que el
 *      feed actual: quién lo hizo pesa más que el tipo).
 *   2. Check-ins por hora → emoji por franja (🔥 mañana · ☀️ mediodía ·
 *      🌙 noche), como el mockup.
 *   3. Escudo / recuperación de racha ("Tu jardín te espera") → Brot
 *      `seed` (el jardín del mockup).
 *   4. Resto → el emoji real `iconForKind(kind)` (🛒 💵 💳 🔥 🎯 🛡️ 👋 🔔).
 * Tile pastel por grupo/kind (mismo vocabulario de pasteles del rediseño;
 * en oscuro los deriva pastelDarkSolid — ver NotifCard). Los avatares NO
 * llevan tile pastel (se ven redondos, como en el feed vigente).
 */

export type NotifIcon =
  | { type: 'emoji'; emoji: string }
  | { type: 'seed' }
  | { type: 'avatar'; slug: AvatarSlug | null; name: string; color: string }

export interface NotifCardVM {
  id: string
  icon: NotifIcon
  /** Pastel CLARO del tile (emoji/seed). null = sin tile (avatar). */
  tileLight: string | null
  title: string
  time: string
  body: string
  severity: NotificationSeverity
}

export interface NotifAuthor {
  name: string
  color: string
  avatarSlug: AvatarSlug | null
}

// Pasteles del vocabulario del rediseño (los mismos de la grilla de
// avatares / categorías), uno por franja de check-in + grupo real.
const PASTEL = {
  morning: '#F7E3CF', // 🔥 comida
  midday: '#F2ECC9', // ☀️ servicios
  evening: '#E6E0F4', // 🌙 ocio
  garden: '#DDEBDD', // 🌱 hogar (Brot seed)
  gastos: '#D6E4F0', // 🛒 cuotas (azul)
  ingresos: '#D4EBDF', // 💵 mascotas (menta)
  fijos: '#EDE0C8', // 💳 vivienda (tostado)
  meta: '#F5D8DD', // 🎯 salud (rosa)
  otros: '#EDE6D4', // 🔔 ropa (crema)
} as const

// El Brot `seed` (el "jardín" del mockup) va para los avisos de
// recuperación/semilla-guardada ("Tu jardín te espera · una semilla
// cubre el día"). Los escudos ganados/usados mantienen su 🛡️ real.
const SEED_KINDS = new Set(['streak_recovery_nudge', 'shield_auto_hint'])

function iconAndTile(kind: string): { icon: NotifIcon; tileLight: string } {
  // Check-ins por franja horaria → emoji del mockup.
  if (kind === 'checkin_morning') return { icon: { type: 'emoji', emoji: '🔥' }, tileLight: PASTEL.morning }
  if (kind === 'checkin_midday') return { icon: { type: 'emoji', emoji: '☀️' }, tileLight: PASTEL.midday }
  if (kind === 'checkin_evening') return { icon: { type: 'emoji', emoji: '🌙' }, tileLight: PASTEL.evening }
  // Cierre de ciclo (resumen mensual "Te sobró…") → misma familia visual
  // que el cierre del día (🌙 noche); se distinguen por el texto.
  if (kind === 'cycle_closed') return { icon: { type: 'emoji', emoji: '🌙' }, tileLight: PASTEL.evening }
  // Jardín (recuperación / semilla guardada) → Brot semilla.
  if (SEED_KINDS.has(kind)) return { icon: { type: 'seed' }, tileLight: PASTEL.garden }
  // Resto: emoji real del grupo + pastel del grupo.
  const emoji = iconForKind(kind)
  switch (groupForKind(kind)) {
    case 'gastos':
      return { icon: { type: 'emoji', emoji }, tileLight: PASTEL.gastos }
    case 'ingresos':
      return { icon: { type: 'emoji', emoji }, tileLight: PASTEL.ingresos }
    case 'fijos':
      return { icon: { type: 'emoji', emoji }, tileLight: PASTEL.fijos }
    case 'racha':
      return { icon: { type: 'emoji', emoji }, tileLight: PASTEL.morning }
    case 'meta':
      return { icon: { type: 'emoji', emoji }, tileLight: PASTEL.meta }
    default:
      return { icon: { type: 'emoji', emoji }, tileLight: PASTEL.otros }
  }
}

export function notifCardVM(
  n: FamilyNotification,
  author: NotifAuthor | null,
  now: Date = new Date(),
): NotifCardVM {
  const base = {
    id: n.id,
    title: n.title,
    time: formatRelativeNotificationTime(n.created_at, now),
    body: n.body,
    severity: n.severity,
  }
  // Autor de una acción del hogar → su avatar (sin tile pastel).
  if (author) {
    return {
      ...base,
      icon: { type: 'avatar', slug: author.avatarSlug, name: author.name, color: author.color },
      tileLight: null,
    }
  }
  const { icon, tileLight } = iconAndTile(n.kind)
  return { ...base, icon, tileLight }
}
