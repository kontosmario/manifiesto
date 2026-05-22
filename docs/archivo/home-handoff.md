# Home — UX/UI handoff

> **Audiencia**: equipo de UI/UX. Este documento describe **todo** lo que la
> pantalla Home hace, muestra y consume hoy. Incluye la estructura visual,
> los datos, las acciones, los estados condicionales, el código tal cual
> está implementado, y la cuenta de testing para QA manual.
>
> **Stack**: React Native 0.81.5 + Expo SDK 53 + TypeScript + Supabase.
> Los componentes son funcionales, memoizados (`React.memo`) y tipan
> estrictamente sus props. Animaciones con `react-native-reanimated 4.1`.
> Toasts/haptics nativos via `expo-haptics`.
>
> **Estado**: post-auditoría 2026-04-29 (Sprints 1+4 retirados, 2A/2B
> absorbidos en `MonthSummaryCard`, Sprint 3 integrado al hero card,
> chip "Apartando ahorro" agregado).

---

## 1. Propósito y mental model

El Home responde **cuatro preguntas** del usuario en orden de prioridad:

1. **"¿Cuánta plata tengo disponible hoy?"** — `HomeHeroCard` (número grande).
2. **"¿En qué estoy gastando este ciclo?"** — `MonthSummaryCard` paneles Variables/Fijos + sub-rows.
3. **"¿Estoy ahorrando lo que me propuse?"** — chip `Apartando ahorro` en hero + `MetaCard` (objetivo nombrado).
4. **"¿Qué pasó hace poco?"** — `HomeActivitySection` (últimos 6 gastos variables).

Todo lo demás (notificaciones, asistente, payday, miembros del hogar) es
chrome auxiliar. El Home **no** es un dashboard analítico — es una
fotografía del momento financiero: si hay que hacer algo, se sube como
chip de urgencia (peach); si no, el surface se mantiene calmo (mint /
cream).

### Persona-aware copy

El ciclo financiero del usuario sigue su día de cobro (`salary_payment_day`,
1–31). No es siempre del 1 al fin del mes calendario. Toda la copy del
Home dice "ciclo" para reflejar eso. La barra/chip "día N de M" usa los
días reales del ciclo, no los del mes.

---

## 2. Pantalla completa: orden vertical + slot map

```
┌────────────────────────────────────────────────────────┐
│ S1  HomeHeader     (Hola, Mario · 🤖 · 🔔 · ⚙)         │
├────────────────────────────────────────────────────────┤
│ S2  FamilyStrip    (avatares 👥👥 · "Miembros · 2"      │
│                     · PaydayPillV2 "En 3 días")         │
├────────────────────────────────────────────────────────┤
│ S3  HomeHeroCard   ╭────────────────────────────────╮  │
│                    │ • DISPONIBLE     día 12 de 30  │  │
│                    │                                │  │
│                    │ $1.245.000                     │  │
│                    │                                │  │
│                    │ [• Ajustado para este ciclo]   │  │ ← opcional
│                    │ [💰 Apartando $500K · 20%   ]  │  │ ← opcional
│                    │                                │  │
│                    │ ┌─────────┐ ┌──────────────┐   │  │
│                    │ │ /día    │ │ Cerrarás con │   │  │
│                    │ │ $41,500 │ │ +$245K       │   │  │
│                    │ │ ...     │ │ ↗ +12% prev  │   │  │
│                    │ └─────────┘ └──────────────┘   │  │
│                    ╰────────────────────────────────╯  │
├────────────────────────────────────────────────────────┤
│ S4  (vacío — antes Sprint 1 cycle progress, retirado)  │
├────────────────────────────────────────────────────────┤
│ S5  MonthSummaryCard  ┌─────────┐  ┌─────────┐         │
│                       │ 🧾 VAR  │  │ 🔄 FIJOS│         │
│                       │ $245K   │  │ $892K   │         │
│                       │ 32 mov. │  │ 0 de 5  │         │
│                       │─────────│  │─────────│         │
│                       │ 🔥 Mer  │  │ 🗓 Spotif│         │
│                       │ 32% ·.. │  │ Mañana ·│         │
│                       └─────────┘  └─────────┘         │
├────────────────────────────────────────────────────────┤
│ S6  MetaCard / MetaEmptyCard                            │
│     ╭─────────────────────────────────────────╮         │
│     │ • TU META · VACACIONES 2027  [27%]      │         │
│     │ $320.000              ✈                  │         │
│     │ Objetivo · $1.2M                         │         │
│     │ ████████░░░░░░░░░░░░░ 27%                │         │
│     │ Faltan $880K        [+ Agregar ahorro]   │         │
│     ╰─────────────────────────────────────────╯         │
├────────────────────────────────────────────────────────┤
│     ACTIVIDAD                       Ver todos →         │
├────────────────────────────────────────────────────────┤
│ S7  HomeActivitySection (rows con swipe-to-delete)      │
│     🛒 Compra del super · Mario · Mercado     -$8.5K   │
│     ☕ Café · Mario · Restaurantes              -$3.2K   │
│     🚌 Subte · Mario · Transporte               -$1.8K   │
│     ...                                                  │
├────────────────────────────────────────────────────────┤
│ S8  (reservado)                                         │
└────────────────────────────────────────────────────────┘
                                                          
            [HomeDashboardSheets — sheet modal]
            (cycle balance prompt, lazy-mounted)
```

### Slot map (referencia para telemetría)

| Slot | Posición | Contenido actual | Telemetría `slot=` |
|------|----------|------------------|--------------------|
| **S1** | Top header | `HomeHeader` (greeting + asistente + bell + ajustes) | S1 |
| **S2** | Sub-header | `FamilyStrip` (avatares + payday pill) | S2 |
| **S3** | Hero | `HomeHeroCard` (Disponible + tiles + chips read-only) | S3 |
| **S4** | Post-hero band | *(vacío — Sprint 1 retirado)* | S4 (reservado) |
| **S5** | Month summary | `MonthSummaryCard` (Variables + Fijos paneles con sub-rows) | S5 |
| **S6** | Meta | `MetaCard` o `MetaEmptyCard` | S6 |
| **S7** | Actividad | `HomeActivitySection` | S7 |
| **S8** | Bottom | *(reservado)* | S8 |

---

## 3. Capa de datos

### 3.1. Tablas de Supabase consumidas

| Tabla | Para qué se usa | Hooks que la consumen |
|-------|-----------------|-----------------------|
| `auth.users` | sesión + uid | `useMyProfile` |
| `profiles` | display_name + avatar_animal | `useMyProfile`, `useFamilyMembers` |
| `families` | family_id | `useFamilyMembers` |
| `family_members` | composición del hogar (avatares) | `useFamilyMembers` |
| `family_finance` | ingreso, ahorro, salary_payment_day, cycle anchor | `useFamilyFinance` |
| `categories` | nombres + colores para el feed de actividad | `useCategories` |
| `expenses` | gastos variables (commitment_id is null) y de fijos | `useExpenses`, `useRecentExpenses` |
| `fixed_expenses` | compromisos recurrentes (alquiler, prepaga, etc.) | `useFixedExpenses` |
| `fixed_expense_payments` | historial de pagos de fijos | `useFixedExpensePayments` |
| `savings_goals` | objetivos nombrados ("Vacaciones 2027") | `useSavingsGoal` |
| `notifications` | badge del header (rojo si hay no leídas) | `useHasUnreadNotifications` |

