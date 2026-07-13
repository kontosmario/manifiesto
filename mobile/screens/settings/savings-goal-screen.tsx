import { useRef, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { RequireReauthSheet } from '@/components/auth/require-reauth-sheet'
import { AppButton } from '@/components/ui/button'
import { LoadingBlock } from '@/components/ui/loading-block'
import { Screen } from '@/components/ui/screen'
import { CreateSavingsGoalWizardSheet } from '@/components/savings-goals/create-savings-goal-wizard-sheet'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { MetaCard } from '@/components/home/meta-card'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSwitchRow,
} from '@/components/settings/settings-grouped-list'
import type { SavingsGoal } from '@/features/savings-goals/savings-goal.model'
import { useLatestSavingsGoal } from '@/features/savings-goals/use-latest-savings-goal'
import { useUpsertSavingsGoal } from '@/features/savings-goals/use-upsert-savings-goal'
import { useDeleteSavingsGoal } from '@/features/savings-goals/use-delete-savings-goal'
import { useRequireReauth } from '@/features/auth/use-require-reauth'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'

interface SavingsGoalScreenProps {
  familyId: string
  userId?: string
}

export function SavingsGoalScreen({ familyId, userId }: SavingsGoalScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  // Importante: useLatestSavingsGoal (no useSavingsGoal) — Settings
  // necesita VER el goal aunque esté desactivado. Con la versión que
  // filtra por is_active, el toggle "off" hacía null al query → screen
  // flippaba al EmptyState como si se hubiera eliminado.
  const goalQuery = useLatestSavingsGoal(familyId)
  // Crear meta DESDE Settings (su hogar natural de gestión). Antes el empty
  // state punteaba a Control · Tu Alcancía, pero ese card cae a un estado
  // bloqueado ("Disponible pronto") cuando no hay días con gasto — así que una
  // cuenta nueva sin meta no tenía NINGÚN camino para crearla. El wizard es un
  // sheet self-contained: lo hosteamos aquí y al crear, la query invalida y la
  // pantalla pasa al viewer.
  const [wizardOpen, setWizardOpen] = useState(false)

  if (goalQuery.isLoading) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        contentContainerStyle={styles.screenContent}
        title={t('settings:savingsGoalScreen.title')}
        canGoBack
      >
        <LoadingBlock label={t('settings:savingsGoalScreen.loading')} />
      </Screen>
    )
  }

  if (!goalQuery.data) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        contentContainerStyle={styles.screenContent}
        title={t('settings:savingsGoalScreen.title')}
        canGoBack
      >
        <EmptyState onCreatePress={() => setWizardOpen(true)} />
        <CreateSavingsGoalWizardSheet
          visible={wizardOpen}
          familyId={familyId}
          userId={userId}
          onCreated={() => setWizardOpen(false)}
          onClose={() => setWizardOpen(false)}
        />
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      contentContainerStyle={styles.screenContent}
      title={t('settings:savingsGoalScreen.title')}
      canGoBack
    >
      <SavingsGoalViewer
        goal={goalQuery.data}
        familyId={familyId}
        userId={userId}
        onDeleted={() => router.back()}
      />
    </Screen>
  )
}

// ─── Empty state ────────────────────────────────────────────────────
interface EmptyStateProps {
  onCreatePress: () => void
}

