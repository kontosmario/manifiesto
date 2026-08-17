// @i18n-ignore-file — kit de rediseño bajo gate; copy literal, i18n en el pase F3.5.
import { Fragment, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { AnimatedText, Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Line, Path } from 'react-native-svg'
import { CountUpText } from '@/components/home/animated/count-up-text'
import {
  heroBalanceRampScale,
  heroBalanceRampT,
} from '@/features/home/hero-balance-ramp'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { BrotParticles } from '@/components/brot/brot-particles'
import { GoalIcon } from '@/components/savings-goals/goal-icon'
import { NeoTabIcon } from '@/components/navigation/neo-tab-icons'
import {
  HOME_MOMENTS,
  HOME_SPEC,
  type HomeMode,
  type HomeMoment,
  type HomeSpec,
} from '@/components/redesign/home/home-spec'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { neoParticlePresets } from '@/theme/neo-tokens'
import { decorativeDurations, motionDurations, motionEasings } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'

// Press-feedback (spring `motionSprings.press`, reduced-motion-aware) sobre
// los Pressables del kit: mismo patrón que el auth-kit (usePressScale +
// AnimatedPressable a nivel módulo). En reposo (scale 1) el visual queda
// IDÉNTICO al aprobado — el press solo agrega el hundido al presionar.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * HOME FINAL del rediseño — réplica pixel-perfect de
 * design/home-final-2026-07/home.dc.html (claro + oscuro). Bajo gate de
 * aprobación (redesign-approval-status: 'home-final'). Chrome dibujado
 * (status bar / home indicator) como el mockup; al cablear se cambia por
 * insets reales (B2).
 *
 * FASE 1 del cableado: el kit acepta datos reales vía props OPCIONALES y
 * cubre el catálogo de estados de estados.dc.html (§§1-14). REGLA DE ORO:
 * el render por defecto (sin props) es VISUALMENTE IDÉNTICO al aprobado —
 * los datos demo del mockup son los defaults; toda variante nueva entra
 * por props explícitos. Callbacks: los botones se envuelven en Pressable
 * SOLO si hay callback (patrón NotifHeader).
 *
 * Jerarquía (README del handoff): ⓿ header · ① saldo (hero con pozo
 * hundido + medidor de cupo en arco) · ② resumen del ciclo · ③ meta ·
 * ④ racha (Brot reactivo) · ⑤ actividad · nav con FAB N1 (oscuro
 * INVERTIDO a crema). El saludo/pose de Brot cambian por horario
 * (HOME_MOMENTS); el mockup principal muestra tarde + `wave`.
 */

// ─── Íconos del header (transcritos del markup) ──────────────────────

function SparkleIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1z" />
    </Svg>
  )
}

function BellIcon({ color }: { color: string }) {
  // Campana VIEJA (home-header.tsx): cuerpo + badajo — la del rediseño
  // quedaba incompleta (sin badajo). Pedido owner 2026-07-21.
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 16v-5a6 6 0 10-12 0v5l-2 2h16l-2-2z" />
      <Path d="M10 20a2 2 0 004 0" />
    </Svg>
  )
}

function SlidersIcon({ color }: { color: string }) {
  // Ícono de ajustes de la vista VIEJA (home-header.tsx): líneas de largo
  // variable con knobs (rings sin relleno) al final de cada una. Pedido
  // owner 2026-07-21 (el sliders full-width del rediseño no gustó).
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Path d="M4 6h10M4 12h6M4 18h14" />
      <Circle cx={17} cy={6} r={2} fill="none" />
      <Circle cx={13} cy={12} r={2} fill="none" />
      <Circle cx={19} cy={18} r={2} fill="none" />
    </Svg>
  )
}

function ChevronRight({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  )
}

// ─── Chrome del mockup ───────────────────────────────────────────────

export function HomeStatusBar({ mode }: { mode: HomeMode }) {
  const s = HOME_SPEC[mode]
  return (
    <View style={styles.statusBar}>
      <Text style={[styles.statusTime, { color: s.statusInk }]}>9:41</Text>
      <View style={styles.statusRight}>
        <View style={styles.signalRow}>
          <View style={[styles.signalBar, { height: 4, backgroundColor: s.statusInk }]} />
          <View style={[styles.signalBar, { height: 6, backgroundColor: s.statusInk }]} />
          <View style={[styles.signalBar, { height: 8, backgroundColor: s.statusInk }]} />
          <View style={[styles.signalBar, { height: 10, backgroundColor: s.statusInk, opacity: 0.35 }]} />
        </View>
        <View style={styles.batteryGroup}>
          <View style={[styles.battery, { borderColor: s.statusInk }]}>
            <View style={[styles.batteryFill, { backgroundColor: s.statusInk }]} />
          </View>
          <View style={[styles.batteryNub, { backgroundColor: s.statusInk }]} />
        </View>
      </View>
    </View>
  )
}

// ─── CTAs compartidas del catálogo (crema / pill / radial) ───────────

function CtaPill({
  label,
  ink,
  gradientCss,
  shadow,
  widePad,
  onPress,
  /** Hundido del press (feedback marcado, CTA chico). */
  pressedScale = 0.94,
}: {
  label: string
  ink: string
  gradientCss: string
  shadow: string
  /** "Crear" raise usa padding 9/15 (catálogo §7); el resto 9/14. */
  widePad?: boolean
  onPress?: () => void
  pressedScale?: number
}) {
  const press = usePressScale({ pressedScale })
  const inner = (
    <View style={[styles.ctaPill, widePad ? styles.ctaPillWidePad : null, { experimental_backgroundImage: gradientCss, boxShadow: shadow }]}>
      <Text style={[styles.ctaPillText, { color: ink }]}>{label}</Text>
    </View>
  )
  if (!onPress) return inner
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {inner}
    </AnimatedPressable>
  )
}

// ─── ⓿ Header · BR-A ────────────────────────────────────────────────

/** Saludo resuelto (emoji null = sin emoji, p. ej. "¡bienvenido!" §13). */
export interface HomeGreeting {
  emoji: string | null
  label: string
  pose: BrotPose
}

const MOCKUP_GREETING: HomeGreeting = { emoji: '🌤️', label: 'buenas tardes,', pose: 'wave' }
const WELCOME_GREETING: HomeGreeting = { emoji: null, label: '¡bienvenido!', pose: 'wave' }

export interface HomeHeaderProps {
  mode: HomeMode
  /** Ausente = combo literal del mockup principal (tarde + `wave`). */
  moment?: HomeMoment
  /** Override explícito del saludo (gana sobre `moment`). */
  greeting?: HomeGreeting
  name?: string
  /** "¡bienvenido!" sin emoji + pose `wave` (catálogo §13, usuario nuevo). */
  welcome?: boolean
  /** Texto del saludo de bienvenida (default = literal del mockup; la neo
   *  lo pasa con t('home:header.welcome')). Solo se usa con `welcome`. */
  welcomeLabel?: string
  /** Badge de la campana — OCULTO en 0 (catálogo §12). */
  unreadCount?: number
  /** Badge numérico del asistente, clonado del de campana y oculto en 0
   *  (decisión owner, gap G8). */
  assistantPendingCount?: number
  /** Dot 8×8 naranja top-right del botón sliders (gap G7). */
  settingsNudge?: boolean
  onPressAssistant?: () => void
  onPressBell?: () => void
  onPressSettings?: () => void
}

function HeaderIconButton({ s, children }: { s: HomeSpec; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.iconBtn,
        { backgroundColor: s.iconBtnBackground, boxShadow: s.iconBtnShadow },
        s.iconBtnGradientCss ? { experimental_backgroundImage: s.iconBtnGradientCss } : null,
      ]}
    >
      {children}
    </View>
  )
}

function HeaderButton({
  s,
  label,
  onPress,
  badgeCount = 0,
  /** Tope del contador (paridad con la home vieja: campana 99 → "99+",
   *  asistente 9 → "9+"). Sin tope no formatea. */
  badgeMax,
  nudge = false,
  children,
}: {
  s: HomeSpec
  label: string
  onPress?: () => void
  badgeCount?: number
  badgeMax?: number
  nudge?: boolean
  children: React.ReactNode
}) {
  // Botón circular chico → hundido marcado (0.90), como el back del auth-kit.
  const press = usePressScale({ pressedScale: 0.9 })
  const badgeText = badgeMax != null && badgeCount > badgeMax ? `${badgeMax}+` : String(badgeCount)
  const core = <HeaderIconButton s={s}>{children}</HeaderIconButton>
  const decorated =
    badgeCount > 0 || nudge ? (
      <View>
        {core}
        {badgeCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: s.badgeBackground }]}>
            <Text style={[styles.badgeText, { color: s.badgeInk }]}>{badgeText}</Text>
          </View>
        ) : null}
        {nudge ? <View style={[styles.headerNudgeDot, { backgroundColor: s.sueldoDotAttention }]} /> : null}
      </View>
    ) : (
      core
    )
  if (!onPress) return decorated
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {decorated}
    </AnimatedPressable>
  )
}

export function HomeHeader({
  mode,
  moment,
  greeting,
  name = 'Mario',
  welcome = false,
  welcomeLabel = '¡bienvenido!',
  unreadCount = 4,
  assistantPendingCount = 0,
  settingsNudge = false,
  onPressAssistant,
  onPressBell,
  onPressSettings,
}: HomeHeaderProps) {
  const s = HOME_SPEC[mode]
  const m: HomeGreeting = welcome
    ? { ...WELCOME_GREETING, label: welcomeLabel }
    : (greeting ??
      (moment
        ? { emoji: HOME_MOMENTS[moment].emoji, label: HOME_MOMENTS[moment].greeting, pose: HOME_MOMENTS[moment].pose }
        : MOCKUP_GREETING))
  return (
    <View style={styles.headerRow}>
      {/* Brot removido del header (pedido del owner 2026-07-21): solo el
          saludo; el Brot de la tarjeta de rachas es suficiente. */}
      <View style={styles.greetGroup}>
        <View style={styles.greetTexts}>
          <View style={styles.greetLine}>
            {m.emoji ? <Text style={styles.greetEmoji}>{m.emoji}</Text> : null}
            <Text style={[styles.greetLabel, welcome ? styles.greetLabelWelcome : null, { color: s.greetLabel }]}>
              {m.label}
            </Text>
          </View>
          <Text
            style={[styles.greetName, welcome ? styles.greetNameWelcome : null, { color: s.greetName }]}
            // 2da guardia sobre el nombre acotado del cableado: una línea +
            // auto-shrink, nunca rompe ni empuja los botones del header.
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {name}
          </Text>
        </View>
      </View>
      <View style={styles.headerBtns}>
        <HeaderButton s={s} label="Asistente" onPress={onPressAssistant} badgeCount={assistantPendingCount} badgeMax={9}>
          <SparkleIcon color={s.iconSparkle} />
        </HeaderButton>
        <HeaderButton s={s} label="Notificaciones" onPress={onPressBell} badgeCount={unreadCount} badgeMax={99}>
          <BellIcon color={s.iconInk} />
        </HeaderButton>
        <HeaderButton s={s} label="Ajustes" onPress={onPressSettings} nudge={settingsNudge}>
          <SlidersIcon color={s.iconInk} />
        </HeaderButton>
      </View>
    </View>
  )
}

// ─── Chips miembros + sueldo ─────────────────────────────────────────

export interface HomeMembersChipVM {
  /** 1-2 nodos de avatar YA construidos (AvatarAnimal/Avatar reales, o
   *  emoji de muestra). El kit los envuelve en el círculo 26px con ring
   *  de separación; slice(0,2) acota al par visible del stack. */
  avatars: ReactNode[]
  /** null = chip sin conteo (cuenta solitaria: el label ya se basta solo,
   *  "Miembros · 1" no dice nada). */
  count: number | null
}

export interface HomePaydayChipVM {
  /** daysUntil = "Sueldo en N días" (dot verde) · paidToday = "Cobrado
   *  hoy ✓" (dot verde) · configure = "Configurá tu sueldo ›" (dot
   *  naranja, catálogo §11) · pending = "¿Ya cobraste?" (dot naranja de
   *  atención — cobró pero falta confirmar) · confirmBalance = "Confirma
   *  tu saldo ›" (dot naranja + ripple: el ciclo todavía no arrancó con un
   *  saldo inicial confirmado). */
  kind: 'daysUntil' | 'paidToday' | 'configure' | 'pending' | 'confirmBalance'
  days?: number
  /** Label resuelto (default = literal del mockup; la neo lo pasa con t()). */
  label?: string
  /** Label hablado cuando el visible es telegráfico (chevron/pregunta).
   *  Ausente = se lee el label visible. */
  a11yLabel?: string
}

