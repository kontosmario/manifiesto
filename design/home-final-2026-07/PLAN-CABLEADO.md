# PLAN DE CABLEADO — Home rediseñada (`home-final` → live)

**Gate de aprobación: DESPEJADO.** Verificado en repo: `redesign-approval-status.ts:50` → `'home-final': 'aprobada'` (2026-07-21, "es hora de llevarlo y cablearlo"). El informe metrics-model (§15.7) estaba desactualizado en este punto; nav-shell §8 es el correcto. La aprobación incluye la nav nueva con FAB invertido (comentario `redesign-approval-status.ts:45-49`).

**Marco (patrón ya aplicado en auth/onboarding/paywall/notifs):** el kit aprobado (`mobile/components/redesign/home/home-screen.tsx` + `home-spec.ts`) NO cambia su visual; evoluciona su CONTRATO (props + callbacks). Pantalla live nueva en `mobile/screens/home/neo/neo-home-screen.tsx`; swap de ruta de 1 línea en `app/(app)/(tabs)/home.tsx` (nav-shell §1); la vieja `mobile/screens/home/home-screen.tsx` queda sin ruta como referencia (igual que `notifications-screen.tsx`). Chrome dibujado (`HomeStatusBar` réplica :71-92, `homeIndicator` :521, `HomeNavBar` :464-492) se retira al cablear → insets reales + `ExpoStatusBar` (patrón `neo-notifications-screen.tsx:54,225`, gaps-extras §0).

---

## FASES (menor riesgo → mayor)

### FASE 0 — Extracción mecánica de la orquestación de negocio (cero cambio visual)

**Objetivo:** desacoplar las ~600 líneas más delicadas de `home-dashboard.tsx` ANTES de tocar UI, para que la neo-screen las consuma idénticas. Es el mayor riesgo de regresión del cableado (gaps-extras G14).

**Alcance / archivos:**
- Crear `mobile/features/home/use-month-close-orchestration.ts`: mover LITERAL `fireWrappedForClosedCycle` + lock `wrappedInFlight` + auto-open del `MonthCloseDecisionSheet` (5 gates) + auto-fire dinámico (`home-dashboard.tsx:189-783`, en particular :477-530, :587-749, :757-772).
- Crear `mobile/features/home/use-cycle-confirmation.ts`: mover `confirmCycleStartingBalance` (`home-screen.tsx:253-311`), gating de auto-open del cycle sheet (`shouldAutoOpenCycleSheet`, `home-dashboard.tsx:411-445`), silent-anchor con guard de ownership (`home-dashboard.tsx:385-409`), estado `salaryErrorMessage`/`isSavingSalary`.
- Tocar: `home-dashboard.tsx` y `home-screen.tsx` viejos para consumir los hooks (la Home vieja sigue siendo la live).
- **NO tocar una línea de lógica**: cada rama tiene bug histórico documentado (retry storm :392-398, wrapped race :191-196, modal-chain iOS :369-377 — gaps-extras G4/G14).

**Validación:** `tsc` (sin `-p`, con nvm sourceado), suite vitest, smoke manual en dev client del flujo confirmar-cobro → wrapped → decisión de sobrante, y del onboarding sheet. Commit propio.

---

### FASE 1 — Evolución del contrato del kit + variantes de estado faltantes (sin ruta live)

**Objetivo:** que los componentes exportados del kit (`HomeHeader`, `HomeChipsRow`, `HomeHero`, `HomeCycleSummary`, `HomeGoalCard`, `HomeStreakCard`, `HomeActivityRows`, `HomeSectionHeader`) acepten datos reales y cubran el catálogo completo de `estados.dc.html`. Solo se agrega parametrización y variantes ya dibujadas en el catálogo — el visual aprobado del caso feliz no cambia.

**Archivos:** `mobile/components/redesign/home/home-spec.ts` (tokens nuevos), `home-screen.tsx` (props), `mobile/screens/dev/redesign/redesign-home-preview-screen.tsx` (matriz de estados para validar).

