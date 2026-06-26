import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated from 'react-native-reanimated'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { ErrorState } from '@/components/ui/error-state'
import { EmptyState } from '@/components/ui/empty-state'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useFamily } from '@/features/family/use-family'
import { useCategories } from '@/features/categories/use-categories'
import { useMonthlyEditions } from '@/features/wrapped/use-monthly-editions'
import { computeCycleSurplusSigned } from '@/features/month-close/sobrante'
import { buildWrappedPayloadFromSummary } from '@/features/wrapped/build-wrapped-payload'
import { triggerCycleWrapped } from '@/lib/cycle-wrapped-emitter'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import type { MonthlySummaryHistory } from '@/features/insights/control-v2-adapter'

/**
 * "Ediciones" — el archivo persistente de Manifiesto Wrappeds.
 *
 * Filosofía:
 *   El Wrapped post-cobro es un momento; el archivo lo convierte en
 *   colección. Cada ciclo cerrado queda guardado como una "edición"
 *   que el usuario puede revisitar — tap → reproduce el Wrapped
 *   completo via el emitter singleton.
 *
 * Diseño (aplicados /impeccable, /emil-design-eng, /ui-ux-pro-max):
 *   - Hero: total ahorrado YTD + count, CountUp animado. NO es el
 *     hero-metric template SaaS — es una declaración tipo masthead.
 *   - Row list editorial: month label como display 18pt, period range
 *     como caption, savings delta como hero-corner 22pt color-coded.
 *     Sin cards on cards, sin side-stripe borders (impeccable bans).
 *   - usePressScale 0.97 en cada row (Emil "buttons must feel responsive").
 *   - Stagger 40ms entre rows.
 *   - Tier dots inline (margen / empatado / excedido) para escaneo
 *     visual sin recurrir a iconografía pesada.
 *   - Touch-target ≥56pt vertical, gap ≥8 entre rows (UX critical).
 */
export function EditionsScreen() {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const { data: session } = useAuthSession()
  const userId = session?.user?.id
  const { data: family } = useFamily(userId)
  const familyId = family?.familyId

  const { editions, isLoading, error } = useMonthlyEditions(familyId)
  const categoriesQuery = useCategories(familyId)

  // Category id → name lookup. Algunos breakdown rows traen `name`
  // directo del rollup; otros (legacy record shape) solo `category_id`
  // — el lookup cubre ambos casos.
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const cat of categoriesQuery.data ?? []) {
      map.set(cat.id, cat.displayName)
    }
    return map
  }, [categoriesQuery.data])

  // Sobrante POR CICLO (no suma corrida — fix 2026-06-22): cada edición muestra
  // lo que quedó en la cuenta = (sueldo + income extra del ciclo) − gasto −
  // ahorro comprometido, CON signo (margen / excedido / empatado). El income
  // extra (`extra_income`) incluye los arrastres de "acumular" previos (el
  // "Sobrante de [mes]" ya sumado a ESTE ciclo como income_event), así el
  // saldo encadena solo — NO hace falta sumar corrida. Caso real: Mayo =
  // 6.4M sueldo + 1.727M arrastre − 7.99M gasto = +130k (lo que quedó en la
  // cuenta). El masthead muestra el sobrante del último ciclo cerrado = saldo
  // actual.
  const { sobranteById, latestSobrante } = useMemo(() => {
    const map = new Map<string, number>()
    let latest = 0
    let latestStart = ''
    for (const e of editions) {
      const sobrante = computeCycleSurplusSigned(e)
      map.set(e.id, sobrante)
      const start = String(e.period_start ?? '')
      if (start >= latestStart) {
        latestStart = start
        latest = sobrante
      }
    }
    return { sobranteById: map, latestSobrante: latest }
  }, [editions])

  const handleEditionPress = (summary: MonthlySummaryHistory) => {
    void triggerHaptic('selection')
    triggerCycleWrapped(
      buildWrappedPayloadFromSummary({
        summary,
        categoryNameById,
        achievementsEarnedAt: [],
      }),
    )
  }

  if (error && editions.length === 0) {
    return (
      <Screen
        backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
        title={t('billing:editions.title')}
        canGoBack
      >
        <ErrorState
          title={t('billing:editions.errorTitle')}
          description={t('billing:editions.errorDescription')}
        />
      </Screen>
    )
  }

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      title={t('billing:editions.title')}
      subtitle={t('billing:editions.subtitle')}
      canGoBack
    >
      <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />
      {isLoading ? null : editions.length === 0 ? (
        <RiseView>
          <EmptyState
            icon="auto-stories"
            title={t('billing:editions.emptyTitle')}
            subtitle={t('billing:editions.emptySubtitle')}
          />
        </RiseView>
      ) : (
        <View style={styles.stack}>
          <RiseView>
            <Masthead savedTotal={latestSobrante} cycleCount={editions.length} />
          </RiseView>

          <View style={styles.list}>
            {editions.map((ed, idx) => (
              <RiseView key={ed.id} delay={Math.min(80 + idx * 40, 480)}>
                <EditionRow
                  edition={ed}
                  sobrante={sobranteById.get(ed.id) ?? 0}
                  onPress={() => handleEditionPress(ed)}
                />
              </RiseView>
            ))}
          </View>
        </View>
      )}
    </Screen>
  )
}

// ── Masthead ─────────────────────────────────────────────────────────

interface MastheadProps {
  savedTotal: number
  cycleCount: number
}

