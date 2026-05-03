import { StyleSheet, Text, View } from 'react-native'
import { Avatar } from '@/components/ui/avatar'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { RiseView } from '@/components/home/animated/rise-view'
import { formatMoneyShort, parsePrice } from '@/utils/money'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { useAppTheme } from '@/theme/theme-provider'
import type { FamilyPeek } from '@/features/family/use-family-actions'

interface StepFamilySummaryProps {
  /** Snapshot fetched in step 3 via `peek_family_by_code`. The user
   *  is NOT a member yet — the actual `join_family_by_code` insert
   *  happens when they tap "Confirmar y unirme" (handled by the
   *  screen's primary CTA). All summary data here comes from this
   *  read-only snapshot. */
  pendingFamily: FamilyPeek
  /** Joiner's pending choice + amount. Renders an extra "vos" row
   *  in the members list with the contribution they're about to
   *  bring in. */
  contributesIncome: boolean | null
  monthlyIncomeRaw: string
  pendingDisplayName: string
  pendingAvatarSlug: AvatarSlug | null
}

/**
 * Joiner-only step 5 — read-only family preview before the actual
 * join. Renders the existing roster with avatars + names + each
 * member's contribution, the household income total (and what it'll
 * be after the joiner's contribution lands), a quick cycle pulse
 * (variable spend this month / active fijos) and the active goal
 * if any. The CTA wording ("Confirmar y unirme") is owned by the
 * screen's primaryLabel.
 */
export function StepFamilySummary({
  pendingFamily,
  contributesIncome,
  monthlyIncomeRaw,
  pendingDisplayName,
  pendingAvatarSlug,
}: StepFamilySummaryProps) {
  const { theme } = useAppTheme()

  const householdIncome = pendingFamily.monthly_income
  const parsedContribution = parsePrice(monthlyIncomeRaw)
  const pendingContribution =
    contributesIncome === true &&
    Number.isFinite(parsedContribution) &&
    parsedContribution > 0
      ? parsedContribution
      : 0
  const projectedTotal = householdIncome + pendingContribution

  const activeGoal = pendingFamily.active_goal

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
            <Text style={[styles.heroDelta, { color: theme.colors.primary }]}>
              + {formatMoneyShort(pendingContribution)} tu aporte ={' '}
              {formatMoneyShort(projectedTotal)}
            </Text>
          ) : contributesIncome === false ? (
            <Text style={[styles.heroDelta, { color: theme.colors.textMuted }]}>
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
          {pendingFamily.members.map((m) => {
            const avatarSlug =
              m.avatar_animal && isAvatarSlug(m.avatar_animal)
                ? (m.avatar_animal as AvatarSlug)
                : null
            return (
              <View
                key={m.user_id}
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                {avatarSlug ? (
                  <AvatarAnimal slug={avatarSlug} size={40} />
                ) : (
                  <Avatar
                    name={m.display_name || '?'}
                    color={theme.colors.primary}
                    size={40}
                  />
                )}
                <View style={styles.memberText}>
                  <Text
                    style={[styles.memberName, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {m.display_name || 'Sin nombre'}
                    {m.role === 'owner' ? '  · dueño' : ''}
                  </Text>
                  <Text
                    style={[
                      styles.memberContribution,
                      { color: theme.colors.textMuted },
                    ]}
                  >
                    {m.monthly_income_contribution > 0
                      ? `Aporta ${formatMoneyShort(m.monthly_income_contribution)} /mes`
                      : 'No aporta'}
                  </Text>
                </View>
              </View>
            )
          })}

          {/* Pending self-row — the user previewed below the existing
              members. Visually marked with a dashed border to telegraph
              "todavía no estás dentro". */}
          <View
            style={[
              styles.memberRow,
              styles.memberRowPending,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.primary,
              },
            ]}
          >
            {pendingAvatarSlug ? (
              <AvatarAnimal slug={pendingAvatarSlug} size={40} />
            ) : (
              <Avatar
                name={pendingDisplayName || '?'}
                color={theme.colors.primary}
                size={40}
              />
            )}
            <View style={styles.memberText}>
              <Text
                style={[styles.memberName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {pendingDisplayName || 'Vos'} · vos
              </Text>
              <Text
                style={[
                  styles.memberContribution,
                  { color: theme.colors.primary },
                ]}
              >
                {pendingContribution > 0
                  ? `Vas a aportar ${formatMoneyShort(pendingContribution)} /mes`
                  : 'No vas a aportar'}
              </Text>
            </View>
          </View>
        </View>
      </RiseView>

      <RiseView delay={200}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          ESTADO DEL CICLO
        </Text>
        <View style={styles.cycleRow}>
          <CycleStat
            label="Gastos del mes"
            value={formatMoneyShort(pendingFamily.cycle_variable_spent)}
            theme={theme}
          />
          <CycleStat
            label={
              pendingFamily.active_fixed_count === 1
                ? 'Fijo activo'
                : 'Fijos activos'
            }
            value={String(pendingFamily.active_fixed_count)}
            theme={theme}
          />
        </View>
        {activeGoal ? (
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
              {activeGoal.title}
            </Text>
            <Text style={[styles.goalProgress, { color: theme.colors.textMuted }]}>
              {formatMoneyShort(activeGoal.current_amount)} de{' '}
              {formatMoneyShort(activeGoal.goal_amount)}
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
  memberRowPending: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
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
