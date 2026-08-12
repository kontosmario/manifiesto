// @i18n-ignore-file — kit de rediseño bajo gate; copy literal (tuteo neutro por [OWNER-1]), i18n en el pase posterior
//
// Pantalla LOGROS del rediseño del jardín — réplica de
// `design/jardin-2026-08/Jardín Rediseño.dc.html` (HTML:1079–1215, claro y
// oscuro): header · card resumen · tres secciones (DESBLOQUEADOS / EN PROGRESO
// / SECRETOS) · una fila por logro.
//
// El kit EXPORTA las piezas y el cableado (T11) las llena con el catálogo real:
// `LogrosHeader`, `LogrosResumen`, `LogrosSectionHeader`, `LogroRow` y
// `LogrosFinalScreen` (la pantalla armada, sembrada con los 18 códigos reales
// para el gate del owner).
//
// ─────────────────────────────────────────────────────────────────────
// DE DÓNDE SALE CADA COSA
// ─────────────────────────────────────────────────────────────────────
//
//  · **Nadie decide medallas acá.** La regla status→rama vive en `splitLogros`
//    (`@/features/achievements/achievement-progress`, §5 del plan). Esta
//    pantalla recibe el `MedalVM` ya resuelto y se lo pasa a `<Medal>`.
//
//  · **Cuatro formas de fila**, no tres: al `unlocked` / `inProgress` /
//    `secret` del handoff se le suma el `inProgress` SIN barra. Son 9 de los 18
//    códigos (§4): sólo `streak_*` y `no_spend_cycle_*` tienen una fuente de
//    progreso confiable en el cliente, y una barra que miente es peor que no
//    tener barra. Esa fila se ve como la desbloqueada pero con la medalla en
//    pozo y sin check — el mismo trato que el "por desbloquear" de la galería
//    actual.
//
//  · **La fila secreta NUNCA renderiza `title`/`body`.** El VM los trae (viene
//    del catálogo completo), pero mostrarlos revelaría justo lo que el estado
//    oculta: la fila dibuja el copy tapado y el candado. Es una propiedad del
//    componente, no una responsabilidad del caller.
//
//  · **④3 "próximo ≤ 2" tiembla la MEDALLA, no un "?".** El plan describe el
//    estado como "el '?' tiembla", pero una fila a ≤2 del objetivo siempre
//    tiene barra ⇒ su medalla es la rama `progress`, que muestra el NÚMERO
//    actual; el "?" sólo existe en `locked` y `secret`, que por definición no
//    tienen progreso. El temblor va sobre la medalla entera (el efecto
//    buscado: llevar el ojo a la fila que está por caer).
//
//  · **Fondo y material del sistema** [OWNER-2]: `neoTokens(mode).bg` y
//    `neoMaterial(mode, 'raisedLg')`, no el `#EEEDE9` del handoff. Sólo lo
//    propio del jardín sale de `JARDIN_SPEC`.

import { useEffect, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BrotMascot } from '@/components/brot/brot-mascot'
import { HomeStatusBar } from '@/components/redesign/home/home-screen'
import {
  JARDIN_GEOMETRY,
  JARDIN_SPEC,
  type JardinSpec,
} from '@/components/redesign/jardin/jardin-spec'
import { LockGlyph, Medal } from '@/components/redesign/jardin/parts/medal'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import {
  splitLogros,
  type LogroRowVM as SplitLogroRow,
  type LogroSource,
  type LogroStatus,
  type MedalVM,
  type ProgressSources,
} from '@/features/achievements/achievement-progress'
import { usePressScale } from '@/hooks/use-press-scale'
import { useLoopAnimation } from '@/hooks/use-loop-animation'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations, motionEasings } from '@/lib/motion/tokens'
import { cssGradient, neoMaterial, neoTokens } from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** Radio de las filas y de la card secreta: literal del HTML:1085. No está en
 *  `JARDIN_GEOMETRY.radii` (el plan enumera 28/24/20, no el 22 de la fila). */
const ROW_RADIUS = 22
/** Separación entre filas de una sección (HTML: `gap:11`). */
const ROW_GAP = 11

