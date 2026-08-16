import { useMemo } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import {
  CategoryHorizontalRail,
  RAIL_TILE_HEIGHT,
} from '@/components/home/category-horizontal-rail'
import { motionDurations } from '@/lib/motion/tokens'
import { neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  displayDescription,
  formatCaptureTime,
  formatMoney,
  formatRelativeDate,
  warningLabel,
} from '@/features/import-review/format'
import type { Category } from '@/features/categories/use-categories'
import type { ReviewRow } from '@/features/import-review/types'
import { INCOME_KIND_BY_KEY } from '@/features/income/income-kinds'
import { modalRailTileWidth } from './rail-metrics'
import { useImportReviewNeo } from './import-review-neo'

interface Props {
  row: ReviewRow
  /** Ya rankeadas por uso — las que más usa el hogar primero. */
  categories: readonly Category[]
  /** Nombres legibles de lo que falta; vacío cuando la fila está lista. */
  missingFields: readonly string[]
  onSelectCategory: (categoryId: string) => void
}

/**
 * EL RECIBO — la raíz del flujo cuando hay UN solo movimiento.
 *
 * Un pago sin contacto llega con monto, comercio, fecha y —cuando el
 * comercio ya se compró antes— categoría. Con todo resuelto, pedirle al
 * usuario que lea un formulario de seis bloques, toque "Revisar y
 * confirmar" y después confirme en otra pantalla era ceremonia pura: dos
 * taps y dos pantallas para un dato que no había que editar.
 *
 * Acá el dato se presenta como HECHO CONSUMADO con su procedencia, y la
 * única acción del camino feliz es aceptarlo. Editar sigue estando, un tap
 * más allá, para el caso en que algo no coincida.
 */
