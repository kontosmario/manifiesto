import { memo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { getStateTokens, type SemanticState } from '@/theme/state-tokens'
import { formatMoneyShort } from '@/utils/money'
import { nunitoFamily } from '@/theme/typography'

interface ControlV2CoberturaCardProps {
  fijosMes: number
  ahorroMes: number
  libreMes: number
  ingresoMes: number
  diasMes: number
  fijosRatioPct: number
  cycleStartingBalanceOverride?: number | null
  /** 'dynamic' = ingreso variable: el eyebrow y el callout de override
   *  hablan de "tus ingresos" en vez de "tu sueldo". */
  incomeMode?: 'fixed' | 'dynamic'
}

interface SegmentTone {
  solid: string
  bg: string
}

/**
 * "Tu sueldo en días" — auditada y conectada con la lógica real.
 *
 * Antes mostraba sólo "fijos vs libre", ignorando que la app tiene
 * un savings target configurable por el usuario. Ahora lee el split
 * verdadero del backend (`ingreso = fijos + ahorro + libre`) y lo
 * renderiza como una barra de 3 segmentos + 3 stats — el usuario ve
 * exactamente a dónde va su plata mes a mes.
 *
 * Visual:
 *  · Cream surface + border tinted por la salud del ratio de fijos
 *    (success ≤50%, warning 50-65%, danger >65%). Mismo chrome que
 *    las otras cards de Control.
 *  · MaterialIcons + BreatheDot — sin emojis.
 *  · Override callout cuando hay un `current_cycle_starting_balance`
 *    confirmado: el usuario sabe que la proyección respeta la cash
 *    real, no el sueldo bruto.
 *
 * Lógica:
 *  · 4-tier mood derivado de `fijosRatioPct`. Cada estado tiene copy
 *    propia con guidance específica (renegociar / saludable / etc.).
 *  · Stats con monto + porcentaje + días — los 3 ángulos de la
 *    misma data, alineados visualmente con el segment correspondiente
 *    del bar.
 */
function ControlV2CoberturaCardImpl({
  fijosMes,
  ahorroMes,
  libreMes,
  ingresoMes,
  diasMes,
  fijosRatioPct,
  cycleStartingBalanceOverride,
  incomeMode,
}: ControlV2CoberturaCardProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isDark = theme.isDark
  const isDynamicIncome = incomeMode === 'dynamic'

  // Day breakdown (rounded so the labels stay clean integers).
  const safeIngreso = ingresoMes > 0 ? ingresoMes : 1
  const coberturaFijos = Math.max(
    0,
    Math.ceil((fijosMes / safeIngreso) * diasMes),
  )
  const coberturaAhorro = Math.max(
    0,
    Math.ceil((ahorroMes / safeIngreso) * diasMes),
  )
  const coberturaLibre = Math.max(
    0,
    diasMes - coberturaFijos - coberturaAhorro,
  )

  // Continuous percentages for the bar — independent of the rounded
  // day labels so visual proportions stay accurate when the
  // `Math.ceil` above pulls a partial day forward.
  const fijosPct = (fijosMes / safeIngreso) * 100
  const ahorroPct = (ahorroMes / safeIngreso) * 100
  const librePct = Math.max(0, 100 - fijosPct - ahorroPct)

  // ── Health tiers ─────────────────────────────────────────────
  // Three states (positive/caution/critical) on top of the unified
  // state tokens. "Excelente" (<35%) and "Saludable" (35-50%) used to
  // be two separate green tiers — that confused users about whether
  // we approve or just tolerate the ratio. Both now collapse to
  // `positive` and the contextual sub-label distinguishes the two.
  const state: SemanticState =
    fijosRatioPct >= 65
      ? 'critical'
      : fijosRatioPct >= 50
        ? 'caution'
        : 'positive'

  // The "above the line" sub-label still surfaces the more granular
  // read inside the positive band, so power users see "Excelente" on
  // <35% — but the visual treatment stays unified.
  const positiveContext =
    fijosRatioPct < 35
      ? t('control:cobertura.ctxExcelente')
      : t('control:cobertura.ctxSaludable')
  const cautionContext = t('control:cobertura.ctxAlto')
  const criticalContext = t('control:cobertura.ctxCritico')

  const tokens = getStateTokens(state, theme)
  const palette = {
    fg: tokens.fg,
    border: tokens.border,
    chipBg: tokens.bg,
    chipBorder: tokens.border,
    calloutBg: tokens.bg,
    calloutBorder: tokens.border,
    icon: tokens.icon,
    stateLabel:
      state === 'positive'
        ? positiveContext
        : state === 'caution'
          ? cautionContext
          : criticalContext,
  }

  // Segment tones — match the stats dot colors to the bar fill so
  // the eye maps "this slice" → "this row" without legend overhead.
  const fijosTone: SegmentTone = {
    solid: theme.colors.warning,
    bg: isDark ? 'rgba(243,186,87,0.18)' : 'rgba(194,122,10,0.12)',
  }
  const ahorroTone: SegmentTone = {
    solid: theme.colors.success,
    bg: isDark ? 'rgba(122,216,163,0.18)' : 'rgba(28,126,58,0.12)',
  }
  const libreTone: SegmentTone = {
    // Teal on-brand mode-aware (era azul ajeno; #6B9AD6 daba 2.82:1 en cream).
    // Distinto de fijos=peach y ahorro=verde.
    solid: isDark ? '#9FD8C8' : '#2E6E5E',
    bg: isDark ? 'rgba(159,216,200,0.18)' : 'rgba(46,110,94,0.14)',
  }

  // Smart hint copy — pulled apart so we can also surface a callout
  // when the user hasn't set a savings target (the bar would show
  // ahorro=0% and the user might not realize that's because it's
  // unconfigured, not because they're not saving).
  const hint = (() => {
    if (ahorroMes === 0 && ingresoMes > 0) {
      return {
        icon: 'savings' as const,
        text: t('control:cobertura.hintNoSavings'),
      }
    }
    switch (state) {
      case 'positive':
        return {
          icon: tokens.icon,
          text:
            fijosRatioPct < 35
              ? t('control:cobertura.hintExcelente', {
                  pct: Math.round(fijosRatioPct),
                })
              : t('control:cobertura.hintSaludable', {
                  pct: Math.round(fijosRatioPct),
                }),
        }
      case 'caution':
        return {
          icon: tokens.icon,
          text: t('control:cobertura.hintAlto', {
            pct: Math.round(fijosRatioPct),
          }),
        }
      case 'critical':
        return {
          icon: tokens.icon,
          text: t('control:cobertura.hintCritico', {
            pct: Math.round(fijosRatioPct),
          }),
        }
    }
  })()

  return (
    <RiseView delay={380}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={palette.fg} glow={palette.fg} />
          <Text style={[styles.eyebrow, { color: palette.fg }]} numberOfLines={1}>
            {t(
              isDynamicIncome
                ? 'control:cobertura.eyebrowDynamic'
                : 'control:cobertura.eyebrow',
            )}
          </Text>
          <View
            style={[
              styles.statePill,
              {
                backgroundColor: palette.chipBg,
                borderColor: palette.chipBorder,
              },
            ]}
          >
            <MaterialIcons name={palette.icon} size={11} color={palette.fg} />
            <Text
              style={[styles.statePillText, { color: palette.fg }]}
              numberOfLines={1}
            >
              {t('control:cobertura.statePill', {
                label: tokens.label,
                pct: Math.round(fijosRatioPct),
              })}
            </Text>
          </View>
        </View>

        <Text style={[styles.headline, { color: theme.colors.text }]}>
          {t('control:cobertura.headlinePrefix')}
          <Text style={styles.headlineStrong}>
            {t('control:cobertura.headlineDias', { days: diasMes })}
          </Text>
          {t('control:cobertura.headlineMid')}
          <Text style={[styles.headlineStrong, { color: fijosTone.solid }]}>
            {t('control:cobertura.headlineFijos', { days: coberturaFijos })}
          </Text>
          {coberturaAhorro > 0 ? (
            <>
              {', '}
              <Text
                style={[styles.headlineStrong, { color: ahorroTone.solid }]}
              >
                {t('control:cobertura.headlineAhorro', { days: coberturaAhorro })}
              </Text>
            </>
          ) : null}{' '}
          {t('control:cobertura.headlineAnd')}{' '}
          <Text style={[styles.headlineStrong, { color: libreTone.solid }]}>
            {t('control:cobertura.headlineLibre', { days: coberturaLibre })}
          </Text>
          .
        </Text>

        {cycleStartingBalanceOverride != null ? (
          <View
            style={[
              styles.overrideRow,
              {
                // Dark: recede to the near-black canvas so this well
                // reads as inset below the surfaceMuted card.
                backgroundColor: theme.isDark
                  ? DARK_TAB_CANVAS
                  : theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <MaterialIcons
              name="info-outline"
              size={13}
              color={theme.colors.textMuted}
            />
            <Text
              style={[styles.overrideText, { color: theme.colors.textMuted }]}
            >
              {t(
                isDynamicIncome
                  ? 'control:cobertura.overrideWorkingWithDynamic'
                  : 'control:cobertura.overrideWorkingWith',
                { amount: formatMoneyShort(cycleStartingBalanceOverride) },
              )}
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.barOuter,
            {
              backgroundColor: theme.isDark
                ? DARK_TAB_CANVAS
                : theme.colors.surfaceMuted,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {fijosPct > 0 ? (
            <View
              style={[
                styles.barSegment,
                styles.barSegmentLeft,
                {
                  width: `${fijosPct}%`,
                  backgroundColor: fijosTone.solid,
                },
              ]}
            />
          ) : null}
          {ahorroPct > 0 ? (
            <View
              style={[
                styles.barSegment,
                {
                  width: `${ahorroPct}%`,
                  backgroundColor: ahorroTone.solid,
                  marginLeft: fijosPct > 0 ? 1 : 0,
                },
              ]}
            />
          ) : null}
          {librePct > 0 ? (
            <View
              style={[
                styles.barSegment,
                styles.barSegmentRight,
                {
                  width: `${librePct}%`,
                  backgroundColor: libreTone.solid,
                  marginLeft: fijosPct > 0 || ahorroPct > 0 ? 1 : 0,
                },
              ]}
            />
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <SegmentStat
            dotColor={fijosTone.solid}
            label={t('control:cobertura.statFijos')}
            value={formatMoneyShort(fijosMes)}
            sub={t('control:cobertura.statSub', {
              days: coberturaFijos,
              pct: Math.round(fijosPct),
            })}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <SegmentStat
            dotColor={ahorroTone.solid}
            label={t('control:cobertura.statAhorro')}
            value={formatMoneyShort(ahorroMes)}
            sub={
              ahorroMes > 0
                ? t('control:cobertura.statSub', {
                    days: coberturaAhorro,
                    pct: Math.round(ahorroPct),
                  })
                : t('control:cobertura.statSinDefinir')
            }
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <SegmentStat
            dotColor={libreTone.solid}
            label={t('control:cobertura.statLibre')}
            value={formatMoneyShort(libreMes)}
            sub={t('control:cobertura.statSub', {
              days: coberturaLibre,
              pct: Math.round(librePct),
            })}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
        </View>

        <View
          style={[
            styles.callout,
            {
              backgroundColor: palette.calloutBg,
              borderColor: palette.calloutBorder,
            },
          ]}
          accessibilityLabel={hint.text}
        >
          <MaterialIcons name={hint.icon} size={16} color={palette.fg} />
          <Text style={[styles.calloutText, { color: theme.colors.text }]}>
            {hint.text}
          </Text>
        </View>
      </View>
    </RiseView>
  )
}

interface SegmentStatProps {
  dotColor: string
  label: string
  value: string
  sub: string
  text: string
  muted: string
}

function SegmentStat({
  dotColor,
  label,
  value,
  sub,
  text,
  muted,
}: SegmentStatProps) {
  return (
    <View style={styles.stat}>
      <View style={styles.statHead}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.statLabel, { color: muted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.statValue, { color: text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.statSub, { color: muted }]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    flex: 1,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 200,
  },
  statePillText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.2,
  },
  headline: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  headlineStrong: {
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  overrideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  overrideText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 14,
  },
  barOuter: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  barSegment: {
    height: '100%',
  },
  barSegmentLeft: {
    borderTopLeftRadius: 7,
    borderBottomLeftRadius: 7,
  },
  barSegmentRight: {
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
  },
  statHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.3,
  },
  statSub: {
    fontSize: 10,
    marginTop: 2,
  },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  calloutText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    lineHeight: 16,
  },
})

// Memo: Cobertura muestra qué % de ingresos cubre fijos. Card de
// solo-lectura — render seguro de saltar si los datos no cambian.
export const ControlV2CoberturaCard = memo(ControlV2CoberturaCardImpl)
