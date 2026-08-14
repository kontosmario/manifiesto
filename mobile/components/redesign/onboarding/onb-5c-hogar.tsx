import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, TextInput, View, type ImageSourcePropType } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { BrotMascot, type BrotPose } from '@/components/brot'
import { CategorySticker } from '@/components/category/category-sticker'
import { ONBOARDING_ICONS } from '@/components/onboarding/onboarding-icon-registry'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  OnbActiveRing,
  OnbBody,
  OnbCta,
  OnbHeader,
  OnbHelperRow,
  OnbHero,
  OnbProgress,
  OnbScreenShell,
  OnbWell,
} from './onb-kit'
import { ONB_SPEC, type OnbMode } from './onb-spec'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * 5c · Tu hogar — réplica de screens/5c.html (claro) y 5co.html
 * (oscuro). El panel 'mode' es el mockup literal; elegir "familia"
 * abre el sub-flujo crear/unirse (espejo de step-family.tsx) en el
 * mismo lenguaje neumórfico.
 *
 * Máquina de paneles:
 *   mode → (solo) CTA → soloReady → onNext · (familia) → root
 *   root → (crear) → created → onNext · (unirse) → join
 *   join → (código ≥4) → joined → onJoin
 * El back circular retrocede al panel anterior; en 'mode' → onBack.
 *
 * PASE DE FUNCIONALIDAD (cableado 2026-07-17): las transiciones a los
 * paneles de cierre pueden gatearse con confirmaciones async del caller
 * (onConfirmSolo/onConfirmCreate/onConfirmJoin → bootstrap/peek reales).
 * Sin esos props la máquina transiciona directo — los previews de
 * Settings→Dev quedan idénticos (demo local). `serverError` pinta el
 * failure state del rediseño (Brot worried + texto durazno) en el panel
 * activo; tipear el código lo descarta (patrón auth-4b).
 *
 * Los tres paneles de cierre comparten forma (BrotSuccess: pedestal +
 * título + copy) y se distinguen por la pose: `zen` (tu espacio en paz,
 * solo), `magic` (apareció tu hogar), `laugh` (la alegría de sumarte a
 * uno que ya existe).
 */

export type OnbHogar = 'solo' | 'familia'

/** Paneles internos del sub-flujo. Exportado: el cableado live siembra
 *  el panel inicial al volver a este paso con el hogar ya resuelto. */
export type OnbHogarPanel = 'mode' | 'root' | 'join' | 'created' | 'joined' | 'soloReady'
type Panel = OnbHogarPanel

/** Valores propios de 5c/5co (los compartidos viven en ONB_SPEC). */
interface Hogar5cSpec {
  selectedBackground: string
  selectedShadow: string
  selectedTitle: string
  selectedSub: string
  idleGradientCss: string
  /** Fallback sólido del gradiente idle. */
  idleBackground: string
  idleShadow: string
  idleSub: string
  arrow: string
  checkGradientCss: string
  /** Fallback sólido del radial del check. */
  checkBackground: string
  iconSolo: string
  iconFamilia: string
  iconCasa: string
  iconComp: string
  hintText: string
}