/** ④3 — período del temblor de la medalla del próximo logro. */
const TREMBLE_PERIOD = 8000
const TREMBLE_STEP = 90
/** ④3 — a cuánto del objetivo empieza a temblar ("próximo ≤ 2 días"). */
const SOON_DISTANCE = 2
/** ④4 — barrido de brillo de la colección completa (una sola pasada). */
const SHINE_MS = 1100

// ─── Copy del kit (tuteo neutro, [OWNER-1]) ──────────────────────────

const HEADER_TITLE = 'Logros'
const HEADER_SUBTITLE = 'Tu jardín, medalla a medalla.'
const SECRET_TITLE = 'Logro secreto'
/** El handoff da dos textos tapados distintos para que las dos filas no se
 *  lean como un error de repetición. En voseo en el mock; acá neutralizados. */
const SECRET_BODIES = [
  'Sigue cultivando para descubrirlo.',
  'Un misterio del jardín te espera.',
] as const

// ─── Contrato del kit (§5 del plan) ──────────────────────────────────

/**
 * Empujón al próximo logro. El kit no pluraliza ni conjuga: la `tail` llega
 * armada ("— 2 días.") porque la unidad depende de la familia del logro y en
 * el cableado sale de i18n.
 */
export interface LogrosNudge {
  title: string
  tail?: string
}

export interface LogrosResumenVM {
  earnedCount: number
  total: number
  /** `null` = sin empujón (colección completa, o nada con fuente de progreso). */
  nudge: LogrosNudge | null
}

export interface LogroRowVM {
  code: string
  title: string
  body: string
  status: LogroStatus
  medal: MedalVM
  /** Ausente = fila SIN barra (9 de los 18 códigos, §4). */
  progress?: { current: number; target: number }
  onPress?: () => void
  /** ④2 — desbloqueado que el usuario todavía no vio: dot naranja + pop. */
  unseen?: boolean
  /** Copy tapado de la fila secreta. Ausente = el primero de `SECRET_BODIES`. */
  secretBody?: string
  /** Título tapado de la fila secreta. Ausente = `SECRET_TITLE`. */
  secretTitle?: string
}

// ─── Piezas compartidas ──────────────────────────────────────────────

/** Los pozos y las cards hundidas se dibujan SÓLO con sombra inset, y Android
 *  < 29 la descarta en silencio: ahí —y sólo ahí— entra el hairline. */
function insetFallback(s: JardinSpec): ViewStyle | null {
  return SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: s.hairline }
}

function BackChevron({ color }: { color: string }) {
  return (
    <Svg
      width={17}
      height={17}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M15 6l-6 6 6 6" />
    </Svg>
  )
}

function CheckGlyph({ color }: { color: string }) {
  return (
    <Svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M5 13l4 4L19 7" />
    </Svg>
  )
}

/** Barra de progreso del handoff: track hundido + fill con gradiente. Las dos
 *  alturas (12 en el resumen, 8 en la fila) sólo cambian el radio del pill. */
function ProgressBar({
  mode,
  pct,
  height,
  resumen = false,
}: {
  mode: ResolvedThemeMode
  pct: number
  height: number
  resumen?: boolean
}) {
  const s = JARDIN_SPEC[mode]
  const clamped = Math.min(Math.max(pct, 0), 1)
  const radius = height / 2 + 1
  return (
    <View
      style={[
        styles.barTrack,
        insetFallback(s),
        {
          height,
          borderRadius: radius,
          backgroundColor: s.progressTrackBackground,
          boxShadow: resumen ? s.progressTrackResumenShadow : s.progressTrackShadow,
        },
      ]}
    >
      <View
        style={[
          styles.barFill,
          cssGradient(s.progressFillCss, s.progressFillFallback),
          { width: `${clamped * 100}%`, borderRadius: radius },
        ]}
      />
    </View>
  )
}

// ─── Header ──────────────────────────────────────────────────────────

export interface LogrosHeaderProps {
  mode: ResolvedThemeMode
  title?: string
  subtitle?: string
  onBack?: () => void
}

