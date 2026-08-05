// Paso 1 del wizard de agregar gasto: monto + atajos + categoría + banner del
// asesor + descripción. Hermano de `add-fijo-parts/step1-form.tsx`: mismos
// bloques, mismo escalonado de entrada, mismos componentes compartidos
// (`AmountCard`, `SuggestedAmountStrip`, `CategoryHorizontalRail`), que caen a
// su rama del rediseño porque la ruta monta `WizardSkinProvider`.
//
// El orden NO es cosmético: la descripción va última porque sus chips de
// sugerencia salen de la categoría elegida, y arriba de ella el bloque
// aparecería siempre vacío.
import type { RefObject } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { AddExpenseAdvisorBanner } from '@/components/home/add-expense-advisor-banner'
import { AmountCard } from '@/components/home/amount-card'
import { CategoryHorizontalRail } from '@/components/home/category-horizontal-rail'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import { RiseView } from '@/components/home/animated/rise-view'
import { STEP_ENTER, STEP_EXIT, STEP_LAYOUT } from '@/components/wizard/step-motion'
import type { Category } from '@/features/categories/use-categories'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'
import { DescriptionField } from './description-field'

export interface Step1FormProps {
  amount: number
  /** Blanco del keyboard-avoidance del numpad: la screen mide ESTA card para
   *  saber si la hoja la tapa. */
  amountRef?: RefObject<View | null>
  onPressAmount: () => void
  isNumpadVisible: boolean
  suggestedAmounts: number[]
  onAddQuickAmount: (delta: number) => void
  onClearAmount: () => void
  categories: Category[]
  categoryId: string
  onSelectCategory: (id: string) => void
  tileWidth: number
  tileHeight: number
  description: string
  onChangeDescription: (v: string) => void
  descriptionSuggestions: readonly string[]
  onSelectDescriptionSuggestion: (v: string) => void
  /** Señales del asesor para el banner contextual (cupo quemado, categoría
   *  acelerada, tope de categoría). */
  advisorSignals: ControlAdvisorTask[]
  categoryNameById: Map<string, string>
  // Faltantes ya marcados (el usuario tocó el CTA atenuado en ESTE paso).
  flagAmount: boolean
  flagCategory: boolean
  flagDescription: boolean
}

export function Step1Form(props: Step1FormProps) {
  const { t } = useTranslation()
  const {
    amount,
    amountRef,
    onPressAmount,
    isNumpadVisible,
    suggestedAmounts,
    onAddQuickAmount,
    onClearAmount,
    categories,
    categoryId,
    onSelectCategory,
    tileWidth,
    tileHeight,
    description,
    onChangeDescription,
    descriptionSuggestions,
    onSelectDescriptionSuggestion,
    advisorSignals,
    categoryNameById,
    flagAmount,
    flagCategory,
    flagDescription,
  } = props

  return (
    <Animated.View
      key="step-1"
      entering={STEP_ENTER}
      exiting={STEP_EXIT}
      layout={STEP_LAYOUT}
      style={styles.formStack}
    >
      <RiseView>
        {/* `collapsable={false}`: en Android una View sin estilo propio se
            colapsa fuera del árbol nativo y `measureInWindow` no devuelve
            nada — el avoid del numpad quedaría mudo justo donde más importa. */}
        <View ref={amountRef} collapsable={false}>
          <AmountCard
            amount={amount}
            isActive={isNumpadVisible}
            onPress={onPressAmount}
            label={t('gastos:addExpense.wizard.step1.amountLabel')}
            warning={flagAmount}
          />
        </View>
      </RiseView>

      <RiseView delay={70}>
        <SuggestedAmountStrip
          amounts={suggestedAmounts}
          currentAmount={amount}
          onAdd={onAddQuickAmount}
          onClear={onClearAmount}
        />
      </RiseView>

      <RiseView delay={130}>
        {/* Scroll horizontal en dos filas: con el catálogo de variables
            expandido, una grilla estática recortaba las columnas que
            desbordaban. Las categorías llegan rankeadas por uso, así que las
            más usadas quedan al inicio y el resto se alcanza scrolleando. */}
        <CategoryHorizontalRail
          categories={categories}
          selectedCategoryId={categoryId}
          onSelect={onSelectCategory}
          rows={2}
          iconScope="expense"
          label={t('gastos:addExpense.wizard.step1.categoryLabel')}
          tileWidth={tileWidth}
          tileHeight={tileHeight}
          warning={flagCategory}
        />
      </RiseView>

      {/* La superficie de mayor palanca del asesor: aparece en el momento de
          la decisión, entre elegir la categoría y escribir qué fue. Se monta
          sin `RiseView` porque tiene su propia entrada —aparece y desaparece
          al cambiar de categoría, no sólo al montar el paso— y porque
          devuelve `null` cuando ninguna señal aplica: el wrapper dejaría una
          caja vacía sumando el `gap` de la columna. Su `entering` lleva el
          delay que lo mete en esta misma cascada (ver el componente). */}
      {advisorSignals.length > 0 ? (
        <AddExpenseAdvisorBanner
          signals={advisorSignals}
          selectedCategoryId={categoryId}
          categoryNameById={categoryNameById}
        />
      ) : null}

      <RiseView delay={190}>
        <DescriptionField
          value={description}
          onChange={onChangeDescription}
          suggestions={descriptionSuggestions}
          onSelectSuggestion={onSelectDescriptionSuggestion}
          warning={flagDescription}
        />
      </RiseView>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  formStack: { gap: 12 },
})
