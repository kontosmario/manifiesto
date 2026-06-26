// Step 2 del wizard add-fijo: summary card + impact (rows + bar +
// libre row + health badge) + calendar drop + reminder toggle +
// "ya pagué la cuota más reciente" toggle (sólo en create + no
// installment). Extraído de `add-fijo-v2-screen.tsx`.
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { RiseView } from '@/components/home/animated/rise-view'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
import {
  FREQ_OPTIONS,
  hexAlpha,
  type FreqChoice,
} from '@/features/fixed-expenses/add-fijo-helpers'
import type { Category as FixedExpenseCategory } from '@/features/categories/use-categories'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'
import { CalendarDropImpact } from './calendar-drop-impact'
import { HealthBadge, ImpactBar, ImpactRow } from './impact-card'

export interface Step2SummaryProps {
  name: string
  amount: number
  selectedCategory: FixedExpenseCategory | undefined
  freqChoice: FreqChoice | null
  cuotaTot: number
  isInstallment: boolean
  totalCuotas: number
  day: number | null
  onChangeDay: (next: number) => void
  // Impact math
  prevTotal: number
  nuevoTotal: number
  pctAntes: number
  pctDespues: number
  deltaPct: number
  libreDespues: number
  monthlyIncome: number
  // Toggles
  notify: boolean
  onToggleNotify: () => void
  /** When `true` the toggle "ya pagué la cuota más reciente" rendea.
   *  Sólo aplica en creación + no-installment. */
  showAlreadyPaidToggle: boolean
  alreadyPaidCurrentCuota: boolean
  onToggleAlreadyPaid: () => void
}

