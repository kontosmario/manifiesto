import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { Screen } from '@/components/ui/screen'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { useDbHealth } from '@/features/dev-health/use-db-health'
import { getIntlLocale } from '@/lib/i18n/active-locale'
import { useThemeTokens } from '@/theme/theme-provider'
import { neoInk } from '@/theme/neo-ink'
import { neoMaterial, neoRadii, neoTokens, type NeoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

// @i18n-ignore (dev-only: toda esta pantalla es diagnóstico DB Health gated por __DEV__ —
// labels/títulos/estados en español son copy interno de tooling, NO copy de producción y no se traducen)
export default function DevHealthScreen() {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const ink = neoInk(theme.mode)
  const cardMaterial = neoMaterial(theme.mode)
  // Android < API 28 descarta el boxShadow OUTSET en silencio: sin relieve la
  // card queda del material del fondo y el bloque desaparece.
  const flatFallback = SUPPORTS_INSET_SHADOW
    ? null
    : { borderWidth: 1, borderColor: neo.sheetDivider }
  const { data, isLoading, isError, error, refetch, isRefetching } = useDbHealth()

  return (
    <Screen
      backgroundColor={neo.bg}
      canGoBack
      title="DB Health"
      titleColor={neo.text}
      scrollable={false}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            progressBackgroundColor={neo.surface}
            tintColor={neo.text}
          />
        }
      >
        {isLoading && !data ? (
          <Text style={[styles.status, { color: neo.textMuted }]}>
            Cargando…
          </Text>
        ) : isError ? (
          <View style={[styles.errorCard, cardMaterial, flatFallback]}>
            <Text style={[styles.errorTitle, { color: neo.text }]}>
              No se pudo cargar el snapshot
            </Text>
            <Text style={[styles.errorBody, { color: neo.textMuted }]}>
              {error instanceof Error ? error.message : 'Error desconocido'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refetch()}
              style={({ pressed }) => [
                styles.retryBtn,
                {
                  backgroundColor: ink.accent,
                  boxShadow: neo.shadows.raisedSm,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.retryBtnText, { color: neo.ctaText }]}>Reintentar</Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            {/* ── Resumen ───────────────────────────── */}
            <SectionCard title="Resumen" neo={neo}>
              <Row
                // @i18n-ignore (dev-only: pantalla de diagnóstico DB Health gated por __DEV__, copy interno de tooling)
                label="Tamaño DB"
                value={data.db_size_pretty}
                neo={neo}
              />
              <Row
                label="% del plan Pro (8 GB)"
                value={`${data.limits_pro.db_pct_used.toFixed(1)}%`}
                neo={neo}
              />
              <Row
                label="Computed at"
                value={new Date(data.computed_at).toLocaleString(getIntlLocale())}
                neo={neo}
                isLast
              />
            </SectionCard>

            {/* ── Growth ────────────────────────────── */}
            <SectionCard title="Growth (30 dias)" neo={neo}>
              <Row
                label="Expenses"
                value={String(data.monthly_growth.expenses_30d)}
                neo={neo}
              />
              <Row
                label="Notifications"
                value={String(data.monthly_growth.notifications_30d)}
                neo={neo}
              />
              <Row
                label="Monthly summaries (total)"
                value={String(data.monthly_growth.monthly_summaries_total)}
                neo={neo}
                isLast
              />
            </SectionCard>

            {/* ── Top tablas ────────────────────────── */}
            <SectionCard title="Top tablas por tamano" neo={neo}>
              {data.table_sizes.slice(0, 15).map((t, i) => (
                <Row
                  key={t.table}
                  label={t.table}
                  value={`${fmtBytes(t.total_bytes)} (${t.rows_estimate} rows)`}
                  neo={neo}
                  isLast={i === Math.min(data.table_sizes.length, 15) - 1}
                />
              ))}
            </SectionCard>

            {/* ── Slow queries ──────────────────────── */}
            <SectionCard title="Slow queries top 10" neo={neo}>
              {data.slow_queries_top10.length === 0 ? (
                <Text style={[styles.emptyHint, { color: neo.textMuted }]}>
                  Sin slow queries registradas.
                </Text>
              ) : (
                data.slow_queries_top10.map((q, i) => (
                  <View
                    key={i}
                    style={[
                      styles.slowRow,
                      i < data.slow_queries_top10.length - 1 && {
                        borderBottomWidth: 1.5,
                        borderBottomColor: neo.sheetDivider,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.slowQuery, { color: neo.text }]}
                      numberOfLines={3}
                    >
                      {q.query}
                    </Text>
                    <Text style={[styles.slowMeta, { color: neo.textMuted }]}>
                      {`mean ${q.mean_exec_ms.toFixed(1)}ms · ${q.calls} calls · total ${q.total_ms.toFixed(0)}ms`}
                    </Text>
                  </View>
                ))
              )}
            </SectionCard>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

// ── Section card ──────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
  neo,
}: {
  title: string
  children: React.ReactNode
  neo: NeoTokens
}) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionEyebrow, { color: neo.textMuted }]}>
        {title.toUpperCase()}
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: neo.surface, boxShadow: neo.shadows.raisedLg },
          SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider },
        ]}
      >
        {children}
      </View>
    </View>
  )
}

// ── Row ───────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  neo,
  isLast = false,
}: {
  label: string
  value: string
  neo: NeoTokens
  isLast?: boolean
}) {
  return (
    <View
      style={[
        styles.row,
        !isLast && {
          borderBottomWidth: 1.5,
          borderBottomColor: neo.sheetDivider,
        },
      ]}
    >
      <Text
        style={[styles.rowLabel, { color: neo.textMuted }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[styles.rowValue, { color: neo.text }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  status: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },

  // Error card
  errorCard: {
    borderRadius: neoRadii.card,
    padding: 20,
    gap: 8,
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: -0.1,
  },
  errorBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: neoRadii.pill,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },

  // Section
  sectionBlock: {
    gap: 6,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 1.4,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: neoRadii.card,
    overflow: 'hidden',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
  },
  rowValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'right',
  },

  // Slow queries
  slowRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
  },
  slowQuery: {
    fontSize: 12,
    fontFamily: 'Menlo',
    lineHeight: 16,
  },
  slowMeta: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
    marginTop: 2,
  },

  // Empty hint
  emptyHint: {
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
})
