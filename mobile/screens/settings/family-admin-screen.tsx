import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { RiseView } from '@/components/home/animated/rise-view'
import { SettingsGroup } from '@/components/settings/settings-grouped-list'
import {
  SettingsHeroCard,
  settingsHeroInk,
} from '@/components/settings/settings-hero-card'
import { MemberActionSheet } from '@/components/settings/sheets/member-action-sheet'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { Avatar } from '@/components/ui/avatar'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { Screen } from '@/components/ui/screen'
import {
  useBlockMember,
  useFamilyMemberStats,
  useRemoveMember,
  useUnblockMember,
  type FamilyMemberStats,
} from '@/features/family/use-family-admin'
import { formatMemberSince, roleLabel } from '@/features/family/member-display'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { withAlpha } from '@/theme/color-utils'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { getErrorMessage } from '@/utils/error-message'
import { nunitoFamily } from '@/theme/typography'

interface FamilyAdminScreenProps {
  userId: string
  // Legacy familyCode prop removed — household identity now travels
  // via familyId; invites are generated per-share via Settings.
}

export function FamilyAdminScreen({ userId }: FamilyAdminScreenProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const statsQuery = useFamilyMemberStats()
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
      ? `${t('settings:familyAdmin.activeCount', { count: active.length })} · ${t('settings:familyAdmin.blockedCount', { count: blocked.length })}`
      : t('settings:familyAdmin.activeCount', { count: active.length })

  if (statsQuery.isError && !statsQuery.data) {
    return (
      <Screen
        backgroundColor={neo.bg}
        titleColor={neo.text}
        title={t('settings:familyAdmin.title')}
        subtitle={t('settings:familyAdmin.subtitleError')}
        canGoBack
      >
        <RiseView>
          <NeoStateBlock
            actionLabel={t('states:errorState.action')}
            description={getErrorMessage(
              statsQuery.error,
              t('settings:familyAdmin.errorDescription'),
            )}
            icon="error-outline"
            title={t('settings:familyAdmin.errorTitle')}
            tone="error"
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
      backgroundColor={neo.bg}
      titleColor={neo.text}
      title={t('settings:familyAdmin.title')}
      subtitle={t('settings:familyAdmin.subtitle')}
      canGoBack
      bodyStyle={styles.body}
      refreshControl={
        <RefreshControl
          refreshing={statsQuery.isRefetching}
          onRefresh={() => {
            void statsQuery.refetch()
          }}
          tintColor={neo.textMuted}
        />
      }
    >
      <RiseView>
        <SettingsHeroCard particleCount={9}>
          <Text style={[styles.heroEyebrow, { color: settingsHeroInk.accent }]}>
            {t('settings:familyAdmin.heroEyebrow')}
          </Text>
          <Text style={[styles.heroCount, { color: settingsHeroInk.title }]}>
            {t('settings:familyAdmin.memberCount', { count: totalMembers })}
          </Text>
          <Text style={[styles.heroSummary, { color: settingsHeroInk.soft }]}>
            {heroSummary}
          </Text>
        </SettingsHeroCard>
      </RiseView>

      <RiseView delay={80}>
        <SettingsGroup title={t('settings:familyAdmin.membersGroup')}>
          {active.length === 0 ? (
            <EmptyRow
              text={
                statsQuery.isLoading
                  ? t('settings:familyAdmin.loadingMembers')
                  : t('settings:familyAdmin.noMembers')
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
          <SettingsGroup title={t('settings:familyAdmin.blockedGroup')}>
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
        currentUserId={userId}
        onClose={() => setSelected(null)}
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
 * Fila de integrante — replica el chrome de `SettingsRow` (alto 56, divisor de
 * 1.5px, chevron) pero con avatar en vez del icon-tile. Vive dentro del card
 * del `SettingsGroup`, así que el divisor tiene que ser EL MISMO que el de las
 * filas del grupo: a `hairlineWidth` (0.33pt en 3x) desaparecía contra el
 * `sheetDivider` y las dos listas se leían con pesos distintos.
 */
function MemberRow({ member, isMe, isLast, onPress }: MemberRowProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const showBadge = member.role !== 'member'
  const badgeBg =
    member.role === 'owner' ? neo.selectedTint : withAlpha(neo.warm, 0.16)
  const badgeColor = member.role === 'owner' ? ink.accent : ink.danger

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('settings:familyAdmin.memberActionsA11y', { name: member.displayName })}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
    >
      <View
        style={[
          styles.memberRow,
          !isLast && {
            borderBottomColor: neo.sheetDivider,
            borderBottomWidth: 1.5,
          },
        ]}
      >
        {member.avatarAnimal ? (
          <AvatarAnimal slug={member.avatarAnimal} size={40} />
        ) : (
          <Avatar name={member.displayName} color={ink.accent} size={40} />
        )}
        <View style={styles.memberCopy}>
          <View style={styles.memberNameRow}>
            <Text
              style={[styles.memberName, { color: neo.text }]}
              numberOfLines={1}
            >
              {member.displayName}
              {isMe ? ` ${t('settings:member.youSuffix')}` : ''}
            </Text>
            {showBadge ? (
              <View
                style={[styles.badge, { backgroundColor: badgeBg }]}
              >
                <Text style={[styles.badgeText, { color: badgeColor }]}>
                  {roleLabel(member.role)}
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[styles.memberSince, { color: neo.textMuted }]}
            numberOfLines={1}
          >
            {formatMemberSince(member.memberSince)}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={neo.textMuted} />
      </View>
    </Pressable>
  )
}

function EmptyRow({ text }: { text: string }) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  return (
    <View style={styles.emptyRow}>
      <Text style={[styles.emptyText, { color: neo.textMuted }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // El wrapper del body del <Screen> no trae gap propio → sin esto el hero y
  // la primera sección quedan pegados. 24 = tier de separación entre secciones
  // (rhythm de 8), da el aire de "grouped list" de iOS.
  body: {
    gap: 24,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 1.6,
  },
  heroCount: {
    fontSize: 30,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.6,
  },
  heroSummary: {
    fontSize: 13,
    fontFamily: nunitoFamily('600'),
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
    fontFamily: nunitoFamily('600'),
    flexShrink: 1,
  },
  memberSince: {
    fontSize: 12,
    fontFamily: nunitoFamily('600'),
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: neoRadii.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  emptyRow: {
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: nunitoFamily('400'),
  },
})
