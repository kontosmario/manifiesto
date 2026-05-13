import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import Svg, { Circle, G, Line } from 'react-native-svg'
import { Screen } from '@/components/ui/screen'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Dev-only preview of the 3 conceptual directions for the Fijos hero
 * card refactor. Mounted under `/settings/dev/fijos-hero-preview`,
 * gated by __DEV__. All variants render with the SAME sample data so
 * the comparison is fair. No motion — static visual mocks only. Once
 * the owner picks a direction, the chosen variant is promoted to the
 * real FijosHeroCard with motion + a11y.
 *
 * Sample data:
 *  · cycle 5 abr → 5 may, day 12 of 30 (18 días restantes)
 *  · total fijos $ 425.000 — 10 ítems
 *      paid (5) = $ 245.000   pending (3) = $ 142.000   overdue (2) = $ 38.000
 *  · libre del ciclo $ 380.000 (42% del sueldo va a fijos)
 *  · próximo: Netflix · 3 días · $ 12.500
 */
export function FijosHeroPreviewScreen() {
  return (
    <Screen title="Preview · Hero Fijos" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>3 direcciones conceptuales</Text>
        <Text style={styles.introBody}>
          Mismos datos de ejemplo para los tres. Sin motion — solo
          comparación visual de partida. Doc completo en
          REAL-VALUE-SUGGESTIONS / FIJOS-HERO-REFACTOR-2026-05-12.md.
        </Text>
      </View>

      <VariantLabel letter="A" name="The Ledger" tagline="Editorial-tipográfica · extracto financiero" />
      <LedgerHero {...SAMPLE} />

      <VariantLabel letter="B" name="The Cycle Dial" tagline="Instrumento radial · dos arcos + ticks por fijo" />
      <DialHero {...SAMPLE} />

      <VariantLabel letter="C" name="The Calendar Grid" tagline="Calendar interactivo · cada celda es un día del ciclo" />
      <GridHero {...SAMPLE} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Tras elegir dirección, Etapa 2 = implementación con motion completa
          + a11y. Hasta entonces, cero cambios sobre el FijosHeroCard
          real en producción.
        </Text>
      </View>
    </Screen>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sample data
// ─────────────────────────────────────────────────────────────────

const SAMPLE = {
  cycleLabel: '5 abr → 5 may',
  monthShort: 'ABR',
  daysRemaining: 18,
  cycleDays: 30,
  todayDay: 17,
  cycleDayIndex: 12,
  totalFijos: 425_000,
  montoPagado: 245_000,
  montoPendiente: 142_000,
  montoVencido: 38_000,
  cantidadPagados: 5,
  cantidadPendientes: 3,
  cantidadVencidos: 2,
  dineroLibre: 380_000,
  pctSueldo: 42,
  paidPct: 57,
  nextItem: { name: 'Netflix', days: 3, amount: 12_500 },
} as const

// Per-day calendar state used by GridHero. 30 cells starting Apr 1.
// each cell: 'empty' | 'paid' | 'pending' | 'overdue' | 'today'
const GRID_DAYS: Array<{
  day: number
  kind: 'empty' | 'paid' | 'pending' | 'overdue' | 'today'
  color?: string
}> = (() => {
  const fijosByDay: Record<number, { kind: 'paid' | 'pending' | 'overdue'; color: string }> = {
    5: { kind: 'paid', color: '#A6EF8F' },
    8: { kind: 'paid', color: '#F2B58A' },
    10: { kind: 'paid', color: '#9FC9E4' },
    11: { kind: 'paid', color: '#E5B6E5' },
    13: { kind: 'paid', color: '#A6EF8F' },
    14: { kind: 'overdue', color: '#F06A6A' },
    16: { kind: 'overdue', color: '#F06A6A' },
    20: { kind: 'pending', color: '#A6EF8F' },
    25: { kind: 'pending', color: '#F2B58A' },
    28: { kind: 'pending', color: '#9FC9E4' },
  }
  const out: Array<{
    day: number
    kind: 'empty' | 'paid' | 'pending' | 'overdue' | 'today'
    color?: string
  }> = []
  for (let d = 1; d <= 30; d++) {
    if (d === 17) {
      out.push({ day: d, kind: 'today' })
    } else if (fijosByDay[d]) {
      out.push({ day: d, ...fijosByDay[d] })
    } else {
      out.push({ day: d, kind: 'empty' })
    }
  }
  return out
})()

// ─────────────────────────────────────────────────────────────────
// Shared shell — gradient + eyebrow
// ─────────────────────────────────────────────────────────────────

function HeroShell({ children }: { children: React.ReactNode }) {
  const { theme } = useAppTheme()
  return (
    <LinearGradient
      colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { borderColor: 'rgba(166,239,143,0.12)' }]}
    >
      {children}
    </LinearGradient>
  )
}