**Tokens a agregar al spec** (valores literales del catálogo, estados-catalog §§3-14): saldo/chip durazno `#FBD9BC` (hero ajustado); medidor `#E8A87C`+ink `#FBD9BC` (al límite) y `#D97355`+ink `#F3C9BC` (excedido); pip perdido `#E8A87C` con X `#7A2E17` y semilla `#E3CD9A`; variante vencido de fila FIJOS (reusar `cycleDotVariables/cycleLabelVariables` `#C96F3F`/`#F2A87E`); montos atenuados `#9AA694`/`#7C917A`; borde dashed `#C2C8B4`/`#3A5241`; CTA crema (`145deg #F7F4E6→#E2DEC8` ink `#1F3A26`) y CTA radial verde claro/oscuro (estados-catalog §7/§14); estado pressed del FAB y nav-item dot `#D97E4F` (quedan definidos aunque se usen en Fase 5).

**Contratos de props (por componente, con estados del catálogo que cubre):**

| Componente | Contrato | Estados cubiertos (estados-catalog) |
|---|---|---|
| `HomeHeader` | `{greetingLabel, momentEmoji, displayName, brotPose, unreadCount, assistantPendingCount, settingsHasNudge, onPressAssistant/Bell/Settings, welcome?: boolean}` — badges OCULTOS en 0 (§12), dot naranja en sliders (G7), badge patrón campana clonado al sparkle (G8) | §12 campana con/sin badge; §13 saludo horario + "¡bienvenido!" |
| `HomeChipsRow` | `{members: {avatars, count} \| null (solo-mode), payday: {kind: 'daysUntil'\|'pending'\|'paidToday'\|'configure'\|'hidden', days?}, onPressPayday}` — fila colapsa si ambos null (G9) | §11 Miembros·N / Sueldo próximo / Cobrado hoy ✓ / Configurá tu sueldo› |
| `HomeHero` | `{variant: 'steady'\|'adjusted'\|'setupFixed'\|'setupDynamic', balance, usdLine: string\|null, dayPill: {day,total}\|{warning}, eventChip: EventChip\|null, fixedChip: number\|null, gauge: {status:'holgado'\|'limite'\|'excedido'\|'hidden', budgetPerDay, bodyCopy, fillRatio}, onPressSetup, onPressAddIncome, onPressProjection}` — línea USD condicional (metrics-model §2 gap); medidor y chips OCULTOS en setupDynamic (§14) | §3 Positivo/Ajustado; §4 chips de evento; §5 medidor ×3; §14 hero $0 + Brot `sprout` + CTA crema |
| `HomeCycleSummary` | `{variables: {total, count, sub: topCategory\|fallback, muted?}, fijos: {total, paidOf, sub: nextFixed\|allPaid\|fallback, tone:'normal'\|'dueToday'\|'overdue', muted?}, onPressVariables/Fijos/TopCategory/NextFixed, tourRefs}` — 2 tap-regions por fila como hoy (dashboard-sections §5) | §6 Normal/Vence hoy/Vencido; §14 resumen $0 atenuado |
| `HomeGoalCard` | `{goal: {emoji,title,current,target,pct,remaining}\|null, emptyStyle:'dashed'\|'raise', onPress, onPressCreate}` | §7 Activa/Casi lista/Sin meta ×2 |
| `HomeStreakCard` | `{count, state:'active'\|'atRisk'\|'broken'\|'perfect'\|'zero', pips: PipState[7] (5 estados), brotPose, linkLabel, subLine?, onPress}` | §8 completo + §9 pips (incl. perdido/semilla) |
| `HomeActivityRows` | `{items: ActivityItem[] (≤6), onPressViewAll, onDeleteExpense/Income, pendingDeleteId, empty:'newUser'\|'todayEmpty'\|null, onPressAddExpense}` + slots `loading`/`error` (render delegado, G13) | §10 Con ítems / Vacío catálogo / BR-E usuario nuevo |

**Validación:** preview dev (`app/(app)/settings/dev/redesign-home.tsx` → `redesign-home-preview-screen.tsx`) con matriz de fixtures: 1 toggle por fila de la tabla del catálogo, claro+oscuro, contrastado a ojo contra `estados.dc.html`. El caso feliz debe quedar pixel-idéntico al aprobado. `tsc` + suite (copy nuevo ⇒ correr tests, memoria `feedback_run_tests_on_copy_changes`).

