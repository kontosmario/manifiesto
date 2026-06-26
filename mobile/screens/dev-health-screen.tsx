import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Screen } from '@/components/ui/screen'
import { useDbHealth } from '@/features/dev-health/use-db-health'
import { getIntlLocale } from '@/lib/i18n/active-locale'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

// @i18n-ignore (dev-only: toda esta pantalla es diagnóstico DB Health gated por __DEV__ —
// labels/títulos/estados en español son copy interno de tooling, NO copy de producción y no se traducen)
export default function DevHealthScreen() {
  const { theme } = useAppTheme()
  const { data, isLoading, isError, error, refetch, isRefetching } = useDbHealth()

  return (
    <Screen
      canGoBack
      title="DB Health"
      scrollable={false}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        {isLoading && !data ? (
          <Text style={[styles.status, { color: theme.colors.textMuted }]}>
            Cargando…
          </Text>
        ) : isError ? (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
              No se pudo cargar el snapshot
            </Text>
            <Text style={[styles.errorBody, { color: theme.colors.textMuted }]}>
              {error instanceof Error ? error.message : 'Error desconocido'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refetch()}
              style={({ pressed }) => [
                styles.retryBtn,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={styles.retryBtnText}>Reintentar</Text>
            </Pressable>
          </View>
        ) : data ? (
          <>
            {/* ── Resumen ───────────────────────────── */}
            <SectionCard title="Resumen" theme={theme}>
              <Row
                // @i18n-ignore (dev-only: pantalla de diagnóstico DB Health gated por __DEV__, copy interno de tooling)
                label="Tamaño DB"
                value={data.db_size_pretty}
                theme={theme}
              />
              <Row
                label="% del plan Pro (8 GB)"
                value={`${data.limits_pro.db_pct_used.toFixed(1)}%`}
                theme={theme}
              />
              <Row
                label="Computed at"
                value={new Date(data.computed_at).toLocaleString(getIntlLocale())}
                theme={theme}
                isLast
              />
            </SectionCard>

            {/* ── Growth ────────────────────────────── */}
            <SectionCard title="Growth (30 dias)" theme={theme}>
              <Row
                label="Expenses"
                value={String(data.monthly_growth.expenses_30d)}
                theme={theme}
              />
              <Row
                label="Notifications"
                value={String(data.monthly_growth.notifications_30d)}
                theme={theme}
              />
              <Row
                label="Monthly summaries (total)"
                value={String(data.monthly_growth.monthly_summaries_total)}
                theme={theme}
                isLast
              />
            </SectionCard>

            {/* ── Top tablas ────────────────────────── */}
            <SectionCard title="Top tablas por tamano" theme={theme}>
              {data.table_sizes.slice(0, 15).map((t, i) => (
                <Row
                  key={t.table}
                  label={t.table}
                  value={`${fmtBytes(t.total_bytes)} (${t.rows_estimate} rows)`}
                  theme={theme}
                  isLast={i === Math.min(data.table_sizes.length, 15) - 1}
                />
              ))}
            </SectionCard>

            {/* ── Slow queries ──────────────────────── */}
            <SectionCard title="Slow queries top 10" theme={theme}>
              {data.slow_queries_top10.length === 0 ? (
                <Text style={[styles.emptyHint, { color: theme.colors.textMuted }]}>
                  Sin slow queries registradas.
                </Text>
              ) : (
                data.slow_queries_top10.map((q, i) => (
                  <View
                    key={i}
                    style={[
                      styles.slowRow,
                      i < data.slow_queries_top10.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.colors.line,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.slowQuery, { color: theme.colors.text }]}
                      numberOfLines={3}
                    >
                      {q.query}
                    </Text>
                    <Text style={[styles.slowMeta, { color: theme.colors.textMuted }]}>
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

type ThemeArg = ReturnType<typeof useAppTheme>['theme']

function SectionCard({
  title,
  children,
  theme,
}: {
  title: string
  children: React.ReactNode
  theme: ThemeArg
}) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={[styles.sectionEyebrow, { color: theme.colors.textMuted }]}>
        {title.toUpperCase()}
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.creamCard,
            borderColor: theme.colors.line,
          },
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
  theme,
  isLast = false,
}: {
  label: string
  value: string
  theme: ThemeArg
  isLast?: boolean
}) {
  return (
    <View
      style={[
        styles.row,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.line,
        },
      ]}
    >
      <Text
        style={[styles.rowLabel, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[styles.rowValue, { color: theme.colors.text }]}
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
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 20,
    gap: 8,
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '700',
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
    borderRadius: radii.md,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F2D06',
  },

  // Section
  sectionBlock: {
    gap: 6,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
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
  },
  rowValue: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
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
    marginTop: 2,
  },

  // Empty hint
  emptyHint: {
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
})
