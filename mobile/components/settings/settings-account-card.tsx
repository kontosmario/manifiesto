import { Alert, StyleSheet, Text, View } from 'react-native'
import { AppButton } from '@/components/ui/button'
import { AppSymbol } from '@/components/ui/app-symbol'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { SectionHeader } from '@/components/ui/section-header'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

interface SettingsAccountCardProps {
  email: string
  isLeavingFamily?: boolean
  onConfirmLeaveFamily: () => void
  onConfirmLogout: () => void
}

export function SettingsAccountCard({
  email,
  isLeavingFamily = false,
  onConfirmLeaveFamily,
  onConfirmLogout,
}: SettingsAccountCardProps) {
  const { theme } = useAppTheme()

  return (
    <BrandedPanel style={styles.card} variant="accent">
      <SectionHeader subtitle="Sesión actual en este dispositivo." title="Cuenta" />
      <View
        style={[
          styles.accountBox,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <AppSymbol
          color={theme.colors.textMuted}
          fallback="mail-outline"
          name="envelope.fill"
          size={18}
        />
        <Text style={[styles.accountText, { color: theme.colors.textMuted }]}>{email}</Text>
      </View>
      <Text style={[styles.leaveCopy, { color: theme.colors.textSoft }]}>
        Puedes desvincularte del grupo familiar actual. Si sos la última persona dentro del grupo,
        el hogar compartido y sus datos se eliminarán.
      </Text>
      <AppButton
        label="Desvincularme del grupo"
        loading={isLeavingFamily}
        onPress={() => {
          Alert.alert(
            'Desvincularme del grupo',
            'Vas a salir del grupo familiar actual. Si no queda nadie más, el hogar y sus datos compartidos se eliminarán.',
            [
              { style: 'cancel', text: 'Cancelar' },
              {
                style: 'destructive',
                text: 'Desvincularme',
                onPress: onConfirmLeaveFamily,
              },
            ],
          )
        }}
        variant="secondary"
      />
      <AppButton
        disabled={isLeavingFamily}
        label="Cerrar sesión"
        onPress={() => {
          Alert.alert('Cerrar sesión', 'Vas a salir de la app en este dispositivo.', [
            { style: 'cancel', text: 'Cancelar' },
            {
              style: 'destructive',
              text: 'Salir',
              onPress: onConfirmLogout,
            },
          ])
          }}
        variant="danger"
      />
    </BrandedPanel>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 18,
  },
  accountBox: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  accountText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  leaveCopy: {
    fontSize: 12,
    lineHeight: 18,
  },
})
