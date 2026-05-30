import { memo, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { SwipeRow, type SwipeAction } from '@/components/ui/swipe-row'
import { FijoTrendSpark } from '@/components/fijos/fijo-trend-spark'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { usePressScale } from '@/hooks/use-press-scale'
import { darkenForLightBg, lightenForDarkBg } from '@/utils/category-color'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface FijoRowProps {
  item?: FijoItem
  categoryColor?: string
  categoryName?: string
  /** Current UTC day-of-month, passed from the parent so every row shares
   *  the same value and we don't create a Date per row per render. */
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
  todayDay = 1,
  onMarkPaid,
  onEdit,
  onDelete,
  onRevertPaid,
  isPending = false,
}: FijoRowProps) {
  const { theme } = useAppTheme()
  const [open, setOpen] = useState(false)
  const emoji = pickIconForFixedExpenseCategory(categoryName)
  // FijoRowReal is only rendered for non-placeholder rows, where `item`
  // is always supplied by the parent. The non-null assertion keeps the
  // downstream code unchanged while letting the prop be optional for the
  // placeholder path.
  const fijo = item as FijoItem
  const status = fijo.computedStatus
  // Press scales — card (tap-to-expand, subtle 0.98), Editar (0.96)
  // dentro del panel, y `inlinePayPress` (0.92, más pronunciado) para
  // el botón inline visible al lado del monto. Más feedback porque es
  // un icon-only button (44pt hit area, 36pt visual) y necesita
  // confirmar el tap sin lugar a duda.
  const cardPress = usePressScale({ pressedScale: 0.98 })
  const actionSecondaryPress = usePressScale({ pressedScale: 0.96 })
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

  // Status visual movido del chip pastel a una OVERLAY mini-badge en la
  // iconWrap (similar al WhoPaidAvatar de GastoRow). Reduce ruido visual
  // en la sub-line + libera espacio para que el catChip respire como
  // en Gastos. Theme-aware overlay:
  //   paid     → check verde sobre lime tile
  //   overdue  → warning rojo (mora, más fuerte que peach)
  //   future   → check muted gris (cerrado, no requiere acción)
  //   pending  → schedule muted (sutil, no compite)
  const statusOverlay = (() => {
    if (status === 'paid') {
      return {
        icon: 'check' as const,
        bg: theme.isDark ? '#1F4530' : '#EAFBE4',
        fg: theme.isDark ? '#A6EF8F' : '#297811',
        border: theme.isDark ? '#A6EF8F' : '#297811',
      }
    }
    if (status === 'overdue') {
      // Mora — más urgente que el peach genérico de antes. Borde sólido
      // rojo brand-deep en light, brand-bright en dark, mismo iconito
      // warning para mantener la asociación visual con "atención".
      return {
        icon: 'warning' as const,
        bg: theme.isDark ? '#4A1B1B' : '#F8C8C8',
        fg: theme.isDark ? '#F18C8C' : '#A8211B',
        border: theme.isDark ? '#F18C8C' : '#A8211B',
      }
    }
    if (status === 'future') {
      // Al día con próximo en un ciclo futuro. Mismo lenguaje que paid
      // pero muted para no compitir con la lista de pendientes.
      return {
        icon: 'check' as const,
        bg: theme.colors.pageBg,
        fg: theme.colors.textMuted,
        border: theme.colors.line,
      }
    }
    return {
      icon: 'schedule' as const,
      bg: theme.colors.pageBg,
      fg: theme.colors.textMuted,
      border: theme.colors.line,
    }
  })()

  const diffDays = fijo.dayOfMonth - todayDay
  // Days-since-due — solo significativo en 'overdue' (mora arrastrada).
  // Usa `daysUntilDue` (que el aggregates wrap-around al próximo ciclo)
  // para inferir cuántos días pasaron del vencimiento real.
  // Para overdue: `cycleDays - daysUntilDue` → días desde que venció.
  const overdueDays = Math.max(1, Math.abs(diffDays))

  // Label de mes: a qué cuota corresponde este row. Lo ponemos en la
  // sub-line para que el usuario sepa EXACTAMENTE de qué mes está
  // hablando (ej: "Pagado · cuota de junio" en vez de solo "Pagado").
  // Antes "Pagado · día 5" era ambiguo cuando había pagos de meses
  // sucesivos visibles.
  const cuotaLabel = fijo.cuotaMonth ? monthOfLabel(fijo.cuotaMonth) : null

  // Label de mes + estado. El mes responde "qué cuota" y el estado/
  // detalle "qué pasa con ella". Fallback al día cuando no hay
  // cuotaMonth (raro, sin next_due_on ni payment record).
  const dueLabel =
    status === 'paid'
      ? cuotaLabel
        ? `Cuota de ${cuotaLabel} · pagada`
        : `Pagado · día ${fijo.dayOfMonth}`
      : status === 'overdue'
        ? cuotaLabel
          ? `Cuota de ${cuotaLabel} · en mora ${overdueDays}d`
          : `En mora · ${overdueDays}d`
        : status === 'future'
          ? cuotaLabel
            ? `Próxima · cuota de ${cuotaLabel}`
            : `Próximo · día ${fijo.dayOfMonth}`
          : cuotaLabel
            ? diffDays === 0
              ? `Cuota de ${cuotaLabel} · vence hoy`
              : diffDays > 0
                ? `Cuota de ${cuotaLabel} · en ${diffDays}d`
                : `Cuota de ${cuotaLabel} · vencida ${Math.abs(diffDays)}d`
            : diffDays === 0
              ? 'Vence hoy'
              : diffDays > 0
                ? `Vence en ${diffDays}d`
                : `Vencido hace ${Math.abs(diffDays)}d`

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
      <Animated.View layout={LinearTransition.duration(240)}>
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
              {/* Status overlay (slot del WhoPaidAvatar en GastoRow).
                  Mini-badge con icon redondo bordeado theme-aware: check
                  lime para paid, warning peach para overdue, schedule
                  muted para pending. Reemplaza el chunky statusChip
                  pastel de antes — libera la sub-line para que el
                  catChip respire como en Gastos. */}
              <View
                style={[
                  styles.statusOverlay,
                  {
                    backgroundColor: statusOverlay.bg,
                    borderColor: statusOverlay.border,
                  },
                ]}
                accessibilityRole="text"
                accessibilityLabel={`Estado: ${
                  status === 'paid'
                    ? 'pagado'
                    : status === 'overdue'
                      ? 'en mora'
                      : status === 'future'
                        ? 'al día, próximo pago futuro'
                        : 'pendiente'
                }`}
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
              {/* Sub-line GastoRow-like: catChip + dueLabel separados por
                  middle dot. Misma jerarquía que el row de gastos —
                  unifica el lenguaje visual entre las dos pantallas. */}
              <View style={styles.subRow}>
                <View
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: hexAlpha(categoryColor, 0.14),
                      borderColor: hexAlpha(categoryColor, 0.22),
                    },
                  ]}
                >
                  <Text
                    style={[styles.catChipText, { color: catChipTextColor }]}
                    numberOfLines={1}
                  >
                    {categoryName}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.metaText,
                    {
                      color:
                        status === 'overdue'
                          ? theme.isDark
                            ? '#F18C8C'
                            : '#A8211B'
                          : theme.colors.textMuted,
                      fontWeight: status === 'overdue' ? '700' : '400',
                    },
                  ]}
                  numberOfLines={1}
                >
                  · {dueLabel}
                </Text>
              </View>
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
              Botón inline "Registrar pago" — visible siempre cuando el
              fijo está pending u overdue, SIN necesidad de tap-to-expand.
              UX rationale (ui-ux-pro-max): la acción más frecuente del
              row tiene que estar a 1 tap, no 2. Antes vivía solo dentro
              del expand panel ("Tap card → expand → tap Registrar pago"),
              fricción innecesaria para la tarea de fondo de la pantalla.

              Affordance: círculo de 36pt visual (check icon) con hitSlop
              8px → 52pt efectivo (HIG/MD: 44pt mínimo). Bg sólido
              text-fg para read primary; press feedback `scale(0.92)`
              (más pronunciado que la card 0.98 para reafirmar el tap).
              Solo render para `pending`/`overdue`; para `paid`/`future`
              no aparece (no hay acción primaria que hacer ahí).

              `stopPropagation` no es nativo en RN — el wrap Pressable
              recibe el tap primero por overlay; usar onPress directo +
              hitSlop independiente del Pressable del card. El RN event
              system no propaga taps a Pressables padre por defecto
              cuando el hijo intercepta.
            */}
            {(status === 'pending' || status === 'overdue') && onMarkPaid ? (
              <Pressable
                onPress={() => onMarkPaid(fijo.id)}
                onPressIn={inlinePayPress.onPressIn}
                onPressOut={inlinePayPress.onPressOut}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  status === 'overdue'
                    ? 'Registrar pago — fijo en mora'
                    : 'Registrar pago'
                }
                accessibilityHint="Abre el sheet para confirmar el monto pagado"
              >
                <Animated.View
                  style={[
                    styles.inlinePayBtn,
                    {
                      backgroundColor:
                        status === 'overdue'
                          ? theme.isDark
                            ? '#A8211B'
                            : '#A8211B'
                          : theme.colors.text,
                      borderColor:
                        status === 'overdue'
                          ? '#A8211B'
                          : theme.colors.text,
                    },
                    inlinePayPress.animatedStyle,
                  ]}
                >
                  <MaterialIcons
                    name="check"
                    size={18}
                    color={theme.colors.creamCard}
                  />
                </Animated.View>
              </Pressable>
            ) : null}
          </View>

          {open ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(140)}
              style={[styles.detailBlock, { borderTopColor: theme.colors.line }]}
            >
              <View style={styles.detailGrid}>
                <DetailTile
                  label="FRECUENCIA"
                  value={frequencyLabel(fijo.frequency)}
                  theme={theme}
                />
                <DetailTile label="KIND" value={kindLabel(fijo.kind)} theme={theme} />
                <DetailTile
                  label="PRÓX. VENCIMIENTO"
                  value={`día ${fijo.dayOfMonth}`}
                  theme={theme}
                />
                <DetailTile label="CATEGORÍA" value={categoryName} theme={theme} />
              </View>
              {/*
                Expand panel actions. Para paid rows: "Revertir pago"
                (secondary, peach-tinted como undo action) + Editar.
                Para otros estados: solo "Editar".
                El primario "Registrar pago" vive inline en el row
                collapsed (ui-ux-pro-max: primary action no escondida).
              */}
              <View style={styles.actionsRow}>
                {status === 'paid' && onRevertPaid && fijo.paidPaymentId ? (
                  <Pressable
                    onPress={() => onRevertPaid(fijo.paidPaymentId!)}
                    onPressIn={actionSecondaryPress.onPressIn}
                    onPressOut={actionSecondaryPress.onPressOut}
                    style={styles.actionFullWidthWrap}
                    accessibilityRole="button"
                    accessibilityLabel="Revertir pago"
                    accessibilityHint="Deshace el pago: borra el movimiento y vuelve el fijo a pendiente."
                  >
                    <Animated.View
                      style={[
                        styles.actionSecondary,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(242,167,140,0.10)'
                            : 'rgba(242,167,140,0.18)',
                          borderColor: theme.isDark ? '#F2A78C' : '#B84014',
                        },
                        actionSecondaryPress.animatedStyle,
                      ]}
                    >
                      <View style={styles.actionRevertContent}>
                        <MaterialIcons
                          name="undo"
                          size={14}
                          color={theme.isDark ? '#F2A78C' : '#B84014'}
                        />
                        <Text
                          style={[
                            styles.actionSecondaryText,
                            { color: theme.isDark ? '#F2A78C' : '#B84014' },
                          ]}
                        >
                          Revertir pago
                        </Text>
                      </View>
                    </Animated.View>
                  </Pressable>
                ) : null}
                {onEdit ? (
                  <Pressable
                    onPress={() => onEdit(fijo.id)}
                    onPressIn={actionSecondaryPress.onPressIn}
                    onPressOut={actionSecondaryPress.onPressOut}
                    style={styles.actionFullWidthWrap}
                    accessibilityRole="button"
                    accessibilityLabel="Editar fijo"
                  >
                    <Animated.View
                      style={[
                        styles.actionSecondary,
                        { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
                        actionSecondaryPress.animatedStyle,
                      ]}
                    >
                      <Text style={[styles.actionSecondaryText, { color: theme.colors.text }]}>
                        Editar
                      </Text>
                    </Animated.View>
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>
          ) : null}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </SwipeRow>
  )
}

