import { forwardRef, useImperativeHandle, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { BottomSheet, type BottomSheetHandle } from '@/components/ui/bottom-sheet'
import { AppButton } from '@/components/ui/button'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface ConfirmSalarySheetProps {
  isSaving: boolean
  errorMessage?: string | null
  onConfirm: () => void
}

export const ConfirmSalarySheet = forwardRef<BottomSheetHandle, ConfirmSalarySheetProps>(
  function ConfirmSalarySheet({ isSaving, errorMessage, onConfirm }, ref) {
    const { theme } = useAppTheme()
    const sheetRef = useRef<BottomSheetHandle>(null)

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
      snapTo: (index: number) => sheetRef.current?.snapTo(index),
    }), [])

    return (
      <BottomSheet ref={sheetRef} snapPoints={['40%']}>
        <View style={styles.content}>
          <Text style={[typography.sectionTitle, { color: theme.colors.text }]}>
            ¿Todo ok con este cobro?
          </Text>
          <Text style={[typography.body, styles.description, { color: theme.colors.textMuted }]}>
            Al confirmar, arrancamos un nuevo ciclo con tu ingreso base. Si recibiste un extra
            o algo distinto, podés ajustarlo en Ajustes luego.
          </Text>
          {errorMessage ? (
            <Text style={[typography.caption, styles.error, { color: theme.colors.danger }]}>
              {errorMessage}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <AppButton
              variant="primary"
              label="Sí, confirmar cobro"
              loading={isSaving}
              onPress={onConfirm}
            />
            <AppButton
              variant="ghost"
              label="Más tarde"
              onPress={() => sheetRef.current?.dismiss()}
            />
          </View>
        </View>
      </BottomSheet>
    )
  },
)

const styles = StyleSheet.create({
  content: {
    paddingTop: 8,
    gap: 12,
  },
  description: {
    lineHeight: 20,
  },
  error: {
    marginTop: 4,
  },
  actions: {
    gap: 10,
    marginTop: 8,
  },
})
