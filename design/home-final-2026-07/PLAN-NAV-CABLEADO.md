# PLAN DE INTEGRACIÓN — Nav nueva aprobada → navegador live (F5)

## Decisión de arquitectura (resuelta antes de fasear)

**Visual canónico = `HomeNavBar`** (spec `home-final`), NO `NeoTabBar`. Los tres informes coinciden: `NeoTabBar` (`neo-tab-bar.tsx`) replica el doc **viejo** 1b/1c y le falta surco/badge/itemDots/inversión-dark; `home-spec.ts:8-10` lo declara explícito. Aprobación vigente = `home-final:'aprobada'` (2026-07-21, `redesign-approval-status.ts:50`) que **supersede** `nav-bar:'aprobada'` (2026-07-17, `redesign-approval-status.ts:14`). Fuente de verdad = `home-screen.tsx:1472-1566` + styles `:1902-1944` + tokens `HOME_SPEC` (`home-spec.ts:199-214, 358-371, 511-525`).

**Approach del swap = `<Tabs tabBar={renderNeoTabBar}>` custom** (ruta A), NO restyle-por-slots (ruta B). Razón decisiva: el visual aprobado es una barra **monolítica dibujada** (pastilla flotante continua + píldora activa *inset* que envuelve ícono+label + FAB con `fabWell` entre los grupos `[inicio,gastos] | FAB | [fijos,control]`). Ese modelo NO descompone limpio en los slots per-ítem (`tabBarButton/Icon/Label`) del bar default. El contraargumento de B ("preserva freezeOnBlur/lazy/gestos") **no aplica**: esas flags son opciones de Screen/navigator, no del tab bar — sobreviven intactas a un `tabBar` custom (gaps-gotchas §1). Lo único que se pierde con custom es `tabBarHideOnKeyboard` (replicable, bajo riesgo — las tab-screens no tienen inputs inline) y el ciclo interno de `tabPress` (se re-emite explícito, ver Fase 4). El swap es **una línea** en `app-tabs.tsx:189`, revertible borrándola.

**Seam completo del cableado** = `BottomTabBarProps { state, descriptors, navigation, insets }` (`@react-navigation/bottom-tabs@7.15.9`, `types.d.ts:315-320`; prop `tabBar` en `types.d.ts:279`).

---

## Mapeo maestro demo → real (referencia de todas las fases)

| Función | Cómo lo hace el kit (demo) | Fuente/callback real | archivo:línea real |
|---|---|---|---|
| `activeTab` | `useState` local en preview | `state.routes[state.index].name` → key vía tabla | `redesign-nav-bar-preview-screen.tsx:20-21,36,44` → `types.d.ts:315-320` |
| `mode` | prop string manual | `theme.isDark ? 'dark' : 'light'` | `app-tabs.tsx:98,150` |
| cambio de tab | `onPressTab`/`onTabPress` pelado | `navigation.emit({type:'tabPress',target,canPreventDefault:true})` + si `!defaultPrevented && !focused` → `navigation.navigate(routeName)` | `app-tabs.tsx:113-125` |
| haptic + focus-pulse | ausente | `useTabHaptics` (`triggerHaptic('selection')` + `publishTabPress`) vía `screenListeners.tabPress` — corre GRATIS al emitir tabPress | `app-tabs.tsx:100-103,116-124` |
| tour-lock | ausente | `tourActiveRef.current` → `screenListeners.tabPress` hace `preventDefault()`; el kit respeta `event.defaultPrevented` | `app-tabs.tsx:109-125` |
| `itemDots.control` | prop manual | `useAdvisorBadge().show` (suprimido si activo) | `app-tabs.tsx:36-56`; `use-advisor-badge.ts:29-49`; `tab-bar-icon.tsx:83-94` |
| `fabBadge` | prop `number\|null` | **sin fuente hoy** → `null` | `home-screen.tsx:1478,1555` |
| `onPressFab` → flujo | callback pelado | `AddExpenseTabButton.handlePress` (haptic light → burst → overlay) | `add-expense-tab-button.tsx:198-202` |
| tour del FAB | ausente | `fabTourRef = useTourTargetRef(HOME_TOUR, HOME_TOUR_STEPS.fab.order,…)` sobre host 66×66 `collapsable={false}` | `add-expense-tab-button.tsx:175-183,390`; `home-tour.ts:82-88` |
| labels | hardcode ES (`'Inicio'/'Gastos'/…`) | `t('states:tabs.{home,expenses,fixed,control}')` | `home-screen.tsx:1484-1487` → `neo-tab-bar.tsx:32-35,110`; `es/states.json:206-212` |

