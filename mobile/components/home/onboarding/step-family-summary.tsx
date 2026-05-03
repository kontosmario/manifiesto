import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Avatar } from '@/components/ui/avatar'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { RiseView } from '@/components/home/animated/rise-view'
import { formatMoneyShort, parsePrice } from '@/utils/money'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import { useFamilyMembersDetail } from '@/features/family/use-family-members-detail'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useFixedExpenses } from '@/features/fixed-expenses/use-fixed-expenses'
import { useSavingsGoal } from '@/features/savings-goals/use-savings-goal'
import { useAppTheme } from '@/theme/theme-provider'

interface StepFamilySummaryProps {
  familyId: string
  /** Auth user id — used to highlight "vos" in the members list and
   *  to compute the "después de tu aporte" projection. */
  userId: string
  /** Current onboarding state — the user's pending contribution that
   *  hasn't been written yet. Lets us show a live "tu aporte" pill
   *  and the "total tras unirte" preview. */
  contributesIncome: boolean | null
  monthlyIncomeRaw: string
}

/**
 * Joiner-only step 5. Shows the family the user is about to confirm:
 * member roster with avatars + names + each one's contribution, the
 * household income total (and what it'll be after this user joins),
 * a quick cycle pulse (gastos del mes / fijos pendientes) and the
 * active goal if any.
 *
 * The CTA wording ("Confirmar y unirme") is owned by the screen's
 * primaryLabel, not this component — we only render the read-only
 * preview.
 */
export function StepFamilySummary({
  familyId,
  userId,
  contributesIncome,
  monthlyIncomeRaw,
}: StepFamilySummaryProps) {
  const { theme } = useAppTheme()
  const membersQuery = useFamilyMembersDetail(familyId)
  const financeQuery = useFamilyFinance(familyId)
  const expensesQuery = useExpenses(familyId)
  const fixedExpensesQuery = useFixedExpenses(familyId)
  const goalQuery = useSavingsGoal(familyId)

  const isLoading =
    membersQuery.isLoading ||
    financeQuery.isLoading ||
    expensesQuery.isLoading ||
    fixedExpensesQuery.isLoading

  const householdIncome = financeQuery.data?.monthly_income ?? 0
  const parsedContribution = parsePrice(monthlyIncomeRaw)
  const pendingContribution =
    contributesIncome === true &&
    Number.isFinite(parsedContribution) &&
    parsedContribution > 0
      ? parsedContribution
      : 0
  // The user is already a member at this step (`useJoinFamily` ran in
  // step 3) but their contribution row is still 0 — the actual write
  // happens on "Confirmar y unirme". So the "after" preview is just
  // the current household total + the pending amount.
  const projectedTotal = householdIncome + pendingContribution

  const expenses = expensesQuery.data ?? []
  const variableExpenses = expenses.filter((e) => !e.commitment_id)
  const cycleVariableTotal = variableExpenses.reduce(
    (sum, e) => sum + Number(e.price ?? 0),
    0,
  )
  const fixedExpenses = fixedExpensesQuery.data ?? []
  // Pending = currently-active fijos (paused / completed / archived
  // ones don't show up in the cycle anymore). Detailed cycle status
  // lives in the Fijos screen — this is a lightweight pulse.
  const activeFixedCount = fixedExpenses.filter(
    (f) => f.status === 'active',
  ).length
  const goal = goalQuery.data ?? null

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          La familia
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          Esto es lo que vas a encontrar al unirte. Confirmá si todo se ve bien.
        </Text>
      </RiseView>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : null}

      <RiseView delay={80}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            INGRESO MENSUAL DEL HOGAR
          </Text>
          <Text style={[styles.heroValue, { color: theme.colors.text }]}>
            {formatMoneyShort(householdIncome)}
          </Text>
          {pendingContribution > 0 ? (
            <Text
              style={[styles.heroDelta, { color: theme.colors.primary }]}
            >
              + {formatMoneyShort(pendingContribution)} tu aporte ={' '}
              {formatMoneyShort(projectedTotal)}
            </Text>
          ) : contributesIncome === false ? (
            <Text
              style={[styles.heroDelta, { color: theme.colors.textMuted }]}
            >
              No vas a aportar al ingreso del hogar.
            </Text>
          ) : null}
        </View>
      </RiseView>

      <RiseView delay={140}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          MIEMBROS
        </Text>
        <View style={styles.membersList}>
          {(membersQuery.data ?? []).map((m) => {
            const isYou = m.userId === userId
            return (
              <View
                key={m.userId}
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                {m.avatarSlug ? (
                  <AvatarAnimal slug={m.avatarSlug} size={40} />
                ) : (
                  <Avatar name={m.displayName || '?'} color={theme.colors.primary} size={40} />
                )}
                <View style={styles.memberText}>
                  <Text
                    style={[styles.memberName, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {m.displayName || 'Sin nombre'}
                    {isYou ? '  · vos' : ''}
                  </Text>
                  <Text
                    style={[
                      styles.memberContribution,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {m.monthlyIncomeContribution > 0
                      ? `Aporta ${formatMoneyShort(m.monthlyIncomeContribution)} /mes`
                      : isYou && pendingContribution > 0
                        ? `Vas a aportar ${formatMoneyShort(pendingContribution)} /mes`
                        : 'No aporta'}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </RiseView>

      <RiseView delay={200}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          ESTADO DEL CICLO
        </Text>
        <View style={styles.cycleRow}>
          <CycleStat
            label="Gastos del mes"
            value={formatMoneyShort(cycleVariableTotal)}
            theme={theme}
          />
          <CycleStat
            label={activeFixedCount === 1 ? 'Fijo activo' : 'Fijos activos'}
            value={String(activeFixedCount)}
            theme={theme}
          />
        </View>
        {goal && goal.isActive ? (
          <View
            style={[
              styles.goalCard,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
              META ACTIVA
            </Text>
            <Text style={[styles.goalTitle, { color: theme.colors.text }]}>
              {goal.title}
            </Text>
            <Text style={[styles.goalProgress, { color: theme.colors.textMuted }]}>
              {formatMoneyShort(goal.currentAmount)} de{' '}
              {formatMoneyShort(goal.goalAmount)}
            </Text>
          </View>
        ) : null}
      </RiseView>
    </View>
  )
}

interface CycleStatProps {
  label: string
  value: string
  theme: ReturnType<typeof useAppTheme>['theme']
}

function CycleStat({ label, value, theme }: CycleStatProps) {
  return (
    <View
      style={[
        styles.cycleStat,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.cycleStatValue, { color: theme.colors.text }]}>
        {value}
      </Text>
      <Text style={[styles.cycleStatLabel, { color: theme.colors.textMuted }]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  loading: { paddingVertical: 16, alignItems: 'center' },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  heroDelta: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  membersList: { gap: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  memberText: { flex: 1, minWidth: 0, gap: 2 },
  memberName: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  memberContribution: { fontSize: 12, fontWeight: '500' },
  cycleRow: { flexDirection: 'row', gap: 10 },
  cycleStat: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  cycleStatValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  cycleStatLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  goalCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  goalTitle: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  goalProgress: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
})