export function LogrosHeader({
  mode,
  title = HEADER_TITLE,
  subtitle = HEADER_SUBTITLE,
  onBack,
}: LogrosHeaderProps) {
  const s = JARDIN_SPEC[mode]
  const press = usePressScale()
  const back = (
    <View
      style={[
        styles.backBtn,
        neoMaterial(mode, 'raisedMd'),
        { width: JARDIN_GEOMETRY.backSize, height: JARDIN_GEOMETRY.backSize },
      ]}
    >
      <BackChevron color={s.cardTitleInk} />
    </View>
  )
  return (
    <View style={styles.headerRow}>
      {onBack ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={6}
          onPress={onBack}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={press.animatedStyle}
        >
          {back}
        </AnimatedPressable>
      ) : (
        back
      )}
      <View style={styles.headerTexts}>
        <Text style={[styles.headerTitle, { color: s.cardTitleInk }]}>{title}</Text>
        <Text style={[styles.headerSub, { color: s.cardSubInk }]}>{subtitle}</Text>
      </View>
      {/* `zen` es la quietud de la colección — y el Brot de la medalla del
          no-gasto (D3), así que la pantalla abre con la misma voz. */}
      <BrotMascot pose="zen" size={JARDIN_GEOMETRY.logrosHeaderBrot} shadow={false} />
    </View>
  )
}

// ─── Card resumen ────────────────────────────────────────────────────

/**
 * Copy FIJO de la card resumen. Props con default al literal del handoff: el
 * kit se mira en el preview del gate sin i18n y el cableado live los pasa
 * traducidos (T12). `countText` llega ARMADO porque lleva los dos números y el
 * orden depende del idioma; los dos textos "strong" van en negrita dentro de la
 * misma línea, así que viajan partidos.
 */
export interface LogrosResumenCopy {
  countText: string
  completeLead: string
  completeStrong: string
  emptyText: string
  nudgeLead: string
}

export interface LogrosResumenProps {
  mode: ResolvedThemeMode
  vm: LogrosResumenVM
  copy?: Partial<LogrosResumenCopy>
}

export function LogrosResumen({ mode, vm, copy }: LogrosResumenProps) {
  const s = JARDIN_SPEC[mode]
  const total = Math.max(vm.total, 1)
  const pct = Math.min(Math.max(vm.earnedCount / total, 0), 1)
  const complete = vm.total > 0 && vm.earnedCount >= vm.total
  const reduceMotion = useReducedMotion()

  // ④4 — una sola pasada de brillo cuando ya están todos. El ancho real lo da
  // el layout: sin medirlo la banda no sabe de dónde a dónde barrer.
  const [width, setWidth] = useState(0)
  const shine = useSharedValue(0)
  useEffect(() => {
    if (!complete || reduceMotion || width <= 0) {
      cancelAnimation(shine)
      shine.value = 0
      return
    }
    shine.value = 0
    shine.value = withDelay(
      motionDurations.standard,
      withTiming(1, { duration: SHINE_MS, easing: motionEasings.standard }),
    )
    return () => {
      cancelAnimation(shine)
    }
  }, [complete, reduceMotion, shine, width])

  // La inclinación viaja DENTRO del estilo animado: un `transform` de estilo
  // animado no se fusiona con el del StyleSheet, lo reemplaza entero.
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
    transform: [{ translateX: -width + shine.value * (2 * width) }, { rotate: '18deg' }],
  }))

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width)
  }

  return (
    <View
      style={[styles.resumenCard, neoMaterial(mode, 'raisedLg')]}
      onLayout={onLayout}
    >
      <View style={styles.resumenTop}>
        <Text style={[styles.resumenCount, { color: s.cardTitleInk }]}>
          {copy?.countText ?? `${vm.earnedCount} de ${vm.total} desbloqueados`}
        </Text>
        <Text style={[styles.resumenPct, { color: s.accentInk }]}>
          {Math.round(pct * 100)}%
        </Text>
      </View>
      <View style={styles.resumenBar}>
        <ProgressBar mode={mode} pct={pct} height={JARDIN_GEOMETRY.progressBar.resumen} resumen />
      </View>
      {complete ? (
        <Text style={[styles.resumenNudge, { color: s.cardSubInk }]}>
          {copy?.completeLead ?? 'Los tienes todos.'}{' '}
          <Text style={[styles.resumenNudgeStrong, { color: s.cardTitleInk }]}>
            {copy?.completeStrong ?? 'Colección completa.'}
          </Text>
        </Text>
      ) : vm.earnedCount === 0 ? (
        <Text style={[styles.resumenNudge, { color: s.cardSubInk }]}>
          {copy?.emptyText ?? 'Se desbloquean solos a medida que usas Manifiesto.'}
        </Text>
      ) : vm.nudge ? (
        <Text style={[styles.resumenNudge, { color: s.cardSubInk }]}>
          {copy?.nudgeLead ?? 'Te falta poco para'}{' '}
          <Text style={[styles.resumenNudgeStrong, { color: s.cardTitleInk }]}>
            {vm.nudge.title}
          </Text>
          {vm.nudge.tail ? ` ${vm.nudge.tail}` : '.'}
        </Text>
      ) : null}
      {complete ? (
        // La banda va DENTRO de la card recortada; la card no tiene Brot, así
        // que el clip es seguro (la regla del bleed vale para los pozos con
        // Brot, no para esta superficie).
        <View style={styles.shineClip} pointerEvents="none">
          <Animated.View
            style={[
              styles.shineBand,
              shineStyle,
              { backgroundColor: mode === 'dark' ? 'rgba(164,227,166,0.16)' : 'rgba(255,255,255,0.55)' },
            ]}
          />
        </View>
      ) : null}
    </View>
  )
}