### 3.2. RPCs que el Home llama

| RPC | Cuándo | Qué hace |
|-----|--------|----------|
| `home_snapshot()` | Al abrir la pantalla (vía `useHomeSnapshot`) | Devuelve un blob agregado del estado del Home (members, finance, expenses recientes, fijos, goals) en una sola llamada. Pre-calienta los caches de React Query. |
| `log_home_event(...)` | Cada interacción tracked | Inserta en `home_telemetry` (SECURITY DEFINER, valida family membership). Fire-and-forget. |
| `upsert_family_finance(...)` | `confirmCycleStartingBalance` | Guarda el cycle anchor + override de starting balance. |
| `delete_expense(...)` | Swipe-to-delete en activity row | Borra el gasto + invalida caches relacionados. |
| `add_savings_contribution(...)` | Sheet "Agregar ahorro" | Suma un aporte al `savings_goals.current_amount`. |

### 3.3. Hooks principales

```ts
// Composición del Home — orquesta todos los datos.
const dashboard         = useFamilyDashboard(familyId)         // family_finance + fixed_expenses + expenses (full)
const homeMetrics       = useHomeMetrics(familyId)             // Hero + monthSummary + alerts + goal computed
const recentExpenses    = useRecentExpenses(familyId, 6)       // 6 más recientes para activity feed
const categoriesQuery   = useCategories(familyId)              // categorías (para nombres en el feed)
const membersQuery      = useFamilyMembers(familyId)           // familia (avatares)
const savingsGoalQuery  = useSavingsGoal(familyId)             // savings_goals row activo
const profile           = useMyProfile(userId)                 // display_name del usuario actual
const hasUnread         = useHasUnreadNotifications(familyId, userId)  // badge rojo del bell
const controlData       = useControlV2Data(familyId)           // signals del asistente para badge
const telemetry         = useHomeTelemetry(familyId)           // session + lifecycle events
useHomeRealtime(familyId)                                      // suscripción a 4 tablas (expenses, fixed_expenses, savings_goals, notifications)
```

### 3.4. Forma del `HomeHeroMetrics` (lo que pinta el hero)

```ts
interface HomeHeroMetrics {
  availableToday: number          // número grande
  cycleDay: number                // 1..30/31
  cycleTotalDays: number          // días del ciclo (no del mes)
  cycleMonth: string              // "abril 2026"
  dailyBudget: number             // tile izquierdo
  projectedClose: number          // tile derecho (puede ser negativo)
  cycleAdjusted: boolean          // chip "Ajustado para este ciclo"
  paydayPending: boolean          // chip warning peach
  paydayDaysOverdue: number
  projectionReliable: boolean     // false en días 1-3 del ciclo
  incomeConfigured: boolean       // false → setup CTA
}
```

### 3.5. Forma del `HomeMonthSummary`

```ts
interface HomeMonthSummary {
  variableTotal: number
  variableCount: number
  variableTrend: number | null    // -0.12 = -12% vs mes anterior
  fixedTotal: number
  fixedPaid: number
  fixedCount: number
}
```

---

## 4. Componente por componente

### 4.1. `HomeScreen` (orquestador)

**Responsabilidad**: pull-to-refresh, scroll-to-bottom telemetry, mounting
sheets, error boundary, layout vertical. Pasa todo a `HomeDashboard`.

**Path**: [`mobile/screens/home/home-screen.tsx`](../../mobile/screens/home/home-screen.tsx)

**Lo que hace**:
- Suscribe a `useHomeRealtime` para que cambios de otros miembros del
  hogar entren al Home sin pull-to-refresh.
- Inicia sesión de telemetría (`useHomeTelemetry`) — emite `home.opened`
  al montar, `home.closed` al desmontar, `home.left_without_tap` cuando
  no hay taps en la sesión.
- Detecta scroll-to-bottom (40pt buffer) → emite `home.scrolled_to_bottom`.
- `RefreshControl` nativo dispara `home.refreshed` + `snapshot.refetch()`.
- Si `dashboard.dashboardError` y no hay datos cacheados → `<ErrorState />`.

**Render**:
```tsx
<Screen
  contentContainerStyle={{ paddingTop: 14 }}
  onScroll={handleScroll}
  scrollEventThrottle={250}
  refreshControl={<RefreshControl refreshing onRefresh tintColor colors />}
>
  {!theme.isDark && <AmbientBackdrop variant="home" />}
  {error ? <ErrorState ... /> : <HomeDashboard ... />}
</Screen>
```

### 4.2. `HomeDashboard` (composición)

**Path**: [`mobile/components/home/home-dashboard.tsx`](../../mobile/components/home/home-dashboard.tsx)

**Responsabilidad**: composición de los 7 bloques visibles + el sheet de
cycle balance + memos para los chips dinámicos (`topCategory`,
`nextFixed`, `savingsChip`).

**Render** (extracto del JSX final):
```tsx
return (
  <View style={styles.stack}>
    <AmbientBlobs />
    <HomeHeader name={displayName} ... />
    <FamilyStrip members={membersQuery.data ?? []} daysUntilPayday={days} ... />
    <HomeHeroCard
      data={homeMetrics.hero}
      onPressConfigureIncome={handlePressConfigureIncome}
      projectedCloseTrend={projectedCloseTrend}
      savingsChip={savingsChip}
    />
    <MonthSummaryCard
      data={homeMetrics.monthSummary}
      onPressVariable={handleViewGastos}
      onPressFixed={handleViewFijos}
      topCategory={topCategory}
      onPressTopCategory={handleTopCategoryPress}
      nextFixed={nextFixed}
      onPressNextFixed={handleNextFixedPress}
    />
    {savingsGoalQuery.data ? (
      <MetaCard goal={savingsGoalQuery.data} enableQuickAdd suggestedAmount={cycleVault} />
    ) : (
      <MetaEmptyCard />
    )}
    <View style={styles.activityHeader}>
      <Text>ACTIVIDAD</Text>
      {recentExpenses.length > 0 && <Pressable onPress={handleViewGastos}>Ver todos</Pressable>}
    </View>
    <HomeActivitySection
      expenses={recentExpenses}
      categoryNameById={categoryNameById}
      familyMembers={membersQuery.data ?? []}
      isLoading={isLoadingActivity}
      errorKind={activityErrorKind}
      onDelete={handleDeleteExpenseTracked}
      onRetry={handleActivityRetry}
      onAddFirst={handleAddExpense}
    />
    <View style={styles.bottomSpacer} />
    <HomeDashboardSheets isOpen={isCycleBalanceSheetOpen} ... />
  </View>
)
```

### 4.3. `AmbientBlobs` — fondo decorativo

**Path**: [`mobile/components/home/ambient-blobs.tsx`](../../mobile/components/home/ambient-blobs.tsx)

Capa decorativa de blur radial detrás de los componentes. Solo en light
mode. Da textura sin agregar ruido informativo.

### 4.4. `HomeHeader` — Slot S1

**Path**: [`mobile/components/home/home-header.tsx`](../../mobile/components/home/home-header.tsx)

```
┌───────────────────────────────────────────────────────┐
│ Hola, Mario              🤖   🔔   ⚙                  │
│ Está soleado                  •                       │
└───────────────────────────────────────────────────────┘
```

