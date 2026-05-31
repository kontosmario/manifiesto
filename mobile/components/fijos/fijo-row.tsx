import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
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

  // Accent palette derivada del status — usada para tintar el expand
  // panel (stats hero bg + accent stripe + border-top dashed). Cada
  // estado tiene su hue dedicado, sin overlap entre los 4:
  //   overdue → red brand (urgencia)
  //   pending → peach (acción por venir)
  //   paid    → lime (cerrado / positivo)
  //   future  → sky muted (calendario lejano)
  // Light: brand-deep saturado. Dark: brand-bright para contraste con
  // surfaceMuted near-black. Bgs en alpha bajo (0.06-0.10) para que
  // tinten sin compitir con el contenido.
  const accent = useMemo(() => {
    if (status === 'overdue') {
      return {
        solid: theme.isDark ? '#F18C8C' : '#A8211B',
        bg: theme.isDark ? 'rgba(241,140,140,0.12)' : 'rgba(168,33,27,0.07)',
        border: theme.isDark ? 'rgba(241,140,140,0.36)' : 'rgba(168,33,27,0.25)',
      }
    }
    if (status === 'pending') {
      return {
        solid: theme.isDark ? '#F2A78C' : '#B84014',
        bg: theme.isDark ? 'rgba(242,167,140,0.10)' : 'rgba(184,64,20,0.06)',
        border: theme.isDark ? 'rgba(242,167,140,0.32)' : 'rgba(184,64,20,0.22)',
      }
    }
    if (status === 'paid') {
      return {
        solid: theme.isDark ? '#A6EF8F' : '#297811',
        bg: theme.isDark ? 'rgba(166,239,143,0.10)' : 'rgba(41,120,17,0.06)',
        border: theme.isDark ? 'rgba(166,239,143,0.32)' : 'rgba(41,120,17,0.22)',
      }
    }
    // future
    return {
      solid: theme.isDark ? '#9DC4DE' : '#3F7CA3',
      bg: theme.isDark ? 'rgba(157,196,222,0.10)' : 'rgba(63,124,163,0.06)',
      border: theme.isDark ? 'rgba(157,196,222,0.32)' : 'rgba(63,124,163,0.22)',
    }
  }, [status, theme.isDark])

  // Label de mes capitalizado: "junio" → "Junio". Va en un CHIP a la
  // izquierda del detail label, tintado con el accent del status —
  // hace que "qué cuota" sea el ancla visual de la sub-line.
  const cuotaShort = fijo.cuotaMonth ? capitalize(monthOfLabel(fijo.cuotaMonth)) : null

  // Detail badge — pill compacto en línea 3 del sub-info. Wording
  // diseñado para CABER SIEMPRE EN UNA SOLA LÍNEA, sin importar
  // pantalla chica o nombre de fijo largo. El icono carga la mayor
  // parte del significado (warning = vencido, clock = por venir,
  // check = pagado, calendar = futuro), el texto solo cuantifica.
  //
  // Wording por status (todos ≤ 12 chars):
  //   overdue → "Vencida 11d"   (warning icon, "d" abreviado)
  //   pending → "En 5d"         (clock icon)
  //   pending today → "Hoy"     (clock icon, bold)
  //   paid    → "Pagada"        (check_circle)
  //   future  → "Próxima"       (event icon)
  //
  // Fallback sin next_due_on: copy genérico.
  const detail = (() => {
    if (status === 'paid') {
      return { label: 'Pagada', icon: 'check-circle' as const }
    }
    if (status === 'overdue') {
      const d = daysToNextDue != null ? Math.max(1, Math.abs(daysToNextDue)) : null
      return {
        label: d != null ? `Vencida ${d}d` : 'En mora',
        icon: 'warning' as const,
      }
    }
    if (status === 'future') {
      return { label: 'Próxima', icon: 'event' as const }
    }
    // pending
    if (daysToNextDue == null) {
      return { label: 'Pendiente', icon: 'schedule' as const }
    }
    if (daysToNextDue === 0) {
      return { label: 'Hoy', icon: 'schedule' as const }
    }
    return {
      label: `En ${Math.abs(daysToNextDue)}d`,
      icon: 'schedule' as const,
    }
  })()

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
              {/*
                Sub-info STACKEADA en 2 líneas para que TODO entre sin
                elipsis incluso en pantallas chicas / nombres largos:

                  Línea 1 (identifying)   : catName · [chip del mes]
                  Línea 2 (state/timing)  : detailLabel (full width)

                Antes era una sola fila horizontal — con cat + chip +
                detail + amount + pay button competían por el ancho y
                "11d de mora" se cortaba a "11 d..". Stack vertical da
                a cada pieza su línea propia + crece ~14pt verticales.

                El CHIP DEL MES sigue siendo el ancla visual del estado
                (tintado por accent del status — rojo overdue / peach
                pending / lime paid / sky future). El detailLabel debajo
                expande la info: "11d de mora" / "vence en 5d" / etc.
              */}
              <View style={styles.metaStack}>
                <View style={styles.metaIdRow}>
                  <Text
                    style={[styles.metaCat, { color: catChipTextColor }]}
                    numberOfLines={1}
                  >
                    {categoryName}
                  </Text>
                  {cuotaShort ? (
                    <>
                      <Text style={[styles.metaSep, { color: theme.colors.textMuted }]}>
                        ·
                      </Text>
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
                    </>
                  ) : null}
                </View>
                {/*
                  Status badge — pill bg-tinted + icon prefix + texto
                  bold. Le da peso visual a la info del estado/timing
                  (dato más relevante del row: "qué pasa AHORA con esta
                  cuota"). El icon engancha el ojo antes que el texto
                  → estado scanneable en milisegundos.

                  alignSelf: 'flex-start' para que el badge hug content
                  (no se estire al ancho del body — sería pesado visual).
                */}
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
                    size={11}
                    color={accent.solid}
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: accent.solid,
                        // Overdue: 800. Pending today: 800 (urgencia).
                        // Resto: 700.
                        fontWeight:
                          status === 'overdue' || detail.label === 'Hoy' ? '800' : '700',
                      },
                    ]}
                    // numberOfLines=1: garantiza que el badge nunca
                    // wrappee. El wording fue diseñado para caber en
                    // una línea en todos los casos; si por algún
                    // motivo se pasara, mejor truncar que romper la
                    // altura del row.
                    numberOfLines={1}
                  >
                    {detail.label}
                  </Text>
                </View>
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
              Botón inline "Pagar" — visible siempre cuando el fijo está
              pending u overdue, SIN necesidad de tap-to-expand. La
              acción más frecuente del row tiene que estar a 1 tap
              (ui-ux-pro-max: primary action no escondida).

              Diseño distintivo (2026-05-30 v2 — emil + gpt-taste):
                · Brand-colored: forest deep (pending) / red brand
                  (overdue). Coded visualmente como "money / urgencia".
                · Ícono `attach-money` (símbolo $) — universalmente
                  reconocible como pago, no como "confirmar / done".
                · Inner highlight 1pt blanco-alpha en el top → ilusión
                  de profundidad sin glass-AI-slop.
                · Borde 1.5pt en tono más oscuro del bg → finishing
                  curado, no flat-render.
                · Press scale 0.88 (pronunciado para icon-only).
                · Para overdue: pulse halo continuo (1.5s ease-in-out,
                  scale 1→1.45, opacity 0.45→0) — "respira" pidiendo
                  atención. Skip si reduceMotion.

              Solo render para `pending`/`overdue`; `paid`/`future` no
              muestran nada acá.
            */}
            {(status === 'pending' || status === 'overdue') && onMarkPaid ? (
              <InlinePayButton
                status={status}
                pressScale={inlinePayPress}
                onPress={() => onMarkPaid(fijo.id)}
              />
            ) : null}
          </View>

          {open ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(140)}
              // borderTopColor tintado por status — el divider que separa
              // el row collapsed del expand panel anuncia visualmente el
              // estado del fijo apenas se abre (overdue=red, pending=peach,
              // paid=lime, future=sky).
              style={[styles.detailBlock, { borderTopColor: accent.border }]}
            >
              {/*
                Stats hero. Para recurring/periodic: "SE LLEVA AL AÑO".
                Para installment: "TOTAL DE LA DEUDA". Para debt: "DEUDA
                RESTANTE". Cifra grande para anclar el ojo + sublabel
                con % del sueldo (cuando hay sueldo configurado).
                Educational hook principal del expand.

                Tintado por status (impeccable + ui-ux-pro-max
                "state-clarity"): bg en alpha bajo del accent, accent
                stripe vertical 3pt en el borde izquierdo, label
                eyebrow en el accent.solid (no muted). El ojo va
                directo al hero y entiende el estado por el color sin
                leer.
              */}
              <View
                style={[
                  styles.statsHero,
                  { backgroundColor: accent.bg },
                ]}
              >
                {/* Accent stripe — barra vertical 3pt en el left edge.
                    Hace que el statsHero "lleve" el color del status
                    como cinta. Sin invadir el contenido. */}
                <View
                  pointerEvents="none"
                  style={[styles.statsAccentStripe, { backgroundColor: accent.solid }]}
                />
                <Text style={[styles.statsEyebrow, { color: accent.solid }]}>
                  {fijo.kind === 'installment'
                    ? 'TOTAL DE LA DEUDA'
                    : fijo.kind === 'debt'
                      ? 'DEUDA RESTANTE'
                      : 'SE LLEVA AL AÑO'}
                </Text>
                <Text style={[styles.statsValue, { color: theme.colors.text }]}>
                  {formatMoney(fijo.annualCost)}
                </Text>
                {fijo.pctOfIncome != null && fijo.pctOfIncome > 0 ? (
                  <View style={styles.statsPctRow}>
                    <MaterialIcons
                      name="account-balance-wallet"
                      size={11}
                      color={theme.colors.textMuted}
                    />
                    <Text style={[styles.statsPctText, { color: theme.colors.textMuted }]}>
                      {fijo.pctOfIncome}% de tu sueldo mensual
                    </Text>
                  </View>
                ) : null}
              </View>

              {/*
                Tendencia. Solo cuando hay >= 2 puntos de historia. El
                sparkline ya existe en el row collapsed (chiquito al lado
                del monto); acá lo mostramos más grande y con etiqueta
                humanizada del trend ("Subió 12% desde el último pago"
                en peach / "Bajó 5%" en lime / "Mantiene el precio" muted).
                Este bloque cumple el "alerta a aumentos" — el usuario
                ve de un vistazo si el servicio subió y cuánto.
              */}
              {fijo.priceHistory.length >= 2 && fijo.trendDeltaPct != null ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
                    TENDENCIA
                  </Text>
                  <View style={styles.trendRow}>
                    <View style={styles.trendSparkSlot}>
                      <FijoTrendSpark points={fijo.priceHistory} />
                    </View>
                    <View style={styles.trendCopySlot}>
                      <Text
                        style={[
                          styles.trendCopyMain,
                          {
                            color: trendCopyColor(fijo.trendDeltaPct, theme.isDark),
                          },
                        ]}
                      >
                        {trendCopyLabel(fijo.trendDeltaPct)}
                      </Text>
                      <Text
                        style={[styles.trendCopySub, { color: theme.colors.textMuted }]}
                      >
                        {trendCopySubLabel(fijo.priceHistory)}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/*
                Este pago: info concreta y accionable. Para installment
                agregamos "Cuota X de Y" en vez de la frecuencia genérica.
              */}
              <View style={styles.section}>
                <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
                  ESTE PAGO
                </Text>
                <InfoLine
                  icon="event-repeat"
                  label={
                    fijo.kind === 'installment'
                      ? `Cuota ${(fijo.installments_paid ?? 0) + 1} de ${fijo.installments_total ?? '?'}`
                      : `${frequencyLabel(fijo.frequency)} · día ${fijo.dayOfMonth}`
                  }
                  theme={theme}
                />
                <InfoLine
                  icon="event"
                  label={nextDueLabel(fijo.next_due_on)}
                  theme={theme}
                />
                <InfoLine
                  icon="local-offer"
                  label={categoryName || 'Sin categoría'}
                  theme={theme}
                />
              </View>

              {/*
                Historial — solo cuando hay >= 1 pago lifetime registrado.
                Pone la suscripción en contexto: el user que está
                pensando en cancelar ve cuánto invirtió.
              */}
              {fijo.paymentsLifetime > 0 ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
                    HISTORIAL
                  </Text>
                  <InfoLine
                    icon="receipt-long"
                    label={`${fijo.paymentsLifetime} ${fijo.paymentsLifetime === 1 ? 'cuota registrada' : 'cuotas registradas'}`}
                    theme={theme}
                  />
                  {fijo.totalPaidLifetime > 0 ? (
                    <InfoLine
                      icon="payments"
                      label={`Ya pagaste ${formatMoney(fijo.totalPaidLifetime)} en total`}
                      theme={theme}
                    />
                  ) : null}
                </View>
              ) : null}
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
          <View style={styles.phSubRow}>
            <View style={[styles.phBar, { width: 64, height: 8, backgroundColor: ph }]} />
            <View style={[styles.phBar, { width: 90, height: 8, backgroundColor: ph }]} />
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
function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

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