export interface HomeChipsRowProps {
  mode: HomeMode
  /** null = chip oculto (solo-mode, gap G9). */
  members?: HomeMembersChipVM | null
  /** null = chip oculto (income dinámico). */
  payday?: HomePaydayChipVM | null
  /** Prefijo del chip de miembros (default = literal del mockup; la neo lo
   *  pasa con t('home:familyStrip.membersLabel')). Se renderiza "{label} N";
   *  con `count: null` se renderiza solo, así que ahí el caller tiene que
   *  pasar un label que se baste (sin el separador del prefijo). */
  membersLabel?: string
  /** Ausente = el chip de miembros se rinde inerte (preview del kit). Presente
   *  = mismo tratamiento accionable que el chip de sueldo. */
  onPressMembers?: () => void
  /** Label hablado del chip de miembros — el visible ("Miembros · 3") describe
   *  el estado, no el destino. */
  membersA11yLabel?: string
  onPressPayday?: () => void
}

// Nodos emoji de muestra (inline: `styles` aún no existe a este nivel de
// módulo — TDZ). El default del kit sigue mostrando el par del mockup.
const MOCKUP_MEMBERS: HomeMembersChipVM = {
  avatars: [
    <Text key="a" style={{ fontSize: 13 }}>🐿️</Text>,
    <Text key="b" style={{ fontSize: 13 }}>🦋</Text>,
  ],
  count: 2,
}
const MOCKUP_PAYDAY: HomePaydayChipVM = { kind: 'daysUntil', days: 13 }

function paydayLabel(payday: HomePaydayChipVM): string {
  // Live: la neo pasa `label` con t(); ausente = literal del mockup (preview).
  if (payday.label != null) return payday.label
  if (payday.kind === 'paidToday') return 'Cobrado hoy ✓'
  if (payday.kind === 'configure') return 'Configurá tu sueldo ›'
  if (payday.kind === 'pending') return '¿Ya cobraste?'
  if (payday.kind === 'confirmBalance') return 'Confirma tu saldo ›'
  return `Sueldo en ${payday.days ?? 13} días`
}

/** Kinds que piden una acción AHORA: dot naranja + anillo que irradia. */
function isPaydayCallToAction(kind: HomePaydayChipVM['kind'] | undefined): boolean {
  return kind === 'pending' || kind === 'confirmBalance'
}

export function HomeChipsRow({
  mode,
  members = MOCKUP_MEMBERS,
  payday = MOCKUP_PAYDAY,
  membersLabel = 'Miembros ·',
  membersA11yLabel,
  onPressMembers,
  onPressPayday,
}: HomeChipsRowProps) {
  const s = HOME_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.96 })
  const membersPress = usePressScale({ pressedScale: 0.96 })
  // Ripple de atención de los chips accionables ("¿Ya cobraste?" / "Confirma
  // tu saldo ›") — indica una acción a tocar (pedido owner: el pulse/breath no
  // gustó). Un anillo peach que irradia hacia afuera (scale 1→1.22 + fade),
  // detrás del chip, en loop. Parkeado invisible (ripple=0) en el resto de los
  // kinds o con reduced-motion, así el visual en reposo queda idéntico.
  const reduceMotion = useReducedMotion()
  const kind = payday?.kind
  const ripple = useSharedValue(0)
  useEffect(() => {
    if (!isPaydayCallToAction(kind) || reduceMotion) {
      cancelAnimation(ripple)
      ripple.value = 0
      return
    }
    ripple.value = withRepeat(
      withTiming(1, { duration: decorativeDurations.pulse, easing: motionEasings.warm }),
      -1,
      false,
    )
    return () => cancelAnimation(ripple)
  }, [kind, reduceMotion, ripple])
  // Anillo: irradia (scale) mientras se desvanece (opacity). transform siempre
  // array presente.
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: (1 - ripple.value) * 0.5,
    transform: [{ scale: 1 + ripple.value * 0.22 }],
  }))
  // Ambos chips ocultos → la fila colapsa (no ocupa espacio).
  if (!members && !payday) return null
  // Layout (catálogo): caso feliz (ambos chips) = space-between del mockup
  // principal. Solo sueldo (members null, p. ej. miembros aún sin cargar) →
  // chip a la DERECHA. Usuario nuevo (miembros + "Configurá tu sueldo ›",
  // estados.dc.html:52-58) → los dos chips ADYACENTES gap 10 a la izquierda.
  const soloSueldo = !members && Boolean(payday)
  const newUserAdjacent = Boolean(members) && payday?.kind === 'configure'
  const membersChip = members ? (
    <View
      style={[
        styles.membersChip,
        { backgroundColor: s.membersBackground, boxShadow: s.membersShadow },
        s.membersGradientCss ? { experimental_backgroundImage: s.membersGradientCss } : null,
      ]}
    >
      <View style={styles.avatarStack}>
        {members.avatars.slice(0, 2).map((node, i) => (
          // El círculo ya NO pinta un bg sólido (AvatarAnimal trae el
          // suyo); es solo el contenedor 26px + ring de separación del
          // color del chip (membersBackground) para el overlap.
          <View
            key={i}
            style={[styles.avatarCircle, i > 0 ? styles.avatarOverlap : null, { borderColor: s.membersBackground }]}
          >
            {node}
          </View>
        ))}
      </View>
      <Text style={[styles.membersLabel, { color: s.membersInk }]} numberOfLines={1}>
        {members.count == null ? membersLabel : `${membersLabel} ${members.count}`}
      </Text>
    </View>
  ) : null
  const sueldoChip = payday ? (
    <View style={[styles.sueldoChip, { backgroundColor: s.sueldoBackground, boxShadow: s.sueldoShadow }]}>
      <View
        style={[
          styles.sueldoDot,
          {
            backgroundColor:
              payday.kind === 'configure' || isPaydayCallToAction(payday.kind)
                ? s.sueldoDotAttention
                : s.sueldoDot,
          },
        ]}
      />
      <Text style={[styles.sueldoLabel, { color: s.sueldoInk }]}>{paydayLabel(payday)}</Text>
    </View>
  ) : null
  return (
    <View
      style={[
        styles.chipRow,
        soloSueldo ? styles.chipRowSoloSueldo : null,
        newUserAdjacent ? styles.chipRowAdjacent : null,
      ]}
    >
      {membersChip ? (
        onPressMembers ? (
          // Mismo tratamiento que el chip de sueldo: AnimatedPressable +
          // usePressScale + hitSlop. El chip mide 40pt de alto (26 del avatar
          // + 7×2 de padding), así que el hitSlop de 4 lo lleva a 48 — por
          // encima del piso de 44.
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={membersA11yLabel ?? membersLabel}
            hitSlop={4}
            onPress={onPressMembers}
            onPressIn={membersPress.onPressIn}
            onPressOut={membersPress.onPressOut}
            style={[styles.membersPressable, membersPress.animatedStyle]}
          >
            {membersChip}
          </AnimatedPressable>
        ) : (
          membersChip
        )
      ) : null}
      {payday && sueldoChip ? (
        <View style={styles.sueldoChipWrap}>
          {/* Anillo peach que irradia detrás del chip (kind pending). */}
          <Animated.View
            pointerEvents="none"
            style={[styles.sueldoRipple, rippleStyle]}
          />
          {onPressPayday ? (
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={payday.a11yLabel ?? paydayLabel(payday)}
              hitSlop={4}
              onPress={onPressPayday}
              onPressIn={press.onPressIn}
              onPressOut={press.onPressOut}
              style={press.animatedStyle}
            >
              {sueldoChip}
            </AnimatedPressable>
          ) : (
            sueldoChip
          )}
        </View>
      ) : null}
    </View>
  )
}

// ─── ① Hero saldo (pozo hundido + medidor de cupo) ───────────────────

export type HomeHeroVariant = 'steady' | 'adjusted' | 'empty' | 'over'

/**
 * Paleta del hero cuando el saldo del ciclo es NEGATIVO ("te pasaste").
 *
 * Es el port de la variante `corto` del hero de Control
 * (`control/parts/control-hero.tsx`): misma familia terracota, para que las
 * dos pantallas digan lo mismo con el mismo color. Igual en ambos temas — el
 * hero es una superficie oscura propia, como ya pasa con el forest y con las
 * paletas de Control (que tampoco se tematizan).
 *
 * NO incluye Brot: el hero del Home no tiene muñeco (decisión del rediseño),
 * solo el campo de partículas — que sí se tiñe.
 */
/**
 * Stops de la RAMPA de la tinta del monto — el color sigue al valor EN
 * VUELO del contador (pedido del owner 2026-08-13). El ancla holgada (t=0)
 * la pone la variante vía `restInkRef`; estos dos son los otros extremos.
 */
/** t = 0.5, el saldo justo en CERO. Es el MISMO durazno que ya usa la
 *  variante `adjusted` (`balanceAdjustedInk`, home-spec:279/:433) → no entra
 *  ningún color nuevo al sistema. */
const HERO_BALANCE_EDGE_INK = '#FBD9BC'

const HERO_OVER_PALETTE = {
  heroGradientCss: 'linear-gradient(155deg, #7A3A24 0%, #A6503A 52%, #C26B45 100%)',
  heroDot: '#F6C6AE',
  heroLabel: 'rgba(255,237,224,0.85)',
  dayPillBackground: '#F6C6AE',
  dayPillInk: '#5A2312',
  wellBackground: 'rgba(58,20,10,0.36)',
  balanceInk: '#FFEDE0',
  usdInk: 'rgba(255,237,224,0.72)',
  // Sombras inset SIN el rim verde: las forest terminan en un highlight
  // rgba(130,190,130,…) que sobre terracota delataba la paleta equivocada.
  // El pozo usa el WELL_INSET exacto de la variante `corto` de Control
  // (control-hero.tsx); el chip, su valor forest menos el rim.
  wellShadow: 'inset 6px 6px 14px rgba(6,20,10,0.5)',
  eventChipShadow: 'inset 3px 3px 7px rgba(6,20,10,0.45)',
} as const

/** t = 1, el extremo PASADO de la rampa. El dot terracota de la paleta
 *  `over`: sobre el pozo del hero tiene más presencia que su `balanceInk`
 *  (#FFEDE0, casi blanco), que es la tinta pensada para la rama SIN conteo.
 *  Esa sigue intacta para el mockup/preview. */
const HERO_BALANCE_OVER_INK = HERO_OVER_PALETTE.heroDot

/**
 * Fallback SÓLIDO del hero, bajo el gradiente. Es el primer stop de cada
 * gradiente, el mismo criterio que `gradientFallback` en control-spec.
 *
 * `styles.hero` no traía `backgroundColor`, así que donde el gradiente no
 * rinde (preview web; y en Android viejo el mismo `experimental_backgroundImage`
 * es frágil) la tarjeta quedaba TRANSPARENTE. Para el forest eso pasaba
 * desapercibido; para el estado `over` sería fatal — el rojo es justamente la
 * señal, y sin fallback el hogar pasado de plan se vería idéntico a uno sano.
 * Con el gradiente rindiendo, este color es invisible: cero cambio en device.
 */
const HERO_GRADIENT_FALLBACK: Record<HomeHeroVariant, string> = {
  steady: '#244235',
  adjusted: '#244235',
  empty: '#244235',
  over: '#7A3A24',
}

/** Tinta de la sub-línea "Te pasaste del plan" dentro del pozo. */
const HERO_OVER_SUB_INK = 'rgba(255,237,224,0.82)'

/** Partículas del hero en estado `over` — la terna de `corto` de Control. */
const HERO_OVER_PARTICLES = ['#FBD9BC', '#F2C0A0', '#FFE9D6'] as const

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name']

export interface HomeEventChipVM {
  tone: 'green' | 'neutral'
  label: string
  /** Glifo Material a la izquierda del label. El chip rota entre cuatro
   *  significados (sobrante / sumaste / ajustado / ahorrando), así que el
   *  ícono viaja con el dato — lo elige `selectHeroEventChip`. */
  icon?: MaterialIconName
}

