// Alta de gasto — UNA sola pantalla (2026-08-17).
//
// Era un wizard de 2 pasos y el segundo no pedía nada: `canSubmit` evaluaba
// idéntico a `canContinue` porque nota y fecha eran opcional y de sólo lectura.
// O sea que cobraba un tap de CTA por mostrar el impacto, y el impacto ahora
// vive EN VIVO arriba del botón que lo confirma. El recorrido pasó de ~1460pt y
// dos taps de CTA a una columna de ~700pt en reposo y un tap.
//
//  · `<GastoForm>`    → monto + atajos + categoría + descripción + nota.
//  · `<ImpactStrip>`  → la tira de "te queda hoy", pegada arriba del CTA.
//  · `<ImpactDetailSheet>` → el desglose opcional (columnas, delta, Brot).
//
// Reparto de responsabilidades:
//  · `useAddExpenseForm`       → TODO el estado del alta y el gate ÚNICO.
//  · `useAddExpenseController` → datos (categorías, ranking, sugerencias) y la
//                                mutación. No tiene estado de formulario.
//  · `computeAddExpenseImpact` → la cuenta de la tira, pura.
// Esta pantalla es el orquestador: cablea los tres y encadena el submit.
//
// NOTA sobre las keys de i18n: siguen bajo `wizard.step1.*` / `wizard.step2.*`.
// Son identificadores heredados de la época de dos pasos y NO se renombraron a
// propósito: `edit-gasto-sheet.tsx` y `for-date-label.ts` comparten varias de
// ellas, así que la limpieza cosmética arrastraría dos superficies aprobadas
// que este cambio no toca.
//
// Los hermanos de FIJO (`add-fijo-v2-screen`) y de INGRESO
// (`add-income-v2-screen`) siguen siendo wizards de 2 pasos y montan el mismo
// kit (`components/wizard/`) sin cambios: acá no se tocó ninguna pieza
// compartida, sólo se dejó de montar `<WizardDots>`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Keyboard,
  StyleSheet,
  useWindowDimensions,
  View,
  type ScrollView,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { BackdatePill } from '@/components/gastos/add-gasto-parts/backdate-pill'
import { GastoForm } from '@/components/gastos/add-gasto-parts/gasto-form'
import { ImpactDetailSheet } from '@/components/gastos/add-gasto-parts/impact-detail-sheet'
import { ImpactStrip } from '@/components/gastos/add-gasto-parts/impact-strip'
import { railTileWidth, RAIL_TILE_HEIGHT } from '@/components/home/category-horizontal-rail'
import {
  OnbNumpad,
  useNumpadScrollAvoid,
} from '@/components/redesign/onboarding/onb-numpad'
import { NeoStateBlock } from '@/components/ui/neo-state-block'
import { RiseView } from '@/components/home/animated/rise-view'
import { WizardCta } from '@/components/wizard/wizard-cta'
import { WizardShell } from '@/components/wizard/wizard-shell'
import { WizardFooterHelper } from '@/components/wizard/parts/footer-helper'
import { WizardHeader } from '@/components/wizard/parts/step-header'
import { STEP_LAYOUT } from '@/components/wizard/step-motion'
import { computeAddExpenseImpact } from '@/features/expenses/add-expense-impact'
import {
  useAddExpenseController,
  useVariableExpenseCategories,
} from '@/features/expenses/use-add-expense-controller'
import {
  useAddExpenseForm,
  type AddExpenseField,
} from '@/features/expenses/use-add-expense-form'
import { useGastosExpensesForDay } from '@/features/gastos/use-gastos-endpoints'
import { useHomeMetrics } from '@/features/home/use-home-metrics'
// Del alta de INGRESO por reuso deliberado, no por acoplamiento: los dos son
// "intermedios del ciclo vigente" y clasificar una fecha contra la ventana del
// ciclo es la misma cuenta en los dos flujos. Derivar acá una segunda versión
// de `hasCycleOverride` o de la ventana las dejaría derivar en silencio.
import { classifyCyclePlacement } from '@/features/income/add-income-impact'
import { useIncomeCycleInputs } from '@/features/income/use-income-cycle-inputs'
import { useControlV2Data } from '@/features/insights/use-control-v2-data'
import { triggerHaptic } from '@/lib/haptics'
import { toast } from '@/lib/toast-bus'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'
import { serializePrice } from '@/utils/money'
import { formatLocalDateKey } from '@/utils/pay-cycle'

