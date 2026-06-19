import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { ModalCard } from '@/components/ui/modal-card'
import { SUPPORTED_CURRENCIES } from '@/features/finance/family-finance.model'
import { useUsdRate } from '@/features/finance/use-usd-rate'
import { radii } from '@/theme/palette'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

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

interface ConversionSettingsSheetProps {
  visible: boolean
  /** Toggle "mostrar equivalente en dólares". */
  enabled: boolean
  /** Moneda elegida (ISO 4217) o null si todavía no eligió ninguna. */
  currency: string | null
  isSaving: boolean
  onToggle: (value: boolean) => void
  /** Guarda la moneda. NO cierra el sheet (el usuario ve el check + el rate). */
  onSelectCurrency: (code: string) => void
  onClose: () => void
}

/**
 * Sheet único de configuración de la conversión a dólares: prende/apaga +
 * elige la moneda del hogar, todo en un solo lugar. No asume país — si no hay
 * moneda elegida, la lista arranca sin selección (no defaultea ARS). Cuando hay
 * moneda elegida muestra, sutil, la cotización en uso (transparencia).
 */
export function ConversionSettingsSheet({
  visible,
  enabled,
  currency,
  isSaving,
  onToggle,
  onSelectCurrency,
  onClose,
}: ConversionSettingsSheetProps) {
  const { theme } = useAppTheme()
  const surface = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  // Cotización del seleccionado, solo para mostrarla en este sheet (no en el
  // hero). Disabled si no aplica → no fetchea.
  const rateActive = enabled && !!currency && currency !== 'USD'
  const rateQuery = useUsdRate(rateActive ? currency : undefined)

  return (
    <ModalCard
      visible={visible}
      title="Cotización en dólares"
      subtitle="Mostrá tu saldo convertido a dólares según tu moneda. Se actualiza sola."
      onClose={onClose}
    >
      <View style={[styles.toggleRow, { borderColor: theme.colors.line }]}>
        <View style={styles.toggleCopy}>
          <Text style={[styles.toggleLabel, { color: theme.colors.text }]}>
            Mostrar equivalente en dólares
          </Text>
          <Text style={[styles.toggleHelper, { color: theme.colors.textMuted }]}>
            En el inicio, debajo de tu saldo.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Mostrar equivalente en dólares"
          disabled={isSaving}
          onValueChange={onToggle}
          value={enabled}
        />
      </View>

      {enabled ? (
        <View style={styles.pickerWrap}>
          <Text style={[styles.pickerLabel, { color: theme.colors.textMuted }]}>
            {currency ? 'Tu moneda' : 'Elegí tu moneda'}
          </Text>
          <View style={styles.list}>
            {SUPPORTED_CURRENCIES.map((code) => {
              const meta = CURRENCY_LABELS[code]
              const active = code === currency
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityLabel={`${code} · ${meta.name}`}
                  accessibilityState={{ selected: active }}
                  disabled={isSaving}
                  onPress={() => {
                    void triggerHaptic('selection')
                    onSelectCurrency(code)
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

          {rateActive && rateQuery.data ? (
            <Text style={[styles.rateNote, { color: theme.colors.textMuted }]}>
              {`Cotización en uso: US$ 1 = ${formatMoney(rateQuery.data.ratePerUsd)}${
                rateQuery.data.source.startsWith('dolarapi') ? ' · blue' : ''
              }`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  toggleHelper: {
    fontSize: 12,
  },
  pickerWrap: {
    marginTop: 14,
    gap: 10,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
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
  rateNote: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    marginTop: 2,
  },
})
