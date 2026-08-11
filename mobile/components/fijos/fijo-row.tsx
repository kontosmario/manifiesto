import { memo, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { SwipeRow, type SwipeAction } from '@/components/ui/swipe-row'
import { useFijosSkin, type FijosNeoSkin } from '@/components/fijos/fijos-skin'
import { FijoTrendSpark } from '@/components/fijos/fijo-trend-spark'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { CategoryIcon } from '@/components/category/category-icon'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { usePressScale } from '@/hooks/use-press-scale'
import { darkenForLightBg, lightenForDarkBg } from '@/utils/category-color'
import { resolveCategoryHueByName } from '@/theme/category-hues'
import { resolveFijosCategoryTone } from '@/components/fijos/fijos-category-palette'
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
import { nunitoFamily } from '@/theme/typography'

interface FijoRowProps {
  item?: FijoItem
  categoryColor?: string
  categoryName?: string
  /**
   * Nombre CRUDO (no localizado) de la categoría para resolver el ícono
   * (el matcher es ES). El display sigue usando `categoryName`. Cae a
   * `categoryName` cuando falta.
   */
  categoryRawName?: string
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
  categoryRawName,
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
  const skin = useFijosSkin()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  /**
   * Las métricas grandes del handoff (tile 52, nombre 19/900, monto 21/900,
   * card 26/16) son las de `Detalle Fijo Manifiesto.dc.html` — el estado
   * EXPANDIDO. La pantalla principal del handoff no dibuja filas por ítem:
   * su "TODOS TUS FIJOS" son filas de CATEGORÍA (radio 22, gap 12).
   *
   * Aplicarlas a la fila colapsada rompe con datos reales: en una fila de
   * ~303px útiles, tile(52) + monto de 6 cifras a 21px + pill "Pagar" no
   * dejan ancho para el nombre y queda "Appl e …". El mock entra porque
   * dibuja UN ítem con "$30.600".
   *
   * Entonces: colapsado = compacto, expandido = la card del handoff.
   */
  const bigCard = skin.kind === 'neo' && open
  // Gateado: el primer attach del tab no debe disparar la layout
  // transition de la fila (warp). Tras el idle se habilita para expandir/
  // colapsar y para add/delete de fijos.
  const rowLayout = useGatedLayout(LinearTransition.duration(240))
  // Ícono por nombre CRUDO (matcher ES); el display sigue en `categoryName`.
  // CategoryIcon rendea el sticker si hay slug mapeado, sino cae al emoji.
  const iconName = categoryRawName ?? categoryName
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
  const inlinePayPress = usePressScale({ pressedScale: 0.95 })

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

  // Fondo del icon tile — mismo patrón que GastoRow: en dark usa el pastel
  // CLARO del hue (el color que antes ponía la placa tight del sticker) →
  // el sticker se lee a tamaño completo sobre el tile 40×40, igual que en
  // light, sin el "cuadradito" de 24px que lo encogía. En light se mantiene
  // el tinte translúcido del categoryColor de siempre.
  // En `neo` el tile deja de ser una PLACA opaca y pasa a ser un tinte
  // translúcido del mismo hue — el tratamiento del kit de Gastos ya aprobado.
  // La placa clara era lo que más rompía la paleta oscura: un bloque pastel
  // brillante por fila compitiendo con el monto y con el pill de Pagar.
  // En `neo` el tile sale de `fijos-category-palette` — la MISMA paleta que
  // pinta la card de categoría que contiene a esta fila. Antes salía del
  // `categoryColor` de la base, que es un tercer sistema: quedaba un tile azul
  // adentro de una card teal (Seguros) y uno casi negro adentro de una azul
  // (Servicios), porque el color de la base no tiene nada que ver con el tono.
  //
  // El tono SIGUE AL TEMA. Usar la variante clara en oscuro dejaba un parche
  // de light mode en cada fila — el owner lo cazó en device. La oscura tiene
  // croma de sobra (L=24%/S=50%) para diferenciarse del `#1A2D21` de la fila
  // y para sostener el sticker sin placa.
  const iconTileBg = useMemo(
    () =>
      skin.kind === 'neo'
        ? resolveFijosCategoryTone(iconName, theme.isDark).surface
        : theme.isDark
          ? resolveCategoryHueByName(iconName).light.surface
          : hexAlpha(categoryColor, 0.14),
    [skin, theme.isDark, iconName, categoryColor],
  )

  // Superficie de la card. La rama `classic` es LITERAL la de siempre —
  // sombra RN por props, que solo se enciende al expandir. La `neo` usa el
  // `boxShadow` dual del spec, siempre visible (el relieve no es un estado,
  // es la piel), más el gradiente cuando el tema lo define.
  const cardSurface = useMemo(
    () =>
      skin.kind === 'neo'
        ? {
            // El color SIEMPRE se emite, incluso cuando hay gradiente. El kit
            // lo omite en ese caso para no pintar dos fills por fila, pero
            // `experimental_backgroundImage` NO renderiza en
            // react-native-web (verificado: cero gradientes CSS en el
            // documento del preview, solo los PNG de los stickers), así que
            // omitirlo dejaba la fila TRANSPARENTE en web. Con el color de
            // base, nativo pinta el gradiente encima y web cae al sólido del
            // spec, que es el color medio del propio gradiente.
            backgroundColor: skin.row.background,
            experimental_backgroundImage: skin.row.gradientCss,
            // SIN `boxShadow`: el relieve vive en el wrapper de afuera, porque
            // acá adentro el `overflow:'hidden'` del SwipeRow lo recorta.
            borderTopLeftRadius: open ? skin.card.radius : skin.row.radius,
            borderBottomLeftRadius: open ? skin.card.radius : skin.row.radius,
            ...(open
              ? { paddingHorizontal: skin.card.padding, paddingVertical: skin.card.padding }
              : null),
            overflow: 'visible' as const,
          }
        : {
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
            overflow: 'visible' as const,
          },
    [skin, theme.isDark, theme.colors.surfaceMuted, theme.colors.creamCard, theme.colors.text, open],
  )

  // Swipe reveals only "Eliminar". Edit + Registrar pago live inside
  // the tap-to-expand details panel.
  const actions: SwipeAction[] = []
  if (onDelete) {
    actions.push({
      label: t('fijos:row.delete'),
      tone: 'danger',
      icon: 'delete',
      onPress: () => onDelete(fijo.id),
    })
  }

  const swipeRow = (
    <SwipeRow
      accessibilityHint={t('fijos:row.swipeDeleteHint')}
      rightActions={actions}
      isProcessing={isPending}
      // Matchea el borderRadius del card interno para que el clip y los
      // bordes redondeados del panel de acción terminen en la misma curva.
      borderRadius={skin.kind === 'neo' ? (open ? skin.card.radius : skin.row.radius) : 16}
      skin={skin.kind}
    >
      <Animated.View layout={rowLayout}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          onPressIn={cardPress.onPressIn}
          onPressOut={cardPress.onPressOut}
        >
          <Animated.View style={[styles.card, cardSurface, cardPress.animatedStyle]}>
            {/*
              Confetti for this specific row. Triggered by the status
              flip → 'paid'. originY=0 puts the burst at the top of the
              card; particles spread outward and downward over the row.
              Inert (renders null) until the first pulse arrives.
            */}
            <ConfettiBurst pulseToken={confettiPulse} originY={0} />
            <View style={[styles.row, bigCard ? { gap: skin.card.gap } : null]}>
              <View style={styles.iconWrap}>
                <View
                  style={[
                    styles.iconTile,
                    {
                      backgroundColor: iconTileBg,
                      // El borde es del lenguaje viejo: en el kit el tile es un
                      // cuadrado tintado limpio, sin contorno.
                      borderColor: hexAlpha(categoryColor, 0.22),
                    },
                    skin.kind === 'neo'
                      ? {
                          borderRadius: skin.card.tileRadius,
                          borderWidth: 0,
                          // 5/5/12 del handoff, NO el `raiseSm` del spec
                          // (6/6/14): se auditó y el spec no tiene este valor.
                          boxShadow: skin.tile.shadow,
                        }
                      : null,
                    bigCard
                      ? { width: skin.card.tileSize, height: skin.card.tileSize }
                      : null,
                  ]}
                >
                  <CategoryIcon
                    name={iconName}
                    scope="fixed_expense"
                    // El tile pasa de 40 a 52: el sticker escala con él para
                    // conservar la misma proporción que dibuja el handoff.
                    size={bigCard ? 30 : 24}
                    emojiStyle={styles.iconText}
                    onLightSurface
                  />
                </View>
                {/* Status overlay (slot del WhoPaidAvatar en GastoRow). */}
                <View
                  style={[
                    styles.statusOverlay,
                    {
                      backgroundColor: statusOverlay.bg,
                      borderColor: statusOverlay.border,
                    },
                    skin.kind === 'neo'
                      ? {
                          width: skin.card.overlaySize,
                          height: skin.card.overlaySize,
                          backgroundColor: skin.card.overlayRing,
                          borderWidth: 0,
                        }
                      : null,
                  ]}
                  accessibilityRole="text"
                  accessibilityLabel={statusAccessibilityLabel(status)}
                >
                  <MaterialIcons
                    name={statusOverlay.icon}
                    size={bigCard ? 13 : 10}
                    color={skin.kind === 'neo' ? skin.accent(status).ink : statusOverlay.fg}
                  />
                </View>
              </View>

              <View style={styles.body}>
                {/*
                  El nombre del fijo es la identidad del row → tiene la
                  línea completa para sí. El TrendBadge ("+8%") se movió al
                  strip inferior; antes vivía acá inline y le robaba ~40px
                  de ancho, dejando el nombre en "Coc…" / "Disne…". Hasta 2
                  líneas para que nombres largos se lean completos.
                */}
                <View style={styles.nameRow}>
                  <Text
                    style={[
                      styles.name,
                      { color: skin.kind === 'neo' ? skin.ink.title : theme.colors.text },
                      bigCard ? skin.type.name : null,
                    ]}
                    numberOfLines={2}
                  >
                    {fijo.name}
                  </Text>
                </View>
                {/*
                  Body line 2: categoría como texto inline. Antes
                  competía con chips + badge por espacio horizontal —
                  ahora los chips se moveron a su propio strip dedicado
                  debajo del top row, así que la categoría tiene la fila
                  completa sin truncation.
                */}
                {/* En `neo` la categoría se tinta con el ACENTO DEL ESTADO, no
                    con el hue de la categoría: en el handoff esa línea es la
                    que comunica urgencia (terracota) o cierre (verde). El hue
                    de categoría sigue vivo en el tile del sticker. */}
                <Text
                  style={[
                    styles.catLine,
                    { color: skin.kind === 'neo' ? skin.accent(status).ink : catChipTextColor },
                    bigCard ? skin.type.category : null,
                  ]}
                  numberOfLines={1}
                >
                  {categoryName}
                </Text>
              </View>

              <View style={styles.amountBlock}>
                <Text
                  style={[
                    styles.amount,
                    { color: skin.kind === 'neo' ? skin.ink.amount : theme.colors.text },
                    bigCard ? skin.type.amount : null,
                  ]}
                >
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
                muestran nada aquí. Visual detallado vive en
                ./fijo-row-parts/inline-pay-button.tsx — incluye el halo
                pulse de overdue + ref-guard contra unmount.
              */}
              {/* Al expandir, el pill sale de la fila superior y baja al CTA
                  de ancho completo del panel — sin eso el nombre a 19/900 no
                  entra (ver el docblock de `bigCard`). */}
              {(status === 'pending' || status === 'overdue') && onMarkPaid && !bigCard ? (
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
                    // El chip del mes va SIEMPRE en verde en el handoff
                    // ("Julio"), sin importar el estado del fijo: informa el
                    // período, no la urgencia. La urgencia la lleva el chip de
                    // al lado.
                    skin.kind === 'neo'
                      ? {
                          ...neoChipStyle(skin),
                          backgroundColor: skin.accent('paid').chipBackground,
                        }
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.monthChipText,
                      { color: accent.solid },
                      skin.kind === 'neo'
                        ? { ...neoChipTextStyle(skin), color: skin.accent('paid').ink }
                        : null,
                    ]}
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
                  skin.kind === 'neo'
                    ? {
                        ...neoChipStyle(skin),
                        backgroundColor: skin.accent(status).chipBackground,
                      }
                    : null,
                ]}
              >
                <MaterialIcons
                  name={detail.icon}
                  size={skin.kind === 'neo' ? 13 : 12}
                  color={skin.kind === 'neo' ? skin.accent(status).ink : accent.solid}
                />
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color: accent.solid,
                      fontWeight:
                        status === 'overdue' || detail.isToday ? '800' : '700',
                      fontFamily: nunitoFamily(status === 'overdue' || detail.isToday ? '800' : '700'),
                    },
                    skin.kind === 'neo'
                      ? { ...neoChipTextStyle(skin), color: skin.accent(status).ink }
                      : null,
                  ]}
                  numberOfLines={1}
                >
                  {detail.label}
                </Text>
              </View>
              {/*
                Badge de variación de precio — reubicado acá desde el lado
                del nombre. Vive en el strip de metadata (mes · estado ·
                variación), donde tiene aire propio y no compite con el
                nombre por ancho.
              */}
              {fijo.trendDeltaPct != null && Math.abs(fijo.trendDeltaPct) >= 1 ? (
                <TrendBadge
                  deltaPct={fijo.trendDeltaPct}
                  // Si el último pago se cobró con mora Y el delta es
                  // positivo, leemos como "incremento con intereses" (el
                  // aumento puede explicarse por punitorios del servicio).
                  // Si bajó, no hay diferencia semántica.
                  variant={
                    fijo.arrearsOnLastPayment && fijo.trendDeltaPct > 0
                      ? 'arrears'
                      : 'price'
                  }
                />
              ) : null}
            </View>

            {open ? (
              <FijoRowDetailPanel
                fijo={fijo}
                status={status}
                accent={accent}
                categoryName={categoryName}
                onEdit={onEdit}
                // Solo en `neo`: en classic el pill sigue en la fila superior,
                // así que pasar el handler duplicaría la acción de pago. Ídem
                // eliminar, que en classic vive en el swipe y solo ahí.
                onDelete={skin.kind === 'neo' ? onDelete : undefined}
                onMarkPaid={bigCard ? onMarkPaid : undefined}
                onRevertPaid={onRevertPaid}
              />
            ) : null}
          </Animated.View>
        </Pressable>
      </Animated.View>
    </SwipeRow>
  )

  if (skin.kind !== 'neo') return swipeRow

  /**
   * El relieve NO puede vivir en la card interna: `SwipeRow` envuelve todo en
   * un contenedor con `overflow:'hidden'` (swipe-row.tsx) para clipear los
   * paneles de acción, y ese clip RECORTA el `boxShadow` del hijo. Se veía
   * como que las filas "perdían la sombra" mientras la card de categoría —que
   * no va dentro de un SwipeRow— sí mostraba la suya.
   *
   * Por eso la superficie sube a un wrapper POR FUERA del clip. El wrapper
   * lleva fondo, radio y sombra; el SwipeRow sigue clipeando solo su
   * contenido.
   *
   * Jerarquía: la fila usa el raise CHICO (5/5/12) y la card de categoría que
   * la contiene el GRANDE (8/8/18). Mismo lenguaje, dos niveles — sin eso
   * padre e hijo tenían fondo y sombra idénticos y la lista se leía plana.
   */
  return (
    <View
      style={{
        backgroundColor: skin.row.background,
        // SIN gradiente: este wrapper queda ÍNTEGRAMENTE tapado por la card de
        // adentro, que ya lo pinta. En web daba igual (no renderiza), pero en
        // nativo eran dos fills a ancho completo por fila × ~16 filas.
        borderRadius: open ? skin.card.radius : skin.row.radius,
        boxShadow: open ? skin.row.shadow : skin.nestedRowShadow,
      }}
    >
      {swipeRow}
    </View>
  )
}

/** Geometría del chip del handoff: pozo (inset), no pill plana. El borde del
 *  lenguaje viejo se anula — el relieve lo da la sombra, no un contorno. */
function neoChipStyle(skin: FijosNeoSkin) {
  return {
    borderRadius: skin.chip.radius,
    paddingHorizontal: skin.chip.padH,
    paddingVertical: skin.chip.padV,
    borderWidth: 0,
    boxShadow: skin.chip.shadow,
  }
}

function neoChipTextStyle(skin: FijosNeoSkin) {
  return {
    fontSize: skin.chip.fontSize,
    fontWeight: skin.chip.fontWeight,
    fontFamily: skin.chip.fontFamily,
    letterSpacing: 0,
  }
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
  name: { fontSize: 14, fontWeight: '700', fontFamily: nunitoFamily('700'), flexShrink: 1 },
  // Categoría como texto inline en el body (línea 2 del top row).
  catLine: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.2,
  },
  amountBlock: { alignItems: 'flex-end', gap: 2 },
  amount: { fontSize: 16, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
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