/**
 * Botón inline "Pagar" — visualmente único y referenciado al pago.
 *
 * Diseño:
 *   · Círculo 40pt + hitSlop 8 = ~56pt efectivo (HIG/MD ≥44pt).
 *   · Brand color por status: forest-deep (pending, "go") /
 *     red-brand (overdue, "urgente"). Bg sólido + icono blanco
 *     reads como primario, no genérico negro.
 *   · Ícono `attach-money` — símbolo $ universalmente asociado a
 *     pago. Mejor que `check` (que es post-confirmación / done) y
 *     mejor que `paid` (mismo problema).
 *   · Borde 1.5pt en tono más profundo del bg → finish curado.
 *   · Press scale 0.88 (pronunciado para icon-only).
 *   · Pulse halo continuo PARA OVERDUE: círculo BG-only que crece
 *     y se desvanece en loop (1.5s ease-in-out, scale 1→1.45,
 *     opacity 0.45→0). Skip si reduceMotion activo.
 *
 * Decisiones de poda visual (gpt-taste + impeccable):
 *   · NO inner highlight (línea blanca alpha top): probada como
 *     "lift" sutil, en práctica se leía como una línea sobre el
 *     símbolo $ — ruido visual. Removida.
 *
 * Performance: pulse en UI thread vía Reanimated; cleanup
 * cancelAnimation en unmount.
 */
