import { useMemo } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion/tokens'
import { neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  displayDescription,
  formatMoney,
  formatRelativeDate,
} from '@/features/import-review/format'
import type { Category } from '@/features/categories/use-categories'
import type { ReviewRow } from '@/features/import-review/types'
import { INCOME_KIND_BY_KEY } from '@/features/income/income-kinds'
import { useImportReviewNeo } from './import-review-neo'

export type RowState = 'ready' | 'missing' | 'skipped' | 'failed'

interface Props {
  rows: readonly ReviewRow[]
  categories: readonly Category[]
  /** Ids con campos requeridos sin completar. */
  invalidIds: ReadonlySet<string>
  /** Ids cuyo insert falló en un intento anterior (reparación). */
  failedIds: ReadonlySet<string>
  /** Plata que se va a cargar si se confirma ahora. */
  submittableTotal: number
  /** Plata de TODO lo leído — sólo se rinde si difiere del total. */
  parsedTotal: number
  skippedCount: number
  /** Miniatura de la captura; ausente en Apple Pay. */
  imageUri?: string
  origin: 'ocr' | 'apple-pay'
  onOpenRow: (rowId: string) => void
}

/**
 * LA BANDEJA — la raíz del flujo cuando hay más de un movimiento.
 *
 * Invierte el modelo anterior: antes la lista era el ÚLTIMO paso (el
 * "resumen final") y sólo se llegaba recorriendo los N pasos con una
 * compuerta de validación en cada uno. Los movimientos de un import son
 * independientes entre sí, así que forzar el orden no ayudaba a nadie —
 * sólo escondía el conjunto y dejaba las tres preguntas del usuario sin
 * respuesta: cuántos son, en cuál estoy, cómo me muevo.
 *
 * Acá las tres se contestan en el primer frame: el conteo y el total en
 * plata arriba, el estado de cada fila en su propio renglón, y cualquier
 * fila a un tap.
 */
export function ImportReviewList({
  rows,
  categories,
  invalidIds,
  failedIds,
  submittableTotal,
  parsedTotal,
  skippedCount,
  imageUri,
  origin,
  onOpenRow,
}: Props) {
  const { neo, softInk, wellFallback } = useImportReviewNeo()
  const { t } = useTranslation()
  const reduced = useReducedMotion()

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  )

  const states = useMemo(
    () =>
      rows.map((row): RowState => {
        if (failedIds.has(row.id)) return 'failed'
        if (row.kind === 'skip') return 'skipped'
        return invalidIds.has(row.id) ? 'missing' : 'ready'
      }),
    [rows, invalidIds, failedIds],
  )

  const readyCount = states.filter((s) => s === 'ready').length
  const missingCount = states.filter((s) => s === 'missing').length
  const failedCount = states.filter((s) => s === 'failed').length

  const title =
    origin === 'apple-pay'
      ? t('gastos:import.list.applePayTitle', { count: rows.length })
      : t('gastos:import.list.title', { count: rows.length })

  const eyebrow =
    origin === 'apple-pay'
      ? t('gastos:import.origin.applePayPendingEyebrow', { count: rows.length })
      : t('gastos:import.origin.captureEyebrow')

  return (
    <View style={styles.root}>
      <View style={styles.headRow}>
        {imageUri !== undefined && imageUri !== '' ? (
          // Tile ELEVADO: la sombra vive en el wrapper para que el recorte
          // del radio de la Image no le coma el relieve.
          <View
            style={[
              styles.thumbWrap,
              { backgroundColor: neo.surface, boxShadow: neo.shadows.raisedSm },
            ]}
          >
            <Image
              source={{ uri: imageUri }}
              style={styles.thumb}
              resizeMode="cover"
              accessible
              accessibilityLabel={t('gastos:import.header.thumbnailA11y')}
            />
          </View>
        ) : (
          <View
            style={[
              styles.thumbWrap,
              styles.originMark,
              { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
              wellFallback,
            ]}
          >
            <MaterialIcons name="contactless" size={22} color={softInk} />
          </View>
        )}
        <View style={styles.headText}>
          <Text style={[styles.eyebrow, { color: neo.textMuted }]} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={[styles.title, { color: neo.text }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.hero,
          { backgroundColor: neo.surface, boxShadow: neo.shadows.raisedLg },
        ]}
      >
        <Text style={[styles.eyebrow, { color: neo.textMuted }]}>
          {t('gastos:import.list.totalLabel')}
        </Text>
        <View style={styles.totalRow}>
          <Text style={[styles.total, { color: neo.text }]} numberOfLines={1} adjustsFontSizeToFit>
            {readyCount + missingCount + failedCount === 0
              ? t('gastos:import.list.emptyAfterSkip')
              : formatMoney(submittableTotal)}
          </Text>
          {skippedCount > 0 && parsedTotal !== submittableTotal ? (
            <Text style={[styles.ofParsed, { color: softInk }]} numberOfLines={1}>
              {t('gastos:import.list.ofParsed', { amount: formatMoney(parsedTotal) })}
            </Text>
          ) : null}
        </View>

        <ProgressTrack states={states} />

        <View style={styles.chips}>
          {readyCount > 0 ? (
            <Chip tone="ready" label={t('gastos:import.list.readyChip', { count: readyCount })} />
          ) : null}
          {missingCount > 0 ? (
            <Chip tone="missing" label={t('gastos:import.list.missingChip', { count: missingCount })} />
          ) : null}
          {failedCount > 0 ? (
            <Chip tone="failed" label={t('gastos:import.list.failedChip', { count: failedCount })} />
          ) : null}
          {skippedCount > 0 ? (
            <Chip tone="skipped" label={t('gastos:import.list.skippedChip', { count: skippedCount })} />
          ) : null}
        </View>
      </View>

      <View style={styles.list}>
        {rows.map((row, idx) => (
          <ListRow
            key={row.id}
            row={row}
            state={states[idx]}
            categoryName={
              row.kind === 'expense' && row.categoryId
                ? (categoryById.get(row.categoryId)?.displayName ?? null)
                : null
            }
            divided={idx > 0}
            // El stagger se capa a 6: con 12 movimientos la cola aterrizaba
            // ~1s tarde y el usuario esperaba para leer su propia lista.
            delay={reduced ? 0 : 30 + Math.min(idx, 6) * 45}
            reduced={reduced}
            onPress={() => onOpenRow(row.id)}
          />
        ))}
      </View>
    </View>
  )
}

