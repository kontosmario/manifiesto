import { StyleSheet, View } from 'react-native'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Empty-state twin de FijoRow. Replica fiel del chrome del card —
 * mismo radius, padding, icon tile (con su slot de status overlay),
 * title line, sub-line con catChip, y amount slot a la derecha — pero
 * con dashes neutros. Sin SwipeableRow / confetti / press / datos
 * fabricados (preview inerte). Replica en vez de prop-en-el-real porque
 * el row real está fuertemente acoplado a SwipeableRow + ConfettiBurst
 * + 3 press hooks + tap-to-expand state, todo innecesario para un
 * placeholder estático.
 */
export function FijoRowPlaceholder() {
  const theme = useThemeTokens()
  const ph = theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,30,0.07)'
  return (
    <View
      style={[
        styles.card,
        styles.placeholderCard,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <View style={[styles.iconTile, { backgroundColor: ph, borderColor: ph }]} />
          <View
            style={[
              styles.statusOverlay,
              { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
            ]}
          />
        </View>
        <View style={styles.body}>
          <View style={[styles.phBar, { width: '58%', height: 11, backgroundColor: ph }]} />
          <View style={styles.phSubRow}>
            <View style={[styles.phBar, { width: 64, height: 8, backgroundColor: ph }]} />
            <View style={[styles.phBar, { width: 90, height: 8, backgroundColor: ph }]} />
          </View>
        </View>
        <View style={styles.amountBlock}>
          <View style={[styles.phBar, { width: 50, height: 13, backgroundColor: ph }]} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { position: 'relative' },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusOverlay: {
    position: 'absolute',
    bottom: -3,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  amountBlock: { alignItems: 'flex-end', gap: 2 },
  placeholderCard: {
    opacity: 0.86,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  phBar: { borderRadius: 5 },
  phSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 5,
  },
})