function Masthead({ savedTotal, cycleCount }: MastheadProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  return (
    <View
      style={[
        styles.masthead,
        {
          backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <Text
        style={[styles.mastheadEyebrow, { color: theme.colors.textMuted }]}
      >
        {t('billing:editions.mastheadEyebrow')}
      </Text>
      <CountUpText
        value={savedTotal}
        duration={1400}
        format={(n) => formatMoney(Math.round(n))}
        style={[styles.mastheadAmount, { color: theme.colors.text }]}
      />
      <View style={styles.mastheadFooter}>
        <View
          style={[
            styles.mastheadRule,
            { backgroundColor: theme.colors.primary },
          ]}
        />
        <Text style={[styles.mastheadCaption, { color: theme.colors.textMuted }]}>
          {t('billing:editions.mastheadCaption', { count: cycleCount })}
        </Text>
      </View>
    </View>
  )
}

// ── Edition row ──────────────────────────────────────────────────────

interface EditionRowProps {
  edition: MonthlySummaryHistory
  /** Sobrante del ciclo CON signo = lo que quedó en la cuenta (sueldo + income
   *  extra del ciclo − gasto − ahorro comprometido). El tono/label van por su
   *  signo: margen (+) / excedido (−) / empatado (0). */
  sobrante: number
  onPress: () => void
}

function EditionRow({ edition, sobrante, onPress }: EditionRowProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const press = usePressScale({ pressedScale: 0.97 })

  const tone = resolveTone(sobrante, theme.isDark)
  const toneLabel = t(`billing:editions.${tone.labelKey}`)
  const range = useMemo(
    () => buildShortRange(edition.period_start, edition.period_end),
    [edition.period_start, edition.period_end],
  )

  // Sign + absolute amount para que el número sea legible (un "−$80k"
  // se lee mejor que "-$80,000"). Usamos el sign unicode largo en
  // lugar del hyphen-minus.
  const sign = sobrante > 0 ? '+' : sobrante < 0 ? '−' : ''
  const amountAbs = Math.abs(sobrante)

  return (
    <Animated.View style={press.animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel={t('billing:editions.reviveLabel', {
          label: edition.period_label,
          tone: toneLabel,
        })}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
            borderColor: theme.colors.line,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        {/* Tier dot — small, but it's the at-a-glance scanner */}
        <View style={[styles.tierDot, { backgroundColor: tone.dotColor }]} />

        <View style={styles.rowBody}>
          <Text
            style={[styles.rowTitle, { color: theme.colors.text }]}
            numberOfLines={1}
          >
            {edition.period_label}
          </Text>
          <View style={styles.rowMeta}>
            {range ? (
              <Text
                style={[styles.rowMetaText, { color: theme.colors.textMuted }]}
              >
                {range}
              </Text>
            ) : null}
            <Text
              style={[
                styles.rowMetaText,
                { color: theme.colors.textMuted },
              ]}
            >
              {edition.expenses_count}{' '}
              {t('billing:editions.movements', { count: edition.expenses_count })}
            </Text>
          </View>
        </View>

        <View style={styles.rowAmountWrap}>
          <Text style={[styles.rowAmount, { color: tone.amountColor }]}>
            {sign}
            {formatMoney(Math.round(amountAbs))}
          </Text>
          <Text
            style={[styles.rowAmountLabel, { color: theme.colors.textMuted }]}
          >
            {toneLabel}
          </Text>
        </View>

        <MaterialIcons
          name="chevron-right"
          size={20}
          color={theme.colors.textMuted}
        />
      </Pressable>
    </Animated.View>
  )
}

// ── Tone resolver ────────────────────────────────────────────────────

interface RowTone {
  dotColor: string
  amountColor: string
  /** Key relativa al namespace billing (resuelta con t en el componente). */
  labelKey: 'toneMargin' | 'toneExceeded' | 'toneEven'
}

function resolveTone(delta: number, isDark: boolean): RowTone {
  if (delta > 0) {
    return {
      dotColor: isDark ? '#A6EF8F' : '#1F590D',
      amountColor: isDark ? '#A6EF8F' : '#10410A',
      labelKey: 'toneMargin',
    }
  }
  if (delta < 0) {
    return {
      dotColor: isDark ? '#F2A78C' : '#B84014',
      amountColor: isDark ? '#F2A78C' : '#8E2A0C',
      labelKey: 'toneExceeded',
    }
  }
  return {
    dotColor: isDark ? '#C3D2C9' : '#3B6D57',
    amountColor: isDark ? '#F4FDF2' : '#12211A',
    labelKey: 'toneEven',
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

interface ParsedISO {
  year: number
  month: number
  day: number
}

function parseISO(iso: string | null | undefined): ParsedISO | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

const MES_ABBR = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

/** Display range — solo si el ciclo no es calendario (1→1). */
function buildShortRange(start: string, end: string): string | null {
  const s = parseISO(start)
  const e = parseISO(end)
  if (!s || !e) return null
  if (s.day === 1 && e.day === 1) return null
  // periodEnd es exclusivo → display restando un día.
  const lastDay = new Date(e.year, e.month - 1, e.day)
  lastDay.setDate(lastDay.getDate() - 1)
  return `${s.day} ${MES_ABBR[s.month - 1]} – ${lastDay.getDate()} ${MES_ABBR[lastDay.getMonth()]}`
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  stack: { gap: 24 },

  // Masthead — magazine title block, editorial feel
  masthead: {
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: 22,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
  },
  mastheadEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  mastheadAmount: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  mastheadFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mastheadRule: {
    width: 24,
    height: 2,
    borderRadius: 999,
  },
  mastheadCaption: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // List of editions
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 64,
  },
  tierDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rowMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowMetaText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  rowAmountWrap: {
    alignItems: 'flex-end',
    gap: 1,
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  rowAmountLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
})
