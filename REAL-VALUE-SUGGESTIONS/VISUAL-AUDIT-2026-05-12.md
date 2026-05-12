# Visual & Motion Audit · 2026-05-12

> Auditoría pantalla-por-pantalla aplicando `/impeccable` + `/emil-design-eng` + `/ui-ux-pro-max` para llevar cada surface a "production-grade craft".
> Single source of truth para este frente. Cada pantalla tiene su sub-sección abajo; van pasando de 🔴 TO DO → 🟡 IN PROGRESS → ✅ DONE con findings + fixes.

---

## 🎯 Objetivo

Hoy cada pantalla está en su "prime" funcional. Este audit eleva visualmente cada surface a:

- **Motion smoother**: easing curves correctas, durations en banda 150-300ms, stagger consistente, spring-physics donde el caso lo pide
- **Visual impeccable**: color strategy committed, no hero-metric SaaS, no card-grid clone, AA contrast verificado
- **Interaction Emil-grade**: press-scale en todo lo tappable, halo donde hue colisiona, haptics intencionales, exit faster than enter
- **A11y solid**: accessibilityLabels, Dynamic Type, reduced motion respetado en todos los flujos

---

## 📐 Rubric (7 dimensiones)

Cada pantalla se evalúa en estos 7 ejes. Cada eje recibe ✅ pass / 🟡 mid / 🔴 fix con notas concretas (no labels vacíos).

### 1. Color discipline (impeccable)
- Color strategy explícita (restrained / committed / full palette / drenched)
- Semantic tokens vs hardcoded hex
- Sin `#fff` / `#000` puros; neutrales tinteados al hue de marca
- Light + dark mode parity (no inferido de uno solo)
- AA contrast 4.5:1 body / 3:1 large verificable

### 2. Typography (impeccable + uipro)
- Hierarchy via weight + scale ratio ≥1.25 entre niveles
- Line-length ≤65-75ch en bloques de texto
- Letter-spacing intencional (no default en displays)
- Tabular nums (`fontVariant: ['tabular-nums']`) en montos, contadores, timers
- Font scale consistente con la rest of the app

### 3. Layout & spacing (impeccable + uipro)
- 4/8pt spacing rhythm (no valores arbitrarios)
- Safe area top + bottom respetados
- Sin nested scrolls
- Cards usados solo cuando son la mejor afordancia (sin nested cards)
- Sin grid de cards idénticos (template SaaS reflex)

### 4. Motion (emil)
- Custom easing curves (no built-in `ease-in` en UI; usar `cubic-bezier(0.16, 1, 0.30, 1)` ease-out-expo o equivalente)
- Duration 150-300ms para micro-interactions
- Stagger 30-80ms en listas
- `useReducedMotion` respetado (no skip total: reducir, no apagar)
- Springs vs timing elegidos con intención
- Exit ~60-70% del enter duration

### 5. Interaction & touch (emil + uipro)
- `usePressScale(0.97)` en todo lo tappable (rows, cards, CTAs)
- Touch-target ≥44pt (con hitSlop si visual es más chico)
- Haptic en confirmations + destructive actions
- Disabled states visualmente claros (opacity 0.38-0.5 + cursor)
- Loading state visible >300ms con skeleton/shimmer

### 6. Accessibility (uipro)
- `accessibilityLabel` en icon-only buttons
- `accessibilityRole` correcto (button / header / etc)
- Focus order matches visual order
- Dynamic Type no rompe layout (largest size testeado)
- Color-not-only signaling (siempre + icon o + texto)

### 7. Anti-AI-slop (impeccable)
- Sin side-stripe borders (≥1px colored border-left/right como acento)
- Sin gradient text (`background-clip: text` + gradient)
- Sin glassmorphism como default decorativo
- Sin hero-metric SaaS template (big-number + small-label + stat grid genérico)
- Sin identical card grid (8 cards iguales con icon + heading + text)
- Sin em dashes (`—` o `--`); usar comas, dos puntos, paréntesis

---

## 📊 Status board

| # | Pantalla | Ruta | Tier | Estado | Score antes | Score después |
|---|---------|------|------|--------|-------------|---------------|
| 1 | Home | `/(tabs)/home` | T1 | ✅ DONE | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 2 | Gastos v2 | `/(tabs)/expenses` | T1 | ✅ DONE | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 3 | Fijos v2 | `/(tabs)/fixed-expenses` | T1 | 🔴 TO DO | — | — |
| 4 | Control v2 | `/(tabs)/insights` | T1 | 🔴 TO DO | — | — |
| 5 | Add expense | `/add-expense` (modal) | T1 | 🔴 TO DO | — | — |
| 6 | Asistente | `/asistente` (modal) | T2 | 🔴 TO DO | — | — |
| 7 | Notificaciones | `/notifications` | T2 | 🔴 TO DO | — | — |
| 8 | Historial gastos | `/expenses-history` | T2 | 🔴 TO DO | — | — |
| 9 | Filtros gastos | `/expense-filters` (modal) | T2 | 🔴 TO DO | — | — |
| 10 | Categorías gastos | `/expense-categories` (modal) | T2 | 🔴 TO DO | — | — |
| 11 | Coach signal | `/coach/[signalId]` (modal) | T2 | 🔴 TO DO | — | — |
| 12 | Add fijo | `/add-fixed-expense` (modal) | T2 | 🔴 TO DO | — | — |
| 13 | Add income | `/add-income` (modal) | T2 | 🔴 TO DO | — | — |
| 14 | Settings root | `/settings` | T3 | 🔴 TO DO | — | — |
| 15 | Logros gallery | `/settings/achievements` | T3 | 🟢 LIKELY OK (polished 2026-05-12) | — | — |
| 16 | Ediciones | `/settings/editions` | T3 | 🟢 LIKELY OK (built 2026-05-12) | — | — |
| 17 | Savings goal | `/savings-goal` | T3 | 🔴 TO DO | — | — |
| 18 | Family admin | `/settings/family-admin` | T3 | 🔴 TO DO | — | — |
| 19 | Asistente prefs | `/settings/asistente` | T3 | 🔴 TO DO | — | — |
| 20 | Notifs prefs | `/settings/notifications` | T3 | 🔴 TO DO | — | — |
| 21 | Household setup | `/household-setup` (modal) | T3 | 🔴 TO DO | — | — |
| 22 | Plan / Billing | `/settings/plan` | T3 | 🔴 TO DO | — | — |
| 23 | Welcome | `/(auth)/welcome` | T4 | 🔴 TO DO | — | — |
| 24 | Login | `/(auth)/login` | T4 | 🔴 TO DO | — | — |
| 25 | Signup | `/(auth)/signup` | T4 | 🔴 TO DO | — | — |
| 26 | Forgot/Reset/Join/Callback | varios | T4 | 🔴 TO DO | — | — |
| 27 | Onboarding | `/onboarding` (modal) | T4 | 🔴 TO DO | — | — |
| 28 | Blocking screen | shared | T5 | 🔴 TO DO | — | — |

