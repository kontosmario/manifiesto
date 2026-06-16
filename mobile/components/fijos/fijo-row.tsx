import { memo, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { SwipeRow, type SwipeAction } from '@/components/ui/swipe-row'
import { FijoTrendSpark } from '@/components/fijos/fijo-trend-spark'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { usePressScale } from '@/hooks/use-press-scale'
import { darkenForLightBg, lightenForDarkBg } from '@/utils/category-color'
import { formatMoney } from '@/utils/money'
import { useThemeTokens } from '@/theme/theme-provider'
import { InlinePayButton } from './fijo-row-parts/inline-pay-button'
import { TrendBadge } from './fijo-row-parts/trend-badge'
import { FijoRowPlaceholder } from './fijo-row-parts/fijo-row-placeholder'
import { FijoRowDetailPanel } from './fijo-row-parts/fijo-row-detail-panel'
import {
  capitalize,
  hexAlpha,
  monthOfLabel,
} from './fijo-row-parts/fijo-row-helpers'
import {
  computeAccent,
  computeDetail,
  computeStatusOverlay,
  statusAccessibilityLabel,
} from './fijo-row-parts/fijo-row-styling'

interface FijoRowProps {
  item?: FijoItem
  categoryColor?: string
  categoryName?: string
  /** Current UTC day-of-month. Histórico — el row ahora computa los
   *  días al vencimiento desde `item.next_due_on` directo (cálculo
   *  proper con UTC midnight), así que esta prop ya no se usa para
   *  el detail label. Se mantiene en la interfaz por backwards-compat
   *  con `FijoCategoryGroups` que la pasa; no impacta performance. */
  todayDay?: number
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  /**
   * Revertir un pago confirmado: solo aplica cuando status === 'paid'
   * y el `paidPaymentId` está disponible. La pantalla huésped
   * (FijosV2Screen) maneja la mutation; el row solo dispara la acción.
   */
  onRevertPaid?: (paymentId: string) => void
  /** Toggle true while a delete/edit mutation is in flight for this item. */
  isPending?: boolean
  /**
   * Placeholder / preview mode (onboarding first-run). Renders a
   * faithful empty version of the row card chrome — icon tile + status
   * overlay slot, title line, category-chip sub-line, amount slot — with
   * neutral muted dashes. No SwipeableRow / confetti / press handlers,
   * no fabricated data. The data props become optional and are never
   * read here. Backwards-compatible default `false`. */
  placeholder?: boolean
}

/**
 * Row for a single recurring/fijo item. Tap to expand a details panel
 * with frequency + method + category + primary actions (mark paid,
 * edit, pause). Swipe → Editar/Eliminar matching the activity row.
 */
function FijoRowImpl(props: FijoRowProps) {
  // Placeholder / preview mode — render the faithful empty row and bail
  // before any data hook touches `item`. Kept as a separate component so
  // the hook order in the real row is never affected by this branch.
  if (props.placeholder) {
    return <FijoRowPlaceholder />
  }
  return <FijoRowReal {...props} />
}

function FijoRowReal({
  item,
  categoryColor = '#888888',
  categoryName = '',
  // todayDay sigue aceptándose como prop pero ya no se desestructura —
  // el cálculo del detail label usa `next_due_on` directo (proper UTC
  // midnight diff), no day-of-month math.
  onMarkPaid,
  onEdit,
  onDelete,
  onRevertPaid,
  isPending = false,
}: FijoRowProps) {
  const theme = useThemeTokens()
  const [open, setOpen] = useState(false)
  // Gateado: el primer attach del tab no debe disparar la layout
  // transition de la fila (warp). Tras el idle se habilita para expandir/
  // colapsar y para add/delete de fijos.
  const rowLayout = useGatedLayout(LinearTransition.duration(240))
  const emoji = pickIconForFixedExpenseCategory(categoryName)
  // FijoRowReal is only rendered for non-placeholder rows, where `item`
  // is always supplied by the parent. The non-null assertion keeps the
  // downstream code unchanged while letting the prop be optional for the
  // placeholder path.
  const fijo = item as FijoItem
  const status = fijo.computedStatus
  // Press scales — card (tap-to-expand, subtle 0.98) y `inlinePayPress`
  // (0.92, más pronunciado) para el botón inline visible al lado del
  // monto. Más feedback porque es un icon-only button (44pt hit area,
  // 36pt visual) y necesita confirmar el tap sin lugar a duda.
  const cardPress = usePressScale({ pressedScale: 0.98 })
  const inlinePayPress = usePressScale({ pressedScale: 0.92 })

  // ── Local celebration on status flip → 'paid' ──────────────────
  // Capture the row's initial status on mount via a ref. The pulse
  // only fires if the row transitions INTO 'paid' DURING its
  // lifetime — rows that were already paid when the user first
  // landed on the screen render quietly (no confetti on cold open).
  // ConfettiBurst de-dupes by lastTokenRef so any re-render with the
  // same pulseToken=1 is a no-op.
  const initialStatusRef = useRef(status)
  const confettiPulse =
    status === 'paid' && initialStatusRef.current !== 'paid' ? 1 : 0

  const statusOverlay = computeStatusOverlay(status, theme)

  // Días reales entre HOY y `next_due_on` (no day-of-month wrap).
  // Positivo → vencimiento futuro (pending / future).
  // Negativo → ya pasó (overdue).
  // 0 → vence hoy.
  // Cálculo en UTC midnight para que un fijo con next_due_on=2026-06-10
  // visto hoy 2026-05-30 devuelva exactamente 11, no 10 (la versión
  // anterior usaba `dayOfMonth - todayDay` que daba números mal cuando
  // los meses tenían distinta cantidad de días).
  const daysToNextDue = useMemo(() => {
    if (!fijo.next_due_on) return null
    const due = new Date(fijo.next_due_on)
    const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
    const now = new Date()
    const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    return Math.round((dueUtc - nowUtc) / 86_400_000)
  }, [fijo.next_due_on])

  const accent = useMemo(
    () => computeAccent(status, theme.isDark),
    [status, theme.isDark],
  )

  // Label de mes capitalizado: "junio" → "Junio". Va en un CHIP a la
  // izquierda del detail label, tintado con el accent del status —
  // hace que "qué cuota" sea el ancla visual de la sub-line.
  const cuotaShort = fijo.cuotaMonth ? capitalize(monthOfLabel(fijo.cuotaMonth)) : null

  const detail = computeDetail(status, daysToNextDue)

  // catChipText hue-preserved (mismo helper que GastoRow). Antes el
  // pastel original sobre tinted bg light fallaba contraste 1.6:1.
  const catChipTextColor = useMemo(
    () =>
      theme.isDark
        ? lightenForDarkBg(categoryColor)
        : darkenForLightBg(categoryColor),
    [categoryColor, theme.isDark],
  )

  // Swipe reveals only "Eliminar". Edit + Registrar pago live inside
  // the tap-to-expand details panel.
  const actions: SwipeAction[] = []
  if (onDelete) {
    actions.push({
      label: 'Eliminar',
      tone: 'danger',
      icon: 'delete',
      onPress: () => onDelete(fijo.id),
    })
  }

  return (
    <SwipeRow
      accessibilityHint="Desliza para eliminar"
      rightActions={actions}
      isProcessing={isPending}
      // Matchea el borderRadius del card interno para que el clip y los
      // bordes redondeados del panel de acción terminen en la misma curva.
      borderRadius={16}
    >
      <Animated.View layout={rowLayout}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          onPressIn={cardPress.onPressIn}
          onPressOut={cardPress.onPressOut}
        >
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: theme.isDark
                  ? theme.colors.surfaceMuted
                  : theme.colors.creamCard,
                shadowColor: theme.colors.text,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: open ? (theme.isDark ? 0.32 : 0.18) : 0,
                shadowRadius: 10,
                elevation: open ? 4 : 0,
                // Allow confetti particles to render outside the card
                // bounds without being clipped (default `overflow:
                // hidden` on rounded cards would chop the burst).
                overflow: 'visible',
              },
              cardPress.animatedStyle,
            ]}
          >
            {/*
              Confetti for this specific row. Triggered by the status
              flip → 'paid'. originY=0 puts the burst at the top of the
              card; particles spread outward and downward over the row.
              Inert (renders null) until the first pulse arrives.
            */}
            <ConfettiBurst pulseToken={confettiPulse} originY={0} />
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <View
                  style={[
                    styles.iconTile,
                    {
                      backgroundColor: hexAlpha(categoryColor, 0.14),
                      borderColor: hexAlpha(categoryColor, 0.22),
                    },
                  ]}
                >
                  <Text style={styles.iconText}>{emoji}</Text>
                </View>
                {/* Status overlay (slot del WhoPaidAvatar en GastoRow). */}
                <View
                  style={[
                    styles.statusOverlay,
                    {
                      backgroundColor: statusOverlay.bg,
                      borderColor: statusOverlay.border,
                    },
                  ]}
                  accessibilityRole="text"
                  accessibilityLabel={statusAccessibilityLabel(status)}
                >
                  <MaterialIcons
                    name={statusOverlay.icon}
                    size={10}
                    color={statusOverlay.fg}
                  />
                </View>
              </View>

              <View style={styles.body}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                    {fijo.name}
                  </Text>
                  {fijo.trendDeltaPct != null && Math.abs(fijo.trendDeltaPct) >= 1 ? (
                    <TrendBadge
                      deltaPct={fijo.trendDeltaPct}
                      // Si el último pago se cobró con mora Y el delta es
                      // positivo, leemos como "incremento con intereses"
                      // (el aumento puede explicarse por punitorios del
                      // servicio). Si bajó, no hay diferencia semántica.
                      variant={
                        fijo.arrearsOnLastPayment && fijo.trendDeltaPct > 0
                          ? 'arrears'
                          : 'price'
                      }
                    />
                  ) : null}
                </View>
                {/*
                  Body line 2: categoría como texto inline. Antes
                  competía con chips + badge por espacio horizontal —
                  ahora los chips se moveron a su propio strip dedicado
                  debajo del top row, así que la categoría tiene la fila
                  completa sin truncation.
                */}
                <Text
                  style={[styles.catLine, { color: catChipTextColor }]}
                  numberOfLines={1}
                >
                  {categoryName}
                </Text>
              </View>

              <View style={styles.amountBlock}>
                <Text style={[styles.amount, { color: theme.colors.text }]}>
                  {formatMoney(fijo.amount)}
                </Text>
                {fijo.priceHistory.length >= 2 ? (
                  <FijoTrendSpark points={fijo.priceHistory} />
                ) : null}
              </View>

              {/*
                Botón inline "Pagar" — visible siempre cuando el fijo está
                pending u overdue, SIN necesidad de tap-to-expand. La
                acción más frecuente del row tiene que estar a 1 tap
                (ui-ux-pro-max: primary action no escondida).

                Solo render para `pending`/`overdue`; `paid`/`future` no
                muestran nada acá. Visual detallado vive en
                ./fijo-row-parts/inline-pay-button.tsx — incluye el halo
                pulse de overdue + ref-guard contra unmount.
              */}
              {(status === 'pending' || status === 'overdue') && onMarkPaid ? (
                <InlinePayButton
                  status={status}
                  pressScale={inlinePayPress}
                  onPress={() => onMarkPaid(fijo.id)}
                />
              ) : null}
            </View>

            {/*
              Bottom strip — chip del mes + status badge en su PROPIA
              fila debajo del top row. Antes vivían dentro del body
              apretados al lado del amount + pay button; ahora tienen
              full width disponible y se leen como "footer" del row.
            */}
            <View style={styles.metaBottomStrip}>
              {cuotaShort ? (
                <View
                  style={[
                    styles.monthChip,
                    {
                      backgroundColor: accent.bg,
                      borderColor: accent.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.monthChipText, { color: accent.solid }]}
                    numberOfLines={1}
                  >
                    {cuotaShort}
                  </Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: accent.bg,
                    borderColor: accent.border,
                  },
                ]}
              >
                <MaterialIcons
                  name={detail.icon}
                  size={12}
                  color={accent.solid}
                />
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color: accent.solid,
                      fontWeight:
                        status === 'overdue' || detail.label === 'Hoy' ? '800' : '700',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {detail.label}
                </Text>
              </View>
            </View>

            {open ? (
              <FijoRowDetailPanel
                fijo={fijo}
                status={status}
                accent={accent}
                categoryName={categoryName}
                onEdit={onEdit}
                onRevertPaid={onRevertPaid}
              />
            ) : null}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </SwipeRow>
  )
}

