// @i18n-ignore-file — kit de rediseño bajo gate; copy literal, i18n en el pase posterior
/**
 * CIERRE DE SEMANA — réplica del handoff `jardin 2026-08`
 * (`design/jardin-2026-08/Jardín Rediseño.dc.html`:624–1073, las 4 variantes
 * × claro/oscuro con sus fichas técnicas).
 *
 * Las cuatro variantes comparten UNA estructura y difieren en superficie,
 * pose de Brot, fila de días y card extra:
 *
 *   kicker "CIERRE DE SEMANA" (11.5/800 ls 0.22em)
 *   → título 37px (perfecta) / 31px (resto)
 *   → chip de resultado
 *   → Brot 122 (perfecta) / 116 + halo
 *   → fila de 7 días
 *   → card con 3 tiles de stats
 *   → card extra (logro desbloqueado / próximo logro / coach)
 *   → CTA + link secundario
 *
 * | Variante   | Superficie                 | Brot    | Fila de 7        | Card extra        |
 * |------------|----------------------------|---------|------------------|-------------------|
 * | `perfecta` | verde full-bleed + partíc. | `cheer` | mini-Brots 34    | ¡LOGRO DESBLOQ.!  |
 * | `buena`    | `neoTokens.bg`             | `love`  | tiles 38 inset   | PRÓXIMO LOGRO     |
 * | `floja`    | `neoTokens.bg`             | `think` | tiles 38 inset   | coach (Brot 46)   |
 * | `cortada`  | `neoTokens.bg`             | `sad`   | tiles 38 inset   | coach (Brot 46)   |
 *
 * ─────────────────────────────────────────────────────────────────────
 * DECISIONES (las que el código no muestra)
 * ─────────────────────────────────────────────────────────────────────
 *
 *  [OWNER-1] Copy en tuteo neutro: los dos coach del handoff vienen en voseo
 *      ("Volvé mañana", "Plantá hoy y arrancá de nuevo") y acá salen
 *      neutralizados. Ver §2·D1 del plan.
 *
 *  [OWNER-2] Las tres variantes neutras se paran sobre `neoTokens(mode).bg`,
 *      no sobre el `#EEEDE9`/`#16271C` del handoff, y sus cards raised usan
 *      `raisedGradientCss` + `shadows.raisedLg` (la base clara del handoff,
 *      `rgba(166,162,152,…)`, ya está rebasada en `jardin-spec`). La
 *      PERFECTA sí conserva su fondo propio: es full-bleed y es el punto del
 *      diseño.
 *
 *  [OWNER-3] La medalla del logro desbloqueado sale de `MedalVM`
 *      (`@/features/achievements/achievement-progress`), que es quien decide
 *      Brot vs `FilledAchievementIcon`. Acá NO se vuelve a decidir nada.
 *
 *  [OWNER-4] Piezas propias (no existen en el handoff): el tile del **día en
 *      calma** (Brot `zen` + pozo `calmaWell` + borde `calmaRing`), el del
 *      **día recuperado** (Brot `seed` + coral `recoveredInk`) y la línea
 *      "N días en calma" bajo la fila, que aparece con `calmDays > 0`.
 *
 *  [P1] Partículas de la perfecta: el mockup pide `count=34` y la matriz ⑥ del
 *      mismo handoff pide "≤12". Se usa el preset que el sistema YA tiene para
 *      esta pantalla —`weekCloseLight` en claro, `celebrationDark` en oscuro,
 *      count 22— cuyos colores son exactamente los del mockup por tema y que
 *      es el que corre hoy en `week-close-celebration`. Con reduced motion el
 *      count baja a 0 (T3 Step 6).
 *
 *  [P2] Chrome dibujado (status bar + home indicator) como en el resto del
 *      kit (`gastos-screen`), leído de `HOME_SPEC`. Sobre el verde full-bleed
 *      se fuerza la rama oscura para que la tinta sea crema en los dos temas;
 *      el handoff usa ahí `#F5F2E1` y el sistema `#F1EEDD` — cuatro unidades
 *      en un blanco roto de un chrome que en vivo lo dibuja el SO.
 *
 *  [P3] El cuerpo va dentro de un `ScrollView` centrado (`flexGrow:1` +
 *      `justifyContent:'center'`). El mockup mide 830px de alto: en un
 *      teléfono chico la composición no entra y sin scroll el CTA quedaría
 *      fuera de alcance. En pantallas altas el resultado es idéntico al
 *      mockup (centrado); el CTA vive FUERA del scroll, siempre visible.
 *
 *  [P4] Ningún contenedor de un Brot lleva `overflow:'hidden'` —la tinta
 *      sobresale `BROT_INK_BLEED_TOP` unidades de viewBox—: ni los tiles de
 *      38, ni el disco de la medalla, ni la card del coach. El único clip del
 *      archivo envuelve SÓLO al `FilledAchievementIcon` (que trae su cuadrado
 *      forest y necesita recorte a círculo) y a la barra de progreso.
 *
 * El copy y los números son los del mockup (contenido demo real, "Fidelity:
 * hifi" del README) salvo el logro desbloqueado y el próximo logro: el
 * handoff usa "Jardín de 50" y "Racha de 30", que no existen en el catálogo
 * real de 18 códigos (§4 del plan), así que el demo usa códigos verdaderos
 * con su copy del bundle.
 */
