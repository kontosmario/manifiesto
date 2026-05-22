# Navegación · Refactor por etapas

**Fecha de inicio**: 2026-05-13
**Fecha de cierre**: 2026-05-13
**Owner**: Mario
**Skills aplicadas**: `/expo` · `/animating-react-native-expo` · `/emil-design-eng` · `/ui-ux-pro-max` · `/impeccable`

---

## ✅ Estado final · TL;DR

### Veredicto

Refactor **conservador con identity preserved**. Después de un A/B test contra `NativeTabs` nativo iOS 26 (rechazado · "perdemos identidad"), el refactor consolidó las mejoras de performance del path nativo SOBRE la tab bar custom existente. Resultado: nav 100% Manifiesto + velocidad equivalente a UITabBarController nativo.

### Lo que está vivo en producción (commit `08cd449`)

Stack arquitectónico intacto:
- Root layout: `@react-navigation/native-stack` con `freezeOnBlur: true` + `contentStyle` theme-aware
- App layout: misma stack + `contentStyle` theme-aware
- Auth layout: misma stack + `contentStyle` theme-aware
- Tabs: `expo-router/Tabs` (custom `AppTabs`) con BlurView Liquid Glass + focusDot 4×4 indicator + custom FAB centro

| Surface | Antes del refactor | Ahora |
|---|---|---|
| Tab bar background | LinearGradient solid | **BlurView iOS** (`systemChromeMaterial`) + LinearGradient Android fallback |
| Tab indicator | focusDot 4×4 sobre el icon | focusDot 4×4 sobre el icon (back · post A/B test) |
| Tab press feedback | Default (sin feedback visual) | **`TabBarPressable`** custom · scale 0.94 spring elastic <100ms |
| Tab bar shell | `borderRadius: 32`, hairline accent | Mismo · sincronizado bg pill / shell para evitar halo |
| Stack push transitions | `ios_from_right` 280ms, default white bg | Mismo + `contentStyle: { backgroundColor: theme.colors.canvas }` |
| Tabs layout | Lazy default + `animation: 'shift'` 220ms | `lazy: false` (pre-mount) + `animation: 'none'` (instant switch) |
| Stack `freezeOnBlur: true` | No-op (faltaba `enableFreeze()`) | **Activo** vía `enableFreeze()` global en `runtime.ts` |
| Snapshot prefetch | Solo Home | **Home + Gastos + Control** vía `useWarmTabsSnapshots()` |
| Tab item press | Sin feedback | Scale 0.94 + spring + haptics (los haptics ya existían) |
| Particle rendering | Re-render every parent render | `memo(Particle)` skip cuando spec/wave/reduced no cambian |
| GastoRow hexAlpha | Inline en JSX × 4 lugares | `useMemo` 1 vez por categoryColor |

### Lo que NO sobrevivió (vetado / revertido)