// ─── Section header ──────────────────────────────────────────────────

export interface LogrosSectionHeaderProps {
  mode: ResolvedThemeMode
  label: string
  count: number
}

export function LogrosSectionHeader({ mode, label, count }: LogrosSectionHeaderProps) {
  const s = JARDIN_SPEC[mode]
  return (
    <Text style={[styles.sectionHeader, { color: s.sectionHeaderInk }]}>
      {label} · {count}
    </Text>
  )
}

// ─── Fila ────────────────────────────────────────────────────────────

/** ④3 — temblor corto cada 8s. Cuatro pasos de 90ms + la espera hasta el
 *  período: así el `withRepeat` es UN ciclo completo y no dos animaciones
 *  desincronizadas. Reduced motion lo apaga por el gate de `useLoopAnimation`. */
function useTremble(active: boolean) {
  const shift = useSharedValue(0)
  useLoopAnimation(
    () => {
      if (!active) return
      shift.value = withRepeat(
        withSequence(
          withTiming(1, { duration: TREMBLE_STEP, easing: motionEasings.standard }),
          withTiming(-1, { duration: TREMBLE_STEP, easing: motionEasings.standard }),
          withTiming(1, { duration: TREMBLE_STEP, easing: motionEasings.standard }),
          withTiming(0, { duration: TREMBLE_STEP, easing: motionEasings.standard }),
          // El resto del período es una espera QUIETA (el valor ya está en 0):
          // así el `withRepeat` cierra un ciclo de 8s exactos en vez de dos
          // animaciones que se desfasan.
          withDelay(
            TREMBLE_PERIOD - 5 * TREMBLE_STEP,
            withTiming(0, { duration: TREMBLE_STEP, easing: motionEasings.standard }),
          ),
        ),
        -1,
        false,
      )
    },
    [shift],
    [active],
  )
  return useAnimatedStyle(() => ({ transform: [{ translateX: shift.value * 2 }] }))
}

/** ④2 — el dot del logro sin ver entra con un pop. Sin motion aparece puesto. */
function useUnseenPop(active: boolean) {
  const scale = useSharedValue(1)
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    if (!active || reduceMotion) {
      cancelAnimation(scale)
      scale.value = 1
      return
    }
    scale.value = 0
    scale.value = withDelay(
      motionDurations.quick,
      withTiming(1, { duration: motionDurations.deliberate, easing: motionEasings.standard }),
    )
    return () => {
      cancelAnimation(scale)
    }
  }, [active, reduceMotion, scale])
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
}

export interface LogroRowProps {
  mode: ResolvedThemeMode
  vm: LogroRowVM
  style?: StyleProp<ViewStyle>
}

