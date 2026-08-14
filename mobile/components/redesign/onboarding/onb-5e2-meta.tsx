import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text, TextInput } from '@/components/ui/app-text'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BrotMascot } from '@/components/brot'
import { GoalIcon } from '@/components/savings-goals/goal-icon'
import { GOAL_EXTRA_ICONS } from '@/components/savings-goals/wizard-steps/step-1-title-emoji'
import { GOAL_STICKER_KEYS } from '@/features/savings-goals/goal-icon'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import i18n from '@/lib/i18n'
import { motionDurations } from '@/lib/motion/tokens'
import { pastelDark } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { formatPesos } from './onb-format'
import {
  OnbActiveRing,
  OnbHeader,
  OnbHero,
  OnbProgress,
  OnbScreenShell,
  OnbScrollBody,
} from './onb-kit'
import { ONB_MONTO_EDITING, OnbNumpad, useNumpadScrollAvoid } from './onb-numpad'
import { ONB_SPEC, ONB_SURFACES, type OnbMode } from './onb-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * 5e2 · Meta expandida — réplica de screens/5e2.html (claro) y
 * 5e2o.html (oscuro). Copys y valores literales del mockup.
 *
 * UX clave del mockup: metas sugeridas de UN TOQUE (autocompletan
 * título/ícono/monto/plazo y la cuota se calcula), y la salida visible
 * — botón secundario hundido full-width "Empezar sin meta" (nunca un
 * link chiquito) con su caption sin culpa.
 *
 * El mockup muestra el estado con "Vacaciones" elegida ($3.600.000 a
 * 12 meses → $300.000/mes). Con `meta === null` las filas dependientes
 * de la meta (cuota y globo de Brot) no se muestran y nada queda
 * seleccionado; un toque en "✈️ Vacaciones" reproduce el mockup exacto.
 *
 * Es más alto que el viewport en dispositivos reales → ScrollView
 * propio (el mockup es un frame estático de 393px).
 */

/** Meta seleccionada — misma forma que OnbFlowState['meta']. */
export interface OnbMetaValue {
  icon: string
  title: string
  monto: number
  meses: number
}

/**
 * Sugeridas de un toque. Solo Vacaciones (monto/plazo/globo) está en el
 * mockup; el resto son defaults demo consistentes (cuota redonda).
 */
// Los títulos/globos se resuelven por `i18n.t` en el acceso (getters +
// cuerpo de `bubble`), no al cargar el módulo: así siguen el idioma
// vigente cuando el componente re-renderiza (usa `useTranslation`).
const SUGERIDAS: ReadonlyArray<OnbMetaValue & { bubble: (meses: number) => string }> = [
  {
    icon: 'transporte/avion',
    get title() {
      return i18n.t('onboarding:goalStep.suggested.vacaciones.title')
    },
    monto: 3600000,
    meses: 12,
    bubble: (m) => i18n.t('onboarding:goalStep.suggested.vacaciones.bubble', { months: m }),
  },
  {
    icon: 'vivienda/vivienda',
    get title() {
      return i18n.t('onboarding:goalStep.suggested.mudanza.title')
    },
    monto: 2400000,
    meses: 6,
    bubble: (m) => i18n.t('onboarding:goalStep.suggested.mudanza.bubble', { months: m }),
  },
  {
    icon: 'metas/terreno',
    get title() {
      return i18n.t('onboarding:goalStep.suggested.colchon.title')
    },
    monto: 900000,
    meses: 3,
    bubble: (m) => i18n.t('onboarding:goalStep.suggested.colchon.bubble', { months: m }),
  },
  {
    icon: 'transporte/automovil',
    get title() {
      return i18n.t('onboarding:goalStep.suggested.auto.title')
    },
    monto: 14400000,
    meses: 24,
    bubble: (m) => i18n.t('onboarding:goalStep.suggested.auto.bubble', { months: m }),
  },
  {
    icon: 'metas/objetivo',
    get title() {
      return i18n.t('onboarding:goalStep.suggested.otra.title')
    },
    monto: 1200000,
    meses: 12,
    bubble: (m) => i18n.t('onboarding:goalStep.suggested.otra.bubble', { months: m }),
  },
]

