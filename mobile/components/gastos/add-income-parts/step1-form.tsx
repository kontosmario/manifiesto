// Paso 1 del alta de ingreso: monto + atajos + tipo + descripción.
//
// Hermano del paso 1 del alta de fijos (`add-fijo-parts/step1-form.tsx`):
// mismo orden de lectura (la cifra primero, después de qué se trata) y las
// mismas superficies del rediseño. Lo único propio es que acá el monto es
// plata que ENTRA, así que la cifra va en verde (`tone="positive"`).
import { useCallback, type RefObject } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { AmountCard } from '@/components/home/amount-card'
import { RiseView } from '@/components/home/animated/rise-view'
import { SuggestedAmountStrip } from '@/components/home/suggested-amount-strip'
import { TileRail, type RailTile } from '@/components/home/category-horizontal-rail'
import { Field } from '@/components/wizard/parts/field'
import { STEP_ENTER, STEP_EXIT, STEP_LAYOUT } from '@/components/wizard/step-motion'
import type { IncomeEventKind } from '@/features/income/use-income-events'
import { DescriptionInput } from './description-input'
import { QuickTextChips } from './quick-text-chips'

export interface Step1FormProps {
  amount: number
  /** Envoltorio medible de la card de monto. Lo usa el keyboard-avoidance del
   *  numpad (`useNumpadScrollAvoid`) para subirla por encima de la hoja: sin
   *  esto, en pantallas cortas con Texto Grande se teclea a ciegas. */
  amountRef?: RefObject<View | null>
  onPressAmount: () => void
  isNumpadVisible: boolean
  onAddQuickAmount: (delta: number) => void
  onClearAmount: () => void
  suggestedAmounts: number[]
  kindTiles: RailTile[]
  kind: IncomeEventKind | null
  onSelectKind: (kind: IncomeEventKind) => void
  tileWidth: number
  tileHeight: number
  description: string
  onChangeDescription: (value: string) => void
  quickDescriptions: readonly string[]
  onSelectQuickDescription: (value: string) => void
  // Campos marcados como faltantes (el usuario tocó el CTA incompleto).
  flagAmount: boolean
  flagKind: boolean
  flagDescription: boolean
}

export function Step1Form({
  amount,
  amountRef,
  onPressAmount,
  isNumpadVisible,
  onAddQuickAmount,
  onClearAmount,
  suggestedAmounts,
  kindTiles,
  kind,
  onSelectKind,
  tileWidth,
  tileHeight,
  description,
  onChangeDescription,
  quickDescriptions,
  onSelectQuickDescription,
  flagAmount,
  flagKind,
  flagDescription,
}: Step1FormProps) {
  const { t } = useTranslation()

  // El cast del id vive acá, en un callback estable: como arrow inline se
  // recreaba en cada tecla de la descripción y le llegaba un `onSelect` nuevo
  // al rail —y de ahí a los 9 tiles animados— en cada caracter tipeado.
  const handleSelectTile = useCallback(
    (id: string) => onSelectKind(id as IncomeEventKind),
    [onSelectKind],
  )

  return (
    <Animated.View
      key="step-1"
      entering={STEP_ENTER}
      exiting={STEP_EXIT}
      layout={STEP_LAYOUT}
      style={styles.stack}
    >
      {/* Cascada de entrada: ordena la lectura —monto, atajos, tipo,
          descripción— en vez de presentar el formulario entero de golpe. */}
      <RiseView>
        {/* `collapsable={false}`: en Android una View sin estilo propio se
            colapsa fuera del árbol nativo y `measureInWindow` no devuelve
            nada — el avoid del numpad quedaría mudo justo donde más importa. */}
        <View ref={amountRef} collapsable={false}>
          <AmountCard
            amount={amount}
            isActive={isNumpadVisible}
            onPress={onPressAmount}
            label={t('gastos:addIncome.wizard.step1.amountLabel')}
            warning={flagAmount}
            tone="positive"
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

      {/* El rail rendea su propio eyebrow, así que la copy del estado
          "sin elegir" entra por `labelText` y no por un `Field`. */}
      <RiseView delay={130}>
        <TileRail
          tiles={kindTiles}
          selectedId={kind ?? ''}
          onSelect={handleSelectTile}
          labelText={
            flagKind
              ? t('gastos:addIncome.wizard.step1.kindFlagged')
              : t('gastos:addIncome.wizard.step1.kindLabel')
          }
          rows={2}
          tileWidth={tileWidth}
          tileHeight={tileHeight}
          warning={flagKind}
        />
      </RiseView>

      <RiseView delay={190}>
        <Field label={t('gastos:addIncome.wizard.step1.descriptionLabel')}>
          <View style={styles.descriptionStack}>
            <DescriptionInput
              value={description}
              onChange={onChangeDescription}
              placeholder={t('gastos:addIncome.wizard.step1.descriptionPlaceholder')}
              // El label del `Field` es un `<Text>` HERMANO: no lo toma el
              // lector. Con el campo ya escrito, el placeholder tampoco.
              accessibilityLabel={t('gastos:addIncome.wizard.step1.descriptionLabel')}
              warning={flagDescription}
            />
            <QuickTextChips
              options={quickDescriptions}
              onSelect={onSelectQuickDescription}
              selected={description}
            />
          </View>
        </Field>
      </RiseView>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  // El row de chips ya trae su propio `paddingVertical` en neo; el gap chico
  // evita que el bloque quede con doble aire respecto de los otros campos.
  descriptionStack: { gap: 2 },
})
