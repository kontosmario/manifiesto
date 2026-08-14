import { useMemo } from 'react'
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { categorySwatch } from '@/components/gastos/category-pastel'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import type { Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'
import { neoInk } from '@/theme/neo-ink'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { formatMoney } from '@/utils/money'

interface NoSpendConfirmSheetProps {
  visible: boolean
  /** Expenses cargados hoy por el current user (filtrados con tz-local). */
  expensesToday: Expense[]
  /** Lookup para mostrar el nombre + color de la categoría de cada gasto. */
  categoryById: Map<string, Category>
  isSubmitting: boolean
  onCancel: () => void
  /** Llamado cuando el user confirma. El caller debe pasar
   *  `{ force: true }` al RPC para que server-side acepte el mark
   *  aunque hoy ya tenga gastos. */
  onConfirm: () => void
}

/**
 * Cuánto se extiende la sombra `raisedMd` de una fila más allá de su caja
 * (offset 6 + blur 12). Mismo recurso que `FIJOS_SHADOW_BLEED` en los rieles
 * del alta de fijos.
 */
const ROW_SHADOW_BLEED = 12

/**
 * Sheet que reemplaza el `Alert.alert` genérico cuando el user intenta
 * marcar "Día sin gasto" desde el FAB y hoy ya tiene gastos cargados.
 *
 * Le mostramos la lista exacta de gastos del día para que pueda
 * verificar (a) si fueron suyos, (b) si los recuerda, (c) si quiere
 * marcar igual (defensible: marcaron como "sin gasto variable" aunque
 * cargaron algo menor; tienen forma de revertir).
 *
 * Rediseño 2026-08: carcasa `ModalCard skin="neo"`; el cuerpo pasa al
 * vocabulario neumórfico — el total del día es un POZO (`insetLg`), cada
 * gasto un tile extruido (`raisedMd`) y el aviso un pozo suave
 * (`insetSm`) con la tinta `warm` de alerta blanda.
 */
export function NoSpendConfirmSheet({
  visible,
  expensesToday,
  categoryById,
  isSubmitting,
  onCancel,
  onConfirm,
}: NoSpendConfirmSheetProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  const { t } = useTranslation()

  const totalToday = useMemo(
    () => expensesToday.reduce((sum, e) => sum + Math.abs(Number(e.price ?? 0)), 0),
    [expensesToday],
  )

  // Android < API 28/29 descarta el `boxShadow` EN SILENCIO. El pozo del
  // total y el aviso se leen SÓLO por su relieve: `neo.well` (#E9EBE0) sobre
  // la hoja (#F0EFE3) es ~1.05:1 en claro, o sea que sin la sombra
  // desaparecen. En ese piso caen a un contorno del divisor de hoja.
  const flatFallback = useMemo<ViewStyle | null>(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )

  const warnInk = neoInk(theme.mode).warn

  return (
    <ModalCard
      onClose={onCancel}
      skin="neo"
      subtitle={t('gastos:noSpendConfirm.subtitle')}
      title={t('gastos:noSpendConfirm.title')}
      visible={visible}
      footer={
        <View style={styles.footerStack}>
          <NeoButton
            block
            busy={isSubmitting}
            label={isSubmitting ? t('gastos:noSpendConfirm.marking') : t('gastos:noSpendConfirm.markAnyway')}
            onPress={onConfirm}
            variant="primary"
          />
          <NeoButton
            block
            disabled={isSubmitting}
            label={t('common:actions.cancel')}
            onPress={onCancel}
            variant="ghost"
          />
        </View>
      }
    >
      <View style={styles.body}>
        <NeoSurface
          backgroundColor={neo.well}
          radius={neoRadii.card}
          style={[styles.summaryCard, flatFallback]}
          variant="insetLg"
        >
          <Text style={[styles.summaryLabel, { color: neo.textMuted }]}>
            {t('gastos:noSpendConfirm.totalToday')}
          </Text>
          <Text style={[styles.summaryValue, { color: neo.text }]}>
            {formatMoney(totalToday)}
          </Text>
          <Text style={[styles.summaryHint, { color: neo.textMuted }]}>
            {t('gastos:noSpendConfirm.expensesLogged', { count: expensesToday.length })}
          </Text>
        </NeoSurface>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {expensesToday.map((expense) => {
            const cat = expense.category_id
              ? categoryById.get(expense.category_id)
              : null
            const title = expense.description?.trim() || cat?.displayName || t('common:terms.expense')
            // Sin categoría el punto cae a `textMuted`, no a `textTertiary`:
            // el terciario sobre el material raised claro da 2.2:1 y el punto
            // —que es lo que identifica la fila— desaparece.
            const dotColor = cat ? categorySwatch(cat.name, isDark) : neo.textMuted
            return (
              <NeoSurface
                key={expense.id}
                radius={neoRadii.tile}
                style={[styles.row, flatFallback]}
                variant="raisedMd"
              >
                <View style={styles.rowLeft}>
                  <View style={[styles.dot, { backgroundColor: dotColor }]} />
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.rowTitle, { color: neo.text }]}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    <Text
                      style={[styles.rowCategory, { color: neo.textMuted }]}
                      numberOfLines={1}
                    >
                      {cat?.displayName ?? t('gastos:movementRow.noCategory')}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[styles.rowAmount, { color: neo.text }]}
                  numberOfLines={1}
                >
                  {formatMoney(Math.abs(Number(expense.price ?? 0)))}
                </Text>
              </NeoSurface>
            )
          })}
        </ScrollView>

        <NeoSurface
          backgroundColor={neo.well}
          radius={neoRadii.tile}
          style={[styles.tipCard, flatFallback]}
          variant="insetSm"
        >
          <MaterialIcons name="info" size={16} color={warnInk} />
          <Text style={[styles.tipText, { color: neo.textMuted }]}>
            {t('gastos:noSpendConfirm.tip')}
          </Text>
        </NeoSurface>
      </View>
    </ModalCard>
  )
}

// El `fontFamily` viaja SIEMPRE con el peso: cada peso de Nunito es un face
// estático propio, así que un `fontWeight` suelto no cambia la face.
const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 16,
  },
  // Radio y relieve los pone `NeoSurface`; acá queda sólo la caja.
  summaryCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    letterSpacing: -0.4,
    marginTop: 4,
  },
  summaryHint: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 2,
  },
  // El riel RECORTA a sus bordes: la sombra `raisedMd` de las filas sangra
  // ROW_SHADOW_BLEED hacia afuera, así que el scroll se estira ese tanto con
  // margen negativo y lo devuelve como padding. Las filas quedan donde
  // estaban y el relieve entra entero en el área de clip.
  list: {
    maxHeight: 280 + ROW_SHADOW_BLEED * 2,
    marginHorizontal: -ROW_SHADOW_BLEED,
    marginVertical: -ROW_SHADOW_BLEED,
  },
  listContent: {
    gap: 8,
    padding: ROW_SHADOW_BLEED,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  rowCategory: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    marginTop: 1,
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    lineHeight: 16,
  },
  footerStack: {
    gap: 8,
  },
})
