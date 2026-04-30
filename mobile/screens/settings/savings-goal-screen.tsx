import { useEffect, useMemo, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { AppButton } from '@/components/ui/button'
import { LoadingBlock } from '@/components/ui/loading-block'
import { Screen } from '@/components/ui/screen'
import { MetaCard } from '@/components/home/meta-card'
import { SavingsAdvisorStrip } from '@/components/settings/savings-advisor-strip'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSwitchRow,
} from '@/components/settings/settings-grouped-list'
import { EditSavingsEmojiSheet } from '@/components/settings/sheets/edit-savings-emoji-sheet'
import { EditSavingsTitleSheet } from '@/components/settings/sheets/edit-savings-title-sheet'
import { NumericEditSheet } from '@/components/ui/numeric-edit-sheet'
import {
  validateSavingsGoalInput,
  type SavingsGoal,
} from '@/features/savings-goals/savings-goal.model'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import {
  currencyFormatter,
  formatPriceInputValue,
} from '@/utils/money'

interface SavingsGoalScreenProps {
  familyId: string
}

export function SavingsGoalScreen({ familyId }: SavingsGoalScreenProps) {
  const router = useRouter()
  const goalQuery = useSavingsGoal(familyId)
  const existing = goalQuery.data ?? null
  const isLoading = goalQuery.isLoading

  if (isLoading) {
    return (
      <Screen contentContainerStyle={styles.screenContent} title="Meta de ahorro" canGoBack>
        <LoadingBlock label="Cargando meta..." />
      </Screen>
    )
  }

  return (
    <Screen contentContainerStyle={styles.screenContent} title="Meta de ahorro" canGoBack>
      <SavingsGoalEditor
        familyId={familyId}
        existing={existing}
        onSaved={() => router.back()}
      />
    </Screen>
  )
}

interface SavingsGoalEditorProps {
  familyId: string
  existing: SavingsGoal | null
  onSaved: () => void
}

