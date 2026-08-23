import { useMemo } from 'react'
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { triggerHaptic } from '@/lib/haptics'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
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
 * Piel: rediseño neumórfico (`ModalCard skin="neo"`). El sheet lo
 * montan CINCO hosts —onboarding-success (clásico y neo),
 * biometric-setup (clásico y neo) y el re-prompt del Home neo—, así
 * que la hoja neo puede aparecer sobre un canvas V1 en los flujos
 * clásicos: es aceptable porque es una hoja modal con scrim propio,
 * pero conviene verlo en device en las cinco entradas.
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

function copyFor(
  type: PermissionPrimeType,
  biometricLabel: string,
  t: TFunction,
): PrimeCopy {
  if (type === 'notifications') {
    return {
      icon: 'notifications',
      title: t('states:permissions.notifications.title'),
      subtitle: t('states:permissions.notifications.subtitle'),
      reasons: [
        { icon: 'payments', text: t('states:permissions.notifications.reason1') },
        { icon: 'trending-up', text: t('states:permissions.notifications.reason2') },
        { icon: 'emoji-events', text: t('states:permissions.notifications.reason3') },
      ],
      primaryLabel: t('states:permissions.notifications.primary'),
      secondaryLabel: t('states:permissions.notifications.secondary'),
    }
  }

  return {
    icon: 'fingerprint',
    title: t('states:permissions.biometric.title'),
    subtitle: t('states:permissions.biometric.subtitle', { method: biometricLabel }),
    reasons: [
      { icon: 'face', text: t('states:permissions.biometric.reason1', { method: biometricLabel }) },
      { icon: 'lock', text: t('states:permissions.biometric.reason2') },
      { icon: 'settings', text: t('states:permissions.biometric.reason3') },
    ],
    primaryLabel: t('states:permissions.biometric.primary'),
    secondaryLabel: t('states:permissions.biometric.secondary'),
  }
}

export function PermissionPrimeSheet({
  visible,
  type,
  onAllow,
  onDismiss,
  biometricLabel: biometricLabelProp,
}: PermissionPrimeSheetProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()

  // Default por plataforma (auditoría 2026-08-21): el viejo `= 'Face ID'`
  // aparecía en Androids solo-huella cuando el caller no pasaba label.
  // Los 3 callers actuales SÍ lo pasan — esto es la red para el próximo.
  const biometricLabel =
    biometricLabelProp ??
    (Platform.OS === 'ios' ? 'Face ID' : t('auth:biometric.methods.fingerprint'))

  const copy = useMemo(
    () => copyFor(type, biometricLabel, t),
    [type, biometricLabel, t],
  )

  // Los dos pozos de esta hoja (el círculo del ícono y los tiles de
  // cada razón) se leen SOLO por su sombra inset: su fill (`neo.well`)
  // contra la hoja (`neo.sheet`) es ~1.06:1. En Android < API 29 el
  // `boxShadow` inset se descarta EN SILENCIO, así que ahí caen a un
  // hairline para no desaparecer.
  const insetFallback = useMemo<ViewStyle | null>(
    () =>
      SUPPORTS_INSET_SHADOW
        ? null
        : { borderWidth: 1, borderColor: neo.sheetDivider },
    [neo],
  )

  const handleDismiss = () => {
    void triggerHaptic('selection')
    onDismiss()
  }

  return (
    <ModalCard
      skin="neo"
      visible={visible}
      title={copy.title}
      subtitle={copy.subtitle}
      onClose={onDismiss}
    >
      <View style={styles.body}>
        <NeoSurface
          variant="insetMd"
          radius={44}
          backgroundColor={neo.well}
          style={[styles.iconCircle, insetFallback]}
        >
          <MaterialIcons
            name={copy.icon}
            size={44}
            color={neo.green}
          />
        </NeoSurface>

        <View style={styles.reasonsList}>
          {copy.reasons.map((reason) => (
            <View key={reason.text} style={styles.reasonRow}>
              <NeoSurface
                variant="insetSm"
                radius={neoRadii.chip}
                backgroundColor={neo.well}
                style={[styles.reasonIconWrap, insetFallback]}
              >
                <MaterialIcons
                  name={reason.icon}
                  size={18}
                  color={neo.textMuted}
                />
              </NeoSurface>
              <Text
                style={[
                  styles.reasonText,
                  { color: neo.text },
                ]}
              >
                {reason.text}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          {/* `NeoButton` ya dispara el háptico 'selection' antes de
              llamar a `onPress`, igual que hacía el handler local. */}
          <NeoButton
            variant="primary"
            block
            label={copy.primaryLabel}
            onPress={onAllow}
            style={styles.primaryButton}
          />

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
                { color: neo.textMuted },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  // El `fontFamily` viaja con el peso: cada peso de Nunito es un face
  // estático propio, así que sin él el 700 se renderiza como regular.
  reasonText: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.2,
  },
  actions: {
    gap: 8,
  },
  // Altura fija: el `NeoButton` mide por padding y acá se conserva la
  // geometría original de 52px del pre-prompt.
  primaryButton: {
    height: 52,
    paddingVertical: 0,
  },
  ghostButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
