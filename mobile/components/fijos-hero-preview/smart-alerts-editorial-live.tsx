import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import { RiseRow, RuleScale, getSignalIcon } from './smart-alerts-helpers'
import type { HeroState } from './hero-states'

interface SmartAlertsEditorialLiveProps {
  state: HeroState
}

/**
 * Variant A · Editorial inline. Misma gramática del Próximos canon:
 * eyebrow + rule + rows tipográficas con dividers thin. Cada alerta
 * es un row con label tipo (PRECIO SUBIÓ / SEMANA CARGADA / etc),
 * name, delta inline + chevron de "Ver". Sin emojis, sin chip-soup,
 * sin nested cards. State-aware: surface "TODO EN ORDEN" cuando no
 * hay alertas (vs componente actual que desaparece).
 */
export function SmartAlertsEditorialLive({ state }: SmartAlertsEditorialLiveProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const totalAlerts = state.alerts.hikes.length + state.alerts.signals.length

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseRow delay={0}>
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
            {totalAlerts === 0 ? 'TODO EN ORDEN' : 'AVISOS'}
          </Text>
          <Text style={[styles.headerCount, { color: theme.colors.textMuted }]}>
            {totalAlerts === 0
              ? 'sin novedades'
              : `${totalAlerts} ${totalAlerts === 1 ? 'aviso' : 'avisos'}`}
          </Text>
        </View>
      </RiseRow>

      <RuleScale color={theme.colors.text} delay={80} />

      {totalAlerts === 0 ? (
        <RiseRow delay={160}>
          <View style={styles.emptyRow}>
            <MaterialIcons name="check-circle" size={20} color={palette.success} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>
                Ningún aviso esta semana.
              </Text>
              <Text style={[styles.emptyBody, { color: theme.colors.textMuted }]}>
                Tus fijos están estables. Te avisamos si alguno sube de
                precio o si se acumulan vencimientos.
              </Text>
            </View>
          </View>
        </RiseRow>
      ) : (
        <View>
          {state.alerts.hikes.map((h, idx) => (
            <View key={h.id}>
              {idx > 0 || state.alerts.signals.length > 0 ? null : null}
              <HikeRow hike={h} palette={palette} delay={160 + idx * 80} />
              <View
                style={[styles.divider, { backgroundColor: theme.colors.line }]}
              />
            </View>
          ))}
          {state.alerts.signals.map((s, idx) => {
            const isLast = idx === state.alerts.signals.length - 1
            return (
              <View key={s.id}>
                <SignalRow
                  signal={s}
                  palette={palette}
                  delay={160 + (state.alerts.hikes.length + idx) * 80}
                />
                {!isLast ? (
                  <View
                    style={[styles.divider, { backgroundColor: theme.colors.line }]}
                  />
                ) : null}
              </View>
            )
          })}
        </View>
      )}
    </View>
  )
}

function HikeRow({
  hike,
  palette,
  delay,
}: {
  hike: HeroState['alerts']['hikes'][number]
  palette: ReturnType<typeof buildProximosPalette>
  delay: number
}) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.98 })
  return (
    <RiseRow delay={delay}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${hike.name} subió ${hike.deltaPct}% a ${formatMoney(hike.currentPrice)}`}
      >
        <Animated.View style={[styles.row, press.animatedStyle]}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowLabel, { color: palette.urgency }]}>
              PRECIO SUBIÓ
            </Text>
            <View style={styles.rowNameWrap}>
              <View
                style={[styles.catDot, { backgroundColor: hike.categoryColor }]}
              />
              <Text
                style={[styles.rowName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {hike.name}
              </Text>
            </View>
            <Text style={[styles.rowBody, { color: theme.colors.textMuted }]}>
              {formatMoney(hike.previousPrice)} → {formatMoney(hike.currentPrice)}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <View
              style={[
                styles.deltaBadge,
                {
                  borderColor: palette.urgencyBadgeBorder,
                  backgroundColor: palette.urgencyBadgeBg,
                },
              ]}
            >
              <MaterialIcons name="trending-up" size={11} color={palette.urgency} />
              <Text style={[styles.deltaText, { color: palette.urgency }]}>
                +{hike.deltaPct}%
              </Text>
            </View>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color={theme.colors.textMuted}
            />
          </View>
        </Animated.View>
      </Pressable>
    </RiseRow>
  )
}

function SignalRow({
  signal,
  palette,
  delay,
}: {
  signal: HeroState['alerts']['signals'][number]
  palette: ReturnType<typeof buildProximosPalette>
  delay: number
}) {
  const { theme } = useAppTheme()
  const press = usePressScale({ pressedScale: 0.98 })
  const icon = getSignalIcon(signal.kind)
  const isPositive = signal.kind === 'streak'
  const labelColor = isPositive
    ? palette.success
    : signal.urgency === 'alta'
    ? palette.urgencyStrong
    : palette.urgency
  const labelText =
    signal.kind === 'streak'
      ? 'LOGRO'
      : signal.kind === 'stress-week'
      ? 'SEMANA CARGADA'
      : signal.kind === 'fijos-ratio'
      ? 'RATIO ALTO'
      : 'TENDENCIA'
  return (
    <RiseRow delay={delay}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${signal.title}: ${signal.body}`}
      >
        <Animated.View style={[styles.row, press.animatedStyle]}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowLabel, { color: labelColor }]}>
              {labelText}
            </Text>
            <View style={styles.rowNameWrap}>
              <MaterialIcons
                name={icon}
                size={14}
                color={isPositive ? palette.success : theme.colors.text}
              />
              <Text
                style={[styles.rowName, { color: theme.colors.text }]}
                numberOfLines={1}
              >
                {signal.title}
              </Text>
            </View>
            <Text style={[styles.rowBody, { color: theme.colors.textMuted }]} numberOfLines={2}>
              {signal.body}
            </Text>
          </View>
          <View style={styles.rowRight}>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color={theme.colors.textMuted}
            />
          </View>
        </Animated.View>
      </Pressable>
    </RiseRow>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  headerCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  emptyRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowLeft: {
    flex: 1,
    gap: 4,
  },
  rowLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  rowNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  rowBody: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  deltaText: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    opacity: 0.4,
  },
})
