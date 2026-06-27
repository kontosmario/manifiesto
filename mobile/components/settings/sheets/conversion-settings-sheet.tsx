import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { SUPPORTED_CURRENCIES } from '@/features/finance/family-finance.model'
import { useUsdRate } from '@/features/finance/use-usd-rate'
import { radii } from '@/theme/palette'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

// Solo la bandera (emoji) vive acá; el nombre se resuelve por i18n vía
// `settings:currency.<code>`.
const CURRENCY_FLAGS: Record<string, string> = {
  ARS: '🇦🇷',
  CLP: '🇨🇱',
  COP: '🇨🇴',
  MXN: '🇲🇽',
  UYU: '🇺🇾',
  PEN: '🇵🇪',
  BRL: '🇧🇷',
  USD: '🇺🇸',
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
  const { t } = useTranslation()
  const surface = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  // Cotización del seleccionado, solo para mostrarla en este sheet (no en el
  // hero). Disabled si no aplica → no fetchea.
  const rateActive = enabled && !!currency && currency !== 'USD'
  const rateQuery = useUsdRate(rateActive ? currency : undefined)

  return (
    <ModalCard
      visible={visible}
      title={t('settings:conversion.sheetTitle')}
      subtitle={t('settings:conversion.sheetSubtitle')}
      onClose={onClose}
    >
      <View style={[styles.toggleRow, { borderColor: theme.colors.line }]}>
        <View style={styles.toggleCopy}>
          <Text style={[styles.toggleLabel, { color: theme.colors.text }]}>
            {t('settings:conversion.toggleLabel')}
          </Text>
          <Text style={[styles.toggleHelper, { color: theme.colors.textMuted }]}>
            {t('settings:conversion.toggleHelper')}
          </Text>
        </View>
        <Switch
          accessibilityLabel={t('settings:conversion.toggleLabel')}
          disabled={isSaving}
          onValueChange={onToggle}
          value={enabled}
        />
      </View>

      {enabled ? (
        <View style={styles.pickerWrap}>
          <Text style={[styles.pickerLabel, { color: theme.colors.textMuted }]}>
            {currency ? t('settings:conversion.yourCurrency') : t('settings:conversion.chooseCurrency')}
          </Text>
          <View style={styles.list}>
            {SUPPORTED_CURRENCIES.map((code) => {
              const flag = CURRENCY_FLAGS[code]
              const name = t(`settings:currency.${code}`)
              const active = code === currency
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityLabel={`${code} · ${name}`}
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
                  <Text style={styles.flag}>{flag}</Text>
                  <View style={styles.copy}>
                    <Text style={[styles.code, { color: theme.colors.text }]}>{code}</Text>
                    <Text style={[styles.name, { color: theme.colors.textMuted }]}>
                      {name}
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
              {t('settings:conversion.rateInUse', {
                rate: formatMoney(rateQuery.data.ratePerUsd),
                suffix: rateQuery.data.source.startsWith('dolarapi') ? ' · blue' : '',
              })}
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