export function ImportReviewReceipt({
  row,
  categories,
  missingFields,
  onSelectCategory,
}: Props) {
  const { neo, ink, softInk, wellFallback } = useImportReviewNeo()
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const { width: windowWidth } = useWindowDimensions()
  const tileWidth = useMemo(() => modalRailTileWidth(windowWidth), [windowWidth])

  const isApplePay = row.source.origin === 'apple-pay'
  const isIncome = row.kind === 'income'
  const isSkipped = row.kind === 'skip'
  // Se discrimina la unión ACÁ y no vía `isApplePay`: TS no propaga el
  // narrowing de `row.source` a través de una variable booleana.
  const capturedTime =
    row.source.origin === 'apple-pay'
      ? formatCaptureTime(row.source.capture.capturedAt)
      : null
  const needsCategory = missingFields.length > 0 && row.kind === 'expense' && !row.categoryId
  const needsDescription = row.description.trim() === ''

  const eyebrow = isApplePay
    ? t('gastos:import.origin.applePayEyebrow', { time: capturedTime ?? '' }).trim()
    : t('gastos:import.origin.captureEyebrow')

  const note = isSkipped
    ? t('gastos:import.list.rowSkipped')
    : isApplePay
      ? row.categorySuggested
        ? t('gastos:import.origin.applePayNote')
        : t('gastos:import.origin.applePayFirstTime')
      : t('gastos:import.origin.captureNote')

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(motionDurations.standard)}
      style={styles.root}
    >
      <View style={styles.brandRow}>
        <View
          style={[
            styles.brandMark,
            { backgroundColor: neo.well, boxShadow: neo.shadows.insetSm },
            wellFallback,
          ]}
        >
          <MaterialIcons
            name={isApplePay ? 'contactless' : 'receipt-long'}
            size={20}
            color={softInk}
          />
        </View>
        <View style={styles.brandText}>
          <Text style={[styles.eyebrow, { color: neo.textMuted }]} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={[styles.note, { color: softInk }]} numberOfLines={2}>
            {note}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.receipt,
          { backgroundColor: neo.surface, boxShadow: neo.shadows.raisedLg },
        ]}
      >
        <Text style={[styles.eyebrow, { color: neo.textMuted }]}>
          {isIncome
            ? t('gastos:import.receipt.receivedLabel')
            : t('gastos:import.receipt.paidLabel')}
        </Text>
        <Text
          style={[
            styles.amount,
            { color: isSkipped ? neo.textMuted : isIncome ? ink.accent : neo.text },
            isSkipped ? styles.struck : null,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {isIncome ? '+' : ''}
          {formatMoney(row.amount)}
        </Text>
        <Text
          style={[
            styles.merchant,
            { color: needsDescription || isSkipped ? neo.textMuted : neo.text },
            isSkipped ? styles.struck : null,
          ]}
          numberOfLines={2}
        >
          {displayDescription(row.description)}
        </Text>

        <View style={styles.facts}>
          <Fact
            label={t('gastos:import.receipt.dateLabel')}
            value={
              capturedTime !== null
                ? `${formatRelativeDate(row.date)}, ${capturedTime}`
                : formatRelativeDate(row.date)
            }
          />
          {isIncome ? (
            <Fact
              label={t('gastos:import.row.incomeType')}
              value={t(INCOME_KIND_BY_KEY[row.incomeKind].labelKey)}
            />
          ) : row.categoryId ? (
            <Fact
              label={t('gastos:import.receipt.categoryLabel')}
              value={
                categories.find((c) => c.id === row.categoryId)?.displayName ?? '—'
              }
              suggested={row.categorySuggested}
            />
          ) : null}
        </View>
      </View>

      {/* Por qué la app la marcó sola (una devolución de Apple Pay nace así).
          Sin esto, una fila que el usuario nunca tocó no decía nunca por qué
          estaba descartada. */}
      {isSkipped && row.warnings.length > 0 ? (
        <Text style={[styles.why, { color: softInk }]}>
          {row.warnings.map(warningLabel).join(' ')}
        </Text>
      ) : null}

      {/* La sugerencia se explica, no sólo se marca: el chip dice QUÉ pasó y
          esta línea dice POR QUÉ. Sin el motivo, "sugerida" es una etiqueta
          más; con él, el usuario puede juzgarla sin abrir nada. */}
      {row.categorySuggested && !needsCategory && !isSkipped ? (
        <Text style={[styles.why, { color: softInk }]}>
          {t('gastos:import.receipt.suggestedWhy', {
            merchant: displayDescription(row.description),
          })}
        </Text>
      ) : null}

      {needsCategory && !isSkipped ? (
        <View style={styles.pickBlock}>
          <Text style={[styles.eyebrow, { color: neo.warm }]}>
            {t('gastos:import.receipt.onlyMissing')}
          </Text>
          <CategoryHorizontalRail
            // Sin `.slice()`: una copia nueva por render recomputa los tiles
            // del riel y derrota su `memo` por Tile. El riel no muta el array.
            categories={categories as Category[]}
            selectedCategoryId={row.categoryId ?? ''}
            onSelect={onSelectCategory}
            label={t('gastos:import.row.category')}
            rows={1}
            tileWidth={tileWidth}
            tileHeight={RAIL_TILE_HEIGHT}
            warning
          />
          <Text style={[styles.railHint, { color: softInk }]}>
            {t('gastos:import.receipt.pickFromMostUsed')}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  )
}

function Fact({
  label,
  value,
  suggested = false,
}: {
  label: string
  value: string
  suggested?: boolean
}) {
  const { neo } = useImportReviewNeo()
  const { t } = useTranslation()
  return (
    <View style={[styles.factRow, { borderTopColor: neo.sheetDivider }]}>
      <Text style={[styles.factLabel, { color: neo.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.factValueRow}>
        <Text style={[styles.factValue, { color: neo.text }]} numberOfLines={1}>
          {value}
        </Text>
        {suggested ? (
          <View style={[styles.suggestedChip, { borderColor: neo.green }]}>
            <Text style={[styles.suggestedLabel, { color: neo.green }]}>
              {t('gastos:import.receipt.suggestedChip')}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

// El `fontFamily` viaja con el peso: cada peso de Nunito es un face estático
// propio, así que sin él el 800/900 se renderiza como regular.
const styles = StyleSheet.create({
  root: { gap: 14, paddingTop: 6, paddingBottom: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: neoRadii.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  note: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 2,
  },
  receipt: {
    borderRadius: neoRadii.card,
    padding: 19,
  },
  amount: {
    fontSize: 42,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  merchant: {
    fontSize: 19,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
    marginTop: 6,
  },
  facts: { marginTop: 14 },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1.5,
  },
  factLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  factValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  factValue: {
    fontSize: 13.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    flexShrink: 1,
  },
  suggestedChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  suggestedLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.1,
  },
  struck: { textDecorationLine: 'line-through' },
  why: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  pickBlock: { gap: 8 },
  railHint: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
  },
})