**Tabla key↔ruta** (los nombres NO coinciden — necesaria en 2 direcciones):

| Orden | ruta live (`Tabs.Screen name`) | key kit | `NeoTabIcon name` |
|---|---|---|---|
| 1 | `home` | `inicio` | `home` |
| 2 | `expenses` | `gastos` | `expenses` |
| 3 | `add` | **(FAB — no key)** | `plus` |
| 4 | `fixed-expenses` | `fijos` | `fixed` |
| 5 | `insights` | `control` | `control` |

Refs: `app-tabs.tsx:190-209`; íconos `neo-tab-icons.tsx`.

---

## Fase 0 — Confirmación de gate (bloqueante, 0 código)

- **Alcance:** confirmar con owner que el swap live monta `HomeNavBar` (surco + badge + itemDots + FAB dark invertido crema), no `NeoTabBar`. Los 3 informes marcan esta divergencia como decisión previa obligatoria.
- **Riesgo:** cero (solo decisión). Si se saltea y se porta `NeoTabBar`, se pierde surco/inversión/badge aprobados.
- **Valida:** aprobación explícita en el gate (patrón `feedback_redesign_approval_gate`).

---

## Fase 1 — Extraer `NeoTabBar` real (presentational, sin routing)

- **Alcance:** convertir el markup dibujado `HomeNavBar` en un componente reutilizable, **visual idéntico**, aún manejado por props/mock (sin tocar el navegador).
- **Crear:** `mobile/components/navigation/neo-tab-bar-live.tsx` (o evolucionar `mobile/components/redesign/neo-tab-bar.tsx` a la spec `home-final`) portando styles `nav/navActive/navIdle/fab/fabWell/fabBadge/navItemDot` (`home-screen.tsx:1902-1944`) + tokens `HOME_SPEC` (`home-spec.ts:199-214,358-371,511-525`).
- **Tocar (dev only):** `mobile/screens/dev/redesign/redesign-nav-bar-preview-screen.tsx` para comparar contra `home-final` (hoy compara 1b/1c).
- **Contrato a evolucionar (sin cambiar visual):** conserva props presentational `mode / activeTab / itemDots / fabBadge / onPressTab / onPressFab` (`home-screen.tsx:1472-1481`). Cambio único: labels por `t('states:tabs.*')` en lugar del hardcode ES (`home-screen.tsx:1484-1487` → patrón `neo-tab-bar.tsx:32-35,110`).
- **Gotcha ya aquí:** usar el seam `cssGradient(navGradientCss, fallback)` (`neo-tokens.ts:26-28`) en vez de `experimental_backgroundImage` crudo (`home-screen.tsx:1536`), para fallback sólido. Los gradientes SÍ rinden en Android (memoria).
- **Valida:** dev route `redesign-nav-bar.tsx` render pixel-perfect en light+dark; sin regresión visual vs mockup `home-final`.

---

## Fase 2 — Evolucionar el contrato a datos reales (aún sin swap live)

- **Alcance:** enchufar las fuentes reales de estado/badges al componente de Fase 1, todavía dentro del preview/mock (no toca `<Tabs>`).
- **Tocar:** el nuevo `neo-tab-bar-live.tsx` + su preview.
- **Cableado:**
  - `mode` ← `theme.isDark` (`app-tabs.tsx:98,150`).
  - `itemDots={{ control: useAdvisorBadge().show }}` — **memoizar el ítem control aislado** como hoy `InsightsTabIcon` (`app-tabs.tsx:36-56`) para no re-evaluar el hook en cada render de la barra durante transiciones. El kit ya suprime el dot si activo (`home-screen.tsx:1531`, `&& item.key !== activeTab` ≡ `!focused`).
  - `fabBadge={null}` — sin fuente de datos hoy; documentar como no-cableado (paridad exacta con el FAB live actual, que no pinta badge). Requiere decisión owner para activarlo.