// ─────────────────────────────────────────────────────────────────
// VARIANT A — The Ledger
// ─────────────────────────────────────────────────────────────────

type SampleProps = typeof SAMPLE

function LedgerHero(props: SampleProps) {
  const { theme } = useAppTheme()
  return (
    <HeroShell>
      {/* Eyebrow editorial */}
      <View style={styles.ledgerEyebrow}>
        <Text style={[styles.ledgerEyebrowMonth, { color: theme.colors.heroAccent }]}>
          {props.monthShort}
        </Text>
        <Text style={[styles.ledgerEyebrowCycle, { color: theme.colors.heroMuted2 }]}>
          ciclo {props.cycleLabel}
        </Text>
        <Text style={[styles.ledgerEyebrowDays, { color: theme.colors.heroMuted2 }]}>
          · {props.daysRemaining} días
        </Text>
      </View>

      {/* Total hero number */}
      <Text style={[styles.ledgerSectionLabel, { color: theme.colors.heroMuted2 }]}>
        FIJOS DEL CICLO
      </Text>
      <Text style={[styles.ledgerTotal, { color: theme.colors.heroText }]}>
        {formatMoney(props.totalFijos)}
      </Text>

      <View style={styles.ledgerRule} />

      {/* 3 líneas: pagado / por pagar / vencido */}
      <LedgerRow
        label="pagado"
        amount={props.montoPagado}
        count={props.cantidadPagados}
        accent={theme.colors.heroAccent}
        muted={theme.colors.heroMuted}
      />
      <LedgerRow
        label="por pagar"
        amount={props.montoPendiente}
        count={props.cantidadPendientes}
        accent={theme.colors.heroText}
        muted={theme.colors.heroMuted}
      />
      <LedgerRow
        label="vencido"
        amount={props.montoVencido}
        count={props.cantidadVencidos}
        accent="#F06A6A"
        muted={theme.colors.heroMuted}
        urgent
      />

      <View style={styles.ledgerRule} />

      {/* Cierre */}
      <View style={styles.ledgerFooter}>
        <Text style={[styles.ledgerFooterLeft, { color: theme.colors.heroMuted }]}>
          Libre del ciclo{'  '}
          <Text style={{ color: theme.colors.heroText, fontWeight: '700' }}>
            {formatMoney(props.dineroLibre)}
          </Text>
        </Text>
        <Text style={[styles.ledgerFooterRight, { color: theme.colors.heroMuted2 }]}>
          {props.pctSueldo}% del sueldo
        </Text>
      </View>

      {/* Próximo */}
      <View style={[styles.ledgerNext, { borderColor: 'rgba(166,239,143,0.18)' }]}>
        <MaterialIcons name="schedule" size={14} color={theme.colors.heroAccent} />
        <Text style={[styles.ledgerNextText, { color: theme.colors.heroAccent }]}>
          Próximo
        </Text>
        <Text style={[styles.ledgerNextName, { color: theme.colors.heroText }]}>
          {props.nextItem.name}
        </Text>
        <Text style={[styles.ledgerNextMeta, { color: theme.colors.heroMuted }]}>
          en {props.nextItem.days} días · {formatMoney(props.nextItem.amount)}
        </Text>
      </View>
    </HeroShell>
  )
}