| Sub-elemento | Rol | Tap → |
|--------------|-----|-------|
| `GreetingHeader` | "Hola, {name}" + saludo contextual por hora | — |
| `HomeAssistantButton` | Bot icon + badge con count de signals pendientes | `/asistente` |
| `HomeCircleButton` (bell) | Notificaciones — punto peach si hay no leídas | `/notifications` |
| `HomeCircleButton` (sliders) | Settings | `/settings` |

**Iconos**: SVG inline (no MaterialIcons). Bell con stroke 1.8, sliders
con 3 perillas. Tamaño 18×18 dentro de un círculo de 44×44 (touch target).

**Telemetría**:
- `header_assistant` tap → `home.element_tapped slot=S1 destination_route=/asistente`
- `header_bell` → idem `/notifications`
- `header_settings` → idem `/settings`

### 4.5. `FamilyStrip` — Slot S2

**Path**: [`mobile/components/home/family-strip.tsx`](../../mobile/components/home/family-strip.tsx)

```
┌────────────────────────────────────────────────────┐
│ 👤👤👤  Miembros · 3      [En 3 días • cobro]      │
└────────────────────────────────────────────────────┘
```

**Render**:
```tsx
<View style={styles.row}>
  <View style={styles.avatars}>
    {visible.map((m, i) => (
      <View key={m.id} style={[styles.avatarSlot, i > 0 && { marginLeft: -8 }]}>
        {m.avatarSlug
          ? <AvatarAnimal slug={m.avatarSlug} size={26} ringColor={...} />
          : <Avatar name={m.name} color={m.color} size={26} />}
      </View>
    ))}
    {overflow > 0 && <View style={styles.overflow}><Text>+{overflow}</Text></View>}
  </View>
  <Text>Miembros · <Text style={{fontWeight:'700'}}>{members.length}</Text></Text>
  <View style={{flex:1}} />
  <PaydayPillV2 daysUntilPayday={daysUntilPayday} isPending={paydayPending} onPress={onPaydayPress} />
</View>
```

| Estado | Visual | Acción |
|--------|--------|--------|
| **0 miembros** | Strip vacío (no debería pasar — owner siempre existe) | — |
| **1 miembro** | 1 avatar | — |
| **2-4** | Avatars con overlap -8px | — |
| **5+** | 4 avatars + chip "+N" | — |
| **paydayPending=false** | PaydayPill mint/gris "En N días" | tap → cycle confirm sheet (solo si days===0) |
| **paydayPending=true** | PaydayPill peach con dot animado | tap → abre cycle confirm sheet |

`MAX_AVATARS = 4`.

### 4.6. `HomeHeroCard` — Slot S3

**Path**: [`mobile/components/home/home-hero-card.tsx`](../../mobile/components/home/home-hero-card.tsx)

El componente más complejo del Home. Tiene **dos modos**: setup (sin
ingreso configurado) y normal.

#### Modo normal

```
╭────────────────────────────────────────────╮
│ • DISPONIBLE                día 12 de 30   │  ← labelRow
│                                            │
│ $1.245.000                                 │  ← amount (CountUpText)
│                                            │
│ [• Ajustado para este ciclo]               │  ← chip opcional
│ [💰 Apartando $500K · 20%]                 │  ← chip opcional
│                                            │
│ ┌──────────────┐  ┌─────────────────────┐  │
│ │ Podés gastar │  │ Vas a cerrar con    │  │
│ │ por día      │  │                     │  │
│ │ $41.500      │  │ +$245K  ↗ +12%      │  │
│ │ hasta fin    │  │ vs ciclo anterior   │  │
│ └──────────────┘  └─────────────────────┘  │
╰────────────────────────────────────────────╯
```

**Visual**:
- `LinearGradient` (theme.heroGradient, mint deep → success).
- `HeroAurora` (radial blur decorativo).
- `ShineOverlay` (stripe diagonal animado, periodMs=4200).
- Border 1px con color `rgba(199,238,156,0.12)`.
- Border radius 24, padding 20/18.

**Estados del chip de día (top-right)**:
| `paydayPending` | Texto | Tono | Animación |
|-----------------|-------|------|-----------|
| false | "día 12 de 30" | bg blanco/8, border blanco/12 | — |
| true (overdue 0) | "Cobrá hoy" | peach 18% bg, breathing dot | pulseScale 1↔1.04, 900ms |
| true (overdue 1) | "+1 día sin cobrar" | peach | idem |
| true (overdue N) | "+N días sin cobrar" | peach | idem |

**Chips read-only entre amount y tiles** (apilados en `heroChipStack`):
1. **`Ajustado para este ciclo`**: solo si `data.cycleAdjusted=true`. Tono blanco. Marca que el cupo diario se calcula sobre un balance diferente al sueldo recurrente.
2. **`Apartando ahorro`** (3 estados):
   - `healthy` (mint): "Apartando $500K · 20%"
   - `partial` (mint dim): "Apartando $320K de $500K · 20%"
   - `consumed` (peach): "⚠ Te comiste el ahorro de este ciclo"
   - render gate: `incomeConfigured && savingsGoal > 0`

**Tile izquierdo — `Podés gastar por día`**:
```tsx
<View style={[styles.tile, { backgroundColor: 'rgba(199,238,156,0.10)', borderColor: 'rgba(199,238,156,0.22)' }]}>
  <Text style={[styles.tileLabel, { color: theme.colors.heroAccent }]}>Podés gastar por día</Text>
  <Text style={[styles.tileValue, { color: theme.colors.heroText }]}>{formatMoneyShort(data.dailyBudget)}</Text>
  <Text style={[styles.tileSub, { color: theme.colors.heroMuted2 }]}>hasta fin de ciclo</Text>
</View>
```

**Tile derecho — `Vas a cerrar con` (con forecast trend Sprint 3)**:
```tsx
{data.projectionReliable ? (
  <>
    <Text style={[styles.tileValue, { color: projColor }]}>
      {projPositive ? '+' : ''}{formatMoneyShort(data.projectedClose)}
    </Text>
    {projectedCloseTrend != null ? (
      <View style={styles.tileTrendRow} accessibilityRole="text" accessibilityLabel={...}>
        <MaterialIcons name={projectedCloseTrend > 0 ? 'trending-up' : 'trending-down'} size={11} color={...} />
        <Text>{`${signo}${pct}% vs ciclo anterior`}</Text>
      </View>
    ) : (
      <Text style={[styles.tileSub, { color: theme.colors.heroMuted2 }]}>si seguís este ritmo</Text>
    )}
  </>
) : (
  // Días 1-3 del ciclo: aún aprendiendo el ritmo
  <>
    <Text style={[styles.tileValue, { color: theme.colors.heroMuted }]}>—</Text>
    <Text style={[styles.tileSub, { color: theme.colors.heroMuted2 }]}>en {N} días</Text>
  </>
)}
```

#### Modo setup (`incomeConfigured=false`)

Toda la card colapsa a un CTA único:

```
╭────────────────────────────────────────────╮
│ • EMPEZÁ ACÁ                               │
│ Configurá tu ingreso mensual               │
│                                            │
│ Una vez que cargues tu sueldo y tus fijos, │
│ te decimos cuánto podés gastar por día y   │
│ cómo vas a cerrar el ciclo.                │
│                                            │
│         [Configurar ahora →]                │
╰────────────────────────────────────────────╯
```

Tap en cualquier parte → `onPressConfigureIncome` → `/settings`.

**Telemetría**:
- `hero_setup_cta` tap → `slot=S3 destination_route=/settings` (solo en setup)
- `forecast_summary` shown → solo cuando `projectionReliable && projectedCloseTrend != null`

