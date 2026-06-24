import { useEffect, useRef, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { AmountCard } from '@/components/home/amount-card'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import { NotesRow } from '@/components/home/notes-row'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { TextField } from '@/components/ui/text-field'
import { parsePrice, serializePrice } from '@/utils/money'
import type { Category } from '@/features/categories/use-categories'
import type {
  IncomeKind,
  ReviewRow,
  ReviewRowKind,
} from '@/features/import-review/types'
import { CycleDateSlider } from './cycle-date-slider'

interface Props {
  row: ReviewRow
  categories: readonly Category[]
  cycleStart: Date
  cycleDays: number
  today: string
  /** Names of required fields currently missing on this row, e.g.
   *  `['descripción', 'categoría']`. Used together with `highlightToken`
   *  to decorate each section. */
  missingFields: readonly string[]
  /** A monotonically increasing counter. The sheet increments it each
   *  time the user taps the disabled "Siguiente" CTA. We use the
   *  count, not a boolean, so we can distinguish "user has never
   *  pushed forward" from "user just retried" — once the user nudges
   *  once, the row enters its flagged state and stays there until
   *  every required field is filled. */
  highlightToken: number
  onSetKind: (kind: ReviewRowKind) => void
  onPatch: (patch: Partial<ReviewRow>) => void
  onUnskip: () => void
}

const INCOME_KINDS: IncomeKind[] = ['transfer', 'bonus', 'gift', 'other']
const INCOME_KIND_LABELS: Record<IncomeKind, string> = {
  transfer: 'Transferencia',
  bonus: 'Bono',
  gift: 'Regalo',
  other: 'Otro',
}

/**
 * Single-movement form rendered as the current wizard step. No
 * collapsed/expanded state — the wizard shows one row at a time, so the
 * form is always fully visible. Skipped rows show a slim "saltado"
 * confirmation card with a restore action; everything else renders the
 * shared add-expense-family form (AmountCard + InAppNumpad + TextField
 * + NotesRow + CycleDateSlider).
 */
export function ImportReviewRow({
  row,
  categories,
  cycleStart,
  cycleDays,
  today,
  missingFields,
  highlightToken,
  onSetKind,
  onPatch,
  onUnskip,
}: Props) {
  const { theme } = useAppTheme()
  const [numpadVisible, setNumpadVisible] = useState(false)
  // `isFlagged` becomes true the first time the parent bumps
  // `highlightToken` while this row was mounted. Stays true for the
  // life of the row (resets on remount, which is per-step). Once
  // flagged, each missing field gets its `warning` styling; flagged
  // fields that get filled drop back to neutral automatically because
  // `missingFields` updates with every patch.
  const initialTokenRef = useRef(highlightToken)
  const isFlagged = highlightToken > initialTokenRef.current
  const flagDescription = isFlagged && missingFields.includes('descripción')
  const flagAmount = isFlagged && missingFields.includes('monto')
  const flagCategory = isFlagged && missingFields.includes('categoría')
  // Local raw mirrors the row's numeric amount so the shared numpad
  // can edit it in-place. Source of truth stays in the controller —
  // `rawValue` is just the display state. Re-syncs whenever an external
  // patch moves the amount (e.g. swap-kind recomputes).
  const [rawValue, setRawValue] = useState(() =>
    row.amount > 0 ? serializePrice(row.amount) : '',
  )
  useEffect(() => {
    const localNum = parsePrice(rawValue)
    if (!Number.isFinite(localNum) || Math.abs(localNum - row.amount) > 0.005) {
      setRawValue(row.amount > 0 ? serializePrice(row.amount) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.amount])

  if (row.kind === 'skip') {
    return (
      <View
        style={[
          styles.skipCard,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <View style={styles.skipHeader}>
          <MaterialIcons name="block" size={18} color={theme.colors.textMuted} />
          <Text
            style={[styles.skipLabel, { color: theme.colors.textMuted }]}
            numberOfLines={2}
          >
            Saltado
          </Text>
        </View>
        <Text
          style={[styles.skipDescription, { color: theme.colors.text }]}
          numberOfLines={2}
        >
          {row.description}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onUnskip}
          style={[styles.restoreBtn, { borderColor: theme.colors.line }]}
        >
          <Text style={[styles.restoreLabel, { color: theme.colors.primary }]}>
            Restaurar este movimiento
          </Text>
        </Pressable>
      </View>
    )
  }

  const handleRawChange = (next: string) => {
    setRawValue(next)
    const parsed = parsePrice(next)
    onPatch({ amount: Number.isFinite(parsed) ? parsed : 0 })
  }

  const handleOpenNumpad = () => {
    Keyboard.dismiss()
    setNumpadVisible(true)
  }

  return (
    // Las 6+ RiseView de abajo staggereaban (0→360ms) en CADA paso → se sentía
    // lento (animación frecuente). El slide del stepHost ya lleva la entrada;
    // gateamos el stagger interno (skip = render al estado final, layout intacto).
    <RiseViewGate skip>
    <View
      style={[
        styles.expanded,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          // Card border stays neutral always. We surface validation
          // state at the field level (border tint on the specific
          // unfilled inputs) instead of painting the whole expanded
          // panel red — the user pushed back on that pattern as
          // "invasivo y visualmente horrible".
          borderColor: theme.colors.line,
        },
      ]}
    >
      <RiseView delay={0}>
        <KindToggle kind={row.kind} onChange={onSetKind} />
      </RiseView>

      <RiseView delay={60}>
        <AmountCard
          amount={row.amount}
          isActive={numpadVisible}
          onPress={handleOpenNumpad}
          label={row.kind === 'income' ? 'Monto del ingreso' : 'Monto'}
          size="compact"
          warning={flagAmount}
        />
        {row.source.appliedRate !== null ? (
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            {`${row.source.transaction.primaryAmount.value} ${row.source.originalCurrency} @ $${row.source.appliedRate}`}
          </Text>
        ) : null}
      </RiseView>

      <RiseView delay={120}>
        <TextField
          label="Descripción"
          value={row.description}
          onChangeText={(t) => onPatch({ description: t })}
          autoCapitalize="sentences"
          autoCorrect={false}
          maxLength={60}
          placeholder="Ej: Supermercado"
          returnKeyType="done"
          warning={flagDescription}
        />
      </RiseView>

      <RiseView delay={180}>
        <CycleDateSlider
          value={row.date}
          cycleStart={cycleStart}
          cycleDays={cycleDays}
          today={today}
          onChange={(iso) => onPatch({ date: iso })}
        />
      </RiseView>

      <RiseView delay={240}>
        {row.kind === 'expense' ? (
          <CategorySection
            categories={categories}
            selectedCategoryId={row.categoryId}
            onSelect={(id) => onPatch({ categoryId: id })}
            warning={flagCategory}
          />
        ) : (
          <IncomeKindSection
            incomeKind={row.incomeKind}
            onSelect={(k) => onPatch({ incomeKind: k })}
          />
        )}
      </RiseView>

      <RiseView delay={300}>
        <NotesRow
          notes={row.notes ?? ''}
          onChange={(t) => onPatch({ notes: t === '' ? null : t })}
        />
      </RiseView>

      {row.warnings.length > 0 ? (
        <RiseView delay={360}>
          <View style={styles.warnings}>
            {row.warnings.map((w) => (
              <Text
                key={w}
                style={[styles.warning, { color: theme.colors.textMuted }]}
              >
                {warningLabel(w)}
              </Text>
            ))}
          </View>
        </RiseView>
      ) : null}

      <InAppNumpad
        visible={numpadVisible}
        rawValue={rawValue}
        onChangeRawValue={handleRawChange}
        onDismiss={() => setNumpadVisible(false)}
      />
    </View>
    </RiseViewGate>
  )
}

function KindToggle({
  kind,
  onChange,
}: {
  kind: ReviewRowKind
  onChange: (kind: ReviewRowKind) => void
}) {
  const { theme } = useAppTheme()
  const options: ReadonlyArray<{ key: ReviewRowKind; label: string }> = [
    { key: 'expense', label: 'Gasto' },
    { key: 'income', label: 'Ingreso' },
  ]
  return (
    <View style={styles.toggleRow}>
      {options.map((opt) => {
        const active = opt.key === kind
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.key)}
            style={[
              styles.toggleBtn,
              {
                backgroundColor: active ? theme.colors.primary : 'transparent',
                borderColor: active ? theme.colors.primary : theme.colors.line,
              },
            ]}
          >
            <Text
              style={[
                styles.toggleLabel,
                { color: active ? theme.colors.textOnPrimary : theme.colors.text },
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function CategorySection({
  categories,
  selectedCategoryId,
  onSelect,
  warning = false,
}: {
  categories: readonly Category[]
  selectedCategoryId: string | null
  onSelect: (id: string) => void
  warning?: boolean
}) {
  if (categories.length === 0) return null
  // Render the rail flat — `warning` only swaps its label color + text
  // ("Elegí una categoría") via the rail's own animated style. No
  // wrapper that would change the section's layout height when the
  // warning state toggles. Subtle, smooth, no jump.
  return (
    <CategoryHorizontalRail
      categories={categories.slice()}
      selectedCategoryId={selectedCategoryId ?? ''}
      onSelect={onSelect}
      label="Categoría"
      rows={1}
      warning={warning}
    />
  )
}

function IncomeKindSection({
  incomeKind,
  onSelect,
}: {
  incomeKind: IncomeKind
  onSelect: (k: IncomeKind) => void
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>
        Tipo de ingreso
      </Text>
      <View style={styles.kindRow}>
        {INCOME_KINDS.map((k) => {
          const active = k === incomeKind
          return (
            <Pressable
              key={k}
              onPress={() => onSelect(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.kindBtn,
                {
                  backgroundColor: active
                    ? theme.colors.primary
                    : 'transparent',
                  borderColor: active ? theme.colors.primary : theme.colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.kindLabel,
                  { color: active ? theme.colors.textOnPrimary : theme.colors.text },
                ]}
              >
                {INCOME_KIND_LABELS[k]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function warningLabel(w: ReviewRow['warnings'][number]): string {
  switch (w) {
    case 'foreign-currency':
      return 'Moneda no soportada. Editá el monto en ARS.'
    case 'swap-ambiguous':
      return 'Cambio de moneda. Verificá antes de cargar.'
    case 'no-merchant':
      return 'Sin descripción. Completá antes de confirmar.'
    case 'no-date':
      return 'Sin fecha clara. Asumimos hoy.'
    case 'value-zero':
      return 'Monto 0. Editá antes de confirmar.'
    case 'future-date':
      return 'La fecha era futura. La ajustamos a hoy — revisala.'
  }
}

const styles = StyleSheet.create({
  expanded: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  skipCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 10,
    alignItems: 'flex-start',
  },
  skipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  skipDescription: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  restoreBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  restoreLabel: { fontSize: 12, fontWeight: '800' },
  // KindToggle takes the upper width but is purely a binary choice —
  // cap its width so it doesn't dominate the form. Centered to keep
  // visual balance with the AmountCard below.
  toggleRow: {
    flexDirection: 'row',
    gap: 4,
    alignSelf: 'stretch',
  },
  toggleBtn: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  field: { gap: 6 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  hint: { fontSize: 11, fontWeight: '500', marginTop: 6 },
  warnings: { gap: 4 },
  warning: { fontSize: 11, fontWeight: '600' },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kindBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  kindLabel: { fontSize: 13, fontWeight: '700' },
})
