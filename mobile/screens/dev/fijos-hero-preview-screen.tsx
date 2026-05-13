import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Dev-only preview de las 3 NUEVAS direcciones conceptuales (Iteration
 * 2) para el refactor del Fijos hero. La iteración 1 (Ledger / Dial /
 * Grid) fue rechazada por owner — pedía algo con la creatividad del
 * Wrapped mensual: editorial-magazine, single statement per "page",
 * universal entendible, único.
 *
 * Mounted under `/settings/dev/fijos-hero-preview`. __DEV__ only.
 * Mismos datos sample para los 3. Sin motion. Sólo lectura visual.
 *
 *  🅰  Titular     — magazine cover headline state-aware
 *  🅱  Pasaje      — boarding pass del ciclo de pago
 *  🅲  Manifiesto  — mini-slideshow Wrapped DNA en el hero
 */
export function FijosHeroPreviewScreen() {
  return (
    <Screen title="Preview · Hero Fijos" canGoBack scrollable>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>Iteration 2 · 3 direcciones</Text>
        <Text style={styles.introBody}>
          Tres direcciones nuevas inspiradas en la creatividad editorial
          del Wrapped mensual. Mismos datos para los tres, sin motion —
          comparación de partida. Doc completo en
          REAL-VALUE-SUGGESTIONS/FIJOS-HERO-REFACTOR-2026-05-12.md.
        </Text>
      </View>

      <VariantLabel
        letter="A"
        name="El Titular"
        tagline="Magazine cover · headline state-aware · una sola sentencia"
      />
      <TitularHero {...SAMPLE} />

      <VariantLabel
        letter="B"
        name="Pasaje del ciclo"
        tagline="Boarding pass · ABR → MAY · ticket stub perforado"
      />
      <PasajeHero {...SAMPLE} />

      <VariantLabel
        letter="C"
        name="Manifiesto Diario"
        tagline="Mini-Wrapped en el hero · 3 páginas auto-rotando cada 5s"
      />
      <View style={styles.carouselNote}>
        <Text style={styles.carouselNoteText}>
          En runtime, las 3 páginas rotan en place cada 5s con progress
          bars arriba (gramática Wrapped). Acá las muestro stacked para
          ver cada momento.
        </Text>
      </View>
      <ManifiestoPage1 {...SAMPLE} />
      <View style={{ height: 12 }} />
      <ManifiestoPage2 {...SAMPLE} />
      <View style={{ height: 12 }} />
      <ManifiestoPage3 {...SAMPLE} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Cuando elijas dirección → Etapa 2 = implementación con motion
          completa + a11y + commit sobre el FijosHeroCard real.
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
  monthLong: 'Abril',
  monthShort: 'ABR',
  monthShortNext: 'MAY',
  yearLabel: '2026',
  daysRemaining: 18,
  cycleDays: 30,
  todayDay: 17,
  cycleDayIndex: 12,
  totalFijos: 425_000,
  montoPagado: 245_000,
  montoPendiente: 142_000,
  montoVencido: 38_000,
  montoPorPagarTotal: 180_000,
  cantidadPagados: 5,
  cantidadPendientes: 3,
  cantidadVencidos: 2,
  cantidadPorPagarTotal: 5,
  dineroLibre: 380_000,
  pctSueldo: 42,
  paidPct: 57,
  nextItem: { name: 'Netflix', days: 3, amount: 12_500, dayOfWeek: 'viernes' },
} as const

type SampleProps = typeof SAMPLE

// ─────────────────────────────────────────────────────────────────
// Shared shell — gradient forest
// ─────────────────────────────────────────────────────────────────

function HeroShell({
  children,
  variant = 'forest',
}: {
  children: React.ReactNode
  variant?: 'forest' | 'paper'
}) {
  const { theme } = useAppTheme()
  if (variant === 'paper') {
    // Cream-paper aesthetic — usado en Manifiesto pages para máximo
    // contraste editorial cream-on-forest invertido. Mismo idioma del
    // Wrapped cover scene.
    return (
      <View
        style={[
          styles.card,
          styles.cardPaper,
          { backgroundColor: theme.isDark ? '#2A3A2F' : '#FFFBF2' },
        ]}
      >
        {children}
      </View>
    )
  }
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
// 🅰 VARIANT A — El Titular
// ─────────────────────────────────────────────────────────────────
// Magazine cover. Headline state-aware (lee el estado y escribe una
// sola sentencia). Footer band con métricas de soporte. Una sola
// "respiración" visual — el ojo aterriza en el headline, después
// pasa al footer sin competencia.

function TitularHero(props: SampleProps) {
  const { theme } = useAppTheme()

  // State resolver: la copy adapta al estado más urgente del ciclo.
  // Reglas:
  //   1. Si hay vencidos > 0 → urgencia roja, copy directa al atraso
  //   2. Si hay pendientes pero on-pace → cream, copy neutra de progreso
  //   3. Si todo pagado → cream-accent, copy de aliento
  const headline = resolveHeadline(props)

  return (
    <HeroShell>
      {/* Eyebrow editorial — fecha del ciclo */}
      <View style={styles.titularEyebrow}>
        <Text style={[styles.titularBrand, { color: theme.colors.heroAccent }]}>
          MANIFIESTO
        </Text>
        <Text style={[styles.titularSep, { color: theme.colors.heroMuted2 }]}>·</Text>
        <Text style={[styles.titularEdition, { color: theme.colors.heroMuted2 }]}>
          edición {props.monthLong.toLowerCase()}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.titularDays, { color: theme.colors.heroMuted2 }]}>
          {props.daysRemaining} días al cierre
        </Text>
      </View>

      {/* Decorative editorial rule */}
      <View style={[styles.titularRule, { backgroundColor: theme.colors.heroAccent }]} />

      {/* HEADLINE — el answer en una sentencia */}
      <View style={styles.titularHeadlineBlock}>
        <Text
          style={[
            styles.titularHeadline,
            { color: headline.color },
          ]}
          accessibilityRole="header"
        >
          {headline.line1}
        </Text>
        <Text
          style={[
            styles.titularHeadline,
            { color: headline.color },
          ]}
        >
          {headline.line2}
        </Text>
        <Text
          style={[
            styles.titularSubheadline,
            { color: theme.colors.heroMuted },
          ]}
        >
          {headline.subhead}
        </Text>
      </View>

      {/* Footer band — 3 métricas en línea */}
      <View style={[styles.titularFooter, { borderTopColor: 'rgba(255,255,255,0.10)' }]}>
        <FooterMetric
          label="pagado"
          value={formatMoney(props.montoPagado)}
          accent={theme.colors.heroAccent}
        />
        <View style={styles.titularFooterDivider} />
        <FooterMetric
          label="libre"
          value={formatMoney(props.dineroLibre)}
          accent={theme.colors.heroText}
        />
        <View style={styles.titularFooterDivider} />
        <FooterMetric
          label="del sueldo"
          value={`${props.pctSueldo}%`}
          accent={theme.colors.heroMuted}
        />
      </View>

      {/* Línea final: el próximo */}
      <View style={styles.titularNext}>
        <MaterialIcons name="arrow-forward" size={13} color={theme.colors.heroAccent} />
        <Text style={[styles.titularNextLabel, { color: theme.colors.heroAccent }]}>
          PRÓXIMO
        </Text>
        <Text style={[styles.titularNextBody, { color: theme.colors.heroText }]}>
          {props.nextItem.name} en {props.nextItem.days} días · {formatMoney(props.nextItem.amount)}
        </Text>
      </View>
    </HeroShell>
  )
}