const styles = StyleSheet.create({
  card: {
    // Solo redondeamos las esquinas izquierdas. El SwipeRow exterior
    // (borderRadius 16 + overflow hidden) provee el contorno
    // redondeado de las 4 esquinas; el lado derecho del card queda
    // recto para meeting flush con el panel 'Eliminar' sin gap visible.
    // Mismo patrón que GastoRow / ActivityRowV2 en Gastos · Movimientos.
    // El placeholder (uso standalone, fuera de SwipeRow) restaura las
    // 4 esquinas vía `styles.placeholderCard`.
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { position: 'relative' },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconText: { fontSize: 18 },
  // Status overlay — mini-badge en la esquina del iconTile (slot del
  // WhoPaidAvatar en GastoRow). Pequeño, bordereado theme-aware, leído
  // como una "etiqueta cosida" al icono.
  statusOverlay: {
    position: 'absolute',
    bottom: -3,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  // Categoría como texto inline en el body (línea 2 del top row).
  catLine: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginTop: 3,
  },
  // Bottom strip de la card — fila dedicada para los chips de status
  // (mes + badge). Vive debajo del top row, con full width del card.
  metaBottomStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  statusBadgeText: {
    fontSize: 10.5,
    letterSpacing: -0.1,
    lineHeight: 13,
    flexShrink: 1,
  },
  // Chip del mes — pill subtle tintado por accent del status.
  monthChip: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  monthChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  amountBlock: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
})

/**
 * Memo wrap. FijoRow se renderea por cada item en cada CategoryGroup
 * (potencialmente decenas en una familia con muchos fijos). Sin memo,
 * cualquier change del controller (status update, día change, etc)
 * disparaba N re-renders cada uno con SwipeableRow internals, useRef,
 * useState, hexAlpha, ConfettiBurst pulse comparison, 3 usePressScale
 * hooks, etc.
 *
 * Props: `item` (object — confiamos en controller stability), strings,
 * primitives, callbacks (estables desde screen via useCallback).
 */
export const FijoRow = memo(FijoRowImpl)