### 4.7. `MonthSummaryCard` — Slot S5

**Path**: [`mobile/components/home/month-summary-card.tsx`](../../mobile/components/home/month-summary-card.tsx)

Dos cards side-by-side (gap 10). **Surface cream**, no tinted; la
identidad de color vive en dos surfaces dentro de cada card:
1. El **label uppercase** del head (peach para Variables, mint para Fijos).
2. La **banda tinted full-width** del fondo, que hospeda el sub-row
   contextual (top category para Variables, próximo fijo para Fijos).

Cada card tiene **dos zonas de tap independientes** (head + band) que
viven como sibling Pressables sin anidamiento.

```
┌───────────────────────────┐  ┌───────────────────────────┐
│ VARIABLES             →   │  │ FIJOS                 →   │  ← head pressable
│                           │  │                           │
│ $245k                     │  │ $892k                     │
│ 32 movs                   │  │ 0 de 5 pagados            │
│                           │  │                           │
│ [↘ −12% vs prev]          │  │ [5 pendientes]            │  ← pill (cuando no hay chip)
├───────────────────────────┤  ├───────────────────────────┤
│ 🛒  Mercado           →   │  │ 📅 Spotify            →   │  ← band pressable (tinted)
│     32% · $79k            │  │     mañana · $14k         │
└───────────────────────────┘  └───────────────────────────┘
   surface: creamCard            surface: creamCard
   border: hairline tone.border  border: hairline tone.border
   band: mint (informational)    band: peach (imminent ≤1d)
                                       mint (otherwise)
```

#### Lógica de qué render: pill vs chip (banda)

**Variables**:
- Si hay top category → renderiza la **banda mint** abajo con el icono
  Material correspondiente a la categoría (`shopping-cart`, `restaurant`,
  `directions-bus`, etc.) + nombre + `share% · $monto`. La pill del head
  se oculta (no compite con la banda).
- Top category gate: **≥4 transacciones + total > 0**. La barrera de
  closedDays ≥ 14 fue retirada — desde el día 1, una vez que el ciclo
  acumula 4 transacciones la banda surfaces el líder.
- Si no se cumple el gate → la banda renderiza un **fallback** según el motivo
  (ver tabla abajo). La pill de trend del head sigue oculta.

**Fallbacks de la banda Variables** (cuando `computeTopCategory` retorna null, `computeTopCategoryFallback` decide qué mostrar):

| Estado | Trigger | Banda | Tap |
|---|---|---|---|
| `empty` | `variableCount === 0` (ciclo virgen) | `add-circle-outline` + "Cargá tu primer gasto" + "Arrancá el ciclo registrando algo" | **accionable** → `/(tabs)/add` |
| `sparse` | `0 < variableCount < 4` | `auto-awesome` + "Sin categoría líder aún" + "Cargá más gastos para verla" | no-tap |
| `sparse` (defensive) | gate pasa pero helper retornó null igual (e.g., total === 0) | `auto-awesome` + "Sin categoría líder aún" + "Aún no hay datos suficientes" | no-tap |

**Fijos**:
- Si hay `nextFixed` (próximo fijo **dentro del ciclo actual**) → banda al fondo con icono `event` +
  nombre + `formatDaysUntilDue · $monto`. Banda peach si imminent
  (≤1 día), mint en otros casos. Tap → fijos screen focused.
- **Cycle-window filter**: los fijos cuyo `next_due_on` cayó en el próximo ciclo (porque ya se pagó este ciclo y `record_fixed_expense_payment` adelantó la fecha) **no se muestran**. El chip sólo refleja "lo que queda por pagar este ciclo".
- Si `allPaid && fixedCount > 0` → **banda mint no-interactiva**
  con icono `check-circle` + texto "Todos pagados" (single-line, sin
  chevron, sin tap target). Mantiene la simetría con la banda Variables
  cuando ésta tiene un top category — antes esto era un pill en el head
  y dejaba la zona de banda vacía, generando asimetría visual.
- Si `fixedCount > 0`, no hay `nextFixed` y no `allPaid` (caso defensivo
  raro porque el helper ya no aplica horizon) → pill peach "X pendientes"
  en el head.
- Si `fixedCount === 0` → no hay pill ni banda (sub dice "Sin fijos cargados").

#### Tonos por estado de la banda Próximo Fijo

| `daysUntil` | Banda bg | Icon circle | Icon color | Connota |
|-------------|----------|-------------|------------|---------|
| 0 (Vence hoy) | peach 14% | peach 22% | peach `#C25A3E` | urgency strong |
| 1 (Mañana) | peach 14% | peach 22% | peach | urgency strong |
| ≥2 | mint 12% | mint 20% | mint `#2E7D5B` | informativo |

La banda Variables siempre usa mint (el chip es informativo, no urgent).
La banda Fijos sólo flippa a peach cuando el próximo fijo es imminent.

#### Simetría entre las dos cards

Regla: **ambas cards siempre terminan en la misma línea inferior**, sin importar qué combinación de pill/banda tenga cada una.

Implementación:

- **Grid `alignItems: 'stretch'`** — las dos cards se igualan a la altura de la más alta. Es el ancla principal de la simetría.
- **Head Pressable con `flex: 1`** — empuja la banda al fondo cuando existe, y absorbe el espacio extra cuando la sibling es más alta. Si una card tiene banda y la otra no, la sin-banda tiene más padding inferior intencional (no queda banda fantasma; el whitespace lee como respiro).
- **Pill sin placeholder** — el pill renderiza sólo cuando hay copy. No se reserva slot fijo: con la banda casi siempre poblada (top category / fallback / próximo fijo / "Todos pagados"), el pill rara vez aparece, y reservar 30pt vacíos generaba un gap muerto. La simetría queda garantizada por el stretch + flex:1 del head, no por placeholders.

Combinaciones cubiertas:

| Variables | Fijos | Resultado |
|-----------|-------|-----------|
| empty (no pill, no band) | empty | ambas iguales, simétricas naturalmente |
| pill | empty | iguales — pill placeholder reserva slot |
| empty | pill (`✓ Todos pagados`) | iguales — pill placeholder en Variables |
| chip (banda) | chip (banda) | iguales — ambas con banda |
| chip (banda) | pill | iguales — Fijos absorbe la altura extra con `flex: 1` en el head |
| chip (banda) | empty | iguales — Fijos absorbe altura extra con padding inferior |
| chip (banda) | `allPaid` | **iguales — Fijos también renderiza banda mint "✓ Todos pagados" no-interactiva** |

#### Render de un panel (extracto)