---

### FASE 2 — Derivaciones puras nuevas (lógica sin UI, testeable en node)

**Objetivo:** las 3 piezas de lógica que el mockup exige y hoy no existen, como funciones puras con tests.

**Archivos a crear (+ tests en `tests/`):**
1. `mobile/features/home/select-hero-event-chip.ts` — selector "uno por vez" (README:55; gap clave metrics-model §8: hoy conviven hasta 5 chips). Entrada: los mismos datos del stack actual (`home-hero-card.tsx:369-635`); salida: 1 `EventChip` + el chip de fijos aparte. Precedencia propuesta (respeta el orden ya codificado): `acumulado/sobrante` > `sumado` (`cycleBalanceDiff>0`, `use-home-metrics.ts:378-381`) > `ajustado` (`use-home-metrics.ts:390`) > `ahorrando` (`computeSavingsHeroChip`, `home-hero-savings-helpers.ts:51-103`; null en dinámico) ; chip fijos = `fixedPendingReserved>0` (`use-home-metrics.ts:312-315`).
2. `mobile/features/home/derive-gauge-state.ts` — estado del medidor por ratio `avgDailySpend / dailyBudget` (ambos ya en el hero; consistente con la geometría del arco 124/179 ≈ 69%, metrics-model §4-6). Umbrales default: ✓ <0.85 · límite 0.85–1 · excedido >1 (constantes, ajustables por owner). **NO** usar `daily-budget-engine.ts:216-223`: introduce el buffer de Gastos que el hero deliberadamente no usa (`cycle-disponible.ts:12-15`).
3. `mobile/features/home/derive-brot-pose.ts` — precedencia racha > horario, "nunca dos reacciones" (README:54; matriz metrics-model §13): `love` si `hasLoggedToday` (`use-streak.ts:239`) > `cheer` semana perfecta (`garden-model.ts:255-274`) > `sad` si `isBroken` (`use-streak.ts:250-258`) > `worried` si at_risk `urgent/critical` (`use-streak.ts:385-400`) > `idle` at_risk calm/gentle > pose de momento (`HOME_MOMENTS`, `home-spec.ts:378-382`; `sleep` nocturno SOLO si ya registró, README:53). Alinear bandas horarias con `getGreeting` (`home-dashboard-model.ts:110-115`) — hoy difieren del emoji-set del mockup (metrics-model §13).

**Validación:** vitest env node (memoria `feedback_vitest_no_react_renderer`), tabla de casos por estado. Sin impacto live.

---

### FASE 3 — Orquestador neo (`mobile/screens/home/neo/neo-home-screen.tsx`) — accesible solo por dev

**Objetivo:** la pantalla live nueva completa, montada con datos reales, SIN swap de ruta todavía. Acceso temporal: toggle "datos reales" en el preview dev.

**Estructura del render (copiar EXACTA de `home-screen.tsx:395-421`, gaps-extras G11):**
```
error ? <ErrorState retry={refetchAll}> : !snapshot.data ? null : <dashboard neo>
```
Sin skeleton del hero — el `null` lo tapa el overlay del bridge. Preservar `useSignalDestinationReady(Boolean(snapshot.data))` (`home-screen.tsx:84`) y el gate seedCaches (evita ~7 fetches duplicados en cold start).

**Qué porta INTACTO (lógica invisible):** `useHomeSnapshot` + refetch, `useHomeRealtime` (`home-screen.tsx:182`, G10), `useHomeTelemetry` + `trackTap`/`useTrackElement` + scrolled_to_bottom con buffer 40pt (G6), los hooks de Fase 0 (`useCycleConfirmation`, `useMonthCloseOrchestration`), `HomeDashboardSheets` + `MonthCloseDecisionSheet` + `StartingBalanceCta`/`CollapsingReveal` tal cual v1 (G4), `PushPermissionPrompt` con `ready={Boolean(snapshot.data)}` (G3), `CancelDeletionBanner` y `FreePeriodNudge` con sus gates (G1/G2), memos de referencia estable (dashboard-sections §12.3), `RefreshControl` completo con re-arm + telemetría (`home-screen.tsx:121-140, 386-393`; tintado a los verdes del spec), swipe-to-delete con `SwipeRow` + pendingIds + Alerts (G12), filtros del feed (`!commitment_id` `home-screen.tsx:232-235`; income por `event_date` acotado al ciclo `home-dashboard.tsx:304-316`; anclaje T12:00).