export interface HomeGaugeVM {
  /** Monto del cupo diario (pastilla "CUPO HOY"), p. ej. "$179k". */
  cupoAmount: string
  /** Gasto promedio del segmento GASTADO, p. ej. "$52k". */
  spentLabel: string
  /** Cupo restante del segmento DISPONIBLE, p. ej. "$127k". */
  availableLabel: string
  /** 0..1 → ancho del segmento GASTADO (el resto es DISPONIBLE, flex:1). */
  spentRatio: number
  /** over pinta el segmento GASTADO en terracota (#D97355); ok/limit quedan
   *  durazno. Ausente = ok. */
  status?: 'ok' | 'limit' | 'over'
}

export interface HomeHeroProps {
  mode: HomeMode
  /** adjusted = saldo + chip de evento en durazno (§3) · empty = usuario
   *  nuevo sin ingresos (§14: sin chips ni medidor, fila Brot + CTA) ·
   *  over = saldo del ciclo NEGATIVO, hero terracota (paleta `corto` de
   *  Control) con el monto en menos. */
  variant?: HomeHeroVariant
  /** Sub-línea del pozo en la variante `over` ("Te pasaste del plan"). Sin
   *  ella el monto negativo queda sin explicación. */
  overSub?: string
  /** Copy de la fila Brot que reemplaza al medidor en `over` ("El cupo se
   *  reinicia con tu próximo ciclo"). Suma el dato que el pozo no da —
   *  CUÁNDO vuelve el cupo — en vez de repetir el "te pasaste". */
  overCupoHint?: string
  /** Eyebrow del pozo (default = literal del mockup; la neo pasa t()). */
  balanceLabel?: string
  balance?: string
  /** Conteo FLUIDO del saldo (misma animación que la home vigente:
   *  CountUpText flourish). Si se pasa, el número trepa al asentar en vez de
   *  ser estático; la neo pasa hero.availableToday + formatBalance. El
   *  `balance` string queda de fallback (preview/mockup). */
  balanceValue?: number
  formatBalance?: (n: number) => string
  /** Escala de la GRADACIÓN de la tinta del monto: la distancia (en pesos)
   *  entre "holgado" y "al borde". La neo pasa el CUPO DIARIO — leída en
   *  cupos la señal es auditable ("te queda menos de un día"). Sin ella la
   *  tinta gradúa igual, con el piso de `heroBalanceRampScale`. */
  balanceScale?: number
  /** Gate del PRIMER conteo del saldo. `false` = el monto se queda en $0
   *  sin animar. La neo lo abre cuando el splash se fue Y el saldo asentó,
   *  para que el reveal 0→saldo no se gaste tapado ni con un valor
   *  provisorio. Default `true` (el preview/mockup cuenta al montar). */
  balanceCountReady?: boolean
  /** null oculta la línea (real condicional; el mockup la dibuja siempre). */
  usdLine?: string | null
  dayPill?: string
  eventChip?: HomeEventChipVM | null
  fixedChip?: string | null
  /** Chip informativo "Reserva $X" (gold) — acople del chip gold viejo:
   *  reserva del ciclo que NO debe desaparecer visualmente. No entra al
   *  selector rotativo; se muestra siempre que reserva > 0. */
  reservaChip?: string | null
  /** null oculta TODO el bloque del medidor + hairline. */
  gauge?: HomeGaugeVM | null
  emptySub?: string
  emptyCtaLabel?: string
  /** Copy de la fila Brot del hero vacío (default = literal del mockup; la
   *  neo pasa t('home:hero.emptyProjectionHint')). */
  emptyCopy?: string
  /** Eyebrow del medidor "PODÉS GASTAR HOY" (default mockup; neo pasa t()). */
  gaugeHeadingLabel?: string
  /** Label de la pastilla "CUPO HOY" (default mockup; neo pasa t()). */
  gaugeCupoLabel?: string
  /** Leyenda del segmento "GASTADO" (default mockup; neo pasa t()). */
  gaugeSpentLabel?: string
  /** Leyenda del segmento "DISPONIBLE" (default mockup; neo pasa t()). */
  gaugeAvailableLabel?: string
  /** Texto del link de proyección (default mockup; neo pasa t()). */
  projectionLabel?: string
  /** A11y del link de proyección (default mockup; neo pasa t()). */
  projectionA11yLabel?: string
  onPressEmptyCta?: () => void
  onPressProjection?: () => void
}

const MOCKUP_EVENT_CHIP: HomeEventChipVM = { tone: 'green', label: '+$139k al mes', icon: 'trending-up' }
const MOCKUP_GAUGE: HomeGaugeVM = {
  cupoAmount: '$179k',
  spentLabel: '$52k',
  availableLabel: '$127k',
  spentRatio: 0.29,
  status: 'ok',
}

/**
 * Línea punteada full-width del divisor "CUPO HOY". RN no rinde
 * borderStyle:'dashed' en iOS → SVG con Line + strokeDasharray. Mide el
 * ancho por onLayout (más confiable que porcentajes en react-native-svg).
 */
function CupoDashedLine({ color }: { color: string }) {
  const [width, setWidth] = useState(0)
  return (
    <View
      style={styles.cupoDashWrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Svg width={width} height={2}>
          <Line
            x1={0}
            y1={1}
            x2={width}
            y2={1}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
        </Svg>
      ) : null}
    </View>
  )
}

/**
 * Cupo diario — pastilla "CUPO HOY" hundida (izq) + bar GASTADO/DISPONIBLE
 * (der) + link de proyección debajo. Reemplaza el gauge de arco (pedido owner
 * 2026-07-21). El segmento GASTADO trepa de 0 → spentRatio al montar
 * (withTiming, reduced-motion-aware); DISPONIBLE es flex:1 y se ajusta solo,
 * así que en excedido (ratio → 1) GASTADO llena y DISPONIBLE queda en 0.
 * Componente propio para que el shared value viva bajo hooks estables (el
 * hero vacío hace early-return antes de este bloque).
 */
function HomeCupoGauge({
  s,
  gauge,
  headingLabel,
  cupoTitle,
  spentTitle,
  availableTitle,
  projectionLabel,
  projectionA11yLabel,
  onPressProjection,
}: {
  s: HomeSpec
  gauge: HomeGaugeVM
  headingLabel: string
  cupoTitle: string
  spentTitle: string
  availableTitle: string
  projectionLabel: string
  projectionA11yLabel: string
  onPressProjection?: () => void
}) {
  const reduceMotion = useReducedMotion()
  const projectionPress = usePressScale({ pressedScale: 0.95 })
  // Ancho final del segmento GASTADO (0..100). Clamp: excedido llena el track.
  const targetPct = Math.min(1, Math.max(0, gauge.spentRatio)) * 100
  // Llenado al montar: 0 → targetPct. reduced-motion arranca lleno (sin anim).
  const fill = useSharedValue(reduceMotion ? targetPct : 0)
  /**
   * El barrido desde 0 es de ENTRADA y corre una sola vez.
   *
   * Antes el efecto hacía `fill.value = 0` en cada cambio de `targetPct`, así
   * que al cargar un gasto la barra se rebobinaba y volvía a llenarse hasta un
   * valor casi idéntico: se veía "la barra hace su animación", nunca "la barra
   * SUBIÓ". Justo lo que hay que comunicar es el delta, y el delta era lo
   * único que el rebobinado tapaba.
   *
   * A partir del segundo valor anima del anterior al nuevo, que es lo que hace
   * legible cuánto te comió el gasto que acabás de cargar.
   */
  const hasEntered = useSharedValue(false)
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(fill)
      fill.value = targetPct
      hasEntered.value = true
      return
    }
    if (!hasEntered.value) {
      hasEntered.value = true
      fill.value = 0
    }
    fill.value = withTiming(targetPct, {
      duration: decorativeDurations.meterFill,
      easing: motionEasings.decelerate,
    })
    return () => cancelAnimation(fill)
  }, [targetPct, reduceMotion, fill, hasEntered])
  // width nunca undefined (siempre string %).
  const spentStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }))
  // over → segmento GASTADO en terracota; ok/limit quedan durazno.
  const spentColor = gauge.status === 'over' ? s.gaugeProgressOver : s.barSpent
  const projectionLink = (
    <Text style={[styles.gaugeLink, { color: s.gaugeLinkInk }]}>{projectionLabel}</Text>
  )
  return (
    <View style={styles.gaugeSection}>
      <View style={styles.cupoRow}>
        {/* Pastilla "CUPO HOY" — pozo hundido con 2 NOTCHES tipo cupón. Los
            notches son TROQUEL HUNDIDO (oscuro translúcido): antes imitaban
            el fondo del hero con un verde plano y el gradiente real los
            delataba (fix owner 2026-08-13, ver docblock de `cupoNotch` en
            home-spec). Columnas full-height + justify center = centrado
            robusto sin depender de la altura calculada. */}
        <View style={[styles.cupoWell, { backgroundColor: s.cupoWellBg, boxShadow: s.cupoWellShadow }]}>
          <View style={[styles.cupoNotchCol, styles.cupoNotchColLeft]} pointerEvents="none">
            <View style={[styles.cupoNotch, { backgroundColor: s.cupoNotch }]} />
          </View>
          <View style={[styles.cupoNotchCol, styles.cupoNotchColRight]} pointerEvents="none">
            <View style={[styles.cupoNotch, { backgroundColor: s.cupoNotch }]} />
          </View>
          <Text style={[styles.cupoAmount, { color: s.gaugeAmountInk }]}>{gauge.cupoAmount}</Text>
          <View style={styles.cupoDividerWrap}>
            {/* Línea punteada real (react-native-svg): el borderStyle:'dashed'
                de RN no rinde en iOS. */}
            <CupoDashedLine color={s.cupoDivider} />
            <Text style={[styles.cupoLabel, { color: s.cupoLabelInk }]}>{cupoTitle}</Text>
          </View>
        </View>
        {/* Info — label + bar + leyenda "GASTADO $X DE $Y". */}
        <View style={styles.cupoInfo}>
          <View style={styles.gaugeLabelRow}>
            <View style={[styles.gaugeLabelDot, { backgroundColor: s.gaugeLabelDot }]} />
            <Text style={[styles.gaugeLabelText, { color: s.gaugeLabelInk }]}>{headingLabel}</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: s.barTrackBg, boxShadow: s.barTrackShadow }]}>
            <Animated.View style={[styles.barSpentSeg, spentStyle, { backgroundColor: spentColor }]} />
            <View style={[styles.barAvailSeg, { experimental_backgroundImage: s.barAvailGradientCss }]} />
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.barSpent }]} />
              <Text style={[styles.legendText, { color: s.legendInk }]}>
                {spentTitle} {gauge.spentLabel}
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.barAvailDot }]} />
              <Text style={[styles.legendText, { color: s.legendInk }]}>
                {availableTitle} {gauge.availableLabel}
              </Text>
            </View>
          </View>
        </View>
      </View>
      {onPressProjection ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={projectionA11yLabel}
          hitSlop={6}
          onPress={onPressProjection}
          onPressIn={projectionPress.onPressIn}
          onPressOut={projectionPress.onPressOut}
          style={projectionPress.animatedStyle}
        >
          {projectionLink}
        </AnimatedPressable>
      ) : (
        projectionLink
      )}
    </View>
  )
}

/**
 * Reemplazo del medidor de cupo cuando el saldo del ciclo es NEGATIVO
 * (variante `over`). Pedido del owner 2026-08-13: en vez de ocultar la
 * sección, un emote de Brot — pose `worried`, la MISMA que usa el estado
 * `corto` del hero de Control, que ya convive con la paleta terracota — más
 * el dato que el pozo no da (cuándo vuelve el cupo). El link de proyección se
 * mantiene: Control es donde vive el plan de recuperación del ciclo en rojo.
 *
 * La fila espeja la del hero vacío (slot 40 + copy flex:1, gap 11). El
 * headroom de la tinta de Brot (~4.9dp a size 44, BROT_INK_BLEED_TOP) lo
 * absorbe el paddingTop:13 de `gaugeSection` — y el hero NO tiene
 * overflow:'hidden', así que nada la guillotina.
 */
