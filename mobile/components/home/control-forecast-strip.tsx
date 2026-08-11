import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { clamp, formatCompactMoney, getSignalPalette } from '@/components/home/control-visual-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { currencyFormatter } from '@/utils/money'
import { getDateTimeFormat } from '@/lib/i18n/active-locale'
import { nunitoFamily } from '@/theme/typography'

const shortDateOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
}

const weekdayOptions: Intl.DateTimeFormatOptions = {
  weekday: 'short',
}

export interface ControlForecastStripPoint {
  dateIso: string
  projectedSpend: number
}

interface ControlForecastStripProps {
  compact?: boolean
  dailyCap: number
  points: ControlForecastStripPoint[]
}

export function ControlForecastStrip({
  compact = false,
  dailyCap,
  points,
}: ControlForecastStripProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  if (points.length === 0) {
    return null
  }

  const visiblePoints = points.slice(0, compact ? 5 : 7)
  const maxProjectedSpend = visiblePoints.reduce(
    (max, point) => Math.max(max, point.projectedSpend),
    dailyCap,
  )
  const trackHeight = compact ? 86 : 104

  return (
    <View style={styles.forecastWrap}>
      <View style={styles.forecastHeader}>
        <Text style={[styles.forecastTitle, { color: theme.colors.text }]}>{t('home:forecastStrip.title')}</Text>
        <Text style={[styles.forecastLegend, { color: theme.colors.textSoft }]}>
          {t('home:forecastStrip.legend', { cap: currencyFormatter.format(dailyCap) })}
        </Text>
      </View>

      <View style={[styles.forecastRow, compact ? styles.forecastRowCompact : null]}>
        {visiblePoints.map((point, index) => {
          const pointDate = new Date(point.dateIso)
          const ratio = dailyCap > 0 ? point.projectedSpend / dailyCap : 0
          const palette = getSignalPalette(
            theme,
            ratio > 1.12 ? 'warning' : ratio < 0.82 ? 'success' : 'default',
          )
          const fillHeight = Math.max(
            12,
            (point.projectedSpend / Math.max(maxProjectedSpend, 1)) * trackHeight,
          )
          const capTop =
            trackHeight - clamp(dailyCap / Math.max(maxProjectedSpend, 1)) * trackHeight
          const dayLabel =
            index === 0
              ? t('home:forecastStrip.tomorrowShort')
              : getDateTimeFormat(shortDateOptions).format(pointDate)
          const weekdayLabel = getDateTimeFormat(weekdayOptions)
            .format(pointDate)
            .replace('.', '')

          return (
            <View key={point.dateIso} style={styles.forecastItem}>
              <Text style={[styles.forecastWeekday, { color: theme.colors.textSoft }]}>
                {weekdayLabel}
              </Text>

              <View
                style={[
                  styles.forecastTrack,
                  {
                    backgroundColor: theme.colors.surfaceStrong,
                    height: trackHeight,
                  },
                ]}
              >
                <View
                  style={[
                    styles.forecastCapMarker,
                    {
                      backgroundColor: theme.colors.textSoft,
                      top: capTop,
                    },
                  ]}
                />

                <View
                  style={[
                    styles.forecastFill,
                    {
                      backgroundColor: palette.accentColor,
                      height: fillHeight,
                    },
                  ]}
                />
              </View>

              <Text style={[styles.forecastValue, { color: theme.colors.text }]}>
                {formatCompactMoney(point.projectedSpend)}
              </Text>
              <Text style={[styles.forecastDay, { color: theme.colors.textMuted }]}>{dayLabel}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  forecastWrap: {
    gap: 12,
  },
  forecastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  forecastTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  forecastLegend: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  forecastRowCompact: {
    gap: 8,
  },
  forecastItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  forecastWeekday: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textTransform: 'uppercase',
  },
  forecastTrack: {
    width: '100%',
    maxWidth: 42,
    minHeight: 68,
    borderRadius: radii.lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingHorizontal: 4,
    paddingBottom: 4,
    position: 'relative',
  },
  forecastFill: {
    width: '100%',
    borderRadius: radii.md,
    minHeight: 8,
  },
  forecastCapMarker: {
    position: 'absolute',
    left: 5,
    right: 5,
    height: 2,
    borderRadius: radii.pill,
    opacity: 0.8,
  },
  forecastValue: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  forecastDay: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
})