```tsx
<View style={[styles.panel, { backgroundColor: tone.bg, borderColor: tone.border }]}>
  <Pressable onPress={onPressHead} accessibilityRole="button" accessibilityLabel={headA11yLabel}>
    <View style={styles.panelHead}>
      <View style={[styles.iconTile, { backgroundColor: tone.iconBg }]}>
        <MaterialIcons name={iconName} size={16} color={tone.fg} />
      </View>
      <View style={styles.panelHeadCenter}>
        <Text style={[styles.label, { color: tone.fg }]}>{label}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
    </View>
    <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
    <Text style={[styles.sub, { color: theme.colors.textMuted }]}>{sub}</Text>
    {pillText && (
      <View style={[styles.pill, { backgroundColor: tone.pillBg }]}>
        <Text style={[styles.pillText, { color: tone.pillFg }]}>{pillText}</Text>
      </View>
    )}
  </Pressable>

  {chip && (
    <>
      <View style={[styles.divider, { backgroundColor: tone.border }]} />
      <Pressable onPress={chip.onPress} accessibilityRole="button" ... >
        <View style={[styles.chipIcon, { backgroundColor: chip.iconBg }]}>
          <MaterialIcons name={chip.iconName} size={12} color={chip.iconColor} />
        </View>
        <View style={styles.chipText}>
          <Text style={[styles.chipPrimary, { color: theme.colors.text }]} numberOfLines={1}>
            {chip.primary}
          </Text>
          <Text style={[styles.chipSecondary, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {chip.secondary}
          </Text>
        </View>
      </Pressable>
    </>
  )}
</View>
```

| Tap | Destino |
|-----|---------|
| Head Variables (icon + label + value + sub + pill) | `/(tabs)/expenses` (lista completa) |
| Sub-row Top Category | `/(tabs)/expenses?categoryId=X` (filtrado) |
| Head Fijos | `/(tabs)/fixed-expenses` |
| Sub-row Próximo Fijo | `/(tabs)/fixed-expenses?focusFixedExpenseId=X` |

**Telemetría**:
- `month_summary_variables` / `month_summary_fixed` (taps en heads)
- `top_category_chip` / `next_fixed_chip` (taps en sub-rows)
- `top_category_chip` / `next_fixed_chip` (shown — emitido al montar si visible)

### 4.8. `MetaCard` / `MetaEmptyCard` — Slot S6

**Path**:
- [`mobile/components/home/meta-card.tsx`](../../mobile/components/home/meta-card.tsx)
- [`mobile/components/home/meta-empty-card.tsx`](../../mobile/components/home/meta-empty-card.tsx)

#### Con goal activo (`MetaCard`)

```
╭──────────────────────────────────────────────╮
│ • TU META · VACACIONES 2027    [27% · ~10m]  │
│                                              │
│ $320.000               ✈                     │
│ Objetivo · $1.2M                             │
│                                              │
│ ████████░░░░░░░░░░░░░░ (gradient mint→peach) │
│                                              │
│ Faltan $880K        [🐷 Agregar ahorro]      │
╰──────────────────────────────────────────────╯
```

| Sub-elemento | Detalle |
|--------------|---------|
| Label | "TU META · {title.toUpperCase()}" con BreatheDot |
| Pct chip | `{pct}% · ~{months} meses` o "¡Completa!" si pct ≥ 100 |
| Amount | CountUpText animado al currentAmount |
| Goal label | "Objetivo · ${goalAmount}" |
| Emoji | FloatView amplitude=4, periodMs=3000 |
| Bar | LinearGradient `#6FE09A → #F2B58A`, animado scaleX con bezier(0.2, 0.9, 0.2, 1) |
| Footer left | "Faltan ${remaining}" o "¡Lo lograste!" |
| Footer right | Pressable "🐷 Agregar ahorro" → abre `QuickAddSavingsSheet` |

**`enableQuickAdd`**: el Home pasa `true` y `suggestedAmount={cycleVault}`
para que el slider del sheet arranque con el monto sugerido del ciclo.

#### Sin goal (`MetaEmptyCard`)

```
╭──────────────────────────────────────────────╮
│ 🐷  Creá tu primera meta                  →  │
│     Definí un objetivo y el asistente te    │
│     muestra cuánto adelantás cada ciclo.    │
╰──────────────────────────────────────────────╯
```

Tap → `/savings-goal` (configuración).

**Telemetría**: `meta_card`, `meta_quick_add`, `meta_empty_card`.

### 4.9. Activity section — Slot S7

**Path**:
- Header inline en `HomeDashboard` (label "ACTIVIDAD" + "Ver todos →")
- [`mobile/components/home/home-activity-section.tsx`](../../mobile/components/home/home-activity-section.tsx)
- Row: [`mobile/components/home/activity-row-v2.tsx`](../../mobile/components/home/activity-row-v2.tsx)

#### Header
```tsx
<View style={styles.activityHeader}>
  <Text style={{ color: theme.colors.textMuted }}>ACTIVIDAD</Text>
  {recentExpenses.length > 0 && (
    <Pressable onPress={handleViewGastos} accessibilityRole="button">
      <Text style={{ color: theme.colors.primaryStrong }}>Ver todos</Text>
    </Pressable>
  )}
</View>
```

#### Body — 4 estados

| Estado | Render |
|--------|--------|
| `isLoading` | `<ListRowSkeleton rows={3} />` |
| `errorKind=network` | `<ErrorState description="Sin conexión" onAction={onRetry} />` |
| `errorKind=server` | `<ErrorState description="Error del servidor" onAction={onRetry} />` |
| `expenses.length === 0` | `<EmptyState icon="receipt-long" stateKey="expensesThisCycle" action={{label:'Registrar primer gasto', onPress: onAddFirst}}/>` |
| Default | hasta 6 `<SwipeableRow>` con `<ActivityRowV2>` |

#### Una row (`ActivityRowV2`)

```
┌──────────────────────────────────────────────┐
│ ┌──┐  Compra del super                       │
│ │🛒│  Mario · Mercado                  -$8.5K│
│ └──┘ ◯ ← whoPaidAvatar overlay              │
└──────────────────────────────────────────────┘
```

- `pickIconForCategory(categoryName)` — emoji por nombre canónico (Mercado=🛒, Restaurantes=🍽️, ...).
- `whoName` viene del `created_by` join contra `family_members`.
- `formatMoneyWithSign(amount)` con signo. Negativo (gasto) → text color, positivo (crédito) → success green.
- Swipe-to-delete: `<SwipeableRow rightActions=[{label:'Eliminar', tone:'danger', icon:'delete', onPress: onDelete}]>`. Hint: "Desliza hacia la izquierda para eliminar."

**Filtro crítico**: el activity feed **excluye** rows con `commitment_id` no
nulo (= pagos auto-creados de fijos). Esos solo aparecen en la pantalla
Fijos. Filtro en `home-screen.tsx:142`:
```ts
const recentExpenses = useMemo(
  () => (recentExpensesQuery.data ?? []).filter((e) => !e.commitment_id),
  [recentExpensesQuery.data],
)
```

**Telemetría**: `activity_view_all`, `activity_row` (delete), `activity_empty_cta`.

### 4.10. `HomeDashboardSheets` — modal lazy-mount

**Path**: [`mobile/components/home/home-dashboard-sheets.tsx`](../../mobile/components/home/home-dashboard-sheets.tsx)

Wrapper para el cycle balance prompt. Lazy-mounted: si el sheet **no**
está abierto, no se monta nada (~357 LOC de gesture/animation setup
ahorrados por render).

#### Dos variantes mutuamente exclusivas

**`OnboardingAvailableSheet`** (one-shot, post-signup):
- Se dispara una sola vez, cuando el usuario nunca resolvió un cycle anchor.
- Flow auto-open: 650ms después del primer mount.
- Pregunta: "¿Cuánto tenés disponible HOY?"
- Permite dejar el monthly_income default.

**`SalaryConfirmationSheet`** (recurring, post-payday):
- Se abre cuando `paydayPending=true` o el usuario tap en payday pill.
- Pregunta: "¿Cuánto cobraste este mes?"
- Permite confirmar con override o "Igual al mes pasado".

