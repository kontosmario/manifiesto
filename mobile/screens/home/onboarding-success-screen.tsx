import { useCallback, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RequireAuth } from '@/components/guards'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { isAvatarSlug } from '@/assets/avatars'
import { RiseView } from '@/components/home/animated/rise-view'
import { PermissionPrimeSheet } from '@/components/permissions/permission-prime-sheet'
import { useIsSolo } from '@/features/family/use-is-solo'
import { useMyProfile } from '@/features/profile/use-profile'
import { onboardingSuccessCopy } from '@/features/onboarding/success-copy'
import { usePushPermissionPrime } from '@/features/push/use-push-permission-prime'
import { triggerHaptic } from '@/lib/haptics'
import { authTokens } from '@/theme/palette'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'
import { nunitoFamily } from '@/theme/typography'

const CREAM = authTokens.surfaceCream
const PEACH = authTokens.peach
const CLAY = authTokens.clay
const DARK_GREEN = authTokens.welcomeBg
const TEXT_ON_CREAM = authTokens.welcomeBg          // brand dark green for body text on cream canvas
const TEXT_ON_CREAM_SOFT = 'rgba(14,58,38,0.72)'    // soft @72% alpha (5.2:1 AA; 0.6 daba 3.77)

/**
 * Post-onboarding success screen. Sits between the wizard's last step y la
 * pantalla de bienvenida al acceso completo (trial-welcome), que va antes de
 * Home. Tap-to-continue, sin auto-dismiss, para que el usuario sienta el
 * momento de cierre. El pre-prompt de notificaciones vive ACÁ (lo ve toda
 * cuenta nueva, también las que la pantalla de acceso saltea). Una vez en
 * Home, el tour de Home auto-fira (mecánica existente en `useScreenTour`).
 */
export function OnboardingSuccessScreen() {
  return (
    <RequireAuth>
      {({ userId, familyId }) => (
        <OnboardingSuccessBody userId={userId} familyId={familyId} />
      )}
    </RequireAuth>
  )
}

function OnboardingSuccessBody({
  userId,
  familyId,
}: {
  userId: string
  familyId: string
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const isSolo = useIsSolo(userId)
  const profileQuery = useMyProfile(userId)
  const profile = profileQuery.data

  const firstName = useMemo(() => {
    const raw = profile?.display_name?.trim() ?? ''
    return raw.split(/\s+/)[0] ?? ''
  }, [profile?.display_name])

  const copy = useMemo(
    () =>
      onboardingSuccessCopy({
        kind: isSolo ? 'solo' : 'shared',
        firstName,
      }),
    // `t` is included so the resolved copy re-computes on a language switch
    // (onboardingSuccessCopy reads strings via the shared i18n instance).
    [isSolo, firstName, t],
  )

  const avatarSlug = profile?.avatar_animal && isAvatarSlug(profile.avatar_animal)
    ? profile.avatar_animal
    : null

  // Priming sheet — pre-prompt de notifs. Sólo lo abrimos si:
  //   1. La build soporta push (canUseNativePushNotifications)
  //   2. El cooldown está vencido (nunca se dismisseó, o pasó >7d).
  // Cuando el user tap "Continuar":
  //   - Si entra al sheet → Allow llama el prompt nativo y navega.
  //   - Si entra al sheet → Dismiss marca cooldown y navega.
  //   - Si no entra al sheet → navega directo (cooldown activo o
  //     build sin push).
  // Lógica de priming compartida con el re-prompt del Home — un solo
  // lugar marca el cooldown, dispara el prompt y registra el token.
  const prime = usePushPermissionPrime({ userId, familyId })
  const { showIfEligible, onAllow, onDismiss } = prime

  const navigateNext = useCallback(() => {
    // Antes de Home pasamos por la bienvenida al acceso completo (trial-welcome).
    // Esa pantalla decide si anunciar el período de acceso o saltar a Home según
    // el entitlement. El pre-prompt de notifs queda aquí (lo ve toda cuenta nueva,
    // también las que esa pantalla saltea).
    router.replace('/(app)/trial-welcome')
  }, [router])

  const handleContinue = useCallback(async () => {
    void triggerHaptic('selection')
    // El sheet se muestra sólo si corresponde (build soporta push, sin
    // permiso aún, cooldown vencido); si no, navegamos directo.
    const shown = await showIfEligible()
    if (!shown) navigateNext()
  }, [showIfEligible, navigateNext])

  const handlePrimeAllow = useCallback(async () => {
    // onAllow marca el cooldown, dispara el prompt nativo y registra el
    // token si concede. No bloqueamos la navegación a Home pase lo que pase.
    await onAllow()
    navigateNext()
  }, [onAllow, navigateNext])

  const handlePrimeDismiss = useCallback(async () => {
    await onDismiss()
    navigateNext()
  }, [onDismiss, navigateNext])

  return (
    <View style={[styles.root, { backgroundColor: CREAM }]}>
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <RiseView delay={100} duration={620} style={styles.eyebrowSlot}>
          <Text style={[styles.eyebrow, { color: TEXT_ON_CREAM_SOFT }]}>
            {copy.eyebrow}
          </Text>
        </RiseView>

        <RiseView delay={180} duration={620} style={styles.titleSlot}>
          <Text style={[styles.title, { color: TEXT_ON_CREAM }]}>
            {copy.title}
          </Text>
        </RiseView>

        <RiseView delay={260} duration={620} style={styles.avatarSlot}>
          <View style={styles.avatarShell}>
            <LinearGradient
              colors={[PEACH, CLAY]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {avatarSlug ? (
              <AvatarAnimal
                slug={avatarSlug}
                size={108}
                tint={CREAM}
                backgroundTint="transparent"
              />
            ) : null}
          </View>
        </RiseView>

        <RiseView delay={340} duration={620} style={styles.subtitleSlot}>
          <Text style={[styles.subtitle, { color: TEXT_ON_CREAM_SOFT }]}>
            {copy.subtitle}
          </Text>
        </RiseView>
      </View>

      <RiseView delay={420} duration={620} style={styles.ctaSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.ctaLabel}
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={() => {
            void handleContinue()
          }}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: DARK_GREEN, opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <Text style={styles.ctaLabel}>{copy.ctaLabel}</Text>
        </Pressable>
      </RiseView>

      <PermissionPrimeSheet
        visible={prime.visible}
        type="notifications"
        onAllow={() => {
          void handlePrimeAllow()
        }}
        onDismiss={() => {
          void handlePrimeDismiss()
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
  },
  eyebrowSlot: {
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  titleSlot: {
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  avatarSlot: {
    alignItems: 'center',
    marginTop: 40,
  },
  avatarShell: {
    width: 132,
    height: 132,
    borderRadius: 66,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: CREAM,
  },
  subtitleSlot: {
    alignItems: 'center',
    marginTop: 22,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
    letterSpacing: -0.2,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaSlot: {
    width: '100%',
  },
  cta: {
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    color: CREAM,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.3,
  },
})
