# Navegación entre tabs · animaciones y por qué no parpadean

> Sistema: cómo navegan los 4 tabs (Inicio · Gastos · Fijos · Control), por qué
> Home/Fijos se sienten "instantáneos" y qué se hizo para que Gastos/Control no
> parpadeen ni hagan "warp/salto" en el primer attach. Doc vivo — actualizar al
> tocar el gate, los snapshots o las animaciones de entrada.

Archivos clave:
- `app/(app)/(tabs)/_layout.tsx` + `mobile/components/navigation/app-tabs.tsx` — config del `<Tabs>`.
- `mobile/components/root/app-stack-shell.tsx` — el `<Stack>` de la app (Settings/modales sobre los tabs).
- `mobile/hooks/use-layout-transition-gate.ts` — el gate de `LinearTransition`.
- `mobile/features/home/use-home-snapshot.ts` (`seedCaches`) — warm-seed de caches.
- `mobile/features/gastos/use-gastos-snapshot.ts`, `use-gastos-controller.ts`, `mobile/features/gastos/cupo-diario.ts`.
- `mobile/hooks/use-warm-tabs-snapshots.ts` — prefetch de Gastos/Control.
- `mobile/lib/dev/anim-log.ts` — instrumentación dev-only.

---

## 1. Config del navegador de tabs

`AppTabs` (`app-tabs.tsx`) setea, a propósito:

- **`lazy: false`** — los 5 tab screens se **pre-montan en boot**. Al tocar un tab,
  el árbol React ya está montado; solo cambia el screen activo (feel instantáneo,
  sin trabajo de mount). Costo: ~80ms extra en boot. Trade-off net positivo.
- **`animation: 'fade'`** (gateado por `useReducedMotion` → `'none'`) — crossfade de
  compositing entre escenas ya montadas. Era `'none'`; el plan de nav motion lo cambió.
  **Ver §4b**: con el fade, bottom-tabs 7.15.9 tenía un bug de tab en blanco que se
  backporteó con patch-package.
- **`freezeOnBlur: false`** — dentro del navegador de tabs, los tabs inactivos NO se
  congelan (siguen vivos). Necesario también para que el swipe-to-delete (RNGH) no se
  rompa tras la primera navegación (ver `feedback_freeze_on_blur_breaks_gestures`).
- `sceneStyle.backgroundColor` matchea el canvas dark (`DARK_TAB_CANVAS`) para que no
  flashee el fondo forest bajo el screen en el primer attach.

El `<Stack>` de la app (`app-stack-shell.tsx`) — que monta Settings, Asistente, modales
SOBRE los tabs — usa `freezeOnBlur: true`. O sea: al empujar Settings, el grupo `(tabs)`
se **congela** (react-freeze lo suspende). Esto NO es la causa del parpadeo (se descartó
empíricamente), pero tenerlo en cuenta: las transiciones de stack no las ve el logger de
tabs (los listeners del subtree congelado no emiten).

---

## 2. Por qué Home y Fijos son instantáneos (el patrón a copiar)

**Renderean su contenido entero desde caches warm-seedeadas por `home_snapshot`.** El
`home_snapshot` RPC corre al boot (en `AppStackShell`) y su `seedCaches()` escribe
SÍNCRONAMENTE todas las caches que los screens leen:

- Home gatea el dashboard en `!snapshot.data ? null : <HomeDashboard/>`; cuando monta,
  todos sus hooks (finance, fixed, categorías, savings, recent activity, control intel)
  pegan cache hot en su primer render.
- Fijos lee SOLO caches que ese mismo seed escribió (`fixed_expenses`, `family_finance`,
  categorías `fixed_expense`, `fixed_expense_payments`) → su controller llega **poblado**.

Resultado: **pintan en su layout FINAL en el primer paint**. No hay delta de tamaño
después → ninguna `LinearTransition` tiene qué interpolar, ningún skeleton→content, ninguna
card condicional que monte tarde. **Esa es la propiedad que hay que preservar en cualquier
screen nuevo.**

