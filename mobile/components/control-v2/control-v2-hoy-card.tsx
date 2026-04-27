import type { ComponentType, PropsWithChildren, ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import Svg, {
  Circle,
  Defs as DefsRaw,
  LinearGradient as SvgGradient,
  Line,
  RadialGradient,
  Stop,
} from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

// react-native-svg v15 types `Defs` without children in its BaseProps
// even though it accepts them at runtime. Re-type so JSX compiles.
const Defs = DefsRaw as unknown as ComponentType<PropsWithChildren>

type Severity = 'ok' | 'warn' | 'critical'

interface Tone {
  /** Brighter tip of the gauge gradient. */
  tint: string
  /** Deeper end of the gauge gradient. */
  solid: string
  /** Status pill icon. */
  icon: keyof typeof MaterialIcons.glyphMap
  /** Status pill label. */
  label: string
}

interface ControlV2HoyCardProps {
  cupoDiario: number
  gastoHoy: number
  libreHoy: number
  delta: number
  estaOk: boolean
  horaF: number
  horaActual: number
  minActual: number
  diaLabel: string
  /** Consecutive winning days ending yesterday. */
  racha: number
  /** Days that closed at or under the cupo this cycle. */
  diasGanadores: number
  /** Closed days of the cycle (excludes today). */
  closedDays: number
  /** Days remaining in the cycle (today inclusive). */
  diasRestantes: number
  /** Days until the next salary lands. */
  proximoSueldoEnDias: number
  /** Last-7 average ÷ previous-7 average. 1 = flat. */
  momentum: number
  /** No-spend days marked this cycle. */
  noSpendCount: number
  /** Whether the cumulative discretionary spend already crossed the
   *  full-cycle budget — used to escalate the status pill copy. */
  alreadyExhausted: boolean
}

/**
 * HOY hero — the principal card of Control v2.
 *
 * Layered chrome (back → front):
 *   1. Hero gradient shell + tone-tinted ambient blob in the corner —
 *      the card itself reacts to severity.
 *   2. Top-edge hairline highlight for glass affordance.
 *   3. ShineOverlay (existing) for slow specular pass.
 *
 * Content:
 *   · Header — day label + tone-pill (icon + copy escalates with
 *     severity: ok / warn / critical).
 *   · Body — signature gauge dial (radial halo behind, severity arc,
 *     orbital hour-hand dot with glow ring) flanked by two iconified
 *     mini panels.
 *   · Insights strip — three glass chips: streak, days-under-cupo
 *     ratio, days until next salary.
 *   · Smart hint — single-line cascade with a tone-tinted accent
 *     stripe on the leading edge.
 */
export function ControlV2HoyCard({
  cupoDiario,
  gastoHoy,
  libreHoy,
  delta,
  estaOk,
  horaF,
  horaActual,
  minActual,
  diaLabel,
  racha,
  diasGanadores,
  closedDays,
  diasRestantes,
  proximoSueldoEnDias,
  momentum,
  noSpendCount,
  alreadyExhausted,
}: ControlV2HoyCardProps) {
  const { theme } = useAppTheme()

  const severity: Severity = alreadyExhausted
    ? 'critical'
    : libreHoy <= 0
      ? 'critical'
      : estaOk
        ? 'ok'
        : 'warn'

  const tone = pickTone(severity)
  const heroText = theme.colors.heroText
  const heroAccent = theme.colors.heroAccent
  const heroMuted = theme.colors.heroMuted
  const heroMuted2 = theme.colors.heroMuted2

  const innerPanelBg = 'rgba(246,251,239,0.05)'
  const innerPanelBorder = 'rgba(246,251,239,0.10)'
  const chipBg = 'rgba(246,251,239,0.07)'
  const chipBorder = 'rgba(246,251,239,0.10)'
  const tonePillBg = withAlpha(tone.tint, 0.14)

  const accentText = tone.tint
  const minutos = `${String(horaActual).padStart(2, '0')}:${String(minActual).padStart(2, '0')}`

  const hint = pickHint({
    severity,
    libreHoy,
    delta,
    racha,
    momentum,
    closedDays,
    diasGanadores,
    diasRestantes,
    proximoSueldoEnDias,
    noSpendCount,
    alreadyExhausted,
  })

  const deltaPanelIcon: keyof typeof MaterialIcons.glyphMap = estaOk
    ? 'savings'
    : 'trending-up'

  return (
    <RiseView delay={80}>
      <Animated.View layout={LinearTransition.duration(260)}>
        <LinearGradient
          colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          <View
            pointerEvents="none"
            style={[
              styles.toneBlob,
              { backgroundColor: tone.tint, opacity: 0.16 },
            ]}
          />
          <View pointerEvents="none" style={styles.topHighlight} />
          <ShineOverlay
            width={430}
            height={340}
            tint={theme.colors.shineOverlay}
            delayMs={1000}
            periodMs={4200}
          />

          <View style={styles.headerRow}>
            <View style={styles.eyebrowRow}>
              <BreatheDot size={7} color={tone.tint} glow={tone.tint} />
              <Text style={[styles.eyebrow, { color: heroAccent }]}>
                {diaLabel}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: tonePillBg },
              ]}
            >
              <MaterialIcons name={tone.icon} size={13} color={tone.tint} />
              <Text style={[styles.statusPillText, { color: tone.tint }]}>
                {tone.label}
              </Text>
            </View>
          </View>

          <View style={styles.body}>
            <GaugeDial
              percent={Math.min(1, gastoHoy / Math.max(1, cupoDiario))}
              horaFraction={horaF / 24}
              tone={tone}
            >
              <Text style={[styles.gaugeEyebrow, { color: heroMuted2 }]}>
                {libreHoy > 0 ? 'TE QUEDAN HOY' : 'TE PASASTE DEL DÍA'}
              </Text>
              <CountUpText
                value={Math.max(0, libreHoy > 0 ? libreHoy : Math.abs(libreHoy))}
                duration={1200}
                format={(n) => formatMoney(n)}
                style={[styles.gaugeAmount, { color: heroText }]}
              />
              <Text style={[styles.gaugeFooter, { color: heroMuted }]}>
                ya gastaste {formatMoney(gastoHoy)}
              </Text>
            </GaugeDial>

            <View style={styles.miniStack}>
              <MiniPanel
                icon="account-balance-wallet"
                iconColor={heroAccent}
                label="TU PLATA DEL DÍA"
                value={formatMoney(cupoDiario)}
                sub="sin tocar fijos"
                background={innerPanelBg}
                border={innerPanelBorder}
                accent={heroText}
                minor={heroMuted}
                minorSoft={heroMuted2}
              />
              <MiniPanel
                icon={deltaPanelIcon}
                iconColor={tone.tint}
                label={estaOk ? 'TE ESTÁS AHORRANDO' : 'TE PASASTE POR'}
                value={formatMoney(Math.abs(delta))}
                sub={`a las ${minutos}`}
                background={innerPanelBg}
                border={innerPanelBorder}
                accent={accentText}
                minor={heroMuted}
                minorSoft={heroMuted2}
              />
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.statsRow}>
            <StatChip
              icon="local-fire-department"
              iconColor={racha > 0 ? '#F1D690' : heroMuted2}
              label={racha > 0 ? `${racha}` : '—'}
              caption={racha === 1 ? 'día racha' : 'días racha'}
              text={heroText}
              minor={heroMuted2}
              background={chipBg}
              border={chipBorder}
            />
            <StatChip
              icon="military-tech"
              iconColor={tone.tint}
              label={closedDays > 0 ? `${diasGanadores}/${closedDays}` : '—'}
              caption="bajo cupo"
              text={heroText}
              minor={heroMuted2}
              background={chipBg}
              border={chipBorder}
            />
            <StatChip
              icon="event"
              iconColor={heroAccent}
              label={proximoSueldoEnDias <= 0 ? 'Hoy' : `${proximoSueldoEnDias}`}
              caption={proximoSueldoEnDias === 1 ? 'día al cobro' : 'días al cobro'}
              text={heroText}
              minor={heroMuted2}
              background={chipBg}
              border={chipBorder}
            />
          </View>

          <View
            style={[
              styles.hintRow,
              { backgroundColor: chipBg, borderColor: chipBorder },
            ]}
          >
            <View
              style={[styles.hintAccent, { backgroundColor: tone.tint }]}
            />
            <MaterialIcons name={hint.icon} size={16} color={tone.tint} />
            <Text style={[styles.hintText, { color: heroText }]}>
              {hint.text}
            </Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </RiseView>
  )
}