- **Valida:** en dev, forzar `advisorBadge.show` y ver el dot naranja `#D97E4F` en Control; verificar que apagando la tab activa el dot desaparece.

---

## Fase 3 — Cablear el FAB add-expense 1:1 (mayor riesgo de fidelidad)

- **Alcance:** el FAB neo dispara **exactamente** lo que hace hoy `AddExpenseTabButton`, sin reimplementar nada.
- **Regla:** NO reescribir la lógica (455 líneas). Preservar el wrapper completo; restilar **solo la cara** (`AddExpenseTabButtonFace` → cara neo con `fabWell`/gradiente invertido). El overlay y sheets ya son hermanos del botón (`add-expense-tab-button.tsx:408-429`) y se mueven tal cual.
- **Tocar:** `mobile/components/navigation/add-expense-tab-button.tsx` (cara neo + tamaño de host/ref), `add-expense-tab-button-face.tsx`. Opción limpia: factorizar a `useAddExpenseFab()` y montar `<AddExpenseTabButton>` como slot central de la barra custom.
- **Cableado 1:1 (todo se preserva):**
  - `onPressFab` → `handlePress` (`add-expense-tab-button.tsx:198-202`): `triggerHaptic('light')` → `triggerBurst()` → `setQuickActionsVisible(true)`. **Un toque abre el menú** (gasto = 2 toques), NO navega a `add`.
  - Las **5 quick-actions** intactas (`add-expense-tab-button.tsx:255-345`): gasto (`router.push('/(app)/add-expense')`), importar (**gotcha `InteractionManager.runAfterInteractions` antes de `openImportFlow`**, `:223-253`), día-sin-gasto (máquina `decideNoSpendPetal` + `NoSpendConfirmSheet` + confetti/toast + unmark), ingreso (`add-income`), fijo (`add-fixed-expense`).
  - **Cadena de modales:** `AddQuickActionsOverlay` bloom-in/timing-out con `skipNextExitRef`, orden `onDismiss()`→`action.onPress()` (`add-quick-actions-overlay.tsx:149-154`) **sin cambios** (memoria `feedback_ios_modal_chain_dismiss`).
  - **Burst vs press-inset:** el kit expresa el press como swap-a-inset (`fabShadow→fabPressedShadow`, `fabWellShadow→fabPressedWellShadow`, `home-screen.tsx:1542-1552`). **Decisión de diseño pendiente:** conservar el burst-ring live (520ms, `add-expense-tab-button.model.ts:30-49`) o adoptar el pressed-inset del mockup, o ambos. Recomendado por fidelidad: **pressed-inset del mockup** (visual aprobado) + mantener el `triggerBurst()` opcionalmente. Requiere confirmación owner.
- **Tour del FAB (paso 8, cierre HOME_TOUR):** re-anclar `fabTourRef = useTourTargetRef(HOME_TOUR, HOME_TOUR_STEPS.fab.order, {…})` sobre un `View collapsable={false}` que envuelve la cara neo (`add-expense-tab-button.tsx:175-183,390`). **Ojo geometría:** el FAB neo es 62×62 radius 31 vs el highlight `borderRadius:40` del live; el cutout clampa `r = min(r, w/2, h/2)` → ajustar host a 62/66 o el `highlight.borderRadius` para que el círculo calce el disco.
- **Valida (device):** un toque abre overlay; las 5 acciones ejecutan su destino real; máquina no-spend (mark/unmark/confirm/confetti); import chain sin descartar el picker; tour paso 8 resalta el disco con pulse.

---

## Fase 4 — Adapter `renderNeoTabBar(props: BottomTabBarProps)` (sin swap todavía)

