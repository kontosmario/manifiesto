import { useRouter } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
import type {
  FijoHikeAlert,
  FijoItem,
} from '@/features/fijos/fijos-aggregates.model'
import {
  dismissHike,
  isHikeDismissed,
  useDismissedHikes,
} from '@/features/fijos/use-hike-dismiss-store'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { FijosProximosCardEmpty } from './fijos-proximos-parts/fijos-proximos-empty'
import { HikeAlertRow, SignalRow } from './fijos-proximos-parts/alert-rows'
import { RuleScale } from './fijos-proximos-parts/rule-scale'
import { UpcomingMarquee } from './fijos-proximos-parts/upcoming-marquee'
import { UrgentHeaderDot } from './fijos-proximos-parts/urgent-header-dot'

interface FijosProximosCardProps {
  upcoming?: FijoItem[]
  hikes?: FijoHikeAlert[]
  advisorSignals?: ControlAdvisorTask[]
  todayDay?: number
  categoriesById?: Map<string, { id: string; name: string; color: string }>
  onOpenHike?: (fixedExpenseId: string) => void
  /**
   * Modo empty / preview (onboarding). Renderea el MISMO card frame —
   * header "POR PAGAR · ESTE CICLO" + RuleScale + filas con su layout
   * (label de día · dot de categoría · nombre · monto) — pero con
   * dashes neutros, sin ítems fabricados. Default `false`.
   */
  empty?: boolean
}

/**
 * Reemplaza `FijosUpcomingStrip` + `FijosSmartAlerts` con una sola card
 * compacta de dos sub-secciones:
 *
 *   POR PAGAR · ESTE CICLO
 *   ─────────
 *   • Marquee horizontal con upcoming items del ciclo activo
 *     (pending + overdue). Tickets ticket-style, ticker continuo,
 *     drag-aware (Gesture.Pan).
 *
 *   AVISOS  ──────
 *   • Compacto: ↑ +X% nombre · semana cargada · ratio alto
 *
 * Naming nota: el header dice "POR PAGAR · ESTE CICLO" (no "PRÓXIMOS
 * A PAGAR" que era ambiguo — podía leerse como "lo programado para
 * después"). Los fijos programados a futuro (vencen en un ciclo
 * posterior) no se listan en esta pantalla hasta que su ciclo llega.
 *
 * La sub-section AVISOS solo se renderea cuando hay hikes o signals
 * relevantes al dominio fijos. Si no hay próximos, primer slot pasa a
 * un check + "Sin pendientes este ciclo" calmo.
 *
 * Animación cascade interna por row (40-60ms stagger). RiseView wrap
 * para la entrada del card desde el screen.
 */