**Cableado de datos por componente:** ver sección NÚMEROS abajo. Fondo: canvas plano `s.bg` del spec, SIN `backgroundSlot`/AmbientBlobs (retiro deliberado, nav-shell §6 — bonus: mueren 3 loops infinitos).

**Tour:** re-cablear los 9 pasos 1:1 (`home-tour.ts:20-89`) con el mapeo de targets de gaps-extras G5 (variables/fixed → las DOS filas de `HomeCycleSummary` con `useTourTargetRef`; radios de highlight ajustados a 32/24/22). Mantener registro del ScrollView + `scrollEventThrottle={16}` + las 4 variantes de copy modo/solo (`home-dashboard.tsx:1069-1104`) + auto-start gateado `!isOnboardingFlow`.

**Telemetría nueva:** agregar a `log-home-event.ts` los `HomeElementId` para: link "Proyección de cierre en Control ›" (tap; destino tab `insights`, nav-shell §7), "Jardín ›", chips de evento del hero, "Ver detalle" del resumen (G6).

**Validación:** dev client (`expo run:ios`, NUNCA Expo Go), checklist completo: cold start (bridge → soar-away sin "green pause"), confirmar cobro → wrapped → decisión, onboarding de ciclo, silent-anchor por gasto, pull-to-refresh, realtime desde 2° device, tour completo en los 4 modos (fixed/dinámico × solo/familia), swipe delete gasto e ingreso, cada estado del catálogo con data real donde sea inducible. `npx expo export --platform ios` si entró alguna dep (memoria `feedback_validate_is_not_bundle`).

---

### FASE 4 — Swap de ruta (1 línea)

- `app/(app)/(tabs)/home.tsx:4-10`: cambiar import a `mobile/screens/home/neo/neo-home-screen.tsx` (nav-shell §1; mismo patrón que `app/(app)/notifications.tsx:2,8`).
- La vieja `mobile/screens/home/home-screen.tsx` + `home-dashboard.tsx` quedan sin ruta.
- NO tocar `_layout.tsx` (prefetch snapshot + warm tabs se conservan, nav-shell §1).

**Validación:** smoke E2E del flujo diario + regresión de navegación a los 12 destinos de la tabla (dashboard-sections §11): notifications, settings, asistente, add-income, expenses (±categoryId, `''` = sin filtro), add-expense push directo, fixed-expenses (±focus), add-fixed-expense, garden, settings/plan.

---### FASE 5 — Nav nueva (tab bar + FAB) — mayor blast radius, al final

Aprobada como parte de home-final (`redesign-approval-status.ts:45-49`). Plan concreto (nav-shell §§2-4):

1. **Mantener el `<Tabs>` de `app-tabs.tsx` intacto** (estructura, orden home·expenses·add·fixed·insights = 1:1 con el mockup, listener de tours :109-125, `useTabHaptics`, badge del asesor en Control :36-56). NO hace falta `tabBar` custom.
2. **Restyle vía overrides existentes:**
   - Nuevo `mobile/components/navigation/neo-tab-bar-background.tsx` (gradiente raise `navGradientCss`/`navShadow`, `home-spec.ts:247-248` claro / `:359-360` oscuro) reemplazando el Liquid Glass; radius en sync 32 con el shell (gotcha `tab-bar-background.tsx:98-104` + `elevation.ts:82`).
   - Variante neo de `buildFloatingTabBarStyle` en `mobile/theme/elevation.ts` (misma geometría flotante absolute — left/right 18, radius 32, ya casi idéntica al mockup).
   - `TabBarIcon`/`TabLabel` → `NeoTabIcon` (`neo-tab-icons.tsx:18-52`, ya existe) + pastilla inset en focused vía `tabBarIcon({focused})`/`tabBarLabel({focused})` (tokens `navActive*`).
   - Dot naranja de notificación por tab (estados-catalog §2): semántica a definir con owner; dejar la prop preparada.
