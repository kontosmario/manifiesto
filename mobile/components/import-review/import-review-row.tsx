import { useEffect, useState } from 'react'
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { AmountCard } from '@/components/home/amount-card'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import { NotesRow } from '@/components/home/notes-row'
import { RiseView } from '@/components/home/animated/rise-view'
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
import { ImportReviewRowCollapsed } from './import-review-row-collapsed'

interface Props {
  row: ReviewRow
  categories: readonly Category[]
  invalid: boolean
  cycleStart: Date
  cycleDays: number
  today: string
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

export function ImportReviewRow({
  row,
  categories,
  invalid,
  cycleStart,
  cycleDays,
  today,
  onSetKind,
  onPatch,
  onUnskip,
}: Props) {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState(false)

  if (row.kind === 'skip') {
    return (
      <View
        style={[
          styles.cardSkipped,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.line,
          },
        ]}
      >
        <View style={styles.skipLeft}>
          <MaterialIcons name="block" size={16} color={theme.colors.textMuted} />
          <Text
            style={[styles.skipLabel, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {row.description}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onUnskip} hitSlop={6}>
          <Text style={[styles.skipAction, { color: theme.colors.primary }]}>
            Restaurar
          </Text>
        </Pressable>
      </View>
    )
  }

  if (!expanded) {
    return (
      <ImportReviewRowCollapsed
        row={row}
        invalid={invalid}
        onExpand={() => setExpanded(true)}
      />
    )
  }

  return (
    <ExpandedRow
      row={row}
      categories={categories}
      invalid={invalid}
      cycleStart={cycleStart}
      cycleDays={cycleDays}
      today={today}
      onSetKind={onSetKind}
      onPatch={onPatch}
      onCollapse={() => setExpanded(false)}
    />
  )
}

interface ExpandedProps extends Omit<Props, 'onUnskip'> {
  onCollapse: () => void
}

function ExpandedRow({
  row,
  categories,
  invalid,
  cycleStart,
  cycleDays,
  today,
  onSetKind,
  onPatch,
  onCollapse,
}: ExpandedProps) {
  const { theme } = useAppTheme()
  const [numpadVisible, setNumpadVisible] = useState(false)
  // Local raw value mirrors the row's numeric amount so the numpad can
  // edit it in-place. We seed from the row's current amount on mount
  // and re-sync whenever an external patch changes it (e.g. swap-kind
  // recomputes amount). Pushing edits OUT goes through `onPatch` —
  // `rawValue` is only the display state for the keypad.
  const [rawValue, setRawValue] = useState(() =>
    row.amount > 0 ? serializePrice(row.amount) : '',
  )
  useEffect(() => {
    // Keep raw in sync if the row's amount changes from outside the
    // numpad (e.g. controller patch). We compare numerically so trailing
    // commas typed by the user don't get clobbered every keystroke.
    const localNum = parsePrice(rawValue)
    if (!Number.isFinite(localNum) || Math.abs(localNum - row.amount) > 0.005) {
      setRawValue(row.amount > 0 ? serializePrice(row.amount) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.amount])

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
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={[
        styles.expanded,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
          borderColor: invalid ? theme.colors.danger : theme.colors.line,
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
        />
      </RiseView>

      <RiseView delay={180}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>
            Fecha
          </Text>
          <CycleDateSlider
            value={row.date}
            cycleStart={cycleStart}
            cycleDays={cycleDays}
            today={today}
            onChange={(iso) => onPatch({ date: iso })}
          />
        </View>
      </RiseView>

      <RiseView delay={240}>
        {row.kind === 'expense' ? (
          <CategorySection
            categories={categories}
            selectedCategoryId={row.categoryId}
            onSelect={(id) => onPatch({ categoryId: id })}
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Colapsar este movimiento"
        onPress={onCollapse}
        style={styles.collapseBtn}
      >
        <Text style={[styles.collapseLabel, { color: theme.colors.textMuted }]}>
          Listo
        </Text>
      </Pressable>

      <InAppNumpad
        visible={numpadVisible}
        rawValue={rawValue}
        onChangeRawValue={handleRawChange}
        onDismiss={() => setNumpadVisible(false)}
      />
    </Animated.View>
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
    { key: 'skip', label: 'Saltear' },
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
                { color: active ? '#0F2D06' : theme.colors.text },
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
}: {
  categories: readonly Category[]
  selectedCategoryId: string | null
  onSelect: (id: string) => void
}) {
  if (categories.length === 0) return null
  return (
    <CategoryHorizontalRail
      categories={categories.slice()}
      selectedCategoryId={selectedCategoryId ?? ''}
      onSelect={onSelect}
      label="Categoría"
      rows={2}
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
                  { color: active ? '#0F2D06' : theme.colors.text },
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
  }
}

const styles = StyleSheet.create({
  expanded: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 14,
  },
  cardSkipped: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  skipLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  skipLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  skipAction: { fontSize: 13, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', gap: 6 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  toggleLabel: { fontSize: 12, fontWeight: '800' },
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  kindLabel: { fontSize: 12, fontWeight: '700' },
  collapseBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  collapseLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
})