function LedgerRow({
  label,
  amount,
  count,
  accent,
  muted,
  urgent,
}: {
  label: string
  amount: number
  count: number
  accent: string
  muted: string
  urgent?: boolean
}) {
  return (
    <View style={styles.ledgerRow}>
      <View style={styles.ledgerRowLeft}>
        {urgent ? (
          <View style={[styles.ledgerUrgentDot, { backgroundColor: accent }]} />
        ) : null}
        <Text style={[styles.ledgerRowLabel, { color: muted }]}>{label}</Text>
      </View>
      <View style={styles.ledgerRowRight}>
        <Text style={[styles.ledgerRowAmount, { color: accent }]}>
          {formatMoney(amount)}
        </Text>
        <Text style={[styles.ledgerRowCount, { color: muted }]}>
          · {count} {count === 1 ? 'ítem' : 'ítems'}
        </Text>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// VARIANT B — The Cycle Dial
// ─────────────────────────────────────────────────────────────────

function DialHero(props: SampleProps) {
  const { theme } = useAppTheme()
  return (
    <HeroShell>
      <View style={styles.dialHeader}>
        <Text style={[styles.dialEyebrow, { color: theme.colors.heroAccent }]}>
          GASTOS FIJOS · {props.cycleLabel}
        </Text>
      </View>

      <View style={styles.dialBody}>
        <CycleDial
          paidPct={props.paidPct}
          cyclePct={Math.round((props.cycleDayIndex / props.cycleDays) * 100)}
          ticks={[3, 12, 22]} // upcoming days into cycle (visual mock)
          accent={theme.colors.heroAccent}
          mutedTrack="rgba(255,255,255,0.10)"
        />

        <View style={styles.dialRight}>
          <Text style={[styles.dialCenterPct, { color: theme.colors.heroText }]}>
            {props.paidPct}%
          </Text>
          <Text style={[styles.dialCenterPctLabel, { color: theme.colors.heroMuted2 }]}>
            pagado
          </Text>

          <View style={{ height: 12 }} />

          <Text style={[styles.dialMetricSmall, { color: theme.colors.heroMuted }]}>
            {props.daysRemaining} días al cierre
          </Text>
          <Text style={[styles.dialMetricSmall, { color: theme.colors.heroMuted }]}>
            {formatMoney(props.montoPagado)} pagado
          </Text>
          <Text style={[styles.dialMetricSmall, { color: '#F2A78C' }]}>
            {formatMoney(props.montoPendiente + props.montoVencido)} por pagar
          </Text>
          {props.cantidadVencidos > 0 ? (
            <Text style={[styles.dialMetricUrgent, { color: '#F06A6A' }]}>
              {props.cantidadVencidos} vencidos
            </Text>
          ) : null}
        </View>
      </View>

      {/* Upcoming chip */}
      <View style={[styles.dialUpcoming, { borderColor: 'rgba(166,239,143,0.18)' }]}>
        <MaterialIcons name="play-arrow" size={12} color={theme.colors.heroAccent} />
        <Text style={[styles.dialUpcomingText, { color: theme.colors.heroAccent }]}>
          Próximo
        </Text>
        <Text style={[styles.dialUpcomingName, { color: theme.colors.heroText }]}>
          {props.nextItem.name}
        </Text>
        <Text style={[styles.dialUpcomingMeta, { color: theme.colors.heroMuted }]}>
          en {props.nextItem.days}d · {formatMoney(props.nextItem.amount)}
        </Text>
      </View>

      {/* Bottom row */}
      <View style={[styles.dialBottom, { borderTopColor: 'rgba(255,255,255,0.10)' }]}>
        <Text style={[styles.dialBottomLeft, { color: theme.colors.heroMuted }]}>
          Libre del ciclo{'  '}
          <Text style={{ color: theme.colors.heroText, fontWeight: '700' }}>
            {formatMoney(props.dineroLibre)}
          </Text>
        </Text>
        <Text style={[styles.dialBottomRight, { color: theme.colors.heroAccent }]}>
          {props.pctSueldo}% a fijos
        </Text>
      </View>
    </HeroShell>
  )
}

function CycleDial({
  paidPct,
  cyclePct,
  ticks,
  accent,
  mutedTrack,
}: {
  paidPct: number
  cyclePct: number
  ticks: number[]
  accent: string
  mutedTrack: string
}) {
  const size = 140
  const cx = size / 2
  const cy = size / 2
  // Outer ring (paid)
  const rOuter = 60
  const strokeOuter = 10
  const circOuter = 2 * Math.PI * rOuter
  const paidLen = (paidPct / 100) * circOuter
  // Inner ring (cycle progress)
  const rInner = 44
  const strokeInner = 5
  const circInner = 2 * Math.PI * rInner
  const cycleLen = (cyclePct / 100) * circInner

  return (
    <Svg width={size} height={size}>
      <G rotation={-90} originX={cx} originY={cy}>
        {/* Outer track */}
        <Circle
          cx={cx}
          cy={cy}
          r={rOuter}
          stroke={mutedTrack}
          strokeWidth={strokeOuter}
          fill="none"
        />
        {/* Outer fill — paidPct */}
        <Circle
          cx={cx}
          cy={cy}
          r={rOuter}
          stroke={accent}
          strokeWidth={strokeOuter}
          strokeDasharray={`${paidLen} ${circOuter}`}
          strokeLinecap="round"
          fill="none"
        />
        {/* Inner track */}
        <Circle
          cx={cx}
          cy={cy}
          r={rInner}
          stroke={mutedTrack}
          strokeWidth={strokeInner}
          fill="none"
        />
        {/* Inner fill — cyclePct */}
        <Circle
          cx={cx}
          cy={cy}
          r={rInner}
          stroke="rgba(242,234,211,0.55)"
          strokeWidth={strokeInner}
          strokeDasharray={`${cycleLen} ${circInner}`}
          strokeLinecap="round"
          fill="none"
        />
        {/* Tick marks — each upcoming fijo */}
        {ticks.map((dayIntoCycle, i) => {
          const angle = (dayIntoCycle / 30) * 2 * Math.PI
          const x1 = cx + Math.cos(angle) * (rOuter + strokeOuter / 2 + 2)
          const y1 = cy + Math.sin(angle) * (rOuter + strokeOuter / 2 + 2)
          const x2 = cx + Math.cos(angle) * (rOuter + strokeOuter / 2 + 8)
          const y2 = cy + Math.sin(angle) * (rOuter + strokeOuter / 2 + 8)
          return (
            <Line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={accent}
              strokeWidth={2}
              strokeLinecap="round"
            />
          )
        })}
      </G>
    </Svg>
  )
}

// ─────────────────────────────────────────────────────────────────
// VARIANT C — The Calendar Grid
// ─────────────────────────────────────────────────────────────────

function GridHero(props: SampleProps) {
  const { theme } = useAppTheme()
  return (
    <HeroShell>
      {/* Eyebrow */}
      <View style={styles.gridHeader}>
        <Text style={[styles.gridEyebrow, { color: theme.colors.heroAccent }]}>
          CICLO ABRIL · {props.cycleLabel}
        </Text>
        <Text style={[styles.gridDaysLeft, { color: theme.colors.heroMuted2 }]}>
          {props.daysRemaining} días más
        </Text>
      </View>

      {/* Weekday header */}
      <View style={styles.gridWeekdayRow}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <Text
            key={i}
            style={[styles.gridWeekday, { color: theme.colors.heroMuted2 }]}
          >
            {d}
          </Text>
        ))}
      </View>

      {/* 30-day grid: 5 rows × 7 cols (35 cells, last row partial) */}
      <View style={styles.gridContainer}>
        {GRID_DAYS.map((cell) => (
          <GridCell key={cell.day} cell={cell} accent={theme.colors.heroAccent} />
        ))}
      </View>

      {/* Legend */}
      <View style={styles.gridLegend}>
        <LegendItem icon="check" color={theme.colors.heroAccent} label="pagado" />
        <LegendItem dotColor={theme.colors.heroAccent} label="por pagar" />
        <LegendItem dotColor="#F06A6A" label="vencido" />
      </View>

      {/* Bottom 4-column summary */}
      <View style={[styles.gridBottom, { borderTopColor: 'rgba(255,255,255,0.10)' }]}>
        <BottomCol
          label="pagado"
          amount={props.montoPagado}
          count={props.cantidadPagados}
          color={theme.colors.heroAccent}
        />
        <BottomCol
          label="por pagar"
          amount={props.montoPendiente}
          count={props.cantidadPendientes}
          color={theme.colors.heroText}
        />
        <BottomCol
          label="vencido"
          amount={props.montoVencido}
          count={props.cantidadVencidos}
          color="#F06A6A"
        />
        <BottomCol
          label="libre"
          amount={props.dineroLibre}
          count={`${props.pctSueldo}%`}
          color={theme.colors.heroAccent}
        />
      </View>
    </HeroShell>
  )
}