3. **FAB: cambiar SOLO la cara** (`AddExpenseTabButtonFace`): disco 62 + surco 44, offset −26, tokens `fab*` (`home-spec.ts:253-256`; oscuro INVERTIDO crema `:366-369`) + estado pressed del catálogo. Toda la lógica de `add-expense-tab-button.tsx` (overlay 5 acciones, burst, tour ref, modal-chain con `InteractionManager`) se conserva (nav-shell §3).
4. **`sceneStyle` + canvas de los 4 tabs restantes migran JUNTOS** al canvas neo (`#E9EBE0`/`#16271C`) en el mismo commit (`app-tabs.tsx:149-151`) — si solo migra Home, first-visit flicker en los otros tabs (nav-shell §2/§4).

**Críticos a NO tocar:** `freezeOnBlur: false` en AMBAS capas (`app-tabs.tsx:140` Y `app-stack-shell.tsx:219-222` — sin la segunda, Reanimated escribe a view tags inválidos al volver de Settings); `lazy: false` + `animation: 'none'` (:175, :183); `tabBarHideOnKeyboard`.

**Validación:** switch entre los 5 tabs (sin flash, sin animación JS), swipe-to-delete en Gastos tras navegar y volver de Settings (regresión RNGH), tour de Home paso `fab`, overlay del FAB completo, teclado abierto oculta la barra, Android API 29 real (boxShadow inset OK con minSdk 29).

---

## GAPS — decisión de acople (síntesis de gaps-extras §1-2)

| Gap | Decisión |
|---|---|
| G1 CancelDeletionBanner | **Mantener lógica + re-skin ligero** (card raise + borde `#C96F3F`); slot encima del header, precedencia deletion > todo. Componente compartido — restyle beneficia settings también |
| G2 FreePeriodNudge | **Mantener gate/copy/dismiss literal + re-skin** como banda raise entre chips row y hero. Compliance: nunca "gratis/prueba" |
| G3 PushPermissionPrompt | **Lógica invisible — copiar mount tal cual** con mismo `ready`. Restyle del sheet = pase posterior, no bloquea |
| G4 Sheets de ciclo + StartingBalanceCta | **Lógica invisible LITERAL** (Fase 0). Entrada visual **cubierta por el catálogo** (chips del header: Sueldo próximo/Cobrado/Configurá). Sheets tal cual en v1, restyle en pase aparte; StartingBalanceCta re-skin card raise + CTA crema |
| G5 Tour | **Lógica invisible re-cableada 1:1** con targets nuevos (Fase 3) |
| G6 Telemetría | **Invisible — portar entero** + 4 elementIds nuevos |
| G7 Dot settings | **Adaptar UI**: dot 7-8px `#D97E4F` top-right del sliders (mismo lenguaje que el catálogo) |
| G8 Badge asistente | **Adaptar UI**: clonar el patrón badge-campana (19px, oculto en 0) al sparkle. No perder la señal (único descubrimiento pasivo del asistente); dot-sin-número = alternativa a validar con owner |
| G9 Solo-mode | **Mantener semántica** (solo → sin chip miembros; dinámico+solo → fila colapsa). Catálogo cubre "Miembros · 1" pero no el ocultamiento |
| G10 Realtime | **Invisible — 1 línea tal cual** |
| G11 Gate snapshot | **Invisible — estructura de render exacta**, sin skeleton inventado |
| G12 Swipe-delete | **Mixto**: merge/orden/filtros literales; rows nuevas envueltas en `SwipeRow` existente. Verificar que el boxShadow raise no clipee en el translate |
| G13 Error/skeletons | **Mantener `ErrorState`/`ListRowSkeleton` funcionales en v1**; restyle genérico neo (Brot `worried`) en pase aparte. Falta mockup — flag al owner, no bloquea |
| G14 Month-close/Wrapped | **Invisible — extraer a hook en Fase 0, consumir sin modificar** |
| G15 Quick-add de Meta | **Decisión de owner pendiente** — no dropear en silencio; default propuesto: mantener `QuickAddSheet` accesible vía tap en la card hasta decisión |
| Línea USD | **Cubierto**: `usdLine: null` oculta la línea (el real es condicional, mockup la dibuja siempre) |
| Ambient blobs | **Retiro deliberado** — canvas plano del spec |

