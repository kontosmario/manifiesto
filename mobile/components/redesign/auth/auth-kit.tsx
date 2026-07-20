// @i18n-ignore-file — kit dev-only del rediseño de auth; copy literal del mockup.
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  type TextInputProps,
} from 'react-native'
import { StatusBar as ExpoStatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { BrotMascot } from '@/components/brot'
import { FernLogo } from '@/components/auth/fern-logo'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { nunitoFamily } from '@/theme/typography'
import { AUTH_HOME_INDICATOR_OPACITY, AUTH_SPEC, type AuthMode } from './auth-spec'
import { AppleIcon, ChevronBackIcon, EyeIcon, GoogleIcon24 } from './auth-icons'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * Kit compartido del flujo de autenticación del rediseño (Turno 4).
 * Cada pieza transcribe el markup literal de los pares 3a / 4a·4ao /
 * 4b·4bo / 4c·4co. Las pantallas componen estas piezas y agregan lo suyo.
 *
 * Réplicas bajo gate de aprobación: fidelidad primero. El logo de marca
 * usa el FernLogo real de la app (SVG, escala sin pixelarse) en vez del
 * PNG del mockup — es la misma marca y lo que la app ya renderiza.
 *
 * NORMA DE DISTRIBUCIÓN VERTICAL (owner 2026-07-17): cuando el contenido
 * de una pantalla no llena el viewport, NO se colapsa arriba dejando un
 * único vacío abajo — se reparte a lo alto: header arriba, contenido
 * principal respirando en el medio, acciones abajo. El mecanismo es
 * AuthFlexSpacer (y flexGrow en AuthScrollBody); en pantallas más altas
 * que el viewport los spacers colapsan a 0 y no cambian nada. Referencias
 * ya aprobadas de la norma: 3a (hero centrado + footer) y 4c (todo
 * centrado).
 */

// ─── Shell + status bar dibujada + home indicator ───────────────────
//
// El mockup dibuja status bar y home indicator a mano. Política del
// rediseño (decisión de proceso): la réplica dev los transcribe literal;
// la versión LIVE usa insets reales + StatusBar del sistema y los
// descarta. El modo se decide por contexto: los previews de Settings→Dev
// quedan en 'mockup' (default, gate de aprobación intacto) y el cableado
// real envuelve el árbol en <AuthLiveChrome>. Así las pantallas no
// cambian: AuthStatusBar/AuthHomeIndicator se auto-conmutan.

type AuthChromeMode = 'mockup' | 'live'

const AuthChromeContext = createContext<AuthChromeMode>('mockup')

/** Envuelve las pantallas del rediseño cuando corren en la app real. */
export function AuthLiveChrome({ children }: PropsWithChildren) {
  return <AuthChromeContext.Provider value="live">{children}</AuthChromeContext.Provider>
}

export function useAuthChromeMode(): AuthChromeMode {
  return useContext(AuthChromeContext)
}

export function AuthScreenShell({
  mode,
  bg,
  children,
}: PropsWithChildren<{ mode: AuthMode; bg?: string }>) {
  const s = AUTH_SPEC[mode]
  return <View style={[styles.shell, { backgroundColor: bg ?? s.bg }]}>{children}</View>
}

/**
 * Espaciador flexible de la norma de distribución (ver header). Las
 * pantallas cortas lo intercalan entre secciones para repartir el aire
 * en vez de acumularlo en un solo vacío; con contenido más alto que el
 * viewport colapsa a 0.
 */
export function AuthFlexSpacer() {
  return <View style={styles.flexSpacer} />
}

/**
 * Status bar dibujada (dev-only). Las dos estructuras del mockup son
 * DISTINTAS y se replican literal:
 *  · bars=4 (3a): grupo anidado — señal (flex-end, 4 barras, la 4ª
 *    tenue) + grupo batería (align center, gap 1.5: cuerpo + terminal),
 *    separados por gap 6.
 *  · bars=3 (4a/4b/4c): un solo flex (align flex-end, gap 2.5) con 3
 *    barras + batería (marginLeft 4), SIN terminal.
 */
export function AuthStatusBar({ mode, bars = 3 }: { mode: AuthMode; bars?: 3 | 4 }) {
  const s = AUTH_SPEC[mode]
  const chromeMode = useAuthChromeMode()
  const insets = useSafeAreaInsets()
  const c = s.chrome
  const heights = [4, 6, 8, 10]

  if (chromeMode === 'live') {
    // Live: el sistema dibuja su status bar sobre la app (edge-to-edge);
    // acá solo se reserva el alto real y se pide el estilo de íconos que
    // contrasta con el fondo del tema.
    return (
      <View style={{ height: insets.top }}>
        <ExpoStatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      </View>
    )
  }

  const battery = (marginLeft: number) => (
    <View style={[styles.battery, { borderColor: c, marginLeft }]}>
      <View style={{ width: '62%', height: '100%', borderRadius: 1.5, backgroundColor: c }} />
    </View>
  )

  return (
    <View style={styles.statusBar}>
      <Text style={[styles.statusTime, { color: c }]}>9:41</Text>
      {bars === 4 ? (
        // 3a: señal + grupo batería con terminal, gap 6.
        <View style={styles.statusRight4}>
          <View style={styles.signalRow}>
            {heights.map((h, i) => (
              <View
                key={i}
                style={{ width: 3, height: h, borderRadius: 1, backgroundColor: c, opacity: i === 3 ? 0.35 : 1 }}
              />
            ))}
          </View>
          <View style={styles.batteryGroup}>
            {battery(0)}
            {/* Terminal (+) de la batería. */}
            <View style={{ width: 1.5, height: 4, borderRadius: 1, backgroundColor: c }} />
          </View>
        </View>
      ) : (
        // 4a/4b/4c: 3 barras + batería en un solo flex flex-end, gap 2.5.
        <View style={styles.statusRight3}>
          {heights.slice(0, 3).map((h, i) => (
            <View key={i} style={{ width: 3, height: h, borderRadius: 1, backgroundColor: c }} />
          ))}
          {battery(4)}
        </View>
      )}
    </View>
  )
}

export function AuthHomeIndicator({
  mode,
  marginTop = 0,
  opacity,
}: {
  mode: AuthMode
  marginTop?: number
  /** Override literal (3a oscuro usa 0.7). Default = tabla por modo. */
  opacity?: number
}) {
  const s = AUTH_SPEC[mode]
  const chromeMode = useAuthChromeMode()
  const insets = useSafeAreaInsets()
  if (chromeMode === 'live') {
    // Live: el pill lo dibuja el sistema; solo se reserva el inset real.
    // Mínimo 12 para que el footer respire en devices sin gesture nav
    // (inset 0), aproximando el aire que el pill dibujado ocupaba.
    return <View style={{ height: Math.max(insets.bottom, 12), marginTop }} />
  }
  return (
    <View
      style={[
        styles.homeIndicator,
        {
          backgroundColor: s.chrome,
          opacity: opacity ?? AUTH_HOME_INDICATOR_OPACITY[mode],
          marginTop,
        },
      ]}
    />
  )
}

// ─── Header: back circular 44 + logo de marca centrado (absoluto) ────

export function AuthBackHeader({
  mode,
  onBack,
  logo = true,
}: {
  mode: AuthMode
  onBack?: () => void
  /** Opt-out del logo centrado (default: como el mockup). El plan live
   *  lo apaga: su marca ya vive en la fila del wordmark+HOGAR. */
  logo?: boolean
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  // Press hundido más marcado que los botones grandes (es un circulito).
  const press = usePressScale({ pressedScale: 0.92 })
  return (
    <View style={styles.backHeaderRow}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={t('auth:common.back')}
        onPress={() => {
          void triggerHaptic('light')
          onBack?.()
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        hitSlop={6}
        style={[
          styles.backCircle,
          { backgroundColor: s.backBackground, boxShadow: s.backShadow },
          s.backGradientCss ? { experimental_backgroundImage: s.backGradientCss } : null,
          press.animatedStyle,
        ]}
      >
        <ChevronBackIcon color={s.text} />
      </AnimatedPressable>
      {/* Logo de marca absoluto, centrado sobre la fila (42×34 en mockup). */}
      {logo ? (
        <View pointerEvents="none" style={styles.headerLogoWrap}>
          <FernLogo size={42} palette={s.fernPalette} />
        </View>
      ) : null}
    </View>
  )
}

// ─── Wordmark "Manifiesto." con el punto durazno ─────────────────────

export function AuthWordmark({ mode, size = 42 }: { mode: AuthMode; size?: number }) {
  const s = AUTH_SPEC[mode]
  return (
    <Text style={[styles.wordmark, { color: s.text, fontSize: size }]}>
      Manifiesto<Text style={{ color: s.wordmarkDot }}>.</Text>
    </Text>
  )
}

// ─── Label de campo (NOMBRE / EMAIL / CONTRASEÑA) ────────────────────

export function AuthFieldLabel({ mode, children }: PropsWithChildren<{ mode: AuthMode }>) {
  const s = AUTH_SPEC[mode]
  return <Text style={[styles.fieldLabel, { color: s.fieldLabel }]}>{children}</Text>
}

// ─── Well hundido (contenedor de input) ──────────────────────────────

export function AuthWell({
  mode,
  children,
  style,
}: PropsWithChildren<{ mode: AuthMode; style?: object }>) {
  const s = AUTH_SPEC[mode]
  return (
    <View
      style={[
        styles.well,
        { backgroundColor: s.wellBackground, boxShadow: s.wellShadow },
        style,
      ]}
    >
      {children}
    </View>
  )
}

// ─── Anillo de foco / error de los wells ─────────────────────────────
//
// Receta del OnbActiveRing aprobado en el onboarding: 2.5px que aparece
// y desaparece con un fade quick. Verde de acento para el foco; las
// pantallas piden el durazno de atención para el error (el rediseño no
// usa rojo). Absoluto: el padre da el radio.

export function AuthActiveRing({
  mode,
  visible,
  radius,
  color,
}: {
  mode: AuthMode
  visible: boolean
  radius: number
  /** Override del color (error). Default: acento del spec. */
  color?: string
}) {
  const ringColor = color ?? AUTH_SPEC[mode].linkAccent
  const opacity = useSharedValue(visible ? 1 : 0)
  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, { duration: motionDurations.quick })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
  // borderColor animado (withTiming interpola strings de color): el
  // cambio durazno→verde al limpiar un error con el campo enfocado hacía
  // snap cuando el color vivía en el estilo estático.
  const borderColor = useSharedValue(ringColor)
  useEffect(() => {
    // Invisible → set en seco (el próximo fade-in ya sale del color final);
    // visible → crossfade quick (durazno→verde al tipear sobre el error).
    if (opacity.value === 0) borderColor.value = ringColor
    else borderColor.value = withTiming(ringColor, { duration: motionDurations.quick })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringColor])
  const ringStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    borderColor: borderColor.value,
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        ringStyle,
        { borderRadius: radius, borderWidth: 2.5 },
      ]}
    />
  )
}

