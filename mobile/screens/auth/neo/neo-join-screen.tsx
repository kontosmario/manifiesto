import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native'
import { Text, TextInput } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { CategorySticker } from '@/components/category/category-sticker'
import { RequireGuest } from '@/components/guards'
import { ONBOARDING_ICONS } from '@/components/onboarding/onboarding-icon-registry'
import {
  AuthActiveRing,
  AuthCta,
  AuthFieldLabel,
  AuthLiveChrome,
} from '@/components/redesign/auth/auth-kit'
import { AUTH_SPEC, type AuthMode } from '@/components/redesign/auth/auth-spec'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useJoinController } from '@/features/family/use-join-controller'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion/tokens'
import { useThemeMode } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'
import { NeoAuthErrorRow, NeoAuthPanel } from './neo-auth-panels'

/**
 * Unirse a un hogar / crear uno — destino del bridge para una sesión
 * SIN familia. No tiene maqueta propia: se compone con el vocabulario
 * aprobado del funnel de auth (esqueleto del 4b vía NeoAuthPanel) y con
 * la anatomía del paso "Tu hogar" del onboarding, que ya resolvió este
 * mismo ramal en neumórfico: dos cards (crear / unirse) que se eligen y
 * un panel debajo con la acción de la rama elegida. El código de invite
 * vive en un pozo hundido con tipografía 900 y tracking.
 *
 * La lógica es la de siempre: `useJoinController` intacto (bootstrap /
 * consume invite, navegación y hápticos de resultado incluidos), el
 * cambio de rama limpia el error como antes y el copy sale de las
 * mismas claves `auth:join.*`.
 */

type JoinChoice = 'create' | 'join'

/** Máximo del código de invitación (igual que la pantalla anterior). */
const MAX_CODE = 8

/** Card de rama: elevada en idle, hundida con anillo al elegirla.
 *  Receta del paso "Tu hogar" del onboarding, transcripta local para no
 *  acoplar los turnos (mismo criterio que el resto del kit). */
interface JoinCardSpec {
  selectedBackground: string
  selectedShadow: string
  selectedTitle: string
  selectedSub: string
  idleGradientCss: string
  idleBackground: string
  idleShadow: string
  idleSub: string
  arrow: string
  checkGradientCss: string
  checkBackground: string
  iconCreate: string
  iconJoin: string
}

const JOIN_CARD: Record<AuthMode, JoinCardSpec> = {
  light: {
    selectedBackground: '#DCEBD8',
    selectedShadow:
      'inset 3px 3px 7px rgba(90,110,70,0.2), inset -3px -3px 7px rgba(255,255,255,0.85), 0 0 0 2.5px #2E7C39',
    selectedTitle: '#1F5429',
    selectedSub: '#4E6B54',
    idleGradientCss: 'linear-gradient(145deg, #F3F4E9, #E4E6D8)',
    idleBackground: '#ECEDE1',
    idleShadow: '8px 8px 18px rgba(151,160,136,0.42), -8px -8px 18px rgba(255,255,255,0.92)',
    // Verde profundo del sub (el gris apagado del onboarding se queda en
    // 3.8:1 sobre la card clara; este llega a 5:1 en idle y 4.8:1 elegida).
    idleSub: '#4E6B54',
    arrow: '#2E7C39',
    checkGradientCss: 'radial-gradient(circle at 32% 28%, #489350, #2E7434 85%)',
    checkBackground: '#489A4E',
    iconCreate: '#DCEBD8',
    iconJoin: '#F7E3CF',
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
    iconCreate: 'rgba(164,227,166,0.13)',
    iconJoin: 'rgba(247,227,207,0.13)',
  },
}

/** Anillo del pozo del código cuando el inset no se dibuja (Android viejo). */
const CODE_WELL_BORDER: Record<AuthMode, string> = {
  light: 'rgba(151,160,136,0.5)',
  dark: 'rgba(101,152,113,0.35)',
}