---

## NÚMEROS — fórmula/fuente canónica (hero + medidor)

> Drift de memoria corregido: la fórmula del cupo ya NO vive en `use-home-metrics:287`; se movió a `mobile/features/family/cycle-disponible.ts` (espejo 1:1 del SQL, parity test `tests/integration/cycle-disponible-parity.test.ts`) — metrics-model, nota inicial.

| Número | Fuente canónica |
|---|---|
| Saldo del mes | `hero.availableToday` = `computeCycleDisponible()` — `cycle-disponible.ts:63-69`: `totalAvailable + cycleExtraIncome + effectiveReservedFixed`, clamp 0. Componentes: `family-dashboard-model.ts:291` (discrecional), `:259-260` (fijos pendientes prorrateados que se SUMAN de vuelta), `use-income-events.ts:95` (extra del ciclo) |
| ≈ US$ | `availableToday / rate.ratePerUsd` (`home-dashboard.tsx:1016-1034`); tasa edge fn `usd-rate` (`use-usd-rate.ts:35-45`); gate `usd_rate_enabled && local_currency !== 'USD'`. NO el campo legacy `usd_exchange_rate` |
| día N de M | `use-home-metrics.ts:298-302` ← `monthlyAccounting.daysIntoMonth/.days` (ventana CONGELADA hasta confirmar cobro) |
| Cupo $/día (arco, monto) | `cycle-disponible.ts:76-91` — sin override: `max(0, ingreso − fijos − ahorro) / días TOTALES`; con override o dinámico: `discrecional / días RESTANTES` (`use-home-metrics.ts:327-330`). SIN buffer (deliberado, `cycle-disponible.ts:12-15`) |
| "Gastás $X/día" | `variableSpentInCurrentCycle / max(1, cycleDay)` — `use-home-metrics.ts:336`. Promedio LINEAL, no el robusto (si algún día se usa `robust-daily-average.ts:47`, chip "Días atípicos descartados" obligatorio) |
| Estado del medidor | NUEVO (Fase 2): ratio `avgDailySpend/dailyBudget`, umbrales 0.85/1.0 default — coherente con la geometría del arco del mockup (fill 124/179 ≈ 69%, metrics-model §4). Descartado el engine de Gastos (mete el buffer) |
| Fill del arco | `min(1, avgDailySpend/dailyBudget)` → dashoffset sobre dasharray 163.4 |
| Sueldo en N días | `daysUntilPayday(payCycle, today)` — `home-dashboard-model.ts:43-47`; pending = `isPaydayPending` (`:94-102`); dinámico → null → chip oculto |
| Chips de evento | selector nuevo (Fase 2) sobre fuentes de la tabla metrics-model §8 |
| Variables / Fijos | `use-home-metrics.ts:406, 409-414` / `family-dashboard-model.ts:318` + `use-home-metrics.ts:419-423`; topCategory `home-top-category-helpers.ts:59-116` (**unificar ventana**: hoy se invoca con `payCycle` frozen mientras el total usa `monthlyAccounting` — metrics-model §9); nextFixed `home-next-fixed-helpers.ts:73-116` con `realCycle.end` freeze:false |
| Meta | `useSavingsGoal` + `buildGoal` `use-home-metrics.ts:547-599` |
| Racha | `use-garden.ts:119-124` (familiar) + `deriveWeekStrip` `garden-model.ts:293-314` |

---

## RIESGOS Y GOTCHAS (checklist activo)