function pickTone(severity: Severity): Tone {
  switch (severity) {
    case 'ok':
      return {
        tint: '#C7EE9C',
        solid: '#6FE09A',
        icon: 'check-circle',
        label: 'vas bien',
      }
    case 'warn':
      return {
        tint: '#F1D690',
        solid: '#E8B85F',
        icon: 'priority-high',
        label: 'mirá el ritmo',
      }
    case 'critical':
      return {
        tint: '#F2B58A',
        solid: '#E88A70',
        icon: 'error-outline',
        label: 'sin cupo hoy',
      }
  }
}

interface HintInput {
  severity: Severity
  libreHoy: number
  delta: number
  racha: number
  momentum: number
  closedDays: number
  diasGanadores: number
  diasRestantes: number
  proximoSueldoEnDias: number
  noSpendCount: number
  alreadyExhausted: boolean
}

interface Hint {
  icon: keyof typeof MaterialIcons.glyphMap
  text: string
}

function pickHint(i: HintInput): Hint {
  if (i.alreadyExhausted) {
    return {
      icon: 'report',
      text: `Te pasaste del libre del ciclo. Quedan ${i.diasRestantes} ${
        i.diasRestantes === 1 ? 'día' : 'días'
      } al sueldo.`,
    }
  }
  if (i.libreHoy <= 0) {
    return {
      icon: 'pause-circle-outline',
      text: 'Quedate tranqui hasta mañana — arrancás con todo el cupo.',
    }
  }
  if (i.closedDays === 0) {
    return {
      icon: 'play-circle-outline',
      text: 'Primer día del ciclo. Hoy marcás el ritmo.',
    }
  }
  if (i.racha >= 3) {
    return {
      icon: 'local-fire-department',
      text: `Llevás ${i.racha} días bajo cupo — seguí así.`,
    }
  }
  if (i.momentum >= 1.2 && i.closedDays >= 7) {
    const pct = Math.round((i.momentum - 1) * 100)
    return {
      icon: 'trending-up',
      text: `Esta semana gastás un ${pct}% más que la previa.`,
    }
  }
  if (i.momentum <= 0.85 && i.closedDays >= 7) {
    const pct = Math.round((1 - i.momentum) * 100)
    return {
      icon: 'trending-down',
      text: `Bajaste el ritmo un ${pct}% vs la semana previa.`,
    }
  }
  if (i.severity === 'warn') {
    return {
      icon: 'speed',
      text: 'Vas un poco adelantado al ritmo del día — bajá el ritmo.',
    }
  }
  if (
    i.closedDays >= 3 &&
    i.diasGanadores >= Math.max(1, i.closedDays - 1)
  ) {
    return {
      icon: 'verified',
      text: 'Casi todos tus días cierran en verde este ciclo.',
    }
  }
  if (i.noSpendCount > 0) {
    return {
      icon: 'savings',
      text: `${i.noSpendCount} ${
        i.noSpendCount === 1 ? 'día' : 'días'
      } sin gastar este ciclo — sumás a la alcancía.`,
    }
  }
  return {
    icon: 'event',
    text: `Quedan ${i.diasRestantes} ${
      i.diasRestantes === 1 ? 'día' : 'días'
    } hasta tu próximo cobro.`,
  }
}