export function LogroRow({ mode, vm, style }: LogroRowProps) {
  const s = JARDIN_SPEC[mode]
  const neo = neoTokens(mode)
  const press = usePressScale()
  const secret = vm.status === 'secret'
  const soon =
    vm.progress != null && vm.progress.target - vm.progress.current <= SOON_DISTANCE
  const trembleStyle = useTremble(soon && !secret)
  const popStyle = useUnseenPop(vm.unseen === true)

  const surface = secret
    ? [
        { backgroundColor: s.secretCardBackground, boxShadow: s.secretCardShadow },
        insetFallback(s),
      ]
    : [neoMaterial(mode, 'raisedLg')]

  const inner = (
    <View style={[styles.row, ...surface, style]}>
      <Animated.View style={trembleStyle}>
        <Medal vm={vm.medal} size={JARDIN_GEOMETRY.radii.medalRow} mode={mode} />
        {vm.unseen ? (
          <Animated.View
            style={[styles.unseenDot, popStyle, { backgroundColor: neo.warmBright }]}
          />
        ) : null}
      </Animated.View>

      <View style={styles.rowTexts}>
        <Text
          style={[styles.rowTitle, { color: secret ? s.secretTitleInk : s.cardTitleInk }]}
          numberOfLines={1}
        >
          {/* La fila secreta jamás muestra el título real — ver el docblock. */}
          {secret ? (vm.secretTitle ?? SECRET_TITLE) : vm.title}
        </Text>
        {vm.progress && !secret ? (
          <View style={styles.rowBarLine}>
            <View style={styles.rowBarFlex}>
              <ProgressBar
                mode={mode}
                pct={vm.progress.current / Math.max(vm.progress.target, 1)}
                height={JARDIN_GEOMETRY.progressBar.row}
              />
            </View>
            <Text style={[styles.rowBarValue, { color: s.accentInk }]}>
              {vm.progress.current}/{vm.progress.target}
            </Text>
          </View>
        ) : (
          <Text
            style={[styles.rowBody, { color: secret ? s.secretBodyInk : s.cardSubInk }]}
            numberOfLines={2}
          >
            {secret ? (vm.secretBody ?? SECRET_BODIES[0]) : vm.body}
          </Text>
        )}
      </View>

      {secret ? (
        <View style={styles.rowTrailing}>
          <LockGlyph color={s.lockInk} />
        </View>
      ) : vm.status === 'unlocked' ? (
        <View
          style={[
            styles.checkDisc,
            insetFallback(s),
            {
              width: JARDIN_GEOMETRY.checkDisc,
              height: JARDIN_GEOMETRY.checkDisc,
              borderRadius: JARDIN_GEOMETRY.checkDisc / 2,
              boxShadow: s.checkShadow,
            },
            s.checkBackground ? { backgroundColor: s.checkBackground } : null,
          ]}
        >
          <CheckGlyph color={s.checkInk} />
        </View>
      ) : null}
    </View>
  )

  // Los secretos no abren nada: no hay qué contar de un logro tapado.
  if (!vm.onPress || secret) return inner
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={vm.title}
      onPress={vm.onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {inner}
    </AnimatedPressable>
  )
}

// ─── Pantalla armada (preview del gate) ──────────────────────────────

/**
 * Catálogo REAL de los 18 códigos: `code`, `tier` y `sort_order` salen del
 * seed de `achievements_catalog`
 * (`20260528120000_repair_achievements_catalog_rls_seed.sql` +
 * `20260601006000_no_spend_achievements.sql`); el copy, del bundle vigente
 * `mobile/lib/i18n/locales/es/achievements.json`. Se siembra con los códigos
 * verdaderos —y no con los 13 demo del handoff— para que el owner apruebe el
 * mix D3 sobre la colección que la app realmente tiene.
 */
interface DemoLogro extends LogroSource {
  title: string
  body: string
}