import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  FilledAchievementIcon,
  hasFilledAchievementIcon,
} from '@/components/achievements/achievement-icon-filled'
import {
  BROT_INK_BLEED_TOP,
  BROT_VIEWBOX_H,
  BrotMascot,
  BrotParticles,
  type BrotPose,
} from '@/components/brot'
import { RiseView } from '@/components/home/animated/rise-view'
import { HomeStatusBar } from '@/components/redesign/home/home-screen'
import { HOME_SPEC } from '@/components/redesign/home/home-spec'
import {
  JARDIN_GEOMETRY,
  JARDIN_SPEC,
  type JardinSpec,
} from '@/components/redesign/jardin/jardin-spec'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import type { MedalVM } from '@/features/achievements/achievement-progress'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cssGradient, neoParticlePresets, neoTokens } from '@/theme/neo-tokens'
import type { ResolvedThemeMode } from '@/theme/palette'
import { glowSafeTextShadow } from '@/theme/text-glow'
import { nunitoFamily, safeLineHeight } from '@/theme/typography'

// Press-feedback del kit: mismo patrón que gastos/home (usePressScale +
// AnimatedPressable a nivel módulo). En reposo el visual es idéntico al mockup.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// ─── Contrato (§5 del plan) ──────────────────────────────────────────
//
// `WeekCloseVariant` y `CierreVM` viven ACÁ porque este archivo es el que
// dibuja el cierre; `MedalVM` NO se redefine —ya es público en
// `achievement-progress`, que además es quien resuelve la rama por código.

export type WeekCloseVariant = 'perfecta' | 'buena' | 'floja' | 'cortada'

/**
 * Estado de un día en la fila del cierre. Es una vista CERRADA de la semana
 * (ya pasó), por eso no tiene ni `today` ni `future` como `DayRingState` del
 * jardín vivo: `seed` es el día que quedó sin plantar pero todavía no cerró
 * el ciclo del hábito (el domingo de la variante cortada, HTML:998).
 */
export type CierreDayState = 'logged' | 'calma' | 'recovered' | 'missed' | 'seed'

export interface CierreDayVM {
  letter: string
  state: CierreDayState
}

export interface CierreVM {
  variant: WeekCloseVariant
  title: string
  /** "Semana perfecta · 7 de 7 días". Ver `splitChip()` para el separador. */
  chipText: string
  days: CierreDayVM[]
  stats: Array<{ value: string; label: string }>
  /** Días en calma de la semana (D4). Con `> 0` aparece la línea bajo la fila. */
  calmDays?: number
  unlocked?: { code: string; title: string; body: string; medal: MedalVM }
  nextGoal?: { title: string; current: number; target: number }
  coach?: string
  cta: { text: string; onPress: () => void }
  secondary: { text: string; onPress: () => void }
}

// ─── Tipografía y ritmo de la réplica ────────────────────────────────

/** `letter-spacing` del handoff en em × su `font-size`, ya en px. */
const LS_KICKER = 11.5 * 0.22
const LS_CARD_KICKER = 9.5 * 0.12
const LS_STAT_LABEL = 9 * 0.1

/** Entrada de vista de la matriz ⑥: cards stagger 60ms, fade + rise 12px. */
const ENTRY_STAGGER_MS = 60
const ENTRY_RISE = 12
const enterDelay = (step: number) => step * ENTRY_STAGGER_MS

/**
 * Partículas por tema: los colores son los del mockup (claro
 * `#C9F3C6,#FBD9BC,#EFF6E2` · oscuro `#A4E3A6,#F2A87E,#F1EEDD`) y el count el
 * del sistema. Ver [P1].
 */
const CIERRE_PARTICLES = {
  light: neoParticlePresets.weekCloseLight,
  dark: neoParticlePresets.celebrationDark,
} as const

// ─── Tabla de poses (nadie más decide poses) ─────────────────────────

const HERO_POSE: Record<WeekCloseVariant, BrotPose> = {
  perfecta: 'cheer',
  buena: 'love',
  floja: 'think',
  cortada: 'sad',
}

/**
 * Día de la fila. En la perfecta el handoff festeja con `cheer` los siete,
 * pero la identidad del día en calma y del recuperado manda igual: son
 * permanentes y viven en las TRES superficies donde vive un día (D4·1), así
 * que un `zen` en una semana perfecta se sigue viendo `zen`.
 */
function poseForDay(state: CierreDayState, celebrating: boolean): BrotPose {
  switch (state) {
    case 'calma':
      return 'zen'
    case 'recovered':
    case 'seed':
      return 'seed'
    case 'missed':
      return 'wilted'
    default:
      return celebrating ? 'cheer' : 'idle'
  }
}

/** Centrado ÓPTICO de un Brot dentro de un disco: la caja de layout no
 *  contiene el dibujo, que sobresale `BROT_INK_BLEED_TOP` unidades arriba. */
function brotOpticalOffset(size: number): number {
  return (BROT_INK_BLEED_TOP / 2) * (size / BROT_VIEWBOX_H)
}

/**
 * El chip llega como UN string y el mockup lo dibuja partido por el
 * separador `·`: sobre el verde, la primera mitad va en el verde claro de
 * acento y la segunda en crema, con el punto medio convertido en dot. Sin
 * separador se pinta entero como acento.
 */
function splitChip(text: string): { head: string; tail: string } {
  const at = text.indexOf(' · ')
  if (at < 0) return { head: text, tail: '' }
  return { head: text.slice(0, at), tail: text.slice(at + 3) }
}

function chipDotColor(variant: WeekCloseVariant, s: JardinSpec): string {
  if (variant === 'floja') return s.cierreChipDotFloja
  if (variant === 'cortada') return s.cierreChipDotCortada
  return s.cierreChipDotBuena
}

// ─── Piezas ──────────────────────────────────────────────────────────