/**
 * Pista de progreso por CONTEO, no por paso. Un tramo por movimiento, con
 * el pozo visible: los tramos pendientes quedan VACÍOS, que es lo que hace
 * legible "cuánto falta". La barra anterior trataba `invalid` y `skipped`
 * como tramos rellenos, y como toda fila de OCR nace sin categoría, nacía
 * 100% llena y nunca comunicaba avance.
 */
function ProgressTrack({ states }: { states: readonly RowState[] }) {
  const { neo, wellFallback } = useImportReviewNeo()
  if (states.length <= 1) return null
  return (
    <View
      style={[
        styles.track,
        { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
        wellFallback,
      ]}
    >
      {states.map((s, idx) => (
        <View
          key={idx}
          style={[
            styles.seg,
            s === 'ready' && { backgroundColor: neo.green },
            s === 'missing' && { backgroundColor: neo.warm },
            s === 'failed' && { backgroundColor: neo.danger },
            // `skipped` y todo lo que no está resuelto dejan ver el pozo.
          ]}
        />
      ))}
    </View>
  )
}

function Chip({ tone, label }: { tone: RowState; label: string }) {
  const { neo, wellFallback } = useImportReviewNeo()
  const palette: Record<RowState, { bg: string; fg: string }> = {
    ready: { bg: withAlpha(neo.green, 0.16), fg: neo.green },
    missing: { bg: withAlpha(neo.warm, 0.18), fg: neo.warm },
    failed: { bg: withAlpha(neo.danger, 0.18), fg: neo.danger },
    skipped: { bg: neo.well, fg: neo.textMuted },
  }
  const { bg, fg } = palette[tone]
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: bg },
        tone === 'skipped' ? { boxShadow: neo.shadows.insetSm } : null,
        tone === 'skipped' ? wellFallback : null,
      ]}
    >
      <Text style={[styles.chipLabel, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

interface ListRowProps {
  row: ReviewRow
  state: RowState
  categoryName: string | null
  divided: boolean
  delay: number
  reduced: boolean
  onPress: () => void
}

function ListRow({
  row,
  state,
  categoryName,
  divided,
  delay,
  reduced,
  onPress,
}: ListRowProps) {
  const { neo, ink, softInk, wellFallback } = useImportReviewNeo()
  const { t } = useTranslation()

  const isSkipped = state === 'skipped'
  const isIncome = row.kind === 'income'
  const description = displayDescription(row.description)

  const meta = (() => {
    if (state === 'missing') return t('gastos:import.list.rowMissing')
    if (state === 'failed') return t('gastos:import.list.rowFailed')
    const date = formatRelativeDate(row.date)
    if (isSkipped) return `${date} · ${t('gastos:import.list.rowSkipped')}`
    const sub = isIncome
      ? t(INCOME_KIND_BY_KEY[row.incomeKind].labelKey)
      : (categoryName ?? '—')
    const suggested = row.categorySuggested
      ? ` · ${t('gastos:import.list.rowSuggested')}`
      : ''
    return `${date} · ${sub}${suggested}`
  })()

  const stateTint =
    state === 'ready'
      ? neo.green
      : state === 'missing'
        ? neo.warm
        : state === 'failed'
          ? neo.danger
          : neo.textMuted

  const stateIcon: keyof typeof MaterialIcons.glyphMap =
    state === 'ready'
      ? 'check'
      : state === 'missing'
        ? 'priority-high'
        : state === 'failed'
          ? 'refresh'
          : 'block'

  const a11yLabel = t('gastos:import.summary.itemA11y', {
    kind: isIncome ? t('gastos:import.incomeKind.incomeLabel') : t('common:terms.expense'),
    description,
    plus: isIncome ? t('gastos:import.summary.plusPrefix') : '',
    amount: formatMoney(row.amount).replace('$', ''),
    meta,
  })

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(motionDurations.standard).delay(delay)}
      style={divided ? { borderTopWidth: 1.5, borderTopColor: neo.sheetDivider } : null}
    >
      <Pressable
        onPress={onPress}
        accessible
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('gastos:import.summary.editHint')}
        // 44pt de alto táctil + hitSlop vertical: la fila es el ÚNICO
        // control de navegación de la bandeja, no puede fallar el tap.
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
      >
        <View
          style={[
            styles.state,
            state === 'skipped'
              ? [{ backgroundColor: neo.well, boxShadow: neo.shadows.insetSm }, wellFallback]
              : { backgroundColor: withAlpha(stateTint, 0.18) },
          ]}
        >
          <MaterialIcons name={stateIcon} size={14} color={stateTint} />
        </View>

        <View style={styles.itemBody}>
          <Text
            style={[
              styles.itemTitle,
              { color: isSkipped ? neo.textMuted : neo.text },
              isSkipped ? styles.struck : null,
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {description}
          </Text>
          <Text style={[styles.itemMeta, { color: state === 'ready' || isSkipped ? softInk : stateTint }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>

        <Text
          style={[
            styles.itemAmount,
            { color: isSkipped ? neo.textMuted : isIncome ? ink.accent : neo.text },
            isSkipped ? styles.struck : null,
          ]}
          numberOfLines={1}
        >
          {isIncome ? '+' : ''}
          {formatMoney(row.amount)}
        </Text>
        <MaterialIcons name="chevron-right" size={16} color={neo.textMuted} />
      </Pressable>
    </Animated.View>
  )
}

/**
 * Alpha sobre un hex del sistema. `color-mix()` no existe en RN y los tokens
 * son hex de 6 dígitos, así que se arma el `#RRGGBBAA` a mano. Si alguna vez
 * llega un token que ya trae alpha, se devuelve tal cual.
 */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `${hex}${a}`
}

// El `fontFamily` viaja con el peso: cada peso de Nunito es un face estático
// propio, así que sin él el 800/900 se renderiza como regular.
const styles = StyleSheet.create({
  root: { gap: 12, paddingTop: 6, paddingBottom: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbWrap: {
    width: 46,
    height: 46,
    borderRadius: neoRadii.chip,
    padding: 3,
  },
  originMark: { alignItems: 'center', justifyContent: 'center', padding: 0 },
  thumb: { flex: 1, borderRadius: neoRadii.chip - 3 },
  headText: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
    marginTop: 2,
  },
  hero: {
    borderRadius: neoRadii.card,
    padding: 18,
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  total: {
    flexShrink: 1,
    fontSize: 30,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -1.1,
    fontVariant: ['tabular-nums'],
  },
  ofParsed: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  track: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    padding: 3,
    borderRadius: 999,
  },
  seg: { flex: 1, height: 6, borderRadius: 999 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.1,
  },
  list: { paddingHorizontal: 2 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 56,
    paddingVertical: 10,
  },
  itemPressed: { opacity: 0.55 },
  state: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.2,
  },
  itemMeta: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  itemAmount: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  struck: { textDecorationLine: 'line-through' },
})
