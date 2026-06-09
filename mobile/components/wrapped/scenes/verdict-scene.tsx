import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { CountUpText } from '@/components/home/animated/count-up-text'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { formatMoney } from '@/utils/money'
import { SCREEN_WIDTH } from '../wrapped-constants'
import type { Scene } from './types'

export interface VerdictTone {
  background: string
  foreground: string
  foregroundSoft: string
  accent: string
  progressTrack: string
  progressFill: string
  ctaBg: string
  ctaFg: string
  eyebrow: string
  copyPositive: string
}

export function resolveVerdictTone(savingsDelta: number, isDark: boolean): VerdictTone {
  if (savingsDelta > 0) {
    return {
      background: isDark ? '#1F4530' : '#E3F2D2',
      foreground: isDark ? '#F4FDF2' : '#0F2E1F',
      // Soft variants bumped a ~30% para AA legible sobre el tint
      // sin perder la diferenciación con el foreground principal.
      foregroundSoft: isDark ? 'rgba(244,253,242,0.78)' : 'rgba(15,46,31,0.74)',
      // Accent darker para mayor contraste sobre el tint verde claro.
      accent: isDark ? '#A6EF8F' : '#10410A',
      progressTrack: isDark ? 'rgba(244,253,242,0.22)' : 'rgba(15,46,31,0.20)',
      progressFill: isDark ? '#A6EF8F' : '#1F590D',
      ctaBg: isDark ? '#A6EF8F' : '#1F590D',
      ctaFg: isDark ? '#0F2E1F' : '#FFFBF2',
      eyebrow: 'CERRASTE CON MARGEN',
      copyPositive: 'Te queda margen para el siguiente.',
    }
  }
  if (savingsDelta < 0) {
    return {
      background: isDark ? '#4A2418' : '#F8D1C3',
      foreground: isDark ? '#FFFBF2' : '#3B1107',
      foregroundSoft: isDark ? 'rgba(255,251,242,0.78)' : 'rgba(59,17,7,0.74)',
      // Accent oscurecido sobre peach para AA + crisp edge con halo.
      accent: isDark ? '#F2A78C' : '#8E2A0C',
      progressTrack: isDark ? 'rgba(255,251,242,0.22)' : 'rgba(59,17,7,0.22)',
      progressFill: isDark ? '#F2A78C' : '#B84014',
      ctaBg: isDark ? '#F2A78C' : '#B84014',
      ctaFg: isDark ? '#3B1107' : '#FFFBF2',
      eyebrow: 'CERRASTE EXCEDIDO',
      copyPositive: 'Empezás el siguiente con menos colchón.',
    }
  }
  return {
    background: isDark ? '#2A3A2F' : '#EEE9DF',
    foreground: isDark ? '#F4FDF2' : '#12211A',
    foregroundSoft: isDark ? 'rgba(244,253,242,0.78)' : 'rgba(18,33,26,0.74)',
    accent: isDark ? '#A6EF8F' : '#1F590D',
    progressTrack: isDark ? 'rgba(244,253,242,0.22)' : 'rgba(18,33,26,0.20)',
    progressFill: isDark ? '#A6EF8F' : '#1F590D',
    ctaBg: isDark ? '#A6EF8F' : '#1F590D',
    ctaFg: isDark ? '#0F2E1F' : '#FFFBF2',
    eyebrow: 'CERRASTE EMPATADO',
    copyPositive: 'Justo lo que tenías, ni más ni menos.',
  }
}

// 2. Verdict scene (savings delta) — tinte state-driven (verde/peach/
// neutral), signo + número hero 56pt, copy short, delta pill vs anterior.
export function buildVerdictScene(
  payload: CycleWrappedPayload,
  tone: VerdictTone,
): Scene {
  const hasDelta =
    payload.deltaVsPreviousPercent != null &&
    Number.isFinite(payload.deltaVsPreviousPercent)
  const deltaRounded = hasDelta ? Math.round(payload.deltaVsPreviousPercent!) : 0
  const sign = payload.savingsDelta > 0 ? '+' : payload.savingsDelta < 0 ? '−' : ''

  return {
    id: 'verdict',
    background: tone.background,
    foreground: tone.foreground,
    foregroundSoft: tone.foregroundSoft,
    progressTrack: tone.progressTrack,
    progressFill: tone.progressFill,
    ctaBg: tone.ctaBg,
    ctaFg: tone.ctaFg,
    confetti: payload.savingsDelta > 0,
    confettiSceneIdx: 1, // segunda escena
    render: ({ reduced }) => {
      const heroAmount = Math.abs(payload.savingsDelta)
      // Halo cream sutil detrás del hero — crea "respiración" entre la
      // tinta del número y el tint del fondo cuando son del mismo hue
      // (peach-on-peach, green-on-green). No es un stroke duro: es un
      // glow blando 8pt radius que solo se nota si te acercás.
      const heroHalo = {
        textShadowColor: 'rgba(255,251,242,0.55)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
      }
      return (
        <View style={verdictStyles.stage}>
          <Text
            style={[verdictStyles.eyebrow, { color: tone.foregroundSoft }]}
          >
            {tone.eyebrow}
          </Text>

          <View style={verdictStyles.numberRow}>
            <Text style={[verdictStyles.sign, { color: tone.accent }, heroHalo]}>
              {sign}
            </Text>
            {reduced ? (
              <Text style={[verdictStyles.hero, { color: tone.accent }, heroHalo]}>
                {formatMoney(Math.round(heroAmount))}
              </Text>
            ) : (
              <CountUpText
                value={heroAmount}
                duration={1800}
                format={(n) => formatMoney(Math.round(n))}
                style={[verdictStyles.hero, { color: tone.accent }, heroHalo]}
              />
            )}
          </View>

          <Text style={[verdictStyles.copy, { color: tone.foreground }]}>
            {tone.copyPositive}
          </Text>

          {hasDelta && deltaRounded !== 0 ? (
            <View
              style={[
                verdictStyles.deltaPill,
                // Pill background más opaco para crisp legibility.
                { backgroundColor: 'rgba(255,251,242,0.55)' },
              ]}
            >
              <MaterialIcons
                name={deltaRounded < 0 ? 'south' : 'north'}
                size={14}
                color={tone.foreground}
              />
              <Text
                style={[verdictStyles.deltaText, { color: tone.foreground }]}
              >
                {Math.abs(deltaRounded)}% vs el ciclo anterior
              </Text>
            </View>
          ) : null}
        </View>
      )
    },
  }
}

const verdictStyles = StyleSheet.create({
  stage: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  sign: {
    fontSize: Math.min(54, SCREEN_WIDTH * 0.14),
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: Math.min(60, SCREEN_WIDTH * 0.16),
  },
  hero: {
    fontSize: Math.min(56, SCREEN_WIDTH * 0.15),
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: Math.min(60, SCREEN_WIDTH * 0.16),
    fontVariant: ['tabular-nums'],
  },
  copy: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    lineHeight: 25,
    maxWidth: 300,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
})
