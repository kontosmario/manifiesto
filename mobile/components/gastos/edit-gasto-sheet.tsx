// Edición de un gasto DESDE el feed de Gastos: el movimiento se corrige donde
// se lo ve, sin navegar a otra pantalla.
//
// Alcance: monto y descripción — exactamente lo que persiste `updateExpense`.
// La categoría se muestra como CONTEXTO de sólo lectura (pozo con el swatch +
// el nombre) para que el usuario sepa qué movimiento está tocando; moverlo de
// categoría exigiría otro contrato de escritura.
//
// Vocabulario: carcasa `ModalCard skin="neo"` (misma hoja que
// `no-spend-confirm-sheet`), monto en la `AmountCard` del kit de wizard bajo
// `WizardSkinProvider` —así resuelve su rama neo— con el keypad compartido
// INLINE (no un segundo Modal encima: la cadena de modales de iOS deja la hoja
// muda 150-250ms al cerrar), descripción en `NeoTextField` y acciones en
// `NeoButton`.
import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'
import { categorySwatch } from '@/components/gastos/category-pastel'
import { AmountCard } from '@/components/home/amount-card'
import { ModalCard } from '@/components/ui/modal-card'
import { NeoButton } from '@/components/ui/neo-button'
import { NeoSurface } from '@/components/ui/neo-surface'
import { NeoTextField } from '@/components/ui/neo-text-field'
import { NumpadGrid } from '@/components/ui/numpad-grid'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { WizardSkinProvider } from '@/components/wizard/wizard-skin'
import { EXPENSE_DESCRIPTION_MAX_LENGTH } from '@/features/expenses/expense-repository.model'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { parsePrice, serializePrice } from '@/utils/money'

export interface EditGastoSheetProps {
  visible: boolean
  /** Monto actual del gasto (positivo). */
  amount: number
  /** Descripción actual; vacía cuando el gasto se cargó sin texto. */
  description: string
  /** Nombre A MOSTRAR de la categoría (ya localizado). */
  categoryName?: string
  /** Nombre CRUDO de la categoría — es la semilla del swatch, nunca el
   *  localizado (en otro idioma el color del movimiento cambiaría). */
  categorySeed?: string
  isSaving: boolean
  onCancel: () => void
  onSubmit: (payload: { description: string; price: number }) => void
}

/**
 * El estado del formulario se inicializa UNA vez desde las props: el caller
 * monta la hoja con una `key` por sesión de edición, así abrir otro movimiento
 * la remonta con sus valores. Sin eso, el patch optimista de la mutación
 * (que reescribe la fila en cache mientras el guardado viaja) volvería a
 * sembrar el campo debajo de lo que el usuario está tipeando.
 */
export function EditGastoSheet({
  visible,
  amount,
  description: initialDescription,
  categoryName,
  categorySeed,
  isSaving,
  onCancel,
  onSubmit,
}: EditGastoSheetProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const isDark = theme.mode === 'dark'
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()

  const [rawAmount, setRawAmount] = useState(() =>
    Number.isFinite(amount) && amount > 0 ? serializePrice(amount) : '',
  )
  const [description, setDescription] = useState(() => initialDescription)
  const [isKeypadOpen, setKeypadOpen] = useState(false)

  const parsedAmount = parsePrice(rawAmount)
  const hasAmount = Number.isFinite(parsedAmount)
  const canSubmit = description.trim().length > 0 && hasAmount

  const closeKeypad = useCallback(() => setKeypadOpen(false), [])
  const toggleKeypad = useCallback(() => setKeypadOpen((open) => !open), [])

  const handleSubmit = useCallback(() => {
    if (!canSubmit || isSaving) return
    onSubmit({ description, price: parsedAmount })
  }, [canSubmit, description, isSaving, onSubmit, parsedAmount])

  // Android < API 28/29 descarta el `boxShadow` EN SILENCIO: el pozo de la
  // categoría (`neo.well` sobre la hoja, ~1.05:1 en claro) se lee SÓLO por su
  // relieve, así que en ese piso cae a un contorno del divisor de hoja.
  const flatFallback = useMemo<ViewStyle | null>(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )

  return (
    <ModalCard
      onClose={onCancel}
      skin="neo"
      subtitle={t('home:expenseEditor.subtitle')}
      title={t('gastos:historyScreen.editExpense')}
      visible={visible}
      footer={
        <View style={styles.footerStack}>
          <NeoButton
            block
            busy={isSaving}
            disabled={!canSubmit}
            label={t('gastos:historyScreen.update')}
            onPress={handleSubmit}
            variant="primary"
          />
          <NeoButton
            block
            disabled={isSaving}
            label={t('common:actions.cancel')}
            onPress={onCancel}
            variant="ghost"
          />
        </View>
      }
    >
      <View style={styles.body}>
        {/* El provider es lo único que manda la `AmountCard` a su rama neo: la
            piel se resuelve por contexto y la pantalla de Gastos no lo monta. */}
        <WizardSkinProvider mode={theme.mode}>
          <AmountCard
            amount={hasAmount ? parsedAmount : 0}
            isActive={isKeypadOpen}
            label={t('gastos:addExpense.wizard.step1.amountLabel')}
            onPress={toggleKeypad}
            size="compact"
            warning={!hasAmount}
          />
        </WizardSkinProvider>

        {isKeypadOpen ? (
          <Animated.View
            entering={
              reduceMotion
                ? FadeIn.duration(motionDurations.micro)
                : SlideInDown.duration(motionDurations.deliberate).easing(
                    Easing.bezier(0.16, 1, 0.3, 1),
                  )
            }
            exiting={
              reduceMotion
                ? FadeOut.duration(motionDurations.micro)
                : SlideOutDown.duration(motionDurations.exitModal).easing(
                    Easing.bezier(0.16, 1, 0.3, 1),
                  )
            }
          >
            <NumpadGrid
              hideDoneButton
              onChangeRawValue={setRawAmount}
              onDone={closeKeypad}
              rawValue={rawAmount}
            />
          </Animated.View>
        ) : null}

        {categoryName ? (
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: neo.textMuted }]}>
              {t('gastos:addExpense.wizard.step1.categoryLabel')}
            </Text>
            <NeoSurface
              backgroundColor={neo.well}
              radius={neoRadii.tile}
              style={[styles.categoryWell, flatFallback]}
              variant="insetSm"
            >
              <View
                style={[
                  styles.categoryDot,
                  { backgroundColor: categorySwatch(categorySeed ?? categoryName, isDark) },
                ]}
              />
              <Text
                numberOfLines={1}
                style={[styles.categoryName, { color: neo.text }]}
              >
                {categoryName}
              </Text>
            </NeoSurface>
          </View>
        ) : null}

        <NeoTextField
          autoCapitalize="sentences"
          autoCorrect={false}
          label={t('gastos:addExpense.wizard.step1.descriptionLabel')}
          maxLength={EXPENSE_DESCRIPTION_MAX_LENGTH}
          onChangeText={setDescription}
          // El keypad y el teclado del sistema comparten el fondo de la hoja:
          // enfocar la descripción retira el keypad en vez de apilarlos.
          onFocus={closeKeypad}
          placeholder={t('gastos:addExpense.wizard.step1.descriptionPlaceholder')}
          returnKeyType="done"
          value={description}
        />
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
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  // Radio y relieve los pone `NeoSurface`; acá queda sólo la caja.
  categoryWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  footerStack: {
    gap: 10,
  },
})
