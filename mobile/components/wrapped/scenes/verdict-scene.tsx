import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { CountUpText } from '@/components/home/animated/count-up-text'
import i18n from '@/lib/i18n'
import type { CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { neoParticlePresets } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { formatMoney } from '@/utils/money'
import { SCREEN_WIDTH, type WrappedTone, type WrappedToneKey } from '../wrapped-constants'
import type { Scene } from './types'

export interface VerdictTone {
  /** Clave del tono del sistema con el que se pinta la escena. */
  key: WrappedToneKey
  tone: WrappedTone
  eyebrow: string
  copyPositive: string
}

/**
 * Tono del veredicto: ahorro → verde profundo del sistema; excedido → el
 * material "excedido"; empatado → la superficie neutra. La diferencia entre
 * ahorrar y excederse la comunican el material, el ícono y la copy — no un
 * hue inventado fuera del vocabulario.
 */
export function resolveVerdictTone(
  savingsDelta: number,
  palette: Record<WrappedToneKey, WrappedTone>,
): VerdictTone {
  if (savingsDelta > 0) {
    return {
      key: 'green',
      tone: palette.green,
      eyebrow: i18n.t('control:wrapped.verdict.eyebrowMargen'),
      copyPositive: i18n.t('control:wrapped.verdict.copyMargen'),
    }
  }
  if (savingsDelta < 0) {
    return {
      key: 'warm',
      tone: palette.warm,
      eyebrow: i18n.t('control:wrapped.verdict.eyebrowExcedido'),
      copyPositive: i18n.t('control:wrapped.verdict.copyExcedido'),
    }
  }
  return {
    key: 'surface',
    tone: palette.surface,
    eyebrow: i18n.t('control:wrapped.verdict.eyebrowEmpatado'),
    copyPositive: i18n.t('control:wrapped.verdict.copyEmpatado'),
  }
}

// 2. Verdict scene (savings delta) — material state-driven, signo + número
// hero 56pt, copy short, delta pill vs anterior.
export function buildVerdictScene(
  payload: CycleWrappedPayload,
  verdict: VerdictTone,
): Scene {
  const tone = verdict.tone
  const hasDelta =
    payload.deltaVsPreviousPercent != null &&
    Number.isFinite(payload.deltaVsPreviousPercent)
  const deltaRounded = hasDelta ? Math.round(payload.deltaVsPreviousPercent!) : 0
  const sign = payload.savingsDelta > 0 ? '+' : payload.savingsDelta < 0 ? '−' : ''
  const isPositive = payload.savingsDelta > 0

  return {
    id: 'verdict',
    background: tone.background,
    foreground: tone.foreground,
    foregroundSoft: tone.foregroundSoft,
    progressTrack: tone.progressTrack,
    progressFill: tone.progressFill,
    ctaBg: tone.ctaBg,
    ctaGradientCss: tone.ctaGradientCss,
    ctaShadow: tone.ctaShadow,
    ctaFg: tone.ctaFg,
    confetti: isPositive,
    // CR Sprint D Minor #1: NO hardcodear el índice — el caller
    // resuelve via `scenes.findIndex(s => s.id === 'verdict')` para
    // robustez ante reordering futuros. Dejamos el flag por compat.
    confettiSceneIdx: undefined,
    particles: isPositive ? neoParticlePresets.hero : undefined,
    render: ({ reduced }) => {
      const heroAmount = Math.abs(payload.savingsDelta)
      return (
        <View style={verdictStyles.stage}>
          <Text style={[verdictStyles.eyebrow, { color: tone.foregroundSoft }]}>
            {verdict.eyebrow}
          </Text>

          <View style={verdictStyles.numberRow}>
            <Text style={[verdictStyles.sign, { color: tone.accent }]}>{sign}</Text>
            {reduced ? (
              <Text style={[verdictStyles.hero, { color: tone.accent }]}>
                {formatMoney(Math.round(heroAmount))}
              </Text>
            ) : (
              <CountUpText
                value={heroAmount}
                duration={1800}
                format={(n) => formatMoney(Math.round(n))}
                style={[verdictStyles.hero, { color: tone.accent }]}
              />
            )}
          </View>

          <Text style={[verdictStyles.copy, { color: tone.foreground }]}>
            {verdict.copyPositive}
          </Text>

          {hasDelta && deltaRounded !== 0 ? (
            <View
              style={[
                verdictStyles.deltaPill,
                { backgroundColor: tone.selectedTint, boxShadow: tone.shadows.insetSm },
              ]}
            >
              <MaterialIcons
                name={deltaRounded < 0 ? 'south' : 'north'}
                size={14}
                color={tone.foreground}
              />
              <Text style={[verdictStyles.deltaText, { color: tone.foreground }]}>
                {deltaRounded < 0
                  ? i18n.t('control:wrapped.verdict.deltaMenos', {
                      pct: Math.abs(deltaRounded),
                    })
                  : i18n.t('control:wrapped.verdict.deltaMas', {
                      pct: Math.abs(deltaRounded),
                    })}
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
    fontFamily: nunitoFamily('900'),
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
    fontFamily: nunitoFamily('900'),
    letterSpacing: -2,
    lineHeight: Math.min(60, SCREEN_WIDTH * 0.16),
  },
  hero: {
    fontSize: Math.min(56, SCREEN_WIDTH * 0.15),
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -2,
    lineHeight: Math.min(60, SCREEN_WIDTH * 0.16),
    fontVariant: ['tabular-nums'],
  },
  copy: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.3,
    lineHeight: 25,
    maxWidth: 300,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
  },
  deltaText: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
})
