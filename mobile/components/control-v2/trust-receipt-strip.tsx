// Trust Receipt strip — value delivered by the asistente.
//
// Shown as a slim footer under the chat (or in the empty state) so
// the user can see, in monetary terms, what acting on the asistente's
// suggestions has actually returned. Hidden when there's no value
// captured yet — telling someone "you've saved $0" is worse than not
// telling them anything.

import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoneyShort } from '@/utils/money'
import type { AdvisorValueSummary } from '@/features/insights/use-advisor-value-summary'

interface TrustReceiptStripProps {
  summary: AdvisorValueSummary
}

export const TrustReceiptStrip = memo(function TrustReceiptStrip({
  summary,
}: TrustReceiptStripProps) {
  // Keep the surface honest: no log entries → no strip. The card
  // would otherwise render "$0 ahorrado" which feels punitive on a
  // brand-new account.
  if (summary.totalActions === 0) return null
  if (summary.totalSavedLifetime <= 0) return null

  // Prefer the most recent timeframe with a non-zero value so the
  // user sees the freshest result. Quarter beats month beats lifetime
  // because it's the most "stories I've helped you with lately" framing.
  const quarter = summary.savedQuarter
  const month = summary.savedMonth
  const lifetime = summary.totalSavedLifetime

  const headline = quarter > 0
    ? `Te ahorré ${formatMoneyShort(quarter)} este trimestre`
    : month > 0
    ? `Te ahorré ${formatMoneyShort(month)} este mes`
    : `Acumulado: ${formatMoneyShort(lifetime)} en valor entregado`

  const subline = `${summary.totalActions} ${summary.totalActions === 1 ? 'decisión' : 'decisiones'} sostenidas en ${summary.distinctSignalFamilies} ${summary.distinctSignalFamilies === 1 ? 'tipo' : 'tipos'} de patrón`

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${headline}. ${subline}.`}
      style={styles.strip}
    >
      <View style={styles.iconWrap}>
        <MaterialIcons name="favorite" size={16} color="#A6EF8F" />
      </View>
      <View style={styles.text}>
        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.subline}>{subline}</Text>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(199, 238, 156, 0.08)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(199, 238, 156, 0.22)',
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(199, 238, 156, 0.14)',
  },
  text: { flex: 1, gap: 2 },
  headline: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E6F0E2',
  },
  subline: {
    fontSize: 11,
    color: 'rgba(199, 238, 156, 0.65)',
    letterSpacing: 0.2,
  },
})
