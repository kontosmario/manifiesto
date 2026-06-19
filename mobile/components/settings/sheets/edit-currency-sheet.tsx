import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import { SUPPORTED_CURRENCIES } from '@/features/finance/family-finance.model'
import { radii } from '@/theme/palette'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

const CURRENCY_LABELS: Record<string, { name: string; flag: string }> = {
  ARS: { name: 'Argentina · Peso', flag: '🇦🇷' },
  CLP: { name: 'Chile · Peso', flag: '🇨🇱' },
  COP: { name: 'Colombia · Peso', flag: '🇨🇴' },
  MXN: { name: 'México · Peso', flag: '🇲🇽' },
  UYU: { name: 'Uruguay · Peso', flag: '🇺🇾' },
  PEN: { name: 'Perú · Sol', flag: '🇵🇪' },
  BRL: { name: 'Brasil · Real', flag: '🇧🇷' },
  USD: { name: 'Dólar estadounidense', flag: '🇺🇸' },
}

interface EditCurrencySheetProps {
  visible: boolean
  currentValue: string
  isSaving: boolean
  onClose: () => void
  onSave: (currency: string) => void
}

/**
 * Selector de moneda del hogar. Tap en una opción = guarda + cierra (sin botón
 * aparte). Define contra qué moneda se trae la cotización USD.
 */
export function EditCurrencySheet({
  visible,
  currentValue,
  isSaving,
  onClose,
  onSave,
}: EditCurrencySheetProps) {
  const { theme } = useAppTheme()
  const surface = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <ModalCard
      visible={visible}
      title="Moneda"
      subtitle="La moneda de tu hogar. La cotización contra el dólar se trae sola y se actualiza."
      onClose={onClose}
    >
      <View style={styles.list}>
        {SUPPORTED_CURRENCIES.map((code) => {
          const meta = CURRENCY_LABELS[code]
          const active = code === currentValue
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityLabel={`${code} · ${meta.name}`}
              accessibilityState={{ selected: active }}
              disabled={isSaving}
              onPress={() => {
                void triggerHaptic('selection')
                onSave(code)
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: active ? theme.colors.primarySurface : surface,
                  borderColor: active ? theme.colors.primary : theme.colors.line,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              <Text style={styles.flag}>{meta.flag}</Text>
              <View style={styles.copy}>
                <Text style={[styles.code, { color: theme.colors.text }]}>{code}</Text>
                <Text style={[styles.name, { color: theme.colors.textMuted }]}>
                  {meta.name}
                </Text>
              </View>
              {active ? (
                <MaterialIcons
                  name="check-circle"
                  size={20}
                  color={theme.colors.primaryStrong}
                />
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  flag: {
    fontSize: 24,
  },
  copy: {
    flex: 1,
    gap: 1,
  },
  code: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 12,
  },
})
