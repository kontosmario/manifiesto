import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

const PHRASE_FAMILY = 'ELIMINAR'
const PHRASE_ACCOUNT = 'REINICIAR'

interface DestroyFamilyConfirmSheetProps {
  visible: boolean
  isSubmitting: boolean
  otherActiveMembers: number
  onCancel: () => void
  onConfirm: () => void
  /**
   * `'family'` (default): owner tearing down a shared hogar that still
   * has members — the original flow. `'account'`: a solo user wiping
   * their OWN account to re-onboard from scratch (no members involved).
   * Only the copy + confirm phrase change; the two-step friction is shared.
   */
  mode?: 'family' | 'account'
}

/**
 * Two-step destructive confirmation sheet shown to the OWNER when
 * leaving a family that still has other active members. Step 1 is
 * the warning + "Continuar" CTA; Step 2 requires the user to type
 * the exact phrase "ELIMINAR" before the destructive button enables.
 *
 * The friction is intentional — once the owner confirms, the server
 * tears down the entire family and every surviving member loses
 * access. There is no undo.
 */
export function DestroyFamilyConfirmSheet({
  visible,
  isSubmitting,
  otherActiveMembers,
  onCancel,
  onConfirm,
  mode = 'family',
}: DestroyFamilyConfirmSheetProps) {
  const { theme } = useAppTheme()
  const isAccount = mode === 'account'
  const confirmPhrase = isAccount ? PHRASE_ACCOUNT : PHRASE_FAMILY
  const [step, setStep] = useState<1 | 2>(1)
  const [phrase, setPhrase] = useState('')
  const inputRef = useRef<TextInput | null>(null)

  // Reset to step 1 every time the sheet opens (don't preserve the
  // previous typing state — destructive flows should always start
  // from the warning).
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of destructive flow on each open
      setStep(1)
      setPhrase('')
    }
  }, [visible])

  // Auto-focus the confirmation input when entering step 2.
  useEffect(() => {
    if (visible && step === 2) {
      const handle = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(handle)
    }
  }, [visible, step])

  const matches = useMemo(
    () => phrase.trim().toUpperCase() === confirmPhrase,
    [phrase, confirmPhrase],
  )

  const memberLabel = otherActiveMembers === 1
    ? '1 miembro'
    : `${otherActiveMembers} miembros`

  return (
    <ModalCard
      onClose={onCancel}
      subtitle={
        step === 1
          ? isAccount
            ? 'Vas a empezar el setup desde cero.'
            : `Aún hay ${memberLabel} en tu hogar.`
          : 'Confirma escribiendo la palabra exacta.'
      }
      title={
        step === 1
          ? isAccount
            ? '¿Reiniciar tu cuenta?'
            : '¿Eliminar tu hogar?'
          : 'Última confirmación'
      }
      visible={visible}
    >
      {step === 1 ? (
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
            <View
              style={[
                styles.warningIcon,
                { backgroundColor: theme.colors.danger },
              ]}
            >
              <MaterialIcons name="warning-amber" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningTitle, { color: theme.colors.text }]}>
                {isAccount ? 'Vas a borrar todos tus datos' : 'Vas a borrar todo el hogar'}
              </Text>
              <Text style={[styles.warningBody, { color: theme.colors.textMuted }]}>
                {isAccount
                  ? 'Se eliminan tus gastos, fijos, metas y toda tu configuración. Tu cuenta vuelve al onboarding desde cero. Tu suscripción se mantiene.'
                  : `Como eres el dueño, salirte cierra el hogar para todos. Tu familia, gastos, fijos, metas y configuración se eliminan. Los ${memberLabel} pierden acceso y empiezan de nuevo.`}
              </Text>
            </View>
          </View>

          {isAccount ? (
            <View style={styles.bullets}>
              <BulletRow
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="delete-outline"
                label="Se borran tus gastos, fijos, metas y toda tu configuración."
              />
              <BulletRow
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="restart-alt"
                label="Vuelves a empezar el onboarding desde cero."
              />
              <BulletRow
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="verified"
                label="Tu suscripción no se toca: sigues con tu plan."
              />
            </View>
          ) : (
            <View style={styles.bullets}>
              <BulletRow
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="delete-outline"
                label="Se borran tus gastos, fijos, metas y la configuración del hogar."
              />
              <BulletRow
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="people-outline"
                label={`Los ${memberLabel} pierden acceso compartido.`}
              />
              <BulletRow
                colorMuted={theme.colors.textMuted}
                colorText={theme.colors.text}
                icon="restore"
                label="Si quieres volver, vas a tener que armar un hogar de cero."
              />
            </View>
          )}

          <View style={styles.row}>
            <AppButton
              label="Cancelar"
              onPress={onCancel}
              variant="ghost"
            />
            <AppButton
              label="Continuar"
              onPress={() => setStep(2)}
              variant="danger"
            />
          </View>
        </View>
      ) : (
        <View style={styles.stack}>
          <View style={styles.confirmHelperRow}>
            <Text style={[styles.confirmHelper, { color: theme.colors.textMuted }]}>
              Escribe{' '}
              <Text style={{ color: theme.colors.danger, fontWeight: '800' }}>
                {confirmPhrase}
              </Text>{' '}
              para habilitar el botón.
            </Text>
          </View>

          <TextInput
            ref={inputRef}
            value={phrase}
            onChangeText={(value) => setPhrase(value.toUpperCase())}
            placeholder={confirmPhrase}
            placeholderTextColor={theme.colors.textSoft}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel="Escribe ELIMINAR para confirmar"
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.danger,
                color: theme.colors.text,
              },
            ]}
            returnKeyType="done"
          />

          {phrase.length > 0 && !matches ? (
            <Text style={[styles.errorText, { color: theme.colors.danger }]}>
              Tiene que coincidir exactamente con {confirmPhrase}.
            </Text>
          ) : null}

          <View style={styles.row}>
            <AppButton
              disabled={isSubmitting}
              label="Cancelar"
              onPress={onCancel}
              variant="ghost"
            />
            <AppButton
              disabled={!matches || isSubmitting}
              label={isAccount ? 'Reiniciar mi cuenta' : 'Eliminar para siempre'}
              loading={isSubmitting}
              onPress={onConfirm}
              variant="danger"
            />
          </View>
        </View>
      )}
    </ModalCard>
  )
}

interface BulletRowProps {
  colorMuted: string
  colorText: string
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
}

function BulletRow({ colorMuted, colorText, icon, label }: BulletRowProps) {
  return (
    <View style={styles.bulletRow}>
      <MaterialIcons name={icon} size={18} color={colorMuted} />
      <Text style={[styles.bulletText, { color: colorText }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  warningCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  warningIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  warningBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  bullets: {
    gap: 10,
    paddingHorizontal: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletText: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  confirmHelperRow: {
    paddingHorizontal: 4,
  },
  confirmHelper: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderRadius: radii.lg,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
})
