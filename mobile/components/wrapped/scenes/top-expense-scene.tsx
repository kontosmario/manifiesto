import { Text, View } from 'react-native'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { currencyFormatter } from '@/utils/money'
import { detailStyles } from './detail-styles'
import type { Scene } from './types'

// 4. Top expense scene — peach band background, description como quote
// display, amount + fecha long-form.
export function buildTopExpenseScene(payload: CycleWrappedPayload): Scene {
  // Halo cream sutil para el amount peach-on-peach — mismo recurso que
  // el veredicto negativo. Crisp edge sin parecer stroke.
  const amountHalo = {
    textShadowColor: 'rgba(255,251,242,0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  }
  return {
    id: 'top-expense',
    background: '#F8D1C3', // peach band, warm accent
    foreground: '#3B1107',
    foregroundSoft: 'rgba(59,17,7,0.74)',
    progressTrack: 'rgba(59,17,7,0.22)',
    progressFill: '#8E2A0C',
    ctaBg: '#8E2A0C',
    ctaFg: '#FFFBF2',
    render: () => {
      const top = payload.topExpense!
      return (
        <View style={detailStyles.stage}>
          <Text style={[detailStyles.eyebrow, { color: 'rgba(59,17,7,0.74)' }]}>
            EL GASTO QUE MÁS PESÓ
          </Text>
          <Text
            style={[detailStyles.titleDisplay, { color: '#3B1107' }]}
            numberOfLines={3}
            accessibilityRole="header"
          >
            {top.description || 'Sin descripción'}
          </Text>
          <Text style={[detailStyles.amount, { color: '#8E2A0C', marginTop: 16 }, amountHalo]}>
            {currencyFormatter.format(top.price)}
          </Text>
          <Text style={[detailStyles.dateMark, { color: 'rgba(59,17,7,0.74)' }]}>
            {formatLongDate(top.occurredAt)}
          </Text>
        </View>
      )
    },
  }
}

function formatLongDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return ''
  const year = Number(match[1])
  const day = Number(match[3])
  const month = Number(match[2])
  return `${day} de ${MONTH_NAMES[month - 1]}, ${year}`
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const
