import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { AvatarSlug } from '@/assets/avatars'
import { PaydayPillV2 } from '@/components/home/payday-pill-v2'
import { RiseView } from '@/components/home/animated/rise-view'
import { Avatar } from '@/components/ui/avatar'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

export interface FamilyMember {
  id: string
  name: string
  color: string
  avatarSlug?: AvatarSlug | null
}

interface FamilyStripProps {
  members: FamilyMember[]
  daysUntilPayday: number | null
  paydayPending: boolean
  onPaydayPress?: () => void
  /** Cuando es false (modo solo), oculta avatares y 'Miembros · N' pero conserva el PaydayPill. */
  showMembers?: boolean
}

const MAX_AVATARS = 4

export const FamilyStrip = memo(function FamilyStrip({ members, daysUntilPayday, paydayPending, onPaydayPress, showMembers = true }: FamilyStripProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const visible = members.slice(0, MAX_AVATARS)
  const overflow = members.length - visible.length
  return (
    <RiseView delay={100}>
      <View style={styles.row}>
        {showMembers ? (
          <>
            <View
              style={styles.avatars}
              accessible
              accessibilityLabel={t('home:familyStrip.membersAccessibility', {
                members:
                  members.length === 0
                    ? t('home:familyStrip.none')
                    : members.map((m) => m.name).join(', '),
              })}
            >
              {visible.map((m, i) => (
                <View key={m.id} style={[styles.avatarSlot, i > 0 && { marginLeft: -8 }]}>
                  {m.avatarSlug ? (
                    <AvatarAnimal
                      slug={m.avatarSlug}
                      size={26}
                      ringColor={theme.colors.ringBg}
                    />
                  ) : (
                    <Avatar
                      name={m.name}
                      color={m.color}
                      size={26}
                      ringColor={theme.colors.ringBg}
                    />
                  )}
                </View>
              ))}
              {overflow > 0 ? (
                <View style={[styles.overflow, { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.ringBg }]}>
                  <Text style={[styles.overflowText, { color: theme.colors.text }]}>+{overflow}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.familyLabel, { color: theme.colors.textMuted }]}>
              {t('home:familyStrip.membersLabel')} <Text style={{ color: theme.colors.text, fontWeight: '700', fontFamily: nunitoFamily('700') }}>{members.length}</Text>
            </Text>
          </>
        ) : null}
        <View style={styles.spacer} />
        <PaydayPillV2 daysUntilPayday={daysUntilPayday} isPending={paydayPending} onPress={onPaydayPress} />
      </View>
    </RiseView>
  )
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatars: { flexDirection: 'row' },
  avatarSlot: {},
  overflow: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  overflowText: { fontSize: 10, fontWeight: '700', fontFamily: nunitoFamily('700') },
  familyLabel: { fontSize: 12 },
  spacer: { flex: 1 },
})
