import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import i18n from '@/lib/i18n'
import { motionDurations } from '@/lib/motion/tokens'
import { AmountCard } from '@/components/home/amount-card'
import {
  CategoryHorizontalRail,
  TileRail,
  type RailTile,
  railTileWidth,
  RAIL_TILE_HEIGHT,
} from '@/components/home/category-horizontal-rail'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { CategorySticker } from '@/components/category/category-sticker'
import { EXPENSE_NOTES_MAX_LENGTH } from '@/features/expenses/expense-repository.model'
import { INCOME_KINDS } from '@/features/income/income-kinds'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { NeoTextField } from '@/components/ui/neo-text-field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { cssGradient, neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { parsePrice, serializePrice } from '@/utils/money'
import { formatWeekdayDayMonth } from '@/utils/date-format'
import type { Category } from '@/features/categories/use-categories'
import type {
  IncomeKind,
  ReviewRow,
  ReviewRowKind,
} from '@/features/import-review/types'
import { CycleDateSlider } from './cycle-date-slider'
import { useImportReviewNeo } from './import-review-neo'

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


/**
 * Single-movement form rendered as the current wizard step. No
 * collapsed/expanded state — the wizard shows one row at a time, so the
 * form is always fully visible. Skipped rows show a slim "saltado"
 * confirmation card with a restore action; everything else renders the
 * shared add-expense-family form (AmountCard + InAppNumpad +
 * NeoTextField + nota + CycleDateSlider).
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
  const { neo, ink, softInk, wellFallback } = useImportReviewNeo()
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
          { backgroundColor: neo.well, boxShadow: neo.shadows.insetLg },
          wellFallback,
        ]}
      >
        <View
          style={[
            styles.skipChip,
            { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
            wellFallback,
          ]}
        >
          <MaterialIcons name="block" size={14} color={softInk} />
          <Text style={[styles.skipLabel, { color: softInk }]} numberOfLines={1}>
            {t('gastos:import.row.skipped')}
          </Text>
        </View>
        <Text style={[styles.skipDescription, { color: neo.text }]} numberOfLines={2}>
          {row.description}
        </Text>
        <PressScale
          onPress={onUnskip}
          accessibilityLabel={t('gastos:import.row.restoreMovement')}
          style={[
            styles.restoreBtn,
            {
              ...cssGradient(neo.raisedGradientCss, neo.surface),
              boxShadow: neo.shadows.raisedSm,
            },
          ]}
        >
          <MaterialIcons name="restore" size={16} color={ink.accent} />
          <Text style={[styles.restoreLabel, { color: ink.accent }]}>
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
    <View style={styles.form}>
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
        {row.source.origin === 'ocr' && row.source.appliedRate !== null ? (
          <Text style={[styles.hint, { color: softInk }]}>
            {`${row.source.transaction.primaryAmount.value} ${row.source.originalCurrency} @ $${row.source.appliedRate}`}
          </Text>
        ) : null}
      </RiseView>

      <RiseView delay={120} style={styles.rhythmTop}>
        <NeoTextField
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
            <Text style={[styles.label, { color: neo.textMuted }]}>
              {t('gastos:import.row.date')}
            </Text>
            <Text style={[styles.dateValue, { color: neo.text }]}>
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
        <NotesWell
          notes={row.notes ?? ''}
          onChange={(next) => onPatch({ notes: next === '' ? null : next })}
        />
      </RiseView>

      {infoWarnings.length > 0 ? (
        <RiseView delay={360}>
          <View style={styles.warnings}>
            {infoWarnings.map((w) => (
              <Text key={w} style={[styles.warning, { color: ink.warn }]}>
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
  const { t } = useTranslation()
  const options = [
    { value: 'expense' as const, label: t('common:terms.expense') },
    { value: 'income' as const, label: t('gastos:import.incomeKind.incomeLabel') },
  ]
  return (
    <SegmentedControl
      skin="neo"
      options={options}
      value={kind === 'skip' ? 'expense' : kind}
      onChange={(next) => onChange(next)}
    />
  )
}

/**
 * Nota opcional del movimiento. Colapsada por defecto —un solo chip
 * "+ Agregar nota"— porque la mayoría de los movimientos importados no la
 * necesitan; expandida es un POZO con contador, el mismo material que el
 * resto de los campos del paso.
 */