function InlinePayButton({
  status,
  pressScale,
  onPress,
}: {
  status: 'pending' | 'overdue'
  pressScale: ReturnType<typeof usePressScale>
  onPress: () => void
}) {
  const reduceMotion = useReducedMotion()
  const pulse = useSharedValue(0)

  // Pulse loop SOLO en overdue. Pulse value oscila 0 → 1 en cada
  // ciclo; el animatedStyle interpola a scale + opacity.
  useEffect(() => {
    if (status === 'overdue' && !reduceMotion) {
      pulse.value = 0
      pulse.value = withRepeat(
        withTiming(1, {
          duration: 1500,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          reduceMotion: ReduceMotion.System,
        }),
        -1, // infinite
        false, // no reverse — el reset a 0 da el efecto "respiración"
      )
    } else {
      pulse.value = 0
    }
    return () => {
      cancelAnimation(pulse)
    }
  }, [status, reduceMotion, pulse])

  const haloStyle = useAnimatedStyle(() => ({
    // Scale 1 → 1.45 (halo crece desde el botón).
    // Opacity 0.45 → 0 (se desvanece como pulse).
    transform: [{ scale: 1 + pulse.value * 0.45 }],
    opacity: 0.45 * (1 - pulse.value),
  }))

  const isOverdue = status === 'overdue'
  // Paleta brand-aware. Light: deep-forest verde / deep-red rojo.
  // Dark: variantes brand-bright para contraste con surfaceMuted.
  const bg = isOverdue ? '#A8211B' : '#297811' // forest deep / red brand
  const borderColor = isOverdue ? '#7A1810' : '#1F5A0D' // 1 stop darker

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        isOverdue ? 'Pagar — fijo en mora' : 'Pagar'
      }
      accessibilityHint="Abre el sheet para confirmar el monto pagado"
      style={styles.inlinePayWrap}
    >
      {/* Halo pulse (solo overdue, layered atrás del botón) */}
      {isOverdue ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.inlinePayHalo,
            { backgroundColor: bg },
            haloStyle,
          ]}
        />
      ) : null}

      <Animated.View
        style={[
          styles.inlinePayBtn,
          { backgroundColor: bg, borderColor },
          pressScale.animatedStyle,
        ]}
      >
        <MaterialIcons name="attach-money" size={22} color="#FFFFFF" />
      </Animated.View>
    </Pressable>
  )
}

