import { Text, View } from 'react-native'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import i18n from '@/lib/i18n'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { formatMoney } from '@/utils/money'
import type { WrappedTone } from '../wrapped-constants'
import { detailStyles } from './detail-styles'
import type { Scene } from './types'

// 3. Top category scene — top categoría, name como display 44pt,
// amount + share %, barra full-bleed como POZO del sistema.
export function buildTopCategoryScene(
  payload: CycleWrappedPayload,
  tone: WrappedTone,
): Scene {
  return {
    id: 'top-category',
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
      const top = payload.topCategory!
      return (
        <View style={detailStyles.stage}>
          <Text style={[detailStyles.eyebrow, { color: tone.foregroundSoft }]}>
            {i18n.t('control:wrapped.topCategory.eyebrow')}
          </Text>
          <Text
            style={[detailStyles.titleDisplay, { color: tone.foreground }]}
            numberOfLines={2}
            accessibilityRole="header"
          >
            {top.name}
          </Text>
          <View style={detailStyles.amountRow}>
            <Text style={[detailStyles.amount, { color: tone.accent }]}>
              {formatMoney(Math.round(top.amount))}
            </Text>
            <Text style={[detailStyles.share, { color: tone.foregroundSoft }]}>
              {i18n.t('control:wrapped.topCategory.share', {
                pct: Math.round(top.share * 100),
              })}
            </Text>
          </View>

          {/* Barra de participación: canal hundido + fill de acento. El
              canal ya tiene fondo propio, así que donde el sistema descarta
              el `boxShadow` pierde el relieve, no el límite. */}
          <View
            style={[
              detailStyles.barTrack,
              {
                backgroundColor: tone.wellBackground,
                boxShadow: tone.shadows.insetSm,
                borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 1,
                borderColor: tone.divider,
              },
            ]}
          >
            <View
              style={[
                detailStyles.barFill,
                {
                  width: `${Math.max(8, Math.round(top.share * 100))}%`,
                  backgroundColor: tone.accent,
                },
              ]}
            />
          </View>
        </View>
      )
    },
  }
}