function GridCell({
  cell,
  accent,
}: {
  cell: (typeof GRID_DAYS)[number]
  accent: string
}) {
  const { theme } = useAppTheme()
  if (cell.kind === 'today') {
    return (
      <View style={styles.gridCell}>
        <View style={[styles.gridCellToday, { borderColor: accent }]}>
          <Text style={[styles.gridCellTodayText, { color: theme.colors.heroText }]}>
            {cell.day}
          </Text>
        </View>
      </View>
    )
  }
  if (cell.kind === 'paid') {
    return (
      <View style={styles.gridCell}>
        <View style={[styles.gridCellPaid, { backgroundColor: (cell.color ?? accent) + '33' }]}>
          <MaterialIcons name="check" size={11} color={cell.color ?? accent} />
        </View>
        <Text style={[styles.gridCellDay, { color: theme.colors.heroMuted2 }]}>
          {cell.day}
        </Text>
      </View>
    )
  }
  if (cell.kind === 'pending') {
    return (
      <View style={styles.gridCell}>
        <View style={[styles.gridCellDot, { backgroundColor: cell.color ?? accent }]} />
        <Text style={[styles.gridCellDay, { color: theme.colors.heroMuted2 }]}>
          {cell.day}
        </Text>
      </View>
    )
  }
  if (cell.kind === 'overdue') {
    return (
      <View style={styles.gridCell}>
        <View style={[styles.gridCellOverdue, { borderColor: cell.color ?? '#F06A6A' }]} />
        <Text style={[styles.gridCellDay, { color: theme.colors.heroMuted2 }]}>
          {cell.day}
        </Text>
      </View>
    )
  }
  // empty
  return (
    <View style={styles.gridCell}>
      <Text style={[styles.gridCellDayEmpty, { color: theme.colors.heroMuted2 }]}>
        {cell.day}
      </Text>
    </View>
  )
}

