import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { BrotMascot, type BrotPose } from '@/components/brot'
import { NeoTabIcon } from '@/components/navigation/neo-tab-icons'
import { HOME_SPEC, type HomeMode } from '@/components/redesign/home/home-spec'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useModalVisibilityBeacon } from '@/lib/modal-visibility'
import {
  motionDurations,
  motionEasings,
  motionSprings,
  motionStagger,
} from '@/lib/motion'
import { withAlpha } from '@/theme/color-utils'
import { cssGradient, neoCategoryPastels, neoTokens } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import { ArcActionIcon } from './arc-action-icon'
import {
  arcBrotBaseline,
  arcRadius,
  arcSlots,
  arcTrackLength,
  arcTrackPath,
  ARC_DEAD_ZONE,
  ARC_LABEL_BOX,
  ARC_LABEL_LINE,
  ARC_BROT_SIZE,
  ARC_BUBBLE_BOX,
  ARC_BUBBLE_GAP,
  ARC_BUBBLE_LINE,
  ARC_BUBBLE_PAD_V,
  type ArcActionKey,
  type ArcSlot,
} from './arc-hub-geometry'
import {
  arcHub,
  setArcHubHostMounted,
  useArcHubSnapshot,
  type ArcHubAction,
} from './arc-hub-bus'
import { useArcHubValues, ARC_PHASE_CLOSED } from './arc-hub-context'
import { arcPhaseForMode } from './arc-hub-machine'
import { ARC_BROT_MESSAGES } from './arc-brot-messages'

const AnimatedPath = Animated.createAnimatedComponent(Path)

/**
 * Superficie del hub Arco. Se monta como HERMANO del `<Stack>` en
 * `AppStackShell`, con `zIndex` por encima de la barra de tabs y por
 * debajo del `ToastHost` (1000) — mismo mecanismo que
 * `BackgroundSnapshotOverlay`, que ya tapa la app entera en producción.
 *
 * NO usa `<Modal>`, y esa es la decisión que sostiene todo lo demás: cada
 * `<Modal>` del repo remonta su propio `GestureHandlerRootView`, o sea
 * otra raíz de gestos, y un touch en vuelo no tiene camino de continuidad
 * hacia otra ventana nativa. El arco tiene que aparecer con el dedo ya
 * abajo sobre el FAB.
 *
 * Durante el ARRASTRE la capa entera va con `pointerEvents="none"`: la
 * elección la resuelve el hit-test angular del pan, no el hit-test de
 * views, así que montar una superficie de pantalla completa a mitad del
 * gesto no puede robarle el toque.
 */
const ARC_Z_INDEX = 900

/**
 * Ventana de escalonado por puck, en unidades de `progress` (el centro
 * sale primero, las puntas últimas). `fanProgress` está documentado en el
 * vocabulario de movimiento para exactamente esto.
 */
const ARC_FAN_SPAN = motionStagger.fanProgress * 2
/** El nombre entra un escalón después que su puck. */
const ARC_LABEL_LAG = motionStagger.fanProgress
/** El surco arranca a dibujarse un escalón después de abrir. */
const ARC_TRACK_LAG = motionStagger.fanProgress

/**
 * Pastel por acción. NO es el mapeo de `add-quick-actions-overlay`
 * (ahí no-spend = hogar y fixed = ropa): este es el del prototipo
 * aprobado.
 */
const ARC_PASTEL_LIGHT: Record<ArcActionKey, string> = {
  fixed: neoCategoryPastels.vivienda,
  import: neoCategoryPastels.ocio,
  expense: neoCategoryPastels.mercado,
  'no-spend': neoCategoryPastels.mascotas,
  income: neoCategoryPastels.cuotas,
}