function HeroCupoOverRow({
  hint,
  projectionLabel,
  projectionA11yLabel,
  onPressProjection,
}: {
  hint: string
  projectionLabel: string
  projectionA11yLabel: string
  onPressProjection?: () => void
}) {
  const projectionPress = usePressScale({ pressedScale: 0.95 })
  const projectionLink = (
    <Text style={[styles.gaugeLink, { color: HERO_OVER_PALETTE.usdInk }]}>{projectionLabel}</Text>
  )
  return (
    <View style={styles.gaugeSection}>
      <View style={styles.overCupoRow}>
        <View style={styles.overCupoBrotSlot} pointerEvents="none">
          <BrotMascot pose="worried" size={44} shadow={false} />
        </View>
        <Text style={[styles.overCupoCopy, { color: HERO_OVER_SUB_INK }]}>{hint}</Text>
      </View>
      {onPressProjection ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={projectionA11yLabel}
          hitSlop={6}
          onPress={onPressProjection}
          onPressIn={projectionPress.onPressIn}
          onPressOut={projectionPress.onPressOut}
          style={projectionPress.animatedStyle}
        >
          {projectionLink}
        </AnimatedPressable>
      ) : (
        projectionLink
      )}
    </View>
  )
}

export function HomeHero({
  mode,
  variant = 'steady',
  balanceLabel = 'SALDO DEL MES',
  balance,
  balanceValue,
  formatBalance,
  balanceScale,
  balanceCountReady = true,
  dayPill,
  usdLine = '≈ US$ 1.619',
  eventChip = MOCKUP_EVENT_CHIP,
  fixedChip = '$123k de fijos por pagar',
  reservaChip = null,
  gauge = MOCKUP_GAUGE,
  emptySub = 'Cargá tu primer ingreso para activar tu mes',
  emptyCtaLabel = '+ Ingreso',
  emptyCopy = 'El cupo diario y la proyección aparecen con tu primer ingreso.',
  gaugeHeadingLabel = 'PODÉS GASTAR HOY',
  gaugeCupoLabel = 'TE QUEDA HOY',
  gaugeSpentLabel = 'GASTADO',
  gaugeAvailableLabel = 'DE',
  projectionLabel = 'Proyección de cierre en Control ›',
  projectionA11yLabel = 'Proyección de cierre en Control',
  onPressEmptyCta,
  onPressProjection,
  overSub = 'Te pasaste del plan',
  overCupoHint = 'El cupo se reinicia con tu próximo ciclo',
}: HomeHeroProps) {
  // `over` repinta el hero entero (gradiente, dot, pill del día, pozo, tintas)
  // con la paleta terracota. El spread deja los END-STATES para lo que no se
  // anima (chips, glow del contador); los sólidos que sí transicionan llevan
  // además un estilo animado que interpola entre las dos paletas — al llegar
  // a progreso 1 coincide exactamente con estos valores. El medidor nunca se
  // dibuja en `over`: HomeHero lo reemplaza por la fila Brot (branch abajo),
  // así que sus tokens forest no pueden filtrarse sobre el terracota.
  const spec = HOME_SPEC[mode]
  const s = variant === 'over' ? { ...spec, ...HERO_OVER_PALETTE } : spec

  // ── Transición de paleta forest↔terracota ──────────────────────────
  // Los strings de gradiente no son animables (precedente AuthCta, auth-kit):
  // crossfade de DOS capas de fondo con UN shared value + interpolateColor
  // para los sólidos. Inicializado en el estado final para no animar el mount
  // (mismo criterio que AuthCta). Estos hooks viven ANTES del early-return
  // del hero vacío: la variante puede cambiar en runtime (empty→steady al
  // configurar el sueldo) y el orden de hooks debe ser estable.
  const reduceMotion = useReducedMotion()
  const isOver = variant === 'over'
  const overProgress = useSharedValue(isOver ? 1 : 0)
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(overProgress)
      overProgress.value = isOver ? 1 : 0
      return
    }
    overProgress.value = withTiming(isOver ? 1 : 0, {
      duration: motionDurations.deliberate,
      easing: motionEasings.standard,
    })
    return () => cancelAnimation(overProgress)
  }, [isOver, reduceMotion, overProgress])

  const overLayerStyle = useAnimatedStyle(() => ({ opacity: overProgress.value }))
  const heroDotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      overProgress.value,
      [0, 1],
      [spec.heroDot, HERO_OVER_PALETTE.heroDot],
    ),
  }))
  const heroLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      overProgress.value,
      [0, 1],
      [spec.heroLabel, HERO_OVER_PALETTE.heroLabel],
    ),
  }))
  const dayPillBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      overProgress.value,
      [0, 1],
      [spec.dayPillBackground, HERO_OVER_PALETTE.dayPillBackground],
    ),
  }))
  const dayPillInkStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      overProgress.value,
      [0, 1],
      [spec.dayPillInk, HERO_OVER_PALETTE.dayPillInk],
    ),
  }))
  const wellBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      overProgress.value,
      [0, 1],
      [spec.wellBackground, HERO_OVER_PALETTE.wellBackground],
    ),
  }))
  // El ancla "no-over" del monto depende de `adjusted` (durazno): la
  // transición steady↔adjusted sigue siendo en seco, como siempre fue.
  // CONGELADA mientras variant === 'over': si el flip viene DESDE adjusted,
  // recalcular el ancla en ese mismo render haría que el fade arranque en
  // crema cuando lo que se veía era durazno (snap de un frame). El ref
  // retiene la tinta que realmente se estaba mostrando; al salir de `over`
  // se actualiza en ese render y el extremo visible (progreso 1, terracota)
  // no se mueve.
  const restInkRef = useRef(variant === 'adjusted' ? spec.balanceAdjustedInk : spec.balanceInk)
  if (variant !== 'over') {
    restInkRef.current = variant === 'adjusted' ? spec.balanceAdjustedInk : spec.balanceInk
  }
  const balanceRestInk = restInkRef.current

  // Valor EN VUELO del conteo — lo escribe `CountUpText` (vía `flightValue`)
  // y lo lee la tinta del monto. Semilla 0 (el conteo arranca ahí); con
  // reduced motion arranca en el valor final, porque ahí no hay conteo que
  // corrija un frame de durazno en un hogar holgado.
  const balanceFlight = useSharedValue(reduceMotion ? (balanceValue ?? 0) : 0)
  const hasBalanceCount = balanceValue != null
  const rampScale = useMemo(
    () => heroBalanceRampScale(balanceScale ?? 0, balanceValue ?? 0),
    [balanceScale, balanceValue],
  )

  const balanceInkStyle = useAnimatedStyle(() => {
    // Sin conteo (preview/mockup con `balance` string): la tinta sigue a la
    // VARIANTE, exactamente como hasta hoy — no hay valor en vuelo del que
    // agarrarse.
    if (!hasBalanceCount) {
      return {
        color: interpolateColor(
          overProgress.value,
          [0, 1],
          [balanceRestInk, HERO_OVER_PALETTE.balanceInk],
        ),
      }
    }
    // Con conteo: la VARIANTE define el extremo holgado (`balanceRestInk`:
    // crema en steady, durazno en adjusted) y el VALOR EN VUELO define la
    // POSICIÓN dentro de la rampa. El fondo sigue diciendo QUÉ; la tinta
    // pasa a decir CUÁNTO.
    return {
      color: interpolateColor(
        heroBalanceRampT(balanceFlight.value, rampScale),
        [0, 0.5, 1],
        [balanceRestInk, HERO_BALANCE_EDGE_INK, HERO_BALANCE_OVER_INK],
      ),
    }
  })
  const usdInkStyle = useAnimatedStyle(() => ({
    color: interpolateColor(overProgress.value, [0, 1], [spec.usdInk, HERO_OVER_PALETTE.usdInk]),
  }))

  // Hero vacío (§14) — transcripción literal de estados.dc.html:60-69
  // (claro) / :104-113 (oscuro): radius 28, padding 16/16/15, label 10.5,
  // pozo radius 20 con "$0" 32/900 (sin text-shadow ni letter-spacing),
  // fila Brot `sprout` + CTA crema. SIN chips de evento NI medidor; sin
  // partículas (el panel no las dibuja).
  if (variant === 'empty') {
    return (
      <View
        style={[
          styles.heroEmpty,
          {
            // Mismo fallback sólido que el hero lleno: sin él, donde el
            // gradiente no rinde la card queda transparente.
            backgroundColor: HERO_GRADIENT_FALLBACK.empty,
            experimental_backgroundImage: s.heroGradientCss,
            boxShadow: s.heroShadow,
          },
        ]}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroEmptyLabelRow}>
            <View style={[styles.heroEmptyDot, { backgroundColor: s.heroDot }]} />
            <Text style={[styles.heroEmptyLabel, { color: s.heroLabel }]}>{balanceLabel}</Text>
          </View>
          <View style={[styles.heroEmptyDayPill, { backgroundColor: s.dayPillBackground }]}>
            <Text style={[styles.heroEmptyDayPillText, { color: s.dayPillInk }]}>{dayPill ?? 'día 1 de 30'}</Text>
          </View>
        </View>
        <View style={[styles.heroEmptyWell, { backgroundColor: s.wellBackground, boxShadow: s.wellShadow }]}>
          <Text style={[styles.heroEmptyBalance, { color: s.balanceInk }]}>{balance ?? '$0'}</Text>
          <Text style={[styles.heroEmptySub, { color: s.emptyHeroSubInk }]}>{emptySub}</Text>
        </View>
        <View style={styles.heroEmptyBrotRow}>
          <View style={styles.heroEmptyBrotSlot}>
            <BrotMascot pose="sprout" size={44} shadow={false} />
          </View>
          <Text style={[styles.heroEmptyCopy, { color: s.emptyHeroSubInk }]}>
            {emptyCopy}
          </Text>
          <CtaPill
            label={emptyCtaLabel}
            ink={s.ctaCreamInk}
            gradientCss={s.ctaCreamGradientCss}
            shadow={s.ctaCreamShadow}
            onPress={onPressEmptyCta}
          />
        </View>
      </View>
    )
  }

  const eventChipInk =
    variant === 'adjusted' ? s.balanceAdjustedInk : eventChip?.tone === 'green' ? s.eventChipGreenInk : s.eventChipNeutralInk

  return (
    <View style={[styles.hero, { backgroundColor: HERO_GRADIENT_FALLBACK.steady, boxShadow: s.heroShadowOutset }]}>
      {/* Fondo en DOS capas (los gradientes no se interpolan): base forest
          SIEMPRE opaca — sin valle de transparencia a mitad del crossfade — y
          capa terracota encima cuya opacity es lo único que anima. Cada capa
          conserva su fallback sólido: donde experimental_backgroundImage no
          rinde (preview web, Android viejo) la transición se sigue leyendo. */}
      <View
        pointerEvents="none"
        style={[styles.heroBgLayer, { experimental_backgroundImage: spec.heroGradientCss }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.heroBgLayer,
          overLayerStyle,
          {
            backgroundColor: HERO_GRADIENT_FALLBACK.over,
            experimental_backgroundImage: HERO_OVER_PALETTE.heroGradientCss,
          },
        ]}
      />
      {/* Rim light (inset 0 1px 0) en su PROPIA capa, encima de los dos
          gradientes: en el root quedaba tapado por las capas opacas en
          Android (el inset de RN se dibuja bajo los hijos) — por eso el
          heroShadow del root pasó a `heroShadowOutset`. Overlay único (no
          duplicado en cada capa): constante durante el crossfade y sin alfa
          acumulado en iOS. */}
      <View pointerEvents="none" style={[styles.heroBgLayer, { boxShadow: s.heroRimInset }]} />
      <View style={styles.heroParticles} pointerEvents="none">
        {/* PARTÍCULAS DEL REDISEÑO — pedido owner 2026-07-28 ("volver a las
            partículas del rediseño"), propagado desde Gastos para no dejar el
            sistema visual partido. Es el port Skia 1:1 de `<brot-particles>`
            del handoff: drift vertical lento con wrap + sway sinusoidal +
            twinkle 0.25–0.8 + halo 2.6×, con la paleta exacta del mockup
            (`design/home-final-2026-07/home.dc.html:43`).

            REVIERTE el swap a `CardParticles` del 2026-07-21 (vuelo errático
            tipo Lissajous, "daba vida") — pero SOLO el modelo de movimiento:
            el count se queda en 20, NO en las 10 del handoff, porque el
            "aumentar al doble" fue un pedido aparte del owner y sigue vigente
            (por eso `count` va explícito y pisa el del preset).

            `borderRadius` explícito además del `overflow:'hidden'` de
            `heroParticles`: en Android el clip de esquinas redondeadas sobre
            un <Canvas> de Skia no es confiable, por eso el componente trae su
            propio `clipRRect`.

            Gate de costo (nuevo acá, no lo tenía `CardParticles`): el campo se
            congela sin foco de navegación y con reduced-motion —que colapsa
            `deviceYearClass < 2020`—, así que en gama baja no anima. */}
        <BrotParticles
          {...neoParticlePresets.hero}
          colors={variant === 'over' ? HERO_OVER_PARTICLES : neoParticlePresets.hero.colors}
          count={20}
          borderRadius={32}
        />
      </View>
      <View>
        <View style={styles.heroTopRow}>
          <View style={styles.heroLabelRow}>
            <Animated.View style={[styles.heroDot, heroDotStyle]} />
            <AnimatedText style={[styles.heroLabel, heroLabelStyle]}>{balanceLabel}</AnimatedText>
          </View>
          <Animated.View style={[styles.dayPill, dayPillBgStyle, { boxShadow: s.dayPillShadow }]}>
            <AnimatedText style={[styles.dayPillText, dayPillInkStyle]}>{dayPill ?? 'día 18 de 30'}</AnimatedText>
          </Animated.View>
        </View>

        <Animated.View style={[styles.well, wellBgStyle, { boxShadow: s.wellShadow }]}>
          {balanceValue != null ? (
            // Conteo fluido (UI thread) + destello al asentar — misma
            // animación que la home vigente. Nunca resetea a 0.
            <CountUpText
              value={balanceValue}
              flourish
              // El valor en vuelo sale acá para que `balanceInkStyle` tiña
              // el monto según cuánto se acerca a cero, y el gate evita
              // que el reveal 0→saldo se gaste detrás del splash.
              flightValue={balanceFlight}
              startWhen={balanceCountReady}
              // `moneySigned` SIEMPRE (no solo en `over`): el path fluido
              // formatea en el worklet e IGNORA `format`, y el string se
              // deriva del shared value — que puede seguir NEGATIVO en vuelo
              // cuando la variante ya flipeó a steady (cargaste un ingreso y
              // el saldo pasó a positivo: el conteo baja desde -$1.2M). Con la
              // unit condicionada a la variante, ese tramo se dibujaba SIN
              // signo — un déficit disfrazado de plata a favor (review
              // 2026-08-13). Para n ≥ 0 'moneySigned' rinde byte-idéntico a
              // 'money', así que steady/adjusted no cambian.
              unit="moneySigned"
              glowColor={s.heroDot}
              format={formatBalance ?? ((n) => `${n}`)}
              style={[
                styles.balance,
                balanceInkStyle,
                {
                  textShadowColor: 'rgba(10,30,15,0.35)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 8,
                },
              ]}
            />
          ) : (
            <AnimatedText
              style={[
                styles.balance,
                balanceInkStyle,
                {
                  textShadowColor: 'rgba(10,30,15,0.35)',
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 8,
                },
              ]}
            >
              {balance ?? '$2.452.537'}
            </AnimatedText>
          )}
          {variant === 'over' ? (
            <Text style={[styles.overSub, { color: HERO_OVER_SUB_INK }]}>{overSub}</Text>
          ) : null}
          {usdLine ? (
            <AnimatedText style={[styles.usd, usdInkStyle]}>{usdLine}</AnimatedText>
          ) : null}
        </Animated.View>

        {eventChip || fixedChip || reservaChip ? (
          <View style={styles.eventChipsRow}>
            {eventChip ? (
              <HomeHeroChip s={s} ink={eventChipInk} icon={eventChip.icon} label={eventChip.label} />
            ) : null}
            {/* Fijos y reserva tienen UN solo significado cada uno, así que su
                glifo se fija acá y no viaja con el string (ver
                `selectFixedChip` / `selectReservaChip`). */}
            {reservaChip ? (
              <HomeHeroChip
                s={s}
                ink={s.eventChipReservaInk}
                icon="account-balance"
                label={reservaChip}
              />
            ) : null}
            {fixedChip ? (
              <HomeHeroChip
                s={s}
                ink={s.eventChipNeutralInk}
                icon="calendar-month"
                label={fixedChip}
              />
            ) : null}
          </View>
        ) : null}

        {/* En `over` el medidor SIEMPRE cede su lugar a la fila Brot — aunque
            llegue un `gauge` (la neo lo pasa sin mirar la variante, y
            deriveGaugeState puede devolver estado con saldo de ciclo
            negativo): sin este branch los tokens forest del medidor se
            filtrarían sobre el terracota. */}
        {variant === 'over' ? (
          <HeroCupoOverRow
            hint={overCupoHint}
            projectionLabel={projectionLabel}
            projectionA11yLabel={projectionA11yLabel}
            onPressProjection={onPressProjection}
          />
        ) : gauge ? (
          <HomeCupoGauge
            s={s}
            gauge={gauge}
            headingLabel={gaugeHeadingLabel}
            cupoTitle={gaugeCupoLabel}
            spentTitle={gaugeSpentLabel}
            availableTitle={gaugeAvailableLabel}
            projectionLabel={projectionLabel}
            projectionA11yLabel={projectionA11yLabel}
            onPressProjection={onPressProjection}
          />
        ) : null}
      </View>
    </View>
  )
}