function SavingsGoalEditor({ familyId, existing, onSaved }: SavingsGoalEditorProps) {
  // Cached — same source as Control. Drives the contextual strip
  // rendered just before the submit footer.
  const { signals: advisorSignals } = useControlV2Data(familyId)
  const { theme } = useAppTheme()
  const upsert = useUpsertSavingsGoal(familyId)

  const [title, setTitle] = useState(existing?.title ?? '')
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎯')
  const [goalAmount, setGoalAmount] = useState(
    existing ? String(Math.round(existing.goalAmount)) : '',
  )
  const [currentAmount, setCurrentAmount] = useState(
    existing ? String(Math.round(existing.currentAmount)) : '0',
  )
  const [targetMonths, setTargetMonths] = useState(
    existing?.targetMonths != null ? String(existing.targetMonths) : '',
  )
  const [isActive, setIsActive] = useState(existing?.isActive ?? true)

  // Re-hydrate when existing changes (e.g. after initial load).
  useEffect(() => {
    if (!existing) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from fetched goal
    setTitle(existing.title)
    setEmoji(existing.emoji)
    setGoalAmount(String(Math.round(existing.goalAmount)))
    setCurrentAmount(String(Math.round(existing.currentAmount)))
    setTargetMonths(existing.targetMonths != null ? String(existing.targetMonths) : '')
    setIsActive(existing.isActive)
  }, [existing])

  // Sheet visibility
  const [titleOpen, setTitleOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)
  const [currentOpen, setCurrentOpen] = useState(false)
  const [monthsOpen, setMonthsOpen] = useState(false)

  const goalNumber = Number(goalAmount)
  const currentNumber = Number(currentAmount)
  const monthsNumber = targetMonths.trim() === '' ? null : Number(targetMonths)

  const canSubmit = useMemo(
    () =>
      title.trim().length > 0 &&
      Number.isFinite(goalNumber) &&
      goalNumber > 0 &&
      Number.isFinite(currentNumber) &&
      currentNumber >= 0,
    [title, goalNumber, currentNumber],
  )

  // Live preview goal to feed MetaCard.
  const previewGoal: SavingsGoal = useMemo(
    () => ({
      id: existing?.id ?? 'preview',
      familyId,
      title: title.trim() || 'Tu meta',
      emoji: emoji || '🎯',
      goalAmount: Number.isFinite(goalNumber) && goalNumber > 0 ? goalNumber : 1,
      currentAmount: Number.isFinite(currentNumber) ? Math.max(0, currentNumber) : 0,
      targetMonths: monthsNumber,
      isActive,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [familyId, existing, title, emoji, goalNumber, currentNumber, monthsNumber, isActive],
  )

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      const payload = validateSavingsGoalInput({
        title,
        emoji,
        goalAmount: goalNumber,
        currentAmount: currentNumber,
        targetMonths: monthsNumber,
        isActive,
      })
      await upsert.mutateAsync({ input: payload, existingId: existing?.id ?? null })
      void triggerHaptic('success')
      onSaved()
    } catch (err) {
      void triggerHaptic('error')
      Alert.alert(
        'No pudimos guardar',
        err instanceof Error ? err.message : 'Intentá de nuevo.',
      )
    }
  }

  const formattedGoal = Number.isFinite(goalNumber) && goalNumber > 0
    ? currencyFormatter.format(goalNumber)
    : 'Definir'
  const formattedCurrent = Number.isFinite(currentNumber)
    ? currencyFormatter.format(Math.max(0, currentNumber))
    : '$ 0'
  const formattedMonths = monthsNumber != null && monthsNumber > 0
    ? `${monthsNumber} ${monthsNumber === 1 ? 'mes' : 'meses'}`
    : 'No definido'

  return (
    <View style={styles.stack}>
      <AmbientBlobs />

      {/* HERO — live preview */}
      <RiseView>
        <MetaCard goal={previewGoal} />
      </RiseView>

      {/* DETALLE */}
      <RiseView delay={80}>
        <SettingsGroup title="Detalle">
          <SettingsRow
            icon="edit"
            label="Título"
            onPress={() => setTitleOpen(true)}
            value={title.trim() || 'Definir'}
          />
          <SettingsRow
            icon="mood"
            label="Emoji"
            onPress={() => setEmojiOpen(true)}
            value={emoji || '🎯'}
          />
          <SettingsRow
            icon="flag"
            label="Objetivo"
            onPress={() => setGoalOpen(true)}
            value={formattedGoal}
          />
          <SettingsRow
            icon="savings"
            label="Ahorrado hoy"
            onPress={() => setCurrentOpen(true)}
            value={formattedCurrent}
          />
          <SettingsRow
            icon="calendar-month"
            isLast
            label="Meses objetivo"
            onPress={() => setMonthsOpen(true)}
            value={formattedMonths}
          />
        </SettingsGroup>
      </RiseView>

      {/* ESTADO */}
      <RiseView delay={160}>
        <SettingsGroup
          title="Estado"
          footer="Las metas inactivas se guardan pero no aparecen en Home."
        >
          <SettingsSwitchRow
            icon="toggle-on"
            isLast
            label="Meta activa"
            onValueChange={setIsActive}
            value={isActive}
          />
        </SettingsGroup>
      </RiseView>

      <RiseView delay={220}>
        <SavingsAdvisorStrip signals={advisorSignals} />
      </RiseView>

      {/* CTA */}
      <RiseView delay={260}>
        <View style={[styles.footer, { borderTopColor: theme.colors.line }]}>
          <AppButton
            disabled={!canSubmit || upsert.isPending}
            label={existing ? 'Guardar cambios' : 'Crear meta'}
            loading={upsert.isPending}
            onPress={() => {
              void handleSubmit()
            }}
          />
        </View>
      </RiseView>

      {/* SHEETS */}
      <EditSavingsTitleSheet
        currentValue={title}
        onClose={() => setTitleOpen(false)}
        onSave={(next) => {
          setTitle(next)
          setTitleOpen(false)
        }}
        visible={titleOpen}
      />
      <EditSavingsEmojiSheet
        currentValue={emoji}
        onClose={() => setEmojiOpen(false)}
        onSave={(next) => {
          setEmoji(next)
          setEmojiOpen(false)
        }}
        visible={emojiOpen}
      />
      <NumericEditSheet
        visible={goalOpen}
        title="Objetivo"
        subtitle="Monto total que querés ahorrar."
        rawValue={goalAmount}
        onChangeRawValue={setGoalAmount}
        formatDisplay={(raw) => formatPriceInputValue(raw, false)}
        displayEyebrow="MONTO OBJETIVO"
        displayPlaceholder="$ 0"
        helper={
          Number.isFinite(goalNumber) && goalNumber > 0
            ? `Se guardará como ${currencyFormatter.format(goalNumber)}.`
            : 'Ingresá un monto mayor a cero.'
        }
        errorText={
          goalAmount.length > 0 && !(Number.isFinite(goalNumber) && goalNumber > 0)
            ? 'El objetivo debe ser mayor a cero.'
            : undefined
        }
        saveLabel="Guardar objetivo"
        saveDisabled={!(Number.isFinite(goalNumber) && goalNumber > 0)}
        onSave={() => setGoalOpen(false)}
        onClose={() => setGoalOpen(false)}
      />
      <NumericEditSheet
        visible={currentOpen}
        title="Ahorrado hoy"
        subtitle="Cuánto de esta meta ya tenés ahorrado."
        rawValue={currentAmount}
        onChangeRawValue={setCurrentAmount}
        formatDisplay={(raw) => formatPriceInputValue(raw, false)}
        displayEyebrow="AHORRADO"
        displayPlaceholder="$ 0"
        helper={
          Number.isFinite(currentNumber)
            ? `Se guardará como ${currencyFormatter.format(Math.max(0, currentNumber))}.`
            : 'Ingresá un monto válido.'
        }
        saveLabel="Guardar ahorrado"
        saveDisabled={!Number.isFinite(currentNumber) || currentNumber < 0}
        onSave={() => setCurrentOpen(false)}
        onClose={() => setCurrentOpen(false)}
      />
      <NumericEditSheet
        visible={monthsOpen}
        title="Meses objetivo"
        subtitle="En cuántos meses pensás alcanzar esta meta (opcional)."
        rawValue={targetMonths}
        onChangeRawValue={setTargetMonths}
        displayEyebrow="PLAZO"
        displayPlaceholder="12 meses"
        formatDisplay={(raw) => {
          if (!raw) return ''
          const n = Number(raw)
          if (!Number.isFinite(n)) return raw
          return `${n} ${n === 1 ? 'mes' : 'meses'}`
        }}
        helper="Dejalo vacío si no tenés plazo definido."
        maxIntegerDigits={3}
        maxDecimalDigits={0}
        saveLabel="Guardar plazo"
        saveDisabled={false}
        onSave={() => setMonthsOpen(false)}
        onClose={() => setMonthsOpen(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  stack: {
    gap: 18,
    position: 'relative',
  },
  footer: {
    paddingTop: 8,
  },
})
