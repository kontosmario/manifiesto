import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useAppTheme } from '@/theme/theme-provider'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import type { Category } from '@/features/categories/use-categories'
import type { IncomeKind, ReviewRow, ReviewRowKind } from '@/features/import-review/types'

interface Props {
  row: ReviewRow
  categories: readonly Category[]
  invalid: boolean
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
  onSetKind,
  onPatch,
  onUnskip,
}: Props) {
  const { theme } = useAppTheme()

  if (row.kind === 'skip') {
    return (
      <View
        style={[
          styles.cardSkipped,
          { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.skipLeft}>
          <MaterialIcons name="block" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.skipLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
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

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard,
          borderColor: invalid ? theme.colors.danger : theme.colors.line,
        },
      ]}
    >
      <KindToggle kind={row.kind} onChange={onSetKind} />

      <LabeledInput
        label="Descripción"
        value={row.description}
        onChangeText={(t) => onPatch({ description: t })}
        invalid={invalid && row.description.trim() === ''}
      />

      <LabeledInput
        label="Monto (ARS)"
        value={String(row.amount)}
        onChangeText={(t) => {
          const n = parseFloat(t.replace(/\./g, '').replace(',', '.'))
          onPatch({ amount: Number.isFinite(n) ? n : 0 })
        }}
        keyboardType="decimal-pad"
        invalid={invalid && row.amount <= 0}
      />

      {row.source.appliedRate !== null ? (
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          {`${row.source.transaction.primaryAmount.value} ${row.source.originalCurrency} @ rate $${row.source.appliedRate}`}
        </Text>
      ) : null}

      <LabeledInput
        label="Fecha (YYYY-MM-DD)"
        value={row.date}
        onChangeText={(t) => onPatch({ date: t })}
        autoCapitalize="none"
      />

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

      <LabeledInput
        label="Notas (opcional)"
        value={row.notes ?? ''}
        onChangeText={(t) => onPatch({ notes: t === '' ? null : t })}
        multiline
      />

      {row.warnings.length > 0 ? (
        <View style={styles.warnings}>
          {row.warnings.map((w) => (
            <Text key={w} style={[styles.warning, { color: theme.colors.textMuted }]}>
              {warningLabel(w)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
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

function LabeledInput({
  label,
  value,
  onChangeText,
  keyboardType,
  invalid = false,
  multiline = false,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText: (text: string) => void
  keyboardType?: 'default' | 'decimal-pad'
  invalid?: boolean
  multiline?: boolean
  autoCapitalize?: 'none' | 'sentences'
}) {
  const { theme } = useAppTheme()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            borderColor: invalid ? theme.colors.danger : theme.colors.line,
            backgroundColor: theme.colors.surfaceMuted,
          },
        ]}
      />
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
  const cats = useMemo(() => categories.slice(), [categories])
  if (cats.length === 0) return null
  return (
    <View style={styles.field}>
      <CategoryHorizontalRail
        categories={cats}
        selectedCategoryId={selectedCategoryId ?? ''}
        onSelect={onSelect}
        label="Categoría"
        rows={2}
      />
    </View>
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
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>Tipo de ingreso</Text>
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
                  backgroundColor: active ? theme.colors.primary : 'transparent',
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
      return '⚠ Moneda no soportada (EUR/BTC/etc). Editá el monto en ARS para importar.'
    case 'swap-ambiguous':
      return '⚠ Es un swap de monedas. Verificá antes de cargar.'
    case 'no-merchant':
      return '⚠ Sin descripción detectada. Completá antes de confirmar.'
    case 'no-date':
      return '⚠ Sin fecha detectada. Default: hoy.'
    case 'value-zero':
      return '⚠ Monto $0. Editá antes de confirmar.'
  }
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
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
  field: { gap: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  input: {
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  hint: { fontSize: 11, fontWeight: '500' },
  warnings: { gap: 4, marginTop: 2 },
  warning: { fontSize: 11, fontWeight: '600' },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kindBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  kindLabel: { fontSize: 12, fontWeight: '700' },
})
