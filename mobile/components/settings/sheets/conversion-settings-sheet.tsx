import { StyleSheet, Switch, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { SUPPORTED_CURRENCIES } from '@/features/finance/family-finance.model'
import { useUsdRate } from '@/features/finance/use-usd-rate'
import { triggerHaptic } from '@/lib/haptics'
import { useThemeTokens } from '@/theme/theme-provider'
import { neoTokens } from '@/theme/neo-tokens'
import { formatMoney } from '@/utils/money'
import { nunitoFamily } from '@/theme/typography'
import {
  OnbSheetBody,
  OnbSheetChoiceRow,
  OnbSheetHelper,
  OnbSheetLabel,
} from './onb-sheet-parts'

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
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const { t } = useTranslation()

  // Cotización del seleccionado, solo para mostrarla en este sheet (no en el
  // hero). Disabled si no aplica → no fetchea.
  const rateActive = enabled && !!currency && currency !== 'USD'
  const rateQuery = useUsdRate(rateActive ? currency : undefined)

  return (
    <ModalCard
      skin="neo"
      visible={visible}
      title={t('settings:conversion.sheetTitle')}
      subtitle={t('settings:conversion.sheetSubtitle')}
      onClose={onClose}
    >
      <OnbSheetBody>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text style={[styles.toggleLabel, { color: neo.text }]}>
              {t('settings:conversion.toggleLabel')}
            </Text>
            <Text style={[styles.toggleHelper, { color: neo.textMuted }]}>
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
          <>
            <OnbSheetLabel>
              {currency
                ? t('settings:conversion.yourCurrency')
                : t('settings:conversion.chooseCurrency')}
            </OnbSheetLabel>
            {SUPPORTED_CURRENCIES.map((code) => (
              <OnbSheetChoiceRow
                key={code}
                accessibilityLabel={`${code} · ${t(`settings:currency.${code}`)}`}
                disabled={isSaving}
                leading={<Text style={styles.flag}>{CURRENCY_FLAGS[code]}</Text>}
                onPress={() => {
                  void triggerHaptic('selection')
                  onSelectCurrency(code)
                }}
                selected={code === currency}
                subtitle={t(`settings:currency.${code}`)}
                title={code}
              />
            ))}

            {rateActive && rateQuery.data ? (
              <OnbSheetHelper>
                {t('settings:conversion.rateInUse', {
                  rate: formatMoney(rateQuery.data.ratePerUsd),
                  suffix: rateQuery.data.source.startsWith('dolarapi') ? ' · blue' : '',
                })}
              </OnbSheetHelper>
            ) : null}
          </>
        ) : null}
      </OnbSheetBody>
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
  },
  toggleCopy: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  toggleHelper: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  flag: {
    fontSize: 24,
  },
})