function EmptyState({ onCreatePress }: EmptyStateProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  return (
    <View style={styles.stack}>
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />
      <RiseView>
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: theme.colors.primarySurface,
              borderColor: theme.colors.primary,
              borderRadius: theme.radii.xl,
            },
          ]}
        >
          <View
            style={[
              styles.emptyIconWrap,
              {
                backgroundColor: theme.isDark
                  ? theme.colors.surfaceMuted
                  : theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <MaterialIcons color={theme.colors.primary} name="flag" size={32} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
            {t('settings:savingsGoalScreen.emptyTitle')}
          </Text>
          <Text style={[styles.emptyBody, { color: theme.colors.textMuted }]}>
            {t('settings:savingsGoalScreen.emptyBody')}
          </Text>
          <View style={styles.emptyCta}>
            <AppButton
              variant="primary"
              label={t('settings:savingsGoalScreen.createGoal')}
              onPress={onCreatePress}
            />
          </View>
        </View>
      </RiseView>
    </View>
  )
}

// ─── Viewer ─────────────────────────────────────────────────────────
interface SavingsGoalViewerProps {
  goal: SavingsGoal
  familyId: string
  userId?: string
  onDeleted: () => void
}

function SavingsGoalViewer({
  goal,
  familyId,
  userId,
  onDeleted,
}: SavingsGoalViewerProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const upsert = useUpsertSavingsGoal(familyId, userId)
  const remove = useDeleteSavingsGoal(familyId, userId)
  const reauth = useRequireReauth()

  // Metas SECUENCIALES: al cumplir la meta vigente se habilita crear la
  // próxima. Capturamos la meta cumplida en un ref al abrir el wizard para
  // retirarla (isActive:false) recién cuando la nueva ya existe — inmune a que
  // un refetch re-renderice el viewer con la meta nueva antes del onCreated.
  const [nextWizardOpen, setNextWizardOpen] = useState(false)
  const retireGoalRef = useRef<SavingsGoal | null>(null)

  const handleCreateNext = () => {
    retireGoalRef.current = goal
    setNextWizardOpen(true)
  }

  const handleNextGoalCreated = () => {
    setNextWizardOpen(false)
    const retiring = retireGoalRef.current
    retireGoalRef.current = null
    if (!retiring) return
    // Retirá la meta cumplida a historial (isActive:false). Sin esto el
    // read-path activo (meta activa más vieja) seguiría devolviendo la cumplida.
    upsert.mutate({
      input: {
        title: retiring.title,
        emoji: retiring.emoji,
        goalAmount: retiring.goalAmount,
        currentAmount: retiring.currentAmount,
        targetMonths: retiring.targetMonths,
        isActive: false,
      },
      existingId: retiring.id,
    })
  }

  // ── Derived insight ──────────────────────────────────────────────
  const goalAmount = goal.goalAmount
  const currentAmount = goal.currentAmount
  const targetMonths = goal.targetMonths
  const goalDefined = Number.isFinite(goalAmount) && goalAmount > 0
  const remaining = goalDefined ? Math.max(0, goalAmount - currentAmount) : 0
  const pct = goalDefined
    ? Math.min(100, Math.round((currentAmount / goalAmount) * 100))
    : 0
  const monthly =
    goalDefined && targetMonths != null && targetMonths > 0 && remaining > 0
      ? Math.ceil(remaining / targetMonths)
      : null

  // ── Toggle isActive ──────────────────────────────────────────────
  const handleToggleActive = (next: boolean) => {
    upsert.mutate({
      input: {
        title: goal.title,
        emoji: goal.emoji,
        goalAmount: goal.goalAmount,
        currentAmount: goal.currentAmount,
        targetMonths: goal.targetMonths,
        isActive: next,
      },
      existingId: goal.id,
    })
  }

  // ── Delete with confirm ──────────────────────────────────────────
  // Si el goal tiene `current_amount > 0`, el usuario tiene ahorro
  // efectivo asignado a la meta. Antes de borrar pedimos un re-auth
  // para que un dispositivo desbloqueado no pueda destruir el
  // historial de ahorro con un solo tap (Sprint B · B1). Si el monto
  // es 0, el flow es low-stakes y mantenemos el Alert simple.
  const proceedDelete = async () => {
    try {
      await remove.mutateAsync(goal.id)
      void triggerHaptic('success')
      onDeleted()
    } catch (err) {
      void triggerHaptic('error')
      Alert.alert(
        t('settings:savingsGoalScreen.deleteErrorTitle'),
        err instanceof Error ? err.message : t('settings:savingsGoalScreen.tryAgain'),
      )
    }
  }

  const handleDelete = () => {
    const needsReauth = currentAmount > 0
    Alert.alert(
      t('settings:savingsGoalScreen.deleteTitle'),
      t('settings:savingsGoalScreen.deleteMessage', { title: goal.title }),
      [
        { text: t('common:actions.cancel'), style: 'cancel' },
        {
          text: t('common:actions.delete'),
          style: 'destructive',
          onPress: async () => {
            if (needsReauth) {
              const ok = await reauth.requireReauth(t('settings:savingsGoalScreen.deleteReauth'))
              if (!ok) return
            }
            await proceedDelete()
          },
        },
      ],
    )
  }

  return (
    <View style={styles.stack}>
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

      {/* HERO — current goal */}
      <RiseView>
        <MetaCard goal={goal} />
      </RiseView>

      {/* INSIGHT — progress + plan */}
      <RiseView delay={40}>
        <View
          style={[
            styles.insightCard,
            {
              backgroundColor: theme.isDark
                ? theme.colors.surfaceMuted
                : theme.colors.creamCard,
              borderColor: theme.colors.line,
              borderRadius: theme.radii.xl,
            },
          ]}
        >
          {!goalDefined ? (
            <Text style={[styles.insightMuted, { color: theme.colors.textMuted }]}>
              {t('settings:savingsGoalScreen.noTarget')}
            </Text>
          ) : currentAmount >= goalAmount ? (
            <View style={styles.reachedStack}>
              <Text style={[styles.insightCelebrate, { color: theme.colors.primary }]}>
                {t('settings:savingsGoalScreen.reached')}
              </Text>
              <Text style={[styles.insightMuted, { color: theme.colors.textMuted }]}>
                {t('settings:savingsGoalScreen.sequentialDisclaimer')}
              </Text>
              <AppButton
                variant="primary"
                label={t('settings:savingsGoalScreen.createNext')}
                onPress={handleCreateNext}
              />
            </View>
          ) : (
            <>
              {/* Progress bar */}
              <View style={styles.progressRow}>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: theme.colors.primarySurface },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${pct}%` as `${number}%`,
                        backgroundColor: theme.colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressPct, { color: theme.colors.textMuted }]}>
                  {pct}%
                </Text>
              </View>

              {/* Falta */}
              <Text style={[styles.insightLine, { color: theme.colors.text }]}>
                {t('settings:savingsGoalScreen.remainingPrefix')}{' '}
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>
                  {currencyFormatter.format(remaining)}
                </Text>
              </Text>

              {/* Por mes */}
              {monthly != null ? (
                <Text style={[styles.insightLine, { color: theme.colors.textMuted }]}>
                  {t('settings:savingsGoalScreen.monthlyPlan', {
                    amount: currencyFormatter.format(monthly),
                    count: targetMonths ?? 0,
                  })}
                </Text>
              ) : (
                <Text style={[styles.insightMuted, { color: theme.colors.textMuted }]}>
                  {t('settings:savingsGoalScreen.noDeadline')}
                </Text>
              )}
            </>
          )}
        </View>
      </RiseView>

      {/* ESTADO */}
      <RiseView delay={120}>
        <SettingsGroup
          title={t('settings:savingsGoalScreen.statusGroup')}
          footer={
            goal.isActive
              ? t('settings:savingsGoalScreen.statusFooterActive')
              : t('settings:savingsGoalScreen.statusFooterInactive')
          }
        >
          <SettingsSwitchRow
            icon="flag"
            isLast
            label={t('settings:savingsGoalScreen.metaLabel')}
            disabled={upsert.isPending}
            onValueChange={handleToggleActive}
            value={goal.isActive}
          />
        </SettingsGroup>
      </RiseView>

      {/* ACCIONES */}
      <RiseView delay={180}>
        <SettingsGroup title={t('settings:savingsGoalScreen.actionsGroup')}>
          <SettingsRow
            icon="delete"
            isLast
            label={t('settings:savingsGoalScreen.deleteRow')}
            destructive
            disabled={remove.isPending}
            onPress={handleDelete}
          />
        </SettingsGroup>
      </RiseView>

      {/* Re-auth sheet — solo se dispara cuando current_amount > 0. */}
      <RequireReauthSheet
        visible={reauth.isVisible}
        actionLabel={reauth.actionLabel}
        onConfirmed={reauth.onConfirmed}
        onCancel={reauth.onCancel}
      />

      {/* Wizard de la PRÓXIMA meta (metas secuenciales). Al crear, retira la
          meta cumplida a historial (handleNextGoalCreated). Cancelar no cambia
          nada: la meta cumplida sigue activa. */}
      <CreateSavingsGoalWizardSheet
        visible={nextWizardOpen}
        familyId={familyId}
        userId={userId}
        onCreated={handleNextGoalCreated}
        onClose={() => setNextWizardOpen(false)}
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
  insightCard: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    minWidth: 4,
  },
  progressPct: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'right',
  },
  insightLine: {
    fontSize: 14,
    lineHeight: 20,
  },
  insightMuted: {
    fontSize: 13,
    lineHeight: 18,
  },
  insightCelebrate: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  reachedStack: {
    gap: 12,
  },
  emptyCard: {
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 12,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyCta: {
    width: '100%',
    marginTop: 8,
  },
})
