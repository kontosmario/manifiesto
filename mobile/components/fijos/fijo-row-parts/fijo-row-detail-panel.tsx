import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { FijoTrendSpark } from '@/components/fijos/fijo-trend-spark'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { usePressScale } from '@/hooks/use-press-scale'
import { formatMoney } from '@/utils/money'
import { useThemeTokens } from '@/theme/theme-provider'
import { InfoLine } from './info-line'
import {
  frequencyLabel,
  nextDueLabel,
  trendCopyColor,
  trendCopyLabel,
  trendCopySubLabel,
} from './fijo-row-helpers'
import type { AccentPalette } from './fijo-row-styling'

type FijoStatus = 'paid' | 'overdue' | 'pending' | 'future'

interface FijoRowDetailPanelProps {
  fijo: FijoItem
  status: FijoStatus
  accent: AccentPalette
  categoryName: string
  onEdit?: (id: string) => void
  onRevertPaid?: (paymentId: string) => void
}

/**
 * Expand panel del fijo-row — stats hero (anual / total / deuda
 * restante) + tendencia + este pago + historial + actions row.
 *
 * Extraído del row principal por verticalidad: ~225 LOC de UI
 * declarativa con stats tintado por status, info-lines, trend copy.
 * Aparece detrás del divider dashed cuando el user toca el card.
 *
 * Animación intacta: FadeIn(200ms) / FadeOut(140ms).
 */
