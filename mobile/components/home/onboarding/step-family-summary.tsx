import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/ui/avatar'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { RiseView } from '@/components/home/animated/rise-view'
import { formatMoneyShort, parsePrice } from '@/utils/money'
import { isAvatarSlug, type AvatarSlug } from '@/assets/avatars'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import type { FamilyPeek } from '@/features/family/use-family-actions'
import { nunitoFamily } from '@/theme/typography'

interface StepFamilySummaryProps {
  /** Snapshot fetched in step 3 via `peek_family_invite`. The user is
   *  NOT a member yet — the actual `consume_family_invite` insert
   *  happens when they tap "Confirmar y unirme". The payload is
   *  intentionally narrow (security hardening audit 2026-06-30): solo
   *  nombres + avatares + conteo de miembros. NO expone datos financieros
   *  de la familia (ingreso/meta) a un no-miembro con un código de invite. */
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
  const { t } = useTranslation()

  const parsedContribution = parsePrice(monthlyIncomeRaw)
  const pendingContribution =
    contributesIncome === true &&
    Number.isFinite(parsedContribution) &&
    parsedContribution > 0
      ? parsedContribution
      : 0
  // Hogar de ingreso DINÁMICO: no existe el aporte mensual (el paso de
  // contribución se salta), así que la línea aporta/no-aporta no aplica.
  const dynamicHousehold = pendingFamily.income_mode === 'dynamic'

  return (
    <View style={styles.stack}>
      <RiseView>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('onboarding:familySummary.title')}
        </Text>
        <Text style={[styles.subcopy, { color: theme.colors.textMuted }]}>
          {t('onboarding:familySummary.subcopy')}
        </Text>
      </RiseView>

      <RiseView delay={140}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          {t('onboarding:familySummary.membersEyebrow', { count: pendingFamily.member_count })}
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
                    backgroundColor: theme.colors.creamCard,
                    borderColor: theme.colors.line,
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
                    {m.display_name || t('onboarding:familySummary.noName')}
                    {m.role === 'owner' ? t('onboarding:familySummary.ownerSuffix') : ''}
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
                backgroundColor: theme.colors.primarySurface,
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
                {(pendingDisplayName || t('onboarding:familySummary.youName')) +
                  t('onboarding:familySummary.youSuffix')}
              </Text>
              {!dynamicHousehold ? (
                <Text
                  style={[
                    styles.memberContribution,
                    { color: theme.colors.primary },
                  ]}
                >
                  {pendingContribution > 0
                    ? t('onboarding:familySummary.willContribute', {
                        amount: formatMoneyShort(pendingContribution),
                      })
                    : t('onboarding:familySummary.wontContribute')}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </RiseView>

    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  title: { fontSize: 24, fontWeight: '800', fontFamily: nunitoFamily('800'), letterSpacing: -0.6 },
  subcopy: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  membersList: { gap: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 12,
  },
  memberRowPending: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  memberText: { flex: 1, minWidth: 0, gap: 2 },
  memberName: { fontSize: 14, fontWeight: '700', fontFamily: nunitoFamily('700'), letterSpacing: -0.2 },
  memberContribution: { fontSize: 12, fontWeight: '500', fontFamily: nunitoFamily('500') },
})