/**
 * Chip del hero (evento / reserva / fijos). Ícono Material + label, los dos
 * con la MISMA tinta.
 *
 * ÍCONOS, NO EMOJIS (owner 2026-08-12). Los tres chips traían el glifo como
 * emoji al principio del string (💚/💰/📈/✂️/🗓️/🏦). Un emoji no es parte del
 * sistema visual: lo dibuja la fuente de la plataforma —distinto en iOS, en
 * Android y en cada versión—, ignora la tinta del chip (queda a todo color
 * sobre el verde del hero) y no escala con el peso tipográfico. Además vivía
 * dentro del copy traducido, así que se colaba en lo que anuncia el lector de
 * pantalla y había que repetirlo en cada idioma.
 */
function HomeHeroChip({
  s,
  ink,
  icon,
  label,
}: {
  s: HomeSpec
  ink: string
  icon?: MaterialIconName
  label: string
}) {
  return (
    <View
      style={[styles.eventChip, { backgroundColor: s.eventChipBackground, boxShadow: s.eventChipShadow }]}
    >
      {icon ? <MaterialIcons name={icon} size={14} color={ink} /> : null}
      <Text style={[styles.eventChipText, { color: ink }]}>{label}</Text>
    </View>
  )
}

// ─── Encabezado de sección ───────────────────────────────────────────

export function HomeSectionHeader({
  mode,
  label,
  link,
  linkSize = 12.5,
  onPressLink,
}: {
  mode: HomeMode
  label: string
  link?: string
  /** "Ver detalle" = 12.5 (default) · "Ver todos" = 13 (mockup L74/L134). */
  linkSize?: number
  /** Hace el link presionable. El Pressable envuelve SOLO el texto del link
   *  (no el título de sección) y lee "<sección>, <link>" por lorito, para no
   *  aplanar la fila entera bajo un label corto. */
  onPressLink?: () => void
}) {
  const s = HOME_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.94 })
  const linkText = link ? (
    <Text style={[styles.sectionLink, { color: s.sectionLink, fontSize: linkSize }]}>{link}</Text>
  ) : null
  return (
    <View style={styles.sectionHead}>
      <Text style={[styles.sectionLabel, { color: s.sectionLabel }]}>{label}</Text>
      {linkText && onPressLink ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={`${label}, ${link}`}
          hitSlop={8}
          onPress={onPressLink}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={press.animatedStyle}
        >
          {linkText}
        </AnimatedPressable>
      ) : (
        linkText
      )}
    </View>
  )
}

// ─── ② Resumen del ciclo ─────────────────────────────────────────────

export interface HomeCycleVariablesVM {
  amount: string
  sub: string
  /** Monto atenuado + dot opacity 0.5 (resumen vacío, catálogo §14). */
  muted?: boolean
}

export interface HomeCycleFijosVM {
  amount: string
  sub: string
  /** Tramo con énfasis (cycleSubAlert) anexado a `sub`; null = sin alerta. */
  subAlert?: string | null
  /** overdue: dot + label pasan al naranja de VARIABLES (catálogo §6). */
  tone?: 'normal' | 'overdue'
  muted?: boolean
}

export interface HomeCycleSummaryProps {
  mode: HomeMode
  variables?: HomeCycleVariablesVM
  fijos?: HomeCycleFijosVM
  onPressVariables?: () => void
  onPressFijos?: () => void
}

const MOCKUP_VARIABLES: HomeCycleVariablesVM = { amount: '$3,0M', sub: '64 movs · Hogar 24%' }
const MOCKUP_FIJOS: HomeCycleFijosVM = { amount: '$1,2M', sub: '13/16 · ', subAlert: 'Spotify vence hoy' }

function CycleRow({
  s,
  dot,
  label,
  labelColor,
  amount,
  muted = false,
  onPress,
  /** Texto del sub para el label a11y compuesto (el Pressable aplana los
   *  hijos, así que el monto y el sub se leen por el label). */
  subText,
  children,
}: {
  s: HomeSpec
  dot: string
  label: string
  labelColor: string
  amount: string
  muted?: boolean
  onPress?: () => void
  subText?: string
  children: React.ReactNode
}) {
  // Card grande → hundido sutil (0.985).
  const press = usePressScale({ pressedScale: 0.985 })
  const row = (
    <View style={styles.cycleRow}>
      <View style={[styles.cycleDot, { backgroundColor: dot }, muted ? styles.cycleDotMuted : null]} />
      <View style={styles.cycleTexts}>
        <Text style={[styles.cycleLabel, { color: labelColor }]}>{label}</Text>
        {children}
      </View>
      <Text style={[styles.cycleAmount, { color: muted ? s.cycleAmountMuted : s.cycleAmount }]}>{amount}</Text>
      <ChevronRight color={s.cycleChevron} />
    </View>
  )
  if (!onPress) return row
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${amount}${subText ? ', ' + subText : ''}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {row}
    </AnimatedPressable>
  )
}

export function HomeCycleSummary({
  mode,
  variables = MOCKUP_VARIABLES,
  fijos = MOCKUP_FIJOS,
  onPressVariables,
  onPressFijos,
}: HomeCycleSummaryProps) {
  const s = HOME_SPEC[mode]
  return (
    <View
      style={[
        styles.cycleCard,
        { backgroundColor: s.cardBackground, boxShadow: s.cardShadow },
        s.cardGradientCss ? { experimental_backgroundImage: s.cardGradientCss } : null,
      ]}
    >
      <CycleRow
        s={s}
        dot={s.cycleDotVariables}
        label="VARIABLES"
        labelColor={variables.muted ? s.cycleLabelVariablesMuted : s.cycleLabelVariables}
        amount={variables.amount}
        muted={variables.muted}
        subText={variables.sub}
        onPress={onPressVariables}
      >
        <Text style={[styles.cycleSub, { color: s.cycleSub }]}>{variables.sub}</Text>
      </CycleRow>
      <View style={[styles.cycleDivider, { boxShadow: s.cycleDividerShadow }]} />
      <CycleRow
        s={s}
        // FIJOS siempre VERDE (pedido owner 2026-07-21): el vencimiento lo
        // señala el sub "N vencidos" en cycleSubAlert, no el dot/label.
        dot={s.cycleDotFijos}
        label="FIJOS"
        labelColor={s.cycleLabelFijos}
        amount={fijos.amount}
        muted={fijos.muted}
        subText={`${fijos.sub}${fijos.subAlert ?? ''}`}
        onPress={onPressFijos}
      >
        <Text style={[styles.cycleSub, { color: s.cycleSub }]}>
          {fijos.sub}
          {fijos.subAlert ? <Text style={[styles.cycleSubAlert, { color: s.cycleSubAlert }]}>{fijos.subAlert}</Text> : null}
        </Text>
      </CycleRow>
    </View>
  )
}

