import { StyleSheet, Text, View } from 'react-native'
import { PaydayPillV2 } from '@/components/home/payday-pill-v2'
import { RiseView } from '@/components/home/animated/rise-view'
import { Avatar } from '@/components/ui/avatar'
import { useAppTheme } from '@/theme/theme-provider'

export interface FamilyMember { id: string; name: string; color: string }

interface FamilyStripProps {
  members: FamilyMember[]
  familyName: string
  daysUntilPayday: number | null
  paydayPending: boolean
  onPaydayPress?: () => void
}

const MAX_AVATARS = 4

export function FamilyStrip({ members, familyName, daysUntilPayday, paydayPending, onPaydayPress }: FamilyStripProps) {
  const { theme } = useAppTheme()
  const visible = members.slice(0, MAX_AVATARS)
  const overflow = members.length - visible.length
  return (
    <RiseView delay={100}>
      <View style={styles.row}>
        <View style={styles.avatars}>
          {visible.map((m, i) => (
            <View key={m.id} style={[styles.avatarSlot, i > 0 && { marginLeft: -8 }]}>
              <Avatar
                name={m.name}
                color={m.color}
                size={26}
                ringColor={theme.colors.ringBg}
              />
            </View>
          ))}
          {overflow > 0 ? (
            <View style={[styles.overflow, { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.ringBg }]}>
              <Text style={[styles.overflowText, { color: theme.colors.text }]}>+{overflow}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.familyLabel, { color: theme.colors.textMuted }]}>
          {familyName} · <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{members.length}</Text>
        </Text>
        <View style={styles.spacer} />
        <PaydayPillV2 daysUntilPayday={daysUntilPayday} isPending={paydayPending} onPress={onPaydayPress} />
      </View>
    </RiseView>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatars: { flexDirection: 'row' },
  avatarSlot: {},
  overflow: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  overflowText: { fontSize: 10, fontWeight: '700' },
  familyLabel: { fontSize: 12 },
  spacer: { flex: 1 },
})
