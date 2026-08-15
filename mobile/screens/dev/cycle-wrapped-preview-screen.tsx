import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { MaterialIcons } from '@expo/vector-icons'
import { Screen } from '@/components/ui/screen'
import { triggerCycleWrapped, type CycleWrappedPayload } from '@/lib/cycle-wrapped-emitter'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Dev-only preview del Wrapped "La Edición" (rediseño 2026-08).
 *
 * Gated por `__DEV__` en su route (`app/(app)/settings/dev/cycle-wrapped.tsx`).
 * Matriz de la spec (design/wrapped-2026-08, sección 3b): MARGEN con y
 * sin meta · EXCEDIDO (plan de recuperación) · JUSTO (flujo de 5) ·
 * replay read-only · miembro sin permiso.
 *
 * Los montos/fechas son el contenido demo del ciclo "Edición Nº 3 ·
 * 20 jun → 19 jul 2026" (README:16 pide respetarlos en previews). Los
 * presets se inyectan por el mismo emitter que el flow real → render
 * path idéntico, cero side-effects en DB (los apply son fakes con 600ms
 * de latencia simulada).
 *
 * Reduced motion se prueba con el toggle del OS (o un device con
 * `deviceYearClass < 2020`, que entra solo). El wrapped SIGUE EL TEMA
 * DEL SISTEMA: probar cada preset en claro Y en oscuro (el toggle de
 * tema de Ajustes alcanza — el spec se resuelve por `useWrappedSpec`).
 *
 * DENSIDAD: por debajo de 800pt de alto de ventana las escenas entran en
 * modo `compact` (aire al 60 %, bloques fijos al 82 %). Para verlo sin un
 * iPhone SE a mano: simulador con "iPhone SE (3rd gen)", o rotar a
 * horizontal. Por encima de 800 la composición es la del handoff, intacta.
 */