Gastos y Control NO comparten esto: tienen su **propio snapshot async** (`gastos_snapshot`)
o data que el warm path no seedea (Control: income_events, control_snapshot). Por eso
fueron los únicos que parpadeaban, y por eso necesitaron los fixes de abajo.

---

## 3. Bug clase 1 — "flicker" aleatorio (queryKey churn + número que se resetea)

Síntoma: Gastos/Control parpadeaban aleatoriamente al navegar (no solo la primera vez).

Causas y fixes (commit `8907b31`):

1. **queryKey inestable en Gastos.** `gastosSnapshotQueryKey` incluía `cupoDiario`, un
   **float sin redondear** derivado de la lista de gastos (cambia con cualquier
   realtime/mutación/settle). Cada drift → key nueva → cache miss → `snapshot.data`
   undefined → el gate cae al skeleton → swap = parpadeo.
   - **Fix:** `computeCupoDiario()` (`mobile/features/gastos/cupo-diario.ts`) **redondea al
     peso** y se usa en los 3 sitios que lo calculan (screen, controller, warm-prefetch) →
     las keys coinciden siempre.
   - **Fix:** `placeholderData: keepPreviousData` en el snapshot + el calendar query → aunque
     la key cambie por un movimiento real, la data anterior se queda en pantalla (no cae al
     skeleton tras el primer load).

2. **`CountUpText` reseteaba el número del hero a 0.** Hacía `progress.value = 0` en CADA
   cambio de `value`. Si una slice async resolvía tarde, el número saltaba a 0 y trepaba.
   - **Fix** (`count-up-text.tsx`): el primer reveal cuenta desde 0; los cambios POSTERIORES
     se interpolan desde el valor actual (`hasRevealedRef`). Nunca más salta a 0.

Regla: **no metas valores derivados volátiles (floats) en un queryKey.** Redondealos o
sacalos de la key. Y si un surface gatea en `!data`, sumá `keepPreviousData`.

---

## 4. Bug clase 2 — "warp/salto" del layout en el primer attach