function LegendItem({
  icon,
  dotColor,
  color,
  label,
}: {
  icon?: 'check'
  dotColor?: string
  color?: string
  label: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.legendItem}>
      {icon ? (
        <MaterialIcons name="check" size={11} color={color ?? theme.colors.heroAccent} />
      ) : dotColor ? (
        <View style={[styles.legendDot, { backgroundColor: dotColor }]} />
      ) : null}
      <Text style={[styles.legendText, { color: theme.colors.heroMuted }]}>{label}</Text>
    </View>
  )
}

function BottomCol({
  label,
  amount,
  count,
  color,
}: {
  label: string
  amount: number
  count: number | string
  color: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.bottomCol}>
      <Text style={[styles.bottomColLabel, { color: theme.colors.heroMuted2 }]}>
        {label}
      </Text>
      <Text style={[styles.bottomColAmount, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(amount)}
      </Text>
      <Text style={[styles.bottomColCount, { color: theme.colors.heroMuted2 }]}>
        {typeof count === 'number' ? `${count} ítems` : count}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// Variant label header
// ─────────────────────────────────────────────────────────────────

function VariantLabel({
  letter,
  name,
  tagline,
}: {
  letter: string
  name: string
  tagline: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.variantLabel}>
      <View style={[styles.variantBadge, { borderColor: theme.colors.heroAccent }]}>
        <Text style={[styles.variantBadgeText, { color: theme.colors.heroAccent }]}>
          {letter}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.variantName, { color: theme.colors.text }]}>
          {name}
        </Text>
        <Text style={[styles.variantTagline, { color: theme.colors.textMuted }]}>
          {tagline}
        </Text>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  intro: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 4,
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#12211A',
  },
  introBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#5C6962',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
  },
  footerText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#5C6962',
    fontStyle: 'italic',
  },
  // Variant header
  variantLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 12,
  },
  variantBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  variantBadgeText: {
    fontSize: 16,
    fontWeight: '800',
  },
  variantName: {
    fontSize: 16,
    fontWeight: '700',
  },
  variantTagline: {
    fontSize: 12,
    marginTop: 1,
  },

  // Hero shell shared
  card: {
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },

  // VARIANT A — Ledger
  ledgerEyebrow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 14,
  },
  ledgerEyebrowMonth: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  ledgerEyebrowCycle: {
    fontSize: 12,
  },
  ledgerEyebrowDays: {
    fontSize: 12,
  },
  ledgerSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  ledgerTotal: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 34,
    marginBottom: 12,
  },
  ledgerRule: {
    height: 1,
    backgroundColor: 'rgba(242,234,211,0.12)',
    marginVertical: 6,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ledgerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ledgerUrgentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ledgerRowLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  ledgerRowRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  ledgerRowAmount: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  ledgerRowCount: {
    fontSize: 11,
  },
  ledgerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  ledgerFooterLeft: {
    fontSize: 12,
    flex: 1,
  },
  ledgerFooterRight: {
    fontSize: 11,
  },
  ledgerNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    flexWrap: 'wrap',
  },
  ledgerNextText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  ledgerNextName: {
    fontSize: 13,
    fontWeight: '700',
  },
  ledgerNextMeta: {
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },

  // VARIANT B — Dial
  dialHeader: {
    marginBottom: 14,
  },
  dialEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  dialBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  dialRight: {
    flex: 1,
  },
  dialCenterPct: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 30,
  },
  dialCenterPctLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  dialMetricSmall: {
    fontSize: 12,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  dialMetricUrgent: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  dialUpcoming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  dialUpcomingText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  dialUpcomingName: {
    fontSize: 12,
    fontWeight: '700',
  },
  dialUpcomingMeta: {
    fontSize: 11,
    flex: 1,
    textAlign: 'right',
  },
  dialBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
  },
  dialBottomLeft: {
    fontSize: 12,
    flex: 1,
  },
  dialBottomRight: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // VARIANT C — Grid
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  gridEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  gridDaysLeft: {
    fontSize: 11,
  },
  gridWeekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  gridWeekday: {
    flex: 1,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.8,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  gridCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  gridCellDay: {
    fontSize: 9,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  gridCellDayEmpty: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    opacity: 0.45,
  },
  gridCellToday: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCellTodayText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  gridCellPaid: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCellDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  gridCellOverdue: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  gridLegend: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
  },
  gridBottom: {
    flexDirection: 'row',
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 6,
  },
  bottomCol: {
    flex: 1,
  },
  bottomColLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  bottomColAmount: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  bottomColCount: {
    fontSize: 10,
    marginTop: 1,
  },
})