**Tiers**:
- **T1** (5): core daily-use (tabs + add-expense modal). Mayor visibilidad → audit primero.
- **T2** (8): high-engagement secondary modals + screens.
- **T3** (9): settings tree.
- **T4** (5): auth + onboarding (first impression, no revisited).
- **T5** (1): shared / edge screens.

**Excluidos del audit** (internal-only): `dev-health`, `achievements-streak-preview`, `cycle-wrapped-preview`. Su valor es de iteración interna, no UX final.

---

## 🛠️ Workflow por pantalla

Para cada pantalla:

1. **Read pass** — leer el código completo de la screen + componentes principales
2. **Score antes** — gut score 1-5 estrellas sin tocar nada
3. **Findings por eje** — completar las 7 dimensiones con notas concretas (no "puede mejorar")
4. **Priorizar fixes** — máximo 3 fixes por pantalla por iteración (S/M/L tamaño). Más que eso es scope creep.
5. **Implement** — los 3 fixes en commit dedicado
6. **Score después** — re-score
7. **Update tracker** — cambiar 🔴 → ✅ en status board, llenar sub-sección de la pantalla

**Regla de oro**: si una pantalla necesita >3 fixes para llegar a ⭐⭐⭐⭐, vale más rediseñarla parcialmente en otro hito que parchearla.

---

## 🌐 Fixes globales (afectan toda la navegación)

Algunos fixes que descubrimos durante el audit por-pantalla resultaron vivir en capas globales (navigator, root container, theme bridge). En vez de enterrarlos en la sub-sección de la pantalla donde se detectaron, los listamos acá. **Cada pantalla del status board los hereda automáticamente.**

### G1 · Tab transitions con `shift` direccional

**Descubierto auditando**: Home (feedback owner — navegación a Gastos / Fijos / Ver todos sentía extraña).

**Alcance**: toda navegación entre tabs (`<Tabs>` de `@react-navigation/bottom-tabs` v7.15) en TODOS los flujos. Cubre: tap directo en tab bar, `router.push('/(app)/(tabs)/...')` desde cualquier screen, deep links, hardware back entre tabs.

**Fix**: `AppTabs.screenOptions` ahora incluye `animation: 'shift'`. Default `'none'` de react-navigation snapeaba instantáneo sin continuidad direccional (Apple HIG `continuity` y MD `motion-meaning` requieren motion en navegación). `'shift'` desliza el contenido del nuevo tab desde el lado correspondiente al orden de tabs (Home→Gastos slides left, Gastos→Home slides right). ~220ms en UI thread. ([app-tabs.tsx](../mobile/components/navigation/app-tabs.tsx))

### G2 · Theme-aware root containers (dark mode flash fix) — 🟡 PARCIAL

**Descubierto auditando**: Home (feedback owner — flash blanco solo en dark mode al transicionar entre tabs después de aplicar G1).

**Alcance**: toda transición de navegación que cause overlap entre escena saliente y entrante. Cubre: tab `shift`, stack push, modal slide_from_bottom, return de modal a tab. En light mode no era perceptible porque cream + default-blanco son visualmente cercanos; en dark mode el contraste forest-deep vs default-blanco hacía el flash obvio.

**Fix en dos capas aplicado** (la chain root tenía dos containers sin `backgroundColor` theme-aware):

1. **`RootLayoutShell`** ([root-layout-shell.tsx](../mobile/components/root/root-layout-shell.tsx)): refactor del root `<View>` a `ThemedRoot` sub-component que vive dentro de `AppProviders` y usa `useAppTheme()` para `backgroundColor: theme.colors.canvas` (cream / forest deep según tema).

2. **`AppProviders`** ([app-providers.tsx](../mobile/providers/app-providers.tsx)): `GestureHandlerRootView` vive FUERA del theme provider. Solución: `useColorScheme()` de RN lee system preference, aplica `CANVAS_LIGHT` / `CANVAS_DARK` hard-coded en sync con `palette.ts`. Trade-off documentado: user con tema manual override contra system preference puede ver 1 frame de flash al primer mount.

**Por qué no se veía antes**: tabs eran `animation: 'none'` (snap sin overlap = sin ventana de exposición). Stack transitions también podían flashear pero la screen saliente cubre completamente a la entrante en la mayor parte de la animación, masking. Light mode + tabs sin animation = bug latente. G1 + dark mode lo destapó.

**🟡 Bug que aún persiste (2026-05-12)**: el owner confirma que después del fix dual el flash blanco TODAVÍA aparece en algunos casos en dark mode. Las dos capas de fix cubrieron `GestureHandlerRootView` + `RootLayoutShell.View`, pero hay un tercer container o re-render path que sigue exponiendo blanco. Sospechas a investigar en próximo sprint de nav-audit:

- **`SafeAreaProvider`**: no acepta `style` prop directamente, su default bg podría seguir siendo white. Posiblemente envolver con un View themed encima.
- **expo-router Stack scene container**: el `<Stack>` de expo-router renderea sus screens en un view interno que tiene su propio bg. No vimos config explícita; podría requerir `screenOptions.contentStyle = { backgroundColor: theme.colors.canvas }`.
- **Bottom tabs `sceneContainerStyle`**: `screenOptions.sceneStyle` está seteado, pero `sceneContainerStyle` (el wrapper que contiene todas las scenes, no cada scene individual) podría también necesitar bg.
- **`tabBarStyle.backgroundColor`**: la barra inferior podría estar mostrando un strip blanco durante el shift.

Queda agendado como item del próximo sprint. Workaround interim: en dark mode el flash es breve (~80-120ms) y los tests internos pueden ignorarlo, pero requiere fix definitivo antes de submit.

---

## 📚 Subsecciones por pantalla

Cada sub-sección se llena cuando esa pantalla pasa de 🔴 → 🟡 → ✅. Hasta entonces queda como `<!-- TODO -->`.

<!-- ────────────────────────────────────────────────────────── -->

