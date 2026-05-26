import { useCallback, useEffect, useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useRouter } from 'expo-router'
import { RequireAuth } from '@/components/guards'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { isAvatarSlug } from '@/assets/avatars'
import { RiseView } from '@/components/home/animated/rise-view'
import { useIsSolo } from '@/features/family/use-is-solo'
import { useMyProfile } from '@/features/profile/use-profile'
import { onboardingSuccessCopy } from '@/features/onboarding/success-copy'
import { markAuthTransitionLoaded } from '@/lib/auth-transition-splash'
import { triggerHaptic } from '@/lib/haptics'
import { authTokens } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

const CREAM = authTokens.surfaceCream
const PEACH = authTokens.peach
const CLAY = authTokens.clay
const DARK_GREEN = authTokens.welcomeBg

/**
 * Post-onboarding success screen. Sits between the wizard's last step
 * and Home. Tap-to-continue, sin auto-dismiss, para que el usuario
 * sienta el momento de cierre. Una vez en Home, el tour de Home
 * auto-fira (mecánica existente en `useScreenTour`).
 */
export function OnboardingSuccessScreen() {
  return (
    <RequireAuth>
      {({ userId }) => <OnboardingSuccessBody userId={userId} />}
    </RequireAuth>
  )
}

function OnboardingSuccessBody({ userId }: { userId: string }) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const isSolo = useIsSolo(userId)
  const profileQuery = useMyProfile(userId)
  const profile = profileQuery.data

  // Hide the auth transition splash once this screen has rendered.
  useEffect(() => {
    markAuthTransitionLoaded()
  }, [])

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
    [isSolo, firstName],
  )

  const avatarSlug = profile?.avatar_animal && isAvatarSlug(profile.avatar_animal)
    ? profile.avatar_animal
    : null

  const handleContinue = useCallback(() => {
    void triggerHaptic('selection')
    router.replace('/(app)/(tabs)/home')
  }, [router])

  return (
    <View style={[styles.root, { backgroundColor: CREAM }]}>
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <RiseView delay={100} duration={620} style={styles.eyebrowSlot}>
          <Text style={[styles.eyebrow, { color: theme.colors.textSoft }]}>
            {copy.eyebrow}
          </Text>
        </RiseView>

        <RiseView delay={250} duration={620} style={styles.titleSlot}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {copy.title}
          </Text>
        </RiseView>

        <RiseView delay={400} duration={700} style={styles.avatarSlot}>
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

        <RiseView delay={560} duration={620} style={styles.subtitleSlot}>
          <Text style={[styles.subtitle, { color: theme.colors.textSoft }]}>
            {copy.subtitle}
          </Text>
        </RiseView>
      </View>

      <RiseView delay={760} duration={520} style={styles.ctaSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.ctaLabel}
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: DARK_GREEN, opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <Text style={styles.ctaLabel}>{copy.ctaLabel}</Text>
        </Pressable>
      </RiseView>
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
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  titleSlot: {
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
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
    letterSpacing: -0.3,
  },
})