- **Alcance:** la función que traduce el estado de expo-router al contrato del kit. Construida y testeable antes de conectarla al `<Tabs>`.
- **Crear:** `renderNeoTabBar` en `app-tabs.tsx` (o helper co-ubicado).
- **Cableado obligatorio:**
  - **Estado activo sincronizado:** `activeTab = routeToKey[state.routes[state.index].name]` (tabla de 4 entradas). **Excluir la ruta `add`** del map de ítems que dibuja la barra (renderiza 4 tabs + FAB central manual, patrón `neo-tab-bar.tsx:124-138`, `slice(0,2)` FAB `slice(2)`). La Screen `add` queda montada; su `Redirect → /(app)/add-expense` (`add.tsx`) sigue vivo para deep-links.
  - **Cambio de tab (preserva haptics/pulse/tour-lock):** `onPressTab(key)` → `const route = …; const e = navigation.emit({type:'tabPress', target: route.key, canPreventDefault:true}); if (!e.defaultPrevented && !isFocused) navigation.navigate(route.name)`. **Emitir `tabPress` es obligatorio** — así corren `useTabHaptics` (G4) y el `preventDefault` del tour-lock (G5) sin duplicar nada (`app-tabs.tsx:100-124`). El kit **debe respetar `defaultPrevented`** (no navegar si cancelado) — si navegara directo se saltaría el tour (bug documentado en `app-tabs.tsx:106-108`).
  - **Safe-area:** usar `insets.bottom` de `BottomTabBarProps` para el `paddingBottom`/anclaje (el kit usaba margin fijo `22`, `home-screen.tsx:1536`). **Descartar el `homeIndicator` dibujado** del mockup (`home-screen.tsx:1619,1944`) — es chrome de preview; se usa el inset real (mismo retiro ya hecho en auth).
  - **Press-scale de los 4 tabs:** conservar el equivalente a `TabBarPressable` (scale 0.94 spring, `tab-bar-pressable.tsx`) en los `NavItem`; el haptic NO va acá (lo dispara `screenListeners`). Transform siempre como array presente (memoria `feedback_transform_undefined_crash`).
- **Valida:** con un mock de `BottomTabBarProps`, verificar map ruta↔key en ambas direcciones; verificar que navegar respeta `defaultPrevented`; test unit del map (paralelo a los tests ya presentes en `tests/unit/`).

---

## Fase 5 — SWAP live mínimo y revertible

- **Alcance:** una línea. Conectar el adapter al navegador.
- **Tocar:** `mobile/components/navigation/app-tabs.tsx:189`:
  ```
  <Tabs screenListeners={screenListeners} screenOptions={screenOptions} tabBar={renderNeoTabBar}>
  ```
- **Qué sobrevive (NO se toca):** `freezeOnBlur:false` (`:140-141`, load-bearing gestos RNGH — memoria `feedback_freeze_on_blur_breaks_gestures`), `lazy:false` (`:175`, pre-montaje 5 screens), `animation:'none'` (`:183`, switch instantáneo), `detachInactiveScreens` default, `sceneStyle` anti-flicker (`:149-151`), `headerShown:false`. Todas son de Screen/navigator → intactas.
- **Qué deja de aplicar:** `tabBarButton/Icon/Label/Background/Style` (los dibuja la barra custom) y `tabBarHideOnKeyboard` (`:154`) — replicar con `Keyboard` listener solo si hace falta (bajo riesgo, sin inputs inline en tabs).
- **Ajustes acompañantes:**
  - `sceneStyle.backgroundColor` (`app-tabs.tsx:149-151`): opcionalmente alinear al `HOME_SPEC[mode].bg` neo para material continuo bajo la barra flotante (decisión estética).
  - **`paddingBottom` de contenido (GAP real):** las 4 tab-screens pueden quedar tapadas por la barra flotante. Verificar/inyectar `paddingBottom ≈ altura barra + insets.bottom` en `screenContent` (`neo-home-screen.tsx:1788-1791` hoy solo tiene `paddingTop:14`). Validar en device porque la altura del kit difiere de los 88px del live (`elevation.ts:69-86`).
- **Reversión:** borrar `tabBar={renderNeoTabBar}`. Vuelve el bar default sin tocar routing ni `_layout.tsx`.
- **Valida (device, light+dark):** las 5 tabs navegan; estado activo = píldora hundida correcta; badge Control; FAB abre overlay; tour completo; sin jank en switch (lazy/animation intactos); sin gap de contenido bajo la barra.