/**
 * Campo de texto del flujo (label + well). FUNCIONAL (owner 2026-07-17):
 * con `onChangeText` es un TextInput real — foco con anillo de acento,
 * placeholder en helper, error con anillo durazno. Sin `onChangeText`
 * queda el modo display de la réplica (Text plano).
 *
 * El placeholder va como <Text> propio superpuesto, NO como prop del
 * TextInput: en iOS el placeholder nativo se dibuja alineado abajo con
 * fonts custom (gotcha conocido del repo) y no se corrige con padding.
 */
export function AuthTextField({
  mode,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'none',
  error = false,
  right,
  topGap,
  textContentType,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  autoFocus = false,
  inputRef,
}: {
  mode: AuthMode
  label: string
  value: string
  /** Presente = input real editable; ausente = display estático. */
  onChangeText?: (text: string) => void
  placeholder?: string
  keyboardType?: KeyboardTypeOptions
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  /** Campo culpable de una validación: anillo durazno persistente. */
  error?: boolean
  right?: ReactNode
  /** Override del margen superior (mockup: 18 el primero, 16 el resto). */
  topGap?: number
  // ── Cableado live (review r1): autofill + submit por teclado — puro
  // passthrough al TextInput, cero cambio visual. Las pantallas viejas
  // los tenían (QuickType/iCloud Keychain + returnKey go/next).
  textContentType?: TextInputProps['textContentType']
  autoComplete?: TextInputProps['autoComplete']
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: () => void
  autoFocus?: boolean
  /** Ref al TextInput real (cadena next→focus de las pantallas). */
  inputRef?: Ref<TextInput>
}) {
  const s = AUTH_SPEC[mode]
  const [focused, setFocused] = useState(false)
  const editable = onChangeText !== undefined
  return (
    <View style={[styles.fieldBlock, topGap !== undefined ? { marginTop: topGap } : null]}>
      <AuthFieldLabel mode={mode}>{label}</AuthFieldLabel>
      <AuthWell mode={mode} style={editable || right ? styles.wellRow : undefined}>
        {editable ? (
          <View style={styles.inputWrap}>
            {value.length === 0 && placeholder ? (
              <Text
                pointerEvents="none"
                numberOfLines={1}
                style={[styles.fieldValue, styles.placeholderOverlay, { color: s.helper }]}
              >
                {placeholder}
              </Text>
            ) : null}
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              autoCorrect={false}
              textContentType={textContentType}
              autoComplete={autoComplete}
              returnKeyType={returnKeyType}
              onSubmitEditing={onSubmitEditing}
              autoFocus={autoFocus}
              accessibilityLabel={label}
              style={[styles.fieldInput, { color: s.text }]}
            />
          </View>
        ) : (
          <Text style={[styles.fieldValue, right ? styles.fieldValueFlex : null, { color: s.text }]}>
            {value}
          </Text>
        )}
        {right}
        {/* El error (durazno) pisa al foco (acento): mientras el campo sea
            el culpable de una validación, el anillo no cambia de color al
            tocarlo — cambia recién cuando la pantalla limpia el error. */}
        {editable ? (
          <AuthActiveRing
            mode={mode}
            visible={focused || error}
            radius={18}
            color={error ? s.strengthLabel : undefined}
          />
        ) : null}
      </AuthWell>
    </View>
  )
}

