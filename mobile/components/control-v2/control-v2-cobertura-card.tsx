import { StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { RiseView } from '@/components/home/animated/rise-view'
import { useAppTheme } from '@/theme/theme-provider'
import { formatMoneyShort } from '@/utils/money'

interface ControlV2CoberturaCardProps {
  fijosMes: number
  ahorroMes: number
  libreMes: number
  ingresoMes: number
  diasMes: number
  fijosRatioPct: number
  cycleStartingBalanceOverride?: number | null
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
export function ControlV2CoberturaCard({
  fijosMes,
  ahorroMes,
  libreMes,
  ingresoMes,
  diasMes,
  fijosRatioPct,
  cycleStartingBalanceOverride,
}: ControlV2CoberturaCardProps) {
  const { theme } = useAppTheme()
  const isDark = theme.isDark

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
  // Common rule of thumb: fixed-cost ratio over 50% is "alto", over
  // 65% is unsustainable territory. Below 35% is exceptional. Three
  // colors + four copy variants give the user a real signal.
  const mood: 'good' | 'fine' | 'warn' | 'critical' =
    fijosRatioPct >= 65
      ? 'critical'
      : fijosRatioPct >= 50
        ? 'warn'
        : fijosRatioPct >= 35
          ? 'fine'
          : 'good'

  const palette = (() => {
    switch (mood) {
      case 'good':
        return {
          fg: theme.colors.success,
          border: isDark ? 'rgba(122,216,163,0.36)' : 'rgba(28,126,58,0.28)',
          chipBg: isDark ? 'rgba(122,216,163,0.16)' : 'rgba(28,126,58,0.10)',
          chipBorder: isDark
            ? 'rgba(122,216,163,0.34)'
            : 'rgba(28,126,58,0.26)',
          calloutBg: isDark
            ? 'rgba(122,216,163,0.10)'
            : 'rgba(28,126,58,0.06)',
          calloutBorder: isDark
            ? 'rgba(122,216,163,0.26)'
            : 'rgba(28,126,58,0.18)',
          icon: 'check-circle' as const,
          stateLabel: 'Excelente',
        }
      case 'fine':
        return {
          fg: theme.colors.success,
          border: isDark ? 'rgba(122,216,163,0.30)' : 'rgba(28,126,58,0.22)',
          chipBg: isDark ? 'rgba(122,216,163,0.14)' : 'rgba(28,126,58,0.08)',
          chipBorder: isDark
            ? 'rgba(122,216,163,0.30)'
            : 'rgba(28,126,58,0.22)',
          calloutBg: isDark
            ? 'rgba(122,216,163,0.08)'
            : 'rgba(28,126,58,0.05)',
          calloutBorder: isDark
            ? 'rgba(122,216,163,0.22)'
            : 'rgba(28,126,58,0.16)',
          icon: 'verified' as const,
          stateLabel: 'Saludable',
        }
      case 'warn':
        return {
          fg: theme.colors.warning,
          border: isDark ? 'rgba(243,186,87,0.42)' : 'rgba(194,122,10,0.32)',
          chipBg: isDark ? 'rgba(243,186,87,0.16)' : 'rgba(194,122,10,0.10)',
          chipBorder: isDark
            ? 'rgba(243,186,87,0.34)'
            : 'rgba(194,122,10,0.26)',
          calloutBg: isDark
            ? 'rgba(243,186,87,0.10)'
            : 'rgba(194,122,10,0.06)',
          calloutBorder: isDark
            ? 'rgba(243,186,87,0.28)'
            : 'rgba(194,122,10,0.20)',
          icon: 'error-outline' as const,
          stateLabel: 'Alto',
        }
      case 'critical':
        return {
          fg: theme.colors.danger,
          border: isDark ? 'rgba(232,138,112,0.45)' : 'rgba(192,58,42,0.32)',
          chipBg: isDark ? 'rgba(232,138,112,0.18)' : 'rgba(192,58,42,0.12)',
          chipBorder: isDark
            ? 'rgba(232,138,112,0.42)'
            : 'rgba(192,58,42,0.30)',
          calloutBg: isDark
            ? 'rgba(232,138,112,0.12)'
            : 'rgba(192,58,42,0.08)',
          calloutBorder: isDark
            ? 'rgba(232,138,112,0.30)'
            : 'rgba(192,58,42,0.22)',
          icon: 'priority-high' as const,
          stateLabel: 'Crítico',
        }
    }
  })()

  // Segment tones — match the stats dot colors to the bar fill so
  // the eye maps "this slice" → "this row" without legend overhead.
  const fijosTone: SegmentTone = {
    solid: isDark ? '#F3BA57' : '#C27A0A',
    bg: isDark ? 'rgba(243,186,87,0.18)' : 'rgba(194,122,10,0.12)',
  }
  const ahorroTone: SegmentTone = {
    solid: isDark ? '#7AD8A3' : '#1C7E3A',
    bg: isDark ? 'rgba(122,216,163,0.18)' : 'rgba(28,126,58,0.12)',
  }
  const libreTone: SegmentTone = {
    solid: isDark ? '#AFCDE8' : '#6B9AD6',
    bg: isDark ? 'rgba(175,205,232,0.18)' : 'rgba(107,154,214,0.14)',
  }

  // Smart hint copy — pulled apart so we can also surface a callout
  // when the user hasn't set a savings target (the bar would show
  // ahorro=0% and the user might not realize that's because it's
  // unconfigured, not because they're not saving).
  const hint = (() => {
    if (ahorroMes === 0 && ingresoMes > 0) {
      return {
        icon: 'savings' as const,
        text: 'No definiste cuánto ahorrar. Configurá tu meta mensual en Ajustes para que la app la respete.',
      }
    }
    switch (mood) {
      case 'good':
        return {
          icon: 'check-circle' as const,
          text: `Excelente: ${Math.round(fijosRatioPct)}% va a fijos. Tu margen es amplio.`,
        }
      case 'fine':
        return {
          icon: 'verified' as const,
          text: `Saludable: ${Math.round(fijosRatioPct)}% va a fijos. Estás dentro del rango ideal (35-50%).`,
        }
      case 'warn':
        return {
          icon: 'error-outline' as const,
          text: `Alto: ${Math.round(fijosRatioPct)}% se va a fijos. Identificá si podés renegociar suscripciones o servicios.`,
        }
      case 'critical':
        return {
          icon: 'priority-high' as const,
          text: `Crítico: ${Math.round(fijosRatioPct)}% va a fijos. Necesitás reducir o renegociar para tener oxígeno real.`,
        }
    }
  })()

  return (
    <RiseView delay={380}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: palette.border,
          },
        ]}
      >
        <View style={styles.eyebrowRow}>
          <BreatheDot size={7} color={palette.fg} glow={palette.fg} />
          <Text style={[styles.eyebrow, { color: palette.fg }]} numberOfLines={1}>
            TU SUELDO EN DÍAS
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
              {Math.round(fijosRatioPct)}% fijos · {palette.stateLabel}
            </Text>
          </View>
        </View>

        <Text style={[styles.headline, { color: theme.colors.text }]}>
          De los <Text style={styles.headlineStrong}>{diasMes} días</Text> del
          ciclo, los primeros{' '}
          <Text style={[styles.headlineStrong, { color: fijosTone.solid }]}>
            {coberturaFijos} pagan tus fijos
          </Text>
          {coberturaAhorro > 0 ? (
            <>
              ,{' '}
              <Text
                style={[styles.headlineStrong, { color: ahorroTone.solid }]}
              >
                {coberturaAhorro} van a tu ahorro
              </Text>
            </>
          ) : null}{' '}
          y{' '}
          <Text style={[styles.headlineStrong, { color: libreTone.solid }]}>
            {coberturaLibre} son libres
          </Text>
          .
        </Text>

        {cycleStartingBalanceOverride != null ? (
          <View
            style={[
              styles.overrideRow,
              {
                backgroundColor: theme.colors.surfaceMuted,
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
              Trabajando con{' '}
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>
                {formatMoneyShort(cycleStartingBalanceOverride)}
              </Text>{' '}
              confirmados — el split refleja el sueldo bruto.
            </Text>
          </View>
        ) : null}

        <View
          style={[
            styles.barOuter,
            {
              backgroundColor: theme.colors.surfaceMuted,
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
            label="Fijos"
            value={formatMoneyShort(fijosMes)}
            sub={`${coberturaFijos}d · ${Math.round(fijosPct)}%`}
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <SegmentStat
            dotColor={ahorroTone.solid}
            label="Ahorro"
            value={formatMoneyShort(ahorroMes)}
            sub={
              ahorroMes > 0
                ? `${coberturaAhorro}d · ${Math.round(ahorroPct)}%`
                : 'sin definir'
            }
            text={theme.colors.text}
            muted={theme.colors.textMuted}
          />
          <SegmentStat
            dotColor={libreTone.solid}
            label="Libre"
            value={formatMoneyShort(libreMes)}
            sub={`${coberturaLibre}d · ${Math.round(librePct)}%`}
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
    borderRadius: 22,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    letterSpacing: 0.2,
  },
  headline: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  headlineStrong: {
    fontWeight: '800',
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
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
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
    lineHeight: 16,
  },
})
