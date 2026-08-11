import { Text, View } from 'react-native'
import i18n from '@/lib/i18n'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { currencyFormatter } from '@/utils/money'
import type { WrappedTone } from '../wrapped-constants'
import { detailStyles } from './detail-styles'
import type { Scene } from './types'

// 4. Top expense scene — material "excedido" del sistema, description como
// quote display, amount + fecha long-form.
export function buildTopExpenseScene(
  payload: CycleWrappedPayload,
  tone: WrappedTone,
): Scene {
  return {
    id: 'top-expense',
    background: tone.background,
    foreground: tone.foreground,
    foregroundSoft: tone.foregroundSoft,
    progressTrack: tone.progressTrack,
    progressFill: tone.progressFill,
    ctaBg: tone.ctaBg,
    ctaGradientCss: tone.ctaGradientCss,
    ctaShadow: tone.ctaShadow,
    ctaFg: tone.ctaFg,
    render: () => {
      const top = payload.topExpense!
      return (
        <View style={detailStyles.stage}>
          <Text style={[detailStyles.eyebrow, { color: tone.foregroundSoft }]}>
            {i18n.t('control:wrapped.topExpense.eyebrow')}
          </Text>
          <Text
            style={[detailStyles.titleDisplay, { color: tone.foreground }]}
            numberOfLines={3}
            accessibilityRole="header"
          >
            {top.description || i18n.t('control:wrapped.topExpense.sinDescripcion')}
          </Text>
          <Text style={[detailStyles.amount, { color: tone.accent, marginTop: 16 }]}>
            {currencyFormatter.format(top.price)}
          </Text>
          <Text style={[detailStyles.dateMark, { color: tone.foregroundSoft }]}>
            {formatLongDate(top.occurredAt)}
          </Text>
        </View>
      )
    },
  }
}

// Date pattern (order + separators) lives in i18n; the month name is
// resolved from `control:months.long.*`. NOT an Intl formatter — it's a
// fixed-shape long date for the wrapped scene.
function formatLongDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const year = Number(match[1])
  const day = Number(match[3])
  const monthIdx = Number(match[2]) - 1
  return i18n.t('control:wrapped.topExpense.dateFormat', {
    day,
    month: i18n.t(`control:months.long.${monthIdx}`),
    year,
  })
}