export function CycleWrappedPreviewScreen() {
  const { theme } = useAppTheme()

  return (
    <Screen
      title="Preview · Cierre de ciclo"
      // @i18n-ignore (dev-only: pantalla de preview gated por __DEV__, copy interno de tooling)
      subtitle="La Edición con datos sintéticos del handoff. Mismo path que el flow real."
      canGoBack
    >
      <View style={styles.stack}>
        <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
          MATRIZ DE ESTADOS
        </Text>

        {PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            onPress={() => {
              void triggerHaptic('selection')
              triggerCycleWrapped(preset.build())
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
            <View style={[styles.iconWrap, { backgroundColor: preset.accent.bg }]}>
              <MaterialIcons name={preset.icon} size={20} color={preset.accent.fg} />
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
            • Usuario confirma cobro en la `SalaryConfirmationSheet` (o el
            ciclo dinámico cierra solo).{'\n'}
            • Trigger SQL cierra el ciclo y upserta `monthly_summaries`.{'\n'}
            • Mobile espera 700ms + refetch → summary más reciente +
            decisión + estantería (`fetchWrappedShelf`).{'\n'}
            {'• Si `expenses_count > 0` → `triggerCycleWrapped(payload)`.\n'}
            • `CycleWrappedBridge` (último hermano del `AppStackShell`)
            renderea el modal nocturno.
          </Text>
        </View>
      </View>
    </Screen>
  )
}

// ── Presets sintéticos (matriz 3b del handoff) ───────────────────────

interface Preset {
  id: string
  title: string
  subtitle: string
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  accent: { bg: string; fg: string }
  /** Builder (no objeto): los fakes de apply son closures con estado. */
  build: () => CycleWrappedPayload
}

/** Latencia simulada de los RPC fakes del preview. */
const FAKE_RPC_MS = 600
const fakeApply = () =>
  new Promise<void>((resolve) => setTimeout(resolve, FAKE_RPC_MS))

/** Base demo: "Edición Nº 3 · 20 jun → 19 jul 2026" (README:16). */
function baseEdicion3(): CycleWrappedPayload {
  return {
    periodLabel: 'Junio 2026',
    periodRange: '20 jun – 19 jul',
    periodRangeDisplay: '20 jun → 19 jul',
    selloRango: 'JUNIO → JULIO 2026',
    cycleDays: 30,
    editionNumber: 3,
    totalSpent: 3_008_920,
    monthlyIncome: 3_333_537,
    savingsDelta: 324_617,
    expensesCount: 64,
    deltaVsPreviousPercent: -8,
    topCategory: { name: 'Hogar', amount: 710_352, share: 0.24 },
    topCategories: [
      { name: 'Hogar', amount: 710_352, share: 0.24 },
      { name: 'Transferencia', amount: 690_000, share: 0.23 },
      { name: 'Mercado', amount: 487_406, share: 0.16 },
    ],
    fixedPaidCount: 16,
    totalFixedSpent: 1_350_482,
    previousCycle: { label: 'Mayo 2026', saldo: -1_588_087 },
    shelf: {
      previous: [
        { label: 'Mayo 2026', saldo: -1_588_087 },
        { label: 'Abril 2026', saldo: 1_727_195 },
      ],
      accumulatedSaved: 463_725,
      totalEditions: 3,
    },
    topExpense: {
      description: 'Compra mensual',
      price: 240_000,
      occurredAt: '2026-07-02',
    },
    achievementsEarnedInCycle: 2,
    mood: 'great',
    canDecide: true,
  }
}

// @i18n-ignore (dev-only: presets sintéticos para el preview gated por __DEV__, no es copy de producción)
const PRESETS: Preset[] = [
  {
    id: 'margen-meta',
    title: 'MARGEN · con meta activa',
    subtitle: '+$324.617 · destino con barra de meta · confirmación fake 600ms',
    icon: 'trending-up',
    accent: { bg: 'rgba(60,150,40,0.16)', fg: '#1F590D' },
    build: () => ({
      ...baseEdicion3(),
      pendingLeftoverDecision: { monthlySummaryId: 'preview-3', sobrante: 324_617 },
      activeGoal: {
        id: 'preview-goal',
        title: 'Vacaciones 2027',
        emoji: '🎯',
        currentAmount: 1_200_000,
        goalAmount: 3_000_000,
      },
      nextCycleAnchor: '2026-07-20',
      onApplyLeftoverDecision: fakeApply,
    }),
  },
  {
    id: 'margen-sin-meta',
    title: 'MARGEN · sin meta',
    subtitle: 'Default "Reservar aparte" (README:46) · sin barra de meta',
    icon: 'savings',
    accent: { bg: 'rgba(60,150,40,0.16)', fg: '#1F590D' },
    build: () => ({
      ...baseEdicion3(),
      pendingLeftoverDecision: { monthlySummaryId: 'preview-3', sobrante: 324_617 },
      activeGoal: null,
      nextCycleAnchor: '2026-07-20',
      onApplyLeftoverDecision: fakeApply,
    }),
  },
  {
    id: 'excedido',
    title: 'EXCEDIDO · plan de recuperación',
    subtitle: '−$1.588.087 · Brot worried, sin partículas · cubrir/ajustar/revisar',
    icon: 'trending-down',
    accent: { bg: 'rgba(232,151,106,0.20)', fg: '#C25A3E' },
    build: () => ({
      ...baseEdicion3(),
      periodLabel: 'Mayo 2026',
      periodRangeDisplay: '20 may → 19 jun',
      selloRango: 'MAYO → JUNIO 2026',
      editionNumber: 2,
      totalSpent: 4_921_624,
      savingsDelta: -1_588_087,
      deltaVsPreviousPercent: 18,
      previousCycle: { label: 'Abril 2026', saldo: 1_727_195 },
      shelf: {
        previous: [{ label: 'Abril 2026', saldo: 1_727_195 }],
        accumulatedSaved: 463_725,
        totalEditions: 2,
      },
      reserveAvailable: 324_617,
      onApplyReserve: fakeApply,
      mood: 'over',
    }),
  },
  {
    id: 'justo',
    title: 'JUSTO · flujo de 5',
    subtitle: '+$8.412 · estampa crema, sin fiesta · el paso 6 se salta',
    icon: 'horizontal-rule',
    accent: { bg: 'rgba(60,60,60,0.10)', fg: '#3A3A3A' },
    build: () => ({
      ...baseEdicion3(),
      savingsDelta: 8_412,
      totalSpent: 3_325_125,
      mood: 'ok',
    }),
  },
  {
    id: 'replay',
    title: 'Replay · decisión pasada (meta)',
    subtitle: 'Paso 6 en modo lectura · "Decidiste el 20/7/2026"',
    icon: 'replay',
    accent: { bg: 'rgba(90,110,200,0.14)', fg: '#3D4C9E' },
    build: () => ({
      ...baseEdicion3(),
      pastLeftoverDecision: {
        decision: 'meta',
        sobrante: 324_617,
        metaGoalTitle: 'Vacaciones 2027',
        decidedAt: '2026-07-20T12:00:00Z',
      },
      activeGoal: {
        id: 'preview-goal',
        title: 'Vacaciones 2027',
        emoji: '🎯',
        currentAmount: 1_524_617,
        goalAmount: 3_000_000,
      },
    }),
  },
  {
    id: 'no-owner',
    title: 'Miembro · sin permiso de decidir',
    subtitle: 'Opciones inertes + aviso "la confirma el dueño" + CTA Seguir',
    icon: 'lock-outline',
    accent: { bg: 'rgba(60,60,60,0.10)', fg: '#3A3A3A' },
    build: () => ({
      ...baseEdicion3(),
      canDecide: false,
      pendingLeftoverDecision: { monthlySummaryId: 'preview-3', sobrante: 324_617 },
      activeGoal: {
        id: 'preview-goal',
        title: 'Vacaciones 2027',
        emoji: '🎯',
        currentAmount: 1_200_000,
        goalAmount: 3_000_000,
      },
      nextCycleAnchor: '2026-07-20',
      onApplyLeftoverDecision: fakeApply,
    }),
  },
]

const styles = StyleSheet.create({
  stack: { gap: 14 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: nunitoFamily('500'),
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
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  cheatBody: {
    fontSize: 12,
    lineHeight: 18,
  },
})