export interface AddGastoV2ScreenProps {
  familyId: string
  userId: string
  /** Día al que se estampa el gasto ("registrar gasto olvidado" del calendario
   *  de Gastos). `null` == hoy. */
  initialForDate?: Date | null
  /** Prefill del Asistente / OCR. Sólo semilla: después manda el usuario. */
  prefillAmount?: number
  prefillDescription?: string
}

/** Copia localizada del campo faltante. Sale del ENUM, no al revés: el modelo
 *  nombra los campos por id y el copy se resuelve recién acá, en el borde. */
const FIELD_LABEL_KEY: Record<AddExpenseField, string> = {
  amount: 'gastos:import.field.amount',
  category: 'gastos:import.field.category',
  description: 'gastos:import.field.description',
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function AddGastoV2Screen({
  familyId,
  userId,
  initialForDate = null,
  prefillAmount,
  prefillDescription,
}: AddGastoV2ScreenProps) {
  const router = useRouter()
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const { width: windowWidth } = useWindowDimensions()

  // El catálogo se pide ANTES que el controller: el validador de categoría que
  // consume el form sale de acá, y el `categoryId` del form es lo que el
  // controller necesita para sugerir descripciones. Ver el docblock de
  // `useVariableExpenseCategories`.
  const { categories, categoriesQuery } = useVariableExpenseCategories(familyId)
  // Va como función y no como booleano a propósito: espejar el `categoryId`
  // del hook para validarlo metía un render de lag en el que `canSubmit`
  // parpadeaba a false justo después de elegir la categoría.
  const isCategoryIdValid = useCallback(
    (id: string) => categories.some((c) => c.id === id),
    [categories],
  )

  const form = useAddExpenseForm({
    isCategoryIdValid,
    prefillAmount,
    prefillDescription,
    initialForDate,
  })
  const controller = useAddExpenseController({
    familyId,
    userId,
    selectedCategoryId: form.categoryId,
  })
  // Señales del asesor: salen de la query cacheada de Control, así que el
  // banner no agrega red.
  const { signals: advisorSignals } = useControlV2Data(familyId)

  // El cupo diario y el "hay ingreso configurado" salen del hero del Home —
  // la cuenta CANÓNICA (`computeCycleDisponible`), la misma que espeja el push
  // diario. NO se usa el cupo de la pantalla Gastos, que aplica buffer y es
  // otra superficie con otra cuenta.
  const { hero } = useHomeMetrics(familyId)
  // Ventana del ciclo vigente + readiness. Salen del MISMO hook que usa el
  // alta de ingreso para no tener dos derivaciones del ciclo que puedan
  // separarse. (La rama por la que se compuso el cupo ya no hace falta acá: el
  // gasto de hoy se resta en las dos, ver el impacto más abajo.)
  const { cycleStart, cycleEnd, isReady: isCycleReady } =
    useIncomeCycleInputs(familyId)

  // Dónde cae el día destino respecto del ciclo VIGENTE. Sólo se clasifica el
  // back-date: el alta de hoy siempre habla del cupo de hoy. Un gasto fechado
  // fuera de la ventana no entra en `var_cycle` del ciclo vigente, así que el
  // impacto sobre el cupo de hoy es CERO y no se puede afirmar.
  const placement = useMemo(
    () =>
      form.forDate
        ? classifyCyclePlacement(form.forDate, cycleStart, cycleEnd)
        : 'inside',
    [form.forDate, cycleStart, cycleEnd],
  )
  const affectsCurrentCycle = placement === 'inside'

  // Gasto variable ya registrado en el día DESTINO. Cuando el alta viene
  // back-dateada, comparar contra lo gastado hoy mezclaría dos días: el gasto
  // se estampa en el día de la píldora, así que el "antes" es el de ese día.
  //
  // Para un día pasado NO alcanza la lista cacheada (`controller.expenses`):
  // `home_snapshot` la siembra con las 120 filas más recientes y el query tiene
  // `staleTime` de 5 min, así que en una familia de uso intenso un día de hace
  // dos semanas queda afuera y el "antes" salía en 0 (cupo entero libre) para
  // un día en el que sí se gastó. Ahí se pide el total del día al MISMO
  // endpoint que alimenta el day-detail de Gastos. Para hoy la lista sirve: son
  // las filas más recientes, siempre dentro del tope.
  // El back-date pide el día por RPC en las DOS ramas. Antes la de override se
  // salteaba (el cupo ya venía neteado y el "antes" iba en 0); ahora que el
  // gasto del día se resta siempre, saltearla dejaría el "antes" a merced del
  // feed paginado, que no llega a los días viejos — que es justo el agujero
  // que este RPC vino a tapar.
  const targetDayIso =
    form.forDate && affectsCurrentCycle ? formatLocalDateKey(form.forDate) : null
  const forDayQuery = useGastosExpensesForDay({ familyId, isoDate: targetDayIso })

  /**
   * Para HOY el "antes" sale del hero, no de la lista de esta pantalla.
   *
   * Cada superficie lo derivaba por su cuenta —el hero desde el snapshot del
   * dashboard, el impacto sumando `controller.expenses` filtradas por día— y
   * las dos listas no son la misma: la del controller es el feed paginado de
   * Gastos. Bastaba que difirieran en una fila para que el impacto no
   * coincidiera con la card de la Home, que es exactamente lo que reportó el
   * owner. Con el mismo número no pueden discrepar.
   *
   * El back-date SÍ sigue pidiendo el día por RPC: el hero sólo sabe de hoy.
   */
  const spentOnTargetDay = useMemo(() => {
    if (!targetDayIso && isSameLocalDay(form.forDate ?? new Date(), new Date())) {
      return hero.spentToday
    }
    if (targetDayIso) {
      // Los pagos de fijos no consumen el cupo variable (el cupo ya los
      // reserva), igual que el filtro de `controller.expenses`.
      return (forDayQuery.data ?? []).reduce(
        (sum, e) => (e.commitment_id ? sum : sum + e.price),
        0,
      )
    }
    // Único caso que queda: día destino FUERA del ciclo vigente. Ahí el gasto
    // no toca el cupo de hoy, el monto entra en 0 y la tira muestra el aviso de
    // "fuera del ciclo" en vez de una comparación, así que no hay "antes" que
    // afirmar.
    return 0
  }, [form.forDate, forDayQuery.data, targetDayIso, hero.spentToday])

  // La tira no puede afirmar nada hasta que estén el ciclo Y el total del día
  // destino: con las queries frías el cupo vale 0, `incomeConfigured` sale
  // false y se le ofrecía el setup de ingreso a un hogar que tiene sueldo
  // cargado hace meses. Mismo gate que el alta de ingreso (`isReady`).
  // `isError` además de `isLoading`: en react-query v5 `isLoading` es
  // `isPending && isFetching`, así que con la query FALLADA vale false y el
  // impacto se daba por listo con `data === undefined` — o sea "antes = $0",
  // cupo entero libre, para un día en el que sí se había gastado.
  const isImpactReady =
    isCycleReady && !forDayQuery.isLoading && !forDayQuery.isError

  /**
   * El "antes" del impacto se CONGELA al confirmar.
   *
   * `useCreateExpense` es OPTIMISTA: en el mismo tick del confirmar la fila ya
   * entra en la lista, y de ahí sale `hero.spentToday`. Como esta pantalla
   * sigue montada mientras la mutación viaja (el `handleClose()` recién corre
   * al resolver), la tira recalculaba con un "antes" que YA tenía el gasto
   * adentro y encima le volvía a restar `amount`: el impacto mostraba el gasto
   * DOS VECES y la perilla daba un segundo salto. Reportado por el owner.
   *
   * Se congela lo que había ANTES de tocar Confirmar. Si la mutación falla, el
   * optimista se revierte y se descongela para que el reintento vuelva a medir
   * contra el estado real.
   */
  const [frozenImpactBase, setFrozenImpactBase] = useState<{
    spentToday: number
    openingDailyBudget: number
  } | null>(null)
  const impactSpentToday = frozenImpactBase?.spentToday ?? spentOnTargetDay
  const impactOpeningBudget =
    frozenImpactBase?.openingDailyBudget ?? hero.openingDailyBudget

  const impact = useMemo(
    () =>
      computeAddExpenseImpact({
        // El cupo de APERTURA del día, el mismo que rotula la card de la Home.
        // En la rama bruta es idéntico a `dailyBudget`; en la otra le devuelve
        // la parte del gasto de hoy que el cupo ya tenía descontada, así las
        // dos pantallas parten de la misma base.
        dailyBudget: impactOpeningBudget,
        // Se resta SIEMPRE, en las dos ramas.
        //
        // El viejo `cupoAlreadyNetsSpend ? 0 : …` existía porque la base era
        // `dailyBudget`, que en la rama override YA venía con el gasto de hoy
        // descontado. La base ahora es la APERTURA del día, que justamente le
        // devuelve ese descuento para poder mostrarlo como "gastado": si acá
        // se pasara 0, el "antes" saldría inflado por todo lo del día y la
        // tira volvería a contradecir a la card — el mismo síntoma, del otro
        // lado. Con la apertura como base, las dos ramas se cuentan igual.
        spentToday: impactSpentToday,
        // Fuera del ciclo vigente el gasto no mueve el cupo de hoy: con 0 las
        // dos columnas quedan iguales, que es la verdad (la tira muestra el
        // aviso, ver `impactApplies`).
        amount: affectsCurrentCycle ? form.amount : 0,
        incomeConfigured: hero.incomeConfigured,
      }),
    [
      impactOpeningBudget,
      hero.incomeConfigured,
      impactSpentToday,
      affectsCurrentCycle,
      form.amount,
    ],
  )

  const categoryNameById = useMemo(
    () => new Map(controller.rankedCategories.map((c) => [c.id, c.name])),
    [controller.rankedCategories],
  )

  // Firma de los datos que se intentaron guardar. El error se guarda JUNTO con
  // ella y se muestra sólo mientras el form siga igual: el error gana sobre la
  // línea de "qué te falta" en la fila auxiliar, así que sin esto, borrar el
  // monto y tocar el CTA atenuado seguía mostrando el error del servidor de
  // hace un minuto en vez de "Completá monto", y la única forma de sacarlo era
  // cerrar el alta. Va DERIVADO y no en un efecto que limpie: sincronizar
  // estado con estado dispara renders en cascada (regla `set-state-in-effect`).
  const formKey = `${form.amount}|${form.categoryId}|${form.description}|${form.notes}|${
    form.forDate?.getTime() ?? ''
  }`
  // Último error de guardado, además del toast: el toast se va solo a los
  // segundos y sin esto no queda NINGUNA huella de que el guardado falló —
  // el CTA vuelve a decir "Confirmar" como si nada hubiera pasado.
  const [lastSubmitError, setLastSubmitError] = useState<
    { formKey: string; message: string } | null
  >(null)
  const submitError =
    lastSubmitError && lastSubmitError.formKey === formKey ? lastSubmitError.message : null

  // ── Teclado numérico ────────────────────────────────────────────────
  const [isNumpadVisible, setNumpadVisible] = useState(false)

  // Keyboard-avoidance del numpad: la hoja mide 420 + safe area y se apoya
  // sobre el piso. En pantallas cortas (SE) con Texto Grande, la card de monto
  // queda DEBAJO y el usuario teclea a ciegas — el bug que documenta el propio
  // `useNumpadScrollAvoid` y que ya cablean el onboarding y el alta de ingreso.
  const scrollRef = useRef<ScrollView>(null)
  const amountRef = useRef<View>(null)
  const { onScroll: onAvoidScroll, extraBottomPad } = useNumpadScrollAvoid({
    scrollRef,
    targetRef: amountRef,
    open: isNumpadVisible,
  })

  const handleOpenNumpad = useCallback(() => {
    // Cualquier tap en un control que no sea de texto cierra el teclado, así
    // el formulario se lee como uno solo y no como dos capas superpuestas.
    Keyboard.dismiss()
    setNumpadVisible(true)
  }, [])

  // Colgados del MIEMBRO que usan, NUNCA del objeto `form` entero: `form` se
  // memoiza con `description`/`notes` entre sus deps, así que cada tecla lo
  // devuelve con identidad nueva y estos callbacks se recreaban todos. El que
  // más duele es `handleSelectCategory`: viaja a `CategoryHorizontalRail` →
  // `TileRail` → `<Tile>`, que está memoizado JUSTAMENTE con la condición de
  // que `onSelect` llegue estable (ver su docblock). Con la identidad rota,
  // tipear "Cafetería" re-renderizaba los ~14 tiles del catálogo 9 veces, cada
  // uno pagando su skin + 3 `useAnimatedStyle`.
  // `setRawPrice` / `setCategoryId` / `setDescription` son setters de
  // `useState` y `clearAmount` un `useCallback([])`: identidad fija de por
  // vida. Se DESESTRUCTURAN antes de los `useCallback` para que la dependencia
  // sea el miembro y no el objeto (con `[form.setRawPrice]` en el array, tanto
  // `exhaustive-deps` como el compilador infieren `form` entero y se quejan).
  const {
    setRawPrice,
    setCategoryId,
    setDescription,
    addQuickAmount,
    clearAmount,
    flagMissing,
  } = form

  const handleNumpadChange = useCallback(
    (next: number) => setRawPrice(serializePrice(next)),
    [setRawPrice],
  )
  const handleNumpadDone = useCallback(() => setNumpadVisible(false), [])

  // `addQuickAmount` sí cambia con el monto crudo (lo suma sobre el actual),
  // pero NO con la descripción: el rail y el numpad dejan de recrearse por
  // tecla igual.
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
  const handleSelectCategory = useCallback(
    (id: string) => {
      Keyboard.dismiss()
      setCategoryId(id)
    },
    [setCategoryId],
  )
  // Elegir una sugerencia es un commit: el usuario ya decidió esa etiqueta y
  // no tiene sentido dejarle el input enfocado.
  const handleSelectSuggestion = useCallback(
    (value: string) => {
      Keyboard.dismiss()
      void triggerHaptic('selection')
      setDescription(value)
    },
    [setDescription],
  )

  const handleClose = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/expenses')
  }, [router])

  // ── Hoja de detalle del impacto ────────────────────────────────────
  const [isDetailVisible, setDetailVisible] = useState(false)
  const handleOpenDetail = useCallback(() => {
    // El numpad se apoya sobre el piso y la hoja sube desde ahí: dejarlo
    // abierto las apila y el `numpadOffset` que lee `ModalCard` le empuja el
    // contenido 420pt hacia arriba.
    setNumpadVisible(false)
    Keyboard.dismiss()
    void triggerHaptic('selection')
    setDetailVisible(true)
  }, [])
  const handleCloseDetail = useCallback(() => setDetailVisible(false), [])

  // Doble submit: `pending` tarda un render en encenderse, así que dos taps
  // seguidos entraban los dos antes de que el botón se bloqueara. El ref corta
  // en el mismo tick; el `pending` sigue existiendo para el estado visual.
  const isSubmittingRef = useRef(false)
  const pending = controller.createExpenseMutation.isPending

  // La hoja se puede cerrar con swipe-down MIENTRAS la mutación está en vuelo:
  // el gesto lo maneja el modal de la ruta y desmonta esta pantalla, pero la
  // continuación del `await` sigue viva. Sin este guard, el `handleClose()` del
  // éxito corría 2-3s después y hacía `router.back()` sobre la pantalla que
  // para entonces está arriba — al usuario que ya había vuelto al calendario de
  // Gastos se lo sacaba de la vista sin que tocara nada. Idem el aviso del
  // fallo, que aparecía sobre otra pantalla.
  const isMountedRef = useRef(true)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleConfirm = useCallback(async () => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    // ANTES de mutar: lo que se congela es el estado previo al gasto. El
    // optimista puede aterrizar en este mismo tick, y a partir de ahí el
    // "antes" en vivo ya viene contaminado.
    setFrozenImpactBase({
      spentToday: spentOnTargetDay,
      openingDailyBudget: hero.openingDailyBudget,
    })
    setLastSubmitError(null)
    try {
      await controller.createExpenseMutation.mutateAsync({
        categoryId: form.categoryId,
        description: form.description.trim(),
        // `notes` va crudo: `normalizeExpenseNotes` del repositorio ya hace
        // trim + vacío→null + tope de largo.
        notes: form.notes,
        price: form.amount,
        // Back-date al mediodía LOCAL del día destino: evita los bordes de DST
        // y mantiene el gasto en el día que el usuario eligió aunque cambie de
        // zona horaria.
        createdAt: form.forDate
          ? new Date(
              form.forDate.getFullYear(),
              form.forDate.getMonth(),
              form.forDate.getDate(),
              12,
              0,
              0,
              0,
            ).toISOString()
          : undefined,
        // El reintento de este flujo es el CTA de la pantalla, no el toast del
        // hook: aquel reintenta por un camino que NO pasa por
        // `isSubmittingRef` ni cierra la hoja, así que un retry exitoso desde
        // el toast dejaba al usuario mirando un alta que decía que falló y un
        // "Confirmar" más entraba el gasto DOS veces.
        skipRetryToast: true,
      })
      if (!isMountedRef.current) return
      void triggerHaptic('success')
      handleClose()
    } catch (error) {
      isSubmittingRef.current = false
      // Falló: el optimista se revirtió, así que el "antes" en vivo vuelve a
      // ser el bueno y el reintento tiene que medir contra él.
      setFrozenImpactBase(null)
      if (!isMountedRef.current) return
      void triggerHaptic('error')
      const message = getErrorMessage(error, t('states:error.server'))
      // Persistido además del toast: apagado el toast no quedaría ninguna
      // huella del fallo y el CTA volvería a "Confirmar" como si nada. Anclado
      // a los datos que fallaron (ver `formKey`): apenas el usuario edita algo,
      // el mensaje dejó de describir el estado y se va solo.
      setLastSubmitError({ formKey, message })
      toast.error(`${t('gastos:addExpense.wizard.errors.createFailed')} · ${message}`)
    }
  }, [
    controller.createExpenseMutation,
    form,
    formKey,
    handleClose,
    t,
    spentOnTargetDay,
    hero.openingDailyBudget,
  ])

  /**
   * ÚNICO CTA de la pantalla.
   *
   * El gate no cambió de semántica al fusionar los pasos: `canSubmit` ya era
   * idéntico a `canContinue` (el paso 2 no agregaba requisitos), sólo que
   * ahora es UN solo valor derivado de `missingFields` en vez de dos que
   * podían separarse. El botón nunca va `disabled`: con datos faltantes se
   * atenúa, el tap igual llega y lo que produce es el resaltado de los campos.
   */
  const onPrimaryCta = useCallback(() => {
    if (pending || isSubmittingRef.current) return
    // El numpad tapa el piso de la pantalla: con él abierto los campos
    // marcados quedarían fuera de vista justo cuando se los acaba de marcar.
    setNumpadVisible(false)
    Keyboard.dismiss()
    if (!form.canSubmit) {
      void triggerHaptic('warning')
      flagMissing()
      return
    }
    void handleConfirm()
  }, [pending, form.canSubmit, flagMissing, handleConfirm])

  // ── Estados de carga del catálogo ──────────────────────────────────
  const categoriesLoadError = categoriesQuery.error
  const shouldShowErrorState = Boolean(categoriesLoadError && !categoriesQuery.data)
  const hasNoCategories = !categoriesQuery.isLoading && categories.length === 0

  if (shouldShowErrorState || hasNoCategories) {
    // MISMA cáscara que el alta, no el `Screen` estándar: estos dos caminos
    // viven adentro de la misma hoja modal donde un segundo antes había un
    // formulario neumórfico, y con el header de la app sobre `canvas` se leían
    // como una pantalla de otra época. La acción va al footer (el único lugar
    // donde el rediseño pone un CTA), así que los estados se montan SIN su
    // botón propio para no duplicarlo.
    //
    // Las dos ramas comparten CTA: con catálogo global un catálogo vacío sin
    // error es una anomalía de carga, no un estado real. Antes decía "Crear
    // categoría" y navegaba a la tab Gastos: dos promesas falsas (la creación
    // de categorías se retiró del alcance del usuario el 2026-08-16).
    return (
      <WizardShell
        step={1}
        footer={
          <WizardCta
            label={t('states:errorState.action')}
            accessibilityLabel={t('states:errorState.action')}
            ready
            onPress={() => {
              void categoriesQuery.refetch()
            }}
          />
        }
      >
        <WizardHeader
          title={t('gastos:addExpense.title')}
          onBack={handleClose}
          backAccessibilityLabel={t('gastos:addExpense.wizard.close')}
        />
        {shouldShowErrorState ? (
          <NeoStateBlock
            icon="error-outline"
            description={getErrorMessage(categoriesLoadError, t('states:error.server'))}
            title={t('gastos:addExpense.formErrorTitle')}
            tone="error"
          />
        ) : (
          <NeoStateBlock
            icon="category"
            title={t('states:empty.categories.title')}
            description={t('states:empty.categories.description')}
          />
        )}
      </WizardShell>
    )
  }

  const missingLabels = form.flaggedFields.map((f) => t(FIELD_LABEL_KEY[f]))

  return (
    <>
      <WizardShell
        // Constante: la cáscara la usa para devolver el scroll arriba al
        // cambiar de paso, y acá no hay pasos.
        step={1}
        scrollRef={scrollRef}
        onScroll={onAvoidScroll}
        extraBottomPad={extraBottomPad}
        footer={
          <View style={styles.footerStack}>
            {/* La tira vive en el FOOTER y no al final de la columna: es el
                contexto de la decisión que el botón de abajo ejecuta, y desde
                acá ninguna cantidad de scroll puede separarlos. */}
            <ImpactStrip
              impact={impact}
              incomeConfigured={hero.incomeConfigured}
              isReady={isImpactReady}
              impactApplies={affectsCurrentCycle}
              // Además de apagar el impacto, la tira tiene que DECIR por qué:
              // el aviso necesita saber si la fecha cayó en el ciclo anterior o
              // en el siguiente. Misma clasificación que `affectsCurrentCycle`.
              placement={placement}
              onOpenDetail={handleOpenDetail}
            />
            <WizardCta
              variant="confirm"
              label={
                pending
                  ? t('gastos:addExpense.wizard.cta.saving')
                  : form.canSubmit
                    ? t('gastos:addExpense.wizard.cta.confirm')
                    : t('gastos:addExpense.wizard.cta.completeData')
              }
              accessibilityLabel={
                form.canSubmit
                  ? t('gastos:addExpense.wizard.cta.confirmA11y')
                  : t('gastos:addExpense.wizard.cta.completeDataA11y')
              }
              ready={form.canSubmit}
              pending={pending}
              onPress={onPrimaryCta}
            />
            {/* Fila auxiliar del kit: la misma línea para "qué te falta", para
                "el guardado falló" y —en el camino feliz, que es el 95% de las
                aperturas— para el eslogan de hábito que traía la pantalla
                vieja. La precedencia, el alto reservado y las medidas viven en
                el componente compartido con el alta de ingreso (ver su
                docblock): acá sólo se dice QUÉ tiene para decir cada rama. */}
            <WizardFooterHelper
              error={submitError}
              missingLabels={missingLabels}
              tagline={t('home:addExpenseDashboard.habitTagline')}
            />
          </View>
        }
        keyboard={
          /*
            Teclado del rediseño (el del onboarding): teclas extruidas, "Listo"
            arriba y hoja al ras del borde inferior. Su modelo es un ENTERO de
            pesos (`value*10 + dígito`), no el string crudo del form, así que se
            traduce en el borde. El `trunc` es load-bearing: un prefill con
            decimales (OCR) entraría como 1500,5 y el primer dígito lo
            convertiría en 15005 — se edita desde la parte entera.
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
        {/* SIN `<WizardDots>`: con un solo paso, dos tramos de progreso no
            codifican nada. El kit sigue exportándolos para fijos e ingreso,
            que siguen siendo de dos pasos. */}
        <Animated.View layout={STEP_LAYOUT}>
          <WizardHeader
            title={t('gastos:addExpense.wizard.stepNew')}
            onBack={handleClose}
            backAccessibilityLabel={t('gastos:addExpense.wizard.close')}
          />
        </Animated.View>

        {/* La píldora vive ACÁ, fuera del formulario: si el usuario está
            cargando un gasto de otro día, esa condición tiene que estar a la
            vista donde confirma. Entra con la cascada (`RiseView`) y acompaña
            los cambios de alto de la columna (`layout`) como el header: sin
            eso era el único elemento que aparecía pintado en el frame 0 y
            después saltaba mientras sus vecinos interpolaban. */}
        {form.forDate ? (
          <Animated.View layout={STEP_LAYOUT}>
            <RiseView>
              <BackdatePill date={form.forDate} />
            </RiseView>
          </Animated.View>
        ) : null}

        <GastoForm
          amount={form.amount}
          amountRef={amountRef}
          onPressAmount={handleOpenNumpad}
          isNumpadVisible={isNumpadVisible}
          suggestedAmounts={controller.suggestedAmounts}
          onAddQuickAmount={handleAddQuickAmount}
          onClearAmount={handleClearAmount}
          categories={controller.rankedCategories}
          categoryId={form.categoryId}
          onSelectCategory={handleSelectCategory}
          tileWidth={railTileWidth(windowWidth)}
          tileHeight={RAIL_TILE_HEIGHT}
          description={form.description}
          onChangeDescription={form.setDescription}
          descriptionSuggestions={controller.quickDescriptionSuggestions}
          onSelectDescriptionSuggestion={handleSelectSuggestion}
          notes={form.notes}
          onChangeNotes={form.setNotes}
          advisorSignals={advisorSignals}
          categoryNameById={categoryNameById}
          flagAmount={form.isFieldFlagged('amount')}
          flagCategory={form.isFieldFlagged('category')}
          flagDescription={form.isFieldFlagged('description')}
        />
      </WizardShell>

      {/* Hermana de la cáscara, no hija: `ModalCard` monta un `<Modal>` nativo
          y adentro del ScrollView del wizard quedaría atada a su scroll. */}
      <ImpactDetailSheet
        visible={isDetailVisible}
        onClose={handleCloseDetail}
        impact={impact}
      />
    </>
  )
}

const styles = StyleSheet.create({
  footerStack: { gap: 10 },
})
