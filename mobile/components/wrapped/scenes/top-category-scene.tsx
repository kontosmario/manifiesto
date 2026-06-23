import { Text, View } from 'react-native'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { formatMoney } from '@/utils/money'
import { detailStyles } from './detail-styles'
import type { Scene } from './types'

// 3. Top category scene — top categoría, name como display 44pt,
// amount + share %, barra full-bleed.
export function buildTopCategoryScene(payload: CycleWrappedPayload): Scene {
  return {
    id: 'top-category',
    background: '#F6EFE3', // cream warm
    foreground: '#0F2E1F',
    foregroundSoft: 'rgba(15,46,31,0.72)',
    progressTrack: 'rgba(15,46,31,0.18)',
    progressFill: '#1F590D',
    ctaBg: '#1F590D',
    ctaFg: '#FFFBF2',
    render: () => {
      const top = payload.topCategory!
      return (
        <View style={detailStyles.stage}>
          <Text style={[detailStyles.eyebrow, { color: 'rgba(15,46,31,0.72)' }]}>
            DONDE MÁS SE FUE
          </Text>
          <Text
            style={[detailStyles.titleDisplay, { color: '#0F2E1F' }]}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {top.name}
          </Text>
          <View style={detailStyles.amountRow}>
            <Text style={[detailStyles.amount, { color: '#10410A' }]}>
              {formatMoney(Math.round(top.amount))}
            </Text>
            <Text style={[detailStyles.share, { color: 'rgba(15,46,31,0.72)' }]}>
              el {Math.round(top.share * 100)}% de tus gastos
            </Text>
          </View>

          {/* Full-bleed share bar — track más oscuro para visibilidad */}
          <View style={[detailStyles.barTrack, { backgroundColor: 'rgba(15,46,31,0.14)' }]}>
            <View
              style={[
                detailStyles.barFill,
                {
                  width: `${Math.max(8, Math.round(top.share * 100))}%`,
                  backgroundColor: '#10410A',
                },
              ]}
            />
          </View>
        </View>
      )
    },
  }
}