/**
 * Los pucks flotan sobre el scrim, no sobre una card, así que en oscuro el
 * pastel va OPACO.
 *
 * NO son el pastel claro atenuado: compuesto al 16% sobre la superficie
 * oscura, los cinco caían en la misma casilla (todos ~#3E5040) y el arco
 * perdía en oscuro la identidad por acción que sí tiene en claro. Estos
 * conservan el TONO de cada categoría del sistema —lavanda de ocio, arena
 * de vivienda, musgo de mercado, azul de cuotas, verde de mascotas— y lo
 * bajan a una luminancia común de 0.125.
 *
 * Equiluminantes a propósito: es lo que hace que los cinco tengan el mismo
 * peso visual y, sobre todo, el mismo contraste. Con la tinta (`text`,
 * #F1EEDD) dan 5.15:1 los cinco —AA de texto normal, no sólo el 3:1 de
 * objeto gráfico— y 3.12:1 contra el scrim compuesto (#0B140E), o sea que
 * el disco se sostiene como objeto aun sin mirar el aro.
 */
const ARC_PASTEL_DARK: Record<ArcActionKey, string> = {
  fixed: '#726143',
  import: '#6B5997',
  expense: '#57693E',
  'no-spend': '#406C55',
  income: '#4A667F',
}

/** Alfa del scrim: el mismo que usan `ModalCard` neo y la hoja del FAB. */
const ARC_SCRIM_ALPHA = 0.84

/**
 * Pose de respaldo, por si el catálogo de mensajes quedara vacío. Brot no
 * puede dejar un hueco en el layout: el slot tiene alto fijo.
 */
const ARC_BROT_POSE_FALLBACK: BrotPose = 'coach'

/**
 * Globo de chat de Brot — la parte VISUAL. El alto y el aire contra el dibujo
 * de Brot viven en `arc-hub-geometry`, que es puro y se testea.
 *
 * El texto suelto sobre el scrim NO era un problema de contraste — daba
 * 6.96:1 en claro y 16.07:1 en oscuro, de sobra. Se perdía por FIGURA: 12,5px
 * flotando sobre un scrim translúcido, con la Home asomando por detrás y sin
 * ningún plano que lo contuviera. Lo que hace falta es la superficie, no más
 * contraste.
 *
 * Va SIN aro y SIN colita (decisión del owner): la separación la hace sólo el
 * relieve neumórfico, y lo que lo lee como habla son las esquinas — tres
 * redondas y una en punta, el globo entrante de cualquier app de mensajería.
 * El relleno aporta poco (1.56:1 contra el scrim en claro, 1.32:1 en oscuro),
 * así que el `boxShadow` es load-bearing acá: sacarlo deja el globo flotando
 * sin borde.
 */
const ARC_BUBBLE_PAD_H = 14
const ARC_BUBBLE_RADIUS = 18
/** La esquina en punta: la que convierte el chip en un globo de habla. */
const ARC_BUBBLE_RADIUS_TIP = 4

/** Trazos del surco, grabado en el scrim. */
const ARC_TRACK_STROKES: Record<HomeMode, { dark: string; light: string; fill: string }> = {
  light: {
    dark: 'rgba(151,160,136,0.6)',
    light: 'rgba(255,255,255,0.9)',
    fill: 'rgba(151,160,136,0.28)',
  },
  dark: {
    dark: 'rgba(0,0,0,0.72)',
    light: 'rgba(101,152,113,0.26)',
    fill: 'rgba(0,0,0,0.42)',
  },
}
const ARC_TRACK_WIDTH = 34
const ARC_TRACK_OFFSET = 3.5

const ARC_FAB_FALLBACK: Record<HomeMode, string> = {
  light: '#327E39',
  dark: '#DCE0D0',
}