/**
 * Campo de contraseña: toggle de ojo (mostrar/ocultar). FUNCIONAL (owner
 * 2026-07-17): con `onChangeText` es un TextInput real con
 * secureTextEntry — bullets nativos, foco con anillo, error durazno.
 * Sin `onChangeText`, modo display (bullets dibujados, réplica).
 */
export function AuthPasswordField({
  mode,
  label,
  bulletCount = 10,
  revealed = false,
  value,
  onChangeText,
  placeholder,
  error = false,
  onToggleReveal,
  topGap,
  textContentType,
  autoComplete,
  returnKeyType,
  onSubmitEditing,
  autoFocus = false,
  inputRef,
}: {
  mode: AuthMode
  label: string
  /** Solo modo display: cantidad de bullets dibujados. */
  bulletCount?: number
  revealed?: boolean
  value?: string
  /** Presente = input real editable; ausente = display estático. */
  onChangeText?: (text: string) => void
  placeholder?: string
  /** Campo culpable de una validación: anillo durazno persistente. */
  error?: boolean
  onToggleReveal?: () => void
  topGap?: number
  // ── Cableado live (review r1): autofill + submit por teclado — puro
  // passthrough al TextInput, cero cambio visual.
  textContentType?: TextInputProps['textContentType']
  autoComplete?: TextInputProps['autoComplete']
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: () => void
  autoFocus?: boolean
  /** Ref al TextInput real (cadena next→focus de las pantallas). */
  inputRef?: Ref<TextInput>
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  const [focused, setFocused] = useState(false)
  const editable = onChangeText !== undefined
  const display = revealed && value ? value : '•'.repeat(bulletCount)
  return (
    <View style={[styles.fieldBlock, topGap !== undefined ? { marginTop: topGap } : null]}>
      <AuthFieldLabel mode={mode}>{label}</AuthFieldLabel>
      <AuthWell mode={mode} style={styles.wellRow}>
        {editable ? (
          <View style={styles.inputWrap}>
            {(value ?? '').length === 0 && placeholder ? (
              <Text
                pointerEvents="none"
                numberOfLines={1}
                style={[styles.fieldValue, styles.placeholderOverlay, { color: s.helper }]}
              >
                {placeholder}
              </Text>
            ) : null}
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              secureTextEntry={!revealed}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={textContentType}
              autoComplete={autoComplete}
              returnKeyType={returnKeyType}
              onSubmitEditing={onSubmitEditing}
              autoFocus={autoFocus}
              accessibilityLabel={label}
              style={[
                styles.fieldInput,
                styles.passwordInput,
                revealed ? styles.passwordRevealed : null,
                { color: s.text },
              ]}
            />
          </View>
        ) : (
          <Text
            style={[
              styles.passwordValue,
              revealed && value ? styles.passwordRevealed : null,
              { color: s.text },
            ]}
          >
            {display}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={revealed ? t('states:passwordField.hide') : t('states:passwordField.show')}
          onPress={() => {
            void triggerHaptic('light')
            onToggleReveal?.()
          }}
          hitSlop={8}
        >
          <EyeIcon color={s.textSoft} off={revealed} />
        </Pressable>
        {editable ? (
          <AuthActiveRing
            mode={mode}
            visible={focused || error}
            radius={18}
            color={error ? s.strengthLabel : undefined}
          />
        ) : null}
      </AuthWell>
    </View>
  )
}

// ─── Medidor de fuerza de contraseña (3 barras + label) ──────────────

export function AuthStrengthMeter({
  mode,
  filled,
  label,
}: {
  mode: AuthMode
  /** Barras llenas (0–3). */
  filled: number
  label: string
}) {
  const s = AUTH_SPEC[mode]
  return (
    <View style={styles.strengthRow}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.strengthBar,
            i < filled
              ? { backgroundColor: s.strengthFill }
              : { backgroundColor: s.strengthIdleBackground, boxShadow: s.strengthIdleShadow },
          ]}
        />
      ))}
      <Text style={[styles.strengthLabel, { color: s.strengthLabel }]}>{label}</Text>
    </View>
  )
}