/**
 * Línea info del expand panel — icon + label en una fila. Mirror del
 * patrón "list item with leading icon" típico de iOS settings, simple
 * y consistente. Icon size 14 para no competir con el texto. Color del
 * icon es textMuted para no robar atención del label.
 */
function InfoLine({
  icon,
  label,
  theme,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  label: string
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  return (
    <View style={styles.infoLine}>
      <MaterialIcons name={icon} size={14} color={theme.colors.textMuted} />
      <Text
        style={[styles.infoLineText, { color: theme.colors.text }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  )
}

/**
 * Copy humano para el trend chip. Convierte un delta numérico ("+12%")
 * a una oración con verbo ("Subió 12% desde el último pago") para que
 * sea legible por usuarios que no leen porcentajes con fluidez. Pivot
 * a "Mantiene" para deltas chicos (< 1%) para no alarmar sobre ruido
 * de redondeo.
 */
function trendCopyLabel(deltaPct: number): string {
  if (Math.abs(deltaPct) < 1) return 'Mantiene el precio'
  const sign = deltaPct > 0 ? 'Subió' : 'Bajó'
  return `${sign} ${Math.abs(deltaPct)}% desde el último pago`
}

function trendCopySubLabel(history: number[]): string {
  // Si hay 3+ puntos, mostramos contexto del rango histórico: "del último
  // pago vs el primero registrado". Solo 2 puntos = "vs el anterior".
  if (history.length >= 3) {
    const oldest = history[0] ?? 0
    const current = history[history.length - 1] ?? 0
    if (oldest > 0 && current > 0) {
      const totalDelta = Math.round(((current - oldest) / oldest) * 100)
      if (Math.abs(totalDelta) >= 1) {
        return `${totalDelta > 0 ? '+' : ''}${totalDelta}% en ${history.length} pagos`
      }
    }
  }
  return `Comparación con el pago anterior`
}

function trendCopyColor(deltaPct: number, isDark: boolean): string {
  if (Math.abs(deltaPct) < 1) return isDark ? '#D5D5D5' : '#5A5A5A'
  if (deltaPct > 0) return isDark ? '#F2A78C' : '#B84014'
  return isDark ? '#A6EF8F' : '#297811'
}

/**
 * Convierte un `next_due_on` ('YYYY-MM-DD') a texto humano:
 *   - Mismo mes y año + futuro: "Vence el 10 de junio (en 5 días)"
 *   - Mismo mes y año + hoy:    "Vence HOY (10 de junio)"
 *   - Mismo mes y año + pasado: "Venció el 10 de junio (hace 5 días)"
 *   - Año distinto: agrega año.
 * Null/inválido devuelve "Sin fecha programada".
 */
function nextDueLabel(nextDueOn: string | null): string {
  if (!nextDueOn) return 'Sin fecha programada'
  const parts = nextDueOn.split('-')
  if (parts.length < 3) return nextDueOn
  const year = parseInt(parts[0]!, 10)
  const monthIdx = parseInt(parts[1]!, 10) - 1
  const day = parseInt(parts[2]!, 10)
  if (Number.isNaN(year) || Number.isNaN(monthIdx) || Number.isNaN(day)) {
    return nextDueOn
  }
  const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]
  const monthName = MONTH_NAMES[monthIdx] ?? ''
  const currentYear = new Date().getFullYear()
  const yearSuffix = year === currentYear ? '' : ` de ${year}`
  const today = new Date()
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const dueUtc = Date.UTC(year, monthIdx, day)
  const diffDays = Math.round((dueUtc - todayUtc) / 86_400_000)
  if (diffDays === 0) {
    return `Vence HOY (${day} de ${monthName}${yearSuffix})`
  }
  if (diffDays > 0) {
    return `Vence el ${day} de ${monthName}${yearSuffix} (en ${diffDays} ${diffDays === 1 ? 'día' : 'días'})`
  }
  const absDays = Math.abs(diffDays)
  return `Venció el ${day} de ${monthName}${yearSuffix} (hace ${absDays} ${absDays === 1 ? 'día' : 'días'})`
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
  // Sub-info stack: 2 líneas verticales para que catName + chip + detail
  // entren sin elipsis incluso en pantallas chicas.
  //   Línea 1 (metaIdRow): catName · chip del mes
  //   Línea 2 (metaDue): detail label (full width, hasta 2 líneas wrap)
  // Card crece ~14pt verticales — preferible a truncar info que el
  // usuario necesita ver completa.
  metaStack: {
    marginTop: 4,
    gap: 3,
  },
  metaIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaCat: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    flexShrink: 0,
  },
  metaSep: {
    fontSize: 11.5,
    fontWeight: '400',
  },
  // Status badge — pill MUY compacto. El wording está diseñado para
  // caber siempre en 1 línea ("Vencida 11d", "En 5d", "Pagada",
  // "Próxima", "Hoy"); el icon carga la mayor parte del significado.
  // Padding tight (6×2) + fontSize 10.5 + iconSize 11 — minimal mass
  // proporcional a la cantidad de info que transmite.
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
  // Padding tight, borde 1pt en accent.border, texto en accent.solid
  // (bold + uppercase letter-spacing para que lea como "tag").
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
  // ── Placeholder / preview ────────────────────────────────────────
  placeholderCard: {
    opacity: 0.86,
    // Standalone (sin SwipeRow alrededor): restauramos las esquinas
    // derechas para que el placeholder se lea como card completa.
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  phBar: { borderRadius: 5 },
  // Sub-row del placeholder: dos barras mock simulando "categoría · meta"
  // de la sub-line real (que ya no usa chip pill — ver `metaLine`).
  phSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
  // Tabular nums para columna right-aligned de montos entre rows
  // (mismo razonamiento que Gastos.GastoRow.amount).
  amount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  detailBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    gap: 12,
  },
  // DetailTile / detailGrid del v1 quedaron deprecated cuando el expand
  // panel pasó a la versión rica (statsHero + section + InfoLine) en
  // 2026-05-30. Mantengo este comment ancla por si querés grep por
  // "detailGrid" buscando el cambio.
  // Stats hero — bloque destacado con la cifra anual / total. Bg
  // tintado por status, accent stripe vertical 3pt en el left edge.
  // Padding-left extra para dejar respirar el contenido del stripe.
  // Cifra grande (24sp) + eyebrow en accent.solid + sublabel del %.
  statsHero: {
    borderRadius: 12,
    paddingLeft: 18, // 14 + 4 para no chocar con la accent stripe
    paddingRight: 14,
    paddingVertical: 12,
    gap: 4,
    overflow: 'hidden', // clip la stripe a los corners redondeados
  },
  statsAccentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  statsEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statsValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  statsPctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  statsPctText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Section: bloque temático con eyebrow + contenido. Sin bg, separados
  // por gaps (el `gap: 12` del detailBlock cuida los breaks).
  section: {
    gap: 6,
  },
  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  // Trend row: sparkline + copy en columnas. Sparkline a la izquierda,
  // copy con verbo + sub a la derecha.
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  trendSparkSlot: {
    width: 70,
    height: 30,
    justifyContent: 'center',
  },
  trendCopySlot: {
    flex: 1,
    gap: 2,
  },
  trendCopyMain: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  trendCopySub: {
    fontSize: 11,
    fontWeight: '500',
  },
  // InfoLine — fila simple con icon + label, usada para frecuencia /
  // vencimiento / categoría / historial.
  infoLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 2,
  },
  infoLineText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  actionsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
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
  // Botón inline "Pagar" — visualmente único + referenciado al pago
  // (gpt-taste + ui-ux-pro-max + emil). 40pt visual + hitSlop 8px =
  // ~56pt efectivo (HIG ≥44pt). Brand-colored según status — no
  // genérico negro. Ícono `attach-money` (símbolo $) en blanco.
  // El wrap maneja layout + alineación del halo pulse (overdue);
  // el btn lleva el visual chrome.
  inlinePayWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  inlinePayBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  // Halo pulse continuo para overdue — se renderiza absoluto detrás
  // del botón, escalando y desvaneciéndose en loop. Color = mismo bg
  // del botón pero alpha-modulado vía el animatedStyle (NO bg-alpha
  // hardcodeado para que el dark mode también funcione).
  inlinePayHalo: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 999,
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