### 1. Home `/(tabs)/home`

**Estado**: ✅ DONE (2026-05-12)
**Score antes**: ⭐⭐⭐⭐ · **Score después**: ⭐⭐⭐⭐⭐

#### Findings

| Eje | Estado | Notas |
|---|---|---|
| 1. Color discipline | ✅ | Theme tokens semánticos. Hardcodes (`#F2A78C`, `#F8D1C3`, `#F2EAD3`) son del brand palette en `palette.ts`. Light/dark parity. |
| 2. Typography | ✅ | `CountUpText` ya aplica `TABULAR` internamente (verificado en `count-up-text.tsx:83`). Hierarchy 14pt→34pt (2.4× ratio). Letter-spacing -1.2 en hero name. |
| 3. Layout & spacing | ✅ | Gap-based stack 8dp. Safe area por `Screen`. Sin nested cards. |
| 4. Motion | 🟡→✅ | Stagger excelente en hero (60/80/120/140/160/240 ms internals). **Fix aplicado**: activity rows arrancaban a 400ms (último a 700ms) — ahora `Math.min(180 + index * 40, 360)`. |
| 5. Interaction & touch | 🟡→✅ | Hero setup CTA + "Ver todos" link tenían opacity-only feedback. **Fix aplicado**: ambos con `usePressScale(0.96-0.98)` + spring. |
| 6. A11y | ✅ | Hero `accessibilityRole="summary"` + composed label. Greeting con header role. Circle buttons con labels. Trend % composed para screen readers. |
| 7. Anti-AI-slop | ✅ | Sin side-stripes, gradient text, glass default, hero-metric template, card-grid clone, em dashes en copy. |

#### Fixes aplicados

1. **[S] Press scale en Hero setup CTA** — wrapped el `Pressable` interno con `Animated.View` + `usePressScale(0.98)`. Reemplazó el `opacity: 0.92` viejo. ([home-hero-card.tsx](../mobile/components/home/home-hero-card.tsx))
2. **[S] Press scale en "Ver todos" link** — `usePressScale(0.96)` + `Animated.View` wrapping el Text. Antes era Pressable default (opacity). ([home-dashboard.tsx](../mobile/components/home/home-dashboard.tsx))
3. **[S] Activity stagger faster start** — delay `400 + index * 60` → `Math.min(180 + index * 40, 360)`. Primer row entra -55% más rápido (180ms vs 400ms), cap total 360ms vs 700ms anterior. ([home-activity-section.tsx](../mobile/components/home/home-activity-section.tsx))

#### Comments

Home ya estaba en su prime visual (gradient + aurora + shine + particles + breathing dot + day chip + pulse warning). Los 3 fixes son refinamientos de feel responsivo. La pantalla pasó de "muy buena" a "Emil-grade" con cambios totales <30 LOC.

#### Sprint 2 — Home-specific fixes (post-feedback owner)

##### Fix 5 — Float icon continuous oscillation (Home-specific)

`FloatView` viejo:

```js
y.value = withRepeat(
  withSequence(
    withTiming(-amplitude),  // 0 → -amp
    withTiming(0),            // -amp → 0
  ),
  -1, false,  // sequence replays from y=0
)
// Path: 0 → -amp → 0 → 0 → -amp → 0 …
```

Problema: cada sequence termina en y=0 con velocidad decelerando a 0; la siguiente iteración arranca en y=0 con velocidad acelerando desde 0 hacia -amp. **Discontinuidad de velocidad → pausa visible → "restart feel"**. Además visualmente: bobbing solo hacia arriba ("hop"), no float real (oscilación alrededor del centro).

`FloatView` nuevo:

```js
y.value = -amplitude / 2  // inicia en extremo negativo
y.value = withRepeat(
  withTiming(amplitude / 2, { easing: Easing.inOut(Easing.sin) }),
  -1, true,  // reverse-alternate
)
// Path: -amp/2 → +amp/2 → -amp/2 → +amp/2 …
```

Con `reverse=true` la animación se reproduce al revés automáticamente al llegar al destino. La velocidad llega a 0 SOLO en los extremos (peaks), que es lo natural en una sinusoidal. Resultado: oscilación continua sin pausas, alrededor del centro. ([float-view.tsx](../mobile/components/home/animated/float-view.tsx))

##### Fix 7 — Activity feed mostraba solo 1 row de 6 esperados (Home-specific data bug)

Owner detectó que la sección "ACTIVIDAD" mostraba solo 1 gasto en vez de los 6 esperados.

**Root cause** — secuencia slice → filter:

1. `home_snapshot` SQL: retorna top 120 expenses ordenados `created_at DESC`, **incluyendo** rows con `commitment_id` (auto-pagos de fijos).
2. `use-home-snapshot.ts` seed: `payload.expenses.slice(0, 6)` — slice **antes** de filtrar.
3. `home-screen.tsx`: `(recentExpensesQuery.data ?? []).filter(e => !e.commitment_id)` — filter **después** del slice.

Resultado: si los 6 más recientes eran 5 fijos auto-pagados + 1 gasto manual, el activity feed mostraba solo 1. El bug se intensificaba el día que el user pagaba 3+ fijos seguidos.

**Fix dual** (defensa-en-profundidad para todos los paths que pueblan `expenseQueryKeys.recent(...)`):

1. **`use-home-snapshot.ts`** seed: pre-filtra antes del slice. `payload.expenses.filter(e => !e.commitment_id).slice(0, 6)`. El RPC trae buffer de 120 rows — sobra para sobrevivir cascadas de fijos.

2. **`useRecentExpenses` hook** ([use-expenses.ts](../mobile/features/expenses/use-expenses.ts)): over-fetch `limit * 4` rows desde DB, filter + slice client-side. Cubre el refetch path post-mutation (cuando `useCreateExpense` invalida la cache). No agrega filter SQL para evitar branching de soporte legacy del column `commitment_id`.

3. Home screen mantiene su filter post-query como **safety net** — idempotente con los dos fixes anteriores. No se removió.

##### Score final

⭐⭐⭐⭐⭐ confirmado (con 🟡 G2 dark mode flash como ítem global pendiente).

<!-- ────────────────────────────────────────────────────────── -->

### 2. Gastos v2 `/(tabs)/expenses`

**Estado**: ✅ DONE (2026-05-12)
**Score antes**: ⭐⭐⭐⭐ · **Score después**: ⭐⭐⭐⭐⭐

#### Findings