const HOGAR_5C: Record<OnbMode, Hogar5cSpec> = {
  light: {
    selectedBackground: '#DCEBD8',
    selectedShadow:
      'inset 3px 3px 7px rgba(90,110,70,0.2), inset -3px -3px 7px rgba(255,255,255,0.85), 0 0 0 2.5px #2E7C39',
    selectedTitle: '#1F5429',
    selectedSub: '#4E6B54',
    idleGradientCss: 'linear-gradient(145deg, #F3F4E9, #E4E6D8)',
    idleBackground: '#ECEDE1',
    idleShadow: '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
    idleSub: '#54644F',
    arrow: '#2E7C39',
    checkGradientCss: 'radial-gradient(circle at 32% 28%, #489350, #2E7434 85%)',
    checkBackground: '#489A4E',
    iconSolo: '#F0EFE3',
    iconFamilia: '#F7E3CF',
    iconCasa: '#DCEBD8',
    iconComp: '#F7E3CF',
    hintText: '#54644F',
  },
  dark: {
    selectedBackground: 'rgba(164,227,166,0.15)',
    selectedShadow: 'inset 3px 3px 7px rgba(0,0,0,0.4), 0 0 0 2.5px #A4E3A6',
    selectedTitle: '#A4E3A6',
    selectedSub: '#9FB89C',
    idleGradientCss: 'linear-gradient(145deg, #21382A, #16281C)',
    idleBackground: '#1B3023',
    idleShadow: '8px 8px 18px rgba(0,0,0,0.5), -8px -8px 18px rgba(101,152,113,0.1)',
    idleSub: '#93A78F',
    arrow: '#A4E3A6',
    checkGradientCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    checkBackground: '#6FAD73',
    iconSolo: 'rgba(240,239,227,0.14)',
    iconFamilia: 'rgba(247,227,207,0.13)',
    iconCasa: 'rgba(164,227,166,0.13)',
    iconComp: 'rgba(247,227,207,0.13)',
    hintText: '#93A78F',
  },
}

/**
 * Pedestal del empty state 7b/7bo — valores LITERALES del markup.
 * El pozo claro no lleva fondo propio (hereda el bg de pantalla); el
 * oscuro sí (#142519). El glow verde que 7bo pone con un
 * `filter: drop-shadow()` alrededor de Brot NO se porta: RN no soporta
 * ese filtro en ambas plataformas y su ausencia solo quita brillo.
 */
interface PedestalSpec {
  outerGradientCss: string | undefined
  outerBackground: string
  outerShadow: string
  wellBackground: string | undefined
  wellShadow: string
}

const PEDESTAL: Record<OnbMode, PedestalSpec> = {
  light: {
    outerGradientCss: undefined,
    outerBackground: '#E9EBE0',
    outerShadow:
      '12px 12px 26px rgba(151,160,136,0.45), -12px -12px 26px rgba(255,255,255,0.95)',
    wellBackground: undefined,
    wellShadow:
      'inset 6px 6px 13px rgba(151,160,136,0.4), inset -6px -6px 13px rgba(255,255,255,0.95)',
  },
  dark: {
    outerGradientCss: 'linear-gradient(145deg, #1D3426, #132318)',
    outerBackground: '#182A1F',
    outerShadow: '12px 12px 26px rgba(0,0,0,0.6), -12px -12px 26px rgba(101,152,113,0.12)',
    wellBackground: '#142519',
    wellShadow: 'inset 6px 6px 13px rgba(0,0,0,0.5), inset -6px -6px 13px rgba(101,152,113,0.08)',
  },
}

/** Tokens del pill primario deshabilitado (receta literal de OnbCta). */
const PILL_DISABLED = {
  light: {
    text: '#9AA694',
    background: undefined as string | undefined,
    shadow: 'inset 5px 5px 10px rgba(151,160,136,0.42), inset -5px -5px 10px rgba(255,255,255,0.92)',
  },
  dark: {
    text: '#7C917A',
    background: '#142519' as string | undefined,
    shadow: 'inset 5px 5px 10px rgba(0,0,0,0.5), inset -5px -5px 10px rgba(101,152,113,0.08)',
  },
} as const

const MAX_CODE = 8
const MIN_CODE = 4

/** Texto de error del rediseño: durazno de atención, NUNCA rojo (misma
 *  constante que el hintText de CTA_DISABLED / ERROR_TEXT de auth). */
const ERROR_TEXT: Record<OnbMode, string> = { light: '#B0764A', dark: '#F2A87E' }

/** Solo letras/dígitos, mayúsculas, capeado a 8 (formato del código). */
function sanitizeCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, MAX_CODE)
}

