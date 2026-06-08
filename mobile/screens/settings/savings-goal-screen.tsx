import { Alert, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { AppButton } from '@/components/ui/button'
import { LoadingBlock } from '@/components/ui/loading-block'
import { Screen } from '@/components/ui/screen'
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
  // Importante: useLatestSavingsGoal (no useSavingsGoal) — Settings
  // necesita VER el goal aunque esté desactivado. Con la versión que
  // filtra por is_active, el toggle "off" hacía null al query → screen
  // flippaba al EmptyState como si se hubiera eliminado.
  const goalQuery = useLatestSavingsGoal(familyId)

  if (goalQuery.isLoading) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        contentContainerStyle={styles.screenContent}
        title="Meta de ahorro"
        canGoBack
      >
        <LoadingBlock label="Cargando meta..." />
      </Screen>
    )
  }

  if (!goalQuery.data) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        contentContainerStyle={styles.screenContent}
        title="Meta de ahorro"
        canGoBack
      >
        <EmptyState onCreatePress={() => router.push('/(app)/(tabs)/insights')} />
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      contentContainerStyle={styles.screenContent}
      title="Meta de ahorro"
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
            Aún no configuraste una meta de ahorro
          </Text>
          <Text style={[styles.emptyBody, { color: theme.colors.textMuted }]}>
            Las metas se crean desde Control · Tu Alcancía o durante el
            onboarding.
          </Text>
          <View style={styles.emptyCta}>
            <AppButton
              variant="primary"
              label="Ir a Control"
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
  const upsert = useUpsertSavingsGoal(familyId, userId)
  const remove = useDeleteSavingsGoal(familyId)

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
  const handleDelete = () => {
    Alert.alert(
      'Eliminar meta',
      `Vas a borrar tu meta de "${goal.title}". El monto que llevabas ahorrado queda en tu historial pero ya no se mostrará como meta activa. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(goal.id)
              void triggerHaptic('success')
              onDeleted()
            } catch (err) {
              void triggerHaptic('error')
              Alert.alert(
                'No pudimos eliminar',
                err instanceof Error ? err.message : 'Intentá de nuevo.',
              )
            }
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
              Tu meta no tiene un objetivo definido todavía.
            </Text>
          ) : currentAmount >= goalAmount ? (
            <Text style={[styles.insightCelebrate, { color: theme.colors.primary }]}>
              🎉 ¡Ya alcanzaste tu meta!
            </Text>
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
                Te falta{' '}
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>
                  {currencyFormatter.format(remaining)}
                </Text>
              </Text>

              {/* Por mes */}
              {monthly != null ? (
                <Text style={[styles.insightLine, { color: theme.colors.textMuted }]}>
                  Ahorrando {currencyFormatter.format(monthly)} por mes, llegás en{' '}
                  {targetMonths} {targetMonths === 1 ? 'mes' : 'meses'}.
                </Text>
              ) : (
                <Text style={[styles.insightMuted, { color: theme.colors.textMuted }]}>
                  Sin plazo definido para esta meta.
                </Text>
              )}
            </>
          )}
        </View>
      </RiseView>

      {/* ESTADO */}
      <RiseView delay={120}>
        <SettingsGroup
          title="Estado"
          footer={
            goal.isActive
              ? 'La meta aparece en Home y participa de tus aportes.'
              : 'Inactiva — no aparece en Home pero los datos se conservan.'
          }
        >
          <SettingsSwitchRow
            icon="flag"
            isLast
            label="Meta"
            disabled={upsert.isPending}
            onValueChange={handleToggleActive}
            value={goal.isActive}
          />
        </SettingsGroup>
      </RiseView>

      {/* ACCIONES */}
      <RiseView delay={180}>
        <SettingsGroup title="Acciones">
          <SettingsRow
            icon="delete"
            isLast
            label="Eliminar meta"
            destructive
            disabled={remove.isPending}
            onPress={handleDelete}
          />
        </SettingsGroup>
      </RiseView>
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
