import { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

interface NoSpendConfirmSheetProps {
  visible: boolean
  /** Expenses cargados hoy por el current user (filtrados con tz-local). */
  expensesToday: Expense[]
  /** Lookup para mostrar el nombre + color de la categoría de cada gasto. */
  categoryById: Map<string, Category>
  isSubmitting: boolean
  onCancel: () => void
  /** Llamado cuando el user confirma. El caller debe pasar
   *  `{ force: true }` al RPC para que server-side acepte el mark
   *  aunque hoy ya tenga gastos. */
  onConfirm: () => void
}

/**
 * Sheet que reemplaza el `Alert.alert` genérico cuando el user intenta
 * marcar "Día sin gasto" desde el FAB y hoy ya tiene gastos cargados.
 *
 * Le mostramos la lista exacta de gastos del día para que pueda
 * verificar (a) si fueron suyos, (b) si los recuerda, (c) si quiere
 * marcar igual (defensible: marcaron como "sin gasto variable" aunque
 * cargaron algo menor; tienen forma de revertir).
 */
export function NoSpendConfirmSheet({
  visible,
  expensesToday,
  categoryById,
  isSubmitting,
  onCancel,
  onConfirm,
}: NoSpendConfirmSheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  const totalToday = useMemo(
    () => expensesToday.reduce((sum, e) => sum + Math.abs(Number(e.price ?? 0)), 0),
    [expensesToday],
  )

  return (
    <ModalCard
      onClose={onCancel}
      subtitle={t('gastos:noSpendConfirm.subtitle')}
      title={t('gastos:noSpendConfirm.title')}
      visible={visible}
      footer={
        <View style={styles.footerStack}>
          <AppButton
            label={isSubmitting ? t('gastos:noSpendConfirm.marking') : t('gastos:noSpendConfirm.markAnyway')}
            loading={isSubmitting}
            onPress={onConfirm}
            variant="primary"
          />
          <AppButton
            label={t('common:actions.cancel')}
            onPress={onCancel}
            variant="ghost"
            disabled={isSubmitting}
          />
        </View>
      }
    >
      <View style={styles.body}>
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: theme.colors.surfaceMuted,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>
            {t('gastos:noSpendConfirm.totalToday')}
          </Text>
          <Text style={[styles.summaryValue, { color: theme.colors.text }]}>
            {formatMoney(totalToday)}
          </Text>
          <Text style={[styles.summaryHint, { color: theme.colors.textSoft }]}>
            {t('gastos:noSpendConfirm.expensesLogged', { count: expensesToday.length })}
          </Text>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {expensesToday.map((expense) => {
            const cat = expense.category_id
              ? categoryById.get(expense.category_id)
              : null
            const title = expense.description?.trim() || cat?.displayName || t('common:terms.expense')
            return (
              <View
                key={expense.id}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.colors.canvas,
                    borderColor: theme.colors.line,
                  },
                ]}
              >
                <View style={styles.rowLeft}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: cat?.color ?? theme.colors.textMuted },
                    ]}
                  />
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.rowTitle, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    <Text
                      style={[styles.rowCategory, { color: theme.colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {cat?.displayName ?? t('gastos:movementRow.noCategory')}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[styles.rowAmount, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {formatMoney(Math.abs(Number(expense.price ?? 0)))}
                </Text>
              </View>
            )
          })}
        </ScrollView>

        <View
          style={[
            styles.tipCard,
            {
              backgroundColor: theme.colors.creamSoft,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <MaterialIcons name="info" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.tipText, { color: theme.colors.textSoft }]}>
            {t('gastos:noSpendConfirm.tip')}
          </Text>
        </View>
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 16,
  },
  summaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  summaryHint: {
    fontSize: 12,
    marginTop: 2,
  },
  list: {
    maxHeight: 280,
  },
  listContent: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowCategory: {
    fontSize: 12,
    marginTop: 1,
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  footerStack: {
    gap: 8,
  },
})
