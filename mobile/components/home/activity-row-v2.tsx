import { StyleSheet, Text, View } from 'react-native'
import { SlideInView } from '@/components/home/animated/slide-in-view'
import { WhoPaidAvatar } from '@/components/home/who-paid-avatar'
import { formatMoneyWithSign } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

export interface ActivityRowV2Props {
  icon: string
  title: string
  category: string
  whoName: string
  whoColor: string
  amount: number          // negative = expense, positive = credit
  delay?: number
}

export function ActivityRowV2({ icon, title, category, whoName, whoColor, amount, delay = 0 }: ActivityRowV2Props) {
  const { theme } = useAppTheme()
  const amountColor = amount < 0 ? theme.colors.text : theme.colors.success
  return (
    <SlideInView delay={delay}>
      <View style={[styles.row, { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line }]}>
        <View style={styles.iconWrap}>
          <View style={[styles.iconTile, { backgroundColor: theme.colors.peachBand }]}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>
          <WhoPaidAvatar name={whoName} color={whoColor} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.sub, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {whoName} · {category}
          </Text>
        </View>
        <Text style={[styles.amount, { color: amountColor }]}>{formatMoneyWithSign(amount)}</Text>
      </View>
    </SlideInView>
  )
}

const styles = StyleSheet.create({
  row: { borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1 },
  iconWrap: { position: 'relative' },
  iconTile: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 18 },
  flex: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  sub: { fontSize: 12 },
  amount: { fontSize: 14, fontWeight: '800' },
})
