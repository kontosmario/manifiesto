// Sprint J · Audit #3 J-Auth3 — fresh-install friction for password reset.
//
// On a fresh install with no PIN and no biometric saved credentials we
// have no second factor we can challenge the user against, so the
// recovery email link becomes a single-factor takeover vector: an
// attacker who briefly accessed the victim's inbox can request the
// link, install the app on their own device, complete the reset, and
// then enroll a PIN to lock the victim out.
//
// The ideal fix is a second confirmation channel (email/SMS the user
// has to acknowledge from a known device). That requires backend work
// out of scope for this sprint.
//
// Intermediate fix (this component): a forced warning interstitial with
// a 10-second countdown before the "Continuar" button activates. It
// doesn't stop an attacker who is patient, but raises the bar enough
// that a casual / opportunistic attacker won't follow through, AND
// gives the legitimate user 10 seconds to read a clear warning that
// explains the impact of the change.
//
// Migration path: when a backend email-confirmation flow exists, replace
// this with a "we sent a verification link to your other email — open
// it to continue" gate.

import { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

const COUNTDOWN_SECONDS = 10
const SUPPORT_EMAIL = 'soporte@manifiestoapp.com'

interface FreshInstallResetFrictionProps {
  onContinue: () => void
  onCancel: () => void
}

/**
 * Renders the J-Auth3 fresh-install warning interstitial. The
 * `Continuar` button is disabled (and shows a live countdown) for the
 * first `COUNTDOWN_SECONDS` seconds after mount so the user is forced
 * to read the warning. The `Cerrar` button is always enabled.
 */
export function FreshInstallResetFriction({
  onContinue,
  onCancel,
}: FreshInstallResetFrictionProps) {
  const { theme } = useAppTheme()
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS)

  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => {
      setRemaining((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [remaining])

  const handleEmailSupport = useCallback(() => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)
  }, [])

  const canContinue = remaining <= 0
  const ctaLabel = canContinue ? 'Continuar' : `Continuar (${remaining}s)`

  return (
    <View style={styles.stack}>
      <View
        style={[
          styles.warningCard,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.danger,
          },
        ]}
      >
        <MaterialIcons color={theme.colors.danger} name="warning-amber" size={28} />
        <View style={styles.cardBody}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            Estás por cambiar la contraseña de tu cuenta
          </Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>
            Esto te va a desloguear de todos los dispositivos que tengan
            sesión activa.
          </Text>
          <Text style={[styles.bodyStrong, { color: theme.colors.danger }]}>
            Si vos NO pediste este cambio, cerrá esta pantalla AHORA y
            avisanos a{' '}
            <Text
              accessibilityRole="link"
              onPress={handleEmailSupport}
              style={styles.link}
            >
              {SUPPORT_EMAIL}
            </Text>
            .
          </Text>
        </View>
      </View>

      <AppButton
        accessibilityLabel={ctaLabel}
        disabled={!canContinue}
        label={ctaLabel}
        onPress={onContinue}
        variant="danger"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar y no cambiar la contraseña"
        onPress={onCancel}
        style={({ pressed }) => [
          styles.cancelLink,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <Text style={[styles.cancelLabel, { color: theme.colors.textMuted }]}>
          Cerrar sin cambiar
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  warningCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 2,
    alignItems: 'flex-start',
  },
  cardBody: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  bodyStrong: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  link: {
    textDecorationLine: 'underline',
  },
  cancelLink: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cancelLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
})