---

## Fase 6 — Hardening Android + cierre

- **Alcance:** los riesgos residuales de plataforma.
- **boxShadow inset Android (gotcha activo):** el kit usa `boxShadow` inset masivo — `navActiveShadow` (píldora), `fabWellShadow` (surco), `fabPressedShadow` (`home-spec.ts:368-370,523-524`). En RN 0.81 el inset se **aplana silenciosamente < API 29** (memoria `feedback_rn_boxshadow_android_api_gate`). `neoDepth` version-aware **NO existe** (grep 0 hits). El commit `5a84c139` bumpeó `minSdk 29` → verificar que cubre el piso del inset (API 29 = inset OK; outset < API 28 ya no aplica con ese minSdk). Los gradientes `experimental_backgroundImage` SÍ rinden. Acción: aceptar el piso minSdk 29 o hacer la profundidad del surco/píldora version-aware.
- **Worklets:** burst/press-scale son worklets puros (`add-expense-tab-button.model.ts`) — nada de `Intl`/locale adentro; si se anima `fabBadge` numérico, formatear en JS thread (memoria `feedback_reanimated_worklet_globals`). `Easing` del mismo runtime que `withTiming` (memoria `feedback_reanimated_easing_runtime`).
- **Íconos:** `NeoTabIcon` (SVG puro, idéntico iOS/Android) ya reemplaza los `AppSymbol`/SF Symbols; `renderAddIcon = () => null` deja de existir (el FAB dibuja su `plus`). SVG children ya OK (memoria react-native-svg cast).
- **Cierre dev:** actualizar `redesign-nav-bar-preview-screen.tsx` a comparar contra `home-final`; opcional marcar el approval-status.
- **Valida:** device Android gama baja (API 29) — surco/píldora visibles o degradación aceptada; iOS device — cadena de modales sin doble-presentación.

---

## Riesgos/gotchas — checklist de respeto

1. `freezeOnBlur:false`/`lazy:false`/`animation:'none'`/`sceneStyle` → **no se tocan** (son navigator/Screen, sobreviven al `tabBar` custom). `app-tabs.tsx:140-141,175,183,149-151`.
2. Emitir `tabPress` con `canPreventDefault` y **respetar `defaultPrevented`** → conserva haptics+pulse (G4) y tour-lock (G5) sin duplicar. `app-tabs.tsx:100-124`.
3. FAB = reusar `AddExpenseTabButton` completo, restilar solo la cara → preserva overlay/burst/sheets/InteractionManager/no-spend/tour. `add-expense-tab-button.tsx:198-202,223-253,408-429`.
4. Tour paso 8: re-host `fabTourRef` sobre disco 62/66 + reconciliar `highlight.borderRadius` (clamp `min(r,w/2,h/2)`). `add-expense-tab-button.tsx:175-183,390`.
5. `useAdvisorBadge` aislado/memoizado (no re-evaluar en cada render de barra). `app-tabs.tsx:36-56`.
6. `insets.bottom` real, descartar `homeIndicator` dibujado. `home-screen.tsx:1619,1944`.
7. `paddingBottom` de contenido bajo barra flotante (GAP real, validar device). `neo-home-screen.tsx:1788`.
8. Excluir ruta `add` del map de ítems; `Redirect` de `add.tsx` intacto para deep-links.
9. boxShadow inset Android version-aware / piso minSdk 29. `home-spec.ts:368-370,523-524`.
10. `transform` siempre array (no undefined). `tab-bar-pressable.tsx:72`.

**Orden de riesgo (menor→mayor):** F0 (decisión) → F1 (extraer visual) → F2 (contrato datos) → F4 (adapter, testeable aislado) → F3 (FAB 1:1, mayor fidelidad) → F5 (swap 1 línea) → F6 (Android). *(F3 y F4 son intercambiables; F3 concentra el riesgo de fidelidad, F4 el de routing — ambos se validan antes del swap de F5.)*

**Decisiones owner pendientes:** (a) confirmar `HomeNavBar` como canónico (F0); (b) burst-ring vs pressed-inset del FAB (F3); (c) fuente de datos para `fabBadge` o dejar `null` (F2).