import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import i18n from '@/lib/i18n'
import { useAppTheme } from '@/theme/theme-provider'
import { motionDurations } from '@/lib/motion/tokens'
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
const INCOME_KIND_LABEL_KEYS: Record<IncomeKind, string> = {
  transfer: 'gastos:import.incomeKind.transfer',
  bonus: 'gastos:import.incomeKind.bonus',
  gift: 'gastos:import.incomeKind.gift',
  other: 'gastos:import.incomeKind.other',
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
  const { t } = useTranslation()
  const [numpadVisible, setNumpadVisible] = useState(false)
  // `isFlagged` becomes true the first time the parent bumps
  // `highlightToken` while this row was mounted. Stays true for the
  // life of the row (resets on remount, which is per-step). Once
  // flagged, each missing field gets its `warning` styling; flagged
  // fields that get filled drop back to neutral automatically because
  // `missingFields` updates with every patch.
  const initialTokenRef = useRef(highlightToken)
  const isFlagged = highlightToken > initialTokenRef.current
  const flagDescription = isFlagged && missingFields.includes(t('gastos:import.field.description'))
  const flagAmount = isFlagged && missingFields.includes(t('gastos:import.field.amount'))
  const flagCategory = isFlagged && missingFields.includes(t('gastos:import.field.category'))
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
            {t('gastos:import.row.skipped')}
          </Text>
        </View>
        <Text
          style={[styles.skipDescription, { color: theme.colors.text }]}
          numberOfLines={2}
        >
          {row.description}
        </Text>
        <PressScale
          onPress={onUnskip}
          accessibilityLabel={t('gastos:import.row.restoreMovement')}
          style={[styles.restoreBtn, { borderColor: theme.colors.line }]}
        >
          <Text style={[styles.restoreLabel, { color: theme.colors.primary }]}>
            {t('gastos:import.row.restoreMovement')}
          </Text>
        </PressScale>
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

  // Validation noise is already surfaced twice: the field tints (border +
  // label) and the footer lists the missing fields under the CTA. So the
  // in-row warnings list carries ONLY what those don't say — context like
  // "asumimos hoy" or a foreign-currency note. The required-field cases
  // (no-merchant, value-zero) would just be a third copy of the same line.
  const infoWarnings = row.warnings.filter(
    (w) => w !== 'no-merchant' && w !== 'value-zero',
  )

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
          label={row.kind === 'income' ? t('gastos:import.row.incomeAmount') : t('gastos:import.row.amount')}
          size="compact"
          warning={flagAmount}
        />
        {row.source.appliedRate !== null ? (
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            {`${row.source.transaction.primaryAmount.value} ${row.source.originalCurrency} @ $${row.source.appliedRate}`}
          </Text>
        ) : null}
      </RiseView>

      <RiseView delay={120} style={styles.rhythmTop}>
        <TextField
          label={t('gastos:import.row.description')}
          value={row.description}
          onChangeText={(next) => onPatch({ description: next })}
          autoCapitalize="sentences"
          autoCorrect={false}
          maxLength={60}
          placeholder={t('gastos:import.row.descriptionPlaceholder')}
          returnKeyType="done"
          warning={flagDescription}
        />
      </RiseView>

      <RiseView delay={180}>
        <View style={styles.field}>
          <View style={styles.dateLabelRow}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>
              {t('gastos:import.row.date')}
            </Text>
            <Text style={[styles.dateValue, { color: theme.colors.text }]}>
              {formatDayLabel(row.date)}
            </Text>
          </View>
          <CycleDateSlider
            value={row.date}
            cycleStart={cycleStart}
            cycleDays={cycleDays}
            today={today}
            onChange={(iso) => onPatch({ date: iso })}
          />
        </View>
      </RiseView>

      <RiseView delay={240} style={styles.rhythmTop}>
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
          onChange={(next) => onPatch({ notes: next === '' ? null : next })}
        />
      </RiseView>

      {infoWarnings.length > 0 ? (
        <RiseView delay={360}>
          <View style={styles.warnings}>
            {infoWarnings.map((w) => (
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const PRESS_EASE = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Pressable with the scale-on-press the footer buttons and the date tiles
 * already have. The row's toggles/pills were the only tappables in the
 * whole flow that didn't respond to touch — that inconsistency reads as
 * "not the same app". Transform is ALWAYS an array (never undefined) to
 * dodge the iOS processTransform crash.
 */
function PressScale({
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityState,
}: {
  children: ReactNode
  onPress: () => void
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  accessibilityState?: { selected?: boolean; disabled?: boolean }
}) {
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.96, {
          duration: motionDurations.micro,
          easing: PRESS_EASE,
        })
      }}
      onPressOut={() => {
        scale.value = withTiming(1, {
          duration: motionDurations.micro,
          easing: PRESS_EASE,
        })
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
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
  const { t } = useTranslation()
  const options: ReadonlyArray<{ key: ReviewRowKind; label: string }> = [
    { key: 'expense', label: t('common:terms.expense') },
    { key: 'income', label: t('gastos:import.incomeKind.incomeLabel') },
  ]
  return (
    <View style={styles.toggleRow}>
      {options.map((opt) => {
        const active = opt.key === kind
        return (
          <PressScale
            key={opt.key}
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
          </PressScale>
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
  const { t } = useTranslation()
  if (categories.length === 0) return null
  // Render the rail flat — `warning` only swaps its label color + text
  // ("Elige una categoría") via the rail's own animated style. No
  // wrapper that would change the section's layout height when the
  // warning state toggles. Subtle, smooth, no jump.
  return (
    <CategoryHorizontalRail
      categories={categories.slice()}
      selectedCategoryId={selectedCategoryId ?? ''}
      onSelect={onSelect}
      label={t('gastos:import.row.category')}
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
  const { t } = useTranslation()
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>
        {t('gastos:import.row.incomeType')}
      </Text>
      <View style={styles.kindRow}>
        {INCOME_KINDS.map((k) => {
          const active = k === incomeKind
          return (
            <PressScale
              key={k}
              onPress={() => onSelect(k)}
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
                {t(INCOME_KIND_LABEL_KEYS[k])}
              </Text>
            </PressScale>
          )
        })}
      </View>
    </View>
  )
}

function formatDayLabel(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  const diff = Math.round((t.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return i18n.t('gastos:import.relativeDate.today')
  if (diff === -1) return i18n.t('gastos:import.relativeDate.yesterday')
  if (diff === 1) return i18n.t('gastos:import.relativeDate.tomorrow')
  const wd = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  const mo = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${wd[d.getDay()]} ${d.getDate()} ${mo[d.getMonth()]}`
}

function warningLabel(w: ReviewRow['warnings'][number]): string {
  switch (w) {
    case 'foreign-currency':
      return i18n.t('gastos:import.warning.foreignCurrency')
    case 'swap-ambiguous':
      return i18n.t('gastos:import.warning.swapAmbiguous')
    case 'no-merchant':
      return i18n.t('gastos:import.warning.noMerchant')
    case 'no-date':
      return i18n.t('gastos:import.warning.noDate')
    case 'value-zero':
      return i18n.t('gastos:import.warning.valueZero')
    case 'future-date':
      return i18n.t('gastos:import.warning.futureDate')
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
  rhythmTop: { marginTop: 6 },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  dateValue: { fontSize: 13, fontWeight: '700' },
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
