# Perf Baseline · Reanimated frametime · 2026-06-09

> **Sprint C · C13** — Documentación de tooling, target FPS, procedimiento de medición en device real, e identificación de hotspots. **Numbers**: TBD pendientes de medición en device físico (no disponible al momento del audit).

## Targets

| Surface | Target FPS | Razón |
|---|---|---|
| Animaciones largas (wrapped scenes, modal sheets, scroll de gastos) | **60fps sostenido** | Cualquier dropped frame es visible en animaciones > 300ms; el budget por frame es 16.67ms. |
| Micro-interactions (chip press, button feedback) | **60fps sostenido** | < 100ms de duración pero el spike es perceptible. |
| Loading skeletons + ambient blobs | **30fps tolerable** | Animaciones decorativas; bajan budget para no competir con render real. |

## Tooling — opciones evaluadas

### A. React DevTools Profiler + Performance Monitor de Reanimated

- Built-in en dev client / Expo Go (limitado).
- Permite ver re-renders + commits del lado JS, no frametime real del UI thread.
- **Limitación**: no captura el frametime de worklets — solo JS bridge.

### B. Flipper + React Native Performance plugin ⭐ recomendado

- FPS counter en tiempo real (UI + JS thread separados).
- Time series exportable (CSV) para comparar pre/post optimization.
- Requiere build dev cliente (no Expo Go).
- **Limitación**: Flipper soporte para RN está en transición; verificar version compatibility con Expo SDK 54 antes de adoptar.

### C. Xcode Instruments (iOS device físico)

- Más preciso (CPU + GPU + memory en device real).
- Hooks de Reanimated visibles vía signposts (`SIGNPOST_BEGIN` / `_END`).
- Output: trace file (.trace) shareable.
- **Necesario para baseline final**: Flipper no captura GPU bottlenecks.

### D. Reanimated `enableLayoutAnimations(false)` + manual log

- Patrón ad-hoc: en componente sospechoso, logguear `Date.now()` al inicio + fin del worklet.
- Útil para drilldown puntual; no para baseline sistemático.

### Decisión

**Combo Flipper (medición day-to-day) + Xcode Instruments (baseline pre-release)**.

## Procedimiento de medición

### Setup (una vez)

1. Build dev client: `npx expo run:ios --device <iPhone-name>` o `eas build --profile development --platform ios`.
2. Instalar Flipper desktop (https://fbflipper.com) + plugin "React Native Performance".
3. Para Instruments: abrir Xcode → Open Developer Tool → Instruments → "Animation Hitches" template.

### Para cada surface a medir

1. Conectar device físico al Mac.
2. Boot app → navegar a la screen target → empezar measurement.
3. Ejecutar el trigger de la animación (ej: abrir wrapped, scrollear gastos 5s, abrir modal sheet).
4. Detener measurement → exportar trace.
5. Documentar:
   - Min FPS observado.
   - % de frames > 16.67ms.
   - Spike más alto (worst frame).
   - Si hay GPU bottleneck visible en Instruments.

### Devices target

| Device | iOS | RAM | Razón |
|---|---|---|---|
| iPhone 12 | 17+ | 4GB | Baseline mid-tier representativo (most users en AR). |
| iPhone 14 Pro | 17+ | 6GB | Top-tier; debe ir clavado a 120fps en surfaces ProMotion-compatible. |
| iPhone SE (3rd) | 17+ | 4GB | Worst-case representativo (CPU A15 pero pantalla 4.7" + GPU menos eficiente). |

## Baseline numbers — TODO

> No tengo device físico durante este sprint. Tabla en blanco — owner / próximo dev con device hace la medición.

| Surface | iPhone 12 | iPhone 14 Pro | iPhone SE |
|---|---|---|---|
| Home cold start animation | TODO | TODO | TODO |
| Wrapped scene transition | TODO | TODO | TODO |
| Gastos list scroll (200 rows) | TODO | TODO | TODO |
| Add expense modal sheet open | TODO | TODO | TODO |
| Control-v2 alcancia fill anim | TODO | TODO | TODO |
| Onboarding step transition | TODO | TODO | TODO |
| Settings ambient blobs idle | TODO | TODO | TODO |

**Acceptance criteria final**: cada cell ≥ 55fps en iPhone 12 (90% de target).

## Hotspots potenciales identificados (audit estático)

Inventario top-N de componentes con mayor cantidad de `useAnimatedStyle` por archivo. Más hooks = más worklets evaluados por frame = más chance de hitch.

| Componente | `useAnimatedStyle` count | Riesgo | Mitigación sugerida |
|---|---|---|---|
| `cycle-wrapped-modal.tsx` | 9 | ALTO | Refactor D2 (split por scene) — cada scene mountea solo sus 1-2 hooks. |
| `animated-flame.tsx` (gastos) | 6 | MEDIO | Verificar que no se mountee múltiples veces simultáneamente en lista. |
| `fijos-proximos-card.tsx` | 6 | MEDIO | Refactor D4 — separar marquee-ticker que es el más caro. |
| `swipe-row.tsx` (ui) | 5 | BAJO | Worklet por gesture — esperado. Verificar `runOnJS` no en hot path. |
| `add-quick-actions-overlay.tsx` | 5 | BAJO | Solo activo al tap del FAB. |
| `gastos-filter-pill.tsx` | 5 | MEDIO | Si la lista de pills es larga, multiplicar por N. Mitigación: `React.memo` por pill. |
| `category-horizontal-rail.tsx` | 4 | BAJO | Scroll horizontal — el surface está optimizado. |
| `amount-card.tsx` (home) | 4 | BAJO | 1 instance por screen. |
| `ambient-blobs.tsx` | 4 | BAJO | Decorativo — usar driver native + 30fps target. |

## Riesgos conocidos a verificar en device

1. **`cycle-wrapped-modal`**: 9 `useAnimatedStyle` + Skia canvas + `withTiming` + auto-advance interval. Cada transición debería estar < 16ms; sin medir, no sé si lo está. Reduced motion ya implementado (escape hatch).
2. **Gastos scroll con 200+ rows**: usa `FlashList` (verificar); cada row con `useAnimatedStyle` puede pegar al UI thread.
3. **iOS modal-chain**: presentar `<Modal>` mientras otro se cierra ya está mitigado con `InteractionManager.runAfterInteractions` (ver memory). Verificar que se respeta en wrapped → close-flow.

## Threshold para CI (futuro — no en este sprint)

Cuando podamos automatizar, threshold sugerido:
- `npm run perf:baseline` → script que arranca dev cliente, navega + mide via JS bridge a Reanimated.
- Falla CI si la media de FPS de la animación cae > 10% vs baseline commiteado en `perf-baseline.json`.

Por ahora: medición manual + actualización de este doc.

## Resources

- Reanimated docs perf section: https://docs.swmansion.com/react-native-reanimated/docs/guides/troubleshooting
- "Animation Hitches" Instruments tutorial: https://developer.apple.com/videos/play/wwdc2020/10084/
- Flipper RN Performance plugin: https://fbflipper.com/docs/setup/react-native/

---

> **Última actualización**: 2026-06-09 · plan + hotspot inventory completo. Numbers pendientes de medición en device físico.
