import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { useFamilyMembersDetail } from '@/features/family/use-family-members-detail'
import { formatDate } from '@/features/billing/membership-state'
import { getStateTokens } from '@/theme/state-tokens'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Integrantes del hogar que usan el plan: avatar + nombre + desde cuándo se
 * unió, con badge para el dueño. Misma superficie calma que las cards de
 * Ajustes (surfaceMuted oscuro / creamCard claro + borde line). El dueño va
 * primero; el resto por antigüedad.
 */
export interface HouseholdMembersListProps {
  familyId?: string
}

export const HouseholdMembersList = memo(function HouseholdMembersList({
  familyId,
}: HouseholdMembersListProps) {
  const { theme } = useAppTheme()
  const { data: members } = useFamilyMembersDetail(familyId)
  if (!members || members.length === 0) return null

  const sorted = [...members].sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1
    return (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '')
  })

  const ownerPill = getStateTokens('positive', theme)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <Text
        style={[
          theme.typography.eyebrow,
          styles.heading,
          { color: theme.colors.textMuted },
        ]}
      >
        Integrantes del hogar
      </Text>
      {sorted.map((m, i) => (
        <View
          key={m.userId}
          style={[
            styles.row,
            i > 0 && {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          {m.avatarSlug ? (
            <AvatarAnimal slug={m.avatarSlug} size={34} />
          ) : (
            <View
              style={[
                styles.fallback,
                { backgroundColor: theme.colors.primarySurface },
              ]}
            >
              <Text style={[styles.fallbackText, { color: theme.colors.primary }]}>
                {(m.displayName || '?').trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <View style={styles.mid}>
            <Text
              style={[styles.name, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {m.displayName || 'Integrante'}
            </Text>
            <Text style={[styles.sub, { color: theme.colors.textMuted }]}>
              {m.joinedAt ? `Se unió el ${formatDate(m.joinedAt)}` : 'En el hogar'}
            </Text>
          </View>
          {m.isOwner ? (
            <View
              style={[
                styles.pill,
                { backgroundColor: ownerPill.bg, borderColor: ownerPill.border },
              ]}
            >
              <Text style={[styles.pillText, { color: ownerPill.fg }]}>Dueño</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  heading: { textTransform: 'uppercase', marginTop: 9, marginBottom: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  fallback: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { fontSize: 14, fontWeight: '800' },
  mid: { flex: 1, gap: 1 },
  name: { fontSize: 13, fontWeight: '800' },
  sub: { fontSize: 11, fontWeight: '600' },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
})