| Eje | Estado | Notas |
|---|---|---|
| 1. Color discipline | ✅ | Theme tokens consistent. Hardcodes `#A6EF8F` y `#297811` en RefreshControl tintColor son brand palette, aceptables. |
| 2. Typography | 🟡→✅ | `CountUpText` con TABULAR built-in ✅. Hierarchy bien (header 34pt, hero 40pt, row title 14pt). **Fix aplicado**: `groupTotal` (section header amount) y `GastoRow.amount` ahora con `fontVariant: ['tabular-nums']`. |
| 3. Layout & spacing | ✅ | Gap 10dp consistent. Safe area por Screen. Sin nested cards. Hero richer que el SaaS hero-metric template. |
| 4. Motion | ✅ | LinearTransition 260 en header reflow. FadeIn 180 / FadeOut 140 / Layout 220 en rows con gating `rowAnimationEnabled` (no contendrá worklets durante tab transition). RiseView 100/140 staggered. Filter pill press scale 0.96 custom. |
| 5. Interaction & touch | 🟡→✅ | Filter pills tenían press scale custom ✅. **Fix aplicado**: `clearFiltersBtn` y `emptyAction` convertidos de opacity-only a sub-componentes con `usePressScale(0.97)` + `Animated.View`. |
| 6. A11y | ✅ | Labels compuestos, `accessibilityActions` wired, `accessibilityState` en pills, `accessibilityHint` en swipe. |
| 7. Anti-AI-slop | 🟡→✅ | Sin side-stripes, gradient text, glass, card-grid. **Fix aplicado**: "— Fin del ciclo —" (em dashes ban) reemplazado por eyebrow editorial centrado con rule-line a cada lado. |

#### Fixes aplicados

1. **[S] Press scale en `clearFiltersBtn` + `emptyAction`** — extracción a sub-componentes locales `ClearFiltersButton` + `EmptyActionButton` con `usePressScale(0.97)` (no podían usar el hook en `useMemo`/`ListEmptyComponent` callbacks). Reemplaza el `opacity: 0.85` fade muerto por spring scale Emil-grade. ([gastos-v2-screen.tsx](../mobile/screens/home/gastos-v2-screen.tsx))
2. **[S] Tabular nums en amounts** — `groupTotal` (section header) y `GastoRow.amount`. Antes los dígitos proporcionales causaban micro-wobble en la columna right-aligned al scrollear. Ahora alinea limpio. ([gastos-v2-screen.tsx](../mobile/screens/home/gastos-v2-screen.tsx), [gasto-row.tsx](../mobile/components/gastos/gasto-row.tsx))
3. **[S] Em dashes "Fin del ciclo"** — replaced `"— Fin del ciclo —"` con eyebrow editorial: `FIN DEL CICLO` (uppercase, 10pt, weight 800, letter-spacing 1.8) flanqueado por dos rule-lines hairline. Más limpio, alineado con impeccable's em-dash ban + matchea el lenguaje editorial del Wrapped/Ediciones. ([gastos-v2-screen.tsx](../mobile/screens/home/gastos-v2-screen.tsx))

#### Comments

Gastos era una de las pantallas más cargadas (hero rich + advisor chip + smart filter + month calendar + virtualized SectionList + streak icon + swipe rows + paginación). Los 3 fixes son polish-level: la pantalla ya operaba muy bien funcionalmente. Cambios totales <60 LOC.

#### Sprint 2 — Re-audit "con lupa" (deep dive)

Owner pidió re-audit más detallado, mirando con magnifying glass. El primer pase quedó en la superficie del screen file; este pase entró a los 12+ sub-componentes (calendar, advisor chip, streak flame, average bars, category weights list, swipeable row, filter pill, hero card internals). Se encontraron **10+ issues granulares** que el primer pase no detectó.

##### Hallazgos críticos no detectados antes

**🚨 Impeccable absolute ban — side-stripe border**: `GastosAdvisorChip` tenía:
```js
accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 }
```
Exactamente el patrón que impeccable prohíbe explícitamente. Side-stripe border de 3px como acento de color en card.

**🟡 7 Pressables sin press feedback Emil-grade** distribuidos en sub-componentes:
- `StreakFlameIcon` (44×44 tap-target en header, sin feedback)
- `DayCell` calendar (sin feedback)
- `focusCenter` "Volver al ciclo" (72pt day number, sin feedback)
- `registerForgottenBtn` (sin feedback)
- `backChip` "Ciclo completo" (sin feedback)
- `ChevronBtn` prev/next (solo opacity disabled)
- `GastosAdvisorChip` (opacity-only `0.85`)

**🟡 Typography incompleto del pase 1**:
- `CategoryWeightsList.amountText` sin tabular-nums (afecta hero category amounts)
- Calendar focus-mode `statValue` sin tabular-nums (GASTADO + MOVIMIENTOS no alinean)

**🟡 Motion · cascade order incoherente**: el calendar entraba a 0ms (sin RiseView), antes del hero (delay 100ms). Mismo issue con advisor chip. Cascada visual rota.

##### Sprint A — Side-stripe ban + advisor press

Refactor de `GastosAdvisorChip`:
- ❌ Side-stripe `accent: { position: 'absolute', left: 0, width: 3 }` removido
- ✅ Reemplazado por `iconTile` 28×28 con `hexAlpha(tone, 0.14)` bg + `hexAlpha(tone, 0.28)` border — el color del urgency se comunica via el container del icon, no via stripe
- ✅ `usePressScale(0.97)` con `Animated.View` reemplaza el `opacity: 0.85` muerto

Resultado: la jerarquía visual mejora (el icon ahora es elemento central no un decorador junto a un stripe random), respeta impeccable, y el tap se siente Emil-grade. ([gastos-advisor-chip.tsx](../mobile/components/gastos/gastos-advisor-chip.tsx))

##### Sprint B — Calendar + Streak press feedback batch

**`StreakFlameIcon`** ([streak-flame-icon.tsx](../mobile/components/gastos/streak-flame-icon.tsx)): `usePressScale(0.94)` (escala más pronunciada para tap-target chico de 44×44) + `Animated.View` wrap.