export function Onb5cHogar({
  mode,
  hogar,
  onChangeHogar,
  onBack,
  onNext,
  onJoin,
  onConfirmSolo,
  onConfirmCreate,
  onConfirmJoin,
  submitting = false,
  serverError = null,
  initialPanel = 'mode',
}: {
  mode: OnbMode
  hogar: OnbHogar
  onChangeHogar: (hogar: OnbHogar) => void
  onBack?: () => void
  /** Solo / crear hogar: continúa el ramal del creador (5d…5f). */
  onNext?: () => void
  /** Unirse con código: desvía al ramal joiner (aporte → confirmar).
   *  Se llama en el confirm de "unirme", en vez de onNext. */
  onJoin?: () => void
  /** Gate async del CTA "Seguir yo solo" (bootstrap + kind 'solo' real).
   *  Resolver `true` avanza al panel de cierre; `false` se queda (el
   *  caller ya seteó serverError). Ausente → transición directa (demo). */
  onConfirmSolo?: () => Promise<boolean>
  /** Gate async de "Crear un hogar nuevo" (bootstrap real). */
  onConfirmCreate?: () => Promise<boolean>
  /** Gate async de "Unirme" con el código tipeado (peek del invite). */
  onConfirmJoin?: (code: string) => Promise<boolean>
  /** Mutación en vuelo: presses de confirmación ignorados. */
  submitting?: boolean
  /** Error user-facing del caller — failure state en el panel activo.
   *  Tipear el código lo descarta; el caller lo limpia al reintentar. */
  serverError?: string | null
  /** Panel de arranque (live: volver al paso con el hogar ya resuelto). */
  initialPanel?: OnbHogarPanel
}) {
  const h = HOGAR_5C[mode]
  const { t } = useTranslation()
  // Estado del sub-flujo — local; las transiciones a los cierres pasan
  // por los gates async cuando el caller los provee (live).
  const [panel, setPanel] = useState<Panel>(initialPanel)
  const [code, setCode] = useState('')
  const [focused, setFocused] = useState(false)

  // El error del server se muestra hasta que el usuario tipea (descarta)
  // o el caller lo limpia. Render-adjust (sin effect): un serverError
  // NUEVO resetea el descarte (patrón auth-4b-login).
  const [lastServerError, setLastServerError] = useState(serverError)
  const [errorDismissed, setErrorDismissed] = useState(false)
  if (serverError !== lastServerError) {
    setLastServerError(serverError)
    setErrorDismissed(false)
  }
  const errorVisible = Boolean(serverError) && !errorDismissed

  // Back circular: retrocede al panel anterior; en 'mode' sale del paso.
  // Bloqueado durante una mutación en vuelo (review r2): sin esto el
  // usuario podía navegar mientras un confirm async estaba corriendo y la
  // resolución tardía lo teletransportaba a un panel que contradecía su
  // última elección.
  const goBack = () => {
    if (submitting) return
    switch (panel) {
      case 'root':
      case 'soloReady':
        setPanel('mode')
        return
      case 'join':
      case 'created':
        setPanel('root')
        return
      case 'joined':
        setPanel('join')
        return
      default:
        onBack?.()
    }
  }

  const chooseSolo = () => {
    if (submitting) return
    void triggerHaptic('selection')
    onChangeHogar('solo')
  }
  const chooseFamilia = () => {
    if (submitting) return
    void triggerHaptic('selection')
    onChangeHogar('familia')
    setPanel('root')
  }
  // Cierres: con gate del caller (live) la transición espera el OK de la
  // mutación real; sin gate (previews) transiciona directo como siempre.
  const goSoloReady = async () => {
    if (submitting) return
    if (onConfirmSolo && !(await onConfirmSolo())) return
    void triggerHaptic('success')
    setPanel('soloReady')
  }
  const goCreate = async () => {
    if (submitting) return
    if (onConfirmCreate && !(await onConfirmCreate())) return
    void triggerHaptic('success')
    setPanel('created')
  }
  const goJoin = () => {
    if (submitting) return
    void triggerHaptic('selection')
    setPanel('join')
  }
  const confirmJoin = async () => {
    if (submitting) return
    if (onConfirmJoin && !(await onConfirmJoin(code))) return
    void triggerHaptic('success')
    setPanel('joined')
  }

  const renderPanel = () => {
    switch (panel) {
      case 'root':
        return (
          <Animated.View
            key="root"
            entering={FadeIn.duration(motionDurations.standard)}
            exiting={FadeOut.duration(motionDurations.quick)}
            style={styles.panel}
          >
            <HogarOption
              mode={mode}
              sticker={ONBOARDING_ICONS.casa}
              iconBackground={h.iconCasa}
              title={t('onboarding:redesign.hogar.createTitle')}
              subtitle={t('onboarding:redesign.hogar.createSub')}
              selected={false}
              first
              onPress={() => void goCreate()}
            />
            <HogarOption
              mode={mode}
              sticker={ONBOARDING_ICONS.compartir}
              iconBackground={h.iconComp}
              title={t('onboarding:redesign.hogar.joinTitle')}
              subtitle={t('onboarding:redesign.hogar.joinSub')}
              selected={false}
              onPress={goJoin}
            />
            {errorVisible ? <PanelError mode={mode} text={serverError ?? ''} /> : null}
            <View style={styles.rootBottom}>
              <SecondaryButton mode={mode} label={t('onboarding:family.back')} onPress={() => setPanel('mode')} />
            </View>
          </Animated.View>
        )
      case 'join':
        return (
          <Animated.View
            key="join"
            entering={FadeIn.duration(motionDurations.standard)}
            exiting={FadeOut.duration(motionDurations.quick)}
            style={styles.panel}
          >
            <View style={styles.joinTop}>
              <OnbWell mode={mode}>
                <TextInput
                  accessibilityLabel={t('onboarding:redesign.hogar.codeA11y')}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={MAX_CODE}
                  onBlur={() => setFocused(false)}
                  onChangeText={(raw) => {
                    setCode(sanitizeCode(raw))
                    // Tipear descarta el error del intento anterior.
                    if (errorVisible) setErrorDismissed(true)
                  }}
                  onFocus={() => setFocused(true)}
                  style={[styles.codeInput, { color: h.selectedTitle }]}
                  value={code}
                />
                <OnbActiveRing mode={mode} focused={focused} radius={22} />
              </OnbWell>
              <OnbHelperRow
                mode={mode}
                left={t('onboarding:redesign.hogar.codeHelper')}
                right={`${code.length}/${MAX_CODE}`}
              />
            </View>
            {errorVisible ? <PanelError mode={mode} text={serverError ?? ''} /> : null}
            <View style={styles.joinBottom}>
              <SecondaryButton
                mode={mode}
                label={t('onboarding:family.back')}
                style={styles.flex1}
                onPress={() => setPanel('root')}
              />
              <PrimaryPillButton
                mode={mode}
                label={t('onboarding:family.join')}
                disabled={code.length < MIN_CODE}
                style={styles.flexWide}
                onPress={() => void confirmJoin()}
              />
            </View>
          </Animated.View>
        )
      case 'soloReady':
        return (
          <Animated.View
            key="soloReady"
            entering={FadeIn.duration(motionDurations.standard)}
            exiting={FadeOut.duration(motionDurations.quick)}
            style={styles.panel}
          >
            {/* `zen`: tu espacio, en paz. Flota con los ojos cerrados —
                es la pose que el doc pone en este mismo pedestal (7b). */}
            <BrotSuccess
              mode={mode}
              pose="zen"
              title={t('onboarding:redesign.hogar.soloReadyTitle')}
              hint={t('onboarding:redesign.hogar.soloReadyHint')}
            />
            <OnbCta mode={mode} label={t('onboarding:redesign.hogar.continue')} onPress={onNext} />
          </Animated.View>
        )
      case 'created':
        return (
          <Animated.View
            key="created"
            entering={FadeIn.duration(motionDurations.standard)}
            exiting={FadeOut.duration(motionDurations.quick)}
            style={styles.panel}
          >
            {/* `magic`: el hogar acaba de aparecer (chispas + brazo). */}
            <BrotSuccess
              mode={mode}
              pose="magic"
              title={t('onboarding:redesign.hogar.createdTitle')}
              hint={t('onboarding:redesign.hogar.createdHint')}
            />
            <OnbCta mode={mode} label={t('onboarding:redesign.hogar.continue')} onPress={onNext} />
          </Animated.View>
        )
      case 'joined':
        return (
          <Animated.View
            key="joined"
            entering={FadeIn.duration(motionDurations.standard)}
            exiting={FadeOut.duration(motionDurations.quick)}
            style={styles.panel}
          >
            {/* `laugh`: alegría de sumarse a un hogar que ya existe
                (distinta de `cheer` del 5i, que cierra el flujo). */}
            <BrotSuccess
              mode={mode}
              pose="laugh"
              title={t('onboarding:redesign.hogar.joinedTitle')}
              hint={t('onboarding:redesign.hogar.joinedHint')}
            />
            {/* Ramal JOINER: onJoin (no onNext) → aporte + confirmar. */}
            <OnbCta mode={mode} label={t('onboarding:redesign.hogar.continue')} onPress={onJoin} />
          </Animated.View>
        )
      default:
        return (
          <Animated.View
            key="mode"
            entering={FadeIn.duration(motionDurations.standard)}
            exiting={FadeOut.duration(motionDurations.quick)}
            style={styles.panel}
          >
            <HogarOption
              mode={mode}
              sticker={ONBOARDING_ICONS.solo}
              iconBackground={h.iconSolo}
              title={t('onboarding:family.optionSoloTitle')}
              subtitle={t('onboarding:family.optionSoloMeta')}
              selected={hogar === 'solo'}
              first
              onPress={chooseSolo}
            />
            <HogarOption
              mode={mode}
              sticker={ONBOARDING_ICONS.familia}
              iconBackground={h.iconFamilia}
              title={t('onboarding:family.optionSharedTitle')}
              subtitle={t('onboarding:family.optionSharedMeta')}
              selected={hogar === 'familia'}
              onPress={chooseFamilia}
            />
            <View style={styles.hintRow}>
              <BrotMascot pose="idle" size={40} shadow={false} />
              <Text style={[styles.hintText, { color: h.hintText }]}>
                {t('onboarding:redesign.hogar.modeHint')}
              </Text>
            </View>
            {errorVisible ? <PanelError mode={mode} text={serverError ?? ''} /> : null}
            <OnbCta
              mode={mode}
              label={t(
                hogar === 'familia'
                  ? 'onboarding:redesign.hogar.ctaFamilia'
                  : 'onboarding:redesign.hogar.ctaSolo',
              )}
              busy={submitting}
              onPress={hogar === 'familia' ? () => setPanel('root') : () => void goSoloReady()}
            />
          </Animated.View>
        )
    }
  }

  return (
    <OnbScreenShell mode={mode}>
      <OnbBody>
        <OnbHeader mode={mode} title={t('onboarding:chrome.title.household')} onBack={goBack} />
        <OnbProgress mode={mode} active={2} />
        {/* Hero sin Brot (brotPose null): solo título + sub. Constante
            en todos los paneles — el sub-flujo vive debajo. */}
        <OnbHero
          mode={mode}
          title={t('onboarding:redesign.hogar.heroTitle')}
          subtitle={t('onboarding:redesign.hogar.heroSubtitle')}
          brotPose={null}
        />
        {renderPanel()}
      </OnbBody>
    </OnbScreenShell>
  )
}