export function Step2Summary(props: Step2SummaryProps) {
  const { theme } = useAppTheme()
  const {
    name,
    amount,
    selectedCategory,
    freqChoice,
    cuotaTot,
    isInstallment,
    totalCuotas,
    day,
    onChangeDay,
    prevTotal,
    nuevoTotal,
    pctAntes,
    pctDespues,
    deltaPct,
    libreDespues,
    monthlyIncome,
    notify,
    onToggleNotify,
    showAlreadyPaidToggle,
    alreadyPaidCurrentCuota,
    onToggleAlreadyPaid,
  } = props

  // Color + glow + veredicto del "te queda libre" según la holgura, con el
  // MISMO umbral del HealthBadge (impact-card.tsx): holgado / ajustado /
  // apretado. Convierte el dato frío en un semáforo emocional.
  const libreTone =
    pctDespues > 70
      ? {
          color: theme.colors.danger,
          glow: theme.colors.danger,
          phrase: 'Cuidado: queda muy poco libre',
        }
      : pctDespues > 50
        ? {
            color: theme.colors.peach,
            glow: theme.colors.peach,
            phrase: 'Va a quedar algo ajustado',
          }
        : {
            color: theme.colors.primary,
            glow: theme.colors.heroAccent,
            phrase: 'Te queda holgado este mes',
          }

  return (
    <Animated.View
      key="step-2"
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(140)}
      layout={LinearTransition.duration(260)}
      style={styles.formStack}
    >
      <RiseView>
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <View
            style={[
              styles.summaryIcon,
              {
                backgroundColor: selectedCategory
                  ? hexAlpha(selectedCategory.color, 0.18)
                  : theme.colors.creamSoft,
                borderColor: selectedCategory
                  ? hexAlpha(selectedCategory.color, 0.34)
                  : theme.colors.line,
              },
            ]}
          >
            <Text style={styles.summaryIconText}>
              {selectedCategory ? pickIconForFixedExpenseCategory(selectedCategory.name) : '📁'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryName, { color: theme.colors.text }]}>{name}</Text>
            <Text style={[styles.summaryMeta, { color: theme.colors.textMuted }]}>
              {selectedCategory?.name ?? 'Sin categoría'} ·{' '}
              {FREQ_OPTIONS.find((f) => f.id === freqChoice)?.label}
              {isInstallment ? ` (${cuotaTot})` : ''}
              {day != null ? ` · día ${day}` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.summaryAmount, { color: theme.colors.text }]}>
              {formatMoney(amount)}
            </Text>
            {isInstallment ? (
              <Text style={[styles.summaryCuotaMeta, { color: theme.colors.textMuted }]}>
                × {cuotaTot} · {formatMoney(totalCuotas)} total
              </Text>
            ) : null}
          </View>
        </View>
      </RiseView>

      <RiseView delay={80}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 8 }]}>
            IMPACTO EN EL PRESUPUESTO
          </Text>
          <View
            style={[
              styles.impactCard,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
            ]}
          >
            <ImpactRow
              label="TUS FIJOS ACTUALES"
              value={formatMoney(prevTotal)}
              sub={`${pctAntes}% del sueldo`}
            />
            <ImpactRow
              label="DESPUÉS DE AGREGAR"
              value={formatMoney(nuevoTotal)}
              sub={`${pctDespues}% del sueldo`}
              emphasis
              deltaPct={deltaPct}
            />
            {monthlyIncome > 0 ? (
              <ImpactBar beforePct={pctAntes} afterPct={pctDespues} />
            ) : null}
            {monthlyIncome > 0 ? (
              <View
                style={[
                  styles.libreRow,
                  { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.libreEyebrow, { color: theme.colors.textMuted }]}>
                    TE QUEDA LIBRE
                  </Text>
                  <Text style={[styles.librePhrase, { color: theme.colors.textMuted }]}>
                    {libreTone.phrase}
                  </Text>
                  <CountUpText
                    value={libreDespues}
                    format={formatMoney}
                    unit="money"
                    flourish
                    duration={900}
                    glowColor={libreTone.glow}
                    style={[styles.libreValue, { color: libreTone.color }]}
                  />
                </View>
                <HealthBadge pct={pctDespues} />
              </View>
            ) : null}
          </View>
        </View>
      </RiseView>

      {selectedCategory ? (
        <RiseView delay={160}>
          <View>
            <Text style={[styles.eyebrow, { color: theme.colors.textMuted, marginBottom: 8 }]}>
              SE AGENDARÁ EN
            </Text>
            <CalendarDropImpact
              day={day}
              onChangeDay={onChangeDay}
              category={selectedCategory}
            />
          </View>
        </RiseView>
      ) : null}

      <RiseView delay={220}>
        <Pressable
          onPress={onToggleNotify}
          style={[
            styles.reminderCard,
            {
              backgroundColor: notify
                ? theme.isDark
                  ? 'rgba(166,239,143,0.18)'  // V1 primary-300 alpha
                  : '#EAFBE4'  // V1 primary-100
                : theme.colors.creamCard,
              borderColor: notify
                ? theme.isDark
                  ? 'rgba(166,239,143,0.5)'
                  : '#49D61F'  // V1 primary-500
                : theme.colors.line,
            },
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: notify }}
          accessibilityLabel="Recordatorio"
        >
          <View style={styles.reminderLeft}>
            <Text allowFontScaling={false} style={styles.reminderEmoji}>
              {notify ? '🔔' : '🔕'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
                RECORDATORIO
              </Text>
              <Text style={[styles.reminderText, { color: theme.colors.text }]}>
                {notify ? 'Avisar 2 días antes' : 'Sin aviso'}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.reminderToggle,
              {
                backgroundColor: notify
                  ? theme.isDark
                    ? '#A6EF8F'  // V1 primary-300
                    : '#297811'  // V1 primary-800 (AA-safe text indicator)
                  : theme.colors.line,
              },
            ]}
          >
            <View
              style={[
                styles.reminderToggleKnob,
                {
                  backgroundColor: theme.colors.creamCard,
                  transform: [{ translateX: notify ? 18 : 2 }],
                },
              ]}
            />
          </View>
        </Pressable>
      </RiseView>

      {/*
        Toggle "Ya pagué la cuota más reciente" — sólo en CREACIÓN
        (no edición) y para fijos NO-installment (los installments
        tienen otro flujo: la primera cuota se contabiliza con el
        contador `installments_paid`).

        Default OFF: el comportamiento "natural" es que estoy dando de
        alta un fijo pendiente. ON cuando el user lo prende
        explícitamente. Activarlo encadena el RPC de payment tras el
        create, que:
          · inserta payment row con period_month = mes actual,
          · avanza next_due_on al mes siguiente,
          · setea last_paid_at = now().

        Sin este toggle (estado pre-2026-05-30), creator que quería
        marcar "ya pagué" tocaba "Registrar pago" desde el listado —
        pero como el form arrancaba el next_due_on en el mes siguiente,
        ese pago avanzaba a +2 meses (skipeando la cuota en curso).
        Bug confirmado en prod con kontosmario@gmail.com (11 fijos
        afectados).
      */}
      {showAlreadyPaidToggle ? (
        <RiseView delay={280}>
          <Pressable
            onPress={onToggleAlreadyPaid}
            style={[
              styles.reminderCard,
              {
                backgroundColor: alreadyPaidCurrentCuota
                  ? theme.isDark
                    ? 'rgba(166,239,143,0.18)'
                    : '#EAFBE4'
                  : theme.colors.creamCard,
                borderColor: alreadyPaidCurrentCuota
                  ? theme.isDark
                    ? 'rgba(166,239,143,0.5)'
                    : '#49D61F'
                  : theme.colors.line,
              },
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: alreadyPaidCurrentCuota }}
            accessibilityLabel="Ya pagué la cuota más reciente"
            accessibilityHint="Activa si ya pagaste la cuota del mes en curso. El fijo arranca con el pago registrado y la próxima cuota apuntando al mes siguiente."
          >
            <View style={styles.reminderLeft}>
              <Text allowFontScaling={false} style={styles.reminderEmoji}>
                {alreadyPaidCurrentCuota ? '✅' : '⏳'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: theme.colors.textMuted }]}>
                  ESTADO ACTUAL
                </Text>
                <Text style={[styles.reminderText, { color: theme.colors.text }]}>
                  {alreadyPaidCurrentCuota
                    ? 'Ya pagué la cuota más reciente'
                    : 'Aún no pagué la cuota actual'}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.reminderToggle,
                {
                  backgroundColor: alreadyPaidCurrentCuota
                    ? theme.isDark
                      ? '#A6EF8F'
                      : '#297811'
                    : theme.colors.line,
                },
              ]}
            >
              <View
                style={[
                  styles.reminderToggleKnob,
                  {
                    backgroundColor: theme.colors.creamCard,
                    transform: [
                      { translateX: alreadyPaidCurrentCuota ? 18 : 2 },
                    ],
                  },
                ]}
              />
            </View>
          </Pressable>
        </RiseView>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  formStack: { gap: 12 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  summaryIconText: { fontSize: 22 },
  summaryName: { fontSize: 15, fontWeight: '800' },
  summaryMeta: { fontSize: 11, marginTop: 2 },
  summaryAmount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  summaryCuotaMeta: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  impactCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
  },
  libreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    borderStyle: 'dashed',
  },
  libreEyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  librePhrase: { fontSize: 12, fontWeight: '600', letterSpacing: -0.1, marginTop: 3 },
  libreValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  reminderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  reminderEmoji: { fontSize: 22 },
  reminderText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  reminderToggle: {
    width: 38,
    height: 22,
    borderRadius: 999,
    justifyContent: 'center',
  },
  reminderToggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 999,
  },
})