// ─── ③ Tu progreso (meta) ────────────────────────────────────────────

export interface HomeGoalVM {
  emoji: string
  /** Color RESUELTO del tile (pastel por categoría llega resuelto). */
  tileColor?: string
  title: string
  sub: string
  percent: string
  fillRatio: number
}

export interface HomeGoalCardProps {
  mode: HomeMode
  /** null = sin meta (catálogo §7): raise (usuario maduro) o dashed
   *  (usuario nuevo, estados.dc.html:76-77/:120-121). */
  goal?: HomeGoalVM | null
  emptyStyle?: 'raise' | 'dashed'
  /** Default derivado: raise→pill "Crear" · dashed→radial "Crear meta". */
  emptyCtaStyle?: 'pill' | 'radial'
  /** Copy del estado sin meta (defaults = literales del mockup; la neo pasa
   *  t()). `emptySub` cae al literal del estilo activo si no se pasa. */
  emptyTitle?: string
  emptySub?: string
  /**
   * Bajada larga del estado sin meta: QUÉ gana el usuario configurando una
   * meta (fallo del owner 2026-08-16 — "falta mostrar una descripción para
   * configurar la meta en la vista home"). Va a ANCHO COMPLETO debajo de la
   * fila, en el mismo lugar que ocupa la barra de progreso cuando la meta
   * existe: adentro de la fila tendría ~170pt de ancho útil (tile + pill de
   * CTA se comen el resto) y se partiría en cuatro renglones.
   *
   * Opcional: sin ella la card queda EXACTAMENTE como el mockup aprobado, que
   * es lo que siguen rindiendo las réplicas de Settings → Dev.
   */
  emptyDescription?: string
  emptyCtaLabel?: string
  onPress?: () => void
  onPressCreate?: () => void
}

const MOCKUP_GOAL: HomeGoalVM = {
  emoji: '🏖️',
  title: 'Viaje a Bariloche',
  sub: '$820k de $2,4M · falta $1,58M',
  percent: '34%',
  fillRatio: 0.34,
}

export function HomeGoalCard({
  mode,
  goal = MOCKUP_GOAL,
  emptyStyle = 'raise',
  emptyCtaStyle,
  emptyTitle = 'Sin meta activa',
  emptySub,
  emptyDescription,
  emptyCtaLabel,
  onPress,
  onPressCreate,
}: HomeGoalCardProps) {
  const s = HOME_SPEC[mode]
  // Hook al TOP (antes del early return sin-meta): press de la card con meta.
  // El CTA "Crear"/"Crear meta" lo anima CtaPill (0.94).
  const cardPress = usePressScale({ pressedScale: 0.985 })

  if (!goal) {
    const ctaStyle = emptyCtaStyle ?? (emptyStyle === 'dashed' ? 'radial' : 'pill')
    // Sub por defecto = literal del estilo activo (dashed vs raise, mockup).
    const resolvedSub =
      emptySub ??
      (emptyStyle === 'dashed'
        ? 'Definí un objetivo y el sobrante trabaja para vos'
        : 'Definí un objetivo de ahorro')
    const cta =
      ctaStyle === 'radial' ? (
        <CtaPill
          label={emptyCtaLabel ?? 'Crear meta'}
          ink={s.ctaGreenRadialInk}
          gradientCss={s.ctaGreenRadialGradientCss}
          shadow={s.ctaGreenRadialShadow}
          onPress={onPressCreate}
        />
      ) : (
        // El pill "Crear" raise usa la sombra raise estándar (misma literal
        // que iconBtnShadow en ambos temas — catálogo §7).
        <CtaPill
          label={emptyCtaLabel ?? 'Crear'}
          ink={s.ctaGreenPillInk}
          gradientCss={s.ctaGreenPillGradientCss}
          shadow={s.iconBtnShadow}
          widePad
          onPress={onPressCreate}
        />
      )
    // Tile 🎯 inset: bg + sombra = mismos literales que goalBar en ambos
    // temas (claro sin bg, oscuro #142519).
    const tile = (
      <View style={[styles.goalEmptyTile, { backgroundColor: s.goalBarBackground, boxShadow: s.goalBarShadow }]}>
        {/* Ícono REAL de meta del sistema (sticker metas/objetivo), no emoji
            — pedido owner 2026-07-21. GoalIcon resuelve la key del registry. */}
        <GoalIcon value="metas/objetivo" size={30} />
      </View>
    )
    // La descripción va DEBAJO de la fila, a ancho completo (ver el docblock
    // de `emptyDescription`). Sin ella no se emite ningún nodo: la card queda
    // idéntica al mockup aprobado.
    const description = emptyDescription ? (
      <Text style={[styles.goalEmptyDescription, { color: s.goalSub }]}>{emptyDescription}</Text>
    ) : null
    if (emptyStyle === 'dashed') {
      return (
        <View style={[styles.goalEmptyDashed, { borderColor: s.dashedBorder }]}>
          <View style={styles.goalEmptyRow}>
            {tile}
            <View style={styles.goalTexts}>
              <Text style={[styles.goalEmptyDashedTitle, { color: s.goalTitle }]}>{emptyTitle}</Text>
              <Text style={[styles.goalSub, { color: s.goalSub }]}>{resolvedSub}</Text>
            </View>
            {cta}
          </View>
          {description}
        </View>
      )
    }
    return (
      <View
        style={[
          styles.goalEmptyRaise,
          { backgroundColor: s.cardBackground, boxShadow: s.cardShadow },
          s.cardGradientCss ? { experimental_backgroundImage: s.cardGradientCss } : null,
        ]}
      >
        <View style={styles.goalEmptyRow}>
          {tile}
          <View style={styles.goalTexts}>
            <Text style={[styles.goalTitle, { color: s.goalTitle }]}>{emptyTitle}</Text>
            <Text style={[styles.goalSub, { color: s.goalSub }]}>{resolvedSub}</Text>
          </View>
          {cta}
        </View>
        {description}
      </View>
    )
  }

  const fillPct = Math.round(Math.min(1, Math.max(0, goal.fillRatio)) * 1000) / 10
  const card = (
    <View
      style={[
        styles.goalCard,
        { backgroundColor: s.cardBackground, boxShadow: s.cardShadow },
        s.cardGradientCss ? { experimental_backgroundImage: s.cardGradientCss } : null,
      ]}
    >
      <View style={styles.goalRow}>
        <View style={[styles.goalTile, { backgroundColor: goal.tileColor ?? s.goalTileBackground, boxShadow: s.goalTileShadow }]}>
          {/* GoalIcon resuelve emoji literal O key de sticker ("metas/playa"):
              antes el string de sticker se imprimía crudo como texto. */}
          <GoalIcon value={goal.emoji} size={34} />
        </View>
        <View style={styles.goalTexts}>
          <Text style={[styles.goalTitle, { color: s.goalTitle }]}>{goal.title}</Text>
          <Text style={[styles.goalSub, { color: s.goalSub }]}>{goal.sub}</Text>
        </View>
        <Text style={[styles.goalPercent, { color: s.goalPercent }]}>{goal.percent}</Text>
        <ChevronRight color={s.cycleChevron} />
      </View>
      <View style={[styles.goalBar, { backgroundColor: s.goalBarBackground, boxShadow: s.goalBarShadow }]}>
        <View style={[styles.goalBarFill, { width: `${fillPct}%`, experimental_backgroundImage: s.goalBarFillCss }]} />
      </View>
    </View>
  )
  if (!onPress) return card
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}, ${goal.sub}, ${goal.percent}`}
      onPress={onPress}
      onPressIn={cardPress.onPressIn}
      onPressOut={cardPress.onPressOut}
      style={cardPress.animatedStyle}
    >
      {card}
    </AnimatedPressable>
  )
}

// ─── ④ Racha (Brot reactivo) ─────────────────────────────────────────

/** Estados de pip del catálogo §9 (done/today/idle + perdido/semilla). */
export type HomePipState = 'done' | 'today' | 'idle' | 'missed' | 'seedling'

export interface HomeStreakCardProps {
  mode: HomeMode
  title?: string
  /** Línea extra 10.5/700 bajo la grilla (día cero, catálogo §8). */
  subLine?: string | null
  brotPose?: BrotPose
  pips?: HomePipState[]
  dayLetters?: string[]
  /** "Jardín" (default) · "Ver" en semana perfecta (catálogo §8). */
  linkLabel?: string
  /** Día-cero (catálogo §8): el texto del link queda verde pero el chevron
   *  se atenúa (streakLinkChevronMuted). Default false = chevron verde. */
  linkChevronMuted?: boolean
  onPress?: () => void
}

const MOCKUP_PIPS: HomePipState[] = ['done', 'today', 'idle', 'idle', 'idle', 'idle', 'idle']
const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

function StreakPip({ s, state }: { s: HomeSpec; state: HomePipState }) {
  if (state === 'done') return <View style={[styles.streakPip, { backgroundColor: s.streakDotDone }]} />
  if (state === 'today') return <View style={[styles.streakPip, { borderWidth: 2, borderColor: s.streakDotTodayRing }]} />
  if (state === 'missed') {
    return (
      <View style={[styles.streakPip, styles.streakPipCenter, { backgroundColor: s.streakDotMissed }]}>
        <Svg width={7} height={7} viewBox="0 0 24 24" fill="none">
          <Path d="M6 6l12 12M18 6L6 18" stroke={s.streakDotMissedX} strokeWidth={4} strokeLinecap="round" />
        </Svg>
      </View>
    )
  }
  if (state === 'seedling') return <View style={[styles.streakPip, { backgroundColor: s.streakDotSeedling }]} />
  return <View style={[styles.streakPip, { backgroundColor: s.streakDotIdleBackground, boxShadow: s.streakDotIdleShadow }]} />
}

export function HomeStreakCard({
  mode,
  title = 'Racha de 1 día 🌱',
  subLine = null,
  brotPose = 'idle',
  pips = MOCKUP_PIPS,
  dayLetters = DAY_LETTERS,
  linkLabel = 'Jardín',
  linkChevronMuted = false,
  onPress,
}: HomeStreakCardProps) {
  const s = HOME_SPEC[mode]
  // Card grande → hundido sutil (0.985).
  const press = usePressScale({ pressedScale: 0.985 })
  const card = (
    <View style={[styles.streakCard, { experimental_backgroundImage: s.streakGradientCss, boxShadow: s.streakShadow }]}>
      <View style={styles.brotSlot44}>
        <BrotMascot pose={brotPose} size={44} shadow={false} />
      </View>
      <View style={styles.streakBody}>
        <Text style={[styles.streakTitle, { color: s.streakTitle }]}>{title}</Text>
        <View style={styles.streakGrid}>
          {pips.map((state, i) => {
            // Letra: done/today con su color; perdido y semilla van en idle
            // (literal "Racha cortada", estados.dc.html §8).
            const letterColor = state === 'done' ? s.streakDayDone : state === 'today' ? s.streakDayToday : s.streakDayIdle
            return (
              <View key={i} style={styles.streakDayCol}>
                <Text style={[styles.streakDayLetter, { color: letterColor }]}>{dayLetters[i] ?? ''}</Text>
                <StreakPip s={s} state={state} />
              </View>
            )
          })}
        </View>
        {subLine ? <Text style={[styles.streakSubLine, { color: s.streakSubMuted }]}>{subLine}</Text> : null}
      </View>
      <View style={styles.streakLinkRow}>
        <Text style={[styles.streakLinkText, { color: s.streakLink }]}>{linkLabel}</Text>
        <ChevronRight color={linkChevronMuted ? s.streakLinkChevronMuted : s.streakLink} />
      </View>
    </View>
  )
  if (!onPress) return card
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${subLine ? ', ' + subLine : ''}`}
      accessibilityHint="Ver el jardín"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={press.animatedStyle}
    >
      {card}
    </AnimatedPressable>
  )
}

// ─── ⑤ Actividad ─────────────────────────────────────────────────────

export interface HomeActivityItem {
  /** Nodo YA construido (espejo de ActivityRowV2.icon): sticker
   *  CategoryIcon para gastos, string emoji para ingresos. String → el
   *  kit lo envuelve en <Text>; ReactNode → se renderiza tal cual. */
  icon: ReactNode
  /** Color RESUELTO del tile (el kit no resuelve categorías). */
  tileColor: string
  title: string
  sub: string
  amount: string
}

