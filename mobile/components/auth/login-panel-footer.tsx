import { MaterialIcons } from '@expo/vector-icons'
import { Platform, Pressable, StyleSheet, Text } from 'react-native'
import type { BiometricLoginState } from '@/lib/biometric-auth'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { authPalette } from '@/theme/auth-theme'
import {
  DEFAULT_HIT_SLOP,
  DEFAULT_PRESS_RETENTION_OFFSET,
  MIN_TOUCH_TARGET,
} from '@/theme/interaction'

export function LoginPanelFooter({
  biometricState,
  isBusy,
  onBiometricSignIn,
  onDevSpikePress,
  useReferenceSignInLayout,
}: {
  biometricState: BiometricLoginState
  isBusy: boolean
  onBiometricSignIn: () => void
  onDevSpikePress: () => void
  useReferenceSignInLayout: boolean
}) {
  return (
    <>
      <Pressable
        accessibilityLabel={
          !biometricState.isAvailable
            ? `${biometricState.label} no disponible`
            : biometricState.hasSavedCredentials
              ? `Entrar con ${biometricState.label}`
              : `Activar ${biometricState.label} en el próximo ingreso`
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: isBusy || !biometricState.isAvailable }}
        android_ripple={{
          color: withAlpha(authPalette.biometric.icon, 0.14),
          borderless: false,
        }}
        disabled={isBusy || !biometricState.isAvailable}
        hitSlop={DEFAULT_HIT_SLOP}
        onPress={() => {
          if (!isBusy && biometricState.isAvailable) {
            void triggerHaptic('selection')
          }
          onBiometricSignIn()
        }}
        pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
        style={({ pressed }) => [
          styles.biometricRow,
          useReferenceSignInLayout && styles.biometricRowDense,
          (isBusy || !biometricState.isAvailable) && styles.biometricRowDisabled,
          pressed && biometricState.isAvailable && !isBusy && styles.biometricRowPressed,
        ]}
      >
        <MaterialIcons
          color={
            biometricState.isAvailable
              ? authPalette.biometric.icon
              : authPalette.biometric.disabledText
          }
          name="fingerprint"
          size={16}
        />
        <Text
          style={[
            styles.biometricText,
            useReferenceSignInLayout && styles.biometricTextDense,
            !biometricState.isAvailable && styles.biometricTextDisabled,
          ]}
        >
          {!biometricState.isAvailable
            ? `${biometricState.label} no disponible`
            : biometricState.hasSavedCredentials
              ? `Entrar con ${biometricState.label}`
              : `Activá ${biometricState.label} con tu próximo ingreso`}
        </Text>
      </Pressable>

      {Platform.OS !== 'web' ? (
        <Pressable
          accessibilityLabel="Probar render 3D nativo"
          accessibilityRole="button"
          android_ripple={{
            color: withAlpha(authPalette.panel.biometricLink, 0.14),
            borderless: false,
          }}
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={() => {
            void triggerHaptic('selection')
            onDevSpikePress()
          }}
          pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
          style={({ pressed }) => [styles.devSpikeLink, pressed && styles.devSpikeLinkPressed]}
        >
          <MaterialIcons color={authPalette.panel.biometricLink} name="view-in-ar" size={16} />
          <Text style={styles.devSpikeLinkLabel}>Probar render 3D nativo</Text>
        </Pressable>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 8,
    paddingTop: 2,
  },
  biometricRowDense: {
    paddingTop: 0,
  },
  biometricRowPressed: {
    opacity: 0.82,
  },
  biometricRowDisabled: {
    opacity: 0.78,
  },
  biometricText: {
    fontSize: 13,
    lineHeight: 18,
    color: authPalette.biometric.text,
    fontWeight: '500',
  },
  biometricTextDense: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  biometricTextDisabled: {
    color: authPalette.biometric.disabledText,
  },
  devSpikeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  devSpikeLinkPressed: {
    opacity: 0.84,
  },
  devSpikeLinkLabel: {
    color: authPalette.panel.biometricLink,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700',
  },
})
