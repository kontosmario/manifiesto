import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { Avatar } from '@/components/ui/avatar'
import { formatMemberSince, roleLabel } from '@/features/family/member-display'
import type { FamilyMemberStats } from '@/features/family/use-family-admin'
import { useAppTheme } from '@/theme/theme-provider'
import { withAlpha } from '@/theme/color-utils'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'

interface MemberRowProps {
  member: FamilyMemberStats
  isMe: boolean
  isLast: boolean
  /**
   * Ausente = fila de SOLA LECTURA (sin chevron, sin press). Es el caso de un
   * integrante no-dueño mirando el roster: desde 2026-08-17 puede ver quién
   * está en el hogar, pero las acciones (bloquear / eliminar) siguen siendo
   * del dueño y el backend también lo exige.
   */
  onPress?: () => void
}

/**
 * Fila de integrante — replica el chrome de `SettingsRow` (alto 56, divisor de
 * 1.5px, chevron) pero con avatar en vez del icon-tile. Vive dentro del card
 * del `SettingsGroup`, así que el divisor tiene que ser EL MISMO que el de las
 * filas del grupo: a `hairlineWidth` (0.33pt en 3x) desaparecía contra el
 * `sheetDivider` y las dos listas se leían con pesos distintos.
 *
 * Nació dentro de `family-admin-screen`; se extrajo acá el 2026-08-17 cuando el
 * roster se mudó a "Mi hogar".
 */
export function MemberRow({ member, isMe, isLast, onPress }: MemberRowProps) {
  const { theme } = useAppTheme()
  const neo = neoTokens(theme.isDark ? 'dark' : 'light')
  const ink = neoInk(theme.isDark ? 'dark' : 'light')
  const { t } = useTranslation()
  const showBadge = member.role !== 'member'
  const badgeBg =
    member.role === 'owner' ? neo.selectedTint : withAlpha(neo.warm, 0.16)
  const badgeColor = member.role === 'owner' ? ink.accent : ink.danger

  const content = (
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
            <View style={[styles.badge, { backgroundColor: badgeBg }]}>
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
      {onPress ? (
        <MaterialIcons name="chevron-right" size={22} color={neo.textMuted} />
      ) : null}
    </View>
  )

  if (!onPress) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={t('settings:myHome.memberReadOnlyA11y', {
          name: member.displayName,
        })}
      >
        {content}
      </View>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('settings:familyAdmin.memberActionsA11y', {
        name: member.displayName,
      })}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
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
})