// ─── Card de opción: seleccionada (well + anillo + check) o idle ─────
// Idle = card elevada + sticker + título/meta + chevron. Sirve para
// las cards toggle del panel 'mode' y las navegacionales de 'root'.

function HogarOption({
  mode,
  sticker,
  iconBackground,
  title,
  subtitle,
  selected,
  first,
  onPress,
}: {
  mode: OnbMode
  sticker: ImageSourcePropType
  iconBackground: string
  title: string
  subtitle: string
  selected: boolean
  first?: boolean
  onPress: () => void
}) {
  const s = ONB_SPEC[mode]
  const h = HOGAR_5C[mode]
  const pressScale = usePressScale({ pressedScale: 0.97 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      style={[
        styles.card,
        first ? styles.cardFirst : null,
        selected
          ? { backgroundColor: h.selectedBackground, boxShadow: h.selectedShadow }
          : {
              experimental_backgroundImage: h.idleGradientCss,
              backgroundColor: h.idleBackground,
              boxShadow: h.idleShadow,
            },
        pressScale.animatedStyle,
      ]}
    >
      {/* Placa clara (mockup) con el sticker real del onboarding. En dark
          CategorySticker apoya el sticker sobre su propia placa legible. */}
      <View style={[styles.cardIcon, { backgroundColor: iconBackground }]}>
        <CategorySticker source={sticker} size={36} />
      </View>
      <View style={styles.cardTextCol}>
        <Text style={[styles.cardTitle, { color: selected ? h.selectedTitle : s.text }]}>
          {title}
        </Text>
        <Text style={[styles.cardSub, { color: selected ? h.selectedSub : h.idleSub }]}>
          {subtitle}
        </Text>
      </View>
      {selected ? (
        <View
          style={[
            styles.checkCircle,
            { experimental_backgroundImage: h.checkGradientCss, backgroundColor: h.checkBackground },
          ]}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="#F5F2E1"
              strokeWidth={3.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </View>
      ) : (
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path
            d="M5 12h14M13 6l6 6-6 6"
            stroke={h.arrow}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      )}
    </AnimatedPressable>
  )
}

// ─── Failure state del panel: Brot worried + texto durazno ───────────
// Receta del ctaHintRow del kit (gap 7, 12/800) con la pose `worried`
// del vocabulario de error del rediseño (auth-4b / auth-pin).

function PanelError({ mode, text }: { mode: OnbMode; text: string }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(motionDurations.standard)}
      style={styles.errorRow}
    >
      <BrotMascot pose="worried" size={34} shadow={false} />
      <Text style={[styles.errorText, { color: ERROR_TEXT[mode] }]}>{text}</Text>
    </Animated.View>
  )
}