Ambos llaman `onConfirmCycleStartingBalance(amount | null)` que persiste
vía `upsert_family_finance` RPC.

---

## 5. Acciones / mapa de navegación

| Acción | Origen | Destino | Trigger |
|--------|--------|---------|---------|
| Ver notificaciones | `header_bell` | `/notifications` | tap |
| Ir a settings | `header_settings` | `/settings` | tap |
| Abrir asistente | `header_assistant` | `/asistente` | tap |
| Confirmar cobro | `payday_pill` | (sheet local) | tap si `paydayPending` |
| Configurar ingreso | `hero_setup_cta` | `/settings` | tap (solo en setup) |
| Ver gastos variables | `month_summary_variables` (head Variables) | `/(tabs)/expenses` | tap |
| Ver gastos fijos | `month_summary_fixed` (head Fijos) | `/(tabs)/fixed-expenses` | tap |
| Filtrar por top category | `top_category_chip` | `/(tabs)/expenses?categoryId=X` | tap |
| Ver próximo fijo | `next_fixed_chip` | `/(tabs)/fixed-expenses?focusFixedExpenseId=X` | tap |
| Agregar aporte ahorro | `meta_quick_add` | (sheet local) | tap |
| Crear primera meta | `meta_empty_card` | `/savings-goal` | tap |
| Ver todo el historial | `activity_view_all` | `/(tabs)/expenses` | tap |
| Eliminar gasto | `activity_row` | (mutation in place) | swipe-left + tap eliminar |
| Crear primer gasto | `activity_empty_cta` | `/(tabs)/add` | tap (solo si lista vacía) |
| Pull-to-refresh | n/a | (refetch) | gesto |

---

## 6. Estados condicionales / gates

| Componente | Render gate | Estado fallback |
|------------|-------------|-----------------|
| `HomeHeroCard` modo setup | `data.incomeConfigured === false` | CTA full-width |
| Chip "Cobrá hoy" | `paydayPending && paydayDaysOverdue <= 0` | — |
| Chip "+N días sin cobrar" | `paydayPending && paydayDaysOverdue >= 1` | — |
| Chip "Ajustado para este ciclo" | `data.cycleAdjusted === true` | — |
| Chip "Apartando ahorro" | `incomeConfigured && savingsGoal > 0` | — |
| Tile derecho con número | `projectionReliable === true` (cycleDay >= 4) | "—" + "en N días" |
| Tile derecho con trend % | `projectionReliable && variableTrend != null` | "si seguís este ritmo" |
| `MonthSummary` Top category chip | `closedDays >= 14 && transactions >= 4` | pill trend% (Variables) |
| `MonthSummary` Próximo fijo chip | hay fijo activo con `next_due_on` futuro | pill "X pendientes" o "✓ Todos pagados" |
| `MonthSummary` pill "✓ Todos pagados" | `fixedCount > 0 && fixedPaid === fixedCount` | gana sobre chip |
| `MetaCard` | `savingsGoalQuery.data` truthy | `MetaEmptyCard` si null |
| `MetaCard` "+ Agregar ahorro" pill | `enableQuickAdd && !isComplete` | — |
| `MetaCard` "¡Lo lograste!" footer | `pct >= 100 && currentAmount > 0` | — |
| Activity "Ver todos" link | `recentExpenses.length > 0` | hidden |
| Activity skeleton | `isLoading === true` | — |
| Activity error | `errorKind` truthy | retry button |
| Activity empty CTA | `expenses.length === 0 && !error && !loading` | — |
| Cycle balance sheet auto-open | `shouldAutoOpenCycleSheet === true` (1ra apertura post-signup) | — |
| Bell red dot | `hasUnreadNotifications === true` | — |
| Asistente badge count | `assistantPendingCount > 0` | — |

---

## 7. Telemetría

### Eventos del lifecycle

| Evento | Cuándo se emite | Contexto |
|--------|-----------------|----------|
| `home.opened` | mount | `session_id` |
| `home.closed` | unmount | `session_id`, `dwell_ms` |
| `home.refreshed` | pull-to-refresh | `session_id` |
| `home.scrolled_to_bottom` | una vez por sesión, al alcanzar el bottom | `session_id` |
| `home.left_without_tap` | unmount sin ningún tap previo | `session_id`, `reason` |
| `home.reopened_in_session` | reapertura dentro de 60s | `session_id`, `gap_ms` |

### Eventos por elemento

| Evento | Cuándo |
|--------|--------|
| `home.element_shown` | `useTrackElement` detecta `isVisible=true` y aún no se emitió en la sesión |
| `home.element_tapped` | tap del usuario en un elemento tracked |
| `home.element_dismissed` | dismiss del usuario (si aplica al elemento) |

### `HomeElementId` enum (kebab-case, type-safe)

```ts
| 'header_bell' | 'header_settings' | 'header_assistant'
| 'payday_pill' | 'family_avatar'
| 'hero_card' | 'hero_setup_cta'
| 'month_summary_variables' | 'month_summary_fixed'
| 'meta_card' | 'meta_quick_add' | 'meta_empty_card'
| 'activity_view_all' | 'activity_row' | 'activity_empty_cta'
| 'trust_receipt_strip'
| 'top_category_chip' | 'next_fixed_chip'
| 'forecast_summary' | 'contextual_banner'
```

Tabla destino: `home_telemetry` con retención 90 días (cron prune diario).

---

## 8. Theming, tipografía, motion

### Color tokens usados

| Token | Light | Dark | Uso |
|-------|-------|------|-----|
| `theme.colors.text` | `#0F2A1E` | `#F0F4EE` | Texto primario |
| `theme.colors.textMuted` | `#6B7567` | `#A0A8A0` | Subtítulos, sub-rows |
| `theme.colors.creamCard` | `#FAF7F0` | `#1F2624` | Surfaces/cards |
| `theme.colors.creamSoft` | `#F4F0E5` | `#252C2A` | Chips neutros |
| `theme.colors.line` | `#E0DBC8` | `#2A312F` | Bordes hairline |
| `theme.colors.success` (mint) | `#2E7D5B` | `#9EE0B2` | Check, savings positivo |
| `theme.colors.peach` | `#E8976A` | `#F2B58A` | Urgencia, gasto, warning |
| `theme.colors.peachBand` | `rgba(232,151,106,0.18)` | `rgba(242,181,138,0.20)` | Chip peach bg |
| `theme.colors.primary` | `#2E7D5B` | `#9EE0B2` | CTAs primarias |
| `theme.colors.primarySurface` | `rgba(28,126,58,0.10)` | `rgba(122,216,163,0.16)` | Surfaces primary |
| `theme.colors.heroGradient` | `[deep, success]` | `[charcoal, success]` | Hero card bg |
| `theme.colors.heroAccent` | `#C7EE9C` | `#C7EE9C` | Hero accent / mint label |
| `theme.colors.heroText` | `#FFFFFF` | `#FFFFFF` | Hero numbers |
| `theme.colors.heroMuted` | `rgba(255,255,255,0.78)` | idem | Hero body text |
| `theme.colors.heroMuted2` | `rgba(255,255,255,0.55)` | idem | Hero captions |

### Type scale