const CATALOGO: ReadonlyArray<Omit<DemoLogro, 'earned'>> = [
  {
    code: 'first_expense',
    tier: 'bronze',
    sort_order: 10,
    title: 'El primer brote',
    body: 'No estás simplemente agregando un gasto: estás creando un hábito.',
  },
  {
    code: 'first_fixed',
    tier: 'bronze',
    sort_order: 20,
    title: 'El armazón del mes',
    body: 'Tu primer fijo cargado: ya sabes qué se va sí o sí.',
  },
  {
    code: 'first_paid_fixed',
    tier: 'bronze',
    sort_order: 30,
    title: 'Cuenta saldada',
    body: 'Pagaste tu primer fijo y lo registraste. Cabeza liviana.',
  },
  {
    code: 'first_goal',
    tier: 'bronze',
    sort_order: 40,
    title: 'Le pusiste nombre',
    body: 'Tu primera meta tiene rumbo. Ahorrar para algo cambia todo.',
  },
  {
    code: 'streak_7',
    tier: 'bronze',
    sort_order: 50,
    title: 'Siete al hilo',
    body: 'Una semana sin saltearte uno. El hábito ya asoma.',
  },
  {
    code: 'streak_14',
    tier: 'silver',
    sort_order: 60,
    title: 'Dos semanas en pie',
    body: 'Catorce días firmes. Ya no es esfuerzo, es costumbre.',
  },
  {
    code: 'streak_30',
    tier: 'silver',
    sort_order: 70,
    title: 'Un mes sin fallar',
    body: '30 días seguidos. Esto ya echó raíces.',
  },
  {
    code: 'streak_60',
    tier: 'gold',
    sort_order: 80,
    title: 'Dos meses de raíz',
    body: '60 días. La constancia ya tiene tronco propio.',
  },
  {
    code: 'streak_90',
    tier: 'legendary',
    sort_order: 90,
    title: 'Leyenda viva',
    body: '90 días sin perderte uno. Esto ya eres tú.',
  },
  {
    code: 'goal_25',
    tier: 'bronze',
    sort_order: 96,
    title: 'Primer cuarto',
    body: 'Un cuarto de tu meta, juntado. Arrancar era lo difícil.',
  },
  {
    code: 'goal_50',
    tier: 'silver',
    sort_order: 97,
    title: 'Mitad y subiendo',
    body: 'La mitad ya es tuya. De aquí se ve la cima.',
  },
  {
    code: 'goal_75',
    tier: 'gold',
    sort_order: 98,
    title: 'Casi en la mano',
    body: 'Tres cuartos. La meta dejó de ser idea.',
  },
  {
    code: 'goal_completed',
    tier: 'gold',
    sort_order: 100,
    title: 'Meta florecida',
    body: 'Llegaste entera. Lo que planeaste, se hizo plata.',
  },
  {
    code: 'first_cycle_under_budget',
    tier: 'silver',
    sort_order: 110,
    title: 'Te sobró mes',
    body: 'Cerraste tu primer ciclo gastando menos. Margen real, en tu bolsillo.',
  },
  {
    code: 'no_spend_cycle_3',
    tier: 'bronze',
    sort_order: 220,
    title: 'Tres días en calma',
    body: 'Tres jornadas sin gastar en un ciclo. El freno también se entrena.',
  },
  {
    code: 'no_spend_cycle_7',
    tier: 'silver',
    sort_order: 221,
    title: 'Semana serena',
    body: 'Siete días sin gasto en el ciclo. Ya es un ritmo.',
  },
  {
    code: 'no_spend_cycle_15',
    tier: 'gold',
    sort_order: 222,
    title: 'Medio ciclo zen',
    body: 'Quince días quietos. La mitad del mes, en paz.',
  },
  {
    code: 'no_spend_lifetime_50',
    tier: 'legendary',
    sort_order: 223,
    title: 'Cincuenta sin gastar',
    body: '50 días sin gasto desde que arrancaste. Veterana del freno.',
  },
]

/**
 * Los 7 desbloqueados demo. La historia es coherente a propósito —un hogar que
 * arrancó, cargó su primer fijo, definió una meta y la completó— porque así
 * caen DOS medallas de Brot (`first_expense` → `seed`, `goal_completed` →
 * `cheer`) junto a cinco íconos: el mix D3 se juzga viéndolo.
 * Las otras dos poses de Brot (`streak_90`, `no_spend_lifetime_50`) son
 * justamente los dos legendary, o sea los dos SECRETOS: mostrarlas acá dejaría
 * la sección de secretos vacía.
 */
