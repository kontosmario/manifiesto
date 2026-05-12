import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

const CONFIRM_PHRASE = 'BORRAR MI CUENTA'

interface DeleteAccountConfirmSheetProps {
  visible: boolean
  isSubmitting: boolean
  isOwnerWithMembers: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Hoja destructiva de dos pasos para eliminar la cuenta del usuario.
 * Step 1: warning + lista de qué se borra y qué se retiene legalmente.
 * Step 2: pedir que escriban la frase exacta para destrabar el CTA.
 *
 * Si el usuario es owner de una familia con otros miembros activos,
 * mostramos un estado que lo bloquea y le indica que transfiera
 * ownership primero — el RPC servidor también valida esto, pero
 * adelantamos el feedback acá para evitar un round-trip que termine
 * en error.
 */
export function DeleteAccountConfirmSheet({
  visible,
  isSubmitting,
  isOwnerWithMembers,
  onCancel,
  onConfirm,
}: DeleteAccountConfirmSheetProps) {
  const { theme } = useAppTheme()
  const [step, setStep] = useState<1 | 2>(1)
  const [phrase, setPhrase] = useState('')
  const inputRef = useRef<TextInput | null>(null)

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset of destructive flow on each open
      setStep(1)
      setPhrase('')
    }
  }, [visible])

  useEffect(() => {
    if (visible && step === 2) {
      const handle = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(handle)
    }
  }, [visible, step])

  const matches = useMemo(
    () => phrase.trim().toUpperCase() === CONFIRM_PHRASE,
    [phrase],
  )

  // Caso especial: el usuario es dueño de una familia con miembros
  // activos. El servidor lo bloquearía con un error, así que mostramos
  // un panel informativo en lugar del flujo destructivo.
  if (isOwnerWithMembers) {
    return (
      <ModalCard
        onClose={onCancel}
        subtitle="Sos dueño de un hogar con otros miembros activos."
        title="Antes de borrar, transferí tu hogar"
        visible={visible}
      >
        <View style={styles.stack}>
          <View
            style={[
              styles.warningCard,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.warning,
              },
            ]}
          >
            <View
              style={[
                styles.warningIcon,
                { backgroundColor: theme.colors.warning },
              ]}
            >
              <MaterialIcons name="info-outline" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningTitle, { color: theme.colors.text }]}>
                No podés borrar tu cuenta todavía
              </Text>
              <Text style={[styles.warningBody, { color: theme.colors.textMuted }]}>
                Si te vas como dueño, el resto del hogar pierde acceso. Pasale
                el rol a otro miembro desde "Administrar familia" y volvé.
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <AppButton label="Entendido" onPress={onCancel} variant="ghost" />
          </View>
        </View>
      </ModalCard>
    )
  }

  return (
    <ModalCard
      onClose={onCancel}
      subtitle={
        step === 1
          ? 'Vas a borrar tu cuenta y todo lo que cargaste.'
          : 'Confirmá escribiendo la frase exacta.'
      }
      title={step === 1 ? '¿Borrar tu cuenta?' : 'Última confirmación'}
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
                Esto no se puede deshacer fácil
              </Text>
              <Text style={[styles.warningBody, { color: theme.colors.textMuted }]}>
                Tu cuenta queda agendada para borrarse en 30 días. Si
                cambiás de idea, podés cancelar volviendo a entrar dentro
                de ese plazo. Pasados los 30 días, todo se borra
                definitivamente.
              </Text>
            </View>
          </View>

          <View style={styles.bullets}>
            <BulletRow
              colorMuted={theme.colors.textMuted}
              colorText={theme.colors.text}
              icon="delete-outline"
              label="Se borran tus gastos, fijos, metas y notificaciones."
            />
            <BulletRow
              colorMuted={theme.colors.textMuted}
              colorText={theme.colors.text}
              icon="account-circle"
              label="Se borra tu perfil, avatar y configuración."
            />
            <BulletRow
              colorMuted={theme.colors.textMuted}
              colorText={theme.colors.text}
              icon="receipt-long"
              label="Tu suscripción se cancela (si tenés una activa)."
            />
            <BulletRow
              colorMuted={theme.colors.textMuted}
              colorText={theme.colors.text}
              icon="schedule"
              label="Tenés 30 días para arrepentirte y reactivar."
            />
          </View>

          <View style={styles.row}>
            <AppButton label="Cancelar" onPress={onCancel} variant="ghost" />
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
              Escribí{' '}
              <Text style={{ color: theme.colors.danger, fontWeight: '800' }}>
                {CONFIRM_PHRASE}
              </Text>{' '}
              para habilitar el botón.
            </Text>
          </View>

          <TextInput
            ref={inputRef}
            value={phrase}
            onChangeText={(value) => setPhrase(value.toUpperCase())}
            placeholder={CONFIRM_PHRASE}
            placeholderTextColor={theme.colors.textSoft}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={`Escribí ${CONFIRM_PHRASE} para confirmar`}
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
              Tiene que coincidir exactamente con {CONFIRM_PHRASE}.
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
              label="Borrar cuenta"
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
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  errorText: {
    fontSize: 12,
    paddingHorizontal: 4,
  },
})