| Rol | Tamaño | Weight | Notas |
|-----|--------|--------|-------|
| Hero amount | 42 | 800 | letterSpacing -1.8, lineHeight 48 |
| MetaCard amount | 24 | 800 | letterSpacing -0.8 |
| MonthSummary value | 22 | 800 | letterSpacing -0.5 |
| Hero tile value | 20 | 800 | letterSpacing -0.5 |
| Setup title | 24 | 800 | letterSpacing -0.6 |
| Activity title | 14 | 700 | numberOfLines=1 |
| Activity sub | 12 | 500 | textMuted |
| Section label "ACTIVIDAD" | 11 | 700 | letterSpacing 1.4, uppercase |
| Panel value sub ("32 movimientos") | 11 | 500 | tabular nums |
| Pill / chip | 10–11 | 700–800 | tabular nums |

`maxFontSizeMultiplier: 1.4` se aplica a chips, captions y activity rows
para no romper layouts cuando el usuario activa Dynamic Type al máximo.
`fontVariant: ['tabular-nums']` en cualquier número que comparte fila
con texto variable.

### Motion (Reanimated 4.1)

| Animación | Componente | Detalle |
|-----------|------------|---------|
| Entrance staggered | `RiseView` | translate Y + fade, 60–300ms delays escalonados |
| Slide-in | `SlideInView` (activity rows) | translate X 60ms × index |
| Count-up | `CountUpText` | 1200ms con bezier, respeta `useReducedMotion` |
| Bar fill | `MetaCard` bar | `withDelay(500, withTiming(scaleX, 1300, ease))` |
| Shine | `ShineOverlay` | stripe diagonal animada cíclica 3400-4200ms |
| Aurora | `HeroAurora` | radial blur estático |
| Pulse | hero day chip pending | scale 1↔1.04 cada 900ms |
| Float | MetaCard emoji | sin translate Y, amplitude 4 |
| Breathe | `BreatheDot` | opacity oscilante 0.6↔1.0 |

Todas respetan `useReducedMotion()`. El hero amount cuenta del último
valor al nuevo en lugar de renderizar instantáneo.

---

## 9. Accesibilidad

| Regla | Implementación |
|-------|----------------|
| Touch target 44×44pt | Todos los `Pressable` cumplen; chevrons + iconos usan `hitSlop` cuando son menores |
| Contrast 4.5:1 | Verificado en light + dark; el chip peach over hero gradient pasa |
| Screen reader unification | Hero card emite un solo `accessibilityLabel` compuesto en lugar de leer cada chip |
| Roles semánticos | `accessibilityRole="button"` en taps, `"text"` en chips read-only, `"summary"` en hero |
| Hints | "Abre los gastos filtrados por esta categoría", "Desliza hacia la izquierda para eliminar", etc. |
| Reduced motion | `useReducedMotion()` chequeado en todos los hooks que lanzan loops |
| Dynamic Type | `maxFontSizeMultiplier: 1.4` en chips/captions; texto principal sin cap |
| Focus order | Coincide con orden visual top-to-bottom |
| Color-not-only | Los chips peach (urgencia) llevan icono `warning-amber` además del color |

### Ejemplo: a11y label compuesto del hero

```ts
const a11yLabel = data.incomeConfigured
  ? `Disponible hoy: ${formatMoney(data.availableToday)}. ${
      data.dailyBudget != null ? `Cupo diario: ${formatMoney(data.dailyBudget)}.` : ''
    } ${
      data.projectionReliable && data.projectedClose != null
        ? `Cierre proyectado: ${formatMoney(data.projectedClose)}.`
        : ''
    } ${savingsChip ? savingsChip.a11y : ''}`.trim()
  : 'Configurá tu ingreso mensual para activar el seguimiento del ciclo.'
```

---

## 10. Realtime (sync entre miembros del hogar)

`useHomeRealtime(familyId)` abre un solo canal Supabase
(`family-home:{familyId}`) con 4 listeners postgres_changes:

| Tabla | Evento | Invalida |
|-------|--------|----------|
| `expenses` | * | `expenseQueryKeys.family`, `expenseQueryKeys.recentFamily` |
| `fixed_expenses` | * | `fixedExpenseQueryKeys.family` |
| `savings_goals` | * | `savingsGoalQueryKey` |
| `notifications` | * | `notificationQueryKeys.family` |

Filtro `family_id=eq.{familyId}` en todos los listeners → no se pushean
eventos cross-family al cliente. Si otro miembro carga un gasto desde
otro device, el Home del usuario actual lo refleja sin pull-to-refresh.

---

## 11. Helpers puros (testables sin RN)

Tres helpers separados de los componentes para hacerlos unit-testables:

### `home-top-category-helpers.ts`
- `computeTopCategory({ expenses, cycleStart, cycleEnd, categoryNameById, minTransactions? })` → ranking + share%. Gate único: `≥4 transacciones` (la barrera de closedDays fue retirada).
- `computeTopCategoryFallback({ topCategory, variableCount, minTransactions? })` → fallback payload (`empty` / `sparse`) cuando `computeTopCategory` retorna null. Mantiene la simetría visual con la banda Fijos.
- `formatTopCategoryShare(share: number)` → `"32%"`.

### `home-next-fixed-helpers.ts`
- `computeNextFixed({ fixedExpenses, now?, horizonDays?, cycleEnd? })` → soonest active fijo. **Sin horizon** por defecto. El Home pasa `cycleEnd: dashboard.payCycle.end` para que **fijos cuyo `next_due_on` cae en un ciclo futuro queden excluidos** — una vez que se paga un fijo este ciclo y `next_due_on` rola hacia el próximo, el chip deja de mostrarlo (esa obligación ya no es del ciclo actual).
- `formatDaysUntilDue(daysUntil)` → `"Vence hoy"` / `"Mañana"` / `"En N días"`.
- Usa `parseFixedExpenseDate` (canonical) para evitar el bug timezone (`new Date('2026-04-13')` parses como UTC).

### `home-hero-savings-helpers.ts`
- `computeSavingsHeroChip({ savingsGoal, savingsRemaining, savingsGoalPercent, incomeConfigured })` → `null` o `{ kind, label, a11y }`.
- 3 estados: `healthy`, `partial`, `consumed`.
- Spanish grammar agreement completa (singular vs plural).

Tests cubren cada helper: 9 + 11 + 10 = 30 tests, todos pure JS.

---

## 12. Cuenta de testing para QA

Migración: `supabase/migrations/20260503000000_seed_home_test_account.sql`. Idempotente.

| Campo | Valor |
|-------|-------|
| Email | `home.test@manifiesto.app` |
| Password | `HomeTest2026` |
| Family code | `HOMETEST` |
| Avatar | `cat` |
| Income | 2.500.000 ARS |
| Savings target | 500.000 ARS (20%) |
| Salary day | 1 (cycle = mes calendario) |

**Datos seedeados**:
- Categorías: las 18 expense + 8 fixed_expense canónicas (las que recibe un usuario nuevo via `bootstrap_family`).
- 5 fijos activos (≈892K mensuales): Spotify (mañana), Tarjeta Visa (+5d), Prepaga (+8d), Internet (+11d), Alquiler (+14d).
- 45 días de gastos variables (~85 transacciones, sesgo Mercado dominante).
- Pagos: 2 ciclos previos completos, ciclo actual sin pagar.
- Savings goal: "Vacaciones 2027" 320K/1.2M.

**Cobertura de cada componente**:

| Componente | Estado verificable |
|------------|-------------------|
| `HomeHeader` | Avatar gato, badges en 0 |
| `FamilyStrip` | 1 miembro (owner) |
| `HomeHeroCard` | $disponible mid-cycle, projection reliable, trend visible |
| Chip `Apartando ahorro` | healthy (mint) — 500K · 20% |
| `MonthSummaryCard` Variables | total + 32 movimientos + sub-row Mercado dominante |
| `MonthSummaryCard` Fijos | total + "5 pendientes" pill + sub-row Spotify mañana peach |
| `MetaCard` | Vacaciones 2027 27% logrado, agregar ahorro funcional |
| `HomeActivitySection` | 6 rows, swipe-to-delete |

---

## 13. Archivos clave (referencia para el equipo)

```
mobile/screens/home/
└── home-screen.tsx                       — orquestador

mobile/components/home/
├── home-dashboard.tsx                    — composición + memos de chips
├── ambient-blobs.tsx                     — fondo decorativo
├── home-header.tsx                       — S1 greeting + iconos
├── greeting-header.tsx                   — sub-elemento del header
├── home-circle-button.tsx                — botón circular reutilizable
├── home-assistant-button.tsx             — bot icon + badge
├── family-strip.tsx                      — S2 avatares + payday pill
├── payday-pill-v2.tsx                    — chip cobro (mint/peach)
├── home-hero-card.tsx                    — S3 hero card (modo normal + setup)
├── home-hero-savings-helpers.ts          — chip "Apartando ahorro" pure helper
├── hero-aurora.tsx                       — radial blur del hero
├── hero-sparkline.tsx                    — sparkline (no usado actualmente)
├── month-summary-card.tsx                — S5 Variables + Fijos paneles
├── home-top-category-helpers.ts          — sub-row Mercado pure helper
├── home-next-fixed-helpers.ts            — sub-row Spotify pure helper
├── meta-card.tsx                         — S6 savings goal con quick-add
├── meta-empty-card.tsx                   — S6 fallback "creá tu primera meta"
├── quick-add-savings-sheet.tsx           — sheet del aporte
├── home-activity-section.tsx             — S7 lista de gastos
├── activity-row-v2.tsx                   — row individual con who-paid avatar
├── who-paid-avatar.tsx                   — círculo overlay por miembro
├── home-dashboard-sheets.tsx             — wrapper del cycle balance sheet
├── cycle-balance-prompt-sheet.tsx        — onboarding + salary confirmation
└── animated/                             — primitivas (RiseView, SlideInView, BreatheDot, ...)

mobile/features/home/
├── home-dashboard-model.ts               — `paydayPending`, `daysUntilPayday`, error classifier
├── home-aggregates.model.ts              — agregados puros del Hero
├── add-expense-model.ts                  — para el flujo de + (no Home)
├── use-home-snapshot.ts                  — RPC home_snapshot (pre-warm)
├── use-home-metrics.ts                   — `HomeHeroMetrics`, `HomeMonthSummary`
├── use-home-realtime.ts                  — channel + invalidations
├── use-home-telemetry.ts                 — sessionId + lifecycle events
├── use-track-element.ts                  — per-element shown/tap tracker
├── log-home-event.ts                     — RPC client wrapper
├── home-telemetry-helpers.ts             — pure session id + reopen detection
├── use-daily-available-sparkline.ts      — sparkline data (no usado)
├── use-month-daily-mood.ts               — heatmap data (no usado)
├── use-monthly-expense-comparison.ts     — % vs ciclo anterior
└── use-no-excess-streak.ts               — streak data (no usado en Home actual)

supabase/migrations/
├── 20260424020000_home_snapshot_rpc.sql                      — RPC base
├── 20260501020000_home_snapshot_cycle_payments.sql           — cycle window patch
├── 20260501030000_home_snapshot_restore_family_members_join.sql — JOIN profiles fix
├── 20260502000000_home_telemetry.sql                         — tabla + RPC + cron prune
├── 20260502010000_home_telemetry_lockdown.sql                — defense-in-depth RLS
└── 20260503000000_seed_home_test_account.sql                 — cuenta de testing

tests/unit/
├── home-top-category-helpers.test.ts     (9)
├── home-next-fixed-helpers.test.ts       (11)
└── home-hero-savings-helpers.test.ts     (10)
```

---

## 14. Histórico de la auditoría reciente

| Sprint | Componente | Estado |
|--------|------------|--------|
| 0 | Telemetría (RPC + hooks + slot map) | ✅ Shipped |
| 1 | Cycle progress bar (S4) | ❌ Retirado — redundante con day chip del hero |
| 2A | Top category chip | ✅ Shipped → absorbido como sub-row de Variables |
| 2B | Próximo fijo chip | ✅ Shipped → absorbido como sub-row de Fijos |
| 3 | Forecast trend (% vs ciclo anterior) | ✅ Shipped → integrado al tile derecho del hero |
| 4 | Fijos coverage micro-text ("ocupan N días") | ❌ Retirado — no accionable |
| Extra | Chip "Apartando ahorro" en hero | ✅ Shipped (3 estados: healthy / partial / consumed) |
| Refactor | Chips standalone → sub-rows del MonthSummary | ✅ Shipped — sin Pressables anidados |

**Resultado**: el Home actual tiene 7 surfaces visibles (S1, S2, S3, S5, S6, S7) + 1 sheet modal. S4 quedó vacío post-cleanup.

---

## 15. Preguntas frecuentes para el equipo de UI/UX

**¿Por qué los paneles Variables y Fijos tienen tap regions distintas?**
La head completa navega al listado completo (lista sin filtrar), la sub-row navega al detalle deep-linked. Patrón Apple Wallet card. Evita Pressables anidados con `alignItems: 'flex-start'` en el contenedor flex.

**¿Por qué el chip "Apartando ahorro" no es interactivo?**
La edición vive en Settings. El chip es signal-only ("acá pasa algo importante este ciclo"). Coherente con el chip "Ajustado para este ciclo".

**¿Cuándo aparece "✓ Todos pagados" vs el chip de próximo fijo?**
"✓ Todos pagados" gana siempre que `fixedPaid === fixedCount`. El chip de próximo se oculta porque el panel ya cumplió su trabajo este ciclo.

**¿Por qué el chevron del head sigue visible cuando hay sub-row?**
Para mantener la consistencia visual con paneles sin sub-row. El chevron señala "tap me", la sub-row tiene la suya propia (visual divider + text + ningún chevron extra).

**¿Por qué el hero proyecta a partir del día 4 y no del día 1?**
Con menos de 4 días el promedio diario salta dramáticamente con cada nuevo gasto. La proyección lineal se vuelve ruido. Día 1-3 muestra "—" + "en N días" para no engañar.

**¿Cuándo se dispara el cycle balance sheet?**
Tres condiciones (cualquiera):
- `paydayPending === true` (pasaron días sin confirmar el cobro)
- `isCycleStartingBalancePromptPending === true` (no se ha resuelto un anchor para este ciclo)
- `days === 0` (hoy es exactamente el día de pago)

**¿Qué pasa si un miembro del hogar borra un gasto desde otro device?**
El listener realtime sobre `expenses` invalida `expenseQueryKeys.recentFamily` → la activity se actualiza sola en el Home del primer usuario, sin pull-to-refresh.

---

> **Versionado**: este documento refleja el estado del Home a 2026-04-29.
> Cualquier cambio en `home-dashboard.tsx`, `home-hero-card.tsx`,
> `month-summary-card.tsx`, `meta-card.tsx`, o el enum `HomeElementId`
> debe actualizar las secciones correspondientes acá.