export function FijoRowDetailPanel({
  fijo,
  status,
  accent,
  categoryName,
  onEdit,
  onRevertPaid,
}: FijoRowDetailPanelProps) {
  const theme = useThemeTokens()
  const { t } = useTranslation()
  const actionSecondaryPress = usePressScale({ pressedScale: 0.96 })

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      // borderTopColor tintado por status — el divider que separa
      // el row collapsed del expand panel anuncia visualmente el
      // estado del fijo apenas se abre.
      style={[styles.detailBlock, { borderTopColor: accent.border }]}
    >
      {/*
        Stats hero. Para recurring/periodic: "SE LLEVA AL AÑO".
        Para installment: "TOTAL DE LA DEUDA". Para debt: "DEUDA
        RESTANTE". Cifra grande para anclar el ojo + sublabel
        con % del sueldo (cuando hay sueldo configurado).
      */}
      <View style={[styles.statsHero, { backgroundColor: accent.bg }]}>
        {/* Accent stripe — barra vertical 3pt en el left edge. */}
        <View
          pointerEvents="none"
          style={[styles.statsAccentStripe, { backgroundColor: accent.solid }]}
        />
        <Text style={[styles.statsEyebrow, { color: accent.solid }]}>
          {fijo.kind === 'installment'
            ? t('fijos:detailPanel.totalDebtEyebrow')
            : fijo.kind === 'debt'
              ? t('fijos:detailPanel.remainingDebtEyebrow')
              : t('fijos:detailPanel.annualEyebrow')}
        </Text>
        <Text style={[styles.statsValue, { color: theme.colors.text }]}>
          {formatMoney(fijo.annualCost)}
        </Text>
        {fijo.pctOfIncome != null && fijo.pctOfIncome > 0 ? (
          <View style={styles.statsPctRow}>
            <MaterialIcons
              name="account-balance-wallet"
              size={11}
              color={theme.colors.textMuted}
            />
            <Text style={[styles.statsPctText, { color: theme.colors.textMuted }]}>
              {t('fijos:detailPanel.pctOfSalary', { pct: fijo.pctOfIncome })}
            </Text>
          </View>
        ) : null}
      </View>

      {/*
        Tendencia. Solo cuando hay >= 2 puntos de historia.
      */}
      {fijo.priceHistory.length >= 2 && fijo.trendDeltaPct != null ? (
        <View style={styles.section}>
          <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
            {t('fijos:detailPanel.trendEyebrow')}
          </Text>
          <View style={styles.trendRow}>
            <View style={styles.trendSparkSlot}>
              <FijoTrendSpark points={fijo.priceHistory} />
            </View>
            <View style={styles.trendCopySlot}>
              <Text
                style={[
                  styles.trendCopyMain,
                  { color: trendCopyColor(fijo.trendDeltaPct, theme.isDark) },
                ]}
              >
                {trendCopyLabel(fijo.trendDeltaPct)}
              </Text>
              <Text style={[styles.trendCopySub, { color: theme.colors.textMuted }]}>
                {trendCopySubLabel(fijo.priceHistory)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Este pago. */}
      <View style={styles.section}>
        <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
          {t('fijos:detailPanel.thisPaymentEyebrow')}
        </Text>
        <InfoLine
          icon="event-repeat"
          label={
            fijo.kind === 'installment'
              ? t('fijos:detailPanel.installmentLabel', {
                  current: (fijo.installments_paid ?? 0) + 1,
                  total: fijo.installments_total ?? '?',
                })
              : t('fijos:detailPanel.recurringLabel', {
                  frequency: frequencyLabel(fijo.frequency),
                  day: fijo.dayOfMonth,
                })
          }
          theme={theme}
        />
        <InfoLine
          icon="event"
          label={nextDueLabel(fijo.next_due_on)}
          theme={theme}
        />
        <InfoLine
          icon="local-offer"
          label={categoryName || t('fijos:detailPanel.noCategory')}
          theme={theme}
        />
      </View>

      {/* Historial — solo cuando hay >= 1 pago lifetime registrado. */}
      {fijo.paymentsLifetime > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
            {t('fijos:detailPanel.historyEyebrow')}
          </Text>
          <InfoLine
            icon="receipt-long"
            label={t('fijos:detailPanel.installmentsRecorded', {
              count: fijo.paymentsLifetime,
            })}
            theme={theme}
          />
          {fijo.totalPaidLifetime > 0 ? (
            <InfoLine
              icon="payments"
              label={t('fijos:detailPanel.totalPaid', {
                amount: formatMoney(fijo.totalPaidLifetime),
              })}
              theme={theme}
            />
          ) : null}
        </View>
      ) : null}

      {/* Actions row. Revertir pago (paid) + Editar. */}
      <View style={styles.actionsRow}>
        {status === 'paid' && onRevertPaid && fijo.paidPaymentId ? (
          <Pressable
            onPress={() => onRevertPaid(fijo.paidPaymentId!)}
            onPressIn={actionSecondaryPress.onPressIn}
            onPressOut={actionSecondaryPress.onPressOut}
            style={styles.actionFullWidthWrap}
            accessibilityRole="button"
            accessibilityLabel={t('fijos:detailPanel.revertPayment')}
            accessibilityHint={t('fijos:detailPanel.revertPaymentHint')}
          >
            <Animated.View
              style={[
                styles.actionSecondary,
                {
                  backgroundColor: theme.isDark
                    ? 'rgba(242,167,140,0.10)'
                    : 'rgba(242,167,140,0.18)',
                  borderColor: theme.isDark ? '#F2A78C' : '#B84014',
                },
                actionSecondaryPress.animatedStyle,
              ]}
            >
              <View style={styles.actionRevertContent}>
                <MaterialIcons
                  name="undo"
                  size={14}
                  color={theme.isDark ? '#F2A78C' : '#B84014'}
                />
                <Text
                  style={[
                    styles.actionSecondaryText,
                    { color: theme.isDark ? '#F2A78C' : '#B84014' },
                  ]}
                >
                  {t('fijos:detailPanel.revertPayment')}
                </Text>
              </View>
            </Animated.View>
          </Pressable>
        ) : null}
        {onEdit ? (
          <Pressable
            onPress={() => onEdit(fijo.id)}
            onPressIn={actionSecondaryPress.onPressIn}
            onPressOut={actionSecondaryPress.onPressOut}
            style={styles.actionFullWidthWrap}
            accessibilityRole="button"
            accessibilityLabel={t('fijos:detailPanel.editFijo')}
          >
            <Animated.View
              style={[
                styles.actionSecondary,
                { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
                actionSecondaryPress.animatedStyle,
              ]}
            >
              <Text style={[styles.actionSecondaryText, { color: theme.colors.text }]}>
                {t('fijos:detailPanel.edit')}
              </Text>
            </Animated.View>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  detailBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    gap: 12,
  },
  statsHero: {
    borderRadius: 12,
    paddingLeft: 18, // 14 + 4 para no chocar con la accent stripe
    paddingRight: 14,
    paddingVertical: 12,
    gap: 4,
    overflow: 'hidden',
  },
  statsAccentStripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  statsEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statsValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  statsPctRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  statsPctText: {
    fontSize: 11,
    fontWeight: '600',
  },
  section: { gap: 6 },
  sectionEyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  trendSparkSlot: {
    width: 70,
    height: 30,
    justifyContent: 'center',
  },
  trendCopySlot: { flex: 1, gap: 2 },
  trendCopyMain: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  trendCopySub: { fontSize: 11, fontWeight: '500' },
  actionsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  actionFullWidthWrap: { flex: 1 },
  actionSecondary: {
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionSecondaryText: { fontSize: 13, fontWeight: '700' },
  actionRevertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
})
