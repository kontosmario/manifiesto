import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { RiseView } from '@/components/home/animated/rise-view'
import { SettingsGroup } from '@/components/settings/settings-grouped-list'
import { MemberActionSheet } from '@/components/settings/sheets/member-action-sheet'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { Avatar } from '@/components/ui/avatar'
import { ErrorState } from '@/components/ui/error-state'
import { Screen } from '@/components/ui/screen'
import { DARK_TAB_CANVAS, radii } from '@/theme/palette'
import {
  useBlockMember,
  useFamilyMemberStats,
  useRemoveMember,
  useTransferOwnership,
  useUnblockMember,
  type FamilyMemberStats,
} from '@/features/family/use-family-admin'
import { formatMemberSince, roleLabel } from '@/features/family/member-display'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface FamilyAdminScreenProps {
  userId: string
  // Legacy familyCode prop removed — household identity now travels
  // via familyId; invites are generated per-share via Settings.
}

export function FamilyAdminScreen({ userId }: FamilyAdminScreenProps) {
  const { theme } = useAppTheme()
  const statsQuery = useFamilyMemberStats()
  const transferMutation = useTransferOwnership()
  const blockMutation = useBlockMember()
  const unblockMutation = useUnblockMember()
  const removeMutation = useRemoveMember()

  const [selected, setSelected] = useState<FamilyMemberStats | null>(null)

  const members = useMemo(() => statsQuery.data ?? [], [statsQuery.data])
  // Activos (dueño + miembros), dueño primero; y bloqueados aparte.
  const active = useMemo(
    () =>
      members
        .filter((m) => m.role !== 'blocked')
        .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0)),
    [members],
  )
  const blocked = useMemo(() => members.filter((m) => m.role === 'blocked'), [members])
  const totalMembers = members.length

  const openMember = useCallback((member: FamilyMemberStats) => {
    void triggerHaptic('selection')
    setSelected(member)
  }, [])

  const heroSummary =
    blocked.length > 0
      ? `${active.length} ${active.length === 1 ? 'activo' : 'activos'} · ${blocked.length} ${blocked.length === 1 ? 'bloqueado' : 'bloqueados'}`
      : `${active.length} ${active.length === 1 ? 'activo' : 'activos'}`

  if (statsQuery.isError && !statsQuery.data) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        title="Gestión de familia"
        subtitle="Roles, bloqueos y transferencias"
        canGoBack
        backgroundSlot={<AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />}
      >
        <RiseView>
          <ErrorState
            title="No pudimos cargar la familia"
            description={getErrorMessage(
              statsQuery.error,
              'Prueba otra vez en un momento.',
            )}
            onAction={() => {
              void statsQuery.refetch()
            }}
          />
        </RiseView>
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title="Gestión de familia"
      subtitle="Roles, bloqueos y transferencias"
      canGoBack
      backgroundSlot={<AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />}
      refreshControl={
        <RefreshControl
          refreshing={statsQuery.isRefetching}
          onRefresh={() => {
            void statsQuery.refetch()
          }}
          tintColor={theme.colors.textMuted}
        />
      }
    >
      <RiseView>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.hero}
        >
          <Text style={[styles.heroEyebrow, { color: theme.colors.heroAccent }]}>
            FAMILIA
          </Text>
          <Text style={[styles.heroCount, { color: theme.colors.heroText }]}>
            {totalMembers} {totalMembers === 1 ? 'integrante' : 'integrantes'}
          </Text>
          <Text style={[styles.heroSummary, { color: theme.colors.heroMuted }]}>
            {heroSummary}
          </Text>
        </LinearGradient>
      </RiseView>

      <RiseView delay={80}>
        <SettingsGroup title="Integrantes">
          {active.length === 0 ? (
            <EmptyRow
              text={
                statsQuery.isLoading
                  ? 'Cargando integrantes…'
                  : 'Todavía no hay integrantes.'
              }
            />
          ) : (
            active.map((member, index) => (
              <MemberRow
                key={member.userId}
                member={member}
                isMe={member.userId === userId}
                isLast={index === active.length - 1}
                onPress={() => openMember(member)}
              />
            ))
          )}
        </SettingsGroup>
      </RiseView>

      {blocked.length > 0 ? (
        <RiseView delay={140}>
          <SettingsGroup title="Bloqueados">
            {blocked.map((member, index) => (
              <MemberRow
                key={member.userId}
                member={member}
                isMe={member.userId === userId}
                isLast={index === blocked.length - 1}
                onPress={() => openMember(member)}
              />
            ))}
          </SettingsGroup>
        </RiseView>
      ) : null}

      <MemberActionSheet
        member={selected}
        isMe={selected ? selected.userId === userId : false}
        onClose={() => setSelected(null)}
        onTransfer={(member) => transferMutation.mutateAsync({ targetUserId: member.userId })}
        onBlock={(member) => blockMutation.mutateAsync({ targetUserId: member.userId })}
        onUnblock={(member) => unblockMutation.mutateAsync({ targetUserId: member.userId })}
        onRemove={(member) => removeMutation.mutateAsync({ targetUserId: member.userId })}
      />
    </Screen>
  )
}

interface MemberRowProps {
  member: FamilyMemberStats
  isMe: boolean
  isLast: boolean
  onPress: () => void
}

/**
 * Fila de integrante — replica el chrome de `SettingsRow` (alto 56, divisor
 * hairline, chevron) pero con avatar en vez del icon-tile. Vive dentro del
 * card del `SettingsGroup`.
 */
function MemberRow({ member, isMe, isLast, onPress }: MemberRowProps) {
  const { theme } = useAppTheme()
  const showBadge = member.role !== 'member'
  const badgeBg =
    member.role === 'owner' ? theme.colors.primarySurface : theme.colors.peachSoft
  const badgeColor =
    member.role === 'owner' ? theme.colors.primaryStrong : theme.colors.danger

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Acciones para ${member.displayName}`}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
    >
      <View
        style={[
          styles.memberRow,
          !isLast && {
            borderBottomColor: theme.colors.line,
            borderBottomWidth: StyleSheet.hairlineWidth,
          },
        ]}
      >
        {member.avatarAnimal ? (
          <AvatarAnimal slug={member.avatarAnimal} size={40} />
        ) : (
          <Avatar name={member.displayName} color={theme.colors.primary} size={40} />
        )}
        <View style={styles.memberCopy}>
          <View style={styles.memberNameRow}>
            <Text
              style={[styles.memberName, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {member.displayName}
              {isMe ? ' (tú)' : ''}
            </Text>
            {showBadge ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: badgeBg, borderColor: theme.colors.line },
                ]}
              >
                <Text style={[styles.badgeText, { color: badgeColor }]}>
                  {roleLabel(member.role)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[styles.memberSince, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {formatMemberSince(member.memberSince)}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={theme.colors.textSoft} />
      </View>
    </Pressable>
  )
}

function EmptyRow({ text }: { text: string }) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.emptyRow}>
      <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radii.xl,
    padding: 20,
    gap: 6,
    overflow: 'hidden',
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
  },
  heroCount: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heroSummary: {
    fontSize: 13,
    lineHeight: 18,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  memberCopy: {
    flex: 1,
    gap: 2,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    maxWidth: '70%',
  },
  memberSince: {
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  emptyRow: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 14,
  },
})