/**
 * Empty-state twin de FijoRow. Replica fiel del chrome del card —
 * mismo radius, padding, icon tile (con su slot de status overlay),
 * title line, sub-line con catChip, y amount slot a la derecha — pero
 * con dashes neutros. Sin SwipeableRow / confetti / press / datos
 * fabricados (preview inerte). Replica en vez de prop-en-el-real porque
 * el row real está fuertemente acoplado a SwipeableRow + ConfettiBurst
 * + 3 press hooks + tap-to-expand state, todo innecesario para un
 * placeholder estático.
 */
function FijoRowPlaceholder() {
  const { theme } = useAppTheme()
  const ph = theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,30,0.07)'
  return (
    <View
      style={[
        styles.card,
        styles.placeholderCard,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <View style={[styles.iconTile, { backgroundColor: ph, borderColor: ph }]} />
          <View
            style={[
              styles.statusOverlay,
              { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
            ]}
          />
        </View>
        <View style={styles.body}>
          <View style={[styles.phBar, { width: '58%', height: 11, backgroundColor: ph }]} />
          <View style={styles.subRow}>
            <View style={[styles.phChip, { backgroundColor: ph }]} />
            <View style={[styles.phBar, { width: 56, height: 8, backgroundColor: ph }]} />
          </View>
        </View>
        <View style={styles.amountBlock}>
          <View style={[styles.phBar, { width: 50, height: 13, backgroundColor: ph }]} />
        </View>
      </View>
    </View>
  )
}

/**
 * Convierte `YYYY-MM-01` (cuotaMonth de FijoItem) a un label
 * humano en español: "junio", "julio", etc. Si el year es distinto
 * al actual, agrega el year para evitar ambigüedad: "junio 2027".
 *
 * Sin Intl en el bundle por compat con Reanimated worklets (memory:
 * `feedback_reanimated_worklet_globals`). Solo se llama en el render
 * thread (JS thread), así que técnicamente Intl funcionaría — pero
 * mantener consistencia y velocidad usando un mini array.
 */
function monthOfLabel(yyyyMm01: string): string {
  const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  const parts = yyyyMm01.split('-')
  if (parts.length < 2) return yyyyMm01
  const year = parseInt(parts[0]!, 10)
  const monthIdx = parseInt(parts[1]!, 10) - 1
  if (Number.isNaN(year) || Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) {
    return yyyyMm01
  }
  const currentYear = new Date().getFullYear()
  const name = MONTH_NAMES[monthIdx]!
  return year === currentYear ? name : `${name} ${year}`
}

/**
 * Badge de variación de precio. Dos variantes:
 *   - 'price'    → "+12%" en tono peach (default — aumento normal del
 *                   servicio entre pagos).
 *   - 'arrears'  → "+12% int." en tono rojo más fuerte cuando el último
 *                   pago se cobró con mora. Hace explícito que la suba
 *                   incluye intereses, no aumento real del servicio.
 * Para deltas negativos no hay distinción (no hay "bajó por mora").
 */
function TrendBadge({
  deltaPct,
  variant = 'price',
}: {
  deltaPct: number
  variant?: 'price' | 'arrears'
}) {
  const { theme } = useAppTheme()
  const up = deltaPct > 0
  const isArrears = up && variant === 'arrears'
  // Bg alpha-based para que funcione sobre cualquier canvas (card en
  // dark, cream en light, tinted en hover).
  //   price up    → peach soft
  //   arrears up  → rojo soft (más urgente que peach)
  //   down        → lime soft (mismo en ambas variantes)
  const bg = !up
    ? 'rgba(166,239,143,0.16)'
    : isArrears
      ? 'rgba(231,76,60,0.18)'
      : 'rgba(242,167,140,0.18)'
  const fg = !up
    ? theme.isDark
      ? '#A6EF8F'
      : '#297811'
    : isArrears
      ? theme.isDark
        ? '#F18C8C'
        : '#A8211B'
      : theme.isDark
        ? '#F2A78C'
        : '#B84014'
  // "int." suffix cuando es arrears para que el chip se lea como
  // "incremento con intereses" sin alargar mucho la pill.
  const label = `${up ? '+' : ''}${deltaPct}%${isArrears ? ' int.' : ''}`
  return (
    <View
      style={[styles.trendBadge, { backgroundColor: bg }]}
      accessibilityRole="text"
      accessibilityLabel={
        isArrears
          ? `Incremento con intereses ${deltaPct} por ciento respecto al último pago`
          : `Tendencia ${up ? 'subió' : 'bajó'} ${Math.abs(deltaPct)} por ciento`
      }
    >
      <Text style={[styles.trendBadgeText, { color: fg }]}>{label}</Text>
    </View>
  )
}

function DetailTile({
  label,
  value,
  theme,
}: {
  label: string
  value: string
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  return (
    <View style={styles.detailTile}>
      <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function frequencyLabel(f: string): string {
  switch (f) {
    case 'weekly':
      return 'Semanal'
    case 'biweekly':
      return 'Quincenal'
    case 'monthly':
      return 'Mensual'
    case 'quarterly':
      return 'Trimestral'
    case 'semiannual':
      return 'Semestral'
    case 'annual':
      return 'Anual'
    default:
      return f
  }
}

function kindLabel(k: string): string {
  switch (k) {
    case 'periodic':
      return 'Periódico'
    case 'installment':
      return 'Cuotas'
    case 'debt':
      return 'Deuda'
    default:
      return 'Recurrente'
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
  trendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  trendBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: -0.2 },
  // Sub-line GastoRow-like: catChip + meta dot + dueLabel. Misma altura
  // y spacing que en gasto-row para que las dos pantallas se sientan
  // un solo idioma.
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  catChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  catChipText: { fontSize: 10, fontWeight: '700' },
  metaText: { fontSize: 11, flexShrink: 1 },
  amountBlock: { alignItems: 'flex-end', gap: 2 },
  // ── Placeholder / preview ────────────────────────────────────────
  placeholderCard: {
    opacity: 0.86,
    // Standalone (sin SwipeRow alrededor): restauramos las esquinas
    // derechas para que el placeholder se lea como card completa.
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  phBar: { borderRadius: 5 },
  phChip: {
    width: 56,
    height: 16,
    borderRadius: 999,
  },
  // Tabular nums para columna right-aligned de montos entre rows
  // (mismo razonamiento que Gastos.GastoRow.amount).
  amount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  detailBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailTile: { flexBasis: '47%', flexGrow: 1 },
  detailLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  detailValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  // Después de mover "Registrar pago" al row collapsed, en el panel
  // solo queda "Editar" — ocupa el ancho completo (vs el split flex:2
  // / flex:1 anterior).
  actionFullWidthWrap: { flex: 1 },
  actionSecondary: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionSecondaryText: { fontSize: 13, fontWeight: '700' },
  // Contenedor inline para "Revertir pago" — ícono undo + label.
  actionRevertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Botón inline visible al lado del monto (status pending/overdue).
  // 36pt visual + hitSlop 8px = ~52pt efectivo (HIG ≥44pt).
  // Bg sólido text-fg (light) / rojo-deep cuando es overdue para que
  // se lea como "atención esto vence o está vencido + acción urgente".
  // Borde mismo color (no 1px line muted) — el botón es prominent.
  inlinePayBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginLeft: 2,
  },
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