// ─── Cierre: Brot en pedestal + título + copy (transcrito de 7b/7bo) ─
//
// Los paneles de cierre son pantallas casi vacías cuyo contenido ES el
// momento. El doc ya tiene ese lenguaje resuelto en el empty state de
// Notificaciones (screens/7b.html · 7bo.html): pedestal circular 170
// elevado + pozo hundido 136 con Brot adentro, y debajo título 22/900 +
// copy 13.5/700. Se transcribe literal y se reusa acá; lo único que
// cambia es la pose y el copy. (Cuando se construya 7b, esto sube al
// kit — hoy vive local para no inventar API antes de tener el 2º uso.)

function BrotSuccess({
  mode,
  pose,
  title,
  hint,
}: {
  mode: OnbMode
  pose: BrotPose
  title: string
  hint: string
}) {
  const s = ONB_SPEC[mode]
  const h = HOGAR_5C[mode]
  const p = PEDESTAL[mode]
  return (
    <View style={styles.success}>
      <View
        style={[
          styles.pedestal,
          {
            experimental_backgroundImage: p.outerGradientCss,
            backgroundColor: p.outerBackground,
            boxShadow: p.outerShadow,
          },
        ]}
      >
        <View
          style={[
            styles.pedestalWell,
            { backgroundColor: p.wellBackground, boxShadow: p.wellShadow },
          ]}
        >
          <BrotMascot pose={pose} size={96} shadow={false} />
        </View>
      </View>
      <Text style={[styles.successTitle, { color: s.text }]}>{title}</Text>
      <Text style={[styles.successHint, { color: h.idleSub }]}>{hint}</Text>
    </View>
  )
}