function GaugeDial({
  percent,
  horaFraction,
  tone,
  children,
}: {
  percent: number
  horaFraction: number
  tone: Tone
  children: ReactNode
}) {
  const size = 196
  const strokeWidth = 14
  const r = 82
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const dash = Math.min(percent, 1) * circumference

  // Clock-hand dot position (marks the hour around the dial).
  const angle = horaFraction * 2 * Math.PI - Math.PI / 2
  const dotR = r + 10
  const dotX = cx + dotR * Math.cos(angle)
  const dotY = cy + dotR * Math.sin(angle)

  const trackColor = 'rgba(246,251,239,0.10)'
  const tickColor = 'rgba(246,251,239,0.28)'

  return (
    <View style={[styles.gaugeRoot, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="hoy-arc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={tone.tint} />
            <Stop offset="100%" stopColor={tone.solid} />
          </SvgGradient>
          <RadialGradient
            id="hoy-halo"
            cx="50%"
            cy="50%"
            r="50%"
            fx="50%"
            fy="50%"
          >
            <Stop offset="0%" stopColor={tone.tint} stopOpacity={0.22} />
            <Stop offset="60%" stopColor={tone.tint} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={tone.tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* tone-tinted halo behind the gauge */}
        <Circle cx={cx} cy={cy} r={r + 14} fill="url(#hoy-halo)" />
        {/* hour ticks */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * 2 * Math.PI - Math.PI / 2
          const r1 = r + 14
          const r2 = r + 8
          const major = i % 3 === 0
          return (
            <Line
              key={i}
              x1={cx + r1 * Math.cos(a)}
              y1={cy + r1 * Math.sin(a)}
              x2={cx + r2 * Math.cos(a)}
              y2={cy + r2 * Math.sin(a)}
              stroke={tickColor}
              strokeWidth={major ? 2 : 1}
              strokeLinecap="round"
              opacity={major ? 1 : 0.6}
            />
          )
        })}
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke="url(#hoy-arc)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          fill="none"
        />
        {/* hour-hand dot with glow ring */}
        <Circle cx={dotX} cy={dotY} r={9} fill={tone.tint} opacity={0.22} />
        <Circle cx={dotX} cy={dotY} r={4.5} fill={tone.tint} />
      </Svg>
      <View style={styles.gaugeCenter} pointerEvents="none">
        {children}
      </View>
    </View>
  )
}

