import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AmountCard } from '@/components/home/amount-card'
import { RiseView } from '@/components/home/animated/rise-view'
import { ChoicePill } from '@/components/home/onboarding/step-income-contribution'
import { CycleConfigSection } from '@/components/finance/cycle-config-section'
import { parsePrice } from '@/utils/money'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

interface StepIncomeProps {
  monthlyIncomeRaw: string
  /** 'dynamic' = sin sueldo fijo: oculta monto + ciclo y explica que el
   *  presupuesto se construye cargando ingresos manuales. */
  incomeMode: 'fixed' | 'dynamic'
  cycleConfig: FinanceCycleConfig
  onChangeIncomeMode: (next: 'fixed' | 'dynamic') => void
  onRequestNumpad: () => void
  onChangeCycleConfig: (next: FinanceCycleConfig) => void
  isNumpadActive?: boolean
  amountCardRef?: (node: View | null) => void
}

export function StepIncome({
  monthlyIncomeRaw,
  incomeMode,
  cycleConfig,
  onChangeIncomeMode,
  onRequestNumpad,
  onChangeCycleConfig,
  isNumpadActive = false,
  amountCardRef,
}: StepIncomeProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const parsed = parsePrice(monthlyIncomeRaw)
  const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const isDynamic = incomeMode === 'dynamic'

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t('onboarding:income.title')}</Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          {t('onboarding:income.subcopy')}
        </Text>
      </RiseView>

      <RiseView delay={60}>
        <View style={styles.choices}>
          <ChoicePill
            label={t('onboarding:income.modeFixed')}
            selected={!isDynamic}
            onPress={() => onChangeIncomeMode('fixed')}
            theme={theme}
          />
          <ChoicePill
            label={t('onboarding:income.modeDynamic')}
            selected={isDynamic}
            onPress={() => onChangeIncomeMode('dynamic')}
            theme={theme}
          />
        </View>
      </RiseView>

      {isDynamic ? (
        <RiseView delay={120}>
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
              {t('onboarding:income.dynamicInfoTitle')}
            </Text>
            <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
              {t('onboarding:income.dynamicInfoBody')}
            </Text>
          </View>
        </RiseView>
      ) : (
        <>
          <RiseView delay={120}>
            <View ref={amountCardRef}>
              <AmountCard
                amount={amount}
                isActive={isNumpadActive}
                onPress={onRequestNumpad}
                label={t('onboarding:income.amountLabel')}
              />
            </View>
          </RiseView>

          <RiseView delay={180}>
            <Text style={[styles.eyebrow, styles.dayEyebrow, { color: theme.colors.textMuted }]}>
              {t('onboarding:income.cycleEyebrow')}
            </Text>
            <CycleConfigSection value={cycleConfig} onChange={onChangeCycleConfig} />
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              {t('onboarding:income.cycleHint')}
            </Text>
          </RiseView>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 4 },
  choices: { flexDirection: 'row', gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  dayEyebrow: { marginBottom: 8 },
  hint: { marginTop: 10, fontSize: 12 },
  infoCard: {
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 6,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  infoText: { fontSize: 13, lineHeight: 18 },
})
