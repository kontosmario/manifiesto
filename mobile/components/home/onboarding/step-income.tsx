import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { AmountCard } from '@/components/home/amount-card'
import { DynamicIncomeSticker } from '@/components/home/onboarding/dynamic-income-sticker'
import { RiseView } from '@/components/home/animated/rise-view'
import { ChoicePill } from '@/components/home/onboarding/step-income-contribution'
import { CycleConfigSection } from '@/components/finance/cycle-config-section'
import { parsePrice } from '@/utils/money'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import type { FinanceCycleConfig } from '@/utils/finance-cycle-config'

// Íconos de los 3 pasos de la card del modo variable (mismo set
// MaterialIcons del resto del onboarding, uno por fila).
const DYNAMIC_ROW_ICONS = ['add-circle-outline', 'bolt', 'eco'] as const

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
          {/* Card explicativa del modo variable — a prueba de todo:
              sticker SVG del owner (moneda con flecha en alza, colores
              de marca fijos en ambos temas), 3 pasos concretos y un
              cierre que nombra a quién le sirve. Sin side-stripes ni
              emoji-como-ícono (leyes impeccable/ui-ux-pro-max). */}
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <View style={styles.infoHeader}>
              <View
                style={[
                  styles.infoIconDisc,
                  { backgroundColor: theme.colors.primarySurface },
                ]}
              >
                <DynamicIncomeSticker size={44} />
              </View>
              <View style={styles.infoHeaderText}>
                <Text style={[styles.infoTitle, { color: theme.colors.text }]}>
                  {t('onboarding:income.dynamicCard.title')}
                </Text>
                <Text style={[styles.infoKicker, { color: theme.colors.textMuted }]}>
                  {t('onboarding:income.dynamicCard.kicker')}
                </Text>
              </View>
            </View>

            {(['row1', 'row2', 'row3'] as const).map((rowKey, index) => (
              <View key={rowKey} style={styles.infoRow}>
                <MaterialIcons
                  name={DYNAMIC_ROW_ICONS[index]}
                  size={18}
                  color={theme.colors.primary}
                  style={styles.infoRowIcon}
                />
                <Text style={[styles.infoText, { color: theme.colors.textMuted }]}>
                  {t(`onboarding:income.dynamicCard.${rowKey}`)}
                </Text>
              </View>
            ))}

            <Text style={[styles.infoFooter, { color: theme.colors.textMuted }]}>
              {t('onboarding:income.dynamicCard.footer')}
            </Text>
          </View>

          {/* Ciclo del modo variable: "¿cómo te fue esta semana / esta
              quincena / este mes?" — misma infraestructura de ciclos que
              los sueldos rolling, con copy neutral (sin "cobro"). */}
          <View style={styles.dynamicCycleBlock}>
            <Text style={[styles.eyebrow, styles.dayEyebrow, { color: theme.colors.textMuted }]}>
              {t('onboarding:income.dynamicCycleEyebrow')}
            </Text>
            <CycleConfigSection
              value={cycleConfig}
              onChange={onChangeCycleConfig}
              copyVariant="cycle"
              monthlyDefaultDay={1}
            />
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
              {t('onboarding:income.dynamicCycleHint')}
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
    padding: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 12,
  },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIconDisc: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoHeaderText: { flex: 1, gap: 2 },
  infoTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  infoKicker: { fontSize: 12, lineHeight: 16 },
  dynamicCycleBlock: { marginTop: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoRowIcon: { marginTop: 1 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },
  infoFooter: { fontSize: 12, lineHeight: 16, fontStyle: 'italic' },
})