export function ArcHubHost() {
  const values = useArcHubValues()
  const snapshot = useArcHubSnapshot()
  const theme = useThemeTokens()
  const mode: HomeMode = theme.mode === 'dark' ? 'dark' : 'light'
  const neo = neoTokens(theme.mode)
  const spec = HOME_SPEC[mode]
  const reduced = useReducedMotion()
  const { t } = useTranslation()
  const viewport = useWindowDimensions()

  const hubMode = snapshot.mode
  const isLatched = hubMode === 'latched'
  const isOpen = hubMode !== 'closed'
  // Retiro sin animación: la acción ya empujó una ruta y la pantalla nueva
  // entra por debajo de esta capa. La salida se resuelve en el MISMO render
  // que la trae, no en el efecto — un frame de scrim sobre el alta ya se ve.
  const instant = snapshot.instant && !isOpen

  // El arco no publica el beacon mientras el dedo está abajo: el
  // `ToastHost` reacciona montando su propia ventana nativa, y esa ventana
  // captura los toques mientras vive — mataría el gesto en curso. En
  // `latched` no hay gesto que proteger y un aviso de error tiene que
  // poder dibujarse por encima.
  useModalVisibilityBeacon(isLatched)

  const rootRef = useRef<View | null>(null)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  // El pan reporta coordenadas de VENTANA; esta capa las necesita
  // relativas a sí misma. Medir el propio origen cierra cualquier
  // corrimiento (status bar translúcida, edge-to-edge de Android) en vez
  // de asumir que la raíz arranca en 0,0.
  const handleLayout = useCallback(() => {
    rootRef.current?.measureInWindow((x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      setOrigin((prev) => (prev.x === x && prev.y === y ? prev : { x, y }))
    })
  }, [])

  const cx = snapshot.cx - origin.x
  const cy = snapshot.cy - origin.y
  const radius = useMemo(
    () => arcRadius(viewport.width, snapshot.cx),
    [viewport.width, snapshot.cx],
  )
  const slots = useMemo(() => arcSlots(radius), [radius])

  const progress = useSharedValue(0)
  const closing = useSharedValue(0)
  const fire = useSharedValue(0)

  const [mounted, setMounted] = useState(false)
  const mountedRef = useRef(false)
  mountedRef.current = mounted
  const visible = mounted && !instant

  // El estado del bus es de MÓDULO: sobrevive al desmontaje de esta capa.
  // Si el host se va con el hub abierto (la familia desaparece porque el
  // dueño eliminó el hogar desde otro device) el snapshot quedaría en
  // 'latched' para siempre y `open()` cortaría por `mode !== 'closed'` —
  // el FAB no volvería a abrir nada hasta reiniciar la app.
  useEffect(() => {
    setArcHubHostMounted(true)
    return () => {
      setArcHubHostMounted(false)
      arcHub.close()
      // Los shared values viven en el provider, que NO se desmonta con esta
      // capa: sin este reset el hub volvería a montar creyéndose abierto.
      if (values) {
        values.phase.value = ARC_PHASE_CLOSED
        values.pointed.value = -1
      }
    }
  }, [values])

  useEffect(() => {
    if (!values) return
    values.phase.value = arcPhaseForMode(hubMode)
    // El arrastre siembra su propio `pointed` en `onBegin`; los otros dos
    // caminos no, y sin este reset una apertura por tap heredaría el puck
    // que quedó apuntado en la anterior.
    if (hubMode === 'closed' || hubMode === 'latched') values.pointed.value = -1
  }, [values, hubMode])

  useEffect(() => {
    if (isOpen) {
      setMounted(true)
      closing.value = 0
      fire.value = 0
      progress.value = reduced ? 1 : withSpring(1, motionSprings.radialEnter)
      return
    }
    if (!mountedRef.current) return
    closing.value = 1
    if (reduced || instant) {
      progress.value = 0
      setMounted(false)
      return
    }
    progress.value = withTiming(
      0,
      { duration: motionDurations.exitTab, easing: motionEasings.exitStandard },
      (finished) => {
        if (finished) runOnJS(setMounted)(false)
      },
    )
  }, [isOpen, reduced, instant, progress, closing, fire])

  useEffect(() => {
    if (hubMode !== 'firing') return
    if (reduced) {
      fire.value = 1
      return
    }
    fire.value = withTiming(1, {
      duration: motionDurations.standard,
      easing: motionEasings.standard,
    })
  }, [hubMode, reduced, fire])

  // El pozo tiene que tener salida por atrás: un overlay de pantalla
  // completa que captura toques sin vía de escape ya nos dejó una capa
  // inescapable una vez (el scrim del tour).
  useEffect(() => {
    if (!isLatched) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      arcHub.close()
      return true
    })
    return () => sub.remove()
  }, [isLatched])

  useEffect(() => {
    if (!isLatched) return
    AccessibilityInfo.announceForAccessibility(t('states:arcHub.a11y.opened'))
  }, [isLatched, t])

  const pointedKey = snapshot.pointed
  const firedKey = snapshot.fired
  const isCancelling = hubMode === 'drag' && pointedKey === null

  // El catálogo es la fuente de verdad del estado de cada acción (la hoja
  // ya cambia de cara cuando el día está marcado). El arco lo lee del mismo
  // lugar en vez de volver a derivarlo.
  const actionByKey = useMemo(() => {
    const map = new Map<ArcActionKey, ArcHubAction>()
    for (const action of snapshot.actions) map.set(action.key, action)
    return map
  }, [snapshot.actions])

  const handlePoint = useCallback(
    (key: ArcActionKey | null) => {
      if (!values) return
      values.pointed.value =
        key === null ? -1 : slots.findIndex((slot) => slot.key === key)
      arcHub.point(key)
    },
    [values, slots],
  )

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }))

  const glyphStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(progress.value, [0, 1], [0, 45], Extrapolation.CLAMP)}deg` },
    ],
  }))

  const wellStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [0, 1], Extrapolation.CLAMP),
  }))

  const brotStyle = useAnimatedStyle(() => {
    const t2 = interpolate(progress.value, [ARC_FAN_SPAN, 1], [0, 1], Extrapolation.CLAMP)
    return {
      opacity: t2 * (1 - fire.value),
      transform: [
        { translateY: interpolate(t2, [0, 1], [14, 0]) },
        { scale: interpolate(t2, [0, 1], [0.86, 1]) },
      ],
    }
  })

  if (!values) return null

  const scrimColor = withAlpha(neo.scrim, ARC_SCRIM_ALPHA)
  // El aro NO usa el mismo token en los dos temas: en claro `textMuted`
  // daba 2.63:1 contra el scrim (por debajo del 3:1 de componentes) y en
  // oscuro `text` sería demasiado brillante contra el pastel.
  const rim = mode === 'dark' ? neo.textMuted : neo.text
  // Sorteado al abrir y sostenido toda la interacción: Brot ya no cambia de
  // cara según lo que estés apuntando.
  const brotMessage = ARC_BROT_MESSAGES[snapshot.brot] ?? null
  // El mensajito es el estado de reposo. Cuando hay un sector apuntado, la
  // línea pasa a decir qué hace el soltar: es el único momento en que el
  // usuario necesita una instrucción, y perderla ahí sería cambiar un saludo
  // por una función. Brot, en cambio, se queda quieto.
  const eyebrow = pointedKey
    ? t(`states:arcHub.eyebrow.${isLatched ? 'tapPointed' : 'dragPointed'}`)
    : brotMessage
      ? t(`states:arcHub.brot.${brotMessage.id}`)
      : ''
  const brotBase = cy - arcBrotBaseline(radius)

  return (
    <View
      ref={rootRef}
      collapsable={false}
      onLayout={handleLayout}
      pointerEvents={isLatched ? 'auto' : 'none'}
      accessibilityViewIsModal={isLatched}
      style={styles.root}
    >
      {visible ? (
        <>
          <Animated.View style={[StyleSheet.absoluteFill, scrimStyle, { backgroundColor: scrimColor }]}>
            {isLatched ? (
              <Pressable
                accessibilityLabel={t('states:quickActions.closeLabel')}
                accessibilityRole="button"
                onPress={() => arcHub.close()}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </Animated.View>

          <ArcTrack cx={cx} cy={cy} radius={radius} mode={mode} progress={progress} width={viewport.width} height={viewport.height} />

          <Animated.View
            pointerEvents="none"
            style={[
              styles.deadZone,
              wellStyle,
              {
                left: cx - ARC_DEAD_ZONE,
                top: cy - ARC_DEAD_ZONE,
                boxShadow: isCancelling ? neo.shadows.insetLg : neo.shadows.insetMd,
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.deadCaption, wellStyle, { left: cx - ARC_LABEL_BOX / 2, top: cy - 45 - ARC_LABEL_LINE / 2 }]}
          >
            <Text
              style={[
                styles.deadCaptionText,
                {
                  color: neo.text,
                  fontWeight: isCancelling ? '900' : '800',
                  fontFamily: nunitoFamily(isCancelling ? '900' : '800'),
                },
              ]}
            >
              {t('states:arcHub.cancel')}
            </Text>
          </Animated.View>

          {slots.map((slot) => {
            const action = actionByKey.get(slot.key)
            if (!action) return null
            const marked = action.visualState === 'marked'
            return (
              <ArcPuck
                key={slot.key}
                slot={slot}
                action={action}
                marked={marked}
                cx={cx}
                cy={cy}
                pointed={pointedKey === slot.key}
                fired={firedKey === slot.key}
                interactive={isLatched}
                rim={rim}
                mode={mode}
                neoGreen={neo.green}
                pastel={mode === 'dark' ? ARC_PASTEL_DARK[slot.key] : ARC_PASTEL_LIGHT[slot.key]}
                progress={progress}
                closing={closing}
                fire={fire}
                pointedIndex={values.pointed}
                reduced={reduced}
                onPoint={handlePoint}
                hint={t(`states:arcHub.a11y.hint.${actionCopyKey(slot.key, marked)}`)}
              />
            )
          })}

          {slots.map((slot) => (
            <ArcLabel
              key={slot.key}
              slot={slot}
              cx={cx}
              cy={cy}
              color={neo.text}
              pointed={pointedKey === slot.key}
              progress={progress}
              closing={closing}
              fire={fire}
              text={t(
                `states:arcHub.short.${actionCopyKey(
                  slot.key,
                  actionByKey.get(slot.key)?.visualState === 'marked',
                )}`,
              )}
            />
          ))}

          {/* Réplica del disco, hundida y con el glifo rotado a "×". Se
              dibuja acá arriba —y no cambiando el FAB real— para que el
              pivote quede por encima del scrim sin tocar la barra. */}
          <View pointerEvents="none" style={[styles.fab, { left: cx - 31, top: cy - 31 }]}>
            <View
              style={[
                styles.fabDisc,
                cssGradient(spec.fabGradientCss, ARC_FAB_FALLBACK[mode]),
                { boxShadow: spec.fabPressedShadow },
              ]}
            >
              <View style={[styles.fabWell, { boxShadow: spec.fabPressedWellShadow }]}>
                <Animated.View style={glyphStyle}>
                  <NeoTabIcon name="plus" color={spec.fabInk} size={24} strokeWidth={3} />
                </Animated.View>
              </View>
            </View>
          </View>

          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.brotSlot,
              brotStyle,
              {
                top:
                  brotBase - ARC_BROT_SIZE - ARC_BUBBLE_GAP - ARC_BUBBLE_BOX,
              },
            ]}
          >
            <View style={styles.bubbleWrap}>
              <View
                style={[
                  styles.bubble,
                  { backgroundColor: neo.sheet, boxShadow: neo.shadows.raisedMd },
                ]}
              >
                <Text numberOfLines={1} style={[styles.bubbleText, { color: neo.text }]}>
                  {eyebrow}
                </Text>
              </View>
            </View>
            <View style={styles.brotHost}>
              <BrotMascot
                pose={brotMessage ? brotMessage.pose : ARC_BROT_POSE_FALLBACK}
                size={ARC_BROT_SIZE}
                shadow={false}
                animated={!reduced}
              />
            </View>
          </Animated.View>
        </>
      ) : null}
    </View>
  )
}

/**
 * Clave de copy de una acción. Las del arco son camelCase (las del catálogo
 * llevan guión) y el día sin gasto tiene DOS caras: marcado, la acción es
 * quitar la marca, así que ni el nombre corto ni el hint pueden ser los
 * mismos — con lector de pantalla se anunciaba lo contrario de lo que pasa.
 */
function actionCopyKey(key: ArcActionKey, marked: boolean): string {
  const base = key === 'no-spend' ? 'noSpend' : key
  return marked && key === 'no-spend' ? `${base}Marked` : base
}

/**
 * Aislante de accesibilidad del árbol que queda DEBAJO del arco.
 *
 * `accessibilityViewIsModal` (el que usa el host) es sólo de iOS: en
 * Android TalkBack sigue barriendo más allá del arco y entra al contenido
 * de abajo — invisible bajo el scrim, pero enfocable y accionable; activar
 * un tab desde ahí navega con el arco todavía montado encima. Envuelve al
 * `<Stack>` y lo esconde de los servicios de accesibilidad mientras el hub
 * está en el pozo.
 *
 * Los hijos entran como PROP: este componente se re-renderiza con cada
 * apertura del arco, pero el elemento del `<Stack>` que recibe es el mismo
 * objeto, así que React salta el subárbol entero.
 */
export function ArcHubA11yShield({ children }: { children: ReactNode }) {
  const snapshot = useArcHubSnapshot()
  const hidden = Platform.OS === 'android' && snapshot.mode === 'latched'
  return (
    <View
      style={styles.shield}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {children}
    </View>
  )
}

// ─── Surco ──────────────────────────────────────────────────────

interface ArcTrackProps {
  cx: number
  cy: number
  radius: number
  mode: HomeMode
  progress: SharedValue<number>
  width: number
  height: number
}

/**
 * Surco neumórfico grabado en el scrim: tres trazos superpuestos al mismo
 * radio que los pucks.
 *
 * DESVÍO del prototipo: los dos trazos desplazados van SIN desenfoque. El
 * `filter: blur(4px)` del HTML necesitaría filtros SVG, que en
 * react-native-svg son terreno frágil y no degradan a "sin filtro" sino a
 * "no se dibuja". El par claro/oscuro desplazado ±3.5 sigue leyéndose como
 * relieve; lo que se pierde es la suavidad del labio.
 */
const ArcTrack = memo(function ArcTrack({ cx, cy, radius, mode, progress, width, height }: ArcTrackProps) {
  const path = useMemo(() => arcTrackPath(cx, cy, radius), [cx, cy, radius])
  const length = useMemo(() => arcTrackLength(radius), [radius])
  const strokes = ARC_TRACK_STROKES[mode]

  const animatedProps = useAnimatedProps(() => {
    const drawn = interpolate(
      progress.value,
      [ARC_TRACK_LAG, 1],
      [0, 1],
      Extrapolation.CLAMP,
    )
    return { strokeDashoffset: length * (1 - drawn) }
  })

  const opacityStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25], [0, 1], Extrapolation.CLAMP),
  }))

  const common = {
    fill: 'none' as const,
    strokeWidth: ARC_TRACK_WIDTH,
    strokeLinecap: 'round' as const,
    strokeDasharray: length,
  }

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, opacityStyle]}>
      <Svg width={width} height={height}>
        <AnimatedPath
          d={path}
          stroke={strokes.dark}
          transform={`translate(${ARC_TRACK_OFFSET},${ARC_TRACK_OFFSET})`}
          animatedProps={animatedProps}
          {...common}
        />
        <AnimatedPath
          d={path}
          stroke={strokes.light}
          transform={`translate(${-ARC_TRACK_OFFSET},${-ARC_TRACK_OFFSET})`}
          animatedProps={animatedProps}
          {...common}
        />
        <AnimatedPath d={path} stroke={strokes.fill} animatedProps={animatedProps} {...common} />
      </Svg>
    </Animated.View>
  )
})

// ─── Pucks ──────────────────────────────────────────────────────

interface ArcPuckProps {
  slot: ArcSlot
  action: ArcHubAction
  /** `visualState: 'marked'` del catálogo: la acción ya está hecha hoy. */
  marked: boolean
  cx: number
  cy: number
  pointed: boolean
  fired: boolean
  interactive: boolean
  rim: string
  mode: HomeMode
  neoGreen: string
  pastel: string
  progress: SharedValue<number>
  closing: SharedValue<number>
  fire: SharedValue<number>
  pointedIndex: SharedValue<number>
  reduced: boolean
  onPoint: (key: ArcActionKey | null) => void
  hint: string
}

function ArcPuck({
  slot,
  action,
  marked,
  cx,
  cy,
  pointed,
  fired,
  interactive,
  rim,
  mode,
  neoGreen,
  pastel,
  progress,
  closing,
  fire,
  pointedIndex,
  reduced,
  onPoint,
  hint,
}: ArcPuckProps) {
  const spec = HOME_SPEC[mode]
  const isCta = slot.key === 'expense'
  const start = slot.stagger * ARC_FAN_SPAN
  const index = slot.index

  // El atenuado es SÓLO de escala: bajar la opacidad hundiría el contraste
  // del ícono por debajo de 3:1 justo mientras se está eligiendo.
  const emphasis = useDerivedValue(() => {
    const current = pointedIndex.value
    const target = current === index ? 1.16 : current >= 0 ? 0.93 : 1
    if (reduced) return target
    return withTiming(target, {
      duration: motionDurations.micro,
      easing: motionEasings.standard,
    })
  })

  const style = useAnimatedStyle(() => {
    const isClosing = closing.value === 1
    const from = isClosing ? 0 : start
    const to = isClosing ? 1 - start : 1
    const t2 = interpolate(progress.value, [from, to], [0, 1], Extrapolation.CLAMP)
    const f = fire.value
    const fireScale = fired
      ? interpolate(f, [0, 1], [1, 1.24])
      : interpolate(f, [0, 1], [1, 0.35])
    // El énfasis se devuelve a 1 a medida que corre el disparo: si no, el
    // puck elegido cerraría en 1.16 × 1.24 en vez del 1.24 del catálogo.
    const emph = 1 + (emphasis.value - 1) * (1 - f)
    return {
      opacity: fired ? t2 : t2 * (1 - f),
      transform: [
        { translateX: interpolate(t2, [0, 1], [-slot.dx, 0]) },
        { translateY: interpolate(t2, [0, 1], [-slot.dy, 0]) },
        { scale: interpolate(t2, [0, 1], [0.12, 1]) * emph * fireScale },
      ],
    }
  })

  const ringStyle = useAnimatedStyle(() => ({
    opacity: fired && !reduced ? interpolate(fire.value, [0, 1], [0.95, 0]) : 0,
    transform: [{ scale: interpolate(fire.value, [0, 1], [1, 2.1]) }],
  }))

  const neo = neoTokens(mode)
  // 'marked' es el estado SELECCIONADO del vocabulario neo: relieve hundido
  // + aro verde (`shadows.ringSelected`), el mismo que usa el tile de la
  // hoja. Se sostiene también bajo el dedo, porque no es un press.
  const surface = isCta
    ? [
        cssGradient(spec.fabGradientCss, ARC_FAB_FALLBACK[mode]),
        { boxShadow: pointed ? spec.fabPressedShadow : spec.fabShadow },
      ]
    : [
        { backgroundColor: marked ? neo.selectedTint : pastel },
        {
          boxShadow: marked
            ? neo.shadows.ringSelected
            : pointed
              ? neo.shadows.insetMd
              : neo.shadows.raisedMd,
        },
      ]

  const glyphColor = isCta ? spec.fabInk : neo.text

  const disc = [
    styles.disc,
    ...surface,
    {
      width: slot.size,
      height: slot.size,
      borderRadius: slot.size / 2,
      // El aro de definición es regla ÚNICA para los cinco: sin él el
      // pastel da 1.35:1 contra el scrim y el puck de Gasto 2.09:1. En CSS
      // el `0 0 0 2px` va por FUERA de la caja; acá va por dentro, y el
      // diámetro nominal (88/64/56) se conserva.
      borderWidth: 2,
      borderColor: marked ? neoGreen : rim,
    },
  ]

  const glyph = isCta ? (
    <View
      style={[
        styles.ctaWell,
        { boxShadow: pointed ? spec.fabPressedWellShadow : spec.fabWellShadow },
      ]}
    >
      <ArcActionIcon actionKey={slot.key} color={glyphColor} puckSize={slot.size} />
    </View>
  ) : (
    <ArcActionIcon actionKey={slot.key} color={glyphColor} puckSize={slot.size} />
  )

  return (
    // El wrapper no tiene fill ni radio: el anillo de confirmación crece
    // MÁS ALLÁ del disco, y un padre con background redondeado lo recorta
    // en Android.
    <Animated.View
      pointerEvents={interactive ? 'box-none' : 'none'}
      style={[
        styles.puck,
        style,
        {
          left: cx + slot.dx - slot.size / 2,
          top: cy + slot.dy - slot.size / 2,
          width: slot.size,
          height: slot.size,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.puckRing, ringStyle, { borderColor: neoGreen, borderRadius: slot.size / 2 + 4 }]}
      />
      {interactive ? (
        <Pressable
          accessibilityHint={hint}
          accessibilityLabel={action.label}
          accessibilityRole="button"
          accessibilityState={{ selected: marked }}
          onPress={() => arcHub.fire(slot.key)}
          onPressIn={() => onPoint(slot.key)}
          onPressOut={() => onPoint(null)}
          style={disc}
        >
          {glyph}
        </Pressable>
      ) : (
        <View style={disc}>{glyph}</View>
      )}
    </Animated.View>
  )
}

// ─── Nombres ────────────────────────────────────────────────────

interface ArcLabelProps {
  slot: ArcSlot
  cx: number
  cy: number
  color: string
  pointed: boolean
  progress: SharedValue<number>
  closing: SharedValue<number>
  fire: SharedValue<number>
  text: string
}

function ArcLabel({ slot, cx, cy, color, pointed, progress, closing, fire, text }: ArcLabelProps) {
  const start = slot.stagger * ARC_FAN_SPAN

  const style = useAnimatedStyle(() => {
    const isClosing = closing.value === 1
    const from = isClosing ? 0 : start + ARC_LABEL_LAG
    const to = isClosing ? 1 - start : 1
    const t2 = interpolate(progress.value, [from, to], [0, 1], Extrapolation.CLAMP)
    return { opacity: t2 * (1 - fire.value) }
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.label,
        style,
        { left: cx + slot.lx - ARC_LABEL_BOX / 2, top: cy + slot.ly - ARC_LABEL_LINE },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.labelText,
          {
            color,
            fontWeight: pointed ? '900' : '800',
            fontFamily: nunitoFamily(pointed ? '900' : '800'),
          },
        ]}
      >
        {text}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: ARC_Z_INDEX,
  },
  shield: {
    flex: 1,
  },
  deadZone: {
    position: 'absolute',
    width: ARC_DEAD_ZONE * 2,
    height: ARC_DEAD_ZONE * 2,
    borderRadius: ARC_DEAD_ZONE,
  },
  deadCaption: {
    position: 'absolute',
    width: ARC_LABEL_BOX,
    height: ARC_LABEL_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deadCaptionText: {
    fontSize: 10,
    lineHeight: ARC_LABEL_LINE,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  puck: {
    position: 'absolute',
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  puckRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 3,
  },
  ctaWell: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    width: 62,
    height: 62,
  },
  fabDisc: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    width: ARC_LABEL_BOX,
    height: ARC_LABEL_LINE,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  labelText: {
    fontSize: 11,
    lineHeight: ARC_LABEL_LINE,
    letterSpacing: 0.17,
  },
  brotSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: ARC_BUBBLE_GAP,
    // El mensajito va a una línea sola (el slot se posiciona por `top`, así
    // que un salto de línea crecería hacia abajo, encima del arco). Este aire
    // es lo que evita que un globo largo llegue al bisel antes de recortar.
    paddingHorizontal: 24,
  },
  bubbleWrap: {
    alignItems: 'center',
  },
  bubble: {
    paddingVertical: ARC_BUBBLE_PAD_V,
    paddingHorizontal: ARC_BUBBLE_PAD_H,
    // Esquinas de chat: tres redondas y una en punta, tomando el lenguaje del
    // brote. La punta abajo-izquierda es la del globo entrante de cualquier
    // app de mensajería, y es lo que hace que se lea como habla sin necesitar
    // una colita — que era, además, la pieza que se desalineaba.
    borderTopLeftRadius: ARC_BUBBLE_RADIUS,
    borderTopRightRadius: ARC_BUBBLE_RADIUS,
    borderBottomRightRadius: ARC_BUBBLE_RADIUS,
    borderBottomLeftRadius: ARC_BUBBLE_RADIUS_TIP,
  },
  // Caja baja, no el eyebrow tracked en mayúsculas del handoff: eso es un
  // rótulo de sección, y lo que hay acá es a Brot hablándote. La misma caja la
  // comparte la instrucción del estado apuntado, para que la línea no cambie
  // de tipografía a mitad del gesto.
  bubbleText: {
    fontSize: 12.5,
    lineHeight: ARC_BUBBLE_LINE,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  // Alto FIJO: Brot se monta y desmonta con el hub, y el eyebrow no puede
  // saltar cuando el canvas todavía no pintó.
  brotHost: {
    height: ARC_BROT_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
})