export function FijosProximosCard({
  upcoming = [],
  hikes = [],
  advisorSignals = [],
  categoriesById,
  onOpenHike,
  empty = false,
}: FijosProximosCardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const router = useRouter()
  const dismissedHikes = useDismissedHikes()

  // Hikes visibles: el dismiss store oculta los ya aceptados al precio
  // actual. Si el precio sube de nuevo, el dismissedAtPrice no coincide
  // y la alerta vuelve a aparecer (lógica preservada del original).
  const visibleHikes = useMemo(
    () =>
      hikes.filter(
        (h) => !isHikeDismissed(h.fixedExpenseId, h.currentPrice, dismissedHikes),
      ),
    [hikes, dismissedHikes],
  )

  // Signals filtrados al dominio fijos (mismo criterio que el SmartAlerts
  // viejo)
  const relevantSignals = useMemo(
    () =>
      advisorSignals.filter(
        (s) => s.id === 'stress-week' || s.id === 'fijos-ratio',
      ),
    [advisorSignals],
  )

  const hasAlerts = visibleHikes.length > 0 || relevantSignals.length > 0
  const hasUpcoming = upcoming.length > 0

  // ¿Hay items urgentes (≤2d)? Lo usa el header dot para pulsar.
  // Computado ANTES del early return de `empty` para mantener el
  // hook order (rules-of-hooks: useMemo no puede ir condicionalmente).
  const hasUrgent = useMemo(
    () => upcoming.some((u) => Math.max(0, u.daysUntilDue) <= 2),
    [upcoming],
  )

  // ── Empty / preview mode ─────────────────────────────────────────
  // Mismo card frame (header "POR PAGAR · ESTE CICLO" + RuleScale)
  // con filas placeholder: cada fila conserva el layout real (label
  // de día · dot de categoría · nombre · monto) pero con dashes
  // neutros. Sin ítems inventados. Renderea después de los hooks.
  if (empty) {
    return <FijosProximosCardEmpty />
  }

  if (!hasUpcoming && !hasAlerts) return null

  // Color del card padre — usado solo para el bg del card mismo.
  const cardBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <RiseView delay={80}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: theme.colors.line,
          },
        ]}
      >
        {/*
          Header — eyebrow + header dot urgente (si aplica) + count.
          Copy "POR PAGAR · ESTE CICLO" en vez de "PRÓXIMOS A PAGAR"
          (refinado 2026-05-31): el segundo era ambiguo — podía
          interpretarse como "lo siguiente urgente" o "lo programado
          para después". Con "ESTE CICLO" queda claro que es el bucket
          de cuotas que tocan AHORA (pending + overdue). Los fijos
          programados a futuro (vencen en un ciclo posterior) no se
          listan acá hasta que su ciclo llega.
        */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              {t('fijos:proximos.eyebrow')}
            </Text>
            {hasUrgent ? (
              <UrgentHeaderDot
                color={theme.isDark ? '#F2A78C' : '#B84014'}
              />
            ) : null}
          </View>
          {hasUpcoming ? (
            <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
              {t('fijos:proximos.itemCount', { count: upcoming.length })}
            </Text>
          ) : null}
        </View>
        <RuleScale color={theme.colors.text} delay={60} />

        {/* Upcoming MARQUEE — ticker horizontal premium con edge fades
            + ticket-style items + urgency treatment con pulse. */}
        {hasUpcoming ? (
          <UpcomingMarquee
            items={upcoming}
            categoriesById={categoriesById}
          />
        ) : (
          <View style={styles.calmRow}>
            <MaterialIcons name="check-circle" size={18} color={theme.colors.primary} />
            <Text style={[styles.calmText, { color: theme.colors.text }]}>
              {t('fijos:proximos.calm')}
            </Text>
          </View>
        )}

        {/* AVISOS sub-section */}
        {hasAlerts ? (
          <>
            <View style={styles.alertsBreak}>
              <Text style={[styles.alertsLabel, { color: theme.colors.textMuted }]}>
                {t('fijos:proximos.alertsLabel')}
              </Text>
              <View
                style={[styles.alertsLine, { backgroundColor: theme.colors.line }]}
              />
            </View>

            <View style={styles.alertsList}>
              {visibleHikes.slice(0, 3).map((h, idx) => (
                <HikeAlertRow
                  key={`hike-${h.fixedExpenseId}`}
                  hike={h}
                  delay={
                    120 + Math.min(3, upcoming.length) * 60 + 80 + idx * 50
                  }
                  onPress={
                    onOpenHike ? () => onOpenHike(h.fixedExpenseId) : undefined
                  }
                  onDismiss={() => {
                    void triggerHaptic('light')
                    void dismissHike(h.fixedExpenseId, h.currentPrice)
                  }}
                />
              ))}
              {relevantSignals.map((s, idx) => (
                <SignalRow
                  key={`sig-${s.id}`}
                  signal={s}
                  delay={
                    120 +
                    Math.min(3, upcoming.length) * 60 +
                    80 +
                    (visibleHikes.length + idx) * 50
                  }
                  onPress={
                    s.id === 'stress-week'
                      ? () => router.push('/(app)/(tabs)/fixed-expenses')
                      : undefined
                  }
                />
              ))}
            </View>
          </>
        ) : null}
      </View>
    </RiseView>
  )
}

// Helper exportado para que el screen pueda pickear el icono cuando lo
// necesite — mantiene la simetría con `pickIconForFixedExpenseCategory`.
export { pickIconForFixedExpenseCategory }

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  headerCount: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  // ── Header dot urgente ──────────────────────────────────────────
  // 7pt dot al lado del eyebrow que pulsa cuando hay items ≤2d. Solo
  // se renderea condicionalmente desde el card (no siempre).
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  calmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  calmText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  // AVISOS sub-section
  alertsBreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  alertsLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  alertsLine: {
    flex: 1,
    height: 1,
    opacity: 0.5,
  },
  alertsList: { gap: 4 },
})
