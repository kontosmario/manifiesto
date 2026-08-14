// @i18n-ignore-file — kit de rediseño; fixtures literales del markup, el copy real llega por props (i18n vive en el view-model).
import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { BrotParticles } from '@/components/brot/brot-particles'
import { CONTROL_RADII, CONTROL_SPEC, type ControlMode } from '@/components/redesign/control/control-spec'
import { CtlGlowDot, CtlKnob, GrowView } from '@/components/redesign/control/control-primitives'
import { usePressScale } from '@/hooks/use-press-scale'
import { decorativeDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * ② Hero "HASTA CUÁNDO TE ALCANZA" de la vista CONTROL — transcripción
 * pixel-perfect del layout final de design_handoff_control (pretty líneas
 * 5845–5931, estado holgado = EL DEFINITIVO para estructura y tamaños).
 * La card es AUTO-COLOREADA (paleta por variante, idéntica en claro y
 * oscuro); lo único que cambia por tema es la sombra exterior
 * (`spec.heroShadow`, diff claro-vs-oscuro líneas 51–54) — por eso `mode`
 * solo resuelve esa sombra.
 *
 * Mecanismo variant/content = el de `FijosHero` (fijos-screen.tsx,
 * `HERO_CONTENT`): `Record<Variant, Content>` con los valores LITERALES
 * del markup + `withControlHeroDefaults(variant, overrides)` con `??`
 * campo por campo — `<ControlHero mode="light" variant="ajustado" />` sin
 * más props reproduce la card del handoff.
 *
 * Los estados HC-B (ajustado, 5236–5325), HC-C (en rojo → variante
 * 'corto', 5331–5420) y HC-D (primer ciclo, 5426–5459) vienen de la tanda
 * de estados, que dibuja a OTRA escala (cards de 400px): de ella se toman
 * SOLO paletas, copy y poses de Brot; todos los tamaños salen del layout
 * final. En concreto NO se transcriben de la tanda (el layout final no los
 * tiene): text-shadow del monto, el segundo inset del pozo
 * (`inset -5px -5px 12px rgba(200,200,180,0.14)`), el highlight de las
 * celdas (`inset 0 1px 0 rgba(255,255,255,0.18)`), las sombras del pill de
 * veredicto y del CTA, la elipse de piso bajo Brot y el halo alternativo
 * rgba(255,250,235,0.34).
 *
 * Resoluciones locales (no cubiertas por spec/README):
 *  · El pill de veredicto del hero mide padding 5/9, label 10/900 y gap 4
 *    (línea 5859) — NO coincide con la primitiva `VerdictPill` (5/10,
 *    10.5/900, gap 5): se transcribe local en vez de forzar la primitiva.
 *  · El label HOY del timeline es #EEF6E2 en el layout final = el strong
 *    ink de holgado; la tanda usa la tinta del monto de cada estado. Se
 *    mapeó HOY → `strongInk` por variante (coincide literal en holgado).
 *  · El warning del pill (ajustado/corto) solo existe en la tanda a 11px;
 *    se dibuja a 10px = el tamaño del check del layout final.
 *  · El `filter:drop-shadow(...)` alrededor de Brot no se porta (mismo
 *    criterio que auth-plan-hogar/auth-bridge: no existe en RN).
 *  · El track punteado (`repeating-linear-gradient` 6px on / 6px off) se
 *    representa como fila de segmentos 6×4 con gap 6 recortada.
 *  · primerCiclo no existe en el layout final: los contenedores del slot
 *    compartido van a escala del layout final (pozo marginTop 13, radius
 *    20 = heroWell) y los internos exclusivos de HC-D quedan literales de
 *    la tanda (padding 16, gap 12, Brot 80, título 17/900, cuerpo
 *    11.5/700, badge 13/5/10/10.5, placeholder dashed 2px radius 14).
 *  · `todayPrefix` ("Hoy tenés ") se agregó al Content para que el copy
 *    del subtítulo rico llegue entero por props (el separador " · " queda
 *    tipográfico, literal). Ídem `label` en cada stat (RITMO/CUPO/QUEDAN)
 *    — sin eso el pase de i18n no podría traducir esas capas.
 */

// ─── Paletas por variante (theme-independent — NO van al spec) ────────

export type ControlHeroVariant = 'holgado' | 'ajustado' | 'corto' | 'primerCiclo'

interface ControlHeroPalette {
  gradientCss: string
  /** Fallback sólido = primer stop (criterio de fijos-spec/control-spec). */
  gradientFallback: string
  dot: string
  pillBg: string
  pillInk: string
  wellBg: string
  accent: string
  /** Tinta de los strongs del subtítulo/pie y del label HOY. */
  strongInk: string
  knob: string
  fill: string
  particles: readonly string[]
}

const HOLGADO_PALETTE: ControlHeroPalette = {
  // Home forest (`home-spec.heroGradientCss`) — unificado con
  // Home/Gastos/Fijos por pedido del owner (2026-08-04). Las paletas
  // de `ajustado` y `corto` NO se tocan: son semánticas de alerta.
  gradientCss: 'linear-gradient(155deg, #244235 0%, #1F590D 33%, #297811 67%, #297811 100%)',
  gradientFallback: '#244235',
  dot: '#C9F3C6',
  pillBg: '#C9F3C6',
  pillInk: '#0F2A16',
  wellBg: 'rgba(13,34,18,0.32)',
  accent: '#C9F3C6',
  strongInk: '#EEF6E2',
  knob: '#EFF6E2',
  fill: '#C9F3C6',
  particles: ['#C9F3C6', '#FBD9BC', '#EFF6E2'],
}

// primerCiclo comparte la paleta de holgado (HC-D dibuja el forest verde);
// sus extras (badge "Sin datos aún" + placeholder dashed) son estáticos y
// viven en `styles`.
const HERO_PALETTE: Record<ControlHeroVariant, ControlHeroPalette> = {
  holgado: HOLGADO_PALETTE,
  ajustado: {
    gradientCss: 'linear-gradient(155deg, #3A6B2E 0%, #5C7E38 52%, #7E9B45 100%)',
    gradientFallback: '#3A6B2E',
    dot: '#F0DE96',
    pillBg: '#F5E4A8',
    pillInk: '#4A3A10',
    wellBg: 'rgba(30,32,12,0.34)',
    accent: '#F3E1A0',
    strongInk: '#F7F2DE',
    knob: '#F7EFC8',
    fill: '#F0DE96',
    particles: ['#EFE3A8', '#FBD9BC', '#EFF6E2'],
  },
  corto: {
    gradientCss: 'linear-gradient(155deg, #7A3A24 0%, #A6503A 52%, #C26B45 100%)',
    gradientFallback: '#7A3A24',
    dot: '#F6C6AE',
    pillBg: '#F6C6AE',
    pillInk: '#5A2312',
    wellBg: 'rgba(58,20,10,0.36)',
    accent: '#FBD9BC',
    strongInk: '#FFEDE0',
    knob: '#FFE9D6',
    fill: '#F6C6AE',
    particles: ['#FBD9BC', '#F2C0A0', '#FFE9D6'],
  },
  primerCiclo: HOLGADO_PALETTE,
}

/** Inset del pozo — único en el layout final, compartido por variante. */
const WELL_INSET = 'inset 6px 6px 14px rgba(6,20,10,0.5)'

/** Halo radial detrás de Brot (círculo 74px del layout final). */
const HALO_CSS = 'radial-gradient(circle at 50% 42%, rgba(233,251,220,0.4), transparent 72%)'

const HERO_BROT_POSE: Record<ControlHeroVariant, BrotPose> = {
  holgado: 'coach',
  ajustado: 'coach',
  corto: 'worried',
  primerCiclo: 'wave',
}

/** Ícono del pill de veredicto — check (holgado) / warning (ajustado y
 *  corto) / ninguno (badge de primerCiclo). Derivado de la variante, no
 *  del Content: es forma, no copy. */
const VERDICT_ICON: Record<ControlHeroVariant, 'check' | 'warn' | null> = {
  holgado: 'check',
  ajustado: 'warn',
  corto: 'warn',
  primerCiclo: null,
}

/** 40 segmentos de 6px + gap 6 cubren ~474px de track — de sobra para
 *  cualquier ancho de card del kit; el contenedor recorta el resto. */
const TRACK_SEGMENTS: readonly number[] = Array.from({ length: 40 }, (_, i) => i)

// ─── Content por variante ─────────────────────────────────────────────

export interface ControlHeroStat {
  label: string
  value: string
  sub: string
}

export interface ControlHeroStats {
  ritmo: ControlHeroStat
  cupo: ControlHeroStat
  quedan: ControlHeroStat
}

export interface ControlHeroTimelineLabels {
  start: string
  today: string
  end: string
}

/**
 * Campos de contenido del hero. Como en `FijosHeroContent`: tipo plano,
 * cada shape (proyección / primerCiclo) lee su subconjunto y el resto
 * queda en `''`/`0` sin uso — es lo que permite que `ControlHeroProps`
 * extienda `Partial<ControlHeroContent>` y un caller pise UN campo sin
 * reconstruir el objeto de la variante.
 */
export interface ControlHeroContent {
  eyebrow: string
  verdictLabel: string
  // Pozo del veredicto — shape proyección (holgado/ajustado/corto).
  wellLabel: string
  amount: string
  amountChipLabel: string
  amountChipDir: 'up' | 'down'
  // Subtítulo rico "Hoy tenés <b>$2,45M</b> · <acento>frase</acento>".
  todayPrefix: string
  todayAmount: string
  todayPhrase: string
  // Fila RITMO / CUPO / QUEDAN.
  stats: ControlHeroStats
  // Timeline INICIO → HOY → PRÓX. SUELDO.
  progressPct: number
  timelineLabels: ControlHeroTimelineLabels
  // Pie rico "Sobra <b>$1,4M</b> — dale un destino" + CTA.
  footerText: string
  footerStrong: string
  footerSuffix: string
  ctaLabel: string
  // primerCiclo.
  emptyTitle: string
  emptyBody: string
  emptyPlaceholder: string
}

export const CONTROL_HERO_CONTENT: Record<ControlHeroVariant, ControlHeroContent> = {
  holgado: {
    eyebrow: 'HASTA CUÁNDO TE ALCANZA',
    verdictLabel: 'Holgado',
    wellLabel: 'TE ALCANZA — SOBRA AL CIERRE',
    amount: '+$1,4M',
    amountChipLabel: 'al día 30',
    amountChipDir: 'up',
    todayPrefix: 'Hoy tenés ',
    todayAmount: '$2,45M',
    todayPhrase: 'te alcanza con margen',
    stats: {
      ritmo: { label: 'RITMO', value: '$124k', sub: 'por día' },
      cupo: { label: 'CUPO', value: '$135k', sub: 'libre/día' },
      quedan: { label: 'QUEDAN', value: '12 días', sub: 'al cobro' },
    },
    progressPct: 60,
    timelineLabels: { start: 'INICIO', today: 'HOY', end: 'PRÓX. SUELDO' },
    footerText: 'Sobra ',
    footerStrong: '$1,4M',
    footerSuffix: ' — dale un destino',
    ctaLabel: 'Mover a la meta',
    emptyTitle: '',
    emptyBody: '',
    emptyPlaceholder: '',
  },
  ajustado: {
    eyebrow: 'HASTA CUÁNDO TE ALCANZA',
    verdictLabel: 'Ajustado',
    wellLabel: 'TE ALCANZA — SOBRA AL CIERRE',
    amount: '+$180k',
    amountChipLabel: 'al día 30',
    amountChipDir: 'up',
    todayPrefix: 'Hoy tenés ',
    todayAmount: '$2,05M',
    todayPhrase: 'vas justo, casi sin margen',
    stats: {
      ritmo: { label: 'RITMO', value: '$132k', sub: 'por día' },
      cupo: { label: 'CUPO', value: '$135k', sub: 'libre/día' },
      quedan: { label: 'QUEDAN', value: '12 días', sub: 'al cobro' },
    },
    progressPct: 60,
    timelineLabels: { start: 'INICIO', today: 'HOY', end: 'PRÓX. SUELDO' },
    footerText: 'Margen chico — ',
    footerStrong: 'cuidá los próximos días',
    footerSuffix: '',
    ctaLabel: 'En qué recortar',
    emptyTitle: '',
    emptyBody: '',
    emptyPlaceholder: '',
  },
  corto: {
    eyebrow: 'HASTA CUÁNDO TE ALCANZA',
    verdictLabel: 'En rojo',
    wellLabel: 'VAS A QUEDAR CORTO POR',
    amount: '$320k',
    amountChipLabel: 'faltante',
    amountChipDir: 'down',
    todayPrefix: 'Hoy tenés ',
    todayAmount: '$1,42M',
    todayPhrase: 'no llegás a fin de ciclo',
    stats: {
      ritmo: { label: 'RITMO', value: '$156k', sub: 'por día' },
      cupo: { label: 'CUPO', value: '$135k', sub: 'libre/día' },
      quedan: { label: 'QUEDAN', value: '12 días', sub: 'al cobro' },
    },
    progressPct: 60,
    timelineLabels: { start: 'INICIO', today: 'HOY', end: 'PRÓX. SUELDO' },
    footerText: 'Te faltan ',
    footerStrong: '$320k',
    footerSuffix: ' para cerrar',
    ctaLabel: 'Dónde ajustar',
    emptyTitle: '',
    emptyBody: '',
    emptyPlaceholder: '',
  },
  primerCiclo: {
    eyebrow: 'HASTA CUÁNDO TE ALCANZA',
    verdictLabel: 'Sin datos aún',
    wellLabel: '',
    amount: '',
    amountChipLabel: '',
    amountChipDir: 'up',
    todayPrefix: '',
    todayAmount: '',
    todayPhrase: '',
    stats: {
      ritmo: { label: '', value: '', sub: '' },
      cupo: { label: '', value: '', sub: '' },
      quedan: { label: '', value: '', sub: '' },
    },
    progressPct: 0,
    timelineLabels: { start: '', today: '', end: '' },
    footerText: '',
    footerStrong: '',
    footerSuffix: '',
    ctaLabel: '',
    emptyTitle: 'Todavía no sé si te alcanza.',
    emptyBody: 'Registrá unos días de gastos y te muestro con cuánto cerrás el ciclo.',
    emptyPlaceholder: 'Tu aterrizaje del ciclo va a aparecer acá 🌱',
  },
}

/** Mismo criterio que `withHeroDefaults` de Fijos: `??` explícito campo
 *  por campo (un override `''`/`0` real no se confunde con "no vino").
 *  `stats`/`timelineLabels` se pisan como objeto entero. */
export function withControlHeroDefaults(
  variant: ControlHeroVariant,
  overrides: Partial<ControlHeroContent>,
): ControlHeroContent {
  const d = CONTROL_HERO_CONTENT[variant]
  return {
    eyebrow: overrides.eyebrow ?? d.eyebrow,
    verdictLabel: overrides.verdictLabel ?? d.verdictLabel,
    wellLabel: overrides.wellLabel ?? d.wellLabel,
    amount: overrides.amount ?? d.amount,
    amountChipLabel: overrides.amountChipLabel ?? d.amountChipLabel,
    amountChipDir: overrides.amountChipDir ?? d.amountChipDir,
    todayPrefix: overrides.todayPrefix ?? d.todayPrefix,
    todayAmount: overrides.todayAmount ?? d.todayAmount,
    todayPhrase: overrides.todayPhrase ?? d.todayPhrase,
    stats: overrides.stats ?? d.stats,
    progressPct: overrides.progressPct ?? d.progressPct,
    timelineLabels: overrides.timelineLabels ?? d.timelineLabels,
    footerText: overrides.footerText ?? d.footerText,
    footerStrong: overrides.footerStrong ?? d.footerStrong,
    footerSuffix: overrides.footerSuffix ?? d.footerSuffix,
    ctaLabel: overrides.ctaLabel ?? d.ctaLabel,
    emptyTitle: overrides.emptyTitle ?? d.emptyTitle,
    emptyBody: overrides.emptyBody ?? d.emptyBody,
    emptyPlaceholder: overrides.emptyPlaceholder ?? d.emptyPlaceholder,
  }
}

// ─── Íconos (transcritos del markup) ──────────────────────────────────

/** Check del pill "Holgado" (10×10, stroke 3.2 — línea 5860). */
function CheckGlyph({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 13l4 4L19 7" />
    </Svg>
  )
}

/** Triángulo de warning de "Ajustado"/"En rojo" — paths de la tanda HC,
 *  dibujado a 10px (escala del layout final; ver docblock). */
function WarnGlyph({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3.5l8.5 15H3.5z" />
      <Path d="M12 9v4" />
    </Svg>
  )
}

/** Flecha del chip del monto: ↗ ("al día 30") / ↘ ("faltante"). */
function TrendArrowGlyph({ color, dir }: { color: string; dir: 'up' | 'down' }) {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d={dir === 'up' ? 'M6 18L18 6M9 6h9v9' : 'M18 6L6 18M15 18H6V9'} />
    </Svg>
  )
}