// ─── Divisor "o" ─────────────────────────────────────────────────────

export function AuthDivider({ mode, topGap }: { mode: AuthMode; topGap?: number }) {
  const s = AUTH_SPEC[mode]
  return (
    <View style={[styles.dividerRow, topGap !== undefined ? { marginTop: topGap } : null]}>
      <View style={[styles.dividerLine, { backgroundColor: s.dividerLine }]} />
      <Text style={[styles.dividerText, { color: s.dividerText }]}>o</Text>
      <View style={[styles.dividerLine, { backgroundColor: s.dividerLine }]} />
    </View>
  )
}

// ─── CTA primario (variantes green / neutral / welcome) + hint ───────
//
// Deshabilitado bloquea la acción y, si hay disabledHint, muestra Brot
// `think` + texto durazno explicando qué falta — mismo patrón aprobado
// del onboarding (OnbCta). El fondo activo↔deshabilitado es un crossfade
// (los strings de gradiente/boxShadow no son animables).

type CtaVariant = 'green' | 'neutral' | 'welcome'

const CTA_DISABLED = {
  light: {
    text: '#9AA694',
    background: undefined as string | undefined,
    shadow: 'inset 5px 5px 10px rgba(151,160,136,0.42), inset -5px -5px 10px rgba(255,255,255,0.92)',
    hintText: '#B0764A',
  },
  dark: {
    text: '#7C917A',
    background: '#142519' as string | undefined,
    shadow: 'inset 5px 5px 10px rgba(0,0,0,0.5), inset -5px -5px 10px rgba(101,152,113,0.08)',
    hintText: '#F2A87E',
  },
} as const

