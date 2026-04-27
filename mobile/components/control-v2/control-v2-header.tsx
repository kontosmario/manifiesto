import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import { controlV2Copy } from './control-v2-tokens'

interface ControlV2HeaderProps {
  score: number
  scoreLabel: string
  scoreTone: string
}

/**
 * Control header — big "Control" title + subtitle on the left, and a
 * circular 0-100 health score on the right with a glowing ring and
 * count-up number. Visual quote from the design mock.
 */
export function ControlV2Header({
  score,
  scoreLabel,
  scoreTone,
}: ControlV2HeaderProps) {
  const { theme } = useAppTheme()
  const trackColor = theme.isDark ? '#1F332A' : '#EFE8D9'
  return (
    <RiseView>
      <View style={styles.root}>
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {controlV2Copy.title}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            {controlV2Copy.subtitle}
          </Text>
        </View>
        <ScoreRing
          score={score}
          scoreLabel={scoreLabel}
          tone={scoreTone}
          trackColor={trackColor}
          textColor={theme.colors.text}
        />
      </View>
    </RiseView>
  )
}

function ScoreRing({
  score,
  scoreLabel,
  tone,
  trackColor,
  textColor,
}: {
  score: number
  scoreLabel: string
  tone: string
  trackColor: string
  textColor: string
}) {
  const size = 76
  const strokeWidth = 6
  const r = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, score))
  const dash = (clamped / 100) * circumference

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.scoreCenter} pointerEvents="none">
        <CountUpText
          value={score}
          duration={1100}
          format={(n) => String(n)}
          style={[styles.scoreValue, { color: textColor }]}
        />
        <Text style={[styles.scoreLabel, { color: tone }]} numberOfLines={1}>
          {scoreLabel.toUpperCase()}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1.2,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 6,
    maxWidth: 220,
  },
  scoreCenter: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 22,
  },
  scoreLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
})
