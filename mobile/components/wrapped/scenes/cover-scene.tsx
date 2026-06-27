import { StyleSheet, Text, View } from 'react-native'
import i18n from '@/lib/i18n'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { SCREEN_WIDTH } from '../wrapped-constants'
import type { Scene } from './types'

// 1. Cover scene — paper cream, eyebrow EDICIÓN {mes}, "Tu mes, en
// cifras." en display 60pt, rule mark, kicker.
export function buildCoverScene(payload: CycleWrappedPayload): Scene {
  return {
    id: 'cover',
    background: '#FFFBF2', // cream paper
    foreground: '#0F2E1F',
    // Soft text alphas bumpeados a 0.72 (era 0.55) — AA legible sobre
    // cream sin colapsar la jerarquía con el foreground primario.
    foregroundSoft: 'rgba(15,46,31,0.72)',
    progressTrack: 'rgba(15,46,31,0.18)',
    progressFill: '#1F590D',
    ctaBg: '#1F590D',
    ctaFg: '#FFFBF2',
    render: () => (
      <View style={coverStyles.stage}>
        <Text style={[coverStyles.eyebrow, { color: 'rgba(15,46,31,0.72)' }]}>
          {i18n.t('control:wrapped.cover.eyebrow', {
            period: payload.periodLabel.toUpperCase(),
          })}
        </Text>
        <Text style={[coverStyles.title, { color: '#0F2E1F' }]} accessibilityRole="header">
          {i18n.t('control:wrapped.cover.title')}
        </Text>
        {payload.periodRange ? (
          <Text style={[coverStyles.range, { color: 'rgba(15,46,31,0.72)' }]}>
            {payload.periodRange}
          </Text>
        ) : null}
        <View style={coverStyles.rule} />
        <Text style={[coverStyles.kicker, { color: 'rgba(15,46,31,0.85)' }]}>
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
    letterSpacing: 2.4,
  },
  title: {
    fontSize: Math.min(60, SCREEN_WIDTH * 0.16),
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: Math.min(62, SCREEN_WIDTH * 0.17),
  },
  range: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  rule: {
    width: 48,
    height: 2,
    backgroundColor: '#1F590D',
    marginTop: 12,
    marginBottom: 4,
  },
  kicker: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 20,
    maxWidth: 260,
  },
})