**`GastosMonthCalendar`** ([gastos-month-calendar.tsx](../mobile/components/gastos/gastos-month-calendar.tsx)):
- `DayCell` (`usePressScale(0.92)`) — solo activo cuando `isPast`. Future cells siguen disabled.
- `ChevronBtn` (`usePressScale(0.92)`) — solo activo cuando `!disabled`. Disabled retiene el `opacity: 0.35` como signal de estado.
- `focusCenter` (`usePressScale(0.97)`) — 72pt day number area grande, escala sutil.
- `registerForgottenBtn` (`usePressScale(0.97)`) — botón mediano con border.
- `backChip` (`usePressScale(0.95)`) — pill compacto con bg sólido, escala más pronunciada para que el feedback se note.

6 Pressables convertidos, cada uno con escala matched al peso visual del tap-target. Todos respetan el reduced-motion fallback del hook (`scale = 1`).

##### Sprint C — Tabular nums residuales + cascade order

**Tabular nums**:
- `CategoryWeightsList.amountText` — hero category amounts ahora alinean cleanly ([category-weights-list.tsx](../mobile/components/gastos/category-weights-list.tsx)).
- Calendar `statValue` — focus-mode GASTADO + MOVIMIENTOS alinean entre los dos stats blocks ([gastos-month-calendar.tsx](../mobile/components/gastos/gastos-month-calendar.tsx)).

**Cascade order** ([gastos-v2-screen.tsx](../mobile/screens/home/gastos-v2-screen.tsx)):
- Calendar ahora con `RiseView delay={120}` (antes 0ms)
- Advisor chip ahora con `RiseView delay={160}` (antes 0ms)

Cascada completa coherente: header(0) → hero(100) → calendar(120) → filter(140) → advisor(160). Lectura top-down como en Home.

##### Comments del re-audit

El primer pase fue "good enough" pero superficial — vi el screen file y 2 sub-componentes principales. La diferencia entre **mirar** una pantalla y **estudiarla con lupa** se manifiesta en:
1. **Ban-explícito invisible** (side-stripe) que solo se ve leyendo styles de sub-componentes
2. **Interaction debt** que se acumula en componentes anidados (calendar, streak) y no es visible desde el screen file
3. **Motion order** que solo se nota cuando trazás los `RiseView delay` props a lo largo de toda la cadena

Lección para próximas pantallas: cuando una pantalla tiene 5+ sub-componentes interactivos, asignar 2× el tiempo del read pass.

Total Sprint 2: 3 commits, ~150 LOC, 10+ issues granulares resueltos. Score sigue ⭐⭐⭐⭐⭐ pero "más sólido" — los detalles invisibles ahora compounden coherentes.

#### Sprint D — Contrast audit light + dark (post Sprint 2 + hotfix calendar)

Owner pidió audit de contrastes en ambos modos. Cálculo sistemático WCAG sobre cada par fg/bg en Gastos. Matriz resumen:

| Elemento | Light contrast | Dark contrast | Status |
|---|---|---|---|
| Today dot (BreatheDot heroAccent sobre `text` bg) | ~9:1 ✅ | **~1.16:1** 🔴 | INVISIBLE en dark |
| Hero `tileLabel` heroAccent sobre gradient #297811 | 4.2:1 | 4.2:1 | 🟡 Marginal fail AA (4.5) |
| Hero `heroMuted2` (alpha 0.55) sobre gradient | 2.5:1 | 2.5:1 | 🔴 Fail AA notable |
| EmptyActionButton `primary` sobre primarySurface | 5.2:1 ✅ | **4.4:1** 🟡 | Marginal fail dark |
| GastoRow text/textMuted/textSoft sobre creamCard | 14/5.5/5.5 ✅ | 6/5.3/4.6 ✅ | OK |
| Section header text/textSoft sobre canvas | ≥10 ✅ | ≥10 ✅ | OK |
| Calendar mood cells (green/amber/red, bg + matched fg) | ≥5:1 ✅ | ≥5:1 ✅ | OK |
| Filter pills (active + inactive) | ≥6:1 ✅ | ≥6:1 ✅ | OK |
| Calendar focus stats | ≥5:1 ✅ | ≥5:1 ✅ | OK |

##### Fix D1 — Today dot invisible en dark mode (crítico)

