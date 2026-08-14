import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { NeoSurface } from '@/components/ui/neo-surface'
import {
  BillingStatusChip,
  useRaisedFallback,
} from '@/components/billing/billing-neo-kit'
import { useFamilyMembersDetail } from '@/features/family/use-family-members-detail'
import { formatDate } from '@/features/billing/membership-state'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Integrantes del hogar que usan el plan: avatar + nombre + desde cuándo se
 * unió, con chip para el dueño. Grupo `raisedLg` con el hairline de lista del
 * vocabulario, igual que la card de detalle. El dueño va primero; el resto por
 * antigüedad.
 */
export interface HouseholdMembersListProps {
  familyId?: string
}

export const HouseholdMembersList = memo(function HouseholdMembersList({
  familyId,
}: HouseholdMembersListProps) {
  const mode = useThemeTokens().mode
  const neo = neoTokens(mode)
  const ink = neoInk(mode)
  const { t } = useTranslation()
  const flatFallback = useRaisedFallback()
  const { data: members } = useFamilyMembersDetail(familyId)
  if (!members || members.length === 0) return null

  const sorted = [...members].sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1
    return (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '')
  })

  return (
    <NeoSurface
      radius={neoRadii.card}
      style={[styles.card, flatFallback]}
      variant="raisedLg"
    >
      <Text style={[styles.heading, { color: neo.textMuted }]}>
        {t('billing:members.heading')}
      </Text>
      {sorted.map((m, i) => (
        <View
          key={m.userId}
          style={[
            styles.row,
            i < sorted.length - 1 && {
              borderBottomWidth: 1.5,
              borderBottomColor: neo.sheetDivider,
            },
          ]}
        >
          {m.avatarSlug ? (
            <AvatarAnimal size={34} slug={m.avatarSlug} />
          ) : (
            <View
              style={[styles.fallback, { backgroundColor: neo.selectedTint }]}
            >
              <Text style={[styles.fallbackText, { color: ink.accent }]}>
                {(m.displayName || '?').trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.mid}>
            <Text
              numberOfLines={1}
              style={[styles.name, { color: neo.text }]}
            >
              {m.displayName || t('billing:members.fallbackName')}
            </Text>
            <Text style={[styles.sub, { color: neo.textMuted }]}>
              {m.joinedAt
                ? t('billing:members.joinedOn', { date: formatDate(m.joinedAt) })
                : t('billing:members.inHousehold')}
            </Text>
          </View>
          {m.isOwner ? (
            <BillingStatusChip label={t('billing:members.owner')} tone="active" />
          ) : null}
        </View>
      ))}
    </NeoSurface>
  )
})

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
  },
  heading: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 13,
    marginBottom: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  fallback: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  mid: { flex: 1, gap: 2 },
  name: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  sub: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
})