function MiniPanel({
  icon,
  iconColor,
  label,
  value,
  sub,
  background,
  border,
  accent,
  minor,
  minorSoft,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  label: string
  value: string
  sub?: string
  background: string
  border: string
  accent: string
  minor: string
  minorSoft: string
}) {
  return (
    <View
      style={[
        styles.miniPanel,
        { backgroundColor: background, borderColor: border },
      ]}
    >
      <View style={styles.miniHeader}>
        <Text style={[styles.miniLabel, { color: minorSoft }]} numberOfLines={1}>
          {label}
        </Text>
        <MaterialIcons name={icon} size={12} color={iconColor} />
      </View>
      <Text style={[styles.miniValue, { color: accent }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.miniSub, { color: minor }]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  )
}

function StatChip({
  icon,
  iconColor,
  label,
  caption,
  text,
  minor,
  background,
  border,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  iconColor: string
  label: string
  caption: string
  text: string
  minor: string
  background: string
  border: string
}) {
  return (
    <View
      style={[
        styles.statChip,
        { backgroundColor: background, borderColor: border },
      ]}
    >
      <MaterialIcons name={icon} size={15} color={iconColor} />
      <View style={styles.statChipBody}>
        <Text style={[styles.statChipLabel, { color: text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.statChipCaption, { color: minor }]} numberOfLines={1}>
          {caption}
        </Text>
      </View>
    </View>
  )
}

/** Hex `#RRGGBB` (or `#RGB`) → `rgba(r, g, b, a)`. Used to derive
 *  translucent tints from the tone hex without dragging in a util. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const expanded =
    h.length === 3
      ? h.split('').map((c) => c + c).join('')
      : h
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(199,238,156,0.14)',
    overflow: 'hidden',
  },
  toneBlob: {
    position: 'absolute',
    top: -90,
    right: -90,
    width: 240,
    height: 240,
    borderRadius: 240,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.6,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
  },
  gaugeRoot: {
    position: 'relative',
  },
  gaugeCenter: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gaugeEyebrow: {
    fontSize: 9,
    letterSpacing: 1.4,
    fontWeight: '700',
    textAlign: 'center',
  },
  gaugeAmount: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 30,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  gaugeFooter: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  miniStack: {
    flex: 1,
    flexDirection: 'column',
    gap: 8,
    alignSelf: 'stretch',
  },
  miniPanel: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  miniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  miniLabel: {
    flex: 1,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  miniValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  miniSub: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(246,251,239,0.10)',
    marginTop: 16,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  statChipBody: {
    flex: 1,
    minWidth: 0,
  },
  statChipLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  statChipCaption: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    overflow: 'hidden',
  },
  hintAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  hintText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
})
