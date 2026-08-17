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
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  InteractionManager,
  Keyboard,
  Pressable,
  type ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/screen'
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
import {
  buildNextDueOn,
  numpadBaseAmount,
  rebaseNextDueOn,
  selectDuplicateCandidates,
} from '@/features/fixed-expenses/add-fijo-helpers'
import { useAddFijoForm } from '@/features/fixed-expenses/use-add-fijo-form'
import { usePressScale } from '@/hooks/use-press-scale'
// Del hook de la app, NUNCA de 'react-native-reanimated': el de la
// librería es el import-trap catalogado que suscribe un listener de
// accesibilidad por call site (jank en Android gama baja).
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import { toast } from '@/lib/toast-bus'
import { getErrorMessage } from '@/utils/error-message'
import { serializePrice } from '@/utils/money'
import { useThemeTokens } from '@/theme/theme-provider'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

interface AddFijoV2ScreenProps {
  familyId: string
  /** Va a las mutations (create/update/record-payment): sin él,
   *  `syncAllAfterMutation` no invalida las queries ancladas a usuario
   *  (homeSnapshot/controlSnapshot) y el Home queda stale tras guardar. */
  userId: string
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
  userId,
  fixedExpenseId,
  prefillAmount,
  prefillDescription,
}: AddFijoV2ScreenProps) {
  const router = useRouter()
  const theme = useThemeTokens()
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const { t } = useTranslation()
  const { width: windowWidth } = useWindowDimensions()
  // Ancho/alto de tile unificados con add-gasto y add-ingreso (mismo helper).
  const fijosTileWidth = railTileWidth(windowWidth)
  const fijosTileHeight = RAIL_TILE_HEIGHT
  const isEditing = Boolean(fixedExpenseId)
  const categoriesQuery = useFixedExpenseCategories(familyId)
  // Memoizado: `?? []` crea un array nuevo por render, y de él cuelga el
  // validador de categoría que consume el form.
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
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
  // Memoizado por la misma razón que `categories`: `?? []` crea un array
  // nuevo por render y de él cuelga el gate de nombre duplicado del form.
  // `selectDuplicateCandidates` acota a fijos persistidos y VISIBLES: sin
  // el filtro, la fila optimista del propio alta en vuelo se matcheaba a sí
  // misma, y un fijo completed/archived (invisible en toda la UI) bloqueaba
  // el alta sin causa visible.
  const existingFijos = useMemo(
    () => selectDuplicateCandidates(existingFixedExpensesQuery.data ?? []),
    [existingFixedExpensesQuery.data],
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
  // `userId` en las tres: el listado ya lo pasaba y el alta no — el
  // `syncAllAfterMutation` corría con userId undefined y las keys ancladas
  // a usuario (homeSnapshot/controlSnapshot) quedaban sin invalidar.
  const createMutation = useCreateFixedExpense(familyId, userId)
  const updateMutation = useUpdateFixedExpense(familyId, userId)
  // Para el toggle "Ya pagué la cuota más reciente" en el wizard de
  // creación: encadenamos `recordFixedExpensePayment` al toggle activo
  // (RPC inserta el payment row + avanza next_due_on al mes siguiente).
  const recordPaymentMutation = useRecordFixedExpensePayment(familyId, userId)
  const pending =
    (isEditing ? updateMutation.isPending : createMutation.isPending) ||
    recordPaymentMutation.isPending

  // La screen es la que tiene la query de categorías, así que es la que puede
  // decir si un id RESUELVE. Va como función y no como booleano a propósito:
  // el `categoryId` es del hook, y espejarlo acá para validarlo metía un
  // render de lag en el que `canContinue` parpadeaba a false justo después de
  // elegir la categoría.
  const isCategoryIdValid = useCallback(
    (id: string) => categories.some((c) => c.id === id),
    [categories],
  )

  // Todo el form state + validation en un hook propio.
  const form = useAddFijoForm({
    fixedExpenseId,
    prefillAmount,
    prefillDescription,
    editingFijo,
    existingFijos,
    isCategoryIdValid,
  })

  const selectedCategory = categories.find((c) => c.id === form.categoryId)

  // Al cambiar de paso el scroll vuelve arriba. Sin esto, quien llenó el paso 1
  // hasta el final entra al paso 2 con el scroll heredado y aterriza a mitad
  // del calendario, sin ver ni el resumen ni el impacto — que son justamente
  // el punto del paso. `animated: false` porque el contenido se está
  // reemplazando: un scroll suave sobre un árbol que ya cambió se ve como un
  // salto, no como un desplazamiento.
  const scrollRef = useRef<ScrollView>(null)
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [form.step])

  // El CTA pasa de "faltan datos" a "listo" cambiando de opacidad. Sin
  // transición eran dos estados sin relación entre sí; con ella el botón se
  // lee como un indicador de que el formulario se está completando.
  const reduceMotion = useReducedMotion()
  const step1Ready = useSharedValue(form.canContinue ? 1 : 0)
  const step2Ready = useSharedValue(form.canSubmit ? 1 : 0)
  useEffect(() => {
    const to = form.canContinue ? 1 : 0
    step1Ready.value = reduceMotion
      ? to
      : withTiming(to, { duration: motionDurations.standard })
  }, [form.canContinue, reduceMotion, step1Ready])
  useEffect(() => {
    const to = form.canSubmit ? 1 : 0
    step2Ready.value = reduceMotion
      ? to
      : withTiming(to, { duration: motionDurations.standard })
  }, [form.canSubmit, reduceMotion, step2Ready])
  const ctaStep1Enabled = useAnimatedStyle(() => ({
    opacity: 0.45 + step1Ready.value * 0.55,
  }))
  const ctaStep2Enabled = useAnimatedStyle(() => ({
    // El `pending` se resta aparte: mientras la mutation corre el botón baja
    // a 0.7 aunque el formulario esté completo.
    opacity: (0.45 + step2Ready.value * 0.55) * (pending ? 0.7 : 1),
  }))

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
    // Edición: re-anclar dentro del período vigente del cursor (no
    // rebobinar al mes actual — eso resucitaba como pendiente un fijo
    // ya pagado). Alta: ocurrencia de este mes, como siempre.
    const nextDueOn =
      isEditing && editingFijo?.next_due_on
        ? rebaseNextDueOn(editingFijo.next_due_on, form.day)
        : buildNextDueOn(form.day)
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
          } catch {
            // Mismo error UX: notificamos pero no abortamos — el fijo
            // ya se creó y el user puede registrar el pago manualmente
            // desde el listado.
            //
            // Éxito PARCIAL, no fallo: por eso el háptico de advertencia y
            // el toast neutro (el rojo de `toast.error` diría que no se
            // guardó nada, y el fijo SÍ está creado).
            void triggerHaptic('warning')
            handleClose()
            // El aviso se emite DESPUÉS de que la hoja terminó de salir:
            // el `ToastHost` vive en el shell global y esta alta es una
            // stack-modal, así que un toast en el mismo tick se dibujaría
            // detrás de la hoja que se está cerrando.
            void InteractionManager.runAfterInteractions(() => {
              toast.info(t('fijos:wizard.errors.createdNotPaidTitle'), {
                durationMs: 6000,
              })
            })
            return
          }
        }
      }
      handleClose()
    } catch (error) {
      void triggerHaptic('error')
      // Título + detalle fundidos en un solo renglón: el toast reemplaza a
      // un diálogo de dos campos, no los apila.
      toast.error(
        `${
          isEditing
            ? t('fijos:wizard.errors.updateFailed')
            : t('fijos:wizard.errors.createFailed')
        } · ${getErrorMessage(error, t('states:error.server'))}`,
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
      scrollRef={scrollRef}
      contentContainerStyle={neo ? [styles.screen, styles.screenNeo] : styles.screen}
      bodyStyle={neo ? styles.bodyNeo : undefined}
      showGrabHandle
      // `add-fixed-expense` se registra con `presentation: 'modal'`
      // (`app-stack-shell.tsx`): en iOS es una hoja que arranca debajo de la
      // isla, así que el inset superior del dispositivo no le corresponde y
      // dejaba ~59pt de hueco muerto arriba del título. En Android la ruta
      // es `card` y el flag se ignora. Ver el docblock de `presentedAsSheet`.
      presentedAsSheet
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
            nameDuplicate={form.isNameDuplicate}
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
            flagDay={form.flagDay}
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
          <AnimatedPressable
            // Keep press reachable even when dimmed así un tap routea al
            // "flag missing fields" branch y pinta los unfilled inputs
            // con su warning glide. Mismo patrón que el PrimaryCTA de
            // import-review.
            onPress={onPrimaryCtaStep1}
            onPressIn={ctaStep1Press.onPressIn}
            onPressOut={ctaStep1Press.onPressOut}
            style={[
              styles.primaryCta,
              // El paso de "faltan datos" a "listo" era un corte de opacidad.
              // En neo lo glidea, que es lo que convierte el CTA en un
              // indicador de progreso y no en dos estados sin relación.
              ctaStep1Enabled,
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
          </AnimatedPressable>
          </Animated.View>
        ) : (
          <Animated.View style={ctaStep2Press.animatedStyle}>
          <AnimatedPressable
            onPress={onPrimaryCtaStep2}
            onPressIn={ctaStep2Press.onPressIn}
            onPressOut={ctaStep2Press.onPressOut}
            disabled={pending}
            style={[
              styles.primaryCta,
              ctaStep2Enabled,
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
                // Tinta única: el estado "deshabilitado" lo da el opacity 0.45
                // del Pressable, NO un fg de bajo contraste. Antes textMuted
                // (verde-claro) sobre el fill crema daba 1.14:1 en dark (ilegible).
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
          </AnimatedPressable>
          </Animated.View>
        )}
      </StickyFooter>

      {/*
        En la piel neo va el teclado del rediseño (`OnbNumpad`, el del
        onboarding): teclas extruidas, "Listo" arriba y hoja al ras del borde
        inferior. Su modelo es un ENTERO de pesos (`value*10 + dígito`), no el
        string crudo del form, así que se traduce en el borde: `form.amount` ya
        viene parseado y `serializePrice` lo devuelve al formato del form.
        OJO: los montos de fijos NO son todos enteros (numeric(12,2) en prod,
        cargados con la coma del numpad classic). `numpadBaseAmount` protege la
        edición: sobre un monto con decimales el append arranca de cero
        (tipear REEMPLAZA), y si el user no toca el numpad el decimal queda
        intacto — antes cada tecla lo corrompía (1500.5 + "3" → 15008).
      */}
      {neo ? (
        <OnbNumpad
          mode={theme.mode}
          visible={form.isNumpadVisible}
          value={numpadBaseAmount(form.amount)}
          onChange={(next) => form.setRawAmount(serializePrice(next))}
          onDone={() => form.setIsNumpadVisible(false)}
        />
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingTop: 4 },
  screenNeo: { flexGrow: 1 },
  bodyNeo: { flexGrow: 1 },
  stack: { gap: 12, paddingBottom: 40 },
  // El footer anclado ya no necesita el colchón de 40 para empujar al CTA
  // abajo — pero SÍ una separación mínima. Sin ella, en cuanto el contenido
  // llega hasta abajo (cuotas abiertas en el paso 1, el switch de "estado
  // actual" en el paso 2) el CTA queda pegado al último elemento. 18 + el
  // `paddingTop` del footer (14 / 10) da el aire del handoff en el caso corto
  // y una separación que se sostiene en el largo.
  stackNeo: { flexGrow: 1, paddingBottom: 18 },
  // Sólo la caja: el radio (20), el padding vertical (16) y el cuerpo de
  // texto (16/900) salen de `neo.add.cta`, que es la única fuente de esas
  // medidas. Antes vivían acá EN PARALELO con valores distintos (16 de
  // radio, 15/800 de texto) y el objeto neo los pisaba por orden de array:
  // un reorder los resucitaba.
  primaryCta: {
    alignItems: 'center',
    justifyContent: 'center',
    // No marginHorizontal aquí: el StickyFooter sit adentro del Screen
    // ScrollView content, que ya aplica un 20pt horizontal padding.
    // Agregar margin encima double-padea el CTA, dejándolo ~40pt más
    // estrecho que los inputs arriba.
  },
  primaryCtaText: { textAlign: 'center' },
})
