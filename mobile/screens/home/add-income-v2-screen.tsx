// Wizard de agregar ingreso (2 pasos). Hermano de `add-fijo-v2-screen.tsx` y
// de `add-gasto-v2-screen.tsx`: misma cáscara, mismo header, mismos CTAs,
// mismo escalonado.
//
//  · Paso 1 (`<Step1Form>`)    → monto + atajos + tipo de ingreso + descripción.
//  · Paso 2 (`<Step2Summary>`) → cuándo entró + impacto en el ciclo + el aviso
//                                cuando la fecha cae fuera del ciclo vigente.
//
// Reparto de responsabilidades:
//  · `useAddIncomeForm`       → TODO el estado del alta y los gates.
//  · `useIncomeCycleInputs`   → los intermedios del ciclo vigente (datos).
//  · `computeAddIncomeImpact` → la cuenta del paso 2, pura.
// Esta pantalla es el orquestador: cablea los tres, encadena el submit y
// reparte props a los pasos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Keyboard,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { CategorySticker } from '@/components/category/category-sticker'
import { Step1Form } from '@/components/gastos/add-income-parts/step1-form'
import { Step2Summary } from '@/components/gastos/add-income-parts/step2-summary'
import type { DayChoice } from '@/components/gastos/add-income-parts/day-chips'
import {
  railTileWidth,
  RAIL_TILE_HEIGHT,
  type RailTile,
} from '@/components/home/category-horizontal-rail'
import {
  OnbNumpad,
  useNumpadScrollAvoid,
} from '@/components/redesign/onboarding/onb-numpad'
import { WizardCta } from '@/components/wizard/wizard-cta'
import { WizardShell } from '@/components/wizard/wizard-shell'
import { WizardFooterHelper } from '@/components/wizard/parts/footer-helper'
import { WizardDots, WizardHeader } from '@/components/wizard/parts/step-header'
import { STEP_LAYOUT } from '@/components/wizard/step-motion'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import {
  classifyCyclePlacement,
  computeAddIncomeImpact,
} from '@/features/income/add-income-impact'
import { INCOME_KIND_BY_KEY, INCOME_KINDS } from '@/features/income/income-kinds'
import { useIncomeCycleInputs } from '@/features/income/use-income-cycle-inputs'
import {
  useAddIncomeForm,
  type IncomeDayOffset,
  type IncomeFormField,
} from '@/features/income/use-add-income-form'
import {
  useCreateIncomeEvent,
  type IncomeEventKind,
} from '@/features/income/use-income-events'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'
import { serializePrice } from '@/utils/money'
import { formatLocalDateKey } from '@/utils/pay-cycle'

export interface AddIncomeV2ScreenProps {
  familyId: string
  /**
   * Load-bearing: `useCreateIncomeEvent(userId)` lo usa para el `created_by`
   * de la fila optimista. Sin él la fila del feed entra con autor vacío hasta
   * que el server responde y el snapshot se invalida a destiempo.
   */
  userId: string
}

const SUGGESTED_DELTAS = [5000, 15000, 30000, 50000, 100000]

const QUICK_DESCRIPTION_KEYS = [
  'gastos:addIncome.quickDescriptions.transfer',
  'gastos:addIncome.quickDescriptions.bonus13th',
  'gastos:addIncome.quickDescriptions.workBonus',
  'gastos:addIncome.quickDescriptions.birthdayGift',
  'gastos:addIncome.quickDescriptions.freelance',
  'gastos:addIncome.quickDescriptions.refund',
]

/** Copia localizada del campo faltante. Sale del ENUM, no al revés: el modelo
 *  nombra los campos por id y el copy se resuelve recién acá, en el borde. */
const FIELD_LABEL_KEY: Record<IncomeFormField, string> = {
  amount: 'gastos:import.field.amount',
  kind: 'gastos:addIncome.field.incomeType',
  description: 'gastos:import.field.description',
}

/**
 * Tono del tile por tipo de ingreso.
 *
 * El rail resuelve el color con el matcher de categorías, y las claves de
 * ingreso no matchean ninguna familia: caían al hash y repetían tono en
 * columnas VECINAS (`sale`/`investment` y `aguinaldo`/`refund` daban el mismo
 * par). Acá cada kind apunta explícitamente a una familia distinta de la
 * paleta — es una llave de COLOR, no una categoría, y por eso el mapa vive en
 * la pantalla y no en el catálogo de ingresos.
 */
