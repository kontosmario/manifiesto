import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AppButton } from '@/components/ui/button'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { LoadingBlock } from '@/components/ui/loading-block'
import { Screen } from '@/components/ui/screen'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { CommitmentRow } from '@/components/fixed-expenses/commitment-row'
import { FixedExpenseEditorModal } from '@/components/settings/fixed-expense-editor-modal'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { useFixedExpensesScreenController } from '@/features/fixed-expenses/use-fixed-expenses-screen-controller'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'
import { getErrorMessage } from '@/utils/error-message'
import { SummaryHeroCard } from '@/components/ui/summary-hero-card'

interface FixedExpensesScreenProps {
  familyId: string
  canGoBack?: boolean
}

export function FixedExpensesScreen({ familyId, canGoBack = false }: FixedExpensesScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const controller = useFixedExpensesScreenController(familyId)
  const {
    activeSectionConfig,
    attentionCount,
    categoriesQuery,
    categoryNameById,
    commitmentSummary,
    editor,
    fixedExpensesQuery,
    isBusy,
    sections,
    actions,
  } = controller
  const headerPalette = buildScreenHeaderPalette(theme)
  const shouldShowErrorState = Boolean(
    (fixedExpensesQuery.error && !fixedExpensesQuery.data) ||
      (categoriesQuery.error && !categoriesQuery.data) ||
      (controller.dashboard.familyFinanceQuery.error && !controller.dashboard.familyFinanceQuery.data) ||
      (controller.dashboard.expensesQuery.error && !controller.dashboard.expensesQuery.data),
  )
  const screenError =
    fixedExpensesQuery.error ??
    categoriesQuery.error ??
    controller.dashboard.familyFinanceQuery.error ??
    controller.dashboard.expensesQuery.error
  const openAddFlow = () => {
    router.push(`/(app)/add-fixed-expense?section=${activeSectionConfig.key}`)
  }

  return (
    <>
      <Screen
        canGoBack={canGoBack}
        contentContainerStyle={styles.screenContent}
        rightSlot={
          <IconButton
            accessibilityLabel={activeSectionConfig.addLabel}
            backgroundColor={headerPalette.buttonBackgroundColor}
            borderColor={headerPalette.buttonBorderColor}
            icon="add"
            iconColor={headerPalette.iconColor}
            symbolName="plus"
            variant="surface"
            onPress={openAddFlow}
          />
        }
        subtitle="Pagos recurrentes, cuotas y deuda en un solo lugar."
        title="Gastos Fijos"
        titleColor={headerPalette.titleColor}
      >
        <View style={styles.sectionStack}>
          {!theme.isDark ? (
            <AmbientBackdrop variant="commitments" />
          ) : null}

          <SummaryHeroCard
            eyebrow="Carga del ciclo"
            meta={`${commitmentSummary.activeCount} activos${
              attentionCount > 0 ? ` · ${attentionCount} con atención ahora` : ' · todo al día'
            }`}
            subtitle={
              commitmentSummary.reservedTotal > 0
                ? `${currencyFormatter.format(commitmentSummary.reservedTotal)} pendientes · ${currencyFormatter.format(commitmentSummary.paidInCycleTotal)} registrados`
                : `${currencyFormatter.format(commitmentSummary.paidInCycleTotal)} registrados · sin pendientes por cubrir`
            }
            value={currencyFormatter.format(commitmentSummary.pressureTotal)}
          />

          <BrandedPanel style={styles.card}>
            <SegmentedControl
              options={sections.map((section) => ({
                label: section.label,
                value: section.key,
              }))}
              value={activeSectionConfig.key}
              onChange={actions.setActiveSection}
            />

            <View style={styles.sectionCopy}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                {activeSectionConfig.title}
              </Text>
              <Text style={[styles.sectionSubtitle, theme.typography.body, { color: theme.colors.textMuted }]}>
                {activeSectionConfig.summary}
              </Text>
            </View>

            <View style={styles.sectionActions}>
              <AppButton
                fullWidth={false}
                label={activeSectionConfig.addLabel}
                onPress={openAddFlow}
                size="compact"
                variant="secondary"
              />
            </View>

            {fixedExpensesQuery.isLoading || categoriesQuery.isLoading ? (
              <LoadingBlock label="Cargando gastos fijos..." />
            ) : shouldShowErrorState ? (
              <ErrorState
                description={getErrorMessage(
                  screenError,
                  'No pudimos cargar gastos fijos, pagos y categorías de este ciclo.',
                )}
                title="No pudimos cargar gastos fijos"
                onAction={() => {
                  void Promise.all([
                    fixedExpensesQuery.refetch(),
                    categoriesQuery.refetch(),
                    controller.dashboard.refetchAll(),
                  ])
                }}
              />
            ) : activeSectionConfig.items.length === 0 ? (
              <EmptyState
                icon={activeSectionConfig.emptyIcon}
                subtitle={activeSectionConfig.emptySubtitle}
                title={activeSectionConfig.emptyTitle}
              />
            ) : (
              <View style={styles.items}>
                {activeSectionConfig.items.map((item) => (
                  <CommitmentRow
                    key={item.id}
                    categoryName={item.category_id ? categoryNameById.get(item.category_id) ?? null : null}
                    fixedExpense={item}
                    isBusy={isBusy}
                    onDelete={() => actions.deleteItem(item)}
                    onEdit={() => actions.openEditModal(item)}
                    onRegisterPayment={() => actions.registerPayment(item.id)}
                    onToggleStatus={() => actions.toggleStatus(item)}
                  />
                ))}
              </View>
            )}
          </BrandedPanel>
        </View>
      </Screen>

      {editor.visible ? (
        <FixedExpenseEditorModal
          canSubmit={editor.canSubmit}
          categories={editor.categories}
          isAmountFocused={editor.isAmountFocused}
          isBusy={isBusy}
          isRemainingBalanceFocused={editor.isRemainingBalanceFocused}
          onAmountFocusChange={editor.onAmountFocusChange}
          onClose={editor.onClose}
          onFieldChange={editor.onFieldChange}
          onRemainingBalanceFocusChange={editor.onRemainingBalanceFocusChange}
          onSubmit={editor.onSubmit}
          showStatusSection={editor.showStatusSection}
          submitLabel={editor.submitLabel}
          title={editor.title}
          values={editor.values}
          visible={editor.visible}
        />
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 22,
  },
  sectionStack: {
    gap: 20,
  },
  card: {
    gap: 18,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionCopy: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  sectionSubtitle: {},
  items: {
    gap: 12,
  },
})