export function NeoJoinScreen() {
  const { t } = useTranslation()
  const mode = useThemeMode().resolvedMode
  const s = AUTH_SPEC[mode]
  const controller = useJoinController()
  const [choice, setChoice] = useState<JoinChoice>('create')
  const [codeFocused, setCodeFocused] = useState(false)

  // Igual que antes: cambiar de rama limpia el error del intento previo.
  const { clearError } = controller.actions
  const changeChoice = useCallback(
    (next: JoinChoice) => {
      clearError()
      setChoice(next)
    },
    [clearError],
  )

  const creating = choice === 'create'
  const loadingHint = creating
    ? t('auth:join.creatingHome')
    : t('auth:join.validatingAccess')

  return (
    <RequireGuest allowFamilylessSession>
      <AuthLiveChrome>
        <NeoAuthPanel
          mode={mode}
          eyebrow={t('auth:join.heroLabel')}
          title={t('auth:join.screenTitle')}
          lead={t('auth:join.screenSubtitle')}
          footer={
            <>
              {controller.errorMessage ? (
                <NeoAuthErrorRow mode={mode} text={controller.errorMessage} />
              ) : null}
              {creating ? (
                <AuthCta
                  mode={mode}
                  variant="green"
                  label={t('auth:join.createButton')}
                  busy={controller.bootstrapMutation.isPending}
                  onPress={controller.actions.createFamily}
                />
              ) : (
                <AuthCta
                  mode={mode}
                  variant="neutral"
                  label={t('auth:join.joinButton')}
                  disabled={!controller.canJoinWithCode}
                  disabledHint={t('auth:join.codeHelper')}
                  busy={controller.joinMutation.isPending}
                  onPress={controller.actions.joinWithCode}
                />
              )}
              {controller.isLoading ? (
                <Text style={[styles.loadingHint, { color: s.textSoft }]}>{loadingHint}</Text>
              ) : null}
            </>
          }
        >
          <ChoiceCard
            mode={mode}
            sticker={ONBOARDING_ICONS.casa}
            iconBackground={JOIN_CARD[mode].iconCreate}
            title={t('auth:join.createCardTitle')}
            subtitle={t('auth:join.createCardDescription')}
            selected={creating}
            first
            onPress={() => changeChoice('create')}
          />
          <ChoiceCard
            mode={mode}
            sticker={ONBOARDING_ICONS.compartir}
            iconBackground={JOIN_CARD[mode].iconJoin}
            title={t('auth:join.joinCardTitle')}
            subtitle={t('auth:join.joinCardDescription')}
            selected={!creating}
            onPress={() => changeChoice('join')}
          />

          {/* key={choice}: el panel de la rama entra con el fade estándar
              del flujo (una animación one-shot por cambio, nada por frame). */}
          <Animated.View
            key={choice}
            entering={FadeIn.duration(motionDurations.standard)}
            exiting={FadeOut.duration(motionDurations.quick)}
          >
            <Text style={[styles.branchCopy, { color: s.textSoft }]}>
              {creating ? t('auth:join.createFormCopy') : t('auth:join.joinFormCopy')}
            </Text>

            {creating ? null : (
              <View style={styles.codeBlock}>
                <AuthFieldLabel mode={mode}>
                  {t('auth:join.codeLabel').toUpperCase()}
                </AuthFieldLabel>
                <View
                  style={[
                    styles.codeWell,
                    {
                      backgroundColor: s.wellBackground,
                      boxShadow: s.wellShadow,
                      // Android < API 29 descarta el inset EN SILENCIO:
                      // sin el hairline el pozo desaparece del todo.
                      borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1.5,
                      borderColor: CODE_WELL_BORDER[mode],
                    },
                  ]}
                >
                  {controller.code.length === 0 ? (
                    <Text
                      pointerEvents="none"
                      numberOfLines={1}
                      style={[styles.codeInput, styles.codePlaceholder, { color: s.helper }]}
                    >
                      {t('auth:join.codePlaceholder')}
                    </Text>
                  ) : null}
                  <TextInput
                    accessibilityLabel={t('auth:join.codeLabel')}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={MAX_CODE}
                    onBlur={() => setCodeFocused(false)}
                    onChangeText={controller.actions.setCode}
                    onFocus={() => setCodeFocused(true)}
                    style={[styles.codeInput, { color: s.text }]}
                    textContentType="oneTimeCode"
                    value={controller.code}
                  />
                  <AuthActiveRing mode={mode} visible={codeFocused} radius={22} />
                </View>
                {/* Helper + contador en `textSoft`: el helper apagado del
                    spec no llega a AA sobre el fondo claro. */}
                <View style={styles.codeHelperRow}>
                  <Text style={[styles.codeHelper, { color: s.textSoft }]}>
                    {t('auth:join.codeHelper')}
                  </Text>
                  <Text style={[styles.codeCounter, { color: s.textSoft }]}>
                    {`${controller.code.length}/${MAX_CODE}`}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>
        </NeoAuthPanel>
      </AuthLiveChrome>
    </RequireGuest>
  )
}

// ─── Card de rama (elegida = pozo + anillo + check; idle = elevada) ──

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

function ChoiceCard({
  mode,
  sticker,
  iconBackground,
  title,
  subtitle,
  selected,
  first,
  onPress,
}: {
  mode: AuthMode
  sticker: ImageSourcePropType
  iconBackground: string
  title: string
  subtitle: string
  selected: boolean
  first?: boolean
  onPress: () => void
}) {
  const s = AUTH_SPEC[mode]
  const c = JOIN_CARD[mode]
  const press = usePressScale({ pressedScale: 0.97 })
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        styles.card,
        first ? styles.cardFirst : null,
        selected
          ? { backgroundColor: c.selectedBackground, boxShadow: c.selectedShadow }
          : {
              experimental_backgroundImage: c.idleGradientCss,
              backgroundColor: c.idleBackground,
              boxShadow: c.idleShadow,
            },
        press.animatedStyle,
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: iconBackground }]}>
        <CategorySticker source={sticker} size={36} />
      </View>
      <View style={styles.cardCopy}>
        <Text style={[styles.cardTitle, { color: selected ? c.selectedTitle : s.text }]}>
          {title}
        </Text>
        <Text style={[styles.cardSub, { color: selected ? c.selectedSub : c.idleSub }]}>
          {subtitle}
        </Text>
      </View>
      {selected ? (
        <View
          style={[
            styles.checkCircle,
            {
              experimental_backgroundImage: c.checkGradientCss,
              backgroundColor: c.checkBackground,
            },
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
            stroke={c.arrow}
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

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 14,
    borderRadius: 24,
    paddingVertical: 17,
    paddingHorizontal: 16,
  },
  cardFirst: { marginTop: 22 },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '900', fontFamily: nunitoFamily('900') },
  cardSub: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 17,
    marginTop: 2,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchCopy: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 20,
    marginTop: 20,
  },
  codeBlock: { marginTop: 20 },
  codeWell: {
    marginTop: 8,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  codeInput: {
    fontSize: 26,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 6,
    textAlign: 'center',
    padding: 0,
  },
  // Placeholder como <Text> propio superpuesto (en iOS el nativo se
  // dibuja alineado abajo con fonts custom): mismo recurso que el kit.
  codePlaceholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.5,
  },
  codeHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  codeHelper: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 16,
  },
  codeCounter: { fontSize: 12, fontWeight: '800', fontFamily: nunitoFamily('800') },
  loadingHint: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 12,
  },
})