Síntoma: al entrar a una vista, el contenido se **acomodaba/saltaba** de posición (#2 visual).
Solo Gastos/Control; Home/Fijos no.

### El gate de `LinearTransition`

`use-layout-transition-gate.ts` existe para que las `LinearTransition` (animaciones de
layout) NO disparen en el primer paint de un tab pre-montado. APIs:

- `<LayoutTransitionGateProvider label="...">` — envuelve el screen (en la route file).
- `useGatedLayout(LinearTransition...)` — devuelve `undefined` mientras el gate está cerrado.
- `useLayoutGateOpen(): boolean` — versión booleana, para animaciones que no son `layout`/
  `entering` (p. ej. un `useSharedValue` que crece una barra → init en el valor final si el
  gate está cerrado).
- `useOpenLayoutGate(): () => void` — abre el gate; el screen lo dispara en su primera
  interacción.

### La causa raíz del warp

El gate ANTES abría con `InteractionManager.runAfterInteractions` (~72ms post-focus). Pero:

- Gastos usa un **SectionList VIRTUALIZADO** cuyo chrome vive en `ListHeaderComponent`. El
  layout sigue asentándose DESPUÉS de los 72ms (virtualización + data async tardía).
- Cuando el gate abría a media-asentada, la `LinearTransition` (ya armada) **interpolaba** ese
  settle = el warp. Home/Fijos no lo sufren porque asientan en 1 frame (data warm) y Control
  usa ScrollView (reflowea sin re-medir una ventana de virtualización).

### El fix (commit `26bbb83`)

**El gate abre con la PRIMERA interacción del usuario, no con un timer.** Las transiciones de
layout existen para cambios que CAUSA el usuario (filtrar, agregar/borrar) → requieren
interacción. Hasta entonces, el settle del primer attach (y cualquier delta tardío) **snapea**,
sin warp.

- `LayoutTransitionGateProvider` ahora: `open=false` inicial; abre vía `useOpenLayoutGate()`
  (los screens lo enganchan en `onScrollBeginDrag` del SectionList/ScrollView); fallback de
  **1500ms** por si el user nunca toca; **re-cierra en blur** (cada visita arranca protegida).
- Además se gatearon las **entradas crudas** que bypasseaban el gate (snap en el primer attach,
  animan solo después): barras de `category-weights-list`, fade del `gastos-month-calendar`,
  fade del `gastos-advisor-chip`, y el hero de Control (`control-hero-a-titular`: `RiseRow` /
  `RuleScale` vía `useLayoutGateOpen()`).

### El último delta: el advisor chip de Gastos (commit `127b955`)

Aún con el gate cerrado, el **advisor chip** hacía `if (!target) return null` (0px) y crecía a
~52px cuando los `advisorSignals` (no seedeados por `gastos_snapshot`) llegaban tarde → el
`ListHeaderComponent` del SectionList **re-medía content-size** → salto crudo (sin animar).

- **Fix (ui-ux-pro-max `content-jumping` + `empty-states`):** **slot de altura fija**. El chip
  nunca devuelve `null`; sin alerta muestra una afirmación calma con la MISMA altura
  ("Sin alertas por ahora · Tus categorías están en orden"). El header nunca cambia de tamaño →
  no re-mide → no salta.

**Regla para screens con FlatList/SectionList:** el `ListHeaderComponent` debe tener **altura
estable**. Cualquier elemento que pueda montar/crecer con data async tiene que **reservar su
altura** (no `return null` → grow), o el list virtualizado re-mide y el contenido salta.

---

## 4b. Bug clase 3 — tab EN BLANCO al entrar (iOS producción, 2026-08-23)

**Síntoma:** al navegar entre Home / Gastos / Fijos / Control, a veces (~10%, más
seguido tocando rápido) la tab entraba en blanco: sólo la barra, nada de contenido.
Volver a otra tab y regresar la "reanudaba". Sólo en builds de release (el timing
del dev build con Metro lo esconde). Reporte upstream idéntico:
[react-navigation#12755](https://github.com/react-navigation/react-navigation/issues/12755).

**Causa raíz (bottom-tabs 7.15.9, `BottomTabView`):** con `animation` activa, cada
escena tenía UN `Animated.Value` con native driver alimentando dos cosas: la
`opacity` del fade y el **`activityState` de react-native-screens** (0 = escena
desacoplada, 1 = en transición, 2 = arriba) vía `interpolate`. Al enfocar una escena
desacoplada, la escena focalizada recibe `activityState = 2` como prop plana desde
JS, pero el nodo Animated nativo todavía sostiene el `0` y gana la carrera →
react-native-screens nunca la vuelve a acoplar → blanco. La siguiente transición
vuelve a animar ese valor y "la revive".

**Fix:** backport del commit upstream
[`9bfc8d0f65`](https://github.com/react-navigation/react-navigation/commit/9bfc8d0f65)
("don't derive screen detach state from animated value", bottom-tabs 7.18.8) en
`patches/@react-navigation+bottom-tabs+7.15.9.patch`: el `activityState` sale de
estado plano de JS (`lastUpdate.animating` + 32 ms de gracia tras el fade para que la
escena saliente se desacople después, no durante) y el native driver queda sólo para
la opacidad. Guardia: `tests/unit/bottom-tabs-detach-state-patch.test.ts` (falla si el
parche no está aplicado en `lib/module`, que es lo que bundlea Metro).

No se subió bottom-tabs a 7.18.x porque arrastra `@react-navigation/native` 7.2 → 7.3
(+ core) con expo-router 6.0.23 (SDK 54) compilado contra 7.2. Cuando el proyecto pase
a SDK 55+, bottom-tabs ≥ 7.18.8 ya trae el fix: borrar el parche y el test.

Descartado a propósito: `detachInactiveScreens={false}` (el workaround popular del
issue) — esconde el síntoma dejando las 5 escenas nativas siempre acopladas y hay
reportes de stutter en barras custom; `animation: 'none'` también lo evita pero
tira el crossfade que el owner pidió.

---

## 5. Instrumentación dev (`anim-log.ts`)

Logger **dev-only, default OFF** (cada `console.log` cruza el bridge a Metro y ralentiza el
debug build). Se prende en **Ajustes → Desarrollo → "Logs de animaciones"**.

Qué loguea (prefijo `[anim <ms>]`): `nav:focus/blur/tabPress` (+ detección de DUP y ráfagas),
`stack:focus/blur` (Settings/Asistente), `screen:mount/unmount` (re-mounts), `gate:open`,
`countup:value` (resets de número), `slide:enter`, `branch` (skeleton↔content), y un **sampler
de frames por transición** (junta deltas en una ventana de 700ms tras cada focus y emite un
resumen: frames / caídos>32ms / peor delta).

OJO: el FPS REAL juzgarlo en **release build** con el Performance Monitor. El debug build infla
los tiempos (sin minificar + los propios logs). La instrumentación sirve para detectar
anomalías de LÓGICA (re-mounts, resets, dobles), no para medir suavidad verdadera.

---

## 6. El monto del hero — conteo FLUIDO en el UI thread (`count-up-text.tsx`)

El número grande de los heroes (Home: saldo · Gastos: total · Control: días/plata) cuenta
de 0 al valor al revelarse. La versión JS clásica (un `setState` por frame con el número
formateado) **se traba en este device**: medido con un sampler, durante el conteo el JS
thread sufre stalls de **78–171ms** — el `setState` compite con el render churn del boot
(snapshot + los 4 tabs pre-montados por `lazy:false` + los 3 heroes contando a la vez). El
UI thread estaba sano (dt≈8ms a 120Hz); el cuello era 100% el JS thread. Diferir el conteo
(`runAfterInteractions`) y throttlear el muestreo **no alcanzó** — los stalls persistían.

### La técnica (la prop `flourish`)

El monto principal NO usa `setState`. El string se **deriva del `progress` (shared value)
en el UI thread** y se inyecta como la prop `text` de un `TextInput` vía `useAnimatedProps`
→ **cero render/`setState` por frame** → corre a 60/120fps, imposible que se trabe. Es el
patrón estándar de Reanimated para texto animado (docs swmansion + Varun Kukade).

- `Animated.addWhitelistedNativeProps({ text: true })` + `Animated.createAnimatedComponent(TextInput)`.
- `useDerivedValue(() => formatCountWorklet(progress.value, unit))` → el string, en worklet.
- `useAnimatedProps(() => ({ text, defaultValue }))` → inyecta el texto en el UI thread.
- **Formateo en worklet** (`Intl` CRASHEA el UI runtime, ver `feedback_reanimated_worklet_globals`):
  `formatCountWorklet` arma el separador de miles es-AR a mano (puntos) + `$`, o el entero
  pelado (`unit: 'integer'`, p.ej. "DÍAS HASTA AGOTAR").
- El `TextInput` va `editable={false}`, `padding/margin: 0`, `includeFontPadding: false`
  (Android) para quedar idéntico a un `<Text>` en el layout.

`CountUpText` despacha por `flourish` → `<FluidCountText>` (UI thread; los 3 heroes) o
`<JsCountText>` (conteo JS clásico — diferido a `runAfterInteractions` + muestreo por
tiempo; para montos secundarios chicos donde el jank no se nota). El reveal-desde-0 de la
§3 (`hasRevealedRef`) se preserva en ambos modos.

### El destello (variante 6, acorde al theme)

Al asentar: un **brillo breve del accent** (`textShadow` vía `interpolateColor` de alpha +
`textShadowRadius`) que sube rápido (pico ~25% de 600ms) y se disuelve. Sin rebote de
escala. Sutil: pico `GLOW_PEAK = 0.45` (alpha y radio escalan juntos con `glow` → ~0.45
alpha / ~8px). El color lo pasan los heroes desde el theme: Home/Gastos `heroAccent`
(lime); Control el `tone` del estado (el destello combina con el número rojo/peach/verde).

**Regla:** para un número que cuenta y tiene que sentirse premium, NO uses `setState` por
frame — animá un `TextInput` con `useAnimatedProps` y formateá en worklet. El conteo por
`setState` siempre compite por el JS thread y se traba en boots/devices cargados.

### `startWhen` — que el conteo no se gaste tapado (2026-08-13)

El conteo del saldo de la Home arrancaba en el **mount del árbol de tabs**, o sea detrás
del splash de post-login. Con `Easing.out(cubic)` la mayor parte del recorrido se consume
en el primer tercio, así que para cuando la card se veía el número ya estaba casi en su
valor final: el owner reportó que "no se ve el contador andando".

`CountUpText` acepta `startWhen` (flourish-only): mientras sea `false` el número se queda
en 0 sin animar; al abrir corre el conteo entero. **No rompe la regla de la §3**: el gate
no marca `hasRevealedRef` cuando rebota, así que sólo POSPONE el mismo reveal — volver a la
tab sigue sin recontar desde cero. Reduced motion tiene precedencia sobre el gate (en gama
baja no hay animación que esperar: el valor final se asigna en seco igual, si no el número
quedaría congelado en `$0`).

La Home lo abre con `splashIsHidden && (!balanceHydrating || techo)`. **El techo de 2.5s no
es opcional**: `balanceHydrating` incluye `cycleIncomeQuery.isError`, así que offline puede
quedar en `true` para siempre.

### `flightValue` — el color acoplado al número

`CountUpText` también acepta `flightValue`: un `SharedValue` externo que el componente usa
COMO su `progress` interno, de modo que el caller pueda derivar estilo del valor **en
vuelo**. Lo usa el hero de Home para graduar la tinta del monto según cuánto se acerca a
cero ([`hero-balance-ramp.ts`](../../mobile/features/home/hero-balance-ramp.ts)): antes la
tinta la decidía la VARIANTE, que se resuelve con el saldo final desde el primer frame — si
el ciclo cerraba en rojo, el color ya estaba en terracota mientras el número todavía bajaba
desde cero. Ahora **el fondo dice QUÉ (la variante) y la tinta dice CUÁNTO (el valor)**.

---

## 7. Checklist para un screen de tab nuevo (no reintroducir el jank)

- [ ] ¿Renderea de caches warm-seedeadas por `home_snapshot`? Si tiene snapshot propio,
      seedéalo síncrono y gateá el contenido en `!data` con `keepPreviousData`.
- [ ] ¿Algún queryKey incluye un float/valor derivado volátil? Redondealo o sacalo.
- [ ] ¿`CountUpText` u otra animación de número? Que el primer reveal sea desde 0 y los cambios
      posteriores desde el valor actual. Para el monto PRINCIPAL del hero usá `flourish` (conteo
      en el UI thread vía `TextInput`+`useAnimatedProps`; ver §6) — el conteo por `setState` se
      traba.
- [ ] ¿FlatList/SectionList? `ListHeaderComponent` de altura estable; reservá altura para
      elementos async (no `null`→grow).
- [ ] ¿`LinearTransition`/`entering` en el árbol? Gatealos (`useGatedLayout` / `RiseViewGate
      skip` / `useLayoutGateOpen`) y enganchá `onScrollBeginDrag` → `useOpenLayoutGate()`.
- [ ] Probá: cold start → Settings → sub-pantalla → volver → entrar al tab. Sin salto, sin
      re-mount, sin reset de número (verificá con los logs de `anim-log`).