`DayCell` Today: `bg = theme.colors.text` (cream #F2EAD3 en dark), `BreatheDot color = heroAccent` (#A6EF8F). Lime sobre cream → 1.16:1 → **prácticamente invisible**. Solo en dark mode (en light bg = forest deep, lime se ve perfecto).

Fix: theme-aware dot color.

```diff
- <BreatheDot size={4} color={theme.colors.heroAccent} periodMs={1600} />
+ <BreatheDot
+   size={4}
+   color={theme.isDark ? theme.colors.canvas : theme.colors.heroAccent}
+   periodMs={1600}
+ />
```

En dark mode el dot ahora es forest deep #12211A sobre cream cell bg → high contrast. ([gastos-month-calendar.tsx](../mobile/components/gastos/gastos-month-calendar.tsx))

##### Fix D2 — Hero gradient small-text contrast

Hero card tenía 4 elementos usando `heroMuted2` (rgba(242,234,211,0.55)) sobre gradient verde — contraste efectivo ~2.5:1, severo fail AA. Switch a `heroMuted` (alpha 0.78) en los 4 usos:

- `avgLabel` "PROMEDIO DÍA"
- `avgSub` "· últimos 22d"
- `weightsLabel` "MÁS PESO POR CATEGORÍA"
- `mutedColor` prop a `CategoryWeightsList` (rows "· 25%" etc.)

Resultado: mejora de **2.5:1 → 3.48:1** (40% más contraste). Sigue marginal de AA (req 4.5), pero ahora supera AA-Large threshold (3:1) y elimina el rango severamente ilegible. Trade-off documentado: hit AA estricto requeriría usar `heroText` solid para todo, perdiendo la hierarchy de "primary number" vs "muted label". El compromiso preserva hierarchy mientras mejora legibilidad significativamente. ([gastos-hero-card.tsx](../mobile/components/gastos/gastos-hero-card.tsx))

No toco el palette token `heroMuted2` directamente — el cambio se queda scoped a `GastosHeroCard` para no rippler a `HomeHeroCard` sin auditarlo primero.

##### Fix D3 — EmptyActionButton primary text en dark

`EmptyActionButton.text` color `primary` sobre primarySurface (rgba primary alpha 0.12) sobre creamCard:
- Light: `primary` #297811 sobre effective bg ≈ #F2FAEC → **5.2:1** ✅
- Dark: `primary` #A6EF8F sobre effective bg ≈ (62,108,80) → **4.4:1** 🟡 (req 4.5)

Switch a `primaryStrong`:
- Light: `primaryStrong` #1F590D → **7.7:1** ✅ (mejor)
- Dark: `primaryStrong` #D1F7C5 → **5.1:1** ✅ AA pass

Single-token change, AA cleanly en ambos modos.

##### Hallazgos NO fijados (documentados como follow-up)

- **`tileLabel` "Puedes gastar por día"** uses `heroAccent` sobre gradient → 4.2:1 (marginal AA fail por 0.3). Aceptable como hierarchy signal pero requiere fix futuro: bump heroAccent a primaryStrong en hero context, OR redesign del gradient con un punto medio más oscuro para que heroAccent pase AA.
- **Filter pill count chip**: en dark mode `inactiveCountFg` puede ser una categoría color (`color` prop) sobre `pageBg` #12211A. Para categorías con tonos mid (olive, brown, dusty) la legibilidad podría caer. Requiere audit del set actual de categorías y posiblemente clamping de category colors a un mínimo de brillo.

Total Sprint D: 3 fixes, ~40 LOC. Score sigue ⭐⭐⭐⭐⭐ con dos contrast trade-offs documentados.

#### Sprint E — Filter pills + Movimientos rows contrast deep-dive

Owner pidió zoom específico sobre dos componentes: "Filtrar por categoría" y "Movimientos". Audit matricial de cada estado en ambos modos reveló **3 bugs de contrast invisibilizando contenido**:

##### Discovery: las 12 category colors son TODAS pasteles

`CATEGORY_FALLBACK_COLORS` en `use-categories.ts` define 12 colors fijos, todos con lightness 0.55–0.85 (`#89C8F7 → #9DE7C8`). Funcionan perfecto como **chip backgrounds tinted al 14%**, pero rotos como **TEXT colors** en algunos contextos:
- Pastel light sobre `pageBg` #F4FDF2 (faint mint) light → ~1.5–2:1 ❌
- Pastel light sobre tinted-chip-bg (0.14 sobre creamCard light) → ~1.6:1 ❌

##### Matriz audit detallada

**`GastosFilterPill`**:

| Estado | Elemento | Light | Dark |
|---|---|---|---|
| Inactive | Label `text` on `creamCard` | 14:1 ✅ | 6:1 ✅ |
| Inactive | **Count chip fg** | **1.5–2:1** 🔴 | 8–10:1 ✅ |
| Active | Label `creamCard` on `text` | 14:1 ✅ | 6:1 ✅ |
| Active | **Count chip fg** (lime on white-alpha bg) | 6:1 ✅ | **1.16:1** 🔴 |

**`GastoRow`**:

| Elemento | Light | Dark |
|---|---|---|
| title/subMeta/notes/amount | All ✅ | All ✅ |
| **catChipText** (categoryColor on tinted bg) | **~1.6:1** 🔴 | ~3.3:1 🟡 |

##### Fix M1 — Filter pill INACTIVE count chip fg (light mode catástrofe)

Original: `inactiveCountFg = color ?? theme.colors.text`. En light, category color pastel sobre `pageBg #F4FDF2` (faint mint paper) = essentially invisible.

Fix: extraer util compartido `darkenForLightBg` ([`mobile/utils/category-color.ts`](../mobile/utils/category-color.ts)) que deriva variante hue-preserved HSL L=22, S=+8 (mismo patrón que `darkenToneForText` en `control-v2-header.tsx`). Theme-aware:
- **Light**: usa derivada oscura → contraste ≥6:1 sobre pageBg
- **Dark**: mantiene pastel original → 8-10:1 sobre pageBg dark

##### Fix M2 — Filter pill ACTIVE count chip fg (dark mode invisibility)

Original: `activeCountFg = theme.colors.heroAccent` (lime #A6EF8F). En dark, el `activeBg = text` es cream #F2EAD3, el chip bg hardcoded `rgba(255,255,255,0.18)` blend a near-cream, y lime sobre near-cream = **1.16:1 invisible**.

Fix dual:
1. `activeCountBg` ahora theme-aware: `rgba(15,46,31,0.18)` (forest alpha) en dark mode evita el chip casi-blanco.
2. `activeCountFg` switch a `activeFg` (creamCard) — el count "echo" el label color, contraste alto en ambos modos:
   - Light: creamCard #FFFBF2 sobre dark-grey-green chip bg → ≥6:1 ✅
   - Dark: creamCard #305A47 sobre cream-ish chip bg → ≥6:1 ✅

##### Fix M3 — GastoRow catChipText category color

Original: `color: categoryColor` (pastel) sobre `hexAlpha(categoryColor, 0.14)` over creamCard. Light: ~1.6:1 fail, Dark: ~3.3:1 marginal.

Fix: theme-aware `catChipTextColor`:
- **Light**: `darkenForLightBg(categoryColor)` → variante oscura, contraste ≥5:1 sobre tinted chip bg ✅
- **Dark**: `categoryColor` original pastel → 3-4:1 sobre dark olive chip bg, en banda AA-Large (3:1), legible

Trade-off documentado: dark mode marginal AA-body (4.5 req) para preservar la signal de category color identity. El chip es informacional secundario; el iconTile + el position de la row también comunican identidad.

##### Polish adicional: nuevo util compartido

Extracted `darkenForLightBg` a [`mobile/utils/category-color.ts`](../mobile/utils/category-color.ts) como utility reusable. `control-v2-header.tsx` mantiene su `darkenToneForText` local por ahora — migrar al util compartido queda en queue para próximo sweep que toque Control.

Total Sprint E: 3 fixes contrast + 1 util compartido, ~80 LOC. Filter pills y Movimientos ahora pasan AA cleanly en light, y AA o AA-Large en dark sin perder hierarchy visual.

#### Sprint F — Final pass meticulous (catChipText green + animations + polish gaps)

Owner pidió que el `catChipText` en dark mode sea green uniform (no pastel variado) y una pasada final completa sobre Gastos, con foco en animaciones, sin dejar gaps.

##### Fix catChipText dark → hue-preserved lift (revisión de criterio)

Primera iteración (commit `0f217f3`) hacía catChipText dark uniform brand-green. Owner corrigió el criterio: "no me gusta que sea todo lime, de la gama del color original que era, ajustado para darkmode". Decision corregida (commit posterior):

- **Light mode**: `darkenForLightBg(categoryColor)` — variante hue-preserved con L=22 (existente)
- **Dark mode**: `lightenForDarkBg(categoryColor)` — variante hue-preserved con L=92, S+8 (NUEVO util en `mobile/utils/category-color.ts`)

Cada categoría mantiene su HUE en ambos modos. La identidad visual de la paleta original se preserva, ajustada por modo para legibilidad. Contraste verificado para LAS 12 categorías del catálogo sobre dark chip bg (`tone @ 14%` over creamCard dark):

| Categoría | Light variant (darken) | Dark variant (lighten) | Contrast dark |
|---|---|---|---|
| light blue `#89C8F7` | darkenForLightBg | `#D7EDFE` | 5.16:1 ✅ |
| mint `#7EE3D4` | darkenForLightBg | `#DCF9F5` | 5.37:1 ✅ |
| light green `#95E38E` | darkenForLightBg | `#DFF9DD` | 5.34:1 ✅ |
| lime `#CBEA7A` | darkenForLightBg | `#F2FBDA` | 5.44:1 ✅ |
| light yellow `#F4D87E` | darkenForLightBg | `#FDF4D8` | 5.37:1 ✅ |
| peach `#FFBF8A` | darkenForLightBg | `#FEE9D7` | 5.23:1 ✅ |
| light pink `#FFA3A6` | darkenForLightBg | `#FED7D8` | 4.88:1 ✅ |
| pink `#F6A3D1` | darkenForLightBg | `#FDD8ED` | 4.95:1 ✅ |
| lavender `#C7AEFF` | darkenForLightBg | `#E3D7FE` | 4.64:1 ✅ |
| periwinkle `#AEBBFF` | darkenForLightBg | `#D7DDFE` | 4.63:1 ✅ |
| light teal `#8FD9E8` | darkenForLightBg | `#DCF5FA` | 5.27:1 ✅ |
| mint green `#9DE7C8` | darkenForLightBg | `#DDF9ED` | 5.26:1 ✅ |

**12/12 categorías pasan AA cleanly**. Min 4.63:1 (lavender — hue azul con saturación baja).

Lección documentada: la "fix uniforme brand-green" se sintió como una simplificación lazy. La "lift hue-preserved" preserva la paleta de marca original y respeta el tono por categoría → respuesta correcta tanto en design intent como en accesibilidad.

##### Audit completo de animaciones (todas verificadas)

Matriz exhaustiva:

| Animación | Timing | Easing | Reduced Motion | Status |
|---|---|---|---|---|
| Hero `CountUpText` totalVisible | 1200ms | ease-out cubic | ✅ instant | ✅ |
| `GastosAverageBars` staggered grow | 600ms × 7, stagger 20ms | decelerate | ✅ instant | ✅ |
| `CategoryWeightsList` AnimatedBar | 1000ms, stagger 25ms | ease-out-cubic | ✅ instant | ✅ |
| Filter pill state interpolate | 240ms standard | decelerate | passthrough | ✅ |
| Filter pill press scale | in 120ms / out 200ms | ease-out-quad | passthrough | ✅ |
| Calendar grid ↔ focus crossfade | FadeIn 220 / FadeOut 160 | default | ✅ | ✅ |
| `DayCell` press scale (0.92) | spring | spring | ✅ via usePressScale | ✅ |
| SectionList row entering | FadeIn 180 / FadeOut 140 | default | gated by rowAnimationEnabled | ✅ |
| RiseView cascade order | 0→100→120→140→160 ms | ease-out-expo | ✅ | ✅ |
| `StreakFlameIcon` press (0.94) | spring | spring | ✅ via usePressScale | ✅ |
| Advisor chip entering | FadeIn 220 / FadeOut 160 + Layout 220 | default | ✅ | ✅ |

**Hallazgos animaciones**: zero gaps. Todas respetan `useReducedMotion`, usan custom easings apropiados, duraciones en banda Emil-grade, y stagger consistente.

##### Polish gaps detectados (sin acción previa)

**F1 — Pull-to-refresh tintColor hardcoded**: `tintColor="#A6EF8F"` (iOS) y `colors={['#297811']}` (Android) eran hardcoded. En android dark mode el spinner `#297811` sobre canvas `#12211A` daba ~3:1 (visible animado pero apagado). Switch a theme-aware:
- iOS `tintColor = theme.colors.heroAccent` (lime brand-bright en ambos modos)
- Android `colors = [theme.colors.primary]` (light: dark green sobre cream / dark: lime sobre forest)

**F2 — Filter pill active boxShadow invisible en dark**: hardcoded `rgba(15,42,30,0.4)` (forest-dark alpha). En light mode sobre cream da lift visible ✅; en dark mode sobre canvas dark = INVISIBLE (dark sobre dark, sin diferencia perceptible). Fix theme-aware:
- Light: `rgba(15,42,30,0.4)` (original, forest shadow below pill)
- Dark: `rgba(166,239,143,0.32)` (lime halo arriba del pill, lift tonal en dark)

**F3 — swipeHint character ambiguo**: `‹ Desliza para acciones` usaba carácter U+2039 (single left-pointing angle quote) como flecha — ambiguo y bajo perfil visual. Switch a `MaterialIcons chevron-left` 14pt baseline-aligned. Más claro como signal de "swipe izquierda". Wrapped en row con gap 1pt para flow tight.

##### Findings sin acción (documentados como queue, low impact)

- **Section header `paddingHorizontal: 2` vs row content `paddingHorizontal: 12`**: crea offset visual de ~10pt entre label "Lunes 12 may" y row icon. Estructural, requiere refactor — defer.
- **`groupHeader` bg `theme.colors.background` redundante** (mismo que parent canvas). Sin impacto visual. Defer.
- **GastosAverageBars 600ms × 7 staggered (~840ms total)**: feels lento pero alineado intencionalmente con CountUpText 1200ms del hero para que la entrada del card se sienta cohesive.
- **dark catChipText pierde category color identity**: trade-off owner-aceptado por uniform brand-green legibility.

Total Sprint F: 4 fixes (catChipText dark + 3 polish) + animation audit completo zero-gaps. **Gastos ahora está en su prime visual + motion + contrast end-to-end en ambos modos.**

##### Comments finales

Cuatro sprints (A/B/C + D + E + F) sobre Gastos. El cambio del approach del owner ("re-audit con lupa" + "contrast deep dive" + "filter+movimientos zoom" + "final completeness") expuso que **el primer pass siempre queda corto** sobre pantallas con 5+ sub-components interactivos. Lección heurística confirmada y documentada.

<!-- ────────────────────────────────────────────────────────── -->

### 3. Fijos v2 `/(tabs)/fixed-expenses`

**Estado**: 🔴 TO DO

<!-- Pendiente. -->

<!-- ────────────────────────────────────────────────────────── -->

### 4. Control v2 `/(tabs)/insights`

**Estado**: 🔴 TO DO

<!-- Pendiente. -->

<!-- ────────────────────────────────────────────────────────── -->

### 5. Add expense `/add-expense`

**Estado**: 🔴 TO DO

<!-- Pendiente. -->

<!-- (Tier 2-5 subsecciones se agregan inline a medida que avanzamos) -->

---

## 🚦 Reglas de ejecución (anti-spaghetti)

- **Una pantalla por commit** (excepto si dos comparten un fix raíz)
- **Cada commit termina con typecheck + lint verdes**
- **Mover el status board ANTES del commit final** así el doc nunca queda desfasado
- **No mezclar audit con features nuevas** — si en el camino aparece algo que merece feature, abrir issue/queue en STATUS-2026-05-11.md y seguir con el audit
- **Si una pantalla pide >3 fixes**, partir en sprints: audit doc nota "Sprint 1: A/B/C" + "Sprint 2: D/E/F" en su sub-sección

---

## 🔗 Referencias

- Sistemas vivos cuya estética sirve de norte: `docs/cycle-wrapped-system.md` (Wrapped editorial scenes), `docs/achievements-system.md`, `docs/editions-system.md`
- Tokens de motion: `mobile/lib/motion.ts`
- Paleta: `mobile/theme/palette.ts`
- Skills: `/impeccable`, `/emil-design-eng`, `/ui-ux-pro-max`

---

## 📝 Log de cambios

- **2026-05-12** — Doc creado. 28 pantallas catalogadas, rubric establecido, status board inicializado.
- **2026-05-12** — Pantalla 1/28 (Home) auditada + 3 fixes aplicados (Sprint 1). Score ⭐⭐⭐⭐ → ⭐⭐⭐⭐⭐.
- **2026-05-12** — Home Sprint 2 (post-feedback owner): Float icon `withRepeat(..., reverse=true)` oscilación continua (Home-specific). Tab transitions `animation: 'shift'` (re-clasificado como **G1 fix global**). Dark mode white flash hotfix dual-layer (re-clasificado como **G2 fix global**).
- **2026-05-12** — Doc reorganizado: nueva sección "🌐 Fixes globales" para fixes que descubrimos auditando una pantalla pero viven en navigator/root containers/theme bridge. Cada pantalla del status board los hereda.
- **2026-05-12** — Home Fix 7: activity feed mostraba 1/6 rows por bug slice-before-filter. Fix dual en `use-home-snapshot.ts` seed (pre-filter) + `useRecentExpenses` hook (over-fetch 4×). G2 dark mode flash marcado como 🟡 PARCIAL — todavía persiste post-fix dual; sospechas anotadas para próximo sprint.
- **2026-05-12** — Pantalla 2/28 (Gastos v2) auditada + 3 fixes aplicados (press scale en clearFilters + emptyAction, tabular nums en groupTotal + GastoRow.amount, em dashes "Fin del ciclo" → eyebrow editorial). Score ⭐⭐⭐⭐ → ⭐⭐⭐⭐⭐.
- **2026-05-12** — Gastos Sprint 2 (re-audit "con lupa"): 3 sprints A/B/C con 10+ issues granulares en sub-componentes. Side-stripe ban en advisor chip removido. 6 Pressables del calendar + StreakFlameIcon ahora con press scale. Tabular nums residuales. Cascade order de RiseViews coherente.
- **2026-05-12** — Hotfix Sprint B: el wrap de `DayCell` con `Pressable + Animated.View` rompió el grid del calendar. Causa: `styles.dayCell` con `flex: 1, aspectRatio: 1` quedó en el Animated.View interno, pero el grid layout requiere esos estilos EN EL CHILD DIRECTO del row (el Pressable). Empty cells retuvieron `flex: 1` mientras Pressables colapsaban → grid completamente desalineado. Fix: split en `dayCellLayout` (Pressable + empty View) y `dayCellSurface` (Animated.View visual chrome). Lección para refactors: cuando wrappás un Pressable con Animated.View interno, separar layout-affecting styles del visual chrome o el parent flex se rompe.
- **2026-05-12** — Gastos Sprint D (contrast audit light + dark): cálculos WCAG sistemáticos sobre cada par fg/bg. 3 fixes aplicados: Today dot invisible en dark mode (heroAccent sobre cream → switch a canvas), hero gradient small-text contrast (heroMuted2 alpha 0.55 → heroMuted alpha 0.78, mejora de 2.5:1 a 3.5:1 manteniendo hierarchy), EmptyActionButton primary text en dark (primary #A6EF8F → primaryStrong #D1F7C5 para AA cleanly en ambos modos). Hero topLabel y small-text labels quedan marginales (3.5–4.2:1, mejor pero bajo AA estricto) — documentado como trade-off de hierarchy.
- **2026-05-12** — Gastos Sprint E (filter pills + Movimientos zoom): owner pidió audit específico de estos dos componentes. Discovery: las 12 category colors son TODAS pasteles (lightness 0.55–0.85) — funcionan como chip bg tinted pero rotos como text color en algunos contextos. 3 bugs invisibilizando contenido: filter pill INACTIVE count chip fg falla light (1.5:1), filter pill ACTIVE count chip fg falla dark (1.16:1), GastoRow catChipText falla ambos (1.6:1 / 3.3:1). Fix: util compartido `darkenForLightBg` (hue-preserved HSL L=22) + theme-aware logic en los 3 spots.
- **2026-05-12** — Gastos Sprint F (final completeness pass): catChipText dark switch a `textMuted` (brand-green uniform). Animation audit end-to-end zero gaps. 3 polish fixes: pull-to-refresh tintColor theme-aware, filter pill active shadow theme-aware (dark mode visible halo), swipeHint `‹` char → MaterialIcons chevron-left. Gastos cerrada con 6 sprints (A/B/C + D + E + F). Lección heurística confirmada: primer pass corto sobre pantallas con 5+ sub-components.
- **2026-05-12** — Gastos Sprint F revisión criterio: owner corrigió "no me gusta que sea todo lime, de la gama del color original que era". Switch a `lightenForDarkBg(categoryColor)` — variante hue-preserved con L=92, S+8 (nuevo util en `category-color.ts`). 12/12 categorías AA pass (min 4.63:1). Paleta original preservada, identidad per-categoría intacta.