const EARNED_DEMO = [
  'first_expense',
  'first_fixed',
  'first_goal',
  'goal_25',
  'goal_50',
  'goal_75',
  'goal_completed',
] as const

/** Racha 5 y 2 días en calma del ciclo: `streak_7` queda 5/7 (a 2 del
 *  objetivo ⇒ es el nudge y ya muestra ④3) y ningún logro sale otorgado
 *  "de mentira" (con racha 7 el server ya habría dado `streak_7`). */
const SOURCES_DEMO: ProgressSources = { currentStreak: 5, cycleNoSpendCount: 2 }

export type LogrosSeedKey =
  | 'logros-18'
  | 'logros-nuevo-sin-ver'
  | 'logros-proximo'
  | 'logros-completo'
  | 'logros-usuario-nuevo'

interface LogrosSeed {
  earned: ReadonlyArray<string>
  sources: ProgressSources
  /** ④2 — el desbloqueado que el usuario todavía no vio. */
  unseenCode?: string
}

const SEEDS: Record<LogrosSeedKey, LogrosSeed> = {
  'logros-18': { earned: EARNED_DEMO, sources: SOURCES_DEMO },
  'logros-nuevo-sin-ver': {
    earned: EARNED_DEMO,
    sources: SOURCES_DEMO,
    unseenCode: 'goal_completed',
  },
  // A UNO del objetivo: el temblor de ④3 se ve sin esperar.
  'logros-proximo': { earned: EARNED_DEMO, sources: { currentStreak: 6, cycleNoSpendCount: 2 } },
  'logros-completo': {
    earned: CATALOGO.map((c) => c.code),
    sources: { currentStreak: 90, cycleNoSpendCount: 15 },
  },
  'logros-usuario-nuevo': { earned: [], sources: { currentStreak: 0, cycleNoSpendCount: 0 } },
}

/** Cola del nudge por familia de logro. El kit la arma literal (el cableado la
 *  reemplaza por i18n): la unidad no es la misma para una racha que para los
 *  días en calma del ciclo. */
function nudgeTail(code: string, falta: number): string {
  if (code.startsWith('no_spend_')) {
    return falta === 1 ? '— falta 1 día en calma.' : `— faltan ${falta} días en calma.`
  }
  return falta === 1 ? '— 1 día.' : `— ${falta} días.`
}

function toRowVM(row: SplitLogroRow<DemoLogro>, secretIndex: number, unseenCode?: string): LogroRowVM {
  const vm: LogroRowVM = {
    code: row.code,
    title: row.title,
    body: row.body,
    status: row.status,
    medal: row.medal,
  }
  if (row.progress) vm.progress = row.progress
  if (row.status === 'secret') {
    vm.secretBody = SECRET_BODIES[secretIndex % SECRET_BODIES.length]
  }
  if (unseenCode && row.code === unseenCode) vm.unseen = true
  return vm
}

export interface LogrosFinalScreenProps {
  mode: ResolvedThemeMode
  /** Seed de la matriz ④ del Apéndice A. Default: la colección normal. */
  initialSeed?: LogrosSeedKey
  onBack?: () => void
}