/** Chevron del CTA del pie (12×12, stroke 3). */
function ChevronGlyph({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  )
}

// ─── Componente ───────────────────────────────────────────────────────

export interface ControlHeroProps extends Partial<ControlHeroContent> {
  mode: ControlMode
  /** holgado (default) · ajustado · corto (HC-C "en rojo") · primerCiclo.
   *  Cada variante trae sus defaults literales del handoff — pasá campos
   *  de `ControlHeroContent` solo para pisar un valor puntual. */
  variant?: ControlHeroVariant
  /** false = sin loops decorativos (dot/knob/Brot) ni entering del fill. */
  animated?: boolean
  /** Pausa las partículas del hero (tab sin foco, mismo convenio que
   *  Fijos/Gastos/Home). */
  paused?: boolean
  /** CTA del pie ("Mover a la meta" / "En qué recortar" / "Dónde ajustar"). */
  onPressCta?: () => void
}

function HeroStatCell({ stat }: { stat: ControlHeroStat }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{stat.label}</Text>
      <Text style={styles.statValue}>{stat.value}</Text>
      <Text style={styles.statSub}>{stat.sub}</Text>
    </View>
  )
}

export const ControlHero = memo(function ControlHero(props: ControlHeroProps) {
  const { mode, paused = false, animated = true, onPressCta } = props
  const variant = props.variant ?? 'holgado'
  const s = CONTROL_SPEC[mode]
  const pal = HERO_PALETTE[variant]
  const c = withControlHeroDefaults(variant, props)
  const ctaPress = usePressScale({ pressedScale: 0.96 })
  const pct = Math.max(0, Math.min(100, c.progressPct))
  const icon = VERDICT_ICON[variant]

  const verdict =
    variant === 'primerCiclo' ? (
      <View style={styles.emptyBadge}>
        <Text style={styles.emptyBadgeLabel}>{c.verdictLabel}</Text>
      </View>
    ) : (
      <View style={[styles.verdictPill, { backgroundColor: pal.pillBg }]}>
        {icon === 'check' ? <CheckGlyph color={pal.pillInk} /> : <WarnGlyph color={pal.pillInk} />}
        <Text style={[styles.verdictPillLabel, { color: pal.pillInk }]}>{c.verdictLabel}</Text>
      </View>
    )

  const ctaBody = (
    <View style={[styles.footerCta, { backgroundColor: pal.pillBg }]}>
      <Text style={[styles.footerCtaLabel, { color: pal.pillInk }]}>{c.ctaLabel}</Text>
      <ChevronGlyph color={pal.pillInk} />
    </View>
  )

  const emptyBody = (
    <>
      <View style={[styles.emptyWell, { backgroundColor: pal.wellBg }]}>
        <BrotMascot pose={HERO_BROT_POSE[variant]} size={80} shadow={false} animated={animated} />
        <View style={styles.emptyTexts}>
          <Text style={styles.emptyTitle}>{c.emptyTitle}</Text>
          <Text style={styles.emptyBody}>{c.emptyBody}</Text>
        </View>
      </View>
      <View style={styles.emptyPlaceholder}>
        <Text style={styles.emptyPlaceholderLabel}>{c.emptyPlaceholder}</Text>
      </View>
    </>
  )

  const projectionBody = (
    <>
      <View style={[styles.well, { backgroundColor: pal.wellBg }]}>
        <View style={styles.wellLeft}>
          <Text style={styles.wellLabel}>{c.wellLabel}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amount}>{c.amount}</Text>
            <View style={[styles.amountChip, { backgroundColor: pal.pillBg }]}>
              <TrendArrowGlyph color={pal.pillInk} dir={c.amountChipDir} />
              <Text style={[styles.amountChipLabel, { color: pal.pillInk }]}>{c.amountChipLabel}</Text>
            </View>
          </View>
          <Text style={styles.wellSub}>
            {c.todayPrefix}
            <Text style={[styles.wellSubStrong, { color: pal.strongInk }]}>{c.todayAmount}</Text>
            {' · '}
            <Text style={[styles.wellSubStrong, { color: pal.accent }]}>{c.todayPhrase}</Text>
          </Text>
        </View>
        <View style={styles.brotSlot}>
          <View style={styles.brotHalo} />
          <BrotMascot pose={HERO_BROT_POSE[variant]} size={76} shadow={false} animated={animated} />
        </View>
      </View>
      <View style={styles.statsRow}>
        <HeroStatCell stat={c.stats.ritmo} />
        <HeroStatCell stat={c.stats.cupo} />
        <HeroStatCell stat={c.stats.quedan} />
      </View>
      <View style={styles.timelineWrap}>
        <View style={styles.timelineTrack}>
          <View pointerEvents="none" style={styles.timelineDashRow}>
            {TRACK_SEGMENTS.map((i) => (
              <View key={i} style={styles.timelineDash} />
            ))}
          </View>
          <GrowView
            axis="x"
            duration={decorativeDurations.growBar}
            delay={250}
            skipEntering={!animated}
            style={[styles.timelineFill, { width: `${pct}%`, backgroundColor: pal.fill }]}
          />
          <View style={[styles.timelineKnob, { left: `${pct}%` }]}>
            <CtlKnob animated={animated} color={pal.knob} glowColor={pal.accent} size={14} />
          </View>
        </View>
        <View style={styles.timelineLabelsRow}>
          <Text style={styles.timelineSideLabel}>{c.timelineLabels.start}</Text>
          <Text style={[styles.timelineTodayLabel, { color: pal.strongInk }]}>{c.timelineLabels.today}</Text>
          <Text style={styles.timelineSideLabel}>{c.timelineLabels.end}</Text>
        </View>
      </View>
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          {c.footerText}
          <Text style={[styles.footerStrong, { color: pal.strongInk }]}>{c.footerStrong}</Text>
          {c.footerSuffix}
        </Text>
        {onPressCta ? (
          <AnimatedPressable
            accessibilityLabel={c.ctaLabel}
            accessibilityRole="button"
            hitSlop={6}
            onPress={onPressCta}
            onPressIn={ctaPress.onPressIn}
            onPressOut={ctaPress.onPressOut}
            style={ctaPress.animatedStyle}
          >
            {ctaBody}
          </AnimatedPressable>
        ) : (
          ctaBody
        )}
      </View>
    </>
  )

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: pal.gradientFallback,
          experimental_backgroundImage: pal.gradientCss,
          boxShadow: s.heroShadow,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.heroParticles}>
        <BrotParticles colors={pal.particles} count={10} borderRadius={CONTROL_RADII.hero} animated={!paused} />
      </View>
      <View style={styles.heroContent}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowLeft}>
            <CtlGlowDot animated={animated} color={pal.dot} size={8} />
            <Text numberOfLines={1} style={styles.eyebrowLabel}>
              {c.eyebrow}
            </Text>
          </View>
          {verdict}
        </View>
        {variant === 'primerCiclo' ? emptyBody : projectionBody}
      </View>
    </View>
  )
})

