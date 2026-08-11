import { StyleSheet, Text, View } from 'react-native'
import i18n from '@/lib/i18n'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { nunitoFamily } from '@/theme/typography'
import { SCREEN_WIDTH, type WrappedTone } from '../wrapped-constants'
import type { Scene } from './types'

// 1. Cover scene — material del sistema, eyebrow EDICIÓN {mes}, "Tu mes,
// en cifras." en display 60pt, rule mark, kicker.
export function buildCoverScene(payload: CycleWrappedPayload, tone: WrappedTone): Scene {
  return {
    id: 'cover',
    background: tone.background,
    foreground: tone.foreground,
    foregroundSoft: tone.foregroundSoft,
    progressTrack: tone.progressTrack,
    progressFill: tone.progressFill,
    ctaBg: tone.ctaBg,
    ctaGradientCss: tone.ctaGradientCss,
    ctaShadow: tone.ctaShadow,
    ctaFg: tone.ctaFg,
    render: () => (
      <View style={coverStyles.stage}>
        <Text style={[coverStyles.eyebrow, { color: tone.accent }]}>
          {i18n.t('control:wrapped.cover.eyebrow', {
            period: payload.periodLabel.toUpperCase(),
          })}
        </Text>
        <Text
          style={[coverStyles.title, { color: tone.foreground }]}
          accessibilityRole="header"
        >
          {i18n.t('control:wrapped.cover.title')}
        </Text>
        {payload.periodRange ? (
          <Text style={[coverStyles.range, { color: tone.foregroundSoft }]}>
            {payload.periodRange}
          </Text>
        ) : null}
        <View style={[coverStyles.rule, { backgroundColor: tone.accent }]} />
        <Text style={[coverStyles.kicker, { color: tone.foregroundSoft }]}>
          {i18n.t('control:wrapped.cover.kicker')}
        </Text>
      </View>
    ),
  }
}

const coverStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: 2.4,
  },
  title: {
    fontSize: Math.min(60, SCREEN_WIDTH * 0.16),
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -2,
    lineHeight: Math.min(62, SCREEN_WIDTH * 0.17),
  },
  range: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.3,
  },
  rule: {
    width: 48,
    height: 2,
    marginTop: 12,
    marginBottom: 4,
  },
  kicker: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 20,
    maxWidth: 260,
  },
})