function bubbleFor(meta: OnbMetaValue): string {
  const sugerida = SUGERIDAS.find((sug) => sug.title === meta.title)
  return (sugerida ?? SUGERIDAS[SUGERIDAS.length - 1]).bubble(meta.meses)
}

/**
 * Íconos de meta REALES de la app — mismo set que el wizard de
 * onboarding/ajustes: 5 stickers `metas/*` (GOAL_STICKER_KEYS) + 8
 * adicionales (GOAL_EXTRA_ICONS) = 13. El glyph se rendea con <GoalIcon>
 * (PNG del registry), no como emoji; el tile conserva geometría, pastel
 * y anillo de selección del mockup.
 *
 * La paleta pastel del mockup (7 tonos) se cicla sobre los 13 íconos —
 * los oscuros los deriva pastelDark() con el alpha 0.13 literal del doc.
 */
const ICON_KEYS = [...GOAL_STICKER_KEYS, ...GOAL_EXTRA_ICONS] as const

const ICON_PASTELS = [
  '#DCEBD8',
  '#D6E4F0',
  '#F7E3CF',
  '#F5D8DD',
  '#E6E0F4',
  '#EDE6D4',
  '#F2ECC9',
] as const

const ICONOS: ReadonlyArray<{ key: string; light: string; dark: string }> = ICON_KEYS.map(
  (key, i) => {
    const light = ICON_PASTELS[i % ICON_PASTELS.length]
    return { key, light, dark: pastelDark(light, 0.13) }
  },
)

/** Plazos del mockup ("3 meses" / "6" / "12" / "24"). */
const PLAZOS: ReadonlyArray<{ label: string; meses: number }> = [
  {
    get label() {
      return i18n.t('onboarding:goalStep.plazo3')
    },
    meses: 3,
  },
  { label: '6', meses: 6 },
  { label: '12', meses: 12 },
  { label: '24', meses: 24 },
]

// ─── Valores propios de 5e2/5e2o (no están en ONB_SPEC) ──────────────

interface Onb5e2Spec {
  /** Labels de sección (SUGERIDAS · UN TOQUE / TÍTULO / ÍCONO / MONTO…). */
  label: string
  /** Texto secundario (chips idle, plazos idle, cuota, skip). */
  body: string
  /** Acento verde (Tap para editar, cuota, check, ring selected). */
  accent: string
  /** Chips/plazos hundidos idle. */
  chipIdleBackground: string | undefined
  chipIdleShadow: string
  /** Estado seleccionado (chip, tile de ícono y plazo comparten estilo). */
  chipSelectedText: string
  chipSelectedBackground: string
  chipSelectedShadow: string
  /** Badge AUTOCOMPLETADO del well de título. */
  autoBadge: string
  /** Tiles de ícono idle (elevados; el bg pastel va por-ícono). */
  tileShadow: string
  /** Cards elevadas (monto objetivo y globo de Brot). */
  cardGradientCss: string
  cardFallback: string
  cardShadow: string
  bubbleText: string
  /** CTA verde propio de 5e2 (≠ CTA del spec compartido). */
  ctaBackgroundCss: string
  ctaFallback: string
  ctaShadow: string
  ctaText: string
}

// Superficies compartidas (card/CTA/chips) vienen de ONB_SURFACES —
// strings byte-idénticos a los que este spec traía inline.
const SPEC_5E2: Record<OnbMode, Onb5e2Spec> = {
  light: {
    ...ONB_SURFACES.light,
    label: '#54644F',
    body: '#3E5A44',
    accent: '#2E7C39',
    autoBadge: '#9AA694',
    tileShadow: '4px 4px 9px rgba(151,160,136,0.35), -4px -4px 9px rgba(255,255,255,0.85)',
    cardFallback: '#EBEDE0',
    bubbleText: '#24382A',
    ctaFallback: '#48924E',
  },
  dark: {
    ...ONB_SURFACES.dark,
    label: '#93A78F',
    body: '#B9CCB2',
    accent: '#A4E3A6',
    autoBadge: '#7C917A',
    tileShadow: '4px 4px 9px rgba(0,0,0,0.45), -4px -4px 9px rgba(101,152,113,0.08)',
    cardFallback: '#1B3023',
    bubbleText: '#F1EEDD',
    ctaFallback: '#6EAC72',
  },
}