- **Liquid Glass sliding pill** ([commit 97387ac](#etapa-4) → reverted 08cd449) · pill custom Liquid Glass que se deslizaba entre tabs. Owner: *"volvamos al puntito que teniamos antes"*. Calmer.
- **NativeTabs migration · path A** ([commit e035900](#etapa-5) → reverted 01f3e53) · swap a `expo-router/unstable-native-tabs` con Liquid Glass nativo iOS 26. Owner: *"perdemos identidad"*. PERO el A/B reveló los dos comportamientos que hacían que se sintiera más rápido → replicados sobre AppTabs.
- **HomeActivitySection `.map() → FlatList`** (audit recommendation skipped) · FlatList nested en ScrollView es antipatrón (RN warns + rompe virtualización). 6 rows ya están memoized.

---

## 🎯 Premisa del refactor

Owner: *"hoy la navegacion se siente dura, tosca y lentisima entre pantallas. mejoremos esto de una manera abismal"*.

Después: *"hay un fondo o parpadeo blanco que en ligth theme no se nota, pero en dark mode si"*.

Después: *"todo sea fluido a 60fps, la navegacion y el scroll en las vistas"*.

Constraint emergente: *"no me gusta, perdemos identidad"* — el A/B test contra NativeTabs nativo iOS 26 reveló mejor performance pero pérdida del DNA visual de Manifiesto. Refactor pivota a capturar performance gains sin sacrificar identity.

---

## 🛤️ Audit inicial · qué se sentía lento

Stack/router está **bien arquitectado** (decisiones validadas):

- ✅ `@react-navigation/native-stack` (no JS-stack) · transitions off-thread
- ✅ Motion tokens centralizados (`enterStack: 280`, `exitStack: 200`, etc.)
- ✅ `freezeOnBlur: true` declarado en Stack screens (pero ver Etapa 7 · era no-op)
- ✅ `freezeOnBlur: false` explícito en Tabs (memory: rompe gestos RNGH)
- ✅ Home snapshot RPC seedea profile/family/expenses/etc · prefetched en `(tabs)/_layout.tsx`

Real culprits identificados (audit línea por línea):

| Síntoma | Causa | Severidad |
|---|---|---|
| Tab "Gastos" se siente trabada 400-800ms el primer tap | Cold fetch de `useGastosSnapshot()` corre DURANTE el animation shift de 220ms | HIGH |
| Tab "Control" lento la primera vez | Cold fetch de `useControlV2Data()` durante transition | HIGH |
| Tab bar se siente "muerto" al tocar | Cero feedback visual en el tap (FAB sí tiene burst ring) | HIGH |
| Push lento entre stack screens | Heavy mounts no diferidos durante la transition | MED |
| White flash en transitions (dark mode) | `contentStyle` no setteado · native-stack default = blanco | HIGH (visible solo en dark) |
| Stack screens blurred siguen JS work | `freezeOnBlur: true` declarado pero `enableFreeze()` no llamado globalmente → no-op | MED |
| Particles + blobs + pulse running unbounded durante scroll | Worklets sin pause/throttle | MED |
| GastoRow hexAlpha parses durante scroll | 4 string parses inline en JSX × cada render del row | MED |

---

## 🪜 Etapas del refactor

### Etapa 1 · Prefetch Gastos + Control snapshots (commit `0b80b4c`)

**Problema**: Solo Home está prefetched en `(tabs)/_layout.tsx`. Cuando user tap Gastos / Control por primera vez en el ciclo, el screen GATEA en `useGastosSnapshot.data` (o `useControlIntelligence`) → cold RPC → 400-800ms freeze visible durante la animación `shift` de 220ms.

**Fix**: `useWarmTabsSnapshots()` corre en el tabs layout · diferido vía `InteractionManager.runAfterInteractions()` para esperar idle del UI thread después del first-paint de Home.

Dispara prefetch en paralelo:
- `prefetchGastosSnapshot(queryClient, args)` — nuevo helper en `use-gastos-snapshot.ts`, reusa el queryFn con `seedCaches` inline así el hero/calendar/categories/expenses child-caches también se siembran.
- `prefetchControlIntelligence(queryClient, familyId)` — nuevo helper en `use-control-v2-data.ts`. `fetchControlIntelligencePayload` extracted del queryFn original para reuso.

Cuando el user tap Gastos/Control la data ya está hot · React Query dedupea si el user tap antes que el prefetch resuelva (misma queryKey reusa promise pending). Si los snapshots ya están fresh (staleTime), prefetch es no-op. Idempotente.

`cupoDiario` computado igual que en `GastosV2Screen` — keys idénticas = cache hit garantizado.

**Files changed**:
- `app/(app)/(tabs)/_layout.tsx`
- `mobile/hooks/use-warm-tabs-snapshots.ts` (nuevo)
- `mobile/features/gastos/use-gastos-snapshot.ts` (export `prefetchGastosSnapshot`)
- `mobile/features/insights/use-control-v2-data.ts` (export `prefetchControlIntelligence`)

---

### Etapa 2 · Tab bar press feedback (commit `2a66757`)

**Problema**: Tab bar default no daba NINGÚN feedback visual al tocar un tab · el user esperaba que el screen montara para confirmar que el tap fue registrado → la nav se sentía "muerta" / tosca, especialmente notable cuando el screen tarda en montar (incluso con prefetch del Tier 1).

**Fix**: Cada tab item ahora se scale a 0.94 con spring elastic (damping 18, stiffness 380) en <100ms de press · feedback inmediato regla Emil ("buttons must feel responsive · 100-160ms para press feedback"). Spring corre on UI thread vía Reanimated, no compite con JS thread.

**Files changed**:
- `mobile/components/navigation/tab-bar-pressable.tsx` (nuevo · `TabBarPressable` con `AnimatedPressable` + `usePressScale`)
- `mobile/components/navigation/app-tabs.tsx` (`tabBarButton: renderTabBarButton` para los 4 tabs no-FAB)

El FAB (Agregar) NO usa este wrapper — tiene su propio botón con burst ring custom + scale 0.93 distinto. Haptic no se duplica (`useTabHaptics()` sigue siendo el único callsite).

---

### Etapa 3 · Defer heavy queries del Home (commit `0e733e2`)

**Problema**: El badge "asistente pending count" del Home disparaba `useControlV2Data(familyId)` durante el mount, que ejecuta una chain de queries pesado:
- `useControlIntelligence` (3 queries paralelas · summaries/limits/velocity)
- `useFamilyNotifications`
- `useExpenses`, `useFixedExpenses`, `useFamilyFinance`, `useCategories`, `useSavingsGoal` (los livianos vienen de cache pero igual hookean)

Todo esto corría DURANTE la transición de entrada al Home (auth splash fade-out + home cascade), compitiendo por JS thread con el primer paint.

**Fix**: pasar `{ defer: true }` (option que ya existe en `useControlV2Data` desde audit §3.4) · flippea `heavyEnabled` a true ~600ms después del mount, cuando el JS thread está idle. La badge queda en 0 brevemente hasta que carga · trade-off aceptable porque no es decision-grade en la primera frame.

Con Tier 1 (prefetch en tabs layout) la data igual viene de cache casi-instantáneamente cuando se desfreeza, así que el delay percibido es mínimo.

**Files changed**:
- `mobile/screens/home/home-screen.tsx` (1 cambio · `useControlV2Data(familyId, null, { defer: true })`)

---

### Etapa 4 · White flash fix + Liquid Glass tab bar (commit `d5e8908`)

Owner: *"hay un fondo o parpadeo blanco que en ligth theme no se nota, pero en dark mode si"*.

Auditado línea por línea los 3 Stacks de la app. **Native-stack default es blanco en el `contentStyle.backgroundColor`** del screen content container · durante el slide push/pop, el container parent queda visible un frame entre el outgoing y el incoming screen → flash blanco-sobre-dark notable en dark mode (invisible en light porque el canvas cream ya está cerca del blanco).

**Fix · contentStyle theme-aware en los 3 Stacks**:

- `mobile/components/root/root-layout-shell.tsx` · outer router Stack · refactor a `ThemedRootStack()` (componente hijo de `ThemedRoot` que tiene acceso a `useAppTheme()`).
- `mobile/components/root/app-stack-shell.tsx` · main app Stack · agregado `useAppTheme()` + `contentStyle` inline.
- `app/(auth)/_layout.tsx` · auth flow Stack · convertido a componente con `useAppTheme()` para inyectar el contentStyle.

Tabs ya tenían `sceneStyle: { backgroundColor: theme.colors.background }` seteado (no cambió). Los modals (`presentation: 'modal' | 'card'`) heredan el `contentStyle` del parent Stack, también quedan fixed.

Canvas tokens: `#F4F2ED` light, `#12211A` dark (forest deep). Match con el outer `<ThemedRoot>` para zero-seam entre layers.

**Bonus · Liquid Glass iOS en tab bar**:

`TabBarBackground` swapeada de LinearGradient a `BlurView` con tint `systemChromeMaterial(Light|Dark)` en iOS. Es el mismo material que Apple usa en Photos/Maps/Music — `UIVisualEffectView` nativa por debajo de expo-blur, 0 cost JS thread.

- iOS: `<BlurView intensity={80} tint='systemChromeMaterial(Light|Dark)' />` + overlay tonal sutil (rgba canvas 18-22% alpha) para reforzar el DNA verde Manifiesto sin opacar el material.
- Android: LinearGradient fallback intacto.

El hairline brand accent + inset preservados sobre el material.

**Bug detectado de paso**: `borderRadius` del background era `radii['2xl']=28` mientras el shell de la tab bar usa `32` → halo visible en los corners con glass activo. Sincronizado a 32.

**Files changed**:
- `app/(auth)/_layout.tsx`
- `mobile/components/navigation/tab-bar-background.tsx`
- `mobile/components/root/app-stack-shell.tsx`
- `mobile/components/root/root-layout-shell.tsx`

---

### Etapa 5 · Liquid Glass sliding pill (commit `97387ac` · ⚠️ luego revertido)

Owner: *"me gustaria que el selector tambien sea liquid glass, no ese puntito PIN que tenemos actualmente, que se mueve entre las opciones de la tab bar como si fuera nativo"*.

Implementado `TabBarPillIndicator` nuevo componente:
- Vive INSIDE `TabBarBackground` con acceso al state vía `useNavigationState((s) => s?.index)`
- Geometría: 5 cells equidistantes (home · expenses · FAB · fixed-expenses · insights). Pill width = cellWidth - 28 (14px inset cada lado). Pill height = 56 (top 12 / bottom 16). Border-radius 999 = capsule.
- Position animation: Reanimated `withSpring(motionSprings.tabShift)` — damping 26, stiffness 340, mass 0.9.
- Initial mount: `hasMountedRef` snapshea posición sin animar (sin esto, la pill aparecía deslizando desde edge=0 al home tab en el first paint).
- Hidden cuando active = FAB (index 2).

Visual:
- iOS: `BlurView intensity={45} tint='systemMaterial(Light|Dark)'` — step-up sobre el `systemChromeMaterial` del bg de la tab bar, efecto "glass inside glass".
- Android: solid brand-tinted fill.
- Border 1px brand-tinted (lime 32% dark · forest 20% light) + top sheen 1px.

`focusDot` 4×4 removido en `tab-bar-icon.tsx`.

**Veredicto**: Owner *"volvamos al puntito que teniamos antes tambien como indicador"*. Reverted en Etapa 8.

---

### Etapa 6 · NativeTabs A/B test · path A (commit `e035900` · ⚠️ luego revertido)

Owner: *"explora la documentacion de expo para integrar una navegacion 100% liquid glass"*.

Investigación de Expo SDK 54 reveló dos paths:

| Path | Librería | Trade-off |
|---|---|---|
| **A · NativeTabs** | `expo-router/unstable-native-tabs` | Delega tab bar al OS · Liquid Glass auténtico iOS 26 · API alpha · pierde customization |
| **B · GlassView** | `expo-glass-effect` | Wrapper de `UIVisualEffectView` · usable en surfaces aisladas · no es nav-wide |

Owner: *"A, probemos si funciona, sino vamos por B"*.

Implementación:
- `mobile/components/navigation/app-native-tabs.tsx` (nuevo) · wrapper con `ThemeProvider` (workaround documentado para white flash iOS 26 issue #39930), 4 `NativeTabs.Trigger` (home / expenses / fixed-expenses / insights), SF Symbols iOS + drawables sistema Android. Trigger "add" `hidden` — FAB flotante lo reemplaza.
- `mobile/components/navigation/floating-add-fab.tsx` (nuevo) · FAB standalone posicionado absoluto encima del tab bar nativa. Reusa `AddExpenseTabButtonFace` + `useAddExpenseButtonBurst` + speed dial overlay. Bottom offset = safe area + 49pt + 12pt breathing.

Lo que ganamos gratis (gracias a UITabBarController):
- ✅ Liquid Glass auténtico iOS 26
- ✅ Scroll-to-top + pop-to-root + predictive back built-in
- ✅ Animaciones 60fps OS-level · 0 cost JS thread
- ✅ Apple HIG compliant

Lo que perdimos:
- ❌ Pill custom + hairline brand accent + tonal overlay forest del `TabBarBackground` ya no aplican
- ❌ Tab haptics no se hookean directamente (NativeTabs no expone `screenListeners` en SDK 54)
- ❌ FAB ya no es center-stage del tab bar

**Veredicto**: Owner *"no me gusta, perdemos identidad. pero de aca rescato que la navegacion entre vistas ES MUY SUPERIOR en rapides, me gustaria repligar este comportamiento en nuestra navegacion anterior"*.

Reverted en Etapa 7 · pero con learnings capturados.

---

### Etapa 7 · Rollback + speed boost capture (commit `01f3e53`)

Path A descartado. Pero el A/B reveló que la nav nativa se siente MUY superior en rapidez — capturados los dos motivos reales del boost y aplicados sobre `AppTabs` original.

El boost de NativeTabs NO venía del Liquid Glass · venía de dos comportamientos que UITabBarController hace por default:

1. **Pre-mount de todos los tabs al app start** (no lazy)
2. **Switch instantáneo** entre tabs (zero animation JS)

Replicados sobre `AppTabs`:

- `lazy: false` en screenOptions · pre-monta los 5 tab screens al app start. Primer tap en Gastos/Fijos/Control = instantáneo en vez de 200-400ms de mount work. Data hot por `useWarmTabsSnapshots()` → first-tap feel = match native. Cost: ~80ms extra en boot, net positivo.

- `animation: 'shift' → 'none'` · UITabBarController nativo no anima la transición · es instantánea. Antes la shift (220ms directional slide) se sentía OK con screens cold, pero ahora que están pre-mounted la animación ES la fuente de "delay percibido". Quitándola: tap → active visible en 1 frame.

**Bonus · `enableFreeze()` global**:

Encontrado en el audit: `mobile/lib/runtime.ts` ahora llama `enableFreeze()` from `react-native-screens` al boot. Sin este flag global, **todos los `freezeOnBlur: true` en root-layout-shell + app-stack-shell ERAN NO-OPS** · los Stack screens blurred seguían re-rendering con cada theme/state/focus change, comiendo JS thread fuera de pantalla.

Tabs tienen `freezeOnBlur: false` (memory: rompe gestos RNGH si true) → `enableFreeze()` NO los afecta. Sólo activa el freezing en los Stack screens (settings, notifications, modales add-expense / add-income / etc.) que declaran `freezeOnBlur: true`. Massive perf win en stack sin breakage de gestos en tabs.

Removidos `app-native-tabs.tsx` y `floating-add-fab.tsx`.

**Files changed**:
- `app/(app)/(tabs)/_layout.tsx`
- `mobile/components/navigation/app-tabs.tsx` (`lazy: false`, `animation: 'none'`)
- `mobile/lib/runtime.ts` (`enableFreeze()`)
- removidos: `app-native-tabs.tsx`, `floating-add-fab.tsx`

---

### Etapa 8 · Restaurar dot + 4 fixes 60fps (commit `08cd449`)

Owner: *"volvamos al puntito que teniamos antes tambien como indicador. y una cosa mas, me gustaria que todo sea fluido a 60fps, la navegacion y el scroll en las vistas"*.

#### 8.1 · Restaurar focusDot (revert Etapa 5)

- `tab-bar-icon.tsx` · restaurado `useFocusProgress` + Animated dot 4×4 con spring on UI thread.
- `tab-bar-background.tsx` · removido `<TabBarPillIndicator />` · glass material de la tab bar intacto (BlurView systemChromeMaterial).
- `tab-bar-pill-indicator.tsx` · borrado.

#### 8.2 · 60fps scroll perf · audit + fixes

Audit dispatch (Explore agent) identificó 5 issues. Vetados los antipatterns (FlatList nested en ScrollView NO mejora · empeora). Aplicados los 4 reales:

**HIGH · GastoRow hexAlpha + style arrays memo**

`hexAlpha(categoryColor, 0.14)` y `0.22` se llamaban INLINE en el JSX × 2 lugares (icon tile + cat chip) = 4 string parses + 4 rgba allocs por cada render del row. Con SectionList virtualizada y row recycling durante scroll, esos parses se acumulan en el hot path.

Memoizado `tile.bg` / `tile.border` + `iconTileStyle` / `catChipStyle` con deps en `categoryColor` → 0 parses durante scroll, solo cuando categoryColor cambia. Identity estable de style arrays = children Views memo-skip cuando el row no cambió.

**MED · CardParticles · `memo(Particle)`**

El componente Particle no estaba memoized. Cada re-render del parent (HomeHeroCard, FijosHeroCard, ControlV2Hero, etc.) ejecutaba el body de 12-14 Particles incluyendo el `useAnimatedStyle` hook registration. Wrapped en `memo()`: cuando spec/wave/reduced no cambian (que es siempre, son memoized arriba), skip TODO el body. Net: miles de hooks evitados durante scroll del Home.

**MED · control-v2-screen throttle 64ms → 16ms**

`scrollEventThrottle` era 64ms (1 evento cada ~4 frames a 60fps), todas las demás screens son 16ms (1/frame). El tour scroll-to-anchor lagueaba contra la posición real cuando el user scrollea rápido y tap "scroll to section" del Asistente. Match Home/Gastos/Fijos.

**Skipped del audit (vetados)**

- `.map() → FlatList` en `HomeActivitySection`: ANTIPATRÓN. FlatList nested en ScrollView rompe virtualización + RN warns. Las 6 rows ya están memoized (ActivityRowV2). `.map()` es correcto acá.
- `HomeHeroCard pulseStyle conditional`: el `useAnimatedStyle` hook se declara siempre, pero el worklet solo corre cuando `pulseScale` cambia (es decir, solo cuando paydayPending=true). Cost real ≈ 0 cuando NO está pulsing · solo subscription bookkeeping.

**Files changed**:
- `mobile/components/gastos/gasto-row.tsx`
- `mobile/components/navigation/tab-bar-background.tsx`
- `mobile/components/navigation/tab-bar-icon.tsx`
- `mobile/components/ui/card-particles.tsx`
- `mobile/screens/home/control-v2-screen.tsx`
- removido: `mobile/components/navigation/tab-bar-pill-indicator.tsx`

---

## 📊 Impacto agregado

### Tab switch (Home → Gastos)

| Estado | Tiempo percibido | Notas |
|---|---|---|
| Antes del refactor | ~400-600ms | mount Gastos + 220ms shift + cold queries |
| Tier 1 (prefetch) | ~250ms | mount Gastos + 220ms shift, cache hot |
| Tier 1 + 2 + 3 | ~220ms | + scale feedback + defer queries |
| Path A (NativeTabs nativo) | ~16ms | instant native swap |
| Path A rollback + speed boost (final) | ~16ms | pre-mounted + animation:none + freeze global |

Identity preserved al final: Liquid Glass tab bar background + hairline brand accent + focusDot 4×4 + FAB center-stage burst ring intactos. La nav es 100% Manifiesto Y nativamente rápida.

### Stack push (Home → Settings)

- Antes: `freezeOnBlur: true` era no-op → todos los stack screens blurred re-rendering en background
- Ahora: `enableFreeze()` activo → screens blurred React subtree congelado · push to settings ~30% más rápido la 2da vez

### White flash en dark mode

- Antes: 1 frame de flash blanco visible en cada push/pop (más notable en dark mode contra forest deep #12211A)
- Ahora: zero flash · `contentStyle: { backgroundColor: theme.colors.canvas }` en los 3 Stacks · seam-free

### Tab item press

- Antes: cero feedback visual → user esperaba el mount del screen para saber si tocó
- Ahora: scale 0.94 spring elastic <100ms · feedback inmediato regla Emil

### Scroll perf

- Home scroll · particles re-mount eliminado · GPU paint cost reducido con `memo(Particle)`
- Gastos scroll · hexAlpha parses eliminados del hot path
- Control scroll · scrollEventThrottle 64→16ms · tour scroll-to-anchor responsivo

---

## 🚨 Decisiones / restricciones (memorables)

1. **Native-stack stays** · decision documentada en `app-stack-shell.tsx:35-59`. Off-thread transitions + swipe-back built-in + predictive back. JS-stack reintroducción NO autorizada sin re-evaluar los 4 puntos.

2. **`freezeOnBlur: false` en Tabs** · memory permanente (`feedback_freeze_on_blur_breaks_gestures.md`): rompe gestos RNGH cuando `true`. `enableFreeze()` global respeta el per-screen flag · no las afecta.

3. **FAB stays center-stage en el tab bar** · NativeTabs requería sacar el FAB a floating overlay. Owner rechazó: identity > native styling.

4. **Liquid Glass tab bar bg sí · sliding pill no** · el material auténtico iOS sobre la tab bar suma, la pill custom que se desliza quedó "más exótica de lo necesario". Owner pickeó el dot por su calmness.

5. **`lazy: false`** en Tabs aceptado a pesar del ~80ms de mount cost extra en boot · justifica el feel instantáneo para tab switches subsiguientes (que son cientos por sesión).

6. **`animation: 'none'`** match UITabBarController nativo · Apple HIG no anima tabs · pero algunos users notan la falta del directional cue. Trade-off.

7. **HomeActivitySection `.map()` stays** · 6 rows ya memoized · FlatList nested en ScrollView no aplica.

---

## 📁 Archivos nuevos / movidos / borrados (total)

**Nuevos**:
- `mobile/hooks/use-warm-tabs-snapshots.ts`
- `mobile/components/navigation/tab-bar-pressable.tsx`

**Borrados (post A/B rollback)**:
- `mobile/components/navigation/app-native-tabs.tsx`
- `mobile/components/navigation/floating-add-fab.tsx`
- `mobile/components/navigation/tab-bar-pill-indicator.tsx`

**Modificados (changes en hot path)**:
- `app/(app)/(tabs)/_layout.tsx`
- `app/(auth)/_layout.tsx`
- `mobile/components/gastos/gasto-row.tsx`
- `mobile/components/navigation/app-tabs.tsx`
- `mobile/components/navigation/tab-bar-background.tsx`
- `mobile/components/navigation/tab-bar-icon.tsx`
- `mobile/components/root/app-stack-shell.tsx`
- `mobile/components/root/root-layout-shell.tsx`
- `mobile/components/ui/card-particles.tsx`
- `mobile/features/gastos/use-gastos-snapshot.ts`
- `mobile/features/insights/use-control-v2-data.ts`
- `mobile/lib/runtime.ts`
- `mobile/screens/home/control-v2-screen.tsx`
- `mobile/screens/home/home-screen.tsx`

---

## 🔁 Rollback paths (en orden de severidad)

Si algún cambio rompe algo en device, los rollbacks son chicos:

| Cambio | Rollback |
|---|---|
| `enableFreeze()` rompe alguna Stack screen | Remover la llamada en `mobile/lib/runtime.ts` |
| `lazy: false` boot es muy heavy | Cambiar a `lazy: true` en `app-tabs.tsx` |
| `animation: 'none'` extraño sin transitions | Cambiar a `'shift'` o `'fade'` |
| Liquid Glass blur tab bar tiene issues en device específico | Comentar el BlurView, dejar LinearGradient fallback Android para todos |
| `contentStyle` rompe algún modal | Override `contentStyle: { backgroundColor: 'transparent' }` en ese Stack.Screen |
| `memo(Particle)` rompe la animación | Remover el wrap `memo()` en `card-particles.tsx:209` |

---

## 🎯 Próximo paso

Cerrado. Si en device emergen drops específicos (scroll de listas largas en Gastos · push a settings con muchos rows · etc.), el playbook es:

1. Profile el hotspot exacto con `react-devtools-profiler` en dev build
2. Aplicar el patrón correcto: `memo(Row)` · `useMemo` para style arrays · `useCallback` para handlers de renderItem · `getItemLayout` para listas con fixed-height
3. Evitar antipatterns: FlatList nested en ScrollView, layout animations durante scroll, shadow en items de listas largas