// ─── Secundario "Volver": superficie elevada suave (como el back) ────

function SecondaryButton({
  mode,
  label,
  onPress,
  style,
}: {
  mode: OnbMode
  label: string
  onPress: () => void
  style?: object
}) {
  const s = ONB_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.secondaryBtn,
        { backgroundColor: s.backBackground, boxShadow: s.backShadow },
        s.backGradient
          ? {
              experimental_backgroundImage: `linear-gradient(145deg, ${s.backGradient[0]}, ${s.backGradient[1]})`,
            }
          : null,
        style,
        press.animatedStyle,
      ]}
    >
      <Text style={[styles.secondaryLabel, { color: s.text }]}>{label}</Text>
    </AnimatedPressable>
  )
}

// ─── Primario tipo pill: CTA verde con estado deshabilitado hundido ──

function PrimaryPillButton({
  mode,
  label,
  disabled,
  onPress,
  style,
}: {
  mode: OnbMode
  label: string
  disabled: boolean
  onPress: () => void
  style?: object
}) {
  const s = ONB_SPEC[mode]
  const d = PILL_DISABLED[mode]
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      onPressIn={disabled ? undefined : press.onPressIn}
      onPressOut={disabled ? undefined : press.onPressOut}
      style={[
        styles.primaryPill,
        disabled
          ? { backgroundColor: d.background, boxShadow: d.shadow }
          : {
              experimental_backgroundImage: s.ctaBackgroundCss,
              backgroundColor: mode === 'dark' ? '#EDEAD8' : '#2A4432',
              boxShadow: s.ctaShadow,
            },
        style,
        press.animatedStyle,
      ]}
    >
      <Text style={[styles.primaryPillLabel, { color: disabled ? d.text : s.ctaText }]}>
        {label}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Estilos (valores literales de 5c/5co) ───────────────────────────

const styles = StyleSheet.create({
  panel: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 14,
    borderRadius: 24,
    paddingVertical: 17,
    paddingHorizontal: 16,
  },
  cardFirst: {
    marginTop: 16,
  },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  cardSub: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Bloque de cierre (7b): flex:1 se come el aire libre del panel y
  // centra el conjunto; el CTA sigue anclado abajo por su marginTop:'auto'.
  success: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pedestal: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pedestalWell: {
    width: 136,
    height: 136,
    borderRadius: 68,
    // Brot apoya en el fondo del pozo (align flex-end + 12 de aire).
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 12,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
    marginTop: 24,
  },
  successHint: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    // line-height:1.55 del markup → 13.5 × 1.55 ≈ 21.
    lineHeight: 21,
    marginTop: 8,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 14,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 12,
  },
  errorText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  hintText: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  codeInput: {
    fontSize: 26,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    textAlign: 'center',
    letterSpacing: 6,
    padding: 0,
  },
  joinTop: {
    marginTop: 6,
  },
  joinBottom: {
    marginTop: 'auto',
    paddingBottom: 16,
    flexDirection: 'row',
    gap: 12,
  },
  rootBottom: {
    marginTop: 'auto',
    paddingBottom: 16,
  },
  secondaryBtn: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontSize: 14.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  primaryPill: {
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPillLabel: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  flex1: {
    flex: 1,
  },
  flexWide: {
    flex: 1.4,
  },
})