export interface HomeActivityRowsProps {
  mode: HomeMode
  items?: HomeActivityItem[]
  /** today = pozo Brot 54 sin CTA (catálogo §10) · newUser = BR-E Brot 56
   *  + CTA radial (estados.dc.html:84-90/:128-134). */
  empty?: { kind: 'today' | 'newUser' } | null
  emptyCtaLabel?: string
  /** Copy de los vacíos (defaults = literales del mockup; la neo pasa t()).
   *  `emptyTitle` sirve a today y newUser; `emptySubtitle` solo a newUser. */
  emptyTitle?: string
  emptySubtitle?: string
  onPressItem?: (index: number) => void
  onPressEmptyCta?: () => void
  /** Sin sombra propia de la fila: la usa la neo cuando envuelve cada fila
   *  en un SwipeRow (overflow:hidden clipa la sombra); el wrapper externo
   *  no clippeado la aplica. Pedido owner 2026-07-21 (sombras cortadas). */
  flat?: boolean
}

export function HomeActivityRows({
  mode,
  items,
  empty = null,
  emptyCtaLabel = '+ Cargar gasto',
  emptyTitle = 'Todavía no cargaste nada hoy',
  emptySubtitle = 'Tu actividad va a aparecer acá',
  onPressItem,
  onPressEmptyCta,
  flat = false,
}: HomeActivityRowsProps) {
  const s = HOME_SPEC[mode]

  if (empty) {
    if (empty.kind === 'today') {
      return (
        <View
          style={[
            styles.activityEmptyWell,
            styles.activityEmptyGapToday,
            { backgroundColor: s.activityEmptyWellBackground, boxShadow: s.activityEmptyWellShadow },
          ]}
        >
          <BrotMascot pose="idle" size={54} shadow={false} />
          <Text style={[styles.activityEmptyText, { color: s.activityEmptyInk }]}>{emptyTitle}</Text>
        </View>
      )
    }
    return (
      <View
        style={[
          styles.activityEmptyWell,
          styles.activityEmptyGapNewUser,
          { backgroundColor: s.activityEmptyWellBackground, boxShadow: s.activityEmptyWellShadow },
        ]}
      >
        <BrotMascot pose="idle" size={56} shadow={false} />
        <Text style={[styles.activityEmptyTitleText, { color: s.activityEmptyTitle }]}>{emptyTitle}</Text>
        <Text style={[styles.activityEmptySubText, { color: s.activityEmptySub }]}>{emptySubtitle}</Text>
        <CtaPill
          label={emptyCtaLabel}
          ink={s.ctaGreenRadialInk}
          gradientCss={s.ctaGreenRadialGradientCss}
          shadow={s.ctaGreenRadialShadow}
          onPress={onPressEmptyCta}
        />
      </View>
    )
  }

  const list: HomeActivityItem[] = items ?? [
    { icon: '🍕', tileColor: s.activityTilePizza, title: 'Delivery', sub: 'Mario · Comida y salidas', amount: '−$61.200' },
    { icon: '🛒', tileColor: s.activityTileMercado, title: 'Verdulería', sub: 'Camila · Mercado', amount: '−$12.500' },
  ]
  return (
    <View style={styles.activityList}>
      {list.map((item, i) => {
        const row = (
          <View
            style={[
              styles.activityRow,
              { backgroundColor: s.activityBackground },
              flat ? null : { boxShadow: s.activityShadow },
              s.activityGradientCss ? { experimental_backgroundImage: s.activityGradientCss } : null,
            ]}
          >
            <View style={[styles.activityTile, { backgroundColor: item.tileColor }]}>
              {typeof item.icon === 'string' ? <Text style={styles.activityEmoji}>{item.icon}</Text> : item.icon}
            </View>
            <View style={styles.activityTexts}>
              <Text style={[styles.activityTitle, { color: s.activityTitle }]}>{item.title}</Text>
              <Text style={[styles.activitySub, { color: s.activitySub }]}>{item.sub}</Text>
            </View>
            <Text style={[styles.activityAmount, { color: s.activityAmount }]}>{item.amount}</Text>
          </View>
        )
        return onPressItem ? (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.sub}, ${item.amount}`}
            onPress={() => onPressItem(i)}
          >
            {row}
          </Pressable>
        ) : (
          <Fragment key={i}>{row}</Fragment>
        )
      })}
    </View>
  )
}

// ─── Nav nueva (pastilla inset + FAB N1 con surco) ───────────────────

export type HomeTabKey = 'inicio' | 'gastos' | 'fijos' | 'control'

export interface HomeNavBarProps {
  mode: HomeMode
  activeTab?: HomeTabKey
  /** Dot 8×8 naranja top:3 right:6 SOLO en ítems inactivos (catálogo §2). */
  itemDots?: Partial<Record<HomeTabKey, boolean>>
  /** Badge 20×20 naranja del FAB (catálogo §1); null/0 = oculto. */
  fabBadge?: number | null
  onPressTab?: (tab: HomeTabKey) => void
  onPressFab?: () => void
}

const NAV_ITEMS: { key: HomeTabKey; icon: 'home' | 'expenses' | 'fixed' | 'control'; label: string }[] = [
  { key: 'inicio', icon: 'home', label: 'Inicio' },
  { key: 'gastos', icon: 'expenses', label: 'Gastos' },
  { key: 'fijos', icon: 'fixed', label: 'Fijos' },
  { key: 'control', icon: 'control', label: 'Control' },
]

function NavItem({
  s,
  item,
  active,
  dot,
  onPress,
}: {
  s: HomeSpec
  item: (typeof NAV_ITEMS)[number]
  active: boolean
  dot: boolean
  onPress?: () => void
}) {
  const inner = active ? (
    <View style={[styles.navActive, { backgroundColor: s.navActiveBackground, boxShadow: s.navActiveShadow }]}>
      <NeoTabIcon name={item.icon} color={s.navActiveInk} size={20} strokeWidth={2.3} />
      <Text style={[styles.navActiveLabel, { color: s.navActiveInk }]}>{item.label}</Text>
    </View>
  ) : (
    <View style={styles.navIdle}>
      <NeoTabIcon name={item.icon} color={s.navIdleInk} size={20} strokeWidth={2.2} />
      <Text style={[styles.navIdleLabel, { color: s.navIdleInk }]}>{item.label}</Text>
      {dot ? <View style={[styles.navItemDot, { backgroundColor: s.navItemDot }]} /> : null}
    </View>
  )
  if (!onPress) return inner
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={item.label} onPress={onPress}>
      {inner}
    </Pressable>
  )
}

export function HomeNavBar({ mode, activeTab = 'inicio', itemDots, fabBadge = null, onPressTab, onPressFab }: HomeNavBarProps) {
  const s = HOME_SPEC[mode]
  const renderItem = (item: (typeof NAV_ITEMS)[number]) => (
    <NavItem
      key={item.key}
      s={s}
      item={item}
      active={item.key === activeTab}
      dot={Boolean(itemDots?.[item.key]) && item.key !== activeTab}
      onPress={onPressTab ? () => onPressTab(item.key) : undefined}
    />
  )
  return (
    <View style={[styles.nav, { experimental_backgroundImage: s.navGradientCss, boxShadow: s.navShadow }]}>
      {NAV_ITEMS.slice(0, 2).map(renderItem)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar"
        onPress={onPressFab}
        style={({ pressed }) => [
          styles.fab,
          {
            experimental_backgroundImage: s.fabGradientCss,
            boxShadow: pressed ? s.fabPressedShadow : s.fabShadow,
          },
        ]}
      >
        {({ pressed }) => (
          <>
            <View style={[styles.fabWell, { boxShadow: pressed ? s.fabPressedWellShadow : s.fabWellShadow }]}>
              <NeoTabIcon name="plus" color={s.fabInk} size={24} strokeWidth={3} />
            </View>
            {fabBadge ? (
              <View style={[styles.fabBadge, { backgroundColor: s.badgeBackground, borderColor: s.fabBadgeBorder }]}>
                <Text style={[styles.fabBadgeText, { color: s.badgeInk }]}>{fabBadge}</Text>
              </View>
            ) : null}
          </>
        )}
      </Pressable>
      {NAV_ITEMS.slice(2).map(renderItem)}
    </View>
  )
}

// ─── Pantalla completa (preview) ─────────────────────────────────────

export interface HomeFinalScreenProps {
  mode: HomeMode
  moment?: HomeMoment
  header?: Omit<HomeHeaderProps, 'mode' | 'moment'>
  chips?: Omit<HomeChipsRowProps, 'mode'>
  hero?: Omit<HomeHeroProps, 'mode'>
  cycle?: Omit<HomeCycleSummaryProps, 'mode'>
  goal?: Omit<HomeGoalCardProps, 'mode'>
  streak?: Omit<HomeStreakCardProps, 'mode'>
  activity?: Omit<HomeActivityRowsProps, 'mode'>
  nav?: Omit<HomeNavBarProps, 'mode'>
}

export function HomeFinalScreen({
  mode,
  moment,
  header,
  chips,
  hero,
  cycle,
  goal,
  streak,
  activity,
  nav,
}: HomeFinalScreenProps) {
  const s = HOME_SPEC[mode]
  return (
    <View style={[styles.shell, { backgroundColor: s.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <HomeStatusBar mode={mode} />
        <View style={styles.content}>
          <HomeHeader mode={mode} moment={moment} {...header} />
          <HomeChipsRow mode={mode} {...chips} />
          <HomeHero mode={mode} {...hero} />
          <Fragment>
            <HomeSectionHeader mode={mode} label="RESUMEN DEL CICLO" link="Ver detalle" />
            <HomeCycleSummary mode={mode} {...cycle} />
          </Fragment>
          <Fragment>
            <HomeSectionHeader mode={mode} label="TU PROGRESO" />
            <HomeGoalCard mode={mode} {...goal} />
          </Fragment>
          <HomeStreakCard mode={mode} {...streak} />
          <Fragment>
            <HomeSectionHeader mode={mode} label="ACTIVIDAD" link="Ver todos" linkSize={13} />
            <HomeActivityRows mode={mode} {...activity} />
          </Fragment>
        </View>
        <HomeNavBar mode={mode} {...nav} />
        <View style={[styles.homeIndicator, { backgroundColor: s.homeIndicator, opacity: s.homeIndicatorOpacity }]} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: 20, paddingTop: 10 },

  // status bar (chrome del mockup)
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 18,
    paddingHorizontal: 28,
    paddingBottom: 4,
  },
  statusTime: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  signalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2.5 },
  signalBar: { width: 3, borderRadius: 1 },
  batteryGroup: { flexDirection: 'row', alignItems: 'center', gap: 1.5 },
  battery: { width: 23, height: 11.5, borderWidth: 1.5, borderRadius: 3.5, padding: 1.5, justifyContent: 'center' },
  batteryFill: { width: '62%', height: '100%', borderRadius: 1.5 },
  batteryNub: { width: 1.5, height: 4, borderRadius: 1 },

  // ⓿ header
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  // El `flexShrink` de `greetTexts` no alcanza: sin uno acá el grupo mide por
  // contenido y un nombre largo (el cableado admite hasta 22 caracteres a 28px
  // = ~356pt) empuja los tres botones fuera de una pantalla de 375.
  greetGroup: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  greetTexts: { flexShrink: 1, minWidth: 0 },
  greetLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  greetEmoji: { fontSize: 16 },
  greetLabel: { flexShrink: 1, fontSize: 14, fontWeight: '800', fontFamily: nunitoFamily('800') },
  // Headroom 1.2× y no el 1.05 del mockup: en iOS la baseline cae a
  // `lineHeight − descent` del tope, y una mayúscula acentuada de Nunito 900
  // sube 0.959em (0.788em una minúscula). Con 1.05 quedaban 0.697em útiles y
  // la tilde de un nombre como "Ángel" desaparecía.
  greetName: { fontSize: 28, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 28 * 1.2, marginTop: 1 },
  // "¡bienvenido!" §13 (estados.dc.html): label 13/800 · nombre 26/900.
  greetLabelWelcome: { fontSize: 13 },
  greetNameWelcome: { fontSize: 26, lineHeight: 26 * 1.2, marginTop: 0 },
  headerBtns: { flexShrink: 0, flexDirection: 'row', gap: 9, paddingTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 19,
    height: 19,
    borderRadius: 9.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900') },
  // Dot de atención del botón sliders (G7): centro alineado al del badge.
  headerNudgeDot: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4 },

  // chips
  chipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  // Solo el chip de sueldo (members null) → a la derecha (no pegado al borde
  // izquierdo). Usuario nuevo → los dos chips adyacentes a la izquierda.
  chipRowSoloSueldo: { justifyContent: 'flex-end' },
  chipRowAdjacent: { justifyContent: 'flex-start', gap: 10 },
  membersChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 22,
    paddingVertical: 7,
    paddingRight: 14,
    paddingLeft: 8,
    // Con los dos chips largos (miembros + "Confirma tu saldo ›") la fila no
    // entra en 375pt: cede este, no el que pide la acción.
    flexShrink: 1,
  },
  // El `flexShrink` que cede ancho cuando los dos chips no entran vive en el
  // chip; cuando el chip va envuelto en el Pressable, el hijo flex de la fila
  // pasa a ser el wrapper — sin esto el wrapper no cede y el chip se sale.
  membersPressable: { flexShrink: 1 },
  avatarStack: { flexDirection: 'row' },
  // 26px, recorta el nodo al círculo (overflow) y lleva un ring 2px cuyo
  // color pinta el caller (= membersBackground) para separar el overlap.
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverlap: { marginLeft: -8 },
  membersLabel: { flexShrink: 1, fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800') },
  sueldoChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 22, paddingVertical: 9, paddingHorizontal: 14 },
  // Wrap + anillo del ripple peach de los chips accionables.
  sueldoChipWrap: { position: 'relative', alignSelf: 'flex-start' },
  sueldoRipple: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#F2A78C',
  },
  sueldoDot: { width: 7, height: 7, borderRadius: 3.5 },
  sueldoLabel: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ① hero
  hero: { position: 'relative', marginTop: 18, borderRadius: 32, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 },
  // Capa de fondo del crossfade forest↔terracota. `styles.hero` NO tiene
  // overflow:'hidden' (Brot/tinta), así que cada capa lleva su propio radius.
  heroBgLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 32 },
  heroParticles: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 32, overflow: 'hidden' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroLabel: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.61 },
  dayPill: { borderRadius: 14, paddingVertical: 6, paddingHorizontal: 11 },
  dayPillText: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  well: { marginTop: 14, borderRadius: 24, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 },
  // lineHeight con headroom sobre el fontSize: en RN un lineHeight == fontSize
  // clippea el ascender de Nunito 900 (el `line-height:1` del mockup web no
  // clippea en browser pero sí acá). ~1.2× despeja el tope sin mover el layout.
  balance: { fontSize: 41, fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.82, lineHeight: 49 },
  usd: { fontSize: 13.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 7 },
  // Sub-línea del pozo en `over` ("Te pasaste del plan"). Métrica del `usd`
  // pero un punto más chica y en 800: es una etiqueta de estado, no un monto,
  // y no debe competir con el número grande que tiene arriba.
  overSub: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800'), marginTop: 6 },
  // Fila Brot del cupo en `over` — espejo métrico de heroEmptyBrotRow/Slot
  // (gap 11, slot 40, copy 11/700 lh 15.4). Sin marginTop propio: el aire lo
  // pone el paddingTop:13 de gaugeSection, que además absorbe el bleed de la
  // tinta de Brot (~4.9dp a size 44).
  overCupoRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  overCupoBrotSlot: { width: 40, alignItems: 'center', justifyContent: 'flex-end' },
  overCupoCopy: { flex: 1, fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 15.4 },
  eventChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  // Fila: el ícono Material reemplazó al emoji del prefijo (ver `HomeHeroChip`).
  // El `gap: 6` es el mismo aire que tenía el espacio después del emoji.
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  eventChipText: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },
  // Cupo diario (rediseño 2026-07-21): contenedor columna = row (pastilla +
  // info) con el link de proyección debajo.
  // Sin línea divisoria arriba (pedido owner 2026-07-21): se sacó el
  // borderTop; queda solo el espacio (margin+padding) que separa del saldo.
  gaugeSection: { marginTop: 15, paddingTop: 13 },
  cupoRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  // Pastilla "CUPO HOY" — pozo hundido con knobs (izq/der) y divisor punteado.
  // overflow hidden: el notch se clippea a la pastilla → solo se ve el
  // semicírculo del recorte (sin mitad afuera que desentone con el fondo).
  cupoWell: { position: 'relative', flexShrink: 0, borderRadius: 14, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center', overflow: 'hidden' },
  // Notches tipo cupón: columna full-height (top/bottom 0) + justify center =
  // el círculo queda SIEMPRE centrado vertical sin depender de la altura.
  // El círculo se centra sobre el borde (mitad adentro = el recorte, mitad
  // afuera = fusiona con el hero).
  cupoNotchCol: { position: 'absolute', top: 0, bottom: 0, width: 12, alignItems: 'center', justifyContent: 'center' },
  cupoNotchColLeft: { left: -6 },
  cupoNotchColRight: { right: -6 },
  cupoNotch: { width: 12, height: 12, borderRadius: 6 },
  // lineHeight con headroom (~1.18×) sobre el fontSize: un lineHeight == 22
  // clippea el ascender de Nunito 900 en RN (ver `balance`).
  cupoAmount: { fontSize: 22, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 26, textAlign: 'center' },
  cupoDividerWrap: { alignSelf: 'stretch', marginTop: 7, alignItems: 'center' },
  cupoDashWrap: { alignSelf: 'stretch', height: 2 },
  cupoLabel: { fontSize: 8, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 0.8, textAlign: 'center', marginTop: 4 },
  // Info — label "PODÉS GASTAR HOY" + bar + leyenda.
  cupoInfo: { flex: 1, minWidth: 0 },
  gaugeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gaugeLabelDot: { width: 6, height: 6, borderRadius: 3 },
  gaugeLabelText: { fontSize: 10, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1 },
  // Bar GASTADO/DISPONIBLE — track hundido, segmentos con gap 2 (overflow
  // hidden así el excedido no desborda los 2px del gap).
  barTrack: { height: 12, borderRadius: 6, marginTop: 9, padding: 2, flexDirection: 'row', gap: 2, overflow: 'hidden' },
  barSpentSeg: { height: '100%', borderRadius: 4 },
  barAvailSeg: { flex: 1, height: '100%', borderRadius: 4 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 9, fontWeight: '800', fontFamily: nunitoFamily('800') },
  gaugeLink: { fontSize: 10.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 8 },

  // ① hero vacío (§14, estados.dc.html:60-69/:104-113)
  heroEmpty: { position: 'relative', marginTop: 18, borderRadius: 28, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 15 },
  heroEmptyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroEmptyDot: { width: 7, height: 7, borderRadius: 3.5 },
  heroEmptyLabel: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.47 },
  heroEmptyDayPill: { borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 },
  heroEmptyDayPillText: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  heroEmptyWell: { marginTop: 11, borderRadius: 20, paddingTop: 13, paddingHorizontal: 15, paddingBottom: 11 },
  heroEmptyBalance: { fontSize: 32, fontWeight: '900', fontFamily: nunitoFamily('900'), lineHeight: 38 },
  heroEmptySub: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 5 },
  heroEmptyBrotRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12 },
  heroEmptyBrotSlot: { width: 40, alignItems: 'center', justifyContent: 'flex-end' },
  heroEmptyCopy: { flex: 1, fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), lineHeight: 15.4 },

  // CTAs del catálogo (crema / pill raise / radial)
  ctaPill: { borderRadius: 15, paddingVertical: 9, paddingHorizontal: 14 },
  ctaPillWidePad: { paddingHorizontal: 15 },
  ctaPillText: { fontSize: 12, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // encabezados de sección
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingHorizontal: 4,
  },
  sectionLabel: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.84 },
  sectionLink: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ② resumen del ciclo
  cycleCard: { marginTop: 10, borderRadius: 24, paddingVertical: 6, paddingHorizontal: 16 },
  cycleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  cycleDot: { width: 9, height: 9, borderRadius: 4.5 },
  cycleDotMuted: { opacity: 0.5 },
  cycleTexts: { flex: 1, minWidth: 0 },
  cycleLabel: { fontSize: 11, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: 1.1 },
  cycleSub: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700') },
  cycleSubAlert: { fontWeight: '800', fontFamily: nunitoFamily('800') },
  cycleAmount: { fontSize: 20, fontWeight: '900', fontFamily: nunitoFamily('900') },
  cycleDivider: { height: 2, borderRadius: 2 },

  // ③ meta
  goalCard: { marginTop: 10, borderRadius: 22, paddingVertical: 13, paddingHorizontal: 16 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalTile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goalTexts: { flex: 1, minWidth: 0 },
  goalTitle: { fontSize: 14, fontWeight: '900', fontFamily: nunitoFamily('900') },
  goalSub: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700') },
  goalPercent: { fontSize: 17, fontWeight: '900', fontFamily: nunitoFamily('900') },
  goalBar: { height: 7, borderRadius: 5, marginTop: 11, overflow: 'hidden' },
  goalBarFill: { height: '100%', borderRadius: 5 },
  // ③ sin meta — raise (catálogo §7) y dashed (usuario nuevo :77/:121)
  //
  // El `flexDirection/alignItems/gap` de la fila se mudó a `goalEmptyRow`
  // cuando la card pasó a poder llevar una descripción debajo (columna
  // afuera, fila adentro). Sin descripción el resultado es pixel por pixel el
  // mismo: mismos paddings, misma fila, un solo hijo.
  goalEmptyRaise: {
    marginTop: 10,
    borderRadius: 22,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  goalEmptyDashed: {
    marginTop: 10,
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  goalEmptyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Misma familia tipográfica que las bajadas de las cards del Home
  // (`goalSub`, 11/700) con `lineHeight` explícito: acá el texto SÍ se parte
  // en dos renglones y sin interlineado quedaban pegados.
  goalEmptyDescription: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 16,
    marginTop: 10,
  },
  goalEmptyDashedTitle: { fontSize: 13.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  goalEmptyTile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  goalEmptyTileEmoji: { fontSize: 18 },

  // ④ racha
  streakCard: {
    marginTop: 12,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brotSlot44: { width: 44, height: 44, alignItems: 'center', justifyContent: 'flex-end' },
  streakBody: { flex: 1, minWidth: 0 },
  streakTitle: { fontSize: 13.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  streakGrid: { flexDirection: 'row', marginTop: 9 },
  streakDayCol: { flex: 1, alignItems: 'center', gap: 5 },
  streakDayLetter: { fontSize: 9.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  streakPip: { width: 11, height: 11, borderRadius: 5.5 },
  streakPipCenter: { alignItems: 'center', justifyContent: 'center' },
  streakSubLine: { fontSize: 10.5, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: 8 },
  streakLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  streakLinkText: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ⑤ actividad
  activityList: { gap: 10, marginTop: 12 },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  activityTile: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  activityEmoji: { fontSize: 20 },
  activityTexts: { flex: 1, minWidth: 0 },
  activityTitle: { fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  activitySub: { fontSize: 11.5, fontWeight: '700', fontFamily: nunitoFamily('700') },
  activityAmount: { fontSize: 14.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  // ⑤ vacíos (catálogo §10 / BR-E :85-90/:129-134)
  activityEmptyWell: { marginTop: 12, borderRadius: 22, padding: 18, alignItems: 'center' },
  activityEmptyGapToday: { gap: 8 },
  activityEmptyGapNewUser: { gap: 9 },
  activityEmptyText: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },
  activityEmptyTitleText: { fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  activityEmptySubText: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700'), marginTop: -4 },

  // nav
  nav: {
    marginTop: 22,
    marginHorizontal: 18,
    marginBottom: 22,
    borderRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navActive: { alignItems: 'center', gap: 4, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 13 },
  navActiveLabel: { fontSize: 10.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  navIdle: { alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6 },
  navIdleLabel: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  navItemDot: { position: 'absolute', top: 3, right: 6, width: 8, height: 8, borderRadius: 4 },
  fab: {
    position: 'relative',
    top: -26,
    marginBottom: -26,
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  fabBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBadgeText: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900') },

  homeIndicator: { width: 132, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
})
