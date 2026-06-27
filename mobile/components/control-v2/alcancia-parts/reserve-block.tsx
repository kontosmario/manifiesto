import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { CreateSavingsGoalWizardSheet } from '@/components/savings-goals/create-savings-goal-wizard-sheet'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import { useApplyReserveDecision } from '@/features/month-close/use-apply-reserve'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import {
  formatMoney,
  formatPriceInputValue,
  parsePrice,
  serializePrice,
} from '@/utils/money'

interface ReserveBlockProps {
  familyId: string
  userId?: string
  monthlyReserveAmount: number
  goal: SavingsGoal | null
}

/**
 * Bloque indigo + 2 CTAs + NumericEditSheet para administrar la
 * reserva acumulada (Spec B — cierres de mes anteriores). Vive como
 * sub-componente del card de Alcancía pero se reusa también desde el
 * empty state cuando no hay días suficientes para el vault pero SÍ
 * hay reserva en DB. Maneja su propio sheet state y mutation.
 *
 * Render nullable: si `monthlyReserveAmount <= 0` retorna null y el
 * parent no necesita gate extra.
 *
 * Doc canónico: `docs/sistemas/reserva.md`.
 */
export function ReserveBlock({
  familyId,
  userId,
  monthlyReserveAmount,
  goal,
}: ReserveBlockProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isDark = theme.isDark
  const text = theme.colors.text
  const reserveColor = isDark ? '#A5B4FC' : '#4F46E5'
  const reserveBg = isDark ? 'rgba(165,180,252,0.14)' : 'rgba(99,102,241,0.10)'
  const reserveBorder = isDark
    ? 'rgba(165,180,252,0.36)'
    : 'rgba(99,102,241,0.32)'

  const reserveMutation = useApplyReserveDecision(familyId, userId)
  const [sheetMode, setSheetMode] = useState<'cycle' | 'meta' | null>(null)
  const [draft, setDraft] = useState('')
  // Wizard wiring: when the user taps "A una meta" without an existing
  // goal, we open the create-goal wizard and remember how much they
  // wanted to allocate from the reserve. After the goal is created we
  // dispatch the reserve mutation against the brand-new id.
  const [wizardOpen, setWizardOpen] = useState(false)
  const [pendingReserveAfterCreate, setPendingReserveAfterCreate] = useState<
    number | null
  >(null)

  useEffect(() => {
    if (sheetMode !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza el draft con el monto vigente cuando se abre el sheet; condicional y dependencia explícita evita loops
      setDraft(serializePrice(monthlyReserveAmount))
    }
  }, [sheetMode, monthlyReserveAmount])

  const parsed = useMemo(() => parsePrice(draft), [draft])
  const isValid =
    Number.isFinite(parsed) && parsed > 0 && parsed <= monthlyReserveAmount

  const openSumar = () => {
    void triggerHaptic('selection')
    setSheetMode('cycle')
  }
  const openMeta = () => {
    if (!goal) {
      // No goal yet — open the wizard. Remember the full available
      // reserve so we can apply it automatically after the create.
      void triggerHaptic('selection')
      setPendingReserveAfterCreate(monthlyReserveAmount)
      setWizardOpen(true)
      return
    }
    if (!goal.isActive) {
      // Meta existe pero está pausada — el aporte requeriría activarla
      // primero. En lugar de bloquear, ofrecemos hacerlo en 1 paso
      // desde el CTA principal de la alcancía (mismo card scroll-up).
      void triggerHaptic('selection')
      Alert.alert(
        t('control:reserve.metaPausadaTitle'),
        t('control:reserve.metaPausadaBody', { title: goal.title }),
      )
      return
    }
    void triggerHaptic('selection')
    setSheetMode('meta')
  }

  const handleWizardCreated = (newGoal: SavingsGoal) => {
    setWizardOpen(false)
    if (pendingReserveAfterCreate !== null && pendingReserveAfterCreate > 0) {
      const amount = pendingReserveAfterCreate
      setPendingReserveAfterCreate(null)
      reserveMutation.mutate(
        { amount, target: 'meta', metaGoalId: newGoal.id },
        {
          onSuccess: () => {
            void triggerHaptic('success')
          },
          onError: (err) => {
            void triggerHaptic('error')
            Alert.alert(
              t('control:reserve.errorAplicarTitle'),
              err instanceof Error ? err.message : t('control:reserve.errorRetry'),
            )
          },
        },
      )
    }
  }

  const handleSubmit = () => {
    if (!isValid || !sheetMode) return
    reserveMutation.mutate(
      {
        amount: parsed,
        target: sheetMode,
        metaGoalId: sheetMode === 'meta' ? goal?.id : undefined,
      },
      {
        onSuccess: () => {
          void triggerHaptic('success')
          setSheetMode(null)
          setDraft('')
        },
        onError: (err) => {
          void triggerHaptic('error')
          Alert.alert(
            t('control:reserve.errorUsarTitle'),
            err instanceof Error ? err.message : t('control:reserve.errorRetry'),
          )
        },
      },
    )
  }

  if (monthlyReserveAmount <= 0) return null

  return (
    <>
      <View
        style={[
          styles.reserveSection,
          { backgroundColor: reserveBg, borderColor: reserveBorder },
        ]}
      >
        <View style={styles.reserveHeader}>
          <View style={[styles.reserveDot, { backgroundColor: reserveColor }]} />
          <Text
            style={[styles.reserveLabel, { color: reserveColor }]}
            numberOfLines={1}
          >
            {t('control:reserve.label')}
          </Text>
          <Text style={[styles.reserveAmount, { color: text }]} numberOfLines={1}>
            {formatMoney(monthlyReserveAmount)}
          </Text>
        </View>
        <View style={styles.reserveActionsRow}>
          <Pressable
            onPress={openSumar}
            accessibilityRole="button"
            accessibilityLabel={t('control:reserve.sumarA11y')}
            disabled={reserveMutation.isPending}
            style={({ pressed }) => [
              styles.reserveAction,
              {
                backgroundColor: reserveBg,
                borderColor: reserveBorder,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <MaterialIcons name="trending-up" size={14} color={reserveColor} />
            <Text
              style={[styles.reserveActionText, { color: reserveColor }]}
              numberOfLines={1}
            >
              {t('control:reserve.sumarAlMes')}
            </Text>
          </Pressable>
          <Pressable
            onPress={openMeta}
            accessibilityRole="button"
            accessibilityLabel={t('control:reserve.aUnaMetaA11y')}
            disabled={reserveMutation.isPending}
            style={({ pressed }) => [
              styles.reserveAction,
              {
                backgroundColor: reserveBg,
                borderColor: reserveBorder,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <MaterialIcons name="flag" size={14} color={reserveColor} />
            <Text
              style={[styles.reserveActionText, { color: reserveColor }]}
              numberOfLines={1}
            >
              {t('control:reserve.aUnaMeta')}
            </Text>
          </Pressable>
        </View>
      </View>

      <NumericEditSheet
        visible={sheetMode !== null}
        title={
          sheetMode === 'cycle'
            ? t('control:reserve.sheetSumarTitle')
            : t('control:reserve.sheetAportarTitle')
        }
        subtitle={t('control:reserve.sheetSubtitle', {
          amount: formatMoney(monthlyReserveAmount),
        })}
        rawValue={draft}
        onChangeRawValue={setDraft}
        formatDisplay={(raw) => formatPriceInputValue(raw, false)}
        displayEyebrow={t('control:reserve.sheetEyebrow')}
        displayPlaceholder={t('control:reserve.sheetSavePlaceholder')}
        maxIntegerDigits={11}
        maxDecimalDigits={2}
        numpadCollapsedByDefault
        saveLabel={sheetMode === 'cycle' ? t('control:reserve.sheetSaveSumar') : t('control:reserve.sheetSaveAportar')}
        saveDisabled={!isValid}
        isSaving={reserveMutation.isPending}
        onSave={handleSubmit}
        onClose={() => {
          if (reserveMutation.isPending) return
          setSheetMode(null)
        }}
      />

      <CreateSavingsGoalWizardSheet
        visible={wizardOpen}
        familyId={familyId}
        userId={userId}
        suggestedInitialAmount={pendingReserveAfterCreate ?? undefined}
        onCreated={handleWizardCreated}
        onClose={() => {
          setWizardOpen(false)
          setPendingReserveAfterCreate(null)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  // ── Reserve admin block (Spec B) ────────────────────────────
  reserveSection: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  reserveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reserveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  reserveLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    flexShrink: 1,
  },
  reserveAmount: {
    marginLeft: 'auto',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    // El label (reserveLabel flexShrink:1) cede primero; el monto entero se
    // mantiene aunque la reserva acumulada llegue a millones.
    flexShrink: 0,
  },
  reserveActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reserveAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  reserveActionText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
})
