import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NoSpendConfirmSheet } from '@/components/gastos/no-spend-confirm-sheet'
import { useCategories, type Category } from '@/features/categories/use-categories'
import type { Expense } from '@/features/expenses/use-expenses'
import {
  type PressableProps,
  type PressableStateCallbackType,
  InteractionManager,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useSharedValue } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  AddExpenseTabButtonFace,
  type AddExpenseFaceVariant,
} from '@/components/navigation/add-expense-tab-button-face'
import {
  AddQuickActionsOverlay,
  type QuickAction,
} from '@/components/navigation/add-quick-actions-overlay'
import { useAddExpenseButtonBurst } from '@/components/navigation/add-expense-tab-button.model'
// Pure decision function lives in a sibling `.ts` file so the unit
// test can import it under vitest's Node environment without
// pulling the component's transitive native deps (expo-router,
// expo-linear-gradient, @expo/vector-icons …).
import {
  decideNoSpendPetal,
  type NoSpendPetalDecision,
} from '@/components/navigation/add-expense-tab-button-no-spend-decision'
import { openImportFlow } from '@/features/import-review/open-import-flow'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import type { ReviewState } from '@/features/import-review/types'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useExpenses } from '@/features/expenses/use-expenses'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import {
  useMarkNoExpenseDay,
  useStreak,
  useUnmarkNoExpenseDay,
} from '@/features/streaks/use-streak'
import {
  HOME_TOUR,
  HOME_TOUR_STEPS,
  useTour,
  useTourTargetRef,
} from '@/features/tours'
import { usePressScale } from '@/hooks/use-press-scale'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { confetti } from '@/lib/confetti-bus'
import { triggerHaptic } from '@/lib/haptics'
import { useIsAnyModalOpen } from '@/lib/modal-visibility'
import { toast } from '@/lib/toast-bus'
import { ArcFabPing } from '@/components/navigation/arc-fab-ping'
import {
  arcHub,
  registerArcHubActions,
  useArcHubHostMounted,
  useArcHubIsOpen,
  type ArcHubAction,
} from '@/components/navigation/arc-hub-bus'
import { useArcHubValues } from '@/components/navigation/arc-hub-context'
import {
  decideArcBegin,
  ARC_PHASE_CLOSED,
  ARC_PHASE_DRAG,
} from '@/components/navigation/arc-hub-machine'
import {
  arcHitTest,
  arcRadius,
  ARC_ORDER,
} from '@/components/navigation/arc-hub-geometry'
import { withAlpha } from '@/theme/color-utils'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { neoTokens } from '@/theme/neo-tokens'
import { useAppTheme } from '@/theme/theme-provider'

export { decideNoSpendPetal, type NoSpendPetalDecision }

/**
 * Interruptor del hub: `true` = Arco, `false` = la hoja `AddQuickActionsOverlay`.
 * Es la ÚNICA línea del swap — el catálogo de acciones y todos sus flujos
 * (no-spend, import, los tres `router.push`) son compartidos, así que
 * volver a la hoja no toca routing ni lógica.
 */
const ARC_HUB_ENABLED = true

/**
 * Center-stage FAB for "Agregar".
 *
 * Tap (haptic light) → opens the quick-actions menu (Gasto as the primary
 * tile, then Importar / Día sin gasto / Ingreso / Fijo). Everything is
 * discoverable on the first tap — no hidden gesture. (Previously tap went
 * straight to add-expense and the menu was long-press-only, which left the
 * extra actions invisible.)
 *
 * Motion:
 *   · scale 0.93 on press, immediate visual feedback
 *   · burst ring expands + fades on tap release (300ms ease-out)
 *   · no idle motion — the FAB stays calm; visual prominence comes
 *     from the elevated mint shadow + cutout border ring
 */
