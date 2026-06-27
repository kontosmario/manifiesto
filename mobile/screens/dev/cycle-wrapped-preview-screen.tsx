import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { triggerCycleWrapped, type CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Dev-only preview screen para el "Manifiesto Wrapped" — el modal
 * que se dispara post-cobro con el recap del ciclo cerrado.
 *
 * Gated por `__DEV__` en su route (`app/(app)/settings/dev/cycle-wrapped.tsx`).
 * Permite previsualizar las 3 variantes de tono (positivo, empatado,
 * excedido) sin esperar al cierre real de un ciclo.
 *
 * Los presets se inyectan vía el mismo singleton emitter que usa el
 * flow real → render path idéntico, cero side-effects en DB.
 */
export function CycleWrappedPreviewScreen() {
  const { theme } = useAppTheme()

  return (
    <Screen
      title="Preview · Cierre de ciclo"
      // @i18n-ignore (dev-only: pantalla de preview gated por __DEV__, copy interno de tooling)
      subtitle="Dispara el Manifiesto Wrapped con datos sintéticos. Mismo path que el flow real post-cobro."
      canGoBack
    >
      <View style={styles.stack}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          ESCENARIOS
        </Text>

        {PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            onPress={() => {
              void triggerHaptic('selection')
              triggerCycleWrapped(preset.payload)
            }}
            accessibilityRole="button"
            accessibilityLabel={`Previsualizar wrapped — ${preset.title}`}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
                opacity: pressed ? 0.86 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: preset.accent.bg },
              ]}
            >
              <MaterialIcons
                name={preset.icon}
                size={20}
                color={preset.accent.fg}
              />
            </View>
            <View style={styles.body}>
              <Text style={[styles.title, { color: theme.colors.text }]}>
                {preset.title}
              </Text>
              <Text
                style={[styles.subtitle, { color: theme.colors.textSoft }]}
                numberOfLines={2}
              >
                {preset.subtitle}
              </Text>
            </View>
            <MaterialIcons
              name="play-circle-outline"
              size={22}
              color={theme.colors.textMuted}
            />
          </Pressable>
        ))}

        <View
          style={[
            styles.cheatsheet,
            { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.line },
          ]}
        >
          <Text style={[styles.cheatTitle, { color: theme.colors.text }]}>
            Cómo se dispara en prod
          </Text>
          <Text style={[styles.cheatBody, { color: theme.colors.textMuted }]}>
            • Usuario confirma cobro en la `SalaryConfirmationSheet`.{'\n'}
            • Upsert de `family_finance.last_salary_confirmed_at`.{'\n'}
            • Trigger SQL `trg_family_finance_salary_confirm` cierra el
            ciclo anterior y upserta `monthly_summaries`.{'\n'}
            • Mobile espera 700ms + refetch `controlIntelligenceQueryKey`
            → lee el summary más reciente.{'\n'}
            {'• Si `expenses_count > 0` → `triggerCycleWrapped(payload)`.\n'}
            • `CycleWrappedBridge` (montado en `AppStackShell`) renderea
            el modal.
          </Text>
        </View>
      </View>
    </Screen>
  )
}

// ── Synthetic presets ────────────────────────────────────────────────

interface Preset {
  id: string
  title: string
  subtitle: string
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  accent: { bg: string; fg: string }
  payload: CycleWrappedPayload
}

// @i18n-ignore (dev-only: presets sintéticos para el preview gated por __DEV__, no es copy de producción)
const PRESETS: Preset[] = [
  {
    id: 'positive',
    title: 'Cerraste con margen',
    // @i18n-ignore (dev-only: subtítulo sintético de preset de preview, no es copy de producción)
    subtitle: 'Ahorraste 28% del ingreso · 12 gastos · -8% vs anterior',
    icon: 'trending-up',
    accent: { bg: 'rgba(60,150,40,0.16)', fg: '#1F590D' },
    payload: {
      periodLabel: 'Abril 2026',
      periodRange: '15 mar – 14 abr',
      totalSpent: 720_000,
      monthlyIncome: 1_000_000,
      savingsDelta: 280_000,
      expensesCount: 12,
      deltaVsPreviousPercent: -8,
      topCategory: {
        name: 'Supermercado',
        amount: 195_000,
        share: 0.27,
      },
      topExpense: {
        description: 'Compra mensual Coto',
        price: 64_500,
        occurredAt: '2026-04-02',
      },
      achievementsEarnedInCycle: 2,
      mood: 'great',
    },
  },
  {
    id: 'even',
    title: 'Cerraste empatado',
    // @i18n-ignore (dev-only: subtítulo sintético de preset de preview, no es copy de producción)
    subtitle: 'Gastaste lo justo · 18 gastos · igual que el anterior',
    icon: 'horizontal-rule',
    accent: { bg: 'rgba(60,60,60,0.10)', fg: '#3A3A3A' },
    payload: {
      periodLabel: 'Marzo 2026',
      periodRange: null,
      totalSpent: 1_000_000,
      monthlyIncome: 1_000_000,
      savingsDelta: 0,
      expensesCount: 18,
      deltaVsPreviousPercent: 0,
      topCategory: {
        name: 'Comida fuera',
        amount: 240_000,
        share: 0.24,
      },
      topExpense: {
        description: 'Cena de cumple',
        price: 38_000,
        occurredAt: '2026-03-22',
      },
      achievementsEarnedInCycle: 0,
      mood: 'ok',
    },
  },
  {
    id: 'over',
    title: 'Cerraste excedido',
    subtitle: 'Te excediste 12% · 26 gastos · +18% vs anterior',
    icon: 'trending-down',
    accent: { bg: 'rgba(232,151,106,0.20)', fg: '#C25A3E' },
    payload: {
      periodLabel: 'Febrero 2026',
      periodRange: '15 ene – 14 feb',
      totalSpent: 1_120_000,
      monthlyIncome: 1_000_000,
      savingsDelta: -120_000,
      expensesCount: 26,
      deltaVsPreviousPercent: 18,
      topCategory: {
        name: 'Salidas',
        amount: 320_000,
        share: 0.286,
      },
      topExpense: {
        description: 'Recital + cena',
        price: 95_000,
        occurredAt: '2026-02-08',
      },
      achievementsEarnedInCycle: 1,
      mood: 'over',
    },
  },
]

const styles = StyleSheet.create({
  stack: { gap: 14 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 64,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 16,
  },
  cheatsheet: {
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  cheatTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cheatBody: {
    fontSize: 12,
    lineHeight: 18,
  },
})
