import { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { AppButton } from '@/components/ui/button'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { NumpadField } from '@/components/ui/numpad-field'
import { Screen } from '@/components/ui/screen'
import {
  useCreateIncomeEvent,
  type IncomeEventKind,
} from '@/features/income/use-income-events'
import { triggerHaptic } from '@/lib/haptics'
import { buildScreenHeaderPalette } from '@/theme/screen-header'
import { useAppTheme } from '@/theme/theme-provider'
import {
  currencyFormatter,
  formatPriceInputValue,
  parsePrice,
} from '@/utils/money'
import { formatLocalDateKey } from '@/utils/pay-cycle'
import { getErrorMessage } from '@/utils/error-message'

interface AddIncomeScreenProps {
  familyId: string
  userId: string
}

interface KindMeta {
  key: IncomeEventKind
  label: string
  hint: string
  icon: keyof typeof MaterialIcons.glyphMap
}

// Four constrained kinds — keeps server-side analytics tractable
// while covering the realistic user mental model. Open-text
// `description` field captures the rest ("Mariana cena de cumple",
// "Aguinaldo Q1", etc.).
const KINDS: KindMeta[] = [
  { key: 'transfer', label: 'Transferencia',  hint: 'Te mandó alguien', icon: 'swap-horiz' },
  { key: 'bonus',    label: 'Bono',           hint: 'Aguinaldo, premio', icon: 'workspace-premium' },
  { key: 'gift',     label: 'Regalo',         hint: 'Cumple, ocasión',   icon: 'card-giftcard' },
  { key: 'other',    label: 'Otro',           hint: 'Algo extra',         icon: 'attach-money' },
]

const SUGGESTED_AMOUNTS = [5000, 15000, 30000, 50000, 100000]

/**
 * One-time positive income capture. Single-step form: amount → kind
 * → optional description → date (default today). Lands in
 * `public.income_events`, sums into the cycle's "disponible" via
 * `useHomeMetrics` so the user actually sees the saldo bump.
 */
export function AddIncomeScreen({ familyId }: AddIncomeScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const [rawAmount, setRawAmount] = useState('')
  const [kind, setKind] = useState<IncomeEventKind>('transfer')
  const [description, setDescription] = useState('')
  // Day offset from today: 0 = hoy, 1 = ayer, 2 = anteayer. Three
  // chips cover the realistic backdating window for one-time income
  // (older events the user adds days/weeks later are an edge case
  // we'll address when someone asks).
  const [dayOffset, setDayOffset] = useState<0 | 1 | 2>(0)
  const eventDate = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - dayOffset)
    return d
  }, [dayOffset])

  const createMutation = useCreateIncomeEvent()
  const headerPalette = buildScreenHeaderPalette(theme)

  const parsedAmount = useMemo(() => parsePrice(rawAmount), [rawAmount])
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0

  const handleAddSuggested = (delta: number) => {
    void triggerHaptic('selection')
    const next = (Number.isFinite(parsedAmount) ? parsedAmount : 0) + delta
    setRawAmount(String(Math.round(next)))
  }

  const handleSubmit = () => {
    if (!hasValidAmount) return
    void triggerHaptic('medium')
    createMutation.mutate(
      {
        familyId,
        amount: parsedAmount,
        kind,
        description,
        eventDate: formatLocalDateKey(eventDate),
      },
      {
        onSuccess: () => {
          void triggerHaptic('success')
          router.back()
        },
        onError: (err: unknown) => {
          void triggerHaptic('error')
          Alert.alert(
            'No pudimos guardar',
            getErrorMessage(err, 'Reintentá en un momento.'),
          )
        },
      },
    )
  }

  return (
    <Screen
      canGoBack
      showGrabHandle
      contentContainerStyle={styles.screenContent}
      title="Agregar ingreso"
      titleColor={headerPalette.titleColor}
    >
      {!theme.isDark ? <AmbientBackdrop variant="form" /> : null}

      {/* Hero copy — sets the tone, distinguishes from "agregar gasto" */}
      <RiseView>
        <View
          style={[
            styles.intro,
            { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
          ]}
        >
          <View style={styles.introIconWrap}>
            <MaterialIcons
              name="trending-up"
              size={20}
              color={theme.colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.introTitle, { color: theme.colors.text }]}>
              Saldo positivo extra
            </Text>
            <Text style={[styles.introBody, { color: theme.colors.textMuted }]}>
              Una transferencia, un bono, un regalo. Suma al disponible del ciclo
              actual sin tocar tu sueldo configurado.
            </Text>
          </View>
        </View>
      </RiseView>

      {/* Amount */}
      <RiseView delay={60}>
        <View style={styles.section}>
          <NumpadField
            label="Monto"
            value={rawAmount}
            onChangeRawValue={setRawAmount}
            formatDisplay={(raw) => formatPriceInputValue(raw, false)}
            placeholder="$ 0"
            doneLabel="Listo"
            autoOpen
            helper={
              hasValidAmount
                ? `Se suma al disponible: ${currencyFormatter.format(parsedAmount)}`
                : 'Ingresá el monto recibido.'
            }
          />
          <View style={styles.suggestedRow}>
            {SUGGESTED_AMOUNTS.map((delta) => (
              <Pressable
                key={delta}
                onPress={() => handleAddSuggested(delta)}
                style={({ pressed }) => [
                  styles.suggestedChip,
                  {
                    backgroundColor: theme.colors.creamCard,
                    borderColor: theme.colors.line,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Sumar ${currencyFormatter.format(delta)}`}
              >
                <Text style={[styles.suggestedText, { color: theme.colors.text }]}>
                  +{delta >= 1000 ? `${delta / 1000}k` : delta}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </RiseView>

      {/* Kind picker */}
      <RiseView delay={120}>
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
            ¿DE DÓNDE?
          </Text>
          <View style={styles.kindGrid}>
            {KINDS.map((k) => {
              const selected = kind === k.key
              return (
                <Pressable
                  key={k.key}
                  onPress={() => {
                    void triggerHaptic('selection')
                    setKind(k.key)
                  }}
                  style={({ pressed }) => [
                    styles.kindChip,
                    {
                      backgroundColor: selected
                        ? theme.colors.primarySurface
                        : theme.colors.creamCard,
                      borderColor: selected
                        ? theme.colors.primary
                        : theme.colors.line,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${k.label}: ${k.hint}`}
                >
                  <MaterialIcons
                    name={k.icon}
                    size={18}
                    color={selected ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <View style={styles.kindTextWrap}>
                    <Text
                      style={[
                        styles.kindLabel,
                        {
                          color: selected ? theme.colors.primary : theme.colors.text,
                        },
                      ]}
                    >
                      {k.label}
                    </Text>
                    <Text
                      style={[styles.kindHint, { color: theme.colors.textMuted }]}
                    >
                      {k.hint}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        </View>
      </RiseView>

      {/* Description */}
      <RiseView delay={180}>
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
            DETALLE (OPCIONAL)
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Ej: Mariana cena cumple, freelance noviembre"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.descInput,
              {
                backgroundColor: theme.colors.creamCard,
                borderColor: theme.colors.line,
                color: theme.colors.text,
              },
            ]}
            maxLength={120}
            returnKeyType="done"
          />
        </View>
      </RiseView>

      {/* Date — 3 quick chips. Older events are an edge case we'll
          surface a full picker for if/when it comes up. */}
      <RiseView delay={240}>
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
            ¿CUÁNDO?
          </Text>
          <View style={styles.dateChipsRow}>
            {([
              { offset: 0, label: 'Hoy' },
              { offset: 1, label: 'Ayer' },
              { offset: 2, label: 'Anteayer' },
            ] as const).map(({ offset, label }) => {
              const selected = dayOffset === offset
              return (
                <Pressable
                  key={offset}
                  onPress={() => {
                    void triggerHaptic('selection')
                    setDayOffset(offset)
                  }}
                  style={({ pressed }) => [
                    styles.dateChip,
                    {
                      backgroundColor: selected
                        ? theme.colors.primarySurface
                        : theme.colors.creamCard,
                      borderColor: selected
                        ? theme.colors.primary
                        : theme.colors.line,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      { color: selected ? theme.colors.primary : theme.colors.text },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </RiseView>

      {/* Submit */}
      <RiseView delay={300}>
        <View style={styles.submitWrap}>
          <AppButton
            label={hasValidAmount ? 'Guardar ingreso' : 'Ingresá un monto'}
            onPress={handleSubmit}
            disabled={!hasValidAmount}
            loading={createMutation.isPending}
          />
        </View>
      </RiseView>

      <View style={styles.bottomSpacer} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
  },
  introIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(166,239,143,0.12)',
  },
  introTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  introBody: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  section: {
    marginBottom: 18,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  suggestedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestedChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  suggestedText: {
    fontSize: 12,
    fontWeight: '700',
  },
  kindGrid: {
    gap: 8,
  },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 56,
  },
  kindTextWrap: {
    flex: 1,
  },
  kindLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  kindHint: {
    fontSize: 12,
    marginTop: 2,
  },
  descInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 48,
  },
  dateChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateChip: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  dateChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  submitWrap: {
    marginTop: 8,
  },
  bottomSpacer: {
    height: 60,
  },
})