export function AddExpenseTabButton({
  accessibilityState,
  onPress: forwardedOnPress,
  onLongPress: forwardedOnLongPress,
  onPressIn,
  onPressOut,
  style,
  variant = 'legacy',
  ...pressableProps
}: PressableProps & {
  accessibilityState?: { selected?: boolean }
  /**
   * Cara del FAB. `legacy` (default) = cara V1 (tab bar viejo, live hasta F5).
   * `neo` = cara del `HomeNavBar` aprobado (surco + gradiente invertido dark).
   * SOLO cambia la CARA — toda la lógica (overlay/burst/no-spend/import/tour) es
   * compartida por ambas variantes.
   */
  variant?: AddExpenseFaceVariant
}) {
  const isNeo = variant === 'neo'
  const router = useRouter()
  const { t } = useTranslation()

  const session = useAuthSession()
  const userId = session.data?.user.id
  const homeSnapshot = useHomeSnapshot(userId)
  const familyId = homeSnapshot.data?.family?.familyId ?? undefined

  const streakResult = useStreak(familyId, userId)
  const expensesQuery = useExpenses(familyId)

  const markNoExpenseMutation = useMarkNoExpenseDay(familyId, userId)
  const unmarkNoExpenseMutation = useUnmarkNoExpenseDay(familyId, userId)

  const hasMarkedToday = streakResult.data?.hasMarkedNoExpenseToday ?? false

  // Today's own expenses + the list itself. Computed once: the
  // boolean drives the petal state machine, the array feeds the
  // confirm sheet so the user can verify what they registered.
  const expensesTodayOwn = useMemo((): Expense[] => {
    if (!userId) return []
    const expenses = expensesQuery.data ?? []
    const todayKey = new Date().toLocaleDateString('en-CA')
    const mine: Expense[] = []
    for (const e of expenses) {
      if (e.created_by !== userId) continue
      const created = new Date(e.created_at)
      if (created.toLocaleDateString('en-CA') === todayKey) mine.push(e)
    }
    return mine
  }, [userId, expensesQuery.data])
  const hasExpensesTodayOwn = expensesTodayOwn.length > 0

  // Sheet visibility for the "today has expenses, confirm anyway?"
  // flow. Replaces the previous Alert.alert with a ModalCard that
  // also lists the expenses so the user can verify.
  const [confirmSheetVisible, setConfirmSheetVisible] = useState(false)

  // Category lookup for the confirm sheet rows. useCategories is
  // already seeded by home_snapshot — cheap to call again.
  const categoriesQuery = useCategories(familyId)
  const categoryById = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of categoriesQuery.data ?? []) map.set(c.id, c)
    return map
  }, [categoriesQuery.data])

  // doMark accepts a `force` flag so the confirm-sheet path can
  // bypass the server-side EXPENSES_EXIST_ON_DATE guard (the user
  // already saw the expenses and consented). Without force, the
  // RPC rejects today-with-expenses inserts.
  const doMark = useCallback(
    (options?: { force?: boolean }) => {
      markNoExpenseMutation.mutate(
        options?.force ? { force: true } : undefined,
        {
          onSuccess: () => {
            void triggerHaptic('success')
            confetti.celebrate({ durationMs: 2000, origin: 'top' })
            toast.success(t('states:addFab.registered'))
            setConfirmSheetVisible(false)
          },
          onError: (error: unknown) => {
            void triggerHaptic('error')
            toast.error(
              error instanceof Error
                ? error.message
                : t('states:addFab.markFailed'),
            )
          },
        },
      )
    },
    [markNoExpenseMutation, t],
  )

  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  const pressScale = usePressScale({ pressedScale: 0.93 })
  const { burstRingStyle, triggerBurst } = useAddExpenseButtonBurst(isReducedMotionEnabled)
  const [quickActionsVisible, setQuickActionsVisible] = useState(false)
  // Neo only: press-inset swap de la cara (surco + disco → sombra inset del
  // mockup). Solo se setea en variant neo (`isNeo && …`) → el render path de la
  // cara legacy queda INTACTO (sin setState extra en press). En neo el press =
  // inset + burst (decisión owner): el press-scale 0.93 y la opacity 0.96 quedan
  // gateados a LEGACY (no matchean el mockup, que comunica el press solo con el
  // inset). El burst-ring corre en ambas (redimensionado a 62 en neo).
  const [facePressed, setFacePressed] = useState(false)
  // Register the FAB as the closing step of the Home guided tour.
  // The button lives in the tab bar (shared chrome) but it's only
  // taught from Home — when the Gastos / Fijos / Control tours run,
  // this step doesn't participate (different tour key). The ref is
  // attached to an inner wrapper sized to the visible disc (not the
  // outer Pressable, which is `flex: 1` and fills the whole tab cell —
  // that's why the cutout previously rendered as a wide oval instead of
  // matching the round face). The SVG cutout path clamps `r` to
  // `min(r, w/2, h/2)`, so a generous `borderRadius` always resolves to
  // a perfect circle:
  //   · legacy face 66×66 → host 66 → r clamps to 33.
  //   · neo face    62×62 → host 62 → r clamps to 31, snug on the disc.
  // Sizing the host per-variant (styles.tourTargetHost{,Neo}) is the
  // single geometry lever — `borderRadius` stays 40 and self-clamps.
  const fabTourRef = useTourTargetRef(HOME_TOUR, HOME_TOUR_STEPS.fab.order, {
    text: HOME_TOUR_STEPS.fab.text,
    highlight: {
      borderRadius: 40,
      padding: 4,
      pulse: true,
    },
  })
  // expo-router passes its own onPress + onLongPress through tabBarButton
  // props. We discard them — our handler below defines the actual behavior
  // (tap → quick-actions menu). If we didn't extract them, the trailing
  // `{...pressableProps}` spread would silently override our handler.
  void forwardedOnPress
  void forwardedOnLongPress

  const resolveForwardedStyle = (state: PressableStateCallbackType) =>
    typeof style === 'function' ? style(state) : style

  // ─── Hub Arco ───────────────────────────────────────────────────
  const arcValues = useArcHubValues()
  const arcHostMounted = useArcHubHostMounted()
  const { activeTour } = useTour()
  const anyModalOpen = useIsAnyModalOpen()
  const { width: windowWidth } = useWindowDimensions()
  // Sólo la cara neo (la live), con el provider montado (el preview de dev
  // monta esta misma barra sin él) y con el HOST vivo: el host está adentro
  // del gate `userId && familyId` de `AppStackShell`, y sin él el gesto
  // correría invisible — hápticos y una acción disparada sin que el usuario
  // haya visto un solo puck.
  const arcEnabled =
    ARC_HUB_ENABLED && isNeo && arcValues !== null && arcHostMounted
  const arcOpen = useArcHubIsOpen()
  // El arco se dibuja SIN ventana nativa, así que debajo de una hoja
  // abierta quedaría tapado e invisible. Y durante un tour el paso de
  // práctica apunta a este mismo disco de 62: con `minDistance(0)` el pan
  // le secuestraría el toque.
  //
  // El `|| arcOpen` es la excepción al beacon PROPIO: al quedar abierto por
  // tap, el host publica que hay una superficie modal arriba (el `ToastHost`
  // lo necesita para poder dibujar un error encima del arco). Sin esta
  // salvedad ese beacon apagaba el gesto de su propio FAB: el touch-down ya
  // no llegaba a `onBegin`, así que tocar el FAB no podía cerrar el arco, y
  // el toque caía en la rama de fallback de `handlePress` — que abre la hoja
  // vieja, en su ventana nativa, ARRIBA del arco todavía abierto.
  const panEnabled =
    arcEnabled && activeTour === null && (!anyModalOpen || arcOpen)
  const maxTravel = useSharedValue(0)
  /**
   * Instante del touch-down, estampado en el UI THREAD. Estamparlo en JS
   * (vía `runOnJS` desde `onBegin`) medía cuándo el JS thread llegó a
   * procesar el callback: con una invalidación de queries en curso el
   * retraso es de cientos de ms y un hold deliberado se leía como tap seco
   * — el arco quedaba abierto justo cuando el usuario pidió cancelar.
   */
  const downAt = useSharedValue(0)
  /**
   * Centro del disco en coordenadas de ventana. Ya NO se deriva del payload
   * del pan (`absoluteX − x`), porque el detector dejó de abrazar al disco:
   * ahora envuelve la celda entera, que es la superficie que el usuario ve
   * como "el botón". Se mide del nodo real del disco.
   */
  const fabCx = useSharedValue(0)
  const fabCy = useSharedValue(0)

  /**
   * Pestillo del toque. El `Pressable` sigue montado y su `onPress` dispara
   * igual cuando el pan NO activa: el tap seco llega como BEGAN → FAILED y
   * ahí RNGH nunca cancela el touch de RN, así que los dos caminos
   * competían por el mismo dedo — el FAB abría el arco, parpadeaba o abría
   * la hoja vieja según quién ganara la cola del JS thread.
   *
   * El pestillo lo levanta el gesto en el touch-DOWN y lo CONSUME el
   * `onPress` del touch-up: un toque entero de margen, sin depender de
   * ningún temporizador. Si en cambio el pan llega a activar (`onStart`),
   * RNGH ya canceló el touch de RN y no va a haber `onPress` — se baja ahí
   * para no dejarlo trabado.
   *
   * Queda abajo cuando el toque no nace de un gesto: activar por rol con
   * lector de pantalla no genera `onBegin`, y ese camino tiene que seguir
   * abriendo el arco.
   */
  const pressClaimRef = useRef(false)

  const openArc = useCallback((cx: number, cy: number) => {
    pressClaimRef.current = true
    arcHub.open(cx, cy, 'drag')
  }, [])
  const closeArcFromGesture = useCallback(() => {
    pressClaimRef.current = true
    arcHub.close()
  }, [])
  const clearPressClaim = useCallback(() => {
    pressClaimRef.current = false
  }, [])
  const pointArc = useCallback((index: number) => {
    arcHub.point(index < 0 ? null : ARC_ORDER[index])
  }, [])

  /**
   * Desenlace del soltar. El worklet reenvía los HECHOS del gesto y la
   * decisión la toma el bus, que es el único que sabe en qué estado está el
   * hub que el usuario tiene delante.
   *
   * La fase compartida se reconcilia siempre contra el bus, en vez de
   * escribirse de forma optimista: es un espejo para los worklets, nunca una
   * segunda fuente de verdad. Que lo fuera es lo que permitía que el UI
   * thread y el bus discreparan y el hub quedara clavado en `drag`.
   */
  const resolveArcRelease = useCallback(
    (succeeded: boolean, pointedIndex: number, travel: number, heldMs: number) => {
      arcHub.release({ succeeded, pointedIndex, travel, heldMs })
      if (arcValues) arcValues.phase.value = arcHub.phase()
    },
    [arcValues],
  )

  const pan = useMemo(() => {
    const values = arcValues
    const gesture = Gesture.Pan()
      .enabled(panEnabled && values !== null)
      // Activa en el touch-down: el arco abre con el dedo abajo, no
      // después de un umbral. "Mantener apretado" es el modelo mental, no
      // la implementación.
      .minDistance(0)
      // El hit-test sigue al ÚLTIMO puntero: con el default, la base del
      // pulgar apoyada en el borde apagaba el puck apuntado y el soltar
      // cancelaba en vez de disparar.
      .maxPointers(1)
      // Mismo margen que el `hitSlop` del Pressable, para que las dos
      // superficies coincidan exactamente. En Android no puede crecer más
      // allá del padre y ahí queda recortado, igual que el del Pressable.
      .hitSlop(DEFAULT_HIT_SLOP)
    if (!values) return gesture
    return gesture
      .onBegin(() => {
        'worklet'
        const decision = decideArcBegin(values.phase.value)
        if (decision === 'close') {
          // La fase se baja acá mismo: si el bus ya estaba cerrado, dejarla
          // en 'latched' inmovilizaría al FAB hasta reiniciar la app.
          values.phase.value = ARC_PHASE_CLOSED
          runOnJS(closeArcFromGesture)()
          return
        }
        if (decision !== 'open') return
        const cx = fabCx.value
        const cy = fabCy.value
        // Sin medida todavía no hay pivote: el gesto se abstiene y el
        // `onPress` del Pressable (que mide por ref) abre en modo tap.
        if (cx <= 0 || cy <= 0) return
        values.cx.value = cx
        values.cy.value = cy
        values.radius.value = arcRadius(windowWidth, cx)
        values.pointed.value = -1
        values.phase.value = ARC_PHASE_DRAG
        maxTravel.value = 0
        downAt.value = Date.now()
        runOnJS(openArc)(cx, cy)
      })
      // Activar significa que RNGH ya canceló el touch de RN: no va a
      // llegar ningún `onPress` que consuma el pestillo.
      .onStart(() => {
        'worklet'
        runOnJS(clearPressClaim)()
      })
      .onUpdate((event) => {
        'worklet'
        if (values.phase.value !== ARC_PHASE_DRAG) return
        const travel = Math.sqrt(
          event.translationX * event.translationX +
            event.translationY * event.translationY,
        )
        if (travel > maxTravel.value) maxTravel.value = travel
        const next = arcHitTest(
          event.absoluteX,
          event.absoluteY,
          values.cx.value,
          values.cy.value,
          values.radius.value,
        )
        // El puente a JS cruza SOLO al cambiar de sector (≤5 veces por
        // gesto). La escala y el hundido del puck apuntado los resuelve el
        // host leyendo `pointed` en el UI thread.
        if (next === values.pointed.value) return
        values.pointed.value = next
        runOnJS(pointArc)(next)
      })
      /**
       * EL SOLTAR SE RESUELVE ACÁ, no en `onFinalize`.
       *
       * En iOS un `Pan().minDistance(0)` que nunca activa **muere en
       * silencio**, y esa es la causa raíz del tap seco roto. La cadena, de
       * la fuente de RNGH (`apple/`):
       *
       *  1. `minDistance` deja `_hasCustomActivationCriteria = YES`, así que
       *     `interactionsBegan` le pone `minimumNumberOfTouches = 20` al
       *     recognizer de UIKit: no puede reconocer solo, lo activa RNGH a
       *     mano desde `interactionsMoved`. Con el dedo quieto no hay move y
       *     el recognizer se queda en `.possible`.
       *  2. `interactionsEnded` NO llama a `triggerAction` (RNPanHandler.m);
       *     el único disparo que queda es el `[self triggerAction]` del
       *     `reset`.
       *  3. Y ahí está la trampa: `recognizerState` mapea
       *     **`UIGestureRecognizerStatePossible` a BEGAN**
       *     (RNGestureHandler.mm). Como `_lastState` ya era BEGAN,
       *     `sendEventsInState` corta por `state != _lastState` y **no emite
       *     ningún evento**.
       *
       * O sea: `onBegin` corre (el arco abre), y después no llega NADA. Ni
       * FAILED, ni END, ni `onFinalize`. El hub se quedaba en `drag` para
       * siempre: overlay a pantalla completa, con `pointerEvents="none"`
       * porque durante el arrastre elige el hit-test angular — el contenido
       * de atrás seguía siendo accionable y los pucks no.
       *
       * `onTouchesUp` sí llega: el pointer tracker emite desde
       * `interactionsEnded` sin mirar el estado del recognizer. Y su
       * semántica es más precisa que el `success` de RNGH — "el dedo se
       * levantó" es exactamente lo que distingue soltar de que el sistema
       * te quite el gesto.
       */
      .onTouchesUp((event) => {
        'worklet'
        // Con `maxPointers(1)` no hay segundo dedo, pero si lo hubiera sólo
        // resuelve el último en levantarse.
        if (event.numberOfTouches > 1) return
        const touch = event.changedTouches.length > 0 ? event.changedTouches[0] : null
        const pointedIndex =
          values.pointed.value >= 0
            ? values.pointed.value
            : touch
              ? arcHitTest(
                  touch.absoluteX,
                  touch.absoluteY,
                  values.cx.value,
                  values.cy.value,
                  values.radius.value,
                )
              : -1
        runOnJS(resolveArcRelease)(
          true,
          pointedIndex,
          maxTravel.value,
          Date.now() - downAt.value,
        )
      })
      // El dedo NUNCA se levantó: el sistema se llevó el gesto. Disparar acá
      // sería inventar una intención, así que va como un soltar fallido.
      .onTouchesCancelled((event) => {
        'worklet'
        if (event.numberOfTouches > 1) return
        runOnJS(resolveArcRelease)(
          false,
          values.pointed.value,
          maxTravel.value,
          Date.now() - downAt.value,
        )
      })
      /**
       * Red de seguridad, no el camino principal: cubre las plataformas y
       * los desenlaces donde sí llega (Android falla explícito en el
       * ACTION_UP, y en iOS el arrastre real termina en END). `release()` es
       * idempotente, así que llegar segundo no deshace nada.
       */
      .onFinalize((_event, success) => {
        'worklet'
        runOnJS(resolveArcRelease)(
          success,
          values.pointed.value,
          maxTravel.value,
          Date.now() - downAt.value,
        )
      })
  }, [
    arcValues,
    panEnabled,
    windowWidth,
    openArc,
    pointArc,
    closeArcFromGesture,
    clearPressClaim,
    resolveArcRelease,
    downAt,
    fabCx,
    fabCy,
    maxTravel,
  ])

  // Un toque ABRE el hub de acciones (gasto/importar/día sin gasto/ingreso/
  // fijo), con "Gasto" como acción principal. Descubrible al primer toque,
  // sin gesto oculto. Con el arco activo el pan ya consumió el toque real,
  // así que esto queda como camino de accesibilidad: VoiceOver/TalkBack
  // activan por rol, sin generar un touch, y ahí el arco abre en modo
  // "tocá para elegir".
  const handlePress = useCallback(() => {
    if (!panEnabled) {
      void triggerHaptic('light')
      triggerBurst()
      setQuickActionsVisible(true)
      return
    }
    // El toque ya lo resolvió el gesto: se consume el pestillo y se sale.
    // El gate NO puede ser `arcHub.isOpen()` — entre el `close()` del gesto
    // y este callback el hub ya figura cerrado, y el arco se reabriría solo.
    if (pressClaimRef.current) {
      pressClaimRef.current = false
      return
    }
    if (arcHub.isOpen()) return
    // Sin gesto no hay medida en vuelo: se mide el nodo del disco, que ya
    // existe para el tour con `collapsable={false}` y por eso sobrevive al
    // view-collapsing de Android.
    fabTourRef.current?.measureInWindow((x, y, width, height) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      arcHub.open(x + width / 2, y + height / 2, 'latched')
    })
  }, [panEnabled, triggerBurst, fabTourRef])

  /**
   * Pivote del arco. Se mide del host del disco (62×62, `collapsable=false`
   * por el tour) y no del payload del gesto: el detector envuelve la celda
   * entera, así que `event.x` ya no es relativo al disco.
   */
  const measureFabDisc = useCallback(() => {
    fabTourRef.current?.measureInWindow((x, y, width, height) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      if (width <= 0 || height <= 0) return
      fabCx.value = x + width / 2
      fabCy.value = y + height / 2
    })
  }, [fabTourRef, fabCx, fabCy])

  useEffect(() => {
    measureFabDisc()
  }, [measureFabDisc, windowWidth])

  // Semantic accent tints per action role. Each ring telegraphs the
  // action's category at-a-glance (positive cashflow vs scheduled
  // commitment vs celebration). The primary action (Gasto) omits the
  // ring on purpose so it stays the most chromatically minimal — that
  // visual quiet reads as "default" and keeps the brand green as the
  // strongest call-to-action.
  // Accent colors are theme-paired: the dark variant lives on a dark
  // (#102018) overlay surface where ~5–7:1 contrast holds; the light
  // variant runs ~4.5:1 on the white card so the icons stay legible
  // without going monochrome. Same hue family, deeper saturation +
  // lower lightness for the light slot.
  const ACCENT_NO_SPEND = theme.isDark ? '#7DD18D' : '#2E8540' // verde
  const ACCENT_INCOME = theme.isDark ? '#5B9DF9' : '#1B66C9'   // azul
  const ACCENT_FIXED = theme.isDark ? '#A0A4A8' : '#5F6368'    // gris
  const ACCENT_IMPORT = theme.isDark ? '#B894FA' : '#7E50CC'   // púrpura

  const [importState, setImportState] = useState<ReviewState | null>(null)
  const { makeMapContext } = useImportWizardContext()

  const handleOpenImport = async () => {
    if (!familyId || !userId) {
      toast.error(t('states:addFab.needSession'))
      return
    }
    // Si hay un <Modal> cerrando cuando esta función arranca (la hoja del
    // FAB en el camino de fallback, o el ImportReviewSheet de una importación
    // anterior) y presentamos el image picker —otro <Modal>— antes de que
    // termine ese dismiss, iOS descarta silenciosamente la segunda
    // presentación. Esperamos a que terminen las animaciones pendientes.
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve())
    })
    const result = await openImportFlow(makeMapContext())

    switch (result.kind) {
      case 'opened':
        setImportState(result.state)
        break
      case 'cancelled':
        // silent
        break
      case 'permission-denied':
        toast.error(t('states:addFab.needPhotos'))
        break
      case 'error':
        toast.error(t('states:addFab.readFailed', { message: result.message }))
        break
    }
  }

  const quickActions: QuickAction[] = [
    {
      key: 'expense',
      label: t('common:terms.expense'),
      icon: 'add',
      tier: 'primary',
      // No accentColor on purpose — the primary tile is already
      // chromatically saturated (brand fill).
      onPress: () => router.push('/(app)/add-expense'),
    },
    {
      key: 'import',
      label: t('states:quickActions.import'),
      icon: 'document-scanner',
      accentColor: ACCENT_IMPORT,
      // QuickAction.onPress es () => void; envolvemos el async handler
      // para no dejar una promise floating sin manejar (handleOpenImport
      // ya atrapa todos los errores internamente).
      onPress: () => {
        void handleOpenImport()
      },
    },
    {
      key: 'no-spend',
      label: hasMarkedToday
        ? t('states:quickActions.noSpendMarked')
        : t('states:quickActions.noSpend'),
      icon: 'eco',
      visualState: hasMarkedToday ? 'marked' : 'default',
      accentColor: ACCENT_NO_SPEND,
      onPress: () => {
        const decision = decideNoSpendPetal({
          isMutationPending:
            markNoExpenseMutation.isPending || unmarkNoExpenseMutation.isPending,
          familyId,
          hasMarkedToday,
          hasExpensesTodayOwn,
        })

        switch (decision.kind) {
          case 'noop':
            if (decision.reason === 'no-family') {
              toast.info(t('states:addFab.preparingAccount'))
            }
            return

          case 'unmark':
            unmarkNoExpenseMutation.mutate(undefined, {
              onSuccess: () => {
                void triggerHaptic('selection')
                toast.info(t('states:addFab.unmarked'))
              },
              onError: (error: unknown) => {
                void triggerHaptic('error')
                toast.error(
                  error instanceof Error
                    ? error.message
                    : t('states:addFab.unmarkFailed'),
                )
              },
            })
            return

          case 'mark-confirm':
            // Open the project-style ModalCard sheet (instead of the
            // generic Alert.alert) so the user can verify the list of
            // expenses they registered today before confirming.
            setConfirmSheetVisible(true)
            return

          case 'mark-direct':
            doMark()
            return
        }
      },
    },
    {
      key: 'income',
      label: t('common:terms.income'),
      icon: 'trending-up',
      accentColor: ACCENT_INCOME,
      onPress: () => router.push('/(app)/add-income'),
    },
    {
      key: 'fixed',
      label: t('common:terms.fixedExpense'),
      icon: 'event-repeat',
      accentColor: ACCENT_FIXED,
      onPress: () => router.push('/(app)/add-fixed-expense'),
    },
  ]

  // El arco vive en otro subárbol (host de raíz), así que recibe un
  // ACCESSOR y no una copia: lo llama al abrir y lee las etiquetas y el
  // `visualState` del render vigente. Los cinco `onPress` reales — con sus
  // hojas y sus `router.push` — se quedan acá arriba, sin duplicar.
  const quickActionsRef = useRef<QuickAction[]>(quickActions)
  quickActionsRef.current = quickActions
  useEffect(
    () => registerArcHubActions(() => quickActionsRef.current as ArcHubAction[]),
    [],
  )

  return (
    <>
      {/* El detector abraza la CELDA, no el disco: el `Pressable` es
          `flex: 1` sobre toda la celda y encima lleva `hitSlop`, así que un
          dedo que caía 6-8px al costado del disco quedaba adentro del
          objetivo táctil histórico pero afuera del pan — la misma
          superficie visual daba dos modelos de interacción distintos. */}
      <GestureDetector gesture={pan}>
        <Pressable
          accessibilityLabel={t('states:addFab.label')}
          accessibilityHint={t('states:addFab.hint')}
          accessibilityRole="button"
          accessibilityState={accessibilityState}
          android_ripple={{
            borderless: false,
            color: withAlpha('#FFFFFF', 0.2),
            radius: 40,
          }}
          hitSlop={DEFAULT_HIT_SLOP}
          onPress={handlePress}
          onPressIn={(event) => {
            // Neo comunica el press con el swap-a-inset de la cara (+ burst en
            // onPress); NADA de press-scale/opacity legacy. Legacy conserva 0.93.
            if (isNeo) setFacePressed(true)
            else pressScale.onPressIn()
            onPressIn?.(event)
          }}
          onPressOut={(event) => {
            if (isNeo) setFacePressed(false)
            else pressScale.onPressOut()
            onPressOut?.(event)
          }}
          pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
          style={(state) => [
            resolveForwardedStyle(state),
            styles.addButtonWrap,
            {
              // Solo legacy atenúa en press; neo lo comunica con el inset.
              opacity: !isNeo && state.pressed ? 0.96 : 1,
            },
          ]}
          {...pressableProps}
        >
          {/* El ping del arco y el burst-ring del camino por hoja comparten
              la geometría del disco: montar los dos daría dos anillos. */}
          {arcEnabled && arcValues ? (
            <ArcFabPing
              color={withAlpha(
                neoTokens(theme.mode).green,
                theme.isDark ? 0.5 : 0.55,
              )}
              phase={arcValues.phase}
              reduced={isReducedMotionEnabled}
            />
          ) : (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.burstRing,
                isNeo ? styles.burstRingNeo : null,
                {
                  borderColor: withAlpha(
                    isNeo ? neoTokens(theme.mode).green : theme.brand.bright,
                    0.9,
                  ),
                },
                burstRingStyle,
              ]}
            />
          )}
          {/* Tour ref host. Sized to the visible disc per-variant (66 legacy /
              62 neo) so the guided tour's cutout matches the round face instead
              of the parent Pressable's full-cell box. */}
          <View
            ref={fabTourRef}
            collapsable={false}
            onLayout={measureFabDisc}
            style={isNeo ? styles.tourTargetHostNeo : styles.tourTargetHost}
          >
            <Animated.View
              style={[
                pressScale.animatedStyle,
                // La profundidad del FAB neo la aporta el `boxShadow`
                // (fabShadow/fabWellShadow) de la CARA; el drop-shadow mint nativo
                // es solo de la cara legacy (evita doble sombra y no encaja con el
                // disco crema del neo oscuro). `transform` siempre sale del hook
                // como array — nunca undefined (feedback_transform_undefined_crash).
                isNeo
                  ? null
                  : {
                      shadowColor: theme.isDark ? '#A6EF8F' : '#297811',
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: theme.isDark ? 0.34 : 0.3,
                      shadowRadius: 12,
                      elevation: 12,
                    },
              ]}
            >
              <AddExpenseTabButtonFace
                theme={theme}
                variant={variant}
                pressed={isNeo ? facePressed : false}
              />
            </Animated.View>
          </View>
        </Pressable>
      </GestureDetector>

      <AddQuickActionsOverlay
        visible={quickActionsVisible}
        onDismiss={() => setQuickActionsVisible(false)}
        actions={quickActions}
      />

      <NoSpendConfirmSheet
        visible={confirmSheetVisible}
        expensesToday={expensesTodayOwn}
        categoryById={categoryById}
        isSubmitting={markNoExpenseMutation.isPending}
        onCancel={() => setConfirmSheetVisible(false)}
        onConfirm={() => doMark({ force: true })}
      />

      <ImportReviewSheet
        visible={importState !== null}
        initialState={importState}
        familyId={familyId ?? ''}
        userId={userId ?? ''}
        onClose={() => setImportState(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  addButtonWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    top: -18,
    position: 'relative',
  },
  burstRing: {
    position: 'absolute',
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
  },
  // Neo: el disco mide 62×62 (mockup) → el ring concéntrico también, si no
  // sobresalía ~2px del borde durante el ping.
  burstRingNeo: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  tourTargetHost: {
    width: 66,
    height: 66,
  },
  // Neo: la cara mide 62×62 (disco del mockup). El host la envuelve exacto para
  // que el spotlight del tour clampe a un círculo de r31 que calza el disco.
  tourTargetHostNeo: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
