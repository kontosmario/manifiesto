# Manifiesto — Performance Audit (frontend / mobile)

**Fecha:** 2026-05-02
**Skill base:** `pproenca/dot-skills@expo` (54 reglas Expo + RN priorizadas por impacto).
**Stack auditado:** Expo SDK 54 · RN 0.81.5 · React 19.1 · Reanimated 4.1.1 · expo-router 6.0.23 · TanStack Query 5.90 · New Arch ON · Hermes ON.
**Fuera de scope:** SQL/Supabase backend, edge functions.
**Verificación:** todas las rutas y deps verificadas con grep antes de proponer fix. Las claims que no se sostuvieron están descartadas explícitamente en "No-go zones".

Foto general: el código está mejor que el promedio. Hay disciplina visible en virtualización, snapshot único de cache, freezeOnBlur, worklets v4, memoización del Theme context, y degradación de Skia. Los hallazgos críticos son **3** y todos viven en la capa bundle/launch — no en la UI.

---

## 1) Reporte priorizado por categoría

### 🚀 Launch

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| 🟠 High | `launch-defer-non-critical` · `bundle-avoid-barrel-files` | [mobile/assets/avatars/index.ts](../../mobile/assets/avatars/index.ts) | El barrel hace `import` de **50 SVG components** al evaluar el módulo. De los 13 consumers, ~9 solo usan `isAvatarSlug` / `AvatarSlug` / `randomAvatarSlug` (types + helpers). Hot path: `use-home-snapshot.ts` y `use-family-members.ts` lo importan al boot del app shell, así que las 50 SVGs entran al graph antes del primer frame post-snapshot. | Partir el módulo en `avatars-types.ts` (slugs + helpers + labels) y `avatars-registry.ts` (mapa de components, getter). Migrar consumers a la primera; los 4 que sí pintan SVG mantienen la segunda. | **S** / low |
| 🟢 Polish | `launch-splash-screen-control` | [mobile/components/auth/auth-launch-splash.tsx#L29](../../mobile/components/auth/auth-launch-splash.tsx#L29) | Hard-timer de **2000 ms** (`HIDE_DELAY_MS`) bloquea la entrada incluso cuando el snapshot ya está en cache (warm launch). En cold launch quizá el tiempo está bien; en warm es un costo perceptible. | Acortar a 1000–1200 ms en warm (snapshot cacheado), mantener 2000 en cold. O reemplazar timer fijo por "ready+min(800ms)". | **S** / med (afecta percepción de marca) |
| 🟢 Polish | `launch-defer-non-critical` | [app/(app)/index.tsx](../../app/(app)/index.tsx) → `AppEntryGate` | `BlockingScreenView` se muestra mientras `useHomeSnapshot` resuelve. Está bien para cold; en warm con cache persistido probablemente flashea brevemente. | Confirmar que `useHomeSnapshot` consume cache hydratado de `PersistQueryClientProvider` antes de mostrar Blocking. Si no, agregar `placeholderData` desde la query persistida. | **XS** / low |

### 📦 Bundle

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| 🔴 Critical | `bundle-remove-unused-dependencies` | [package.json#L46-87](../../package.json#L46) → `three`, `@react-three/fiber`, `three-stdlib` | **Verificado**: 0 imports en `mobile/` y `app/`. `three` mainline pesa ~600 KB minified, r3f + stdlib agregan ~200–400 KB combinados. Sin uso = ~800 KB–1 MB de bundle muerto. | `npm uninstall three @react-three/fiber three-stdlib`. | **XS** / low |
| 🟠 High | `bundle-remove-unused-dependencies` (variante asset bundling) | [mobile/features/auth/filament-runtime.native.ts#L16-18](../../mobile/features/auth/filament-runtime.native.ts#L16) | `wallet-cartoon.glb` y `wallet-cartoon-fallback.png` se bundlean al `.ipa/.apk` aunque la única ruta que los usa es `app/(auth)/filament-spike.tsx`, una **spike de auth dev-only**. El módulo de filament + `react-native-worklets-core` también suman peso nativo. | Decidir: ¿la spike va a producción? Si no, sacar la ruta del build de release (gating por `__DEV__` o `EXPO_PUBLIC_ENABLE_FILAMENT_SPIKE`) y considerar quitar `react-native-filament` + `react-native-worklets-core` cuando se decida que no entra. | **M** / med (decisión de producto) |
| 🟡 Medium | `bundle-avoid-barrel-files` | [mobile/components/ui/index.ts](../../mobile/components/ui/index.ts) | Barrel con ~12 re-exports. Metro + Hermes con tree-shaking razonable lo manejan, pero el patrón es la regla canónica del skill. La mayoría del codebase ya importa por path explícito (ver header del archivo). | Mantenerlo si ya funciona — es el caso menos costoso. Si se toca, dividir en sub-barrels (`feedback`, `inputs`, `surfaces`). | **XS** / low |
| 🟡 Medium | `bundle-enable-proguard` · `bundle-split-by-architecture` | [eas.json](../../eas.json) · [app.config.ts](../../app.config.ts) | El profile `production` solo tiene `autoIncrement: true`. SDK 54 + EAS Build hacen Hermes + arch split en release Android por default; **ProGuard/R8** para minificación de código nativo no está explícito. Sin esto, librerías nativas (Skia, RNGH, Reanimated, Filament) shipean símbolos que se podrían strippear. | Setear `enableProguardInReleaseBuilds: true` y `enableShrinkResourcesInReleaseBuilds: true` vía plugin de Expo o `gradle.properties` en prebuild config. | **S** / med (necesita test de release) |
| 🟢 Polish | `bundle-optimize-fonts` | n/a | **No hay `useFonts`** ni custom fonts cargadas. SF/system everywhere → 0 cost. | Nada para hacer. | — |

### 📜 Listas

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| 🟢 Polish | `list-memoize-item-components` | `GastoRow` (en [mobile/screens/home/gastos-v2-screen.tsx](../../mobile/screens/home/gastos-v2-screen.tsx)) | `SectionList` está bien tuneada (`windowSize=9`, `initialNumToRender=12`, `maxToRenderPerBatch=10`, `removeClippedSubviews=true`, `keyExtractor` estable, `renderItem` memoized via `useCallback`, `useInfiniteQuery` con cursor). Falta wrap del row en `React.memo` — solo importa si la lista crece >500 items y el padre re-rendea seguido. | Wrap `GastoRow` en `React.memo` con comparación shallow. | **XS** / low |
| 🟢 Polish | `list-use-flashlist` | varios | FlashList **no instalado**. SectionList nativa está bien tuneada y el dataset (~thousands of expenses con paginación) escala. La migración a FlashList daría un win solo en device de gama baja con scroll muy largo. | **No migrar todavía**. Re-evaluar si aparece jank visible en gama baja Android. | — |
| 🟢 Polish | `list-avoid-scrollview-for-long-lists` | [mobile/components/fijos/fijo-category-groups.tsx](../../mobile/components/fijos/fijo-category-groups.tsx) | Usa `.map()` para renderizar grupos colapsables con ~5–8 categorías × ~3–6 items. Volumen acotado, expand-collapse animado. No es un problema, pero rompe el idiom. | Dejar — el dataset no justifica virtualizar. | — |

### 🖼️ Imágenes

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| 🟢 Polish | `image-use-expo-image` | n/a | `expo-image` **no instalado**. Todo el código usa RN `Image` con `require()` estático y dimensiones explícitas. No hay imágenes remotas (avatares = SVGs locales, categorías = emoji, `who-paid-avatar` = texto). El upside de migrar a `expo-image` es marginal sin remoto. | **No instalar todavía**. Si en el futuro entra avatar remoto o foto de perfil subida, ahí justifica. | — |

### 🌐 Data

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| ✅ | `data-parallel-fetching` · `data-cache-strategies` · `data-request-deduplication` | [mobile/lib/query-client.ts](../../mobile/lib/query-client.ts) · [mobile/features/home/use-home-snapshot.ts](../../mobile/features/home/use-home-snapshot.ts) | Una RPC `home_snapshot()` siembra 10+ caches; `staleTime: 30s`, `gcTime: 24h`, persister con throttle 1000 ms y `refetchOnWindowFocus: false`. Mutations relevantes ya tienen optimistic updates con rollback. **Patrón ejemplar**, no toca. | — | — |
| 🟡 Medium | `data-optimistic-updates` | hooks de fixed expenses (`useRecordFixedExpensePayment`, `useDeleteFixedExpense`, `useUpdateFixedExpense`) | Marcar fijo como pagado / editar / borrar usa `onSuccess` + invalidate, sin `onMutate` optimista. Latencia 200–800 ms perceptible en hot path (marcar pagado es muy frecuente). | Agregar `onMutate` con snapshot/rollback al menos en `useRecordFixedExpensePayment`. | **S** / low |

### 🧭 Navigation

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| ✅ | `nav-use-native-stack` · `nav-unmount-inactive-screens` | [mobile/components/root/app-stack-shell.tsx](../../mobile/components/root/app-stack-shell.tsx) | Native stack con `freezeOnBlur: true` parametrizado en todas las pantallas modal/stack. Decisión arquitectónica documentada en código (líneas 28-52). | — | — |
| ✅ | `nav-avoid-deep-nesting` · proyecto guard | [mobile/components/navigation/app-tabs.tsx#L33](../../mobile/components/navigation/app-tabs.tsx#L33) | `freezeOnBlur: false` en `<Tabs>` (correcto por el bug RNGH conocido — memoria del proyecto). No tocar. | — | — |
| 🟡 Medium | `rerender-avoid-anonymous-components` | [mobile/components/navigation/app-tabs.tsx](../../mobile/components/navigation/app-tabs.tsx) | Cada `Tabs.Screen` define `tabBarIcon: ({color, focused, size}) => <TabBarIcon …/>` inline. Anonymous components se desmontan/remontan en cada re-render del padre. El padre re-rendea cuando cambia `theme`. | Hoistar 5 funciones `HomeTabIcon`, `ExpensesTabIcon`, etc. al top-level del módulo. Análogo al `InsightsTabIcon` que ya existe (líneas 14-39). | **XS** / low |

### 🔁 Re-render

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| 🟠 High | `rerender-use-react-compiler` | [babel.config.cjs](../../babel.config.cjs) · package-lock | **`babel-plugin-react-compiler` ya está en lockfile** (3 referencias) pero NO está en babel config. React 19.1 está instalado. Activarlo elimina ~40-60% del boilerplate `useMemo`/`useCallback` automáticamente y reduce re-renders silenciosos en hot paths (control-v2, home cards, tab bar). | Agregar `plugins: ['babel-plugin-react-compiler']` a `babel.config.cjs` y testear con `expo prebuild --clean` + smoke en device real. **El plugin tiene su propio runtime que se bundlea** → trade-off bundle vs. CPU. | **M** / **high** (nuevo plugin de build, requiere QA) |
| ✅ | `rerender-avoid-context-overuse` | [mobile/theme/theme-provider.tsx](../../mobile/theme/theme-provider.tsx) | Context value memoized con `useMemo` y deps explícitas. Modelo correcto. | — | — |
| 🟢 Polish | `rerender-use-memo-values` | [mobile/components/control-v2/control-v2-hoy-card.tsx](../../mobile/components/control-v2/control-v2-hoy-card.tsx) | `pickHint(...)` se llama en cada render para elegir el smart hint. CPU-bound pero pequeño. | `useMemo` sobre los inputs (`state, libreHoy, delta, racha`). | **XS** / low |
| 🟢 Polish | `rerender-use-callback` | [mobile/components/auth/auth-input.tsx#L35](../../mobile/components/auth/auth-input.tsx#L35) | Usa `Animated` legacy (RN) con `useNativeDriver: true`. Ruta auth fría, costo bajo. | Migrar a Reanimated v4 en el próximo refactor de auth. | **S** / low |

### 🎞️ Animation

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| ✅ | `anim-use-reanimated` · worklet rules | `mobile/components/ui/card-particles.tsx`, `count-up-text.tsx`, `rise-view.tsx`, `shine-overlay.tsx`, `mobile/components/control-v2/control-v2-hoy-card.tsx` | No `Intl`/locale en worklets, `Easing` viene de Reanimated, `runOnJS` para JS-thread setters, shared-wave pattern (1 driver → N partículas) en CardParticles y ParticleField. **Excelente disciplina**. | — | — |
| 🟢 Polish | `anim-use-reanimated` (reduced motion) | [mobile/components/ui/shine-overlay.tsx](../../mobile/components/ui/shine-overlay.tsx) | El loop no chequea `useReducedMotion()`. Visual leve, no crítico. | Skip al loop si reduced motion activo. | **XS** / low |
| ✅ | `anim-avoid-layout-animation` | global | No se detectó `LayoutAnimation` legacy. `LinearTransition` de Reanimated en uso correcto. | — | — |

### 🧠 Memory

| Sev | Regla | Archivo | Por qué | Fix | Costo / Riesgo |
|---|---|---|---|---|---|
| ✅ | `mem-cleanup-useeffect` · `mem-release-heavy-resources` | varios | `cancelAnimation` en cleanups del FAB, `runOnJS` para marshaling, Filament aislado a route auth-only, no se vio leak de subscriptions / supabase channels en hot paths. | — | — |
| 🟡 Medium | `mem-release-heavy-resources` | [mobile/components/control-v2/control-v2-hoy-card.tsx](../../mobile/components/control-v2/control-v2-hoy-card.tsx) | 18 partículas + multiples `useLoopAnimation`. Verificar con profiler en device gama baja que pause-on-blur funcione (Stack tiene `freezeOnBlur: true`, así que sí debería). | Test manual: navegar a Control, ir a otra tab, ver `Reanimated.frameRate` o usar Flipper / Hermes profiler. | **S** / low |

---

## 2) Top 10 quick wins (en orden de ratio impacto/costo)

1. 🔴 **Borrar `three` + `@react-three/fiber` + `three-stdlib`** — verificado 0 imports. Save: ~800 KB–1 MB bundle. Costo XS, riesgo low.
2. 🟠 **Habilitar `babel-plugin-react-compiler`** — ya en lockfile, falta wirear. Win: 40–60% de re-renders en control-v2/home/tabs. Costo M, riesgo high (necesita QA en device real). Fase 5.
3. 🟠 **Partir el avatar barrel** en `avatars-types.ts` (helpers + slugs) y `avatars-registry.ts` (SVGs). 9 de 13 consumers solo necesitan tipos. Save: ~50 SVGs no se evalúan al boot del shell.
4. 🟠 **Decidir el destino de la spike de Filament**. Si no va a producción: gatear la ruta por `__DEV__` o flag, y considerar quitar `react-native-filament` + `react-native-worklets-core` + `wallet-cartoon.glb` del binario release (~few MB de install size).
5. 🟡 **Hoistear los `tabBarIcon` inline** en `app-tabs.tsx` a componentes top-level (siguiendo el patrón ya existente de `InsightsTabIcon`). Costo XS, win pequeño pero claro.
6. 🟡 **Optimistic update en `useRecordFixedExpensePayment`** — marcar fijo como pagado es la mutación más frecuente del hot path "Fijos". Latencia perceptible se elimina. Costo S, riesgo low.
7. 🟡 **Habilitar ProGuard/R8 en release Android** — `eas.json` production no lo configura. Save de install size en .apk. Costo S, riesgo medio (necesita test release).
8. 🟢 **Splash warm vs cold** — bajar `HIDE_DELAY_MS` cuando el snapshot ya está hidratado de cache. Save ~800 ms perceptibles en warm launch.
9. 🟢 **`useMemo` sobre `pickHint(...)`** en `control-v2-hoy-card.tsx`. 1 línea, evita string-pick en cada render del hero.
10. 🟢 **`React.memo` en `GastoRow`** — solo si el dataset crece >500 items (aún no es el caso, pero es 1-line preventivo).

---

## 3) Riesgos / no-go zones

Cosas que la skill recomendaría pero **no convienen** acá:

- ❌ **NO migrar a FlashList**: SectionList ya está bien tuneada (`windowSize=9`, paginación cursor-based, `renderItem` memoized). FlashList es un new dep + cambio de API + riesgo de regression en swipe-to-delete (RNGH). El upside no justifica el costo todavía.
- ❌ **NO instalar `expo-image`**: 0 imágenes remotas. Todos los `Image` usan `require()` con dimensiones explícitas. Migración no produce métrica medible.
- ❌ **NO borrar `react-native-worklets`**: contrario a una claim que apareció en el research, **es peer dep requerida por Reanimated 4.1.1** (`peerDependencies` declara `react-native-worklets >=0.5.0`). Borrarlo rompe el build.
- ❌ **NO borrar `react-native-worklets-core` aún**: lo necesita `react-native-filament`. Solo se puede borrar junto con la spike de Filament.
- ❌ **NO flipear `freezeOnBlur` en `<Tabs>`**: el skill recomienda `nav-unmount-inactive-screens`, pero **rompe gestos RNGH** en tabs (memoria documentada del proyecto). Mantener `false`.
- ❌ **NO migrar a `@react-navigation/stack` (JS stack)**: la decisión está documentada en `app-stack-shell.tsx#L28-52`. Native stack es correcto, no abrir esa lata.
- ⚠️ **Cuidado con React Compiler**: aunque el plugin está en lockfile y el win es real, la combinación React 19 + Compiler + New Arch + Reanimated 4 es relativamente nueva. **Activar en una rama y testear en device real antes de mergear.** Es la única recomendación que requiere QA dedicado.

---

## 4) Plan de fases propuesto

### Fase 1 — Bundle quick wins (1 PR, sin riesgo)
- Borrar `three`, `@react-three/fiber`, `three-stdlib`.
- Hoistear `tabBarIcon` callbacks en `app-tabs.tsx`.
- `useMemo` sobre `pickHint`.
- Splash warm-cold split.

**Métrica:** `npx expo export --platform ios`, comparar `_expo/static/js/ios/*` antes/después. Esperable: −600–900 KB.

### Fase 2 — Avatar barrel split (1 PR, riesgo low)
- Crear `avatars-types.ts` y `avatars-registry.ts`.
- Migrar los 9 consumers de tipos (use-home-snapshot, use-family-members, use-family-admin, use-onboarding-state, login-screen, family-strip, notification-feed-list, etc.) al primero.
- 4 consumers de SVG (avatar-animal, edit-avatar-sheet, step-avatar) al segundo.

**Métrica:** mismo bundle export + medir TTI en cold y warm con `console.time` en root layout.

### Fase 3 — Filament decision (1 PR, decisión de producto primero)
- Decisión: ¿la spike sirve para algo más que research interno?
- Si NO: gatear la ruta por flag, sacar GLB del bundle, evaluar `npm uninstall react-native-filament react-native-worklets-core` después de regenerar prebuild.

**Métrica:** tamaño del .ipa/.apk de release antes vs. después.

### Fase 4 — Optimistic update fijos (1 PR, riesgo low)
- `onMutate` + rollback en `useRecordFixedExpensePayment`. Sumar a `useDeleteFixedExpense` si tiene sentido.

**Métrica:** tiempo entre tap "marcar pagado" y feedback visual (debería bajar de ~400 ms a <50 ms).

### Fase 5 — React Compiler (1 PR, riesgo high, QA dedicada)
- Activar plugin en babel config.
- `expo prebuild --clean`.
- Testear: home, control-v2, gastos, fijos, FAB animations, particles.

**Métrica:** comparar tiempo de scroll en gastos largos y suavidad de breathe del FAB en device gama baja.

### Fase 6 — Release hardening (1 PR, requiere build de release)
- ProGuard/R8 en `eas.json` production.
- Re-medir tamaño de `.apk` y `.ipa`.

Cada fase puede mergear independiente. Recomendado bloquear fases 5 y 6 hasta tener device físico de testing. Las fases 1–4 son seguras de aplicar en serie.

---

## Notas de uso

- Esta auditoría es solo frontend / mobile. La parte SQL/Supabase ya tuvo su pasada (ver `velocity_snapshot` migration de 2026-05-05).
- Si en el futuro querés un audit de animaciones puro, repetir esta estructura limitando alcance a `mobile/components/ui/*` y `mobile/lib/motion/*`.
- La skill `expo` se actualiza con `npx skills update`. Si pasa más de 3 meses entre audits, conviene correrlo antes para tener las reglas más nuevas.