export function AuthCta({
  mode,
  variant = 'green',
  label,
  onPress,
  disabled = false,
  disabledHint,
  onDisabledPress,
  busy = false,
}: {
  mode: AuthMode
  variant?: CtaVariant
  label: string
  onPress?: () => void
  disabled?: boolean
  disabledHint?: string
  /** Tap sobre el CTA bloqueado — la pantalla marca sus campos culpables
   *  y es dueña del háptico; sin callback, el kit pone el 'light'. */
  onDisabledPress?: () => void
  /** Acción en vuelo (p.ej. escaneo biométrico): el press se ignora en
   *  silencio — sin háptico ni onPress — pero el visual queda ACTIVO
   *  (busy no es disabled). */
  busy?: boolean
}) {
  const s = AUTH_SPEC[mode]
  const d = CTA_DISABLED[mode]
  const [hintVisible, setHintVisible] = useState(false)

  const bgCss =
    variant === 'green' ? s.ctaGreenCss : variant === 'welcome' ? s.ctaWelcomeCss : s.ctaNeutralCss
  const fallback =
    variant === 'green'
      ? s.ctaGreenFallback
      : variant === 'welcome'
        ? s.ctaWelcomeFallback
        : s.ctaNeutralFallback
  const shadow =
    variant === 'green'
      ? s.ctaGreenShadow
      : variant === 'welcome'
        ? s.ctaWelcomeShadow
        : s.ctaNeutralShadow
  const textColor =
    variant === 'green' ? s.ctaGreenText : variant === 'welcome' ? s.ctaWelcomeText : s.ctaNeutralText

  // 1 = deshabilitado (semántica de las capas de abajo); inicializa YA
  // en el estado final para no crossfadear en el mount.
  const active = useSharedValue(disabled ? 1 : 0)
  useEffect(() => {
    active.value = withTiming(disabled ? 1 : 0, { duration: motionDurations.standard })
    if (!disabled) setHintVisible(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled])
  const activeLayer = useAnimatedStyle(() => ({ opacity: 1 - active.value }))
  const disabledLayer = useAnimatedStyle(() => ({ opacity: active.value }))

  const handlePress = () => {
    if (busy) return
    if (disabled) {
      // onDisabledPress hereda la discriminación tap-vs-scroll del
      // responder system (slop, cancelación del ScrollView,
      // pressRetentionOffset, un fire por gesto) — los wrappers
      // onTouchEnd de las pantallas marcaban errores espurios en
      // drag-release en Android cuando el contenido no desborda.
      if (onDisabledPress) onDisabledPress()
      else void triggerHaptic('light')
      if (disabledHint) setHintVisible(true)
      return
    }
    // Acción primaria: háptico de selección (mismo feedback que los
    // triggers primarios del flujo real).
    void triggerHaptic('selection')
    onPress?.()
  }

  // Press feedback premium (owner 2026-07-17): scale sutil, mismo rango
  // que los secundarios del onboarding (0.98).
  const press = usePressScale({ pressedScale: 0.98 })

  return (
    <View>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy }}
        onPress={handlePress}
        onPressIn={busy ? undefined : press.onPressIn}
        // onPressOut SIEMPRE cableado: un press que cruza el flip a busy
        // no debe dejar la escala clavada.
        onPressOut={press.onPressOut}
        // 3a "Empezar" es el único CTA con padding 17 (el resto 16).
        style={[styles.cta, variant === 'welcome' ? styles.ctaWelcome : null, press.animatedStyle]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ctaLayer,
            activeLayer,
            { experimental_backgroundImage: bgCss, backgroundColor: fallback, boxShadow: shadow },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.ctaLayer, disabledLayer, { backgroundColor: d.background, boxShadow: d.shadow }]}
        />
        <Text
          style={[
            styles.ctaLabel,
            variant === 'welcome' ? styles.ctaLabelWelcome : null,
            { color: disabled ? d.text : textColor },
          ]}
        >
          {label}
        </Text>
      </AnimatedPressable>
      {hintVisible && disabled && disabledHint ? (
        <Animated.View entering={FadeInDown.duration(motionDurations.standard)} style={styles.ctaHintRow}>
          <BrotMascot pose="think" size={34} shadow={false} />
          <Text style={[styles.ctaHintText, { color: d.hintText }]}>{disabledHint}</Text>
        </Animated.View>
      ) : null}
    </View>
  )
}