function resolveHeadline(props: SampleProps): {
  line1: string
  line2: string
  subhead: string
  color: string
} {
  if (props.cantidadVencidos > 0) {
    return {
      line1: `Tenés ${props.cantidadVencidos} fijos`,
      line2: 'vencidos.',
      subhead: `${formatMoney(props.montoVencido)} en atraso. Es lo primero a resolver.`,
      color: '#FFB59E', // peach-strong para urgencia sobre forest
    }
  }
  if (props.cantidadPorPagarTotal > 0) {
    return {
      line1: `Te quedan ${props.cantidadPorPagarTotal}`,
      line2: 'fijos por pagar.',
      subhead: `${formatMoney(props.montoPorPagarTotal)} en lo que resta del ciclo.`,
      color: '#F2EAD3', // cream foundation
    }
  }
  return {
    line1: 'Estás al día.',
    line2: '',
    subhead: 'Próximo fijo: Netflix en 3 días.',
    color: '#A6EF8F',
  }
}

function FooterMetric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.titularFooterCol}>
      <Text style={[styles.titularFooterLabel, { color: theme.colors.heroMuted2 }]}>
        {label}
      </Text>
      <Text style={[styles.titularFooterValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// 🅱 VARIANT B — Pasaje del ciclo
// ─────────────────────────────────────────────────────────────────
// Boarding pass aesthetic. El pay-cycle ES un viaje de payday a
// payday. ABR → MAY route, today es el sello de embarque. Fijos
// son las "paradas" en el camino. Universal, memorable, tactil.

function PasajeHero(props: SampleProps) {
  const { theme } = useAppTheme()
  const todayPct = (props.cycleDayIndex / props.cycleDays) * 100

  return (
    <HeroShell>
      {/* Top strip: brand + label */}
      <View style={styles.pasajeTop}>
        <View style={styles.pasajeBrandRow}>
          <View style={[styles.pasajeBrandSquare, { backgroundColor: theme.colors.heroAccent }]} />
          <Text style={[styles.pasajeBrandText, { color: theme.colors.heroAccent }]}>
            MANIFIESTO
          </Text>
        </View>
        <Text style={[styles.pasajeLabel, { color: theme.colors.heroMuted2 }]}>
          PASAJE DEL CICLO
        </Text>
      </View>

      {/* Route: ABR ◇──── ● ──── MAY */}
      <View style={styles.pasajeRoute}>
        {/* Origen */}
        <View style={styles.pasajeStation}>
          <Text style={[styles.pasajeStationCode, { color: theme.colors.heroText }]}>
            {props.monthShort}
          </Text>
          <Text style={[styles.pasajeStationDate, { color: theme.colors.heroMuted2 }]}>
            05
          </Text>
        </View>

        {/* Route line con today marker */}
        <View style={styles.pasajeRouteLine}>
          {/* Dashed track full width */}
          <View style={styles.pasajeRouteDashes}>
            {[...Array(28)].map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pasajeRouteDash,
                  {
                    backgroundColor:
                      (i / 28) * 100 < todayPct
                        ? theme.colors.heroAccent
                        : 'rgba(242,234,211,0.30)',
                  },
                ]}
              />
            ))}
          </View>
          {/* Today marker — abs positioned at progress */}
          <View
            style={[
              styles.pasajeTodayMarker,
              {
                left: `${todayPct}%`,
                backgroundColor: theme.colors.heroAccent,
                borderColor: theme.colors.heroText,
              },
            ]}
          />
          {/* Today label below */}
          <Text
            style={[
              styles.pasajeTodayLabel,
              { color: theme.colors.heroAccent, left: `${Math.max(0, todayPct - 10)}%` },
            ]}
          >
            HOY · día {props.cycleDayIndex}
          </Text>
        </View>

        {/* Destino */}
        <View style={styles.pasajeStation}>
          <Text style={[styles.pasajeStationCode, { color: theme.colors.heroText }]}>
            {props.monthShortNext}
          </Text>
          <Text style={[styles.pasajeStationDate, { color: theme.colors.heroMuted2 }]}>
            05
          </Text>
        </View>
      </View>

      {/* Ticket info — 3 cols */}
      <View style={styles.pasajeTicketInfo}>
        <PasajeCol
          label="PAGADO"
          big={formatMoney(props.montoPagado)}
          small={`${props.cantidadPagados} ítems`}
          color={theme.colors.heroAccent}
        />
        <PasajeCol
          label="PRÓXIMO"
          big={props.nextItem.name}
          small={`en ${props.nextItem.days} días · ${formatMoney(props.nextItem.amount)}`}
          color={theme.colors.heroText}
        />
        <PasajeCol
          label="POR PAGAR"
          big={formatMoney(props.montoPorPagarTotal)}
          small={`${props.cantidadPorPagarTotal} ítems`}
          color="#F2A78C"
          alignRight
        />
      </View>

      {/* Perforación del ticket stub */}
      <View style={styles.pasajePerforation}>
        <View style={[styles.pasajePerfNotchLeft, { backgroundColor: theme.colors.heroGradient[0] }]} />
        <View style={styles.pasajePerfDashes}>
          {[...Array(20)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.pasajePerfDash,
                { backgroundColor: 'rgba(242,234,211,0.30)' },
              ]}
            />
          ))}
        </View>
        <View style={[styles.pasajePerfNotchRight, { backgroundColor: theme.colors.heroGradient[0] }]} />
      </View>

      {/* Stub band — estado + libre */}
      <View style={styles.pasajeStub}>
        <View>
          <Text style={[styles.pasajeStubLabel, { color: theme.colors.heroMuted2 }]}>
            ESTADO
          </Text>
          <View style={styles.pasajeStubStatus}>
            {props.cantidadVencidos > 0 ? (
              <>
                <View style={[styles.pasajeStubDot, { backgroundColor: '#F06A6A' }]} />
                <Text style={[styles.pasajeStubText, { color: '#F2A78C' }]}>
                  {props.cantidadVencidos} vencidos · {formatMoney(props.montoVencido)}
                </Text>
              </>
            ) : (
              <Text style={[styles.pasajeStubText, { color: theme.colors.heroAccent }]}>
                Al día
              </Text>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.pasajeStubLabel, { color: theme.colors.heroMuted2 }]}>
            LIBRE DEL CICLO
          </Text>
          <Text style={[styles.pasajeStubBig, { color: theme.colors.heroText }]}>
            {formatMoney(props.dineroLibre)}
          </Text>
          <Text style={[styles.pasajeStubSmall, { color: theme.colors.heroMuted }]}>
            {props.pctSueldo}% del sueldo a fijos
          </Text>
        </View>
      </View>
    </HeroShell>
  )
}

