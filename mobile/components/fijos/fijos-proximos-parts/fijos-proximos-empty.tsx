import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Empty-state twin del card "Próximos a pagar". Mismo frame + header +
 * rule, y tres filas que conservan el layout de UpcomingRow (label de
 * día arriba · dot de categoría + nombre · monto a la derecha) pero con
 * dashes neutros. Sin ítems fabricados, sin animación (preview inerte).
 */
export function FijosProximosCardEmpty() {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const ph = theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,42,30,0.07)'
  return (
    <View
      style={[
        styles.card,
        styles.emptyCard,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          {t('fijos:proximos.eyebrow')}
        </Text>
      </View>
      {/* Rule estático (sin scaleX animation) — preview inerte. */}
      <View style={[styles.rule, { backgroundColor: theme.colors.text }]} />

      <View style={styles.upcomingList}>
        {[0, 1, 2].map((i) => (
          <View key={i}>
            <View style={styles.upcomingRow}>
              <View style={styles.upcomingLeft}>
                <View style={[styles.phBar, { width: 40, height: 8, backgroundColor: ph }]} />
                <View style={styles.upcomingNameRow}>
                  <View style={[styles.categoryDot, { backgroundColor: ph }]} />
                  <View
                    style={[styles.phBar, { width: i === 1 ? '52%' : '70%', height: 11, backgroundColor: ph }]}
                  />
                </View>
              </View>
              <View style={[styles.phBar, { width: 52, height: 11, marginLeft: 12, backgroundColor: ph }]} />
            </View>
            {i < 2 ? (
              <View style={[styles.rowDivider, { backgroundColor: theme.colors.line }]} />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 1.6,
  },
  rule: {
    width: 22,
    height: 2,
    marginTop: 6,
    marginBottom: 6,
    opacity: 0.55,
  },
  emptyCard: { opacity: 0.86 },
  phBar: { borderRadius: 5 },
  upcomingList: { gap: 0 },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  upcomingLeft: { flex: 1, gap: 3 },
  upcomingNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowDivider: {
    height: 1,
    opacity: 0.32,
  },
})