/** Secundario hundido (3a "Ya tengo cuenta"). */
export function AuthSecondaryButton({
  mode,
  label,
  onPress,
}: {
  mode: AuthMode
  label: string
  onPress?: () => void
}) {
  const s = AUTH_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => {
        void triggerHaptic('light')
        onPress?.()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.secondary,
        { backgroundColor: s.secondaryBackground, boxShadow: s.secondaryShadow },
        press.animatedStyle,
      ]}
    >
      <Text style={[styles.secondaryLabel, { color: s.secondaryText }]}>{label}</Text>
    </AnimatedPressable>
  )
}

// ─── Botones sociales (Apple / Google) ───────────────────────────────
//
// DECISIÓN OWNER (2026-07-16, supersede a ambos mockups): crear cuenta
// y login llevan LOS MISMOS botones sociales — en COLUMNA, ancho
// completo, con el tratamiento de color de la fila del login (4b/4bo:
// en oscuro Apple crema + Google hundido con anillo menta). La variante
// apilada de 4a y la fila de 4b quedaron retiradas.

type SocialProvider = 'apple' | 'google'

export function AuthSocialButton({
  mode,
  provider,
  onPress,
}: {
  mode: AuthMode
  provider: SocialProvider
  onPress?: () => void
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  const isApple = provider === 'apple'
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      onPress={() => {
        void triggerHaptic('light')
        onPress?.()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.socialBtn,
        isApple
          ? { backgroundColor: s.appleBtnBackground, boxShadow: s.appleShadow }
          : { backgroundColor: s.googleBtnBackground, boxShadow: s.googleBtnShadow },
        press.animatedStyle,
      ]}
    >
      {isApple ? <AppleIcon color={s.appleBtnText} size={16} /> : <GoogleIcon24 size={17} />}
      <Text style={[styles.socialBtnLabel, { color: isApple ? s.appleBtnText : s.googleBtnText }]}>
        {isApple ? t('auth:common.continueWithApple') : t('auth:common.continueWithGoogle')}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Legal con spans "Términos" y "Privacidad" subrayados ────────────

export function AuthLegal({
  mode,
  prefix,
  size,
  onTerms,
  onPrivacy,
}: {
  mode: AuthMode
  /** Texto antes de "los Términos y la Privacidad." */
  prefix: string
  /** fontSize literal (3a=11.5 default, 4a=11). */
  size?: number
  onTerms?: () => void
  onPrivacy?: () => void
}) {
  const s = AUTH_SPEC[mode]
  const { t } = useTranslation()
  return (
    <Text style={[styles.legal, size !== undefined ? { fontSize: size } : null, { color: s.legalText }]}>
      {prefix} {t('auth:welcome.fineprintArticle')}{' '}
      <Text style={styles.legalLink} onPress={onTerms}>{t('auth:welcome.fineprintTerms')}</Text>{' '}
      {t('auth:welcome.fineprintAnd')}{' '}
      <Text style={styles.legalLink} onPress={onPrivacy}>{t('auth:welcome.fineprintPrivacy')}</Text>.
    </Text>
  )
}

// ─── Medallón durazno del login (4b) con el logo crema adentro ───────
//
// Sin Brot: se probó `brotPose` (asomando detrás) y el owner lo retiró
// de 4b (2026-07-17). El peek detrás-del-círculo vive solo en el hero
// del login returning (auth-login-vistas.tsx).

export function AuthMedallion({ mode }: { mode: AuthMode }) {
  const s = AUTH_SPEC[mode]
  return (
    <View style={styles.medallionWrap}>
      <View
        style={[
          styles.medallion,
          { experimental_backgroundImage: s.medallionCss, backgroundColor: '#E08A5E', boxShadow: s.medallionShadow },
        ]}
      >
        {/* Logo crema en ambos temas (el fondo durazno es claro). */}
        <FernLogo size={64} palette="light" />
      </View>
    </View>
  )
}

// ─── Link de texto (variantes por tono) ──────────────────────────────

export function AuthLink({
  mode,
  tone,
  children,
  underline = false,
  onPress,
  style,
}: PropsWithChildren<{
  mode: AuthMode
  tone: 'accent' | 'muted' | 'soft'
  underline?: boolean
  onPress?: () => void
  style?: object
}>) {
  const s = AUTH_SPEC[mode]
  const color = tone === 'accent' ? s.linkAccent : tone === 'muted' ? s.linkMuted : s.linkSoft
  return (
    // Wrapper transparente solo para el feedback de press (opacidad) y
    // el hitSlop — el Text conserva todos sus estilos, incluidos los de
    // layout que le pasan las pantallas.
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void triggerHaptic('light')
        onPress?.()
      }}
      hitSlop={8}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
    >
      <Text style={[styles.link, underline ? styles.linkUnderline : null, { color }, style]}>
        {children}
      </Text>
    </Pressable>
  )
}

