// Wizard add-fijo (2 steps). Esta screen quedó como orquestador: monta
// los hooks, calcula el impact math, encadena create/update + record-
// payment, y delega cada paso a su sub-componente:
//
//  · Step 1 (`<Step1Form>`)  → nombre + monto + categoría + frecuencia.
//  · Step 2 (`<Step2Summary>`) → resumen + impacto + calendario + toggles.
//
// Todo el state machine del form vive en `useAddFijoForm`. Las pure
// helpers (FREQ_OPTIONS, CUOTA_OPTIONS, QUICK_AMOUNTS, hexAlpha,
// buildNextDueOn) viven en `add-fijo-helpers.ts`.
import { useMemo } from 'react'
import {
  Alert,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
import { InAppNumpad } from '@/components/ui/in-app-numpad'
import { OnbNumpad } from '@/components/redesign/onboarding/onb-numpad'
import { StickyFooter } from '@/components/ui/sticky-footer'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { Step1Form } from '@/components/fijos/add-fijo-parts/step1-form'
import { Step2Summary } from '@/components/fijos/add-fijo-parts/step2-summary'
import { StepDots, StepHeader } from '@/components/fijos/add-fijo-parts/step-header'
import { useFixedExpenseCategories } from '@/features/categories/use-categories'
import { railTileWidth, RAIL_TILE_HEIGHT } from '@/components/home/category-horizontal-rail'
import { effectiveMonthlyIncome } from '@/features/finance/family-finance.model'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import {
  useCreateFixedExpense,
  useFixedExpenses,
  useRecordFixedExpensePayment,
  useUpdateFixedExpense,
} from '@/features/fixed-expenses/use-fixed-expenses'
import type { FixedExpenseFrequency } from '@/features/fixed-expenses/fixed-expense-types'
import { buildNextDueOn } from '@/features/fixed-expenses/add-fijo-helpers'
import { useAddFijoForm } from '@/features/fixed-expenses/use-add-fijo-form'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { getErrorMessage } from '@/utils/error-message'
import { serializePrice } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface AddFijoV2ScreenProps {
  familyId: string
  /** When set, the screen renders en "edit" mode — loads the existing
   *  fijo, pre-fills the form, submits via useUpdateFixedExpense. */
  fixedExpenseId?: string
  /** Optional prefill cuando creating (from Asistente's
   *  "undetected-sub" suggestion). Ignored when editing. */
  prefillAmount?: number
  prefillDescription?: string
}

/**
 * Add / edit fixed expense screen. Modes:
 *   · CREATE (no `fixedExpenseId`): form arranca en blanco. `prefillAmount`
 *     y `prefillDescription` seedean los campos si vienen (típicamente
 *     desde el Asistente cuando detecta una subscription).
 *   · EDIT (`fixedExpenseId` provided): carga el row existente vía
 *     `useFixedExpense` y submits via `useUpdateFixedExpense`. Los
 *     prefill props se IGNORAN en este mode (la fuente de verdad es la
 *     row hidratada, no el query param).
 *
 * State + validation viven en `useAddFijoForm` (Sprint D D7 split).
 * Steps en `mobile/components/fijos/add-fijo-parts/`.
 */
export function AddFijoV2Screen({
  familyId,
  fixedExpenseId,
  prefillAmount,
  prefillDescription,
}: AddFijoV2ScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
  const { width: windowWidth } = useWindowDimensions()
  // Ancho/alto de tile unificados con add-gasto y add-ingreso (mismo helper).
  const fijosTileWidth = railTileWidth(windowWidth)
  const fijosTileHeight = RAIL_TILE_HEIGHT
  const isEditing = Boolean(fixedExpenseId)
  const categoriesQuery = useFixedExpenseCategories(familyId)
  const categories = categoriesQuery.data ?? []
  const financeQuery = useFamilyFinance(familyId)
  // DINÁMICO: base 0 aunque quede un monthly_income stale post-switch —
  // sin esto el paso 2 mostraba "% de tu sueldo" sobre un sueldo fantasma.
  const monthlyIncome = effectiveMonthlyIncome(financeQuery.data)
  const existingFixedExpensesQuery = useFixedExpenses(familyId)
  const editingFijo = useMemo(
    () =>
      fixedExpenseId
        ? (existingFixedExpensesQuery.data ?? []).find((f) => f.id === fixedExpenseId) ?? null
        : null,
    [existingFixedExpensesQuery.data, fixedExpenseId],
  )
  // En edit mode, "prevTotal" excluye este item así el impact math
  // refleja el delta entre el old amount y el new one.
  const prevTotal = useMemo(
    () =>
      (existingFixedExpensesQuery.data ?? [])
        .filter((i) => i.id !== fixedExpenseId)
        .reduce((s, i) => s + Number(i.amount ?? 0), 0),
    [existingFixedExpensesQuery.data, fixedExpenseId],
  )
  const createMutation = useCreateFixedExpense(familyId)
  const updateMutation = useUpdateFixedExpense(familyId)
  // Para el toggle "Ya pagué la cuota más reciente" en el wizard de
  // creación: encadenamos `recordFixedExpensePayment` al toggle activo
  // (RPC inserta el payment row + avanza next_due_on al mes siguiente).
  const recordPaymentMutation = useRecordFixedExpensePayment(familyId)
  const pending =
    (isEditing ? updateMutation.isPending : createMutation.isPending) ||
    recordPaymentMutation.isPending

  // Todo el form state + validation en un hook propio.
  const form = useAddFijoForm({
    fixedExpenseId,
    prefillAmount,
    prefillDescription,
    editingFijo,
  })

  const selectedCategory = categories.find((c) => c.id === form.categoryId)

  const handleSelectCategory = (id: string) => {
    form.dismissNameKeyboard()
    form.setCategoryId(id)
  }
  const handleSelectFreq = (id: typeof form.freqChoice) => {
    if (id === null) return
    form.dismissNameKeyboard()
    form.setFreqChoice(id)
  }
  const handleSelectCuotaTot = (n: number) => {
    form.dismissNameKeyboard()
    form.setCuotaTot(n)
  }

  const nuevoTotal = prevTotal + form.amount
  const pctAntes = monthlyIncome > 0 ? Math.round((prevTotal / monthlyIncome) * 100) : 0
  const pctDespues = monthlyIncome > 0 ? Math.round((nuevoTotal / monthlyIncome) * 100) : 0
  const deltaPct = pctDespues - pctAntes
  const libreDespues = Math.max(0, monthlyIncome - nuevoTotal)

  const handleClose = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/fixed-expenses')
  }

  const handleConfirm = async () => {
    if (!form.canSubmit || !selectedCategory || form.day == null || form.freqChoice === null)
      return
    void triggerHaptic('success')
    const nextDueOn = buildNextDueOn(form.day)
    const basePayload = {
      amount: form.amount,
      categoryId: selectedCategory.id,
      dayOfMonth: form.day,
      endsOn: null,
      // "Cuotas" en la UI mappea a un monthly installment commitment —
      // el backend stores frequency='monthly' + kind='installment' +
      // installments_total. Otros FreqChoices mappean 1:1 con la
      // backend frequency column con kind='recurring'.
      frequency: form.isInstallment ? 'monthly' : (form.freqChoice as FixedExpenseFrequency),
      installmentsPaid: editingFijo?.installments_paid ?? 0,
      installmentsTotal: form.isInstallment ? form.cuotaTot : null,
      kind: form.isInstallment ? ('installment' as const) : ('recurring' as const),
      lenderName: editingFijo?.lender_name ?? null,
      name: form.name.trim(),
      nextDueOn,
      notes: editingFijo?.notes ?? null,
      notifyDaysBefore: form.notify ? 2 : null,
      remainingBalance: editingFijo?.remaining_balance ?? null,
      status: editingFijo?.status ?? 'active',
    }
    try {
      if (isEditing && fixedExpenseId) {
        await updateMutation.mutateAsync({ ...basePayload, fixedExpenseId })
      } else {
        const created = await createMutation.mutateAsync(basePayload)
        // Toggle "Ya pagué la cuota más reciente" activo + creación
        // exitosa → encadenar el RPC de payment para registrar la
        // cuota recién marcada (avanza next_due_on al mes siguiente
        // y deja el row de payment con period_month = mes actual).
        // No installment porque ahí el flujo es distinto (la primera
        // cuota se contabiliza con el contador `installments_paid`).
        if (form.alreadyPaidCurrentCuota && created?.id && !form.isInstallment) {
          try {
            await recordPaymentMutation.mutateAsync({
              fixedExpenseId: created.id,
            })
          } catch (paymentError) {
            // Mismo error UX: notificamos pero no abortamos — el fijo
            // ya se creó y el user puede registrar el pago manualmente
            // desde el listado.
            void triggerHaptic('error')
            Alert.alert(
              t('fijos:wizard.errors.createdNotPaidTitle'),
              t('fijos:wizard.errors.createdNotPaidBody', {
                error: getErrorMessage(paymentError, t('states:error.server')),
              }),
            )
            handleClose()
            return
          }
        }
      }
      handleClose()
    } catch (error) {
      void triggerHaptic('error')
      Alert.alert(
        isEditing
          ? t('fijos:wizard.errors.updateFailed')
          : t('fijos:wizard.errors.createFailed'),
        getErrorMessage(error, t('states:error.server')),
      )
    }
  }

  const onHeaderBack = () => {
    if (form.step === 2) {
      form.setStep(1)
    } else {
      handleClose()
    }
  }

  // Instancias separadas: solo un CTA monta por vez, pero así el shared value
  // no arrastra un press a medias al cambiar de step.
  const ctaStep1Press = usePressScale({ pressedScale: 0.97 })
  const ctaStep2Press = usePressScale({ pressedScale: 0.97 })

  const onPrimaryCtaStep1 = () => {
    if (form.canContinue) {
      // Feedback al avanzar al impacto — antes el salto de paso era mudo.
      void triggerHaptic('selection')
      form.setStep(2)
      return
    }
    form.flagMissing()
  }
  const onPrimaryCtaStep2 = () => {
    if (pending) return
    if (form.canSubmit) {
      void handleConfirm()
      return
    }
    form.flagMissing()
  }

  return (
    <Screen
      // El wizard no pasaba fondo, así que usaba el de la app
      // (`#F4F2ED`/`#12211A`) en vez del del rediseño. Sin esto el relieve del
      // botón de volver no se lee y la banda del footer queda de otro color.
      backgroundColor={neo ? neo.screenBackground : undefined}
      // El handoff ancla el CTA abajo (`margin-top:auto` en una columna
      // `flex:1`). Acá el `StickyFooter` vive DENTRO del ScrollView, así que
      // fluye con el contenido: en pantallas altas quedaba flotando a media
      // altura con aire muerto abajo. La cadena de `flexGrow` hace que la
      // columna ocupe al menos el alto disponible y que el stack empuje al
      // footer contra el piso, sin impedir que crezca y scrollee si el
      // contenido es más alto.
      contentContainerStyle={neo ? [styles.screen, styles.screenNeo] : styles.screen}
      bodyStyle={neo ? styles.bodyNeo : undefined}
      showGrabHandle
    >
      <Pressable
        style={neo ? [styles.stack, styles.stackNeo] : styles.stack}
        onPress={Keyboard.dismiss}
      >
        <Animated.View layout={LinearTransition.duration(260)}>
          <StepHeader
            step={form.step}
            isEditing={isEditing}
            onBack={onHeaderBack}
          />
        </Animated.View>

        <Animated.View layout={LinearTransition.duration(260)}>
          <StepDots step={form.step} />
        </Animated.View>

        {form.step === 1 ? (
          <Step1Form
            name={form.name}
            onChangeName={form.setName}
            isNameFocused={form.isNameFocused}
            onNameFocus={() => form.setIsNameFocused(true)}
            onNameBlur={() => form.setIsNameFocused(false)}
            amount={form.amount}
            onPressAmount={form.openNumpad}
            isNumpadVisible={form.isNumpadVisible}
            onAddQuickAmount={form.addQuickAmount}
            onClearAmount={form.clearAmount}
            categories={categories}
            categoryId={form.categoryId}
            onSelectCategory={handleSelectCategory}
            fijosTileWidth={fijosTileWidth}
            fijosTileHeight={fijosTileHeight}
            freqChoice={form.freqChoice}
            onSelectFreq={handleSelectFreq}
            cuotaTot={form.cuotaTot}
            onSelectCuotaTot={handleSelectCuotaTot}
            isInstallment={form.isInstallment}
            totalCuotas={form.totalCuotas}
            flagName={form.flagName}
            flagAmount={form.flagAmount}
            flagCategory={form.flagCategory}
            flagFrequency={form.flagFrequency}
          />
        ) : (
          <Step2Summary
            name={form.name}
            amount={form.amount}
            selectedCategory={selectedCategory}
            freqChoice={form.freqChoice}
            cuotaTot={form.cuotaTot}
            isInstallment={form.isInstallment}
            totalCuotas={form.totalCuotas}
            day={form.day}
            onChangeDay={form.setDay}
            prevTotal={prevTotal}
            nuevoTotal={nuevoTotal}
            pctAntes={pctAntes}
            pctDespues={pctDespues}
            deltaPct={deltaPct}
            libreDespues={libreDespues}
            monthlyIncome={monthlyIncome}
            notify={form.notify}
            onToggleNotify={() => form.setNotify((n) => !n)}
            showAlreadyPaidToggle={!isEditing && !form.isInstallment}
            alreadyPaidCurrentCuota={form.alreadyPaidCurrentCuota}
            onToggleAlreadyPaid={() => form.setAlreadyPaidCurrentCuota((v) => !v)}
          />
        )}
      </Pressable>

      {/* El footer pinta `theme.colors.canvas` (`#F4F2ED`/`#12211A`). Mientras
          toda la pantalla era canvas no se veía; con el fondo del rediseño
          (`#E9EBE0`/`#16271C`) se convierte en una banda de otro color abajo
          del CTA. El handoff separa el bloque con padding, no con una banda. */}
      <StickyFooter
        divider={false}
        style={
          neo
            ? {
                backgroundColor: neo.screenBackground,
                paddingTop: form.step === 1 ? 14 : 10,
              }
            : undefined
        }
      >
        {form.step === 1 ? (
          <Animated.View style={ctaStep1Press.animatedStyle}>
          <Pressable
            // Keep press reachable even when dimmed así un tap routea al
            // "flag missing fields" branch y pinta los unfilled inputs
            // con su warning glide. Mismo patrón que el PrimaryCTA de
            // import-review.
            onPress={onPrimaryCtaStep1}
            onPressIn={ctaStep1Press.onPressIn}
            onPressOut={ctaStep1Press.onPressOut}
            style={[
              styles.primaryCta,
              form.canContinue
                ? { backgroundColor: theme.colors.text }
                : { backgroundColor: theme.colors.text, opacity: 0.45 },
            neo
              ? {
                  backgroundColor: neo.add.cta.background,
                  experimental_backgroundImage: neo.add.cta.gradientCss,
                  borderRadius: neo.add.cta.radius,
                  paddingVertical: neo.add.cta.padV,
                  boxShadow: neo.add.cta.shadow,
                }
              : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              form.canContinue
                ? t('fijos:wizard.cta.seeImpactA11y')
                : t('fijos:wizard.cta.completeDataA11y')
            }
          >
            <Text
              style={[
                styles.primaryCtaText,
                { color: theme.colors.creamCard },
                neo
                  ? {
                      color: neo.add.cta.ink,
                      fontSize: neo.add.cta.fontSize,
                      fontWeight: '900',
                      fontFamily: neo.font('900'),
                    }
                  : null,
              ]}
            >
              {form.canContinue
                ? t('fijos:wizard.cta.seeImpact')
                : t('fijos:wizard.cta.completeData')}
            </Text>
          </Pressable>
          </Animated.View>
        ) : (
          <Animated.View style={ctaStep2Press.animatedStyle}>
          <Pressable
            onPress={onPrimaryCtaStep2}
            onPressIn={ctaStep2Press.onPressIn}
            onPressOut={ctaStep2Press.onPressOut}
            disabled={pending}
            style={[
              styles.primaryCta,
              form.canSubmit
                ? { backgroundColor: theme.colors.text, opacity: pending ? 0.7 : 1 }
                : { backgroundColor: theme.colors.text, opacity: 0.45 },
            // El CTA del paso 2 NO comparte tratamiento con el del paso 1: el
            // verde con gradiente dice "seguí", y acá la acción es confirmar.
            // El handoff lo pinta con el mismo par invertido que el chip de
            // frecuencia activo — sólido, sin gradiente.
            neo
              ? {
                  backgroundColor: neo.add.ctaStep2.background,
                  borderRadius: neo.add.cta.radius,
                  paddingVertical: neo.add.cta.padV,
                  boxShadow: neo.add.ctaStep2.shadow,
                }
              : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              !form.canSubmit
                ? t('fijos:wizard.cta.pickDay')
                : isEditing
                  ? t('fijos:wizard.cta.updateFijoA11y')
                  : t('fijos:wizard.cta.confirmFijoA11y')
            }
          >
            <Text
              style={[
                styles.primaryCtaText,
                // Siempre crema: el estado "deshabilitado" lo da el opacity 0.45
                // del Pressable, NO un fg de bajo contraste. Antes textMuted
                // (verde-claro) sobre el fill crema daba 1.14:1 en dark (ilegible).
                { color: theme.colors.creamCard },
                neo
                  ? {
                      color: neo.add.ctaStep2.ink,
                      fontSize: neo.add.cta.fontSize,
                      fontWeight: '900',
                      fontFamily: neo.font('900'),
                    }
                  : null,
              ]}
            >
              {!form.canSubmit
                ? t('fijos:wizard.cta.pickDay')
                : pending
                ? isEditing
                  ? t('fijos:wizard.cta.updating')
                  : t('fijos:wizard.cta.creating')
                : isEditing
                  ? t('fijos:wizard.cta.update')
                  : t('fijos:wizard.cta.confirmCreate')}
            </Text>
          </Pressable>
          </Animated.View>
        )}
      </StickyFooter>

      {/*
        En la piel neo va el teclado del rediseño (`OnbNumpad`, el del
        onboarding): teclas extruidas, "Listo" arriba y hoja al ras del borde
        inferior. Su modelo es un ENTERO de pesos (`value*10 + dígito`), no el
        string crudo del form, así que se traduce en el borde: `form.amount` ya
        viene parseado y `serializePrice` lo devuelve al formato del form.
        Los montos de fijos son enteros, así que no se pierde nada por el
        camino — la tecla de coma del propio numpad es inerte por lo mismo.
      */}
      {neo ? (
        <OnbNumpad
          mode={theme.isDark ? 'dark' : 'light'}
          visible={form.isNumpadVisible}
          value={form.amount}
          onChange={(next) => form.setRawAmount(serializePrice(next))}
          onDone={() => form.setIsNumpadVisible(false)}
        />
      ) : (
        <InAppNumpad
          visible={form.isNumpadVisible}
          rawValue={form.rawAmount}
          onChangeRawValue={form.setRawAmount}
          onDismiss={() => form.setIsNumpadVisible(false)}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingTop: 4 },
  screenNeo: { flexGrow: 1 },
  bodyNeo: { flexGrow: 1 },
  stack: { gap: 12, paddingBottom: 40 },
  // El `paddingBottom: 40` deja de tener sentido cuando el footer está
  // anclado: era el colchón que evitaba que el CTA quedara pegado al último
  // campo. El handoff separa con el padding del propio bloque del CTA.
  stackNeo: { flexGrow: 1, paddingBottom: 0 },
  primaryCta: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // No marginHorizontal aquí: el StickyFooter sit adentro del Screen
    // ScrollView content, que ya aplica un 20pt horizontal padding.
    // Agregar margin encima double-padea el CTA, dejándolo ~40pt más
    // estrecho que los inputs arriba.
  },
  primaryCtaText: { fontSize: 15, fontWeight: '800' },
})