/**
 * Halo detrás del Brot protagonista: 196px en la perfecta, 180 en la buena.
 * Floja y cortada NO lo llevan (el handoff no lo dibuja: el nudge está en el
 * coach, no en un aura).
 *
 * Se posiciona con insets EXPLÍCITOS sobre una caja de ancho conocido
 * (`width = halo`), nunca con `left:'50%'`: un inset porcentual no se
 * resuelve contra un padre de ancho indefinido y el halo terminaría pegado a
 * un borde en device.
 */
function BrotZone({
  pose,
  brotSize,
  haloSize,
  haloCss,
}: {
  pose: BrotPose
  brotSize: number
  haloSize: number | null
  haloCss: string | null
}) {
  const width = haloSize ?? brotSize
  return (
    <View style={[styles.brotZone, { width, height: brotSize }]}>
      {haloSize !== null && haloCss !== null ? (
        <View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              width: haloSize,
              height: haloSize,
              borderRadius: haloSize / 2,
              top: (brotSize - haloSize) / 2,
              // `transparent` de fallback: si el radial CSS no está soportado
              // el halo desaparece en vez de dibujar un disco sólido.
              ...cssGradient(haloCss, 'transparent'),
            },
          ]}
        />
      ) : null}
      <BrotMascot pose={pose} size={brotSize} />
    </View>
  )
}

function CierreChip({
  vm,
  s,
  onGreen,
}: {
  vm: CierreVM
  s: JardinSpec
  onGreen: boolean
}) {
  const { head, tail } = splitChip(vm.chipText)

  if (onGreen) {
    return (
      <View
        style={[
          styles.chip,
          styles.chipOnGreen,
          { backgroundColor: s.cierreChipOnGreenBackground, boxShadow: s.cierreChipOnGreenShadow },
        ]}
      >
        <Text style={[styles.chipStrong, { color: s.cierreChipOnGreenAccentInk }]}>{head}</Text>
        {tail ? (
          <>
            <View style={[styles.chipDotSm, { backgroundColor: s.cierreChipOnGreenDot }]} />
            <Text style={[styles.chipSoft, { color: s.cierreChipOnGreenInk }]}>{tail}</Text>
          </>
        ) : null}
      </View>
    )
  }

  return (
    <View
      style={[
        styles.chip,
        styles.chipNeutral,
        {
          backgroundColor: s.cierreChipBackground,
          boxShadow: s.cierreChipShadow,
          borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
          borderColor: s.hairline,
        },
      ]}
    >
      <View style={[styles.chipDotLg, { backgroundColor: chipDotColor(vm.variant, s) }]} />
      <Text style={[styles.chipStrong, { color: s.cierreChipInk }]}>{vm.chipText}</Text>
    </View>
  )
}

/**
 * Fila de 7 días. Dos escalas según la superficie:
 *   · perfecta → mini-Brot 34 suelto sobre el verde (sin tile)
 *   · neutras  → tile 38 hundido, radius 12, Brot 26 apoyado abajo
 *
 * El tile NO clipea (ver [P4]): el Brot de 26 apoyado a 2px del piso saca su
 * tinta ~3px por arriba del tile, y así tiene que verse.
 *
 * Los siete van `animated={false}` en las dos escalas. El prototipo web los
 * anima (su `<brot-mascot>` arranca en loop por default), pero siete canvas de
 * Skia con su propio `useFrameCallback` conviviendo con el Brot protagonista y
 * las partículas es exactamente el patrón que hace janquear la gama baja: la
 * celebración vive en el protagonista, en las partículas y en la entrada
 * escalonada. Mismo criterio que el `DayBrot` de `week-close-celebration`, que
 * es la pantalla que este cierre reemplaza.
 */