function NotesWell({
  notes,
  onChange,
}: {
  notes: string
  onChange: (value: string) => void
}) {
  const { neo, ink, softInk, wellFallback } = useImportReviewNeo()
  const { t } = useTranslation()
  // Auto-expand cuando ya hay nota escrita (p.ej. al volver a este paso).
  const [expanded, setExpanded] = useState(notes.length > 0)

  const handleCollapse = () => {
    if (notes.length > 0) onChange('')
    setExpanded(false)
  }

  const remaining = EXPENSE_NOTES_MAX_LENGTH - notes.length
  const counterTone = remaining < 50 ? ink.danger : softInk

  return (
    <Animated.View layout={LinearTransition.duration(motionDurations.standard)} style={styles.notesRoot}>
      {!expanded ? (
        <Animated.View
          entering={FadeIn.duration(motionDurations.quick)}
          exiting={FadeOut.duration(motionDurations.micro)}
        >
          <PressScale
            onPress={() => setExpanded(true)}
            accessibilityLabel={t('home:notesRow.addAccessibility')}
            style={[
              styles.notesChip,
              {
                ...cssGradient(neo.raisedGradientCss, neo.surface),
                boxShadow: neo.shadows.raisedSm,
              },
            ]}
          >
            <MaterialIcons name="edit-note" size={18} color={neo.text} />
            <Text style={[styles.notesChipLabel, { color: neo.text }]}>
              {t('home:notesRow.addLabel')}
            </Text>
            <Text style={[styles.notesChipHint, { color: softInk }]}>
              {t('home:notesRow.optional')}
            </Text>
          </PressScale>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.duration(motionDurations.standard)}
          exiting={FadeOut.duration(motionDurations.micro)}
          style={styles.notesExpanded}
        >
          <View style={styles.notesHeaderRow}>
            <Text style={[styles.label, { color: neo.textMuted }]}>
              {t('home:notesRow.noteLabel')}
            </Text>
            <Pressable
              onPress={handleCollapse}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('home:notesRow.closeAccessibility')}
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
            >
              <MaterialIcons name="close" size={16} color={neo.textMuted} />
            </Pressable>
          </View>
          {/* El material del pozo vive en el wrapper: `wellFallback` es un
              ViewStyle y el `style` de un TextInput sólo acepta TextStyle. */}
          <View
            style={[
              styles.notesWell,
              { backgroundColor: neo.well, boxShadow: neo.shadows.insetLg },
              wellFallback,
            ]}
          >
            <TextInput
              value={notes}
              onChangeText={onChange}
              placeholder={t('home:notesRow.placeholder')}
              placeholderTextColor={neo.textMuted}
              selectionColor={neo.green}
              multiline
              numberOfLines={3}
              maxLength={EXPENSE_NOTES_MAX_LENGTH}
              textAlignVertical="top"
              style={[styles.notesInput, { color: neo.text }]}
            />
          </View>
          <Text style={[styles.notesCounter, { color: counterTone }]}>
            {notes.length}/{EXPENSE_NOTES_MAX_LENGTH}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
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
  const { width: windowWidth } = useWindowDimensions()
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
      tileWidth={railTileWidth(windowWidth)}
      tileHeight={RAIL_TILE_HEIGHT}
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
  const { t } = useTranslation()
  const { width: windowWidth } = useWindowDimensions()
  // Mismo estilo que el picker de add-ingreso: cápsula con sticker + label,
  // vía TileRail (antes eran pills de texto, estilo viejo).
  const tiles = useMemo<RailTile[]>(
    () =>
      INCOME_KINDS.map((meta) => {
        const label = t(meta.labelKey)
        return {
          id: meta.key,
          label,
          hueName: meta.key,
          icon: CATEGORY_ICONS[meta.icon] ? (
            <CategorySticker source={CATEGORY_ICONS[meta.icon]} size={32} onLightSurface />
          ) : (
            <Text>{meta.emoji}</Text>
          ),
          accessibilityLabel: label,
        }
      }),
    [t],
  )
  return (
    <TileRail
      tiles={tiles}
      selectedId={incomeKind}
      onSelect={(id) => onSelect(id as IncomeKind)}
      labelText={t('gastos:import.row.incomeType')}
      rows={1}
      tileWidth={railTileWidth(windowWidth)}
      tileHeight={RAIL_TILE_HEIGHT}
    />
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
  return formatWeekdayDayMonth(d)
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
    case 'refund':
      return i18n.t('gastos:import.warning.refund')
  }
}

// El `fontFamily` viaja con el peso: cada peso de Nunito es un face estático
// propio, así que sin él el 800/900 se renderiza como regular.
const styles = StyleSheet.create({
  form: {
    gap: 10,
  },
  skipCard: {
    borderRadius: neoRadii.cardSm,
    padding: 18,
    gap: 10,
    alignItems: 'flex-start',
  },
  skipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: neoRadii.chip,
  },
  skipLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  skipDescription: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: neoRadii.pill,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  restoreLabel: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  field: { gap: 6 },
  rhythmTop: { marginTop: 6 },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 6,
  },
  warnings: { gap: 4 },
  warning: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  notesRoot: { gap: 8 },
  notesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: neoRadii.pill,
  },
  notesChipLabel: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  notesChipHint: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  notesExpanded: { gap: 6 },
  notesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notesWell: {
    minHeight: 88,
    borderRadius: neoRadii.input,
  },
  notesInput: {
    minHeight: 88,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  notesCounter: {
    alignSelf: 'flex-end',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
})