// ─── ScrollBody para 4a/4b (no entran en pantalla) ───────────────────

interface AuthScrollBodyProps extends PropsWithChildren {
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
  extraBottomPad?: number
  gutter?: number
  /** Pull-to-refresh del caller LIVE (p.ej. refetch del entitlement en
   *  el paywall). El preview dev no lo pasa — réplica intacta. */
  refreshControl?: ReactElement<RefreshControlProps>
}
export const AuthScrollBody = forwardRef<ScrollView, AuthScrollBodyProps>(function AuthScrollBody(
  { children, onScroll, extraBottomPad = 0, gutter = 22, refreshControl },
  ref,
) {
  return (
    <ScrollView
      ref={ref}
      refreshControl={refreshControl}
      contentContainerStyle={[
        { paddingHorizontal: gutter, paddingBottom: 20 + extraBottomPad },
        styles.scrollBodyContent,
      ]}
      keyboardShouldPersistTaps="handled"
      // Con inputs reales el teclado del SO tapa los campos bajos: iOS lo
      // resuelve con los insets automáticos del ScrollView; Android ya
      // resizea la ventana (windowSoftInputMode adjustResize).
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      onScroll={onScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  )
})

// ─── Estilos (valores literales de 3a/4a/4b/4c) ──────────────────────

const styles = StyleSheet.create({
  shell: { flex: 1 },
  flexSpacer: { flex: 1 },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 18,
    paddingHorizontal: 28,
    paddingBottom: 4,
  },
  statusTime: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
  statusRight4: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusRight3: { flexDirection: 'row', alignItems: 'flex-end', gap: 2.5 },
  signalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2.5 },
  batteryGroup: { flexDirection: 'row', alignItems: 'center', gap: 1.5 },
  battery: {
    width: 23,
    height: 11.5,
    borderWidth: 1.5,
    borderRadius: 3.5,
    padding: 1.5,
  },
  homeIndicator: { width: 132, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 10 },
  backHeaderRow: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  wordmark: { fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: -0.4 },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.84,
  },
  fieldBlock: { marginTop: 16 },
  well: { marginTop: 8, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  wellRow: { flexDirection: 'row', alignItems: 'center' },
  fieldValue: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
  fieldValueFlex: { flex: 1 },
  // Input real dentro del well: mismo tratamiento tipográfico que el
  // valor display; padding 0 para que el well (14/16) dé la altura.
  inputWrap: { flex: 1, justifyContent: 'center' },
  placeholderOverlay: { position: 'absolute', left: 0, right: 0 },
  fieldInput: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    padding: 0,
  },
  // La contraseña real hereda el letterSpacing de los bullets del mockup
  // mientras está oculta; al revelar pasa al spacing de texto normal.
  passwordInput: { fontWeight: '900', fontFamily: nunitoFamily('900'), letterSpacing: 3 },
  passwordValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 3,
  },
  passwordRevealed: { letterSpacing: 0.2 },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  strengthBar: { flex: 1, height: 6, borderRadius: 3 },
  strengthLabel: {
    fontSize: 12.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginLeft: 4,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  dividerLine: { flex: 1, height: 1.5 },
  dividerText: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },
  cta: {
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaWelcome: { padding: 17 },
  ctaLayer: { ...StyleSheet.absoluteFillObject, borderRadius: 24 },
  ctaLabel: { fontSize: 16, fontWeight: '900', fontFamily: nunitoFamily('900') },
  ctaLabelWelcome: { fontSize: 16.5 },
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
  secondary: { borderRadius: 24, padding: 15, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
  // Full-width en columna (geometría del apilado de 4a: radius 24,
  // padding 15, texto 15/900; colores del login vía spec).
  socialBtn: {
    borderRadius: 24,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  socialBtnLabel: { fontSize: 15, fontWeight: '900', fontFamily: nunitoFamily('900') },
  legal: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: { textDecorationLine: 'underline' },
  medallionWrap: { alignItems: 'center' },
  medallion: {
    width: 124,
    height: 124,
    borderRadius: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { fontSize: 13, fontWeight: '800', fontFamily: nunitoFamily('800'), textAlign: 'center' },
  linkUnderline: { textDecorationLine: 'underline' },
  // flexGrow: con contenido corto el container llena el viewport y los
  // AuthFlexSpacer reparten el aire (norma de distribución); con
  // contenido alto no cambia nada (el scroll manda).
  scrollBodyContent: { paddingTop: 10, flexGrow: 1 },
})