// El markup pone `overflow:hidden` en la card entera; acá recorta SOLO la
// capa de partículas (mismo criterio que el hero de Fijos): Brot dibuja
// tinta fuera de su caja de layout y la card no debe recortarla.
const styles = StyleSheet.create({
  hero: {
    borderRadius: CONTROL_RADII.hero,
    paddingBottom: 14,
    paddingHorizontal: 15,
    paddingTop: 15,
    position: 'relative',
  },
  heroParticles: {
    borderRadius: CONTROL_RADII.hero,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  heroContent: {
    position: 'relative',
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrowLeft: {
    alignItems: 'center',
    columnGap: 7,
    flexDirection: 'row',
    flexShrink: 1,
    marginRight: 8,
  },
  eyebrowLabel: {
    color: 'rgba(240,248,230,0.85)',
    flexShrink: 1,
    fontFamily: nunitoFamily('800'),
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 10.5 * 0.13,
  },
  // Pill del hero — NO es la primitiva VerdictPill (ver docblock).
  verdictPill: {
    alignItems: 'center',
    borderRadius: CONTROL_RADII.verdictPill,
    columnGap: 4,
    flexDirection: 'row',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  verdictPillLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 10,
    fontWeight: '900',
  },
  emptyBadge: {
    backgroundColor: 'rgba(233,251,220,0.55)',
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  emptyBadgeLabel: {
    color: '#173A20',
    fontFamily: nunitoFamily('900'),
    fontSize: 10.5,
    fontWeight: '900',
  },
  well: {
    alignItems: 'stretch',
    borderRadius: CONTROL_RADII.heroWell,
    boxShadow: WELL_INSET,
    columnGap: 11,
    flexDirection: 'row',
    marginTop: 13,
    paddingBottom: 13,
    paddingHorizontal: 15,
    paddingTop: 14,
  },
  wellLeft: {
    flex: 1,
    minWidth: 0,
  },
  wellLabel: {
    color: 'rgba(240,248,230,0.72)',
    fontFamily: nunitoFamily('800'),
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 10 * 0.1,
  },
  amountRow: {
    alignItems: 'baseline',
    columnGap: 7,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  amount: {
    color: '#F7F4E4',
    fontFamily: nunitoFamily('900'),
    fontSize: 37,
    fontWeight: '900',
    letterSpacing: 37 * -0.02,
    // Headroom sobre el fontSize: en iOS la baseline queda a
    // `lineHeight − descent` del tope, y Nunito 900 pide 0.705em de alto de
    // caja alta (0.829em para el `$`). Con `lineHeight == fontSize` el signo y
    // las cifras salían rebanados arriba.
    lineHeight: 37 * 1.2,
  },
  amountChip: {
    alignItems: 'center',
    borderRadius: CONTROL_RADII.heroAmountChip,
    columnGap: 3,
    flexDirection: 'row',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  amountChipLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 10.5,
    fontWeight: '900',
  },
  wellSub: {
    color: 'rgba(240,248,230,0.74)',
    fontFamily: nunitoFamily('700'),
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 11 * 1.4,
    marginTop: 7,
  },
  wellSubStrong: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  brotSlot: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
    width: 78,
  },
  brotHalo: {
    borderRadius: 37,
    bottom: 8,
    experimental_backgroundImage: HALO_CSS,
    height: 74,
    left: '50%',
    marginLeft: -37,
    position: 'absolute',
    width: 74,
  },
  statsRow: {
    columnGap: 9,
    flexDirection: 'row',
    marginTop: 11,
  },
  statCell: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: CONTROL_RADII.heroCell,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  statLabel: {
    color: 'rgba(240,248,230,0.7)',
    fontFamily: nunitoFamily('900'),
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 8.5 * 0.06,
  },
  statValue: {
    color: '#F7F4E4',
    fontFamily: nunitoFamily('900'),
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 14 * 1.2,
    marginTop: 2,
  },
  statSub: {
    color: 'rgba(240,248,230,0.6)',
    fontFamily: nunitoFamily('700'),
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  timelineWrap: {
    marginTop: 13,
  },
  timelineTrack: {
    height: 15,
    position: 'relative',
  },
  timelineDashRow: {
    columnGap: 6,
    flexDirection: 'row',
    height: 4,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 6,
  },
  timelineDash: {
    backgroundColor: 'rgba(240,248,230,0.5)',
    borderRadius: 2,
    height: 4,
    width: 6,
  },
  timelineFill: {
    borderRadius: 2,
    height: 4,
    left: 0,
    position: 'absolute',
    top: 6,
  },
  timelineKnob: {
    marginLeft: -7,
    position: 'absolute',
    top: -1,
  },
  timelineLabelsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  timelineSideLabel: {
    color: 'rgba(240,248,230,0.68)',
    fontFamily: nunitoFamily('900'),
    fontSize: 9,
    fontWeight: '900',
  },
  timelineTodayLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 9,
    fontWeight: '900',
  },
  footerRow: {
    alignItems: 'center',
    borderTopColor: 'rgba(240,248,230,0.22)',
    borderTopWidth: 1.5,
    columnGap: 9,
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 11,
  },
  footerText: {
    color: 'rgba(240,248,230,0.9)',
    flex: 1,
    fontFamily: nunitoFamily('800'),
    fontSize: 11.5,
    fontWeight: '800',
  },
  footerStrong: {
    fontFamily: nunitoFamily('900'),
    fontWeight: '900',
  },
  footerCta: {
    alignItems: 'center',
    borderRadius: CONTROL_RADII.heroCta,
    columnGap: 4,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  footerCtaLabel: {
    fontFamily: nunitoFamily('900'),
    fontSize: 11,
    fontWeight: '900',
  },
  // primerCiclo — internos a escala de HC-D (ver docblock).
  emptyWell: {
    alignItems: 'center',
    borderRadius: CONTROL_RADII.heroWell,
    boxShadow: WELL_INSET,
    columnGap: 12,
    flexDirection: 'row',
    marginTop: 13,
    padding: 16,
  },
  emptyTexts: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    color: '#F7F4E4',
    fontFamily: nunitoFamily('900'),
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 17 * 1.25,
  },
  emptyBody: {
    color: 'rgba(240,248,230,0.75)',
    fontFamily: nunitoFamily('700'),
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 11.5 * 1.4,
    marginTop: 5,
  },
  emptyPlaceholder: {
    borderColor: 'rgba(240,248,230,0.32)',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 2,
    marginTop: 14,
    padding: 11,
  },
  emptyPlaceholderLabel: {
    color: 'rgba(240,248,230,0.7)',
    fontFamily: nunitoFamily('800'),
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
})
