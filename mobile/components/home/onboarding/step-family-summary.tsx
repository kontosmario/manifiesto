import { StyleSheet, Text, View } from 'react-native'
import { Avatar } from '@/components/ui/avatar'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { RiseView } from '@/components/home/animated/rise-view'
import { formatMoneyShort, parsePrice } from '@/utils/money'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { useAppTheme } from '@/theme/theme-provider'
import type { FamilyPeek } from '@/features/family/use-family-actions'

interface StepFamilySummaryProps {
  /** Snapshot fetched in step 3 via `peek_family_invite`. The user is
   *  NOT a member yet — the actual `consume_family_invite` insert
   *  happens when they tap "Confirmar y unirme". The payload is
   *  intentionally narrow (security hardening 2026-05-10): names +
   *  avatars + household income aggregate + goal title only. Per-
   *  member breakdown lands after consume. */
  pendingFamily: FamilyPeek
  contributesIncome: boolean | null
  monthlyIncomeRaw: string
  pendingDisplayName: string
  pendingAvatarSlug: AvatarSlug | null
}

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
  const activeGoalTitle = pendingFamily.active_goal_title

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          La familia
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          Esto es lo que vas a encontrar al unirte. Confirma si todo se ve bien.
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
          {`MIEMBROS · ${pendingFamily.member_count}`}
        </Text>
        <View style={styles.membersList}>
          {pendingFamily.members.map((m, idx) => {
            const avatarSlug =
              m.avatar_animal && isAvatarSlug(m.avatar_animal)
                ? (m.avatar_animal as AvatarSlug)
                : null
            return (
              <View
                key={`${m.display_name}-${idx}`}
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
                </View>
              </View>
            )
          })}

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
                {pendingDisplayName || 'Tú'} · tú
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

      {activeGoalTitle ? (
        <RiseView delay={200}>
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
              {activeGoalTitle}
            </Text>
            <Text style={[styles.goalProgress, { color: theme.colors.textMuted }]}>
              Verás el avance al unirte.
            </Text>
          </View>
        </RiseView>
      ) : null}
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