const KIND_HUE: Record<IncomeEventKind, string> = {
  salary_extra: 'servicios',
  freelance: 'vivienda',
  sale: 'suscripciones',
  aguinaldo: 'cuotas',
  investment: 'inversiones',
  refund: 'salud',
  gift: 'educacion',
  transfer: 'seguros',
  other: 'otros',
}

export function AddIncomeV2Screen({ familyId, userId }: AddIncomeV2ScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const { width: windowWidth } = useWindowDimensions()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo'

  const form = useAddIncomeForm()
  const { cycle, cycleStart, cycleEnd, isReady: isCycleReady } =
    useIncomeCycleInputs(familyId)
  const createMutation = useCreateIncomeEvent(userId)

  // Firma de los datos que se intentaron guardar. El error se guarda JUNTO con
  // ella y se muestra sólo mientras el form siga igual: el error gana sobre la
  // línea de "qué te falta" en la fila auxiliar, así que sin esto, borrar el
  // monto y tocar el CTA atenuado seguía mostrando el error del servidor de
  // hace un minuto en vez de "Completá monto", y la única forma de sacarlo era
  // cerrar el alta. Va DERIVADO y no en un efecto que limpie: sincronizar
  // estado con estado dispara renders en cascada (regla `set-state-in-effect`).
  // Mismo tratamiento que el alta de gasto.
  const formKey = `${form.amount}|${form.kind ?? ''}|${form.description}|${form.dayOffset}`
  // Último error de guardado, además del toast: el toast se va solo a los
  // segundos y sin esto no queda NINGUNA huella de que el guardado falló —
  // el CTA vuelve a decir "Confirmar" como si nada hubiera pasado.
  const [lastSubmitError, setLastSubmitError] = useState<
    { formKey: string; message: string } | null
  >(null)
  const submitError =
    lastSubmitError && lastSubmitError.formKey === formKey ? lastSubmitError.message : null

  // Pedido de "marcá lo que falta" diferido hasta aterrizar en el paso 1 (ver
  // `onPrimaryCtaStep2`). Va en un REF, no en estado: es un mensaje de un
  // handler al efecto, no algo que se rendee — con estado, apagarlo desde el
  // efecto es un setState en cascada.
  const flagOnLandingRef = useRef(false)

  // El numpad se monta UNA vez a nivel del orquestador (ver `keyboard` del
  // `WizardShell`), así que su visibilidad también vive acá: colgada del paso,
  // volver del 2 al 1 la reseteaba y el teclado se cerraba solo.
  const [isNumpadVisible, setNumpadVisible] = useState(false)

  // Keyboard-avoidance del numpad: la hoja mide 420 + safe area y se apoya
  // sobre el piso. En pantallas cortas (SE) con Texto Grande, la card de monto
  // queda DEBAJO y el usuario teclea a ciegas — el bug que documenta el propio
  // `useNumpadScrollAvoid` y que las tres pantallas de onboarding ya cablean.
  const scrollRef = useRef<ScrollView>(null)
  const amountRef = useRef<View>(null)
  const { onScroll: onAvoidScroll, extraBottomPad } = useNumpadScrollAvoid({
    scrollRef,
    targetRef: amountRef,
    open: isNumpadVisible && form.step === 1,
  })

  const kindTiles = useMemo<RailTile[]>(
    () =>
      INCOME_KINDS.map((k) => ({
        id: k.key,
        label: t(k.labelKey),
        hueName: KIND_HUE[k.key],
        icon: CATEGORY_ICONS[k.icon] ? (
          // La cápsula del tile ya es el pastel del hue → sin placa.
          <CategorySticker
            source={CATEGORY_ICONS[k.icon]}
            size={neo ? 42 : 32}
            onLightSurface
          />
        ) : (
          <Text allowFontScaling={false} style={styles.kindEmoji}>
            {k.emoji}
          </Text>
        ),
        accessibilityLabel: t(k.labelKey),
      })),
    [t, neo],
  )

  const quickDescriptions = useMemo(
    () => QUICK_DESCRIPTION_KEYS.map((key) => t(key)),
    [t],
  )

  const dayOptions = useMemo<DayChoice<IncomeDayOffset>[]>(
    () => [
      { value: 0, label: t('gastos:addIncome.dayChips.today') },
      { value: 1, label: t('gastos:addIncome.dayChips.yesterday') },
      { value: 2, label: t('gastos:addIncome.dayChips.dayBefore') },
    ],
    [t],
  )

  // Comparación por clave de día LOCAL (la hace `classifyCyclePlacement`):
  // comparar `Date` crudos corre el día en AR y el ingreso del último día del
  // ciclo caería "afuera". `form.eventDate` ya viene anclado al mediodía local.
  const placement = useMemo(
    () => classifyCyclePlacement(form.eventDate, cycleStart, cycleEnd),
    [form.eventDate, cycleStart, cycleEnd],
  )
  // El monto entra al cálculo SÓLO si la fecha cae adentro del ciclo vigente.
  // La query que alimenta el saldo filtra `[cycleStart, cycleEnd)`: un ingreso
  // fechado afuera no lo mueve. Pasando el monto igual, el paso 2 avisaba
  // "no va a sumar al saldo de hoy" y 8pt más abajo mostraba ANTES $120.000 →
  // AHORA $170.000. Con 0 el chip no se dibuja y las dos columnas quedan
  // iguales, que es la verdad.
  const appliedAmount = placement === 'inside' ? form.amount : 0
  const impact = useMemo(
    () => computeAddIncomeImpact({ cycle, amount: appliedAmount }),
    [cycle, appliedAmount],
  )

  const selectedKind = form.kind ? INCOME_KIND_BY_KEY[form.kind] : null
  const selectedKindIconSource = selectedKind ? CATEGORY_ICONS[selectedKind.icon] : undefined

  const handleOpenNumpad = useCallback(() => {
    // Cualquier tap en un control que no sea de texto cierra el teclado, así
    // el formulario se lee como uno solo y no como dos capas superpuestas.
    Keyboard.dismiss()
    setNumpadVisible(true)
  }, [])

  // Colgados del MIEMBRO que usan, NUNCA del objeto `form` entero: `form` se
  // memoiza con `description` entre sus deps, así que cada tecla lo devuelve
  // con identidad nueva y recreaba todos estos callbacks. El que más duele es
  // `handleSelectKind`: viaja al `<Tile>` memoizado del rail, que pide
  // explícitamente que `onSelect` llegue estable. Misma forma que el hermano
  // de gasto — una sola manera en los dos wizards. Se DESESTRUCTURAN antes de
  // los `useCallback` para que la dependencia sea el miembro y no el objeto
  // (con `[form.setKind]` en el array, `exhaustive-deps` y el compilador
  // infieren `form` entero y se quejan).
  const {
    setRawAmount,
    setKind,
    setDescription,
    setDayOffset,
    addQuickAmount,
    clearAmount,
  } = form

  const handleNumpadChange = useCallback(
    (next: number) => setRawAmount(serializePrice(next)),
    [setRawAmount],
  )
  const handleNumpadDone = useCallback(() => setNumpadVisible(false), [])

  const handleAddQuickAmount = useCallback(
    (delta: number) => {
      Keyboard.dismiss()
      void triggerHaptic('selection')
      addQuickAmount(delta)
    },
    [addQuickAmount],
  )
  const handleClearAmount = useCallback(() => {
    Keyboard.dismiss()
    clearAmount()
  }, [clearAmount])

  const handleSelectKind = useCallback(
    (kind: IncomeEventKind) => {
      // El háptico lo dispara el rail al seleccionar (mismo patrón que el de
      // categorías en add-gasto / add-fijo).
      Keyboard.dismiss()
      setKind(kind)
    },
    [setKind],
  )

  // Elegir una sugerencia es un commit: el usuario ya decidió esa etiqueta y
  // no tiene sentido dejarle el input enfocado.
  const handleSelectQuickDescription = useCallback(
    (value: string) => {
      Keyboard.dismiss()
      void triggerHaptic('selection')
      setDescription(value)
    },
    [setDescription],
  )

  const handleSelectDay = useCallback(
    (offset: IncomeDayOffset) => {
      Keyboard.dismiss()
      setDayOffset(offset)
    },
    [setDayOffset],
  )

  const handleClose = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/home')
  }, [router])

  // Cerrar la hoja con swipe-down desde el paso 2 cierra el alta ENTERA: el
  // gesto lo maneja el modal de la ruta, que desmonta esta pantalla con su
  // estado de paso adentro. No hay nada que interceptar — y no debe haberlo:
  // volver al paso 1 con un gesto que dice "salir" sería mentir.
  const onHeaderBack = useCallback(() => {
    // `goBack()` devuelve false en el paso 1 ⇒ ahí "atrás" es cerrar el alta.
    if (!form.goBack()) handleClose()
  }, [form, handleClose])

  const onPrimaryCtaStep1 = useCallback(() => {
    setNumpadVisible(false)
    Keyboard.dismiss()
    if (form.goNext()) {
      // Feedback al avanzar al impacto — antes el salto de paso era mudo.
      void triggerHaptic('selection')
      return
    }
    void triggerHaptic('warning')
  }, [form])

  // Doble submit: además de crear el evento, el éxito dispara un push a la
  // familia. `pending` tarda un render en encenderse, así que dos taps seguidos
  // entraban los dos —y mandaban DOS pushes— antes de que el botón se
  // bloqueara. El ref corta en el mismo tick; `pending` queda para lo visual.
  const isSubmittingRef = useRef(false)
  const pending = createMutation.isPending

  // La hoja se puede cerrar con swipe-down MIENTRAS la mutación está en vuelo:
  // el gesto lo maneja el modal de la ruta y desmonta esta pantalla, pero la
  // continuación del `await` sigue viva. Sin este guard, el `handleClose()` del
  // éxito corría 2-3s después y hacía `router.back()` sobre la pantalla que
  // para entonces está arriba, sacando de la vista al usuario que ya se había
  // ido a otro lado. Idem el aviso del fallo. Mismo guard que el alta de gasto.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleConfirm = useCallback(async () => {
    if (isSubmittingRef.current) return
    const kind = form.kind
    if (!kind) return
    isSubmittingRef.current = true
    setLastSubmitError(null)
    try {
      await createMutation.mutateAsync({
        familyId,
        amount: form.amount,
        kind,
        description: form.description.trim(),
        // Clave de día LOCAL: `new Date('YYYY-MM-DD')` UTC-parsea y corre el
        // día en AR. `form.eventDate` ya viene al mediodía local.
        eventDate: formatLocalDateKey(form.eventDate),
        // El reintento de este flujo es el CTA, no el toast del hook: aquel
        // reintenta por un camino que no pasa por `isSubmittingRef` ni cierra
        // la hoja, así que un retry exitoso desde el toast dejaba al usuario
        // en el paso 2 sin señal y un "Confirmar" más creaba la fila DOS veces.
        skipRetryToast: true,
      })
      if (!isMountedRef.current) return
      void triggerHaptic('success')
      handleClose()
    } catch (error) {
      isSubmittingRef.current = false
      if (!isMountedRef.current) return
      void triggerHaptic('error')
      const message = getErrorMessage(error, t('gastos:addIncome.retryLater'))
      // Persistido además del toast: apagado el toast no quedaría ninguna
      // huella del fallo y el CTA volvería a "Confirmar" como si nada. Anclado
      // a los datos que fallaron (ver `formKey`): apenas el usuario edita algo,
      // el mensaje dejó de describir el estado y se va solo.
      setLastSubmitError({ formKey, message })
      toast.error(`${t('gastos:addIncome.wizard.errors.createFailed')} · ${message}`)
    }
  }, [createMutation, familyId, form, formKey, handleClose, t])

  const onPrimaryCtaStep2 = useCallback(() => {
    if (pending || isSubmittingRef.current) return
    if (!form.canSubmit) {
      // Llegar acá sin poder confirmar significa que un campo del paso 1 dejó
      // de ser válido con la hoja abierta. Se vuelve al paso 1, que es donde
      // se arregla, y se pide marcarlo: `flagMissing` marca el paso ACTUAL y
      // los tres campos mapean al 1, así que llamarlo ANTES de navegar no
      // pintaría nada. El efecto de abajo lo dispara ya aterrizado.
      void triggerHaptic('warning')
      flagOnLandingRef.current = true
      form.goBack()
      return
    }
    void handleConfirm()
  }, [pending, form, handleConfirm])

  // Rebote del paso 2 al 1: sin esto el usuario aterrizaba sin ningún campo
  // marcado y con el CTA diciendo "Completá los datos" sin nombrar cuáles.
  useEffect(() => {
    if (!flagOnLandingRef.current || form.step !== 1) return
    flagOnLandingRef.current = false
    form.flagMissing()
  }, [form])

  const missingLabels = form.flaggedFields.map((f) => t(FIELD_LABEL_KEY[f]))

  return (
    <WizardShell
      step={form.step}
      scrollRef={scrollRef}
      onScroll={onAvoidScroll}
      extraBottomPad={extraBottomPad}
      footerPaddingTop={form.step === 1 ? 14 : 10}
      footer={
        <View style={styles.footerStack}>
          {form.step === 1 ? (
            <WizardCta
              label={
                form.canContinue
                  ? t('gastos:addIncome.wizard.cta.seeImpact')
                  : t('gastos:addIncome.wizard.cta.completeData')
              }
              accessibilityLabel={
                form.canContinue
                  ? t('gastos:addIncome.wizard.cta.seeImpactA11y')
                  : t('gastos:addIncome.wizard.cta.completeDataA11y')
              }
              ready={form.canContinue}
              onPress={onPrimaryCtaStep1}
            />
          ) : (
            <WizardCta
              variant="confirm"
              label={
                pending
                  ? t('gastos:addIncome.wizard.cta.saving')
                  : t('gastos:addIncome.wizard.cta.confirm')
              }
              accessibilityLabel={t('gastos:addIncome.wizard.cta.confirmA11y')}
              ready={form.canSubmit}
              pending={pending}
              onPress={onPrimaryCtaStep2}
            />
          )}
          {/* Fila auxiliar del kit, la MISMA que monta el alta de gasto: sin
              la tercera rama esta fila quedaba vacía ocupando su alto
              reservado, un hueco mudo debajo del CTA. La precedencia (error →
              faltantes → eslogan), el `minHeight` y las medidas viven en el
              componente compartido; acá sólo se dice qué tiene para decir cada
              rama. El eslogan es del paso 1 nada más — en el 2 el usuario ya
              está confirmando. */}
          <WizardFooterHelper
            error={submitError}
            missingLabels={missingLabels}
            tagline={form.step === 1 ? t('gastos:addIncome.wizard.habitTagline') : null}
          />
        </View>
      }
      keyboard={
        /*
          Teclado del rediseño (el del onboarding): teclas extruidas, "Listo"
          arriba y hoja al ras del borde inferior. Su modelo es un ENTERO de
          pesos (`value*10 + dígito`), no el string crudo del form, así que se
          traduce en el borde. Se monta UNA sola vez, fuera de los pasos: colgado
          del paso perdía su estado al volver.
        */
        <OnbNumpad
          mode={theme.isDark ? 'dark' : 'light'}
          visible={isNumpadVisible}
          value={Math.trunc(form.amount)}
          onChange={handleNumpadChange}
          onDone={handleNumpadDone}
        />
      }
    >
      <Animated.View layout={STEP_LAYOUT}>
        <WizardHeader
          title={
            form.step === 1
              ? t('gastos:addIncome.wizard.stepNew')
              : t('gastos:addIncome.wizard.stepReview')
          }
          onBack={onHeaderBack}
          backAccessibilityLabel={
            form.step === 2
              ? t('gastos:addIncome.wizard.backToPrevious')
              : t('gastos:addIncome.wizard.close')
          }
        />
      </Animated.View>

      <Animated.View layout={STEP_LAYOUT}>
        <WizardDots step={form.step} total={2} />
      </Animated.View>

      {form.step === 1 ? (
        <Step1Form
          amount={form.amount}
          amountRef={amountRef}
          onPressAmount={handleOpenNumpad}
          isNumpadVisible={isNumpadVisible}
          onAddQuickAmount={handleAddQuickAmount}
          onClearAmount={handleClearAmount}
          suggestedAmounts={SUGGESTED_DELTAS}
          kindTiles={kindTiles}
          kind={form.kind}
          onSelectKind={handleSelectKind}
          tileWidth={railTileWidth(windowWidth)}
          tileHeight={RAIL_TILE_HEIGHT}
          description={form.description}
          onChangeDescription={form.setDescription}
          quickDescriptions={quickDescriptions}
          onSelectQuickDescription={handleSelectQuickDescription}
          flagAmount={form.isFieldFlagged('amount')}
          flagKind={form.isFieldFlagged('kind')}
          flagDescription={form.isFieldFlagged('description')}
        />
      ) : (
        <Step2Summary
          amount={form.amount}
          description={form.description.trim()}
          kindLabel={selectedKind ? t(selectedKind.labelKey) : ''}
          kindIcon={
            selectedKindIconSource ? (
              <CategorySticker source={selectedKindIconSource} size={32} onLightSurface />
            ) : null
          }
          dayOffset={form.dayOffset}
          dayOptions={dayOptions}
          onSelectDay={handleSelectDay}
          impact={impact}
          placement={placement}
          isReady={isCycleReady}
        />
      )}
    </WizardShell>
  )
}

const styles = StyleSheet.create({
  footerStack: { gap: 8 },
  // Fallback cuando el sticker no resuelve (los 9 kinds tienen sticker).
  kindEmoji: {
    fontSize: 21,
    lineHeight: 23,
    textAlign: 'center',
    includeFontPadding: false,
  },
})
