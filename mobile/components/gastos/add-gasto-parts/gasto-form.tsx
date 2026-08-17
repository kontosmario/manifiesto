// Columna ÚNICA del alta de gasto: monto + atajos + categoría + banner del
// asesor + descripción + la nota opcional.
//
// Reemplaza a `step1-form.tsx` (borrado el 2026-08-17, junto con el paso 2).
// Sigue siendo hermana de `add-fijo-parts/step1-form.tsx` en material y
// escalonado —mismos componentes compartidos (`AmountCard`,
// `SuggestedAmountStrip`, `CategoryHorizontalRail`), que caen a su rama del
// rediseño porque la ruta monta `WizardSkinProvider`—, pero el alta de gasto ya
// no es un wizard: fijos e ingreso siguen siendo de 2 pasos.
//
// El orden NO es cosmético: la descripción va después de la categoría porque
// sus chips de sugerencia salen de la categoría elegida, y arriba de ella el
// bloque aparecería siempre vacío. La nota va última porque es lo único
// opcional.
//
// Dos bloques COLAPSAN para que la columna entre en un teléfono chico, y en los
// dos casos el criterio es el mismo: lo que sólo sirve mientras estás usando un
// campo no ocupa lugar cuando no lo estás usando.
//  · Los atajos de monto son affordance de tipeo: sin el numpad abierto no
//    tienen función (~68pt en reposo).
//  · Los chips de descripción, ídem con el foco del pozo (~56pt en reposo).
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
import { NotesField } from './notes-field'

export interface GastoFormProps {
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
  notes: string
  onChangeNotes: (v: string) => void
  /** Señales del asesor para el banner contextual (cupo quemado, categoría
   *  acelerada, tope de categoría). */
  advisorSignals: ControlAdvisorTask[]
  categoryNameById: Map<string, string>
  // Faltantes ya marcados (el usuario tocó el CTA atenuado).
  flagAmount: boolean
  flagCategory: boolean
  flagDescription: boolean
}

export function GastoForm(props: GastoFormProps) {
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
    notes,
    onChangeNotes,
    advisorSignals,
    categoryNameById,
    flagAmount,
    flagCategory,
    flagDescription,
  } = props

  return (
    <Animated.View layout={STEP_LAYOUT} style={styles.formStack}>
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

      {/* Atajos SÓLO con el numpad abierto. Sin `RiseView`: no forma parte de
          la cascada de montaje —la pantalla abre con el numpad cerrado— y
          entra/sale con el mismo fade que el resto de los bloques
          condicionales del alta. */}
      {/* SIEMPRE visibles. Se probó colapsarlos a "sólo con el numpad abierto"
          para ahorrar alto, pero son un atajo de carga que el usuario ya tenía
          incorporado y esconderlos lo obligaba a abrir el teclado para algo que
          antes era un tap: pedido del owner de recuperarlos (2026-08-17). */}
      <Animated.View entering={STEP_ENTER} exiting={STEP_EXIT} layout={STEP_LAYOUT}>
        <SuggestedAmountStrip
          amounts={suggestedAmounts}
          currentAmount={amount}
          onAdd={onAddQuickAmount}
          onClear={onClearAmount}
        />
      </Animated.View>

      <RiseView delay={70}>
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
          al cambiar de categoría, no sólo al montar— y porque devuelve `null`
          cuando ninguna señal aplica: el wrapper dejaría una caja vacía sumando
          el `gap` de la columna. Su `entering` lleva el delay que lo mete en
          esta misma cascada (ver el componente). */}
      {advisorSignals.length > 0 ? (
        <AddExpenseAdvisorBanner
          signals={advisorSignals}
          selectedCategoryId={categoryId}
          categoryNameById={categoryNameById}
        />
      ) : null}

      <RiseView delay={130}>
        <DescriptionField
          value={description}
          onChange={onChangeDescription}
          suggestions={descriptionSuggestions}
          onSelectSuggestion={onSelectDescriptionSuggestion}
          warning={flagDescription}
        />
      </RiseView>

      <RiseView delay={190}>
        <NotesField value={notes} onChange={onChangeNotes} />
      </RiseView>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  formStack: { gap: 12 },
})