function CierreDaysRow({ vm, s, onGreen }: { vm: CierreVM; s: JardinSpec; onGreen: boolean }) {
  const g = JARDIN_GEOMETRY.cierre

  return (
    <View style={[styles.daysRow, onGreen ? styles.daysRowPerfecta : styles.daysRowNeutral]}>
      {vm.days.map((day, i) => {
        const pose = poseForDay(day.state, onGreen)
        const letterInk = onGreen
          ? s.cierreDayLetterOnGreenInk
          : day.state === 'calma'
            ? s.accentInk
            : day.state === 'recovered'
              ? s.recoveredInk
              : s.cierreDayLetterInk

        return (
          <View key={`${day.letter}-${i}`} style={styles.dayCol}>
            {onGreen ? (
              <BrotMascot pose={pose} size={g.miniBrot} shadow={false} animated={false} />
            ) : (
              <View
                style={[
                  styles.dayTile,
                  {
                    width: g.tile,
                    height: g.tile,
                    borderRadius: g.tileRadius,
                    // El día en calma y el recuperado tienen pozo e identidad
                    // propios; el resto comparte el tile neutro del handoff.
                    backgroundColor:
                      day.state === 'calma' ? s.calmaWell : s.cierreDayTileBackground,
                    boxShadow: s.cierreDayTileShadow,
                    borderWidth:
                      day.state === 'calma' || day.state === 'recovered'
                        ? 1.5
                        : SUPPORTS_INSET_SHADOW
                          ? 0
                          : 1,
                    borderColor:
                      day.state === 'calma'
                        ? s.calmaRing
                        : day.state === 'recovered'
                          ? s.recoveredInk
                          : s.hairline,
                  },
                ]}
              >
                <BrotMascot pose={pose} size={g.tileBrot} shadow={false} animated={false} />
              </View>
            )}
            <Text style={[styles.dayLetter, { color: letterInk }]}>{day.letter}</Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── Cards extra ─────────────────────────────────────────────────────

/**
 * Medalla del logro recién ganado. Sólo se llega acá con un logro
 * DESBLOQUEADO, así que las ramas vivas son `brot` e `icon` earned; las otras
 * tres se dibujan como pozo para que el componente sea total (una `MedalVM`
 * nunca puede quedar sin dibujo).
 */
function CierreMedal({
  vm,
  s,
  size,
  brotSize,
}: {
  vm: MedalVM
  s: JardinSpec
  size: number
  brotSize: number
}) {
  const disc = {
    width: size,
    height: size,
    borderRadius: size / 2,
  }

  if (vm.kind === 'brot') {
    return (
      <View
        style={[
          styles.medalDisc,
          disc,
          cssGradient(s.medalGradientCss, s.medalFallback),
          { boxShadow: s.medalShadowCierre },
        ]}
      >
        {/* SIN clip: el disco es el marco, el dibujo puede asomar. */}
        <View style={{ transform: [{ translateY: brotOpticalOffset(brotSize) }] }}>
          <BrotMascot pose={vm.pose} size={brotSize} shadow={false} animated={false} />
        </View>
      </View>
    )
  }

  if (vm.kind === 'icon' && hasFilledAchievementIcon(vm.code)) {
    return (
      <View
        style={[
          styles.medalDisc,
          disc,
          cssGradient(s.medalGradientCss, s.medalFallback),
          { boxShadow: s.medalShadowCierre },
        ]}
      >
        {/* El ÚNICO `overflow:'hidden'` de la medalla, y envuelve sólo al
            ícono: trae su propio cuadrado forest y hay que recortarlo a
            círculo (D3). Un clip en el disco guillotinaría al Brot. */}
        <View style={[styles.medalIconClip, disc]}>
          <FilledAchievementIcon code={vm.code} size={size} earned={vm.earned} />
        </View>
      </View>
    )
  }

  const label = vm.kind === 'progress' ? String(vm.current) : '?'
  return (
    <View
      style={[
        styles.medalDisc,
        disc,
        {
          backgroundColor: s.wellLockedBackground,
          boxShadow: s.wellLockedShadow,
          borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
          borderColor: s.hairline,
        },
      ]}
    >
      <Text style={[styles.medalWellText, { color: s.wellLockedInk }]}>{label}</Text>
    </View>
  )
}

function UnlockedCard({
  unlocked,
  s,
  kicker,
}: {
  unlocked: NonNullable<CierreVM['unlocked']>
  s: JardinSpec
  kicker: string
}) {
  const g = JARDIN_GEOMETRY.cierre
  return (
    <View
      style={[
        styles.extraCard,
        styles.unlockedCard,
        cssGradient(s.cierreUnlockedCardGradientCss, s.cierreUnlockedCardFallback),
        { boxShadow: s.cierreUnlockedCardShadow },
      ]}
    >
      <CierreMedal vm={unlocked.medal} s={s} size={g.medal} brotSize={g.medalBrot} />
      <View style={styles.unlockedTexts}>
        <Text style={[styles.cardKicker, { color: s.cierreUnlockedKickerInk }]}>{kicker}</Text>
        <Text style={[styles.unlockedTitle, { color: s.cierreStatValueInk }]}>{unlocked.title}</Text>
        <Text style={[styles.unlockedBody, { color: s.cardSubInk }]}>{unlocked.body}</Text>
      </View>
    </View>
  )
}

function NextGoalCard({
  nextGoal,
  s,
  raised,
  kicker,
}: {
  nextGoal: NonNullable<CierreVM['nextGoal']>
  s: JardinSpec
  raised: { gradientCss: string; fallback: string; shadow: string }
  kicker: string
}) {
  const pct = nextGoal.target > 0 ? Math.min(1, Math.max(0, nextGoal.current / nextGoal.target)) : 0
  return (
    <View
      style={[
        styles.extraCard,
        styles.nextCard,
        cssGradient(raised.gradientCss, raised.fallback),
        { boxShadow: raised.shadow },
      ]}
    >
      <View style={styles.nextHeaderRow}>
        <Text style={[styles.cardKicker, { color: s.cierreNextKickerInk }]}>{kicker}</Text>
        <Text style={[styles.nextCount, { color: s.cierreNextValueInk }]}>
          {nextGoal.current}/{nextGoal.target}
        </Text>
      </View>
      <Text style={[styles.nextTitle, { color: s.cardTitleInk }]}>{nextGoal.title}</Text>
      <View
        style={[
          styles.progressTrack,
          {
            height: JARDIN_GEOMETRY.progressBar.cierre,
            backgroundColor: s.progressTrackBackground,
            boxShadow: s.progressTrackShadow,
            borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
            borderColor: s.hairline,
          },
        ]}
      >
        {/* Clip permitido: acá adentro no hay ningún Brot, sólo el fill. */}
        <View
          style={[
            styles.progressFill,
            cssGradient(s.progressFillCss, s.progressFillFallback),
            { width: `${pct * 100}%` },
          ]}
        />
      </View>
    </View>
  )
}

function CoachCard({
  text,
  s,
  raised,
}: {
  text: string
  s: JardinSpec
  raised: { gradientCss: string; fallback: string; shadow: string }
}) {
  return (
    <View
      style={[
        styles.extraCard,
        styles.coachCard,
        cssGradient(raised.gradientCss, raised.fallback),
        { boxShadow: raised.shadow },
      ]}
    >
      <BrotMascot pose="coach" size={JARDIN_GEOMETRY.cierre.coachBrot} shadow={false} />
      <Text style={[styles.coachText, { color: s.cierreCoachInk }]}>{text}</Text>
    </View>
  )
}

// ─── CTA ─────────────────────────────────────────────────────────────

function CierreCta({
  label,
  ink,
  gradientCss,
  fallback,
  shadow,
  onPress,
}: {
  label: string
  ink: string
  gradientCss: string
  fallback: string
  shadow: string
  onPress: () => void
}) {
  const press = usePressScale()
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[styles.cta, cssGradient(gradientCss, fallback), { boxShadow: shadow }, press.animatedStyle]}
    >
      <Text style={[styles.ctaText, { color: ink }]}>{label}</Text>
    </AnimatedPressable>
  )
}

// ─── Vista ───────────────────────────────────────────────────────────

/**
 * El copy FIJO de la vista (el variable ya viaja en el `CierreVM`). Son props
 * con default al literal del handoff: el kit se mira en el preview del gate sin
 * i18n, y el cableado live los pasa traducidos (T12).
 */
export interface CierreCopy {
  kicker: string
  unlockedKicker: string
  nextKicker: string
  /** Línea "N días en calma", ya PLURALIZADA por el llamador (el kit no
   *  conjuga). `undefined` ⇒ el kit arma la suya con el literal del handoff. */
  calmDaysText?: string
}

const CIERRE_COPY_DEFAULT = {
  kicker: 'CIERRE DE SEMANA',
  unlockedKicker: '¡LOGRO DESBLOQUEADO!',
  nextKicker: 'PRÓXIMO LOGRO',
} as const

export interface CierreSemanaViewProps {
  mode: ResolvedThemeMode
  vm: CierreVM
  copy?: Partial<CierreCopy>
  /**
   * Chrome DIBUJADO del mockup (status bar "9:41" + home indicator). `true` en
   * el preview del gate, que es donde la réplica tiene que verse como el
   * teléfono del handoff ([P2]); el cableado live lo apaga y en su lugar se
   * respetan los insets reales del dispositivo — el SO ya dibuja los suyos y
   * dos status bars encimadas serían una mentira en pantalla.
   */
  chrome?: boolean
}

export function CierreSemanaView({
  mode,
  vm,
  copy: copyProp,
  chrome: drawChrome = true,
}: CierreSemanaViewProps) {
  const copy = { ...CIERRE_COPY_DEFAULT, ...copyProp }
  const s = JARDIN_SPEC[mode]
  const neo = neoTokens(mode)
  const reduceMotion = useReducedMotion()
  const insets = useSafeAreaInsets()
  const g = JARDIN_GEOMETRY.cierre

  /** La perfecta es la única que pinta su propia superficie: verde en los dos
   *  temas. Todo lo que se apoye encima cambia de tinta con este flag. */
  const onGreen = vm.variant === 'perfecta'
  const chrome = HOME_SPEC[onGreen ? 'dark' : mode]
  const particles = CIERRE_PARTICLES[mode]

  /** Card raised del sistema — el fill y la sombra de las cards neutras. */
  const raised = {
    gradientCss: neo.raisedGradientCss,
    fallback: neo.surface,
    shadow: neo.shadows.raisedLg,
  }

  const statTile = onGreen
    ? { background: s.cierreStatTileBackground, shadow: s.cierreStatTileShadow, radius: 18 }
    : {
        background: s.cierreStatTileNeutralBackground,
        shadow: s.cierreStatTileNeutralShadow,
        radius: 16,
      }

  const calmDays = vm.calmDays ?? 0

  return (
    <View
      style={[
        styles.shell,
        onGreen
          ? cssGradient(s.cierrePerfectaBgCss, s.cierrePerfectaBgFallback)
          : { backgroundColor: neo.bg },
      ]}
    >
      {onGreen ? (
        // Capa de partículas: overlay propio, nunca la superficie con sombra.
        // `BrotParticles` se auto-gatea por foco y por reduced motion; el
        // count 0 además saca el dibujo entero (T3 Step 6).
        <View style={styles.particles} pointerEvents="none">
          <BrotParticles colors={particles.colors} count={reduceMotion ? 0 : particles.count} />
        </View>
      ) : null}

      {drawChrome ? (
        <HomeStatusBar mode={onGreen ? 'dark' : mode} />
      ) : (
        // Live: el aire de arriba lo manda el notch real. El mismo
        // `paddingTop: 18` del chrome dibujado sirve de piso en pantallas sin
        // inset (Android viejo), para que el kicker no arranque pegado.
        <View style={{ height: Math.max(insets.top, 18) }} />
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.body,
          { paddingHorizontal: onGreen ? 30 : 26 },
        ]}
      >
        <RiseView delay={enterDelay(0)} translateY={ENTRY_RISE}>
          <Text
            style={[
              styles.kicker,
              { color: onGreen ? s.cierreKickerOnGreenInk : s.cierreKickerInk },
            ]}
          >
            {copy.kicker}
          </Text>
        </RiseView>

        <RiseView delay={enterDelay(1)} translateY={ENTRY_RISE}>
          <Text
            style={[
              onGreen ? styles.titlePerfecta : styles.title,
              onGreen
                ? [
                    { color: s.cierreTitleOnGreenInk },
                    glowSafeTextShadow({
                      color: s.cierreTitleShadowColor,
                      offset: s.cierreTitleShadowOffset,
                      radius: s.cierreTitleShadowRadius,
                    }),
                  ]
                : { color: s.cierreTitleInk },
            ]}
          >
            {vm.title}
          </Text>
        </RiseView>

        <RiseView delay={enterDelay(2)} translateY={ENTRY_RISE}>
          <CierreChip vm={vm} s={s} onGreen={onGreen} />
        </RiseView>

        <RiseView
          delay={enterDelay(3)}
          translateY={ENTRY_RISE}
          style={onGreen ? styles.brotSpacingPerfecta : styles.brotSpacing}
        >
          <BrotZone
            pose={HERO_POSE[vm.variant]}
            brotSize={onGreen ? g.brotPerfecta : g.brot}
            haloSize={onGreen ? g.haloPerfecta : vm.variant === 'buena' ? g.halo : null}
            haloCss={
              onGreen
                ? s.cierreHaloPerfectaCss
                : vm.variant === 'buena'
                  ? s.cierreHaloCss
                  : null
            }
          />
        </RiseView>

        <RiseView
          delay={enterDelay(4)}
          translateY={ENTRY_RISE}
          style={onGreen ? styles.daysSpacingPerfecta : styles.daysSpacing}
        >
          <CierreDaysRow vm={vm} s={s} onGreen={onGreen} />
          {calmDays > 0 ? (
            <View style={styles.calmaRow}>
              <View
                style={[
                  styles.calmaDot,
                  { backgroundColor: onGreen ? s.cierreChipOnGreenAccentInk : s.calmaRing },
                ]}
              />
              <Text
                style={[
                  styles.calmaText,
                  { color: onGreen ? s.cierreChipOnGreenAccentInk : s.accentInk },
                ]}
              >
                {copy.calmDaysText ??
                  (calmDays === 1 ? '1 día en calma' : `${calmDays} días en calma`)}
              </Text>
            </View>
          ) : null}
        </RiseView>

        <RiseView
          delay={enterDelay(5)}
          translateY={ENTRY_RISE}
          style={onGreen ? styles.statsSpacingPerfecta : styles.statsSpacing}
        >
          <View
            style={[
              styles.statsCard,
              onGreen
                ? [
                    styles.statsCardPerfecta,
                    cssGradient(s.cierreStatsCardGradientCss, s.cierreStatsCardFallback),
                    { boxShadow: s.cierreStatsCardShadow },
                  ]
                : [
                    styles.statsCardNeutral,
                    cssGradient(raised.gradientCss, raised.fallback),
                    { boxShadow: raised.shadow },
                  ],
            ]}
          >
            <View style={styles.statsRow}>
              {vm.stats.map((stat) => (
                <View
                  key={stat.label}
                  style={[
                    styles.statTile,
                    onGreen ? styles.statTilePerfecta : styles.statTileNeutral,
                    {
                      backgroundColor: statTile.background,
                      boxShadow: statTile.shadow,
                      borderRadius: statTile.radius,
                      borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                      borderColor: s.hairline,
                    },
                  ]}
                >
                  <Text
                    style={[
                      onGreen ? styles.statValuePerfecta : styles.statValue,
                      { color: s.cierreStatValueInk },
                    ]}
                  >
                    {stat.value}
                  </Text>
                  <Text style={[styles.statLabel, { color: s.cierreStatLabelInk }]}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </RiseView>

        {vm.unlocked || vm.nextGoal || vm.coach ? (
          <RiseView
            delay={enterDelay(6)}
            translateY={ENTRY_RISE}
            style={onGreen ? styles.extraSpacingPerfecta : styles.extraSpacing}
          >
            {vm.unlocked ? (
              <UnlockedCard unlocked={vm.unlocked} s={s} kicker={copy.unlockedKicker} />
            ) : vm.nextGoal ? (
              <NextGoalCard
                nextGoal={vm.nextGoal}
                s={s}
                raised={raised}
                kicker={copy.nextKicker}
              />
            ) : vm.coach ? (
              <CoachCard text={vm.coach} s={s} raised={raised} />
            ) : null}
          </RiseView>
        ) : null}
      </ScrollView>

      {/* El CTA vive fuera del scroll: siempre alcanzable, ver [P3]. */}
      <RiseView delay={enterDelay(7)} translateY={ENTRY_RISE} style={styles.footer}>
        <CierreCta
          label={vm.cta.text}
          onPress={vm.cta.onPress}
          // Sobre el verde CLARO el CTA es crema (el verde sobre verde
          // desaparecería); sobre el verde OSCURO el handoff vuelve al radial
          // verde, que ahí sí contrasta. Las neutras usan siempre el radial.
          ink={onGreen && mode === 'light' ? s.ctaCreamInk : s.ctaGreenInk}
          gradientCss={onGreen && mode === 'light' ? s.ctaCreamGradientCss : s.ctaGreenGradientCss}
          fallback={onGreen && mode === 'light' ? s.ctaCreamFallback : s.ctaGreenFallback}
          shadow={onGreen && mode === 'light' ? s.ctaCreamShadow : s.ctaGreenShadow}
        />
        <Pressable
          accessibilityRole="button"
          onPress={vm.secondary.onPress}
          style={({ pressed }) => (pressed ? styles.linkPressed : null)}
        >
          <Text
            style={[styles.link, { color: onGreen ? s.cierreLinkOnGreenInk : s.cierreLinkInk }]}
          >
            {vm.secondary.text}
          </Text>
        </Pressable>
      </RiseView>

      {drawChrome ? (
        <View
          style={[
            styles.homeIndicator,
            { backgroundColor: chrome.homeIndicator, opacity: chrome.homeIndicatorOpacity },
          ]}
        />
      ) : (
        // Live: el indicador lo dibuja el SO; acá sólo su aire (el mismo
        // 4 + 5 + 10 del chrome dibujado cuando el device no reporta inset).
        <View style={{ height: Math.max(insets.bottom, 19) }} />
      )}
    </View>
  )
}

// ─── Demo (datos del mockup) ─────────────────────────────────────────

/**
 * El demo cicla las 4 variantes del handoff + un quinto paso `calma`, que es
 * la MISMA semana buena con las piezas propias del plan (día en calma, día
 * recuperado y la línea "N días en calma"): sin él, las tres piezas de D4 no
 * tendrían dónde verse en el gate.
 */
export type CierreDemoKey = WeekCloseVariant | 'calma'

const DEMO_ORDER: readonly CierreDemoKey[] = ['perfecta', 'buena', 'floja', 'cortada', 'calma']

const L7 = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

function demoDays(states: readonly CierreDayState[]): CierreDayVM[] {
  return L7.map((letter, i) => ({ letter, state: states[i] ?? 'missed' }))
}

function demoVM(key: CierreDemoKey, onNext: () => void): CierreVM {
  const cta = (text: string) => ({ text, onPress: onNext })
  const secondary = (text: string) => ({ text, onPress: onNext })

  switch (key) {
    case 'perfecta':
      return {
        variant: 'perfecta',
        title: 'Tu jardín floreció.',
        chipText: 'Semana perfecta · 7 de 7 días',
        days: demoDays(['logged', 'logged', 'logged', 'logged', 'logged', 'logged', 'logged']),
        stats: [
          { value: '+7', label: 'BROTES' },
          { value: '51', label: 'JARDÍN' },
          { value: '28', label: 'RÉCORD' },
        ],
        unlocked: {
          // El mockup desbloquea "Jardín de 50", que no existe en el catálogo
          // de 18 (§4). `goal_completed` sí, y es uno de los cuatro con Brot
          // (pose `cheer`, D3) — la rama que el gate tiene que poder juzgar.
          code: 'goal_completed',
          title: 'Meta florecida',
          body: 'Llegaste entera. Lo que planeaste, se hizo plata.',
          medal: { kind: 'brot', pose: 'cheer' },
        },
        cta: cta('Seguir cultivando'),
        secondary: secondary('Ver todos mis logros ›'),
      }

    case 'buena':
      return {
        variant: 'buena',
        title: 'Casi perfecta.',
        chipText: 'Buena semana · 5 de 7 días',
        days: demoDays(['logged', 'logged', 'logged', 'logged', 'logged', 'missed', 'missed']),
        stats: [
          { value: '+5', label: 'BROTES' },
          { value: '51', label: 'JARDÍN' },
          { value: '5', label: 'RACHA' },
        ],
        nextGoal: { title: 'Un mes sin fallar', current: 28, target: 30 },
        cta: cta('Seguir cultivando'),
        secondary: secondary('Ver logros ›'),
      }

    case 'floja':
      return {
        variant: 'floja',
        title: 'Tu jardín aguantó.',
        chipText: 'Semana floja · 3 de 7 días',
        days: demoDays(['logged', 'missed', 'logged', 'missed', 'missed', 'logged', 'missed']),
        stats: [
          { value: '+3', label: 'BROTES' },
          { value: '51', label: 'JARDÍN' },
          { value: '3', label: 'RACHA' },
        ],
        coach: 'Vuelve mañana: el brote de hoy todavía puede florecer. Un día a la vez.',
        cta: cta('Seguir esta semana'),
        secondary: secondary('Ver logros ›'),
      }

    case 'cortada':
      return {
        variant: 'cortada',
        title: 'Tu racha se cortó.',
        chipText: 'Semana perdida · 0 de 7 días',
        days: demoDays(['missed', 'missed', 'missed', 'missed', 'missed', 'missed', 'seed']),
        stats: [
          { value: '51', label: 'JARDÍN' },
          { value: '28', label: 'RÉCORD' },
          { value: '0', label: 'RACHA' },
        ],
        coach: 'Tu récord (28) y tu jardín (51) siguen guardados. Planta hoy y arranca de nuevo.',
        cta: cta('Plantar hoy'),
        secondary: secondary('Ver logros ›'),
      }

    default:
      return {
        variant: 'buena',
        title: 'Casi perfecta.',
        chipText: 'Buena semana · 5 de 7 días',
        // Mismo 5 de 7 que la buena, repartido distinto: 3 plantados + 1 día
        // en calma + 1 recuperado por escudo.
        days: demoDays(['logged', 'logged', 'calma', 'recovered', 'logged', 'missed', 'missed']),
        stats: [
          { value: '+5', label: 'BROTES' },
          { value: '51', label: 'JARDÍN' },
          { value: '5', label: 'RACHA' },
        ],
        calmDays: 1,
        nextGoal: { title: 'Un mes sin fallar', current: 28, target: 30 },
        cta: cta('Seguir cultivando'),
        secondary: secondary('Ver logros ›'),
      }
  }
}

export interface CierreFinalScreenProps {
  mode: ResolvedThemeMode
  /** Variante inicial; el preview siembra una por seed. */
  initialSeed?: CierreDemoKey
}

/**
 * Pantalla completa auto-conducida: cualquier acción (CTA o link) avanza a la
 * variante siguiente, así el owner recorre las cuatro sin chrome extra. El
 * `key` remonta la vista para que la entrada escalonada se vuelva a ver.
 */
export function CierreFinalScreen({ mode, initialSeed = 'perfecta' }: CierreFinalScreenProps) {
  const [seed, setSeed] = useState<CierreDemoKey>(initialSeed)

  const next = useCallback(() => {
    setSeed((prev) => {
      const i = DEMO_ORDER.indexOf(prev)
      return DEMO_ORDER[(i + 1) % DEMO_ORDER.length] ?? 'perfecta'
    })
  }, [])

  const vm = useMemo(() => demoVM(seed, next), [seed, next])

  return <CierreSemanaView key={seed} mode={mode} vm={vm} />
}

// ─── Estilos (geometría literal del handoff) ─────────────────────────

const styles = StyleSheet.create({
  shell: { flex: 1 },
  particles: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },

  // ① kicker + título + chip
  kicker: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: LS_KICKER,
    textAlign: 'center',
  },
  // `lineHeight` no viene del handoff (el título entra en una línea en el
  // mockup de 393px): se fija para que un wrap en pantallas angostas no
  // superponga las líneas.
  titlePerfecta: {
    fontSize: 37,
    lineHeight: safeLineHeight(37, 1.1081),
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
    marginTop: 10,
  },
  title: {
    fontSize: 31,
    lineHeight: safeLineHeight(31, 1.129),
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
    marginTop: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
  },
  chipOnGreen: { paddingVertical: 9, paddingHorizontal: 16, marginTop: 14 },
  chipNeutral: { paddingVertical: 8, paddingHorizontal: 15, marginTop: 12 },
  chipStrong: { fontSize: 12.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  chipSoft: { fontSize: 12.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  chipDotSm: { width: 5, height: 5, borderRadius: 2.5 },
  chipDotLg: {
    width: JARDIN_GEOMETRY.chipDot,
    height: JARDIN_GEOMETRY.chipDot,
    borderRadius: JARDIN_GEOMETRY.chipDot / 2,
  },

  // ② Brot protagonista
  brotSpacing: { marginTop: 16 },
  brotSpacingPerfecta: { marginTop: 20 },
  brotZone: { alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', left: 0 },

  // ③ fila de 7 días
  daysSpacing: { marginTop: 16, alignSelf: 'stretch' },
  daysSpacingPerfecta: { marginTop: 26, alignSelf: 'stretch' },
  daysRow: { flexDirection: 'row', justifyContent: 'center' },
  daysRowPerfecta: { gap: 9 },
  daysRowNeutral: { gap: 7 },
  dayCol: { alignItems: 'center', gap: 5 },
  dayTile: {
    alignItems: 'center',
    // El Brot se apoya en el piso del tile (2px de aire), como el mockup.
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  dayLetter: { fontSize: 10, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ④ línea de días en calma (pieza propia, D4)
  calmaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  calmaDot: { width: 7, height: 7, borderRadius: 3.5 },
  calmaText: { fontSize: 11.5, fontWeight: '800', fontFamily: nunitoFamily('800') },

  // ⑤ card de stats
  statsSpacing: { marginTop: 18, alignSelf: 'stretch' },
  statsSpacingPerfecta: { marginTop: 20, alignSelf: 'stretch' },
  statsCard: { alignSelf: 'stretch' },
  statsCardPerfecta: { borderRadius: 26, padding: 15 },
  statsCardNeutral: { borderRadius: 24, padding: 14 },
  statsRow: { flexDirection: 'row', gap: 10 },
  // El cuerpo del mockup lleva `text-align:center` y la card de stats no lo
  // pisa (las cards extra sí, con `text-align:left`): valor y etiqueta van
  // centrados en el tile.
  statTile: { flex: 1, alignItems: 'center' },
  statTilePerfecta: { paddingVertical: 11, paddingHorizontal: 6 },
  statTileNeutral: { paddingVertical: 10, paddingHorizontal: 6 },
  statValuePerfecta: {
    fontSize: 23,
    lineHeight: safeLineHeight(23, 1.0, { numeric: true }),
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  statValue: { fontSize: 22, lineHeight: safeLineHeight(22, 1.0, { numeric: true }), fontWeight: '900', fontFamily: nunitoFamily('900') },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: LS_STAT_LABEL,
    marginTop: 3,
  },

  // ⑥ cards extra
  extraSpacing: { marginTop: 14, alignSelf: 'stretch' },
  extraSpacingPerfecta: { marginTop: 12, alignSelf: 'stretch' },
  extraCard: { alignSelf: 'stretch', borderRadius: 22 },
  unlockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  unlockedTexts: { flex: 1, minWidth: 0 },
  cardKicker: {
    fontSize: 9.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: LS_CARD_KICKER,
  },
  unlockedTitle: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginTop: 1,
  },
  unlockedBody: { fontSize: 11, fontWeight: '700', fontFamily: nunitoFamily('700') },
  nextCard: { paddingVertical: 13, paddingHorizontal: 15 },
  nextHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nextCount: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900') },
  nextTitle: { fontSize: 14, fontWeight: '900', fontFamily: nunitoFamily('900'), marginTop: 3 },
  progressTrack: { marginTop: 9, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 6 },
  coachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  coachText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 17.4,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },

  // ⑦ medalla
  medalDisc: { alignItems: 'center', justifyContent: 'center' },
  medalIconClip: { overflow: 'hidden' },
  medalWellText: { fontSize: 20, fontWeight: '900', fontFamily: nunitoFamily('900') },

  // ⑧ pie
  footer: { paddingHorizontal: 24, paddingBottom: 14 },
  cta: { borderRadius: 24, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '900', fontFamily: nunitoFamily('900') },
  link: {
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    textAlign: 'center',
    marginTop: 11,
  },
  linkPressed: { opacity: 0.65 },
  homeIndicator: {
    width: 132,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
})