function PasajeCol({
  label,
  big,
  small,
  color,
  alignRight,
}: {
  label: string
  big: string
  small: string
  color: string
  alignRight?: boolean
}) {
  const { theme } = useAppTheme()
  return (
    <View style={[styles.pasajeCol, alignRight ? { alignItems: 'flex-end' } : null]}>
      <Text style={[styles.pasajeColLabel, { color: theme.colors.heroMuted2 }]}>
        {label}
      </Text>
      <Text
        style={[styles.pasajeColBig, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {big}
      </Text>
      <Text style={[styles.pasajeColSmall, { color: theme.colors.heroMuted }]}>
        {small}
      </Text>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────
// 🅲 VARIANT C — Manifiesto Diario (carousel)
// ─────────────────────────────────────────────────────────────────
// Mini-Wrapped en el hero. 3 páginas auto-rotando cada 5s, gramática
// stories (progress bars top + brand mark + single statement). Cada
// página = una sentencia clara. Editorial restraint puro.

function ManifiestoBase({
  children,
  activePage,
}: {
  children: React.ReactNode
  activePage: 0 | 1 | 2
}) {
  const { theme } = useAppTheme()
  return (
    <HeroShell variant="paper">
      {/* Progress bars Wrapped-grammar */}
      <View style={styles.manifProgressRow}>
        {[0, 1, 2].map((idx) => (
          <View
            key={idx}
            style={[
              styles.manifProgressTrack,
              {
                backgroundColor: theme.isDark
                  ? 'rgba(242,234,211,0.18)'
                  : 'rgba(15,46,31,0.16)',
              },
            ]}
          >
            <View
              style={[
                styles.manifProgressFill,
                {
                  width:
                    idx < activePage ? '100%' : idx === activePage ? '60%' : '0%',
                  backgroundColor: theme.isDark ? '#A6EF8F' : '#1F590D',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Brand mark */}
      <Text
        style={[
          styles.manifBrand,
          { color: theme.isDark ? 'rgba(244,253,242,0.65)' : 'rgba(15,46,31,0.62)' },
        ]}
      >
        MANIFIESTO · {SAMPLE.monthLong.toUpperCase()}
      </Text>

      {/* Stage */}
      <View style={styles.manifStage}>{children}</View>
    </HeroShell>
  )
}

function ManifiestoPage1(props: SampleProps) {
  const { theme } = useAppTheme()
  const fg = theme.isDark ? '#F4FDF2' : '#0F2E1F'
  const fgSoft = theme.isDark ? 'rgba(244,253,242,0.72)' : 'rgba(15,46,31,0.72)'
  const accent = theme.isDark ? '#A6EF8F' : '#1F590D'
  return (
    <ManifiestoBase activePage={0}>
      <Text style={[styles.manifEyebrow, { color: fgSoft }]}>HOY</Text>
      <Text style={[styles.manifHero, { color: fg }]} accessibilityRole="header">
        {props.cantidadPorPagarTotal} fijos
      </Text>
      <Text style={[styles.manifHero, { color: fg }]}>
        por pagar.
      </Text>
      <View style={[styles.manifRule, { backgroundColor: accent }]} />
      <Text style={[styles.manifKicker, { color: fgSoft }]}>
        {formatMoney(props.montoPorPagarTotal)} en lo que resta del ciclo.
        {props.cantidadVencidos > 0
          ? ` ${props.cantidadVencidos} vencidos.`
          : ''}
      </Text>
    </ManifiestoBase>
  )
}

function ManifiestoPage2(props: SampleProps) {
  const { theme } = useAppTheme()
  const fg = theme.isDark ? '#F4FDF2' : '#0F2E1F'
  const fgSoft = theme.isDark ? 'rgba(244,253,242,0.72)' : 'rgba(15,46,31,0.72)'
  const accent = theme.isDark ? '#A6EF8F' : '#1F590D'
  return (
    <ManifiestoBase activePage={1}>
      <Text style={[styles.manifEyebrow, { color: fgSoft }]}>PRÓXIMO</Text>
      <Text style={[styles.manifHero, { color: fg }]} accessibilityRole="header">
        {props.nextItem.name}
      </Text>
      <Text style={[styles.manifHero, { color: fg }]}>
        en {props.nextItem.days} días.
      </Text>
      <View style={[styles.manifRule, { backgroundColor: accent }]} />
      <Text style={[styles.manifKicker, { color: fgSoft }]}>
        {formatMoney(props.nextItem.amount)} · este {props.nextItem.dayOfWeek}.
      </Text>
    </ManifiestoBase>
  )
}

function ManifiestoPage3(props: SampleProps) {
  const { theme } = useAppTheme()
  const fg = theme.isDark ? '#F4FDF2' : '#0F2E1F'
  const fgSoft = theme.isDark ? 'rgba(244,253,242,0.72)' : 'rgba(15,46,31,0.72)'
  const accent = theme.isDark ? '#A6EF8F' : '#1F590D'
  return (
    <ManifiestoBase activePage={2}>
      <Text style={[styles.manifEyebrow, { color: fgSoft }]}>CICLO ABRIL</Text>
      <Text style={[styles.manifHero, { color: fg }]} accessibilityRole="header">
        {props.daysRemaining} días
      </Text>
      <Text style={[styles.manifHero, { color: fg }]}>restantes.</Text>
      <View style={[styles.manifRule, { backgroundColor: accent }]} />
      <Text style={[styles.manifKicker, { color: fgSoft }]}>
        Vas {props.paidPct}% pagado. Libre {formatMoney(props.dineroLibre)}.
      </Text>
    </ManifiestoBase>
  )
}

// ─────────────────────────────────────────────────────────────────
// Variant label
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
  carouselNote: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  carouselNoteText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#5C6962',
    lineHeight: 15,
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

  // Variant label
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

  // Shared card shell
  card: {
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 22,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardPaper: {
    borderWidth: 0,
    padding: 24,
    minHeight: 280,
  },

  // 🅰 — Titular
  titularEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  titularBrand: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  titularSep: {
    fontSize: 11,
    fontWeight: '700',
  },
  titularEdition: {
    fontSize: 11,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  titularDays: {
    fontSize: 11,
    fontWeight: '600',
  },
  titularRule: {
    width: 32,
    height: 2,
    marginBottom: 18,
  },
  titularHeadlineBlock: {
    marginBottom: 22,
  },
  titularHeadline: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.4,
    lineHeight: 38,
  },
  titularSubheadline: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 19,
    marginTop: 10,
    maxWidth: 280,
  },
  titularFooter: {
    flexDirection: 'row',
    paddingTop: 14,
    borderTopWidth: 1,
    marginBottom: 12,
  },
  titularFooterCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  titularFooterDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 4,
  },
  titularFooterLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  titularFooterValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  titularNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  titularNextLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  titularNextBody: {
    fontSize: 12,
    fontWeight: '600',
  },

  // 🅱 — Pasaje
  pasajeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  pasajeBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pasajeBrandSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  pasajeBrandText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
  },
  pasajeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  pasajeRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  pasajeStation: {
    alignItems: 'center',
  },
  pasajeStationCode: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  pasajeStationDate: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  pasajeRouteLine: {
    flex: 1,
    height: 26,
    justifyContent: 'center',
    position: 'relative',
  },
  pasajeRouteDashes: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 1.5,
    gap: 2,
  },
  pasajeRouteDash: {
    flex: 1,
    height: 1.5,
  },
  pasajeTodayMarker: {
    position: 'absolute',
    top: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginLeft: -7,
  },
  pasajeTodayLabel: {
    position: 'absolute',
    top: 22,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  pasajeTicketInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 8,
  },
  pasajeCol: {
    flex: 1,
  },
  pasajeColLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  pasajeColBig: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  pasajeColSmall: {
    fontSize: 11,
    marginTop: 2,
  },
  pasajePerforation: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 14,
    marginHorizontal: -22, // bleed to card edges
    marginBottom: 14,
  },
  pasajePerfNotchLeft: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
  },
  pasajePerfNotchRight: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: -7,
  },
  pasajePerfDashes: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
  },
  pasajePerfDash: {
    flex: 1,
    height: 1,
  },
  pasajeStub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pasajeStubLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  pasajeStubStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pasajeStubDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pasajeStubText: {
    fontSize: 13,
    fontWeight: '700',
  },
  pasajeStubBig: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  pasajeStubSmall: {
    fontSize: 10,
    marginTop: 2,
  },

  // 🅲 — Manifiesto Diario
  manifProgressRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 16,
  },
  manifProgressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  manifProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  manifBrand: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
    marginBottom: 26,
  },
  manifStage: {
    minHeight: 180,
  },
  manifEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.4,
    marginBottom: 14,
  },
  manifHero: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 44,
  },
  manifRule: {
    width: 32,
    height: 2,
    marginTop: 16,
    marginBottom: 10,
  },
  manifKicker: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    maxWidth: 280,
  },
})
