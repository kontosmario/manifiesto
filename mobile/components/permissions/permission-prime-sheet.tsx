import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { DEFAULT_HIT_SLOP } from '@/theme/interaction'

/**
 * Permission priming sheet — pre-prompt que se muestra ANTES del
 * modal nativo de iOS para pedir notifs o biometric. Sirve para
 * tres cosas:
 *
 *   1. Aumentar la tasa de aceptación: el usuario ve POR QUÉ le
 *      conviene aceptar antes de que iOS le tire el prompt nativo
 *      (única chance — si dice no aquí, hay que mandarlo a Ajustes).
 *   2. Permitir "Más tarde" sin gastar el prompt nativo: el iOS
 *      prompt solo se dispara si el usuario tap "Permitir" en
 *      nuestro sheet. Si elige "Más tarde", guardamos cooldown 7d.
 *   3. Estandarizar el tono y la UI de todos los pre-prompts del
 *      app (consistencia con el resto de sheets).
 *
 * Caller pattern:
 *   ```tsx
 *   const [primeVisible, setPrimeVisible] = useState(false)
 *   // mount: check shouldPrimePermission('notifications')
 *   <PermissionPrimeSheet
 *     visible={primeVisible}
 *     type="notifications"
 *     onAllow={async () => {
 *       setPrimeVisible(false)
 *       await requestNativePermission()
 *     }}
 *     onDismiss={async () => {
 *       setPrimeVisible(false)
 *       await markPrimeDismissed('notifications')
 *     }}
 *   />
 *   ```
 */
export type PermissionPrimeType = 'notifications' | 'biometric'

interface PermissionPrimeSheetProps {
  visible: boolean
  type: PermissionPrimeType
  onAllow: () => void
  onDismiss: () => void
  /**
   * Override la etiqueta del biometric (Face ID / Touch ID). Para
   * notifs es ignorado.
   */
  biometricLabel?: string
}

interface PrimeCopy {
  icon: keyof typeof MaterialIcons.glyphMap
  title: string
  subtitle: string
  reasons: { icon: keyof typeof MaterialIcons.glyphMap; text: string }[]
  primaryLabel: string
  secondaryLabel: string
}

function copyFor(type: PermissionPrimeType, biometricLabel: string): PrimeCopy {
  if (type === 'notifications') {
    return {
      icon: 'notifications',
      title: 'Te avisamos cuando importa',
      subtitle: 'Solo notificaciones que valen la pena leer.',
      reasons: [
        { icon: 'payments', text: 'Tu cobro confirmado del mes' },
        { icon: 'trending-up', text: 'Alertas de gastos atípicos' },
        { icon: 'emoji-events', text: 'Logros de la familia' },
      ],
      primaryLabel: 'Permitir',
      secondaryLabel: 'Más tarde',
    }
  }

  return {
    icon: 'fingerprint',
    title: 'Desbloquea más rápido',
    subtitle: `Usa ${biometricLabel} para entrar sin escribir tu contraseña.`,
    reasons: [
      { icon: 'face', text: `Ingresa con ${biometricLabel}` },
      { icon: 'lock', text: 'Tus datos siempre cifrados' },
      { icon: 'settings', text: 'Puedes desactivarlo cuando quieras' },
    ],
    primaryLabel: 'Activar',
    secondaryLabel: 'Más tarde',
  }
}

export function PermissionPrimeSheet({
  visible,
  type,
  onAllow,
  onDismiss,
  biometricLabel = 'Face ID',
}: PermissionPrimeSheetProps) {
  const { theme } = useAppTheme()

  const copy = useMemo(
    () => copyFor(type, biometricLabel),
    [type, biometricLabel],
  )

  const handleAllow = () => {
    void triggerHaptic('selection')
    onAllow()
  }

  const handleDismiss = () => {
    void triggerHaptic('selection')
    onDismiss()
  }

  return (
    <ModalCard
      visible={visible}
      title={copy.title}
      subtitle={copy.subtitle}
      onClose={onDismiss}
    >
      <View style={styles.body}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: theme.colors.surfaceMuted },
          ]}
        >
          <MaterialIcons
            name={copy.icon}
            size={44}
            color={theme.colors.text}
          />
        </View>

        <View style={styles.reasonsList}>
          {copy.reasons.map((reason) => (
            <View key={reason.text} style={styles.reasonRow}>
              <View
                style={[
                  styles.reasonIconWrap,
                  { backgroundColor: theme.colors.surfaceMuted },
                ]}
              >
                <MaterialIcons
                  name={reason.icon}
                  size={18}
                  color={theme.colors.textMuted}
                />
              </View>
              <Text
                style={[
                  styles.reasonText,
                  { color: theme.colors.text },
                ]}
              >
                {reason.text}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            hitSlop={DEFAULT_HIT_SLOP}
            onPress={handleAllow}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: theme.colors.text,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text
              style={[
                styles.primaryLabel,
                { color: theme.colors.background },
              ]}
            >
              {copy.primaryLabel}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            hitSlop={DEFAULT_HIT_SLOP}
            onPress={handleDismiss}
            style={({ pressed }) => [
              styles.ghostButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[
                styles.ghostLabel,
                { color: theme.colors.textMuted },
              ]}
            >
              {copy.secondaryLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingTop: 8,
    paddingBottom: 16,
    alignItems: 'stretch',
  },
  iconCircle: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  reasonsList: {
    gap: 14,
    marginBottom: 28,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reasonIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  actions: {
    gap: 8,
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  ghostButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
})