1. **Dos planos del ciclo**: saldo con `payCycle` FROZEN, obligaciones/próximo-fijo con `realCycle` freeze:false (`use-home-metrics.ts:205-207`). No mezclar al cablear el resumen.
2. **Override BRUTO**: `starting_balance` = presupuesto bruto; se resta TODO `var_cycle` (`family-dashboard-model.ts:271-279`). El estado "Ajustado" del hero sale de `cycleStartingBalanceOverride !== null`.
3. **Income dinámico**: `monthly_income = 0` por diseño; gates `cycleIncomeHydrating` (`use-home-metrics.ts:96-110`) + `!cycleAdjusted` evitan flash de CTA equivocado en cold start; payday pill oculto; savings chip null; sin sheets de cobro (wrapped auto-fire propio).
4. **`monthly_income` es DERIVADO**: nunca escribir directo; solo `update_my_income_contribution`.
5. **freezeOnBlur doble**: `app-tabs.tsx:140` Y `app-stack-shell.tsx:219-222` — ambos load-bearing (gestos RNGH + view tags de Reanimated).
6. **CountUpText nunca resetea a 0** — mantener el componente en el pozo del hero.
7. **Gate seedCaches**: `!snapshot.data → null`; sin él, ~7 fetches duplicados y "green pause" del bridge (preservar `useSignalDestinationReady`).
8. **`home_snapshot()` RPC**: cualquier campo nuevo de `family_finance` que la Home neo lea DEBE agregarse al RPC (mordió 2 veces) + flags de UI monotónicos en seedProfile.
9. **Silent-anchor solo owner** (guard RLS anti retry-storm, `home-dashboard.tsx:392-398`) — no "simplificar".
10. **boxShadow Android**: mitigado — minSdk ya es 29 (commit `5a84c139`); inset/outset rinden en todo el piso.
11. **Modal-chain iOS**: `InteractionManager.runAfterInteractions` en transiciones sheet→sheet (wrapped, FAB overlay).
12. **Worklets**: nada de Intl/locale inline; Easing del mismo runtime; no reintroducir el import trap de `useReducedMotion` (root cause del lag Android).
13. **Metro cache stale** tras el swap de ruta → `expo start -c`; deps nuevas → `npx expo export --platform ios`.
14. **Copy nuevo** (chips, medidor, empties) → correr suite completa (test env fuerza 'es').
15. **Tour geométrico**: `scrollEventThrottle={16}` obligatorio o el highlight cae off-target.

---

## DECISIONES DE OWNER PENDIENTES (flaggear antes de Fase 1-2; ninguna bloquea Fase 0)

1. Estilo de chips de evento: glass del catálogo vs pozo oscuro del hero de `home.dc.html` (contradicción interna; el kit ya usa pozo).
2. Chip "AHORRANDO $X": sin visual en el handoff (solo README:55) — pedir mockup o derivar del patrón.
3. Chip "Sobrante": ¿proyección `projectedClose` (gated `cycleDay ≥ 4`) o arrastre `acumulado` del mes anterior? (metrics-model §8).
4. Umbrales del medidor (default 0.85/1.0 propuesto).
5. Mostrar el NÚMERO de racha revierte decisión de producto previa ("el jardín es indulgente", `streak-week-widget.tsx:29-33`) — confirmar.
6. Semántica: badge del FAB, pip "Semilla" (candidato: recovery del jardín), dot de nav por tab.
7. "Sin meta" raise vs dashed (usuario maduro vs nuevo); actividad vacía 54-sin-CTA vs 56-con-CTA (propuesta: catálogo-54 = "hoy vacío" recurrente, BR-E-56 = usuario nuevo).
8. Badge del asistente: numérico clonado vs dot limpio.
9. Quick-add de Meta: dónde vive (detalle vs CTA secundaria en card).

**Secuencia de commits sugerida:** F0 (1 commit mecánico) → F1 (kit+preview) → F2 (derivaciones+tests) → F3 (neo-screen) → F4 (swap, 1 línea, commit propio revertible) → F5 (nav, commit propio). Docs en sync en el mismo commit (`docs/sistemas/` + memoria del rediseño).
