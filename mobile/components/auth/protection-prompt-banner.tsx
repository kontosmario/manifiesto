// Sprint R-3 · R-3.4 — "Configurá Face ID o PIN" banner.
//
// Renders at the top of Home when the signed-in user has NO biometric
// credentials AND NO PIN — the only state where Sprints R-1/R-2's lock
// gates fall through and the account is unprotected at the device level.
//
// Tone is intentionally warmer (amber/warning) than the deletion banner
// (which is danger red) because this is a recommendation, not an alarm.
// Dismissible via "Después"; the hook re-shows after 24h.

import { useCallback } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { triggerHaptic } from '@/lib/haptics'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface ProtectionPromptBannerProps {
  onDismiss: () => void | Promise<void>
}

export function ProtectionPromptBanner({ onDismiss }: ProtectionPromptBannerProps) {
  const router = useRouter()
  const { theme } = useAppTheme()

  const handleActivateBiometric = useCallback(() => {
    void triggerHaptic('selection')
    router.push('/(app)/biometric-setup')
  }, [router])

  const handleCreatePin = useCallback(() => {
    void triggerHaptic('selection')
    router.push('/(app)/pin-setup')
  }, [router])

  const handleLater = useCallback(() => {
    void triggerHaptic('selection')
    void onDismiss()
  }, [onDismiss])

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="Activá Face ID o creá un PIN para proteger tu cuenta."
      style={[
        styles.shell,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.warning,
        },
      ]}
    >
      <View style={styles.row}>
        <MaterialIcons
          color={theme.colors.warning}
          name="lock"
          size={24}
        />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Protegé tu cuenta
          </Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>
            Activá Face ID o creá un PIN para que solo vos puedas entrar.
          </Text>
        </View>
      </View>
      <View style={styles.ctaRow}>
        <AppButton
          fullWidth={false}
          label="Activar Face ID"
          onPress={handleActivateBiometric}
          variant="primary"
        />
        <AppButton
          fullWidth={false}
          label="Crear PIN"
          onPress={handleCreatePin}
          variant="secondary"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Posponer recordatorio por 24 horas"
        hitSlop={8}
        onPress={handleLater}
        style={styles.laterButton}
      >
        <Text style={[styles.laterLabel, { color: theme.colors.textMuted }]}>
          Después
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: 14,
    gap: 12,
    ...(Platform.OS === 'web' ? {} : { marginHorizontal: 0 }),
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  laterButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  laterLabel: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
})