export function LogrosFinalScreen({
  mode,
  initialSeed = 'logros-18',
  onBack,
}: LogrosFinalScreenProps) {
  const neo = neoTokens(mode)
  const s = JARDIN_SPEC[mode]
  const seed = SEEDS[initialSeed]
  const earnedSet = new Set<string>(seed.earned)
  const split = splitLogros<DemoLogro>(
    CATALOGO.map((c) => ({ ...c, earned: earnedSet.has(c.code) })),
    seed.sources,
  )

  const unlocked = split.unlocked.map((r) => toRowVM(r, 0, seed.unseenCode))
  const inProgress = split.inProgress.map((r) => toRowVM(r, 0, seed.unseenCode))
  const secret = split.secret.map((r, i) => toRowVM(r, i, seed.unseenCode))

  const nudgeRow = split.nudgeCode
    ? split.inProgress.find((r) => r.code === split.nudgeCode)
    : undefined
  const resumen: LogrosResumenVM = {
    earnedCount: unlocked.length,
    total: CATALOGO.length,
    nudge: nudgeRow
      ? {
          title: nudgeRow.title,
          ...(nudgeRow.progress
            ? {
                tail: nudgeTail(
                  nudgeRow.code,
                  Math.max(nudgeRow.progress.target - nudgeRow.progress.current, 1),
                ),
              }
            : {}),
        }
      : null,
  }

  return (
    <View style={[styles.shell, { backgroundColor: neo.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <HomeStatusBar mode={mode} />
        <View style={styles.content}>
          <LogrosHeader mode={mode} onBack={onBack} />
          <LogrosResumen mode={mode} vm={resumen} />

          {unlocked.length > 0 ? (
            <>
              <LogrosSectionHeader mode={mode} label="DESBLOQUEADOS" count={unlocked.length} />
              <View style={styles.section}>
                {unlocked.map((vm) => (
                  <LogroRow key={vm.code} mode={mode} vm={vm} />
                ))}
              </View>
            </>
          ) : null}

          {inProgress.length > 0 ? (
            <>
              <LogrosSectionHeader mode={mode} label="EN PROGRESO" count={inProgress.length} />
              <View style={styles.section}>
                {inProgress.map((vm) => (
                  <LogroRow key={vm.code} mode={mode} vm={vm} />
                ))}
              </View>
            </>
          ) : null}

          {secret.length > 0 ? (
            <>
              <LogrosSectionHeader mode={mode} label="SECRETOS" count={secret.length} />
              <View style={styles.section}>
                {secret.map((vm) => (
                  <LogroRow key={vm.code} mode={mode} vm={vm} />
                ))}
              </View>
            </>
          ) : null}
        </View>
        <View
          style={[
            styles.homeIndicator,
            { backgroundColor: s.cardTitleInk, opacity: mode === 'dark' ? 0.7 : 0.75 },
          ]}
        />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 22 },

  // header
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  backBtn: { borderRadius: JARDIN_GEOMETRY.backSize / 2, alignItems: 'center', justifyContent: 'center' },
  headerTexts: { flex: 1, minWidth: 0 },
  // El mockup pone `line-height:1.05`; en iOS la baseline de Nunito 900 cae a
  // `lineHeight − descent` y con 1.05 una mayúscula acentuada se recorta
  // (mismo motivo documentado en el kit de Home para el nombre de 28px).
  headerTitle: { fontSize: 30, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 30 * 1.15 },
  headerSub: { fontSize: 12.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 2 },

  // resumen
  resumenCard: {
    marginTop: 16,
    borderRadius: JARDIN_GEOMETRY.radii.card,
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 15,
    overflow: 'hidden',
  },
  resumenTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  resumenCount: { flexShrink: 1, fontSize: 15, fontWeight: '900', fontFamily: nunitoFamily('900') },
  resumenPct: { fontSize: 12, fontWeight: '900', fontFamily: nunitoFamily('900') },
  resumenBar: { marginTop: 12 },
  resumenNudge: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 10, lineHeight: 16 },
  resumenNudgeStrong: { fontWeight: '900', fontFamily: nunitoFamily('900') },
  shineClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  shineBand: { position: 'absolute', top: -20, bottom: -20, width: 46 },

  // barras
  barTrack: { width: '100%', overflow: 'hidden' },
  barFill: { height: '100%' },

  // section header
  sectionHeader: {
    fontSize: 10.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 0.14 * 10.5,
    marginTop: 18,
    marginHorizontal: 4,
    marginBottom: 3,
  },

  // filas
  section: { gap: ROW_GAP },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: ROW_RADIUS,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowTexts: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  rowBody: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 1, lineHeight: 15 },
  rowBarLine: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 7 },
  rowBarFlex: { flex: 1, minWidth: 0 },
  rowBarValue: { flexShrink: 0, fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900') },
  rowTrailing: { flexShrink: 0 },
  checkDisc: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  // Dot del logro sin ver: pisa el borde del disco, como un badge.
  unseenDot: { position: 'absolute', top: -1, right: -1, width: 10, height: 10, borderRadius: 5 },

  homeIndicator: { width: 132, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 4, marginBottom: 10 },
})