// ─── CTA deshabilitado (receta 3c, espejo de OnbCta del kit) ─────────
//
// El CTA verde de 5e2 no es el del spec compartido → no puede usar
// OnbCta; replica local del estado deshabilitado del kit: hundido con
// texto apagado, crossfade de capas y hint durazno con Brot al tocar.

const CTA_DISABLED = {
  light: {
    text: '#9AA694',
    background: undefined,
    shadow: 'inset 5px 5px 10px rgba(151,160,136,0.42), inset -5px -5px 10px rgba(255,255,255,0.92)',
    hintText: '#B0764A',
  },
  dark: {
    text: '#7C917A',
    background: '#142519',
    shadow: 'inset 5px 5px 10px rgba(0,0,0,0.5), inset -5px -5px 10px rgba(101,152,113,0.08)',
    hintText: '#F2A87E',
  },
} as const

// ─── Pantalla ────────────────────────────────────────────────────────

export function Onb5e2Meta({
  mode,
  meta,
  onChangeMeta,
  onBack,
  onNext,
  onSkip,
  submitting = false,
  serverError = null,
}: {
  mode: OnbMode
  /** Meta seleccionada, o null (todavía nada elegido). */
  meta: OnbMetaValue | null
  onChangeMeta: (meta: OnbMetaValue) => void
  onBack?: () => void
  /** "Crear meta y empezar". */
  onNext?: () => void
  /** "Empezar sin meta" — salida visible, acción propia. */
  onSkip?: () => void
  /** Finish real en vuelo (con o sin meta): CTA "Terminando…", presses
   *  de ambas salidas ignorados. */
  submitting?: boolean
  /** Error del finish (caller lo limpia al reintentar): failure state
   *  del rediseño (Brot worried + texto durazno) bajo el CTA. */
  serverError?: string | null
}) {
  const s = ONB_SPEC[mode]
  const d = SPEC_5E2[mode]
  const cd = CTA_DISABLED[mode]
  const edit = ONB_MONTO_EDITING[mode]
  const { t } = useTranslation()

  const cuota = meta && meta.meses > 0 ? Math.round(meta.monto / meta.meses) : 0

  // Anillo activo del título (4c: "la caja activa con anillo"). El monto
  // ya no usa foco/teclado nativo — se edita con el numpad (numpadOpen).
  const [titleFocused, setTitleFocused] = useState(false)
  const [numpadOpen, setNumpadOpen] = useState(false)

  // Keyboard-avoidance: al abrir el numpad, elevamos la card de monto
  // por encima de la hoja.
  const scrollRef = useRef<ScrollView>(null)
  const montoRef = useRef<View>(null)
  const { onScroll, extraBottomPad } = useNumpadScrollAvoid({
    scrollRef,
    targetRef: montoRef,
    open: numpadOpen,
  })

  // Validación bloqueante del CTA primario: sin meta (o con monto 0, o
  // con el título borrado — el upsert real lo exige) no se crea nada —
  // la salida "Empezar sin meta" queda siempre viva.
  const disabled = meta === null || meta.monto <= 0 || meta.title.trim().length === 0
  const [hintVisible, setHintVisible] = useState(false)
  const disabledSv = useSharedValue(disabled ? 1 : 0)
  useEffect(() => {
    disabledSv.value = withTiming(disabled ? 1 : 0, { duration: motionDurations.standard })
    if (!disabled) setHintVisible(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])
  // disabledSv: 0 = habilitado, 1 = deshabilitado (crossfade de capas).
  const activeLayer = useAnimatedStyle(() => ({ opacity: 1 - disabledSv.value }))
  const disabledLayer = useAnimatedStyle(() => ({ opacity: disabledSv.value }))

  const handleNext = () => {
    if (submitting) return
    if (disabled) {
      void triggerHaptic('light')
      setHintVisible(true)
      return
    }
    onNext?.()
  }

  return (
    <OnbScreenShell mode={mode}>
      {/* Gutter + flexGrow adentro del scroll (los traía local; ahora
          los aporta el kit — mismas claves, sombras sin recorte). */}
      <OnbScrollBody ref={scrollRef} onScroll={onScroll} extraBottomPad={extraBottomPad}>
        <OnbHeader mode={mode} title={t('onboarding:chrome.title.savings')} onBack={onBack} />
        {/* Último paso: los 5 segmentos van sólidos en el mockup. */}
        <OnbProgress mode={mode} active={4} />

        {/* Hero (sin Brot — solo partículas ×7, como el markup de 5e2). */}
        <OnbHero
          mode={mode}
          title={t('onboarding:goalStep.heroTitle')}
          subtitle={t('onboarding:goalStep.heroSubtitle')}
          brotPose={null}
        />

        {/* Sugeridas de un toque. */}
        <Text style={[styles.sectionLabel, { color: d.label }]}>
          {t('onboarding:goalStep.suggestedEyebrow')}
        </Text>
        <View style={styles.chipsRow}>
          {SUGERIDAS.map((sug) => (
            <SugeridaChip
              key={sug.title}
              mode={mode}
              icon={sug.icon}
              title={sug.title}
              selected={meta?.title === sug.title}
              onPress={() =>
                onChangeMeta({
                  icon: sug.icon,
                  title: sug.title,
                  monto: sug.monto,
                  meses: sug.meses,
                })
              }
            />
          ))}
        </View>

        {/* Título (autocompletado por la sugerida). */}
        <Text style={[styles.sectionLabel, { color: d.label }]}>
          {t('onboarding:goalStep.titleEyebrow')}
        </Text>
        <View
          style={[
            styles.titleWell,
            { backgroundColor: s.wellBackground, boxShadow: s.wellShadow },
          ]}
        >
          <TextInput
            accessibilityLabel={t('onboarding:savings.goalTitleA11y')}
            editable={meta !== null}
            onBlur={() => setTitleFocused(false)}
            onChangeText={(title) => {
              if (meta) onChangeMeta({ ...meta, title })
            }}
            onFocus={() => setTitleFocused(true)}
            style={[styles.titleText, styles.titleInput, { color: s.text }]}
            value={meta?.title ?? ''}
          />
          {meta ? (
            <Text style={[styles.autoBadge, { color: d.autoBadge }]}>
              {t('onboarding:goalStep.autofilled')}
            </Text>
          ) : null}
          <OnbActiveRing mode={mode} focused={titleFocused} radius={18} />
        </View>

        {/* Ícono — set real de la app (13 stickers) en fila scrolleable
            (no entran en el ancho del frame; misma UX que step-savings). */}
        <Text style={[styles.sectionLabel, { color: d.label }]}>
          {t('onboarding:goalStep.iconEyebrow')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tilesScroll}
          contentContainerStyle={styles.tilesRow}
        >
          {ICONOS.map((icono) => (
            <IconoTile
              key={icono.key}
              mode={mode}
              icono={icono}
              selected={meta?.icon === icono.key}
              onPress={() => {
                if (meta) onChangeMeta({ ...meta, icon: icono.key })
              }}
            />
          ))}
        </ScrollView>

        {/* Monto objetivo + plazo + cuota calculada. Con el numpad abierto
            la card se eleva con el tratamiento ONB_MONTO_EDITING (anillo
            verde + fondo) — reemplaza al OnbActiveRing que traía el monto. */}
        <View
          ref={montoRef}
          style={[
            styles.card,
            numpadOpen
              ? { backgroundColor: edit.background, boxShadow: edit.shadow }
              : {
                  experimental_backgroundImage: d.cardGradientCss,
                  backgroundColor: d.cardFallback,
                  boxShadow: d.cardShadow,
                },
          ]}
        >
          {/* "Tap para editar": el monto es read-only; el tap abre el
              numpad (4j) en vez del teclado nativo. */}
          <Pressable
            accessibilityLabel={t('onboarding:goalStep.editAmountA11y')}
            accessibilityRole="button"
            disabled={meta === null}
            onPress={() => {
              if (meta) setNumpadOpen(true)
            }}
          >
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardLabel, { color: d.label }]}>
                {t('onboarding:goalStep.amountEyebrow')}
              </Text>
              <Text style={[styles.cardEdit, { color: d.accent }]}>
                {t('home:amountCard.tapToEdit')}
              </Text>
            </View>
            <Text style={[styles.amount, { color: s.text }]}>{formatPesos(meta?.monto ?? 0)}</Text>
          </Pressable>
          <Text style={[styles.tiempoLabel, { color: d.label }]}>
            {t('onboarding:goalStep.timeEyebrow')}
          </Text>
          <View style={styles.plazosRow}>
            {PLAZOS.map((plazo) => (
              <PlazoChip
                key={plazo.meses}
                mode={mode}
                label={plazo.label}
                selected={meta?.meses === plazo.meses}
                onPress={() => {
                  if (meta) onChangeMeta({ ...meta, meses: plazo.meses })
                }}
              />
            ))}
          </View>
          {meta ? (
            <View style={styles.cuotaRow}>
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke={d.accent}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
              <Text style={[styles.cuotaText, { color: d.body }]}>
                {t('onboarding:goalStep.cuotaPrefix')}
                <Text style={{ color: d.accent }}>
                  {formatPesos(cuota)}
                  {t('onboarding:goalStep.perMonth')}
                </Text>
                {t('onboarding:goalStep.cuotaSuffix')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Brot + globo (solo con meta elegida — el copy depende de ella). */}
        {meta ? (
          <View style={styles.brotRow}>
            <BrotMascot pose="love" size={64} shadow={false} />
            <View
              style={[
                styles.bubble,
                {
                  experimental_backgroundImage: d.cardGradientCss,
                  backgroundColor: d.cardFallback,
                  boxShadow: d.cardShadow,
                },
              ]}
            >
              <Text style={[styles.bubbleText, { color: d.bubbleText }]}>
                {bubbleFor(meta)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Empuja el footer al fondo en pantallas altas; mínimo = los
            18px de margin-top del mockup. */}
        <View style={styles.footerSpacer} />

        {/* CTA verde propio de 5e2 + salida visible "Empezar sin meta". */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            onPress={handleNext}
            style={styles.cta}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ctaLayer,
                activeLayer,
                {
                  experimental_backgroundImage: d.ctaBackgroundCss,
                  backgroundColor: d.ctaFallback,
                  boxShadow: d.ctaShadow,
                },
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ctaLayer,
                disabledLayer,
                { backgroundColor: cd.background, boxShadow: cd.shadow },
              ]}
            />
            <Text style={[styles.ctaLabel, { color: disabled ? cd.text : d.ctaText }]}>
              {submitting ? t('onboarding:cta.finishing') : t('onboarding:goalStep.ctaCreate')}
            </Text>
          </Pressable>
          {hintVisible && disabled ? (
            <Animated.View
              entering={FadeInDown.duration(motionDurations.standard)}
              style={styles.ctaHintRow}
            >
              <BrotMascot pose="think" size={34} shadow={false} />
              <Text style={[styles.ctaHintText, { color: cd.hintText }]}>
                {t('onboarding:goalStep.hintNoGoal')}
              </Text>
            </Animated.View>
          ) : null}
          {serverError ? (
            <Animated.View
              entering={FadeInDown.duration(motionDurations.standard)}
              style={styles.ctaHintRow}
            >
              <BrotMascot pose="worried" size={34} shadow={false} />
              <Text style={[styles.ctaHintText, { color: cd.hintText }]}>
                {serverError}
              </Text>
            </Animated.View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={submitting ? undefined : onSkip}
            style={[
              styles.skip,
              { backgroundColor: s.wellBackground, boxShadow: s.wellShadow },
            ]}
          >
            <Text style={[styles.skipLabel, { color: d.body }]}>
              {t('onboarding:goalStep.skip')}
            </Text>
          </Pressable>
          <Text style={[styles.skipCaption, { color: s.helper }]}>
            {t('onboarding:goalStep.skipCaption')}
          </Text>
        </View>
      </OnbScrollBody>

      {/* Numpad (4j) — overlay absoluto al fondo del shell. Edita el monto
          de la meta; la cuota "Son $X/mes" se recalcula sola al re-render. */}
      <OnbNumpad
        mode={mode}
        visible={numpadOpen}
        value={meta?.monto ?? 0}
        onChange={(monto) => {
          if (meta) onChangeMeta({ ...meta, monto })
        }}
        onDone={() => setNumpadOpen(false)}
      />
    </OnbScreenShell>
  )
}

// ─── Chips/tiles (componentes propios: hook de press scale c/u) ──────

function SugeridaChip({
  mode,
  icon,
  title,
  selected,
  onPress,
}: {
  mode: OnbMode
  /** Key de sticker del set real — leading glyph del chip (<GoalIcon>). */
  icon: string
  title: string
  selected: boolean
  onPress: () => void
}) {
  const d = SPEC_5E2[mode]
  const pressScale = usePressScale({ pressedScale: 0.94 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.chip,
        selected
          ? {
              backgroundColor: d.chipSelectedBackground,
              boxShadow: d.chipSelectedShadow,
            }
          : {
              backgroundColor: d.chipIdleBackground,
              boxShadow: d.chipIdleShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      <GoalIcon value={icon} size={18} />
      <Text
        style={[
          selected ? styles.chipTextSelected : styles.chipText,
          { color: selected ? d.chipSelectedText : d.body },
        ]}
      >
        {title}
      </Text>
    </AnimatedPressable>
  )
}

function IconoTile({
  mode,
  icono,
  selected,
  onPress,
}: {
  mode: OnbMode
  icono: (typeof ICONOS)[number]
  selected: boolean
  onPress: () => void
}) {
  const d = SPEC_5E2[mode]
  const { t } = useTranslation()
  const pressScale = usePressScale({ pressedScale: 0.94 })
  return (
    <AnimatedPressable
      accessibilityLabel={t('onboarding:savings.iconItemA11y', { glyph: icono.key })}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.tile,
        selected
          ? {
              backgroundColor: d.chipSelectedBackground,
              boxShadow: d.chipSelectedShadow,
            }
          : {
              backgroundColor: mode === 'dark' ? icono.dark : icono.light,
              boxShadow: d.tileShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      <GoalIcon value={icono.key} size={26} />
    </AnimatedPressable>
  )
}

function PlazoChip({
  mode,
  label,
  selected,
  onPress,
}: {
  mode: OnbMode
  label: string
  selected: boolean
  onPress: () => void
}) {
  const d = SPEC_5E2[mode]
  const pressScale = usePressScale({ pressedScale: 0.94 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.plazo,
        selected
          ? {
              backgroundColor: d.chipSelectedBackground,
              boxShadow: d.chipSelectedShadow,
            }
          : {
              backgroundColor: d.chipIdleBackground,
              boxShadow: d.chipIdleShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      <Text
        style={[
          selected ? styles.plazoTextSelected : styles.plazoText,
          { color: selected ? d.chipSelectedText : d.body },
        ]}
      >
        {label}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Estilos (valores literales de 5e2/5e2o) ─────────────────────────

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.84, // 0.16em × 11.5px
    marginTop: 16,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  chipTextSelected: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  titleWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  titleText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  // Sin padding propio: misma caja que el <Text> que reemplaza.
  titleInput: {
    padding: 0,
  },
  autoBadge: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.63, // 0.06em × 10.5px
  },
  tilesScroll: {
    flexGrow: 0,
    marginTop: 10,
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
    // Aire para que la sombra neumórfica elevada del tile (offset 4 +
    // blur 9) no se recorte en los bordes del scroll horizontal — el
    // vertical evita el corte arriba/abajo y el horizontal deja respirar
    // la sombra del primer/último tile.
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  tile: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    marginTop: 16,
    borderRadius: 26,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.61, // 0.14em × 11.5px
  },
  cardEdit: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  amount: {
    fontSize: 34,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.68, // -0.02em × 34px
    marginTop: 6,
    padding: 0,
  },
  tiempoLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.1, // 0.1em × 11px
    marginTop: 12,
  },
  plazosRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  plazo: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  plazoText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  plazoTextSelected: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  cuotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
  },
  cuotaText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  brotRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  bubble: {
    flex: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 5,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  bubbleText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    lineHeight: 17.4, // 12px × 1.45
  },
  footerSpacer: {
    flexGrow: 1,
    minHeight: 18,
  },
  footer: {
    paddingBottom: 16,
  },
  cta: {
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
  },
  // Capas de fondo del CTA (activa/deshabilitada) para el crossfade.
  ctaLayer: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  ctaHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
  },
  ctaHintText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  skip: {
    borderRadius: 24,
    padding: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  skipLabel: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  skipCaption: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    marginTop: 10,
  },
})
