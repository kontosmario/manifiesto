# Dominio Home · Control · Gastos Fijos

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/  
> Actualizado parcialmente 2026-05-29 (rama feat/monthly-rollup): card "CÓMO VAS ESTE MES", datos de rollup en adapter, acceso al Wrapped desde Control.  
> Actualizado 2026-05-29 (parte 7 — polish cross-surface): rebuild SwipeRow, chrome unificado ActivityRowV2/GastoRow/FijoRow/NotificationRow, bg theme-aware en ActivityRowV2.  
> Actualizado 2026-05-30 (parte 8 — recurrencia respetada + sheet de confirmación de precio): `computeItemStatus` con 4 estados (paid/pending/overdue/future) cycle-aware; tabs simplificadas a 2 (Pendientes / Pagados+Próximos); badge "En mora" rojo en overdue; nuevo `ConfirmFixedPaymentSheet` para confirmar precio al 2do+ pago; chip diferenciado "Aumento de precio" vs "Incremento con intereses · int." según `paid_in_arrears`. Backend: `record_fixed_expense_payment(uuid, numeric?)` con override + columna `expenses.paid_in_arrears`. Migración `20260530120000` **aplicada a prod 2026-05-30** (junto con backfill de 4 migraciones atrasadas: `20260529120000` `..130000` `..140000` `..150000`, que ya estaban en git pero faltaba el push remoto).  
> Actualizado 2026-05-30 (parte 8b — UX refinements): tabs pasaron de 2 → **3 buckets** (Pendientes / Pagados / Próximos, este último separa los `future` para tener visibilidad del calendario lejano aparte del cerrado del ciclo). En `FijoRow`, el primario "Registrar pago" salió del expand panel y ahora vive **inline en el row collapsed** como botón circular junto al monto (visible siempre que el status es `pending`/`overdue`) — la acción más frecuente está a 1 tap, no 2. Hitslop 8px sobre 36pt visual = 52pt efectivo (HIG ≥44pt). Press scale 0.92 (más pronunciado que la card para reafirmar el tap icon-only). El expand panel ahora solo lleva "Editar" + detalles.  
> Actualizado 2026-05-30 (parte 8c — feature code-complete): **4 tabs** (Vencidos / Pendientes / Pagados / Próximos — separamos vencidos del bucket pendientes para que la mora sea más prominente; color rojo brand-deep). Auto-promoción a "Vencidos" en el primer paint si hay vencidos (respeta selección manual del user). **Label de mes en cada row** ("Cuota de junio · pagada", "Cuota de mayo · en mora 12d", "Próxima · cuota de julio", etc.) — el usuario sabe exactamente a qué cuota corresponde el row, no más ambigüedad. **Revertir pago**: nuevo botón "Revertir pago" en el expand panel de rows `paid` (peach-tinted, undo icon) + snackbar "Pago de X registrado · Deshacer" durante 5s tras un pago exitoso. Backend: nueva RPC `revert_fixed_expense_payment(uuid)` que hace rollback atómico (borra expense + payment + retrocede next_due_on + restaura last_paid_at + ajusta installments/debt). Nueva columna `fixed_expense_payments.expense_id` linkea payment↔expense para que el revert sea atómico (mig `20260530180000` con backfill de rows existentes por timestamp proximity).  
> Actualizado 2026-05-30 (parte 8d — fix UX al CREAR fijo): el form de alta ya no genera "salto de mes" cuando el user marca un fijo recién creado como ya pagado. **Antes**: `buildNextDueOn` siempre devolvía la próxima ocurrencia FUTURA del `day_of_month`, así que cuando el user creaba el fijo y tocaba "Registrar pago" para indicar "ya pagué esta cuota", la RPC avanzaba `next_due_on` UN MES MÁS — skipeando la cuota recién marcada. Bug confirmado en prod con la cuenta `kontosmario@gmail.com` (11 fijos desfasados, fix puntual de datos via UPDATE). **Ahora**: `buildNextDueOn` apunta a la cuota del MES ACTUAL (clampada al último día válido del mes), y un **toggle nuevo en step 2 "Ya pagué la cuota más reciente"** (default OFF, solo creación, no aplica a installments) encadena `recordFixedExpensePayment` tras el create — la RPC inserta el payment row + avanza next_due_on al mes siguiente. Con toggle OFF, el fijo queda con `next_due_on = este mes` → status `pending` (todavía no venció) u `overdue` (ya venció) según el día. `createFixedExpense` + `useCreateFixedExpense` ahora devuelven `{ id }` para que el form pueda encadenar el RPC sin un round-trip extra de query. Migración no requerida — todo cliente.  
> Actualizado 2026-05-30 (parte 8e — expand panel enriquecido del FijoRow): rediseño completo del panel que se abre al tocar un fijo. **Antes**: grid de 4 tiles (Frecuencia / Kind / Próx. vencimiento / Categoría) — info técnica plana, poco accionable para un usuario no-financiero. **Ahora** (3 secciones jerárquicas, copy humano): **(1) Stats hero** "SE LLEVA AL AÑO $3.336.000" (24sp tabular nums) + sub "8% de tu sueldo mensual". Para installments: "TOTAL DE LA DEUDA". Para debt: "DEUDA RESTANTE". **(2) Tendencia** (solo cuando hay ≥2 puntos): sparkline grande + copy con verbo ("Subió 12% desde el último pago" en peach / "Mantiene el precio" muted) + sub con contexto del rango histórico ("+18% en 4 pagos"). **(3) Este pago**: 3 InfoLine (icon + label) — frecuencia + día, vencimiento humanizado ("Vence el 10 de junio (en 5 días)" / "Venció el 10 de junio (hace 3 días)"), categoría. **(4) Historial** (solo si lifetime > 0): "X cuotas registradas" + "Ya pagaste $Y en total". **(5) Acciones**: Editar + Revertir si aplica. Aggregates: 4 campos nuevos en `FijoItem` — `annualCost` (amount × frequency multiplier; installment = costo total; debt = remaining_balance), `pctOfIncome` (normalizado a equivalente mensual), `paymentsLifetime` (lifetime count desde expenses con `commitment_id` — cap implícito 120 del snapshot, para installments usa `installments_paid` que es más confiable), `totalPaidLifetime` (suma de prices). Migración no requerida — todo cliente.  
> Actualizado 2026-05-30 (parte 8f — fix clasificación overdue): `computeItemStatus` ahora compara `next_due_on < today` para overdue (no contra `cycleStart`). **Antes (v2 desde la mañana del 30)**: un fijo con `next_due_on = día 22` y hoy día 30 quedaba como `pending` porque `next_due_on >= cycleStart` (5/20) — pero en la vida real ya había vencido. Salía en tab "Pendientes" cuando debía estar en "Vencidos". **Ahora**: paid > overdue (`next_due_on < today`) > future (`next_due_on >= cycleEnd`) > pending (resto). Cubre mora arrastrada Y cuotas del ciclo activo ya vencidas. `cycleStart` ya no se usa en el check — eliminado del input.  
> Actualizado 2026-05-30 (parte 8g — botón Pagar inline visual distintivo): el botón inline al lado del monto pasó de un check genérico negro a un botón brand-coded con ícono $ (`attach-money`). **Pending**: bg forest-deep (`#297811`) + ícono blanco + inner highlight 1px alpha blanco arriba (lift sutil) + borde 1.5pt tono más oscuro. **Overdue**: bg red brand (`#A8211B`) + mismo treatment + **halo pulse continuo** (1.5s ease-in-out, scale 1→1.45, opacity 0.45→0, infinite, ReduceMotion-aware) que "respira pidiendo atención" sin invadir. Tamaño 40pt visual + hitSlop 8 = ~56pt efectivo. Press scale 0.88 (más pronunciado que la card 0.98 para reafirmar el tap icon-only). Extraído a un componente standalone `InlinePayButton` para encapsular la lógica de pulse + reducir noise del FijoRow.
> Actualizado 2026-05-31 (partes 8h₁-8h₅ — refinamientos visuales del FijoRow): row reestructurado en **2 lanes** (top: name + amount + pay-btn / bottom-strip: month chip + status badge) — entra todo sin elipsis. **Mes como chip pill** ("Mayo"/"Junio") con bg+border tintados por status accent. **Status badge inline** con icon + texto bold corto: overdue "Vencida 11d" (warning), pending "En 5d"/"Hoy" (schedule), paid "Pagada" (check-circle), future "Próxima" (event) — todo single-line dentro del pill. **Expand panel con status accent**: border-top dashed + bg del statsHero + accent stripe vertical tintados por status (overdue rojo, pending peach, paid lime, future sky). **Botón Pagar refinado**: removido el inner highlight blanco tras feedback "se ve plástico", quedó flat con borde más oscuro.
> Actualizado 2026-05-31 (parte 8i — pulse focalizado + pull-to-refresh): el pulse del `urgencyRing` que envolvía toda la card del `FijosHeroCard` MOVIDO al **badge "X VENCIDOS"** del header (era invasivo cuando latía toda la card). Bg alpha 0.18→0.36, border 0.50→0.85, scale 1→1.04, 2.4s warm, ReduceMotion-aware. **Pull-to-refresh** agregado a `FijosV2Screen` y `ControlV2Screen` — `RefreshControl` con tint brand que dispara `useHomeSnapshot.refetch()` (re-seedea todos los caches del cluster).
> Actualizado 2026-05-31 (parte 8j — card "Por pagar · este ciclo" como marquee horizontal): rediseño completo de `FijosProximosCard`. Pasó de lista vertical de 3 rows a **marquee horizontal auto-scrolling** ticket-style, single-row layout (`●name + amount + timing pill`), width 240pt, hairline border, radius 11, iOS list-cell feel. Items duplicados internamente para loop seamless. Animación final con **`useFrameCallback` + modulo en UI thread** (100% fluido, sin drift). Edge fade gradients REMOVIDAS (generaban "sombra gris" en dark mode; patrón iOS = clean cut at boundary). **`Gesture.Pan`** para arrastrar lateral; al soltar continúa desde la nueva posición. Speed 35 px/seg lineal. Header con **`UrgentHeaderDot`** (7pt) que pulsa cuando hay items ≤2 días. Componentes internos nuevos: `UpcomingMarquee`, `MarqueeTicket`, `UrgentHeaderDot`.
> Actualizado 2026-05-31 (parte 8k — fix v4 cycle-covered-by-prior-payment): caso del user (Claude AI monthly, pagado anticipado): `next_due_on` cayó 1 día después del `cycleEnd` → v3 lo clasificaba como `future`, user lo entendía como `paid`. Fix: `computeItemStatus` detecta `next_due_on >= cycleEnd Y last_paid_at != null` → status `'paid'` (no future). Solo cae a `'future'` si **nunca** se pagó. Helper nuevo `previousCuotaPeriodMonth` deriva el `cuotaMonth` para paid-via-coverage (sustrae 1 unidad de la frecuencia al `next_due_on` — ej Claude `jun/21` monthly → cuota cubierta = `may/21`). Data fix puntual: Gym (trimestral) tenía `next_due_on` un trimestre adelantado por arrastre del bug viejo del form de alta → corregido.
> Actualizado 2026-05-31 (parte 8l — 3 tabs + FijosScheduledBanner contextual): tras la parte 8k los `future` items quedaron como un caso del ~1% del tiempo y la tab estaba casi siempre vacía. Comparable analysis (Bills iOS, Mint, YNAB, PocketGuard, Apple Wallet) confirmó que **ninguna app de referencia tiene tab dedicada para "future"**. **Decisión Opt A**: tabs vuelven a **3 buckets** (Vencidos / Pendientes / Pagados); future items se mueven a un nuevo **`FijosScheduledBanner`** contextual que vive arriba del `FijoCategoryGroups` en todas las tabs. Renderea `null` cuando no hay future items (99% del tiempo). Card sky-muted, collapsible, hairline border + radius 12.
> Actualizado 2026-05-31 (parte 8m — copy del marquee disambigua del banner): el eyebrow del marquee pasó de "PRÓXIMOS A PAGAR" a **"POR PAGAR · ESTE CICLO"** para diferenciarlo claramente del `FijosScheduledBanner` ("N fijos programados · Sin pagar todavía"). Mental models distintos, copy distinto.
> Actualizado 2026-06-24 (polish premium fijos + add-fijo): **Botón Pagar → pill con label "Pagar"**. El círculo 40pt icon-only (solo glifo `$`) se leía como insignia/estado, no como acción, y pegado al monto leía "dos cosas de plata"; en `pending` (lo común) era 100% estático (el pulse solo vive en `overdue`). Ahora es un **pill** (`$` + texto "Pagar", paddingH 11/V 7, radius 11) — texto + fill = inequívocamente tappable, el verbo lo separa del monto. Press scale 0.88→0.95 (target ya grande), +10px de aire monto↔pill, halo de overdue reajustado a la geometría pill. **Step 2 del alta (impacto en el sueldo) premium**: el número "TE QUEDA LIBRE" usa `CountUpText flourish` (trepa desde 0 + glow al asentar, font 18→24pt), pintado con **color semántico** según la holgura (mismo umbral del `HealthBadge`: holgado=primary/lime, ajustado=peach, apretado=danger) + una **frase que interpreta** la banda ("Te queda holgado" / "Va a quedar algo ajustado" / "Cuidado: queda muy poco libre"); la `ImpactBar` **anima sus fills al montar** (el segmento peach "delta" se suma 120ms después → "esto es lo que sumás", reduceMotion-safe). Haptic `selection` al avanzar de paso. Tickets del marquee con más alpha en dark (0.035→0.06).

---

## 1. Visión general

### Qué muestran las tres pantallas

| Pantalla | Tab | Propósito |
|---|---|---|
| **Home** | Inicio | Panorama del ciclo: sueldo disponible hoy, resumen de variables + fijos, meta de ahorro, actividad reciente (últimos 6 gastos manuales). |
| **Control** | Control | Vista analítica del ciclo: cuánto tenés hoy (`libreHoy`), proyección al cierre, alcancía (ahorro real acumulado), semana, vs. mes anterior, patrón por día-de-semana, cobertura fijos/ahorro/libre. |
| **Fijos (V2)** | Fijos | Gestión de gastos recurrentes del ciclo: hero tipo boarding-pass con el estado del ciclo, próximos a pagar + alertas, lista por categoría con mark-paid/confetti, alta/edición/eliminación. |

### Cómo se relacionan

```
home_snapshot RPC (1 round-trip)
       │
       ├── seedCaches → ReactQuery (useHomeSnapshot)
       │        ├── profile, family, familyFinance
       │        ├── expenses (120 rows, pre-filtradas)
       │        ├── fixedExpenses + fixedExpensePayments
       │        ├── categories (expense + fixed_expense)
       │        ├── notifications (top-80 + unread count)
       │        ├── familyMembers + familyMembersDetail
       │        ├── savingsGoal, myFamilyRole, pushSubscription
       │        └── Control layer: monthlySummariesHistory,
       │                            categoryLimits, velocityToday,
       │                            advisorSignalDismissals
       │
       ├── Home monta con caches calientes → 0 requests adicionales
       ├── useWarmTabsSnapshots() (post-Home first-paint):
       │        ├── prefetchGastosSnapshot (tab Gastos)
       │        └── prefetchControlIntelligence (tab Control)
       │
       ├── AppTabs con lazy: false → pre-monta todas las tabs al boot
       │        → 1er tap a cualquier tab = instantáneo
       │
       └── Realtime: useHomeRealtime suscribe a expenses/
                     fixed_expenses/savings_goals/notifications
                     → invalida caches en mutaciones de familia
```

### Flujo de datos del sueldo/cobro

1. `SalaryConfirmationSheet` (flujo recurrente) o `OnboardingAvailableSheet` (primer cobro) se abre automáticamente post-payday desde `HomeDashboard`.
2. El usuario confirma el monto recibido → `buildCycleStartingBalanceInput` → `useUpsertFamilyFinance` → RPC + invalidación de caches.
3. El DB trigger `trg_family_finance_salary_confirm` cierra el ciclo anterior sincrónicamente con el upsert.
4. 700ms después del haptic, `HomeDashboard.fireWrappedForClosedCycle` refetch `controlIntelligenceQueryKey` y, si hay gastos en el ciclo cerrado, dispara `triggerCycleWrapped` → el Wrapped del ciclo (documentado aparte).

---

## 2. Home screen — Anatomía sección por sección

**Route**: [`app/(app)/(tabs)/home.tsx`](../../../app/(app)/(tabs)/home.tsx)  
**Screen**: [`mobile/screens/home/home-screen.tsx`](../../../mobile/screens/home/home-screen.tsx)  
**Dashboard**: [`mobile/components/home/home-dashboard.tsx`](../../../mobile/components/home/home-dashboard.tsx)

### Gate de snapshot

`HomeScreen` renderiza `null` hasta que `snapshot.data` existe (i.e. `useHomeSnapshot` completó y `seedCaches` pobló los caches). Sin este gate los sub-hooks disparan ~7 requests duplicados en cold start.

### Secciones (top → bottom, según `HomeDashboard`)

| # | Slot | Componente | Propósito |
|---|---|---|---|
| S1 | Header | `HomeHeader` | Saludo contextual por hora + 3 iconos: notificaciones (badge), asistente (badge), ajustes |
| S2 | FamilyStrip | `FamilyStrip` + `PaydayPillV2` | Avatares de miembros de la familia + pill de payday (días hasta cobro / "cobrar hoy") |
| S3 | Hero | `HomeHeroCard` | Monto disponible hoy, cupo diario, proyección al cierre, chip de ahorro (si configurado), trend vs. ciclo anterior |
| S5 | MonthSummary | `MonthSummaryCard` | Dos paneles side-by-side: Variables (total + top categoría chip) y Fijos (total + próximo fijo chip) |
| S6 | Meta | `MetaCard` / `MetaEmptyCard` | Progreso de la meta de ahorro + "Agregar ahorro" inline (`QuickAddSavingsSheet`). Si no hay meta: card vacía con CTA |
| S7 | Actividad | `HomeActivitySection` | Últimos 6 gastos manuales (filter `commitment_id == null`), cada uno en `ActivityRowV2` dentro de `SwipeRow`, swipe para eliminar |
| — | Sheets | `HomeDashboardSheets` | `OnboardingAvailableSheet` (primer ciclo) o `SalaryConfirmationSheet` (ciclos recurrentes). Lazy-mounted. |

### Detalles del Hero (S3)

`HomeHeroCard` recibe `HomeHeroMetrics` desde `useHomeMetrics`. Incluye:
- Monto disponible con `CountUpText` (Reanimated worklet-safe, formatea en JS thread via `runOnJS`).
- `BreatheDot` color-coded: verde = ok, peach = payday pendiente.
- Chip `savingsChip` = "Apartando ahorro · $X" cuando hay meta configurada.
- `projectedCloseTrend` = fracción vs. ciclo anterior (flechita +/-%).
- Pulse warning cuando `paydayPending`.
- ShineOverlay + HeroAurora + CardParticles (animaciones decorativas).

### Flujo de la confirmación de cobro

```
FamilyStrip.onPaydayPress → HomeDashboard.handleChipConfirmTracked
  → isCycleBalanceSheetOpen = true
  → HomeDashboardSheets (lazy mount)
    → OnboardingAvailableSheet (si storedCycleAnchor == null)
       o SalaryConfirmationSheet (flujo recurrente)
  → onSaveBalance(amount) → confirmCycleStartingBalance(amount)
    → upsertFamilyFinanceMutation.mutate(buildCycleStartingBalanceInput(...))
  → onSuccess → triggerHaptic('success') + fireWrappedForClosedCycle()
```

### Telemetría de sesión

`useHomeTelemetry` emite `home.opened` al mount y `home.closed` al unmount. Si el usuario no toca nada: `home.left_without_tap`. Cada elemento tapeable llama `trackTap(elementId, slot)` que emite `home.element_tapped`. `useTrackElement` emite `home.element_shown` para chips informativos (e.g. forecast trend).

### Scroll y tour

`Screen` usa `scrollEventThrottle={16}` (1 evento/frame a 60fps). El ref del ScrollView se registra en `useRegisterTourScrollView(HOME_TOUR)` para que el tour guiado auto-scrollee a cada step. Bottom detection via `distanceFromBottom <= 40` emite `home.scrolled_to_bottom`.

---

## 3. Control v2 — Vista de control de presupuesto

**Route**: [`app/(app)/(tabs)/insights.tsx`](../../../app/(app)/(tabs)/insights.tsx) (la tab se llama "Control" en UI, "insights" en el router)  
**Screen**: [`mobile/screens/home/control-v2-screen.tsx`](../../../mobile/screens/home/control-v2-screen.tsx)

### Cards montadas (top → bottom)

| Componente | Sección anchor | Qué muestra |
|---|---|---|
| `ControlV2Header` | — | Score pill (0-100) + scoreLabel + entry a `DailyGoalSheet` cuando `goalEditable`. Nuevo: botón circular `WrappedButton` (ícono `slideshow`) a la izquierda del pill, aparece solo cuando hay un cierre no visto (`wrappedUnseen`); halo "sonar" que pulsa con `WrappedPulse`. Props nuevas: `onPressWrapped`, `wrappedUnseen`. |
| `ControlV2Hero` (**nuevo**) | `hoy` | "TL;DR del día": headline state-aware + cupo diario + gasto hoy + libre hoy + BreatheDot + ShineOverlay + CardParticles. Wrappea `ControlHeroTitular` (variante A). |
| `ControlV2AlcanzaCard` | `alcanza` | Proyección: "¿llegás al mes?" + día de agotamiento proyectado + ritmo vs cupo |
| `ControlV2AlcanciaCard` | `alcancia` | Ahorro real acumulado (`vault`), racha bajo cupo, días ganadores, no-spend count |
| `ControlV2SemanaCard` | `semana` | Últimos 7 días vs 7 previos, momentum, avg7 |
| `ControlV2VsMesCard` | `vsmes` | "CÓMO VAS ESTE MES" — comparación minimal contra el ciclo cerrado. Tres estados (sin gastos / primeros días / ciclo confiable). Dos barras animadas, mini-recap, CTA "Ver el cierre de {mes}" que lanza el Wrapped. Siempre datos reales (sin modo demo). |
| `ControlV2PatronCard` | `patron` | Patrón por día de semana (dow), peor/mejor día, avg global |
| `ControlV2CoberturaCard` | `cobertura` | Distribución fijos/ahorro/libre sobre ingreso total, ratio %, cupo diario |

### Empty-state por card (variant per-card — feat/settings-dark-mode)

El componente genérico `control-v2-placeholder.tsx` fue eliminado. Cada card renderiza su propio empty-state: una silueta inerte de la misma chrome (surface, border `line`, eyebrow + BreatheDot + título UPPERCASE) con valores en "—" y un callout que indica cuándo se activa. Opacity 0.86, pill "Pronto" en textMuted, progreso real hacia el umbral ("Gasto en N de M días").

La variable clave del adaptador (`control-v2-mock.ts`) es `diasConGasto`: días distintos del ciclo con gasto discrecional (días cerrados con gasto > 0, más hoy si `gastoHoy > 0`). `closedDays` cuenta días calendario cerrados del ciclo (longitud de `d.dias`). `hasReliableProjection = closedDays >= 7 && diasConGasto >= 7`.

| Card | Eyebrow | Umbral de activación | Copy del callout empty |
|---|---|---|---|
| `ControlV2AlcanzaCard` | HASTA CUÁNDO TE ALCANZA | `hasReliableProjection` (closedDays ≥ 7 **y** diasConGasto ≥ 7) | "Registra gastos en al menos 7 días distintos para proyectar hasta qué día del ciclo te alcanza el dinero libre." + "Gasto en N de 7 días." |
| `ControlV2SemanaCard` | CÓMO VA · ÚLTIMOS 7 DÍAS | `diaActual >= 7` y `diasConGasto >= 7` | "Registra gastos en al menos 7 días distintos para ver tu ritmo de la semana y compararlo con la anterior." + "Gasto en N de 7 días." |
| `ControlV2PatronCard` | TU PATRÓN SEMANAL | `diaActual >= 14` y `diasConGasto >= 14` | "Registra gastos en al menos 14 días distintos para detectar en qué día de la semana gastas más." + "Gasto en N de 14 días." |
| `ControlV2AlcanciaCard` | TU ALCANCÍA · ESTE CICLO | `diaActual >= 3` y `diasConGasto >= 3` | "Registra gastos en al menos 3 días distintos para sugerirte cuánto mover a tu meta según tu ritmo." + "Gasto en N de 3 días." |
| `ControlV2VsMesCard` | CÓMO VAS ESTE MES | `hasPreviousMonth = true` (al menos un ciclo cerrado con gasto real) | "Todavía no cerraste un mes. Cuando confirmes tu próximo cobro, vamos a cerrar el mes y vas a ver acá cómo vas gastando comparado con el mes anterior." Pill: "Sin cierre todavía". |

`ControlV2VsMesCard` no usa `diasConGasto` sino `data.hasPreviousMonth` del adaptador (`true` solo cuando existe al menos un `monthly_summaries` previo con gasto real). El `noConfig` branch de `ControlV2Screen` (sin `monthly_income`) no muestra las cards: renderiza `ControlV2EmptyState` + header con score "Pronto" sin pasar por los empty-states por card.

**Nota**: `ControlV2AsesorCard` fue eliminada del layout. Los signals del Asesor se acceden desde el ícono de acceso rápido en Home (botón Asistente). Ver REAL-VALUE-SUGGESTIONS/CONTROL-HERO-REFACTOR.md.

### Card "CÓMO VAS ESTE MES" (ControlV2VsMesCard) — detalle

La card fue reescrita completamente (antes: "VS MES PASADO"). Es minimal, comparación-first, y **siempre usa datos reales** — se eliminó el modo demo/ejemplo. Eyebrow fijo: `CÓMO VAS ESTE MES`.

**Tres estados según el ciclo actual** (cuando `hasPreviousMonth = true`):

| Estado | Condición | Pill | Headline |
|---|---|---|---|
| Sin gastos aún | `proyectadoMes == 0` | "Recién arranca" (neutro, ícono `schedule`) | "Todavía no registraste gastos este mes." |
| Primeros días | `proyectadoMes > 0` y `diaActual < 4` | "Primeros días" (neutro) | "Llevás $X gastado. En unos días te comparo con {mes}." |
| Ciclo confiable | `diaActual >= 4 && proyectadoMes > 0` | "Vas bien" (verde) o "Ojo este mes" (ámbar) | "Vas gastando $X, $Y menos/más que en {mes}." |

La variable `reliable = diaActual >= 4 && proyectadoMes > 0` controla cuándo se afirma la comparación. El tono del acento (verde/ámbar) sigue `vsMesMejor`.

**Estructura de la card** (top → bottom):
1. **Header**: eyebrow `CÓMO VAS ESTE MES` + `BreatheDot` coloreado según acento + pill de estado.
2. **Headline adaptativo**: una frase en lenguaje llano según el estado (ver tabla arriba).
3. **Dos barras de comparación** (`CompareBar`): mes pasado (real) vs. este mes (real/proyectado). Animadas con `GrowReveal` (`scaleX` desde la izquierda, usando `motionDurations.slow` + `motionEasings.enterSmooth`).
4. **Mini-recap del mes pasado**: "En {mes} gastaste $X y ahorraste $Y" (`event-available` icon) + "Donde más gastaste: {categoría}" (`local-mall` icon), separado por borde superior tenue.
5. **CTA "Ver el cierre de {mes}"** (ícono `slideshow`, fondo `primary`): aparece solo cuando `onVerCierre` está definido (i.e. hay un `wrappedPayload`). Lanza el Manifiesto Wrapped con `triggerHaptic('selection')`.

**Empty state** (`hasPreviousMonth = false`): card misma chrome con pill "Sin cierre todavía" y texto explicativo sobre qué pasa cuando se confirma el próximo cobro. No muestra barras.

**Datos disponibles pero no pintados hoy**: el adaptador expone en `mesPasado` los campos `categoryBreakdown`, `byMember` y `dailyTotals` (ver sección 3 de datos del rollup), pero la card actual no los renderiza — quedaron disponibles para variantes futuras más ricas (sparkline de ritmo diario, módulo "quién gastó").

### Acceso al "Manifiesto Wrapped" desde Control

El Wrapped del ciclo recién cerrado (la animación de cierre `CycleWrappedModal`) es accesible desde dos puntos de la pantalla Control:

**1. Header (`ControlV2Header`)** — `WrappedButton`:
- Botón circular (`WrappedButton`) a la izquierda del score pill, misma chrome que los botones circulares del resto del header (`circleButtonSurface`). Ícono `slideshow` con color `primary`.
- Aparece **solo** cuando `onPressWrapped` está definido, lo que el screen controla con `wrappedPayload && !wrappedSeen ? launchWrapped : undefined`. Al verlo (marcar seen) desaparece automáticamente.
- `WrappedPulse`: halo "sonar" que expande y desvanece en loop (`withRepeat` / ~1.8s por ciclo, `Easing.out(Easing.ease)`). Bajo `reduceMotion`: anillo estático a opacidad 0.4. Desaparece cuando `wrappedSeen`.
- Props nuevas en `ControlV2HeaderProps`: `onPressWrapped?: () => void` y `wrappedUnseen?: boolean`.

**2. Card "CÓMO VAS ESTE MES"** — prop `onVerCierre`:
- CTA primario al fondo de la card. Solo se renderiza cuando `onVerCierre` está definido.
- Texto: "Ver el cierre de {mesPasadoNombre}" (ícono `slideshow` + `chevron-right`).

**Flujo al lanzar** (`ControlV2Screen.launchWrapped`):
```
launchWrapped()
  → triggerCycleWrapped(wrappedPayload)   // emitter global → CycleWrappedModal
  → if (wrappedSummaryId && !wrappedSeen)
      markWrappedSeen.mutate(wrappedSummaryId)  // useMarkCycleWrappedSeen
```

**`useMarkCycleWrappedSeen`** (`mobile/features/wrapped/use-mark-cycle-wrapped-seen.ts`):
- `useMutation` que llama a la RPC `mark_cycle_wrapped_seen(p_summary_id)`.
- Update optimista: setea `wrapped_seen_at = now()` en la summary cacheada bajo `controlIntelligenceQueryKey` para apagar el pulse del header al instante.
- `onError`: rollback de la cache optimista.
- `onSettled`: `invalidateQueries` del mismo key para revalidar desde el server.

**Estado seen/no-seen**: vive en `monthly_summaries.wrapped_seen_at` (columna por familia). El campo es seleccionado por `fetchSummaries` (`use-control-v2-data.ts`) en el `select` de la query. `wrappedSeen = Boolean(summaries[0]?.wrapped_seen_at)`.

El hook `useControlV2Data` expone tres campos relacionados en `ControlV2ViewModel`:
- `wrappedPayload: CycleWrappedPayload | null` — payload listo para disparar el Wrapped.
- `wrappedSummaryId: string | null` — id del `monthly_summaries` a marcar visto.
- `wrappedSeen: boolean` — si el Wrapped más reciente ya fue visto (apaga el pulse).

### Scroll anchoring y deep links

`ControlV2Screen` maneja su propio `ScrollView` (no usa el de `Screen`) para poder hacer scroll-to-section. `ControlAnchorsContext` provee `registerOffset` + `scrollToSection` a todos los `ControlV2Anchor` wrappers. El Asistente hace push con `?section=semana` etc. → el screen honra el param vía `useLocalSearchParams` + `scrollToSection` con 200ms defer post-mount.

### Hero card (variante A · El Titular)

`ControlV2Hero` adapta `data` + `view` del hook al shape `ControlHeroState` y renderiza `ControlHeroTitular` (de `components/control-hero-preview/control-hero-a-titular.tsx`). La variante A fue elegida por el owner tras comparar 7 variantes en la pantalla dev `settings/dev/control-hero-variants`. El wrapper `ControlV2HeroImpl` (en `components/control-v2/control-v2-hero.tsx`) es el bridge entre el adapter y el componente de preview que pasó a producción.

### DailyGoalSheet

Sheet modal (no inline) para configurar "mi meta diaria" = buffer de gasto. Lee `daily_budget_buffer_mode` y `daily_budget_buffer_value` de `familyFinance`. Escribe via `upsertFamilyFinance.mutateAsync`. Bloqueado durante racha rota en ventana de 14 días de recuperación (`goalEditable` derivado de `streakQuery.data`).

### Advisor notification sync

`useAdvisorNotificationSync` está montado en ControlV2Screen (no en el Asesor): pipe de alta-prioridad de signals del advisor hacia el feed de notificaciones in-app y (si `confidence >= 0.85`) push. De-duplicado por dispositivo con cooldown de 18h por signal id.

---

## 4. Gastos Fijos

### Screens activas vs. legacy

| Screen | Archivo | Ruteada LIVE | Notas |
|---|---|---|---|
| **FijosV2Screen** | [`mobile/screens/home/fijos-v2-screen.tsx`](../../../mobile/screens/home/fijos-v2-screen.tsx) | ✅ **LIVE** | Importada por `app/(app)/(tabs)/fixed-expenses.tsx` |
| ~~FijosV3Screen~~ | ~~`mobile/screens/home/fijos-v3-screen.tsx`~~ | 🗑️ **Eliminado 2026-05-22** | V3 fue revertida. Eliminado junto con el cluster fijos-hero-preview (Bucket 1 de [09](09-candidatos-a-eliminar.md)). |
| AddFijoV2Screen | [`mobile/screens/home/add-fijo-v2-screen.tsx`](../../../mobile/screens/home/add-fijo-v2-screen.tsx) | ✅ **LIVE** | Modal `/add-fixed-expense`. Soporta create + edit (vía param `id`). |

### Anatomía de FijosV2Screen (secciones top → bottom)

| Sección | Componente | Propósito |
|---|---|---|
| Header | `FijosHeader` | Título + botón circular de alta (ref expuesto al tour) |
| Hero | `FijosHeroCard` | Boarding pass: cycle route line, montos pagados/pendientes, PaymentSegments (1:1 fijo/segmento), dinero libre, % del sueldo |
| Próximos | `FijosProximosCard` | **2026-05-31**: rediseñada como **marquee horizontal auto-scrolling** (era lista vertical). Tickets single-row (`●name + amount + timing pill`), 240pt c/u, hairline border, radius 11, iOS list-cell feel. Loop seamless por duplicación interna. Animación con `useFrameCallback` + modulo en UI thread (sin drift). `Gesture.Pan` para arrastre lateral (continúa desde la nueva posición al soltar). Speed 35 px/seg lineal. Sin edge fades (limpio dark mode). Header eyebrow **"POR PAGAR · ESTE CICLO"** + `UrgentHeaderDot` 7pt que pulsa cuando hay items ≤2d. Componentes internos: `UpcomingMarquee`, `MarqueeTicket`, `UrgentHeaderDot`. |
| Tabs | `FijosTabs` | Filtros con **3 buckets** (2026-05-31 v4): **Vencidos** (overdue / mora arrastrada, rojo brand-deep), **Pendientes** (pending = cuotas del ciclo activo aún sin vencer, peach), **Pagados** (paid del ciclo activo, lime). Auto-promote a "Vencidos" en primer paint si hay vencidos, respetando selección manual. **Cambio v4**: la tab "Próximos" se eliminó tras descubrir que los `future` items eran <1% del tiempo (tab casi siempre vacía); pasaron al `FijosScheduledBanner` contextual. Usa `GastosFilterPill` internamente. Historial de iteraciones: v1 (todos/pendientes/pagados/zombis) → v2 (pendientes/pagados+próximos, 2 buckets, 2026-05-30) → v3 (4 buckets pendientes/pagados/próximos + vencidos, 2026-05-30) → v4 (3 buckets, banner para futures, 2026-05-31) → **v5 actual** (tabs DINÁMICAS, 2026-06-19). **Cambio v5**: cada bucket se muestra solo si tiene items (vacío = oculto); si no hay vencidos ni pendientes queda solo "Pagados"; el tab activo redirige a la primera visible si se vacía. `visibleTabs` lo calcula `use-fijos-controller` (orden de urgencia; fallback `['pendientes']` si todos son `future`). |
| Scheduled | `FijosScheduledBanner` | **NUEVO 2026-05-31**. Banner contextual sobre el listado, visible en TODAS las tabs. Renderea `null` cuando no hay items `future` (99% del tiempo). Card sky-muted (info, no urgencia), hairline border + radius 12 (iOS look). Collapsed: icon `event` + "N fijos programados" + sub "Sin pagar todavía" + chevron. Expanded: lista de items con `catColor` dot + name + "Vence DD MMM". Chevron animado (rotation 180°), ReduceMotion-aware. Reemplazo de la tab "Próximos" (v3 → v4). |
| Lista | `FijoCategoryGroups` | Lista de `FijoRow` agrupados por categoría |

### FijosEmptyState (feat/settings-dark-mode)

Cuando `controller.allItems.length === 0` (cuenta sin fijos), `FijosV2Screen` renderiza `FijosEmptyState` en lugar de las cards de datos. El componente (`components/fijos/fijos-empty-state.tsx`) no usa datos falsos: muestra los componentes reales en su modo vacío/placeholder.

Estructura del empty state:

1. **Intro card**: card con icono `event-repeat`, título "Todavía no tienes gastos fijos", texto explicativo sobre qué son los fijos, y CTA primario `AppButton` "Agregar mi primer fijo".
2. **Eyebrow "ASÍ SE VA A VER"** + tres preview blocks, cada uno con un `PreviewBlock` (icono + título + descripción en textMuted) y debajo el componente real en modo empty:
   - "Resumen del ciclo" → `<FijosHeroCard empty />` (prop `empty`)
   - "Próximos a pagar" → `<FijosProximosCard empty />` (prop `empty`)
   - "Por categoría" → tres `<FijoRow placeholder />` (prop `placeholder`)

Los preview blocks son inerts (opacity recesada, sin interacción). El screen envuelve cada bloque en un `TourTarget` del tour de Fijos para que el tour guiado funcione incluso en cuentas vacías. El botón de alta en `FijosHeader` conserva su ref-based tour target independiente.

### FijosHeroCard — detalles clave

- `CycleRouteLine`: boarding-pass con estaciones (ABR → MAY), dashes coloreados (lime = pasado, muted = futuro), today-marker circular en `cycleDayIndex/cycleDays * 100%`.
- `PaymentSegments`: reemplazó la `ProgressBar` lineal con pulse. Cada segmento = 1 fijo. Colores: lime (pagado), muted cream (pendiente), peach (vencido). Ordenados: pagados primero, pendientes en el medio, vencidos al final.
- ~~`urgencyRing`: overlay Reanimated que pulsa peach cuando hay vencidos.~~ **Removido 2026-05-31** — el pulse era invasivo (latía toda la card y competía con el contenido). Migrado al **chip "N VENCIDOS"** del header: bg alpha 0.18→0.36, border 0.50→0.85, scale 1→1.04, 2.4s warm, ReduceMotion-aware.
- Badges: "N VENCIDOS" (peach, **con pulse focalizado**) o "AL DÍA" (lime).
- Eyebrow = ciclo expandido ("20 ABRIL → 20 MAYO" en lugar del genérico "Gastos fijos").

### FijoRow — detalles clave

- **Layout (2026-05-31, partes 8h₁-8h₅)**: row en **2 lanes**. **Top lane**: name + amount + `InlinePayButton`. **Bottom strip**: month chip ("Mayo"/"Junio" pill, bg+border tintados por status accent) + status badge inline (icon + texto bold corto, single-line). Wording del badge: `overdue` "Vencida 11d" (warning), `pending` "En 5d"/"Hoy" (schedule), `paid` "Pagada" (check-circle), `future` "Próxima" (event).
- Tap → expand panel enriquecido (parte 8e) — 4 secciones jerárquicas (Stats hero / Tendencia / Este pago / Historial) + acciones ("Editar", "Revertir pago" en `paid`). **Status accent** (2026-05-31, parte 8h₄): border-top dashed + bg del statsHero + accent stripe vertical tintados por status (overdue rojo, pending peach, paid lime, future sky).
- `InlinePayButton`: botón circular (40pt visual + hitSlop 8 = ~56pt efectivo) brand-coded con ícono `attach-money`. Pending `forest-deep`, overdue `red brand` + halo pulse continuo (1.5s, scale 1→1.45, opacity 0.45→0, ReduceMotion-aware). Press scale 0.88. **Refinado 2026-05-31**: removido el inner highlight blanco (feedback "se ve plástico") — quedó flat con borde 1.5pt en tono más oscuro.
- Swipe left → "Eliminar" (solo eliminar; editar vive en el expand panel). El swipe es provisto por `SwipeRow` (wrapeado internamente en `FijoRowReal`, `borderRadius 16`).
- `ConfettiBurst`: renderizado por row. Se dispara en el flip de status `pending/overdue → paid` durante la vida del componente (no en cold open). Ref `initialStatusRef` previene confetti en rows ya pagadas al montar.
- `TrendBadge`: visible cuando `|trendDeltaPct| >= 1`. Variant `'price' | 'arrears'` (arrears agrega sufijo "int." según `paid_in_arrears`). Colores theme-aware.
- Press scales: 3 instancias (`cardPress 0.98`, `actionPrimaryPress 0.96`, `actionSecondaryPress 0.96`).
- Wrapped en `memo` para evitar re-renders en cascada.

### AddFijoV2Screen

Formulario modal con:
- `InAppNumpad` numérico.
- Nombre con `TextInput`.
- `CategoryHorizontalRail` (selector de categoría).
- `SuggestedAmountStrip` (sugerencias de monto).
- `AmountCard` (preview del monto).
- `StickyFooter` con CTA de guardar.
- Soporte edit: si `fixedExpenseId` está presente, pre-carga el fijo existente via `useFixedExpenses` y submite via `useUpdateFixedExpense`.
- Soporte prefill desde Asistente: params `amount` y `description` en la URL.

### Componentes fijos desreferenciados (dead code)

`FijosSmartAlerts` y `FijosUpcomingStrip` (en `components/fijos/`) fueron reemplazados por `FijosProximosCard`. 🗑️ **Eliminados 2026-05-22** (Bucket 1 de [09](09-candidatos-a-eliminar.md)).

---

## 5. Inventario de componentes

### 5.1 components/home/ (73 archivos post-limpieza 2026-05-22)

| Archivo | Propósito | Usado por |
|---|---|---|
| `activity-row-v2.tsx` | Fila de gasto en el feed de actividad. Wrapeada en `SwipeRow` (externamente, en `home-activity-section.tsx`). Solo esquinas izquierdas redondeadas (`borderRadius 14`); el contorno completo lo provee el SwipeRow exterior. `backgroundColor` theme-aware: `surfaceMuted` en dark, `creamCard` en light — igual que `GastoRow`. | `HomeActivitySection` |
| `add-expense-advisor-banner.tsx` | Banner del asesor para sugerir cargar un gasto | (no verificado) |
| `add-expense-dashboard.tsx` | Dashboard de carga de gastos | (no verificado) |
| `ambient-blobs.tsx` | 3 blobs de color que flotan como fondo. `position: absolute`. | `HomeScreen`, `FijosV2Screen`, `ControlV2Screen` |
| `amount-card.tsx` | Tarjeta de preview del monto en formularios. | `AddFijoV2Screen`, add-expense |
| `animated/breathe-dot.tsx` | Dot que respira (Reanimated `withRepeat`). Coloreado por estado. | `HomeHeroCard`, `FijosHeroCard`, `ControlV2*` |
| `animated/count-up-text.tsx` | Texto numérico con animación count-up (Reanimated). | Heroes (Home, Fijos, Control) |
| `animated/float-view.tsx` | View con animación de flotación suave. | `MetaCard` |
| `animated/rise-view.tsx` | Wrapper con entrada slide-up + fade. Usado para cascada stagger. | Heroes, cards de Fijos |
| `animated/shine-overlay.tsx` | Overlay diagonal tipo lente reflectiva. `LinearTransition`. | `HomeHeroCard`, `FijosHeroCard`, `MetaCard` |
| `animated/slide-in-view.tsx` | Entrada slide + fade configurable. | (no verificado) |
| `category-horizontal-rail.tsx` | Rail horizontal de chips de categoría. | Formularios de add |
| `commitment-preview-row.tsx` | Row de preview de un commitment (fijo) | (no verificado) |
| `control-action-card.tsx` | Card de acción del control (CTA del asesor) | (no verificado) |
| `control-forecast-strip.tsx` | Strip de forecast del control | (no verificado) |
| ~~`control-hero-card.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — hijo del barrel `control-sections` (0 refs) |
| `control-history-ribbon.tsx` | Ribbon de historial del control | (no verificado) |
| ~~`control-months-section.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — hijo del barrel `control-sections` (0 refs) |
| `control-mood-orb.tsx` | Orbe de mood del control | (no verificado) |
| ~~`control-plan-section.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — hijo del barrel `control-sections` (0 refs) |
| `control-pressure-meter.tsx` | Medidor de presión del control | (no verificado) |
| ~~`control-primitives.tsx`~~ | 🗑️ **Eliminado 2026-06-08** — 0 imports (SPRINT D cleanup) |
| ~~`control-sections.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — barrel huérfano (0 imports) |
| `control-signal-tile.tsx` | Tile de signal del asesor | (no verificado) |
| ~~`control-today-section.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — hijo del barrel `control-sections` (0 refs) |
| `control-visual-utils.ts` | Utilidades visuales del control | (no verificado) |
| `control-visuals.tsx` | Componentes visuales del control | (no verificado) |
| `cycle-balance-prompt-sheet.tsx` | `OnboardingAvailableSheet` + `SalaryConfirmationSheet`. Dos variantes mutuamente excluyentes del prompt de cobro. | `HomeDashboardSheets` |
| ~~`daily-budget-ring-chart.tsx`~~ | 🗑️ **Eliminado 2026-06-08** — huérfano transitivo tras quitar `daily-budget-ring.tsx` (SPRINT D) |
| ~~`daily-budget-ring.model.ts`~~ | 🗑️ **Eliminado 2026-06-08** — quedó huérfano tras delete del ring + test sin importadores (cleanup post-SPRINT D) |
| ~~`daily-budget-ring.tsx`~~ | 🗑️ **Eliminado 2026-06-08** — 0 imports (SPRINT D cleanup) |
| `daily-budget-suggestion-card.tsx` | Card de sugerencia del presupuesto diario | (no verificado) |
| `description-row.tsx` | Fila de descripción | (no verificado) |
| `expense-editor-modal.tsx` | Modal para editar un gasto existente | (no verificado) |
| `expense-history-content-card.tsx` | Card de contenido del historial de gastos | (no verificado) |
| `expense-history-hero-card.tsx` | Hero card del historial de gastos | (no verificado) |
| `expense-history-list.tsx` | Lista del historial de gastos | (no verificado) |
| `expense-history-row-actions.tsx` | Acciones de una fila del historial | (no verificado) |
| `expense-history-row-card.tsx` | Card de fila del historial | (no verificado) |
| `expense-history-row.tsx` | Fila del historial de gastos | (no verificado) |
| `expense-history-section-header.tsx` | Header de sección del historial | (no verificado) |
| `expense-history-toolbar.tsx` | Toolbar del historial de gastos | (no verificado) |
| ~~`expense-intelligence-panel.tsx`~~ | 🗑️ **Eliminado 2026-06-08** — 0 imports (huérfano confirmado en SPRINT D cleanup) |
| `expense-intelligence-suggestion-card.tsx` | Card de sugerencia de inteligencia | (no verificado) |
| `family-strip.tsx` | Strip horizontal de avatares familiares + `PaydayPillV2`. Max 4 avatares + overflow count. | `HomeDashboard` |
| `greeting-header.tsx` | Saludo contextual por hora del día ("Buenos días", etc.) | `HomeHeader` |
| `hero-aurora.tsx` | 3 blobs de aurora dentro del hero card | `HomeHeroCard` |
| ~~`hero-stat.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — 0 imports (el `HeroStat` vivo es el de `settings-primitives`) |
| `home-activity-section.tsx` | Sección de actividad: lista de `ActivityRowV2` o empty/error/loading state | `HomeDashboard` |
| `home-assistant-button.tsx` | Botón circular del asistente con badge de pending count | `HomeHeader` |
| `home-circle-button.tsx` | Botón circular genérico (notificaciones, ajustes) | `HomeHeader` |
| `home-dashboard-sheets.tsx` | Lazy-mount de las sheets de ciclo (salary vs onboarding) | `HomeDashboard` |
| `home-dashboard.tsx` | Orquestador principal del Home: todas las secciones + sheets + telemetría | `HomeScreen` |
| `home-header.tsx` | Header: `GreetingHeader` + `HomeAssistantButton` + `HomeCircleButton` × 2 | `HomeDashboard` |
| `home-hero-card.tsx` | Hero card del Home: disponible hoy + cupo diario + proyección + shine + aurora + particles | `HomeDashboard` |
| `home-hero-savings-helpers.ts` | Helpers para el chip de ahorro en el hero | `HomeDashboard` |
| `home-next-fixed-fallback.ts` | Fallback del "próximo fijo" cuando no hay fijos | `HomeDashboard` |
| `home-next-fixed-helpers.ts` | Helpers para computar el próximo fijo del ciclo | `HomeDashboard` |
| `home-top-category-helpers.ts` | Helpers para computar la top categoría del ciclo | `HomeDashboard` |
| `meta-card.tsx` | Card de meta de ahorro: progreso + FloatView + `QuickAddSavingsSheet` | `HomeDashboard` |
| ~~`meta-empty-card.tsx`~~ | 🗑️ **Eliminado 2026-06-08** — 0 imports (SPRINT D cleanup) |
| ~~`mini-bars.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — 0 imports |
| `month-summary-card.tsx` | Dos paneles side-by-side: Variables (top categoría chip) + Fijos (próximo fijo chip) | `HomeDashboard` |
| `notes-row.tsx` | Fila de notas | (no verificado) |
| `notification-feed-list.tsx` | Lista del feed de notificaciones | `NotificationsScreen` |
| `notifications-filter-pills.tsx` | Pills de filtro de notificaciones | `NotificationsScreen` |
| `notifications-hero.tsx` | Hero card de la pantalla de notificaciones | `NotificationsScreen` |
| `onboarding/step-avatar.tsx` | Step del wizard: selección de avatar | `OnboardingScreen` |
| `onboarding/step-chrome.tsx` | Step del wizard: chrome/shell de step | `OnboardingScreen` |
| `onboarding/step-family-summary.tsx` | Step del wizard: resumen familiar | `OnboardingScreen` |
| `onboarding/step-family.tsx` | Step del wizard: familia | `OnboardingScreen` |
| `onboarding/step-income-contribution.tsx` | Step del wizard: contribución de ingreso | `OnboardingScreen` |
| `onboarding/step-income.tsx` | Step del wizard: ingreso | `OnboardingScreen` |
| `onboarding/step-savings.tsx` | Step del wizard: ahorro | `OnboardingScreen` |
| `onboarding/step-welcome.tsx` | Step del wizard: bienvenida | `OnboardingScreen` |
| `payday-pill-v2.tsx` | Pill de payday (días al cobro / "Cobrá hoy" / "N días sin cobrar") | `FamilyStrip` |
| `projection-wait-copy.ts` | Copy para el estado de "esperando proyección" | `HomeHeroCard` |
| `quick-add-savings-sheet.tsx` | Sheet para agregar ahorro rápido desde el MetaCard | `MetaCard` |
| `suggested-amount-strip.tsx` | Strip de montos sugeridos en formularios | `AddFijoV2Screen`, add-expense |
| `who-paid-avatar.tsx` | Avatar del miembro que pagó en ActivityRow | `ActivityRowV2` |

**Total verificado**: 80 archivos (lista completa, algunos propósitos marcados "(no verificado)" porque no fueron leídos en detalle — sus nombres son descriptivos).

### 5.2 components/control-v2/ (22 archivos post-limpieza 2026-05-22) — ✅ LIVE

| Archivo | Propósito |
|---|---|
| `add-fixed-quick-sheet.tsx` | Sheet de alta rápida de fijo desde Control |
| `asesor-action-meta.ts` | Metadata de acciones del asesor |
| `asesor-bubble-meta.ts` | Metadata de bubbles del asesor |
| `asesor-signal-meta.ts` | Metadata de signals del asesor |
| `control-v2-alcancia-card.tsx` | Card de alcancía (ahorro acumulado, racha, dias ganadores) |
| `control-v2-alcanza-card.tsx` | Card de proyección (¿llegás al mes?) |
| `control-v2-anchor.tsx` | Wrapper que registra el offset Y de una sección para scroll-to-section |
| ~~`control-v2-asesor-card.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — removida del layout y del código |
| `control-v2-cobertura-card.tsx` | Card de cobertura: distribución fijos/ahorro/libre |
| `control-v2-empty-state.tsx` | Empty state cuando falta ingreso o gastos |
| `control-v2-header.tsx` | Header con score pill + entry a `DailyGoalSheet`. Nuevo: `WrappedButton` circular (ícono `slideshow`) con `WrappedPulse` sonar; props `onPressWrapped` y `wrappedUnseen`. |
| `control-v2-hero.tsx` | Production wrapper: adapta data+view → ControlHeroState → renderiza `ControlHeroTitular` |
| ~~`control-v2-hoy-card.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — rollback-kept; owner confirmó descarte |
| `control-v2-patron-card.tsx` | Card de patrón por día de semana |
| ~~`control-v2-placeholder.tsx`~~ | 🗑️ **Eliminado feat/settings-dark-mode** — reemplazado por empty-states per-card en cada componente |
| `control-v2-semana-card.tsx` | Card de la semana (últimos 7 días) |
| `control-v2-tokens.ts` | Design tokens del control |
| `control-v2-vsmes-card.tsx` | Card "CÓMO VAS ESTE MES" — reescrita. Minimal, comparación-first, datos reales. Tres estados (sin gastos / primeros días / ciclo confiable), dos barras `GrowReveal`, mini-recap, CTA Wrapped. Sin modo demo. |
| `daily-goal-sheet.tsx` | Sheet de "mi meta diaria" (buffer mode) |
| `fixed-expense-quick-edit-sheet.tsx` | Sheet de edición rápida de fijo |
| ~~`forecast-sparkline.tsx`~~ | 🗑️ **Eliminado 2026-05-22** — 0 imports |
| `global-advisor-action-host.tsx` | Host global del dispatcher de acciones del asesor |
| `member-warning-sheet.tsx` | Sheet de alerta para miembros con gasto alto |
| `savings-goal-quick-edit-sheet.tsx` | Sheet de edición rápida de meta de ahorro |
| `zombie-feed-section.tsx` | Sección de subscripciones zombie en Control |

### 5.3 components/control-hero-preview/ (3 archivos) — ✅ LIVE (solo variante A y helpers)

> **Limpieza 2026-05-22:** el directorio pasó de 9 archivos a 3. Las variantes B-G fueron eliminadas junto con la ruta dev `control-hero-variants` y su screen. Solo quedan los 3 archivos LIVE.

| Archivo | Estado |
|---|---|
| `control-hero-a-titular.tsx` | ✅ **LIVE** — renderizada por `ControlV2Hero` en producción |
| ~~`control-hero-b-velocimetro.tsx`~~ | 🗑️ **Eliminado 2026-05-22** |
| ~~`control-hero-c-termometro.tsx`~~ | 🗑️ **Eliminado 2026-05-22** |
| ~~`control-hero-d-coach.tsx`~~ | 🗑️ **Eliminado 2026-05-22** |
| ~~`control-hero-e-periodico.tsx`~~ | 🗑️ **Eliminado 2026-05-22** |
| ~~`control-hero-f-reloj.tsx`~~ | 🗑️ **Eliminado 2026-05-22** |
| ~~`control-hero-g-coach-magazine.tsx`~~ | 🗑️ **Eliminado 2026-05-22** |
| `control-hero-helpers.ts` | ✅ compartido (usado por variante A en producción) |
| `control-hero-states.ts` | ✅ define `ControlHeroState` type (usado en producción por `control-v2-hero.tsx`) |

~~**Ruta dev**: `app/(app)/settings/dev/control-hero-variants.tsx` → `ControlHeroVariantsScreen`.~~ → 🗑️ **Eliminada 2026-05-22**.

### 5.4 components/fijos/ (8 archivos) — ✅ LIVE

> **Limpieza 2026-05-22:** `fijos-smart-alerts.tsx` y `fijos-upcoming-strip.tsx` eliminados (Bucket 1 de [09](09-candidatos-a-eliminar.md)).
> **Nuevo 2026-05-31:** `fijos-scheduled-banner.tsx` (reemplaza la tab "Próximos" v3).

| Archivo | Estado | Propósito |
|---|---|---|
| `fijo-category-groups.tsx` | ✅ LIVE | Agrupa `FijoRow` por categoría. Tab-aware (filtra según `FijosTab`). |
| `fijo-row.tsx` | ✅ LIVE | Row individual de fijo: layout en **2 lanes** (top: name+amount+`InlinePayButton`, bottom-strip: month chip + status badge), expand panel enriquecido con status accent + ConfettiBurst + `SwipeRow` (wrapeado internamente, `borderRadius 16`). `styles.card` solo esquinas izquierdas (`borderTopLeftRadius/borderBottomLeftRadius: 16`); `FijoRowPlaceholder` restaura las derechas vía `styles.placeholderCard` para uso standalone. Soporta prop `placeholder` para el empty state. Define internamente el sub-componente `InlinePayButton` (extraído inline para encapsular halo pulse + brand colors). |
| `fijo-trend-spark.tsx` | ✅ LIVE | Sparkline de tendencia de precio (usado dentro de `FijoRow`). |
| `confirm-fixed-payment-sheet.tsx` | ✅ LIVE (2026-05-30) | Sheet de confirmación de precio al "✓ Registrar pago" del 2do+ pago. Header con nombre del fijo + último monto pagado + chip "Cobrado con mora" cuando `wasOverdue`. Dos modos: **"Mismo · $X"** (primary, default) y **"Cambió"** (revela TextField con monto precargado). Preview inline del delta ("+$1.500 · +12%") cuando edita y difiere. CTA "Confirmar pago" → `recordPaymentMutation.mutate({ id, amountOverride? })`. El 1er pago de un commitment NO abre el sheet (path directo). Detección "1er pago" via `useExpenses` cache (no hay row con `commitment_id === id`). |
| `fijos-empty-state.tsx` | ✅ LIVE (feat/settings-dark-mode) | Empty/onboarding state para cuenta sin fijos: intro card + previews de los 3 componentes reales en modo vacío. |
| `fijos-header.tsx` | ✅ LIVE | Header de la pantalla con botón de alta. |
| `fijos-hero-card.tsx` | ✅ LIVE | Hero tipo boarding pass. Pulse de urgencia ahora **focalizado en el chip "N VENCIDOS"** (2026-05-31) — el viejo `urgencyRing` que envolvía toda la card fue removido. Soporta prop `empty` para el empty state. |
| `fijos-proximos-card.tsx` | ✅ LIVE | **2026-05-31**: rediseñada como **marquee horizontal auto-scrolling**. Tickets single-row (240pt), iOS list-cell feel, loop seamless por duplicación, animación via `useFrameCallback` en UI thread, `Gesture.Pan` para arrastre (continúa desde la nueva posición al soltar), speed 35 px/seg lineal, sin edge fades. Eyebrow "POR PAGAR · ESTE CICLO". Sub-componentes internos: `UpcomingMarquee`, `MarqueeTicket`, `UrgentHeaderDot`. Soporta prop `empty` para el empty state. |
| `fijos-scheduled-banner.tsx` | ✅ LIVE (NUEVO 2026-05-31) | Banner contextual para fijos en estado `'future'`. Vive arriba del `FijoCategoryGroups`, visible en TODAS las tabs. Renderea `null` cuando no hay future items (99% del tiempo). Card sky-muted, collapsible, hairline border + radius 12 (iOS look). Collapsed: icon `event` + "N fijos programados" + sub "Sin pagar todavía" + chevron animado (rotation 180°, ReduceMotion-aware). Expanded: lista con `catColor` dot + name + "Vence DD MMM". Reemplaza la tab "Próximos" (decisión Opt A tras análisis comparativo con Bills/Mint/YNAB/PocketGuard/Apple Wallet). |
| `fijos-tabs.tsx` | ✅ LIVE | **3 buckets, tabs DINÁMICAS (v5, 2026-06-19)**: Vencidos / Pendientes / Pagados. Cada bucket se muestra solo si tiene items (vacío = oculto; ej. sin vencidos ni pendientes → solo "Pagados"). Color rojo brand-deep para Vencidos. Auto-promote a la más urgente visible en primer paint; redirige a la primera visible si el tab activo se vacía. `visibleTabs` en `use-fijos-controller`. |

### ~~5.5 components/fijos-hero-preview/ (41 archivos)~~ — 🗑️ ELIMINADO 2026-05-22

El directorio completo fue eliminado en la limpieza del 2026-05-22 (Bucket 1 de [09](09-candidatos-a-eliminar.md)): ~5000-6000 LOC de variantes de diseño exploradas durante el refactor de Fijos (Etapas 0-10). Junto con él se eliminaron las 12 rutas dev `app/(app)/settings/dev/fijos-*`, las 12 dev screens `mobile/screens/dev/fijos-*`, `FijosV3Screen`, `adapt-controller-to-hero-state.ts` y los dos componentes huérfanos de `components/fijos/` (total ≈68 archivos del cluster).

Subcategorías de archivos en `fijos-hero-preview/`:

| Categoría | Archivos | Descripción |
|---|---|---|
| Hero variants | `manifiesto-hero-live`, `pasaje-hero-live`, `titular-hero-live` | 3 variantes de hero completo |
| Header variants | `header-a-editorial`, `header-b-stat-led`, `header-c-search`, `header-d-health-pulse`, `header-e-utility-bar` | 5 variantes de header |
| Row variants | `row-a-editorial`, `row-b-sparkline`, `row-c-stripe`, `row-d-day-marker`, `row-e-status-icon` | 5 variantes de fijo-row |
| Próximos variants | `proximos-live`, `proximos-bars-live`, `proximos-fused-live`, `proximos-hierarchy-live`, `proximos-timeline-live` | 5 variantes del card de próximos |
| SmartAlerts variants | `smart-alerts-banner-live`, `smart-alerts-editorial-live`, `smart-alerts-marquee-live`, `smart-alerts-pills-live`, `smart-alerts-stack-live` | 5 variantes de smart alerts |
| Tabs variants | `tabs-big-counts-live`, `tabs-chip-dropdown-live`, `tabs-ledger-live`, `tabs-stacked-bar-live`, `tabs-underline-live` | 5 variantes de tabs v1 |
| Tabs v2 variants | `tabs-v2-bandeja-live`, `tabs-v2-inbox-live`, `tabs-v2-smart-sort-live`, `tabs-v2-time-grouped-live`, `tabs-v2-toggle-live` | 5 variantes de tabs v2 |
| Lista completa | `full-list-live` | Vista completa orquestada (V3) — usada por `FijosV3Screen` (dead code) |
| Helpers / data | `fijo-list-sample`, `fijo-row-mini`, `hero-states`, `proximos-colors`, `smart-alerts-helpers`, `state-selector`, `tabs-helpers` | Tipos, datos mock, helpers |

### ~~5.6 components/fixed-expenses/~~ — 🗑️ ELIMINADO 2026-05-22

`fixed-expense-form.tsx` (único archivo, 0 imports) fue eliminado (Bucket 2 de [09](09-candidatos-a-eliminar.md)). Formulario legacy anterior a `AddFijoV2Screen`.

### 5.7 components/ui/ — SwipeRow (nuevo 2026-05-29)

El archivo relevante a este dominio en `components/ui/`:

| Archivo | Estado | Propósito |
|---|---|---|
| ~~`swipeable-row.tsx`~~ | 🗑️ **Eliminado 2026-05-29** | Wrapper viejo sobre `ReanimatedSwipeable` de gesture-handler. Tenía bugs visuales (corner gaps, halos en press, doble-wrap en Fijos). |
| `swipe-row.tsx` | ✅ LIVE | Reemplazo completo. Custom `Gesture.Pan` v2 + Reanimated v3 worklets en UI thread. Action panels posicionados absolutos en los bordes del outer container; en idle quedan TRASLADADOS off-screen vía `transform: translateX` (no detrás del row). Se trasladan en sync con el row — sin bg-behind, sin halos en press, sin huecos en esquinas. Gesture continuation correcta: `startX` + `startTranslation` capturados en `onStart`; `cancelAnimation` en `onBegin` (interrumpible). Spring único `SPRING_SETTLE = {damping:22, stiffness:200, mass:0.85}` simétrico abrir/cerrar. Velocidad del finger preservada en `withSpring(..., { velocity: vx })` (Apple-style). Decisión del target: si `|vx| > 600px/s` (flick) respeta dirección del finger; si no → snap-to-nearest 50%. Haptic solo en transición cerrado→abierto (`wasOpen` shared value). `activeOffsetX([-10, 10])` + `failOffsetY([-15, 15])`. API: `rightActions`, `leftActions`, `accessibilityLabel/Hint/Actions`, `onAccessibilityAction`, `borderRadius` (default 14), `isProcessing`, `processingLabel`, `actionWidth` (default 96), `onSwipeOpenHaptic`. **Sin `borderColor`**. `SwipeAction`: `{ label, tone: 'neutral'|'danger', icon, onPress }`. Aplicado en: Home actividad (`borderRadius 14`), Gastos · Movimientos (`borderRadius 14`), Fijos (`borderRadius 16`, interno en `FijoRowReal`), Notificaciones (`borderRadius 16`). |

---

## 6. Features y modelos

### 6.1 features/home/ (11 archivos)

| Archivo | Propósito |
|---|---|
| `add-expense-model.ts` | Modelo para la carga de gastos |
| `home-aggregates.model.ts` | Tipos `MonthlyComparison`, `computeMonthlyComparison`. `StreakExpense`. |
| `home-dashboard-model.ts` | Lógica de `isPaydayPending`, `daysUntilPayday`, `getPaydayCycle`, `classifyDashboardError`. |
| `home-telemetry-helpers.ts` | Helpers para formatear eventos de telemetría del Home |
| `log-home-event.ts` | Función que dispara eventos de telemetría del Home a Supabase/telemetry |
| `use-home-metrics.ts` | Agrega `HomeHeroMetrics` y `HomeMonthSummary` desde los caches. |
| `use-home-realtime.ts` | Suscripción realtime a expenses/fixed_expenses/savings_goals/notifications para invalidar caches en tiempo real |
| `use-home-snapshot.ts` | Hook principal: `useHomeSnapshot(userId)` + `fetchHomeSnapshot()` + `seedCaches()`. El corazón del patrón Snapshot RPC. |
| `use-home-telemetry.ts` | Sesión de telemetría: `sessionId`, `markTapped()`, emite `home.opened`/`home.closed`/`home.left_without_tap` |
| `use-monthly-expense-comparison.ts` | Compara gastos del ciclo actual vs anterior |
| `use-track-element.ts` | Hook para rastrear visibilidad de elementos (emite `home.element_shown`) |

### 6.2 features/fixed-expenses/ (15 archivos)

| Archivo | Propósito |
|---|---|
| `commitment-cycle-summary.ts` | Modelo de resumen del ciclo para commitments |
| `commitment-date-utils.ts` | Utilidades de fechas para commitments |
| `commitment-types.ts` | Tipos base de commitments |
| `commitment-utils.ts` | Utilidades generales de commitments (`DerivedFixedExpense`, `FixedExpenseCycleSummary`) |
| `fixed-expense-editor-model.ts` | Modelo del editor de fijo |
| `fixed-expense-payment.model.ts` | Modelo del pago de fijo (`FixedExpensePayment`, `FixedExpensePaymentRow`, `mapFixedExpensePaymentRow`) |
| `fixed-expense-payment.repository.ts` | Repositorio de pagos de fijos |
| `fixed-expense-query-keys.ts` | Query keys para React Query |
| `fixed-expense-repository.model.ts` | Mapper `asFixedExpense` |
| `fixed-expense-repository.ts` | Repositorio Supabase: CRUD de fijos |
| `fixed-expense-types.ts` | Tipos base: `FixedExpense`, `FixedExpenseFrequency`, `FixedExpenseKind` |
| ~~`fixed-expenses-screen-model.ts`~~ | 🗑️ **Eliminado 2026-06-08** — confirmado huérfano (SPRINT D cleanup) |
| ~~`use-fixed-expense-editor-form.ts`~~ | 🗑️ **Eliminado 2026-06-08** — huérfano (SPRINT D cleanup) |
| `use-fixed-expense-payments.ts` | Hook `useFixedExpensePayments` (scoped al ciclo actual) |
| `use-fixed-expenses.ts` | Hooks `useFixedExpenses`, `useCreateFixedExpense`, `useUpdateFixedExpense`, `useDeleteFixedExpense`, `useRecordFixedExpensePayment` |

### 6.3 features/fijos/ (3 archivos)

> **Limpieza 2026-05-22:** `adapt-controller-to-hero-state.ts` eliminado (solo lo usaba `FijosV3Screen`, ya eliminado).

| Archivo | Propósito |
|---|---|
| ~~`adapt-controller-to-hero-state.ts`~~ | 🗑️ **Eliminado 2026-05-22** — solo lo usaba `FijosV3Screen` |
| `fijos-aggregates.model.ts` | Tipos `FijoItem`, `FijoHikeAlert`, `FijosCycleSummary`, `summarizeFijos`. Motor de clasificación cycle-aware con 4 estados (`paid`/`pending`/`overdue`/`future`) — `computeItemStatus` v4 (2026-05-31) maneja **paid-via-coverage** (next_due_on >= cycleEnd Y last_paid_at != null → `paid`). Helpers `previousCuotaPeriodMonth` (deriva el `cuotaMonth` para paid-via-coverage), `computeAnnualCost`, `monthOfLabel`. Aggregates derivados en `FijoItem`: `annualCost`, `pctOfIncome`, `paymentsLifetime`, `totalPaidLifetime`, `arrearsOnLastPayment`, `paidPaymentId`, `cuotaMonth`. El `total` del summary excluye los `future` para que el ring del hero y "% del sueldo" reflejen solo el ciclo activo. |
| `use-fijos-controller.ts` | Controller principal: agrega datos de múltiples hooks → `UseFijosControllerResult`. Incluye tab state, filtrado, grupos por categoría, cycleLabel. |
| `use-hike-dismiss-store.ts` | Store device-local (SecureStore) para dismissal de alertas de aumento de precio. Key = `{ [fixedExpenseId]: precioAlDismiss }`. Re-surfacea si el precio cambia. |

### 6.4 features/finance/ (3 archivos)

| Archivo | Propósito |
|---|---|
| `family-finance.model.ts` | Tipos `FinanceStoragePayload`, `FamilyFinance`, `UpsertFamilyFinanceInput`. Builders: `buildFamilyFinanceInput`, `buildCycleStartingBalanceInput`, `buildSalaryConfirmationInput`. |
| `family-finance.repository.ts` | `fetchFamilyFinance`, `upsertFamilyFinance` — acceso directo a Supabase. |
| `use-family-finance.ts` | `useFamilyFinance(familyId)` (staleTime 5min), `useUpsertFamilyFinance(familyId)` con invalidación. Re-exporta helpers del modelo. |

**Lógica financiera clave** (documentada brevemente; el motor completo puede estar en un doc separado):
- `monthly_income`: ingreso configurado por ciclo.
- `savings_goal`: meta de ahorro mensual (monto absoluto) + `savings_goal_percent`.
- `current_cycle_starting_balance`: override del usuario al confirmar cobro.
- `current_cycle_anchor`: fecha YYYY-MM-DD que "ancla" el ciclo actual.
- `last_salary_confirmed_at`: timestamp del último cobro confirmado.
- Fórmula canónica del cupo: `libre = income − fijos − ahorro; cupoDiario = libre / cycleDays`.

### 6.5 features/wrapped/ (hook nuevo — 2026-05-29)

| Archivo | Propósito |
|---|---|
| `use-mark-cycle-wrapped-seen.ts` | `useMarkCycleWrappedSeen(familyId)` — `useMutation` que llama a la RPC `mark_cycle_wrapped_seen(p_summary_id)`. Update optimista sobre `controlIntelligenceQueryKey` (setea `wrapped_seen_at` en la summary cacheada) + rollback en error + `invalidateQueries` al settle. Apaga el pulse de discoverability del header de forma instantánea. |

El estado seen/no-seen persiste en `monthly_summaries.wrapped_seen_at` (ver doc 07 para el esquema de DB). El hook es el único punto de escritura de este campo desde el cliente.

---

## 7. Datos y snapshot

### 7.1 home_snapshot RPC

**Archivo**: [`mobile/features/home/use-home-snapshot.ts`](../../../mobile/features/home/use-home-snapshot.ts)

El patrón Snapshot RPC colapsa N round-trips en 1. La función `fetchHomeSnapshot()` llama `supabase.rpc('home_snapshot')` y recibe en un solo payload:

| Slice | Query key seedada |
|---|---|
| `profile` | `profileQueryKey(userId)` |
| `family` | `familyQueryKey(userId)` |
| `family_finance` | `familyFinanceQueryKey(familyId)` |
| `fixed_expenses` | `fixedExpenseQueryKeys.family(familyId)` |
| `expenses` (120 rows) | `expenseQueryKeys.list(familyId)` + `expenseQueryKeys.recent(familyId, 6)` (pre-filtradas sin commitment_id) |
| `categories_expense` | `categoriesQueryKey(familyId, 'expense')` |
| `categories_fixed_expense` | `categoriesQueryKey(familyId, 'fixed_expense')` |
| `notifications` (top-80) | `notificationQueryKeys.list(familyId, userId, 80)` |
| `unread_notification_count` | `notificationQueryKeys.unreadCount(familyId, userId)` |
| `family_members` | `familyMembersKey(familyId)` + `familyMembersDetailKey(familyId)` |
| `savings_goal` | `savingsGoalQueryKey(familyId)` |
| `fixed_expense_payments` | `fixedExpensePaymentsKey(familyId, cycleStart, cycleEnd)` |
| `has_push_subscription` | `pushSubscriptionQueryKey(familyId, userId)` |
| `monthly_summaries_history` + `category_limits` + `velocity_today` | `controlIntelligenceQueryKey(familyId)` (Control layer — migración 20260514010000) |
| `advisor_signal_dismissals` | `seedAdvisorDismissals` (in-memory store) |

**Política del cache**: `staleTime: 60_000`, `gcTime: 5min`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`.

**Bug histórico resuelto**: Las `expenseQueryKeys.recent` pre-filtran `commitment_id` dentro del `seedCaches` (no en el consumidor) para garantizar 6 gastos manuales reales en el primer paint del feed de actividad.

**Backward compatibility**: Los slices del Control layer (`monthly_summaries_history`, `category_limits`, `velocity_today`) son opcionales (`?`) en el payload type — si el RPC en un env viejo no los devuelve, el seed los skipea y los hooks consumidores hacen su fetch directo.

**Datos de rollup expuestos (2026-05-29)**: `fetchSummaries` en `use-control-v2-data.ts` selecciona ahora los campos `by_member` y `wrapped_seen_at` de `monthly_summaries`. El adapter `buildControlDataFromSnapshot` normaliza y expone en `mesPasado`:
- `categoryBreakdown: MonthlyCategoryBreakdownEntry[]` — desglose de categorías del cierre, vía `normaliseCategoryBreakdown`.
- `byMember: MonthlyByMemberEntry[]` — gasto por miembro al cierre, vía `normaliseByMember` (nuevo helper).
- `dailyTotals: number[]` — totales diarios del ciclo cerrado, vía `dailyTotalsToList`.

Estos campos están disponibles en la data del adaptador aunque la card minimal actual no los renderiza (solo pinta barras + mini-recap + CTA).

### 7.2 Prefetch y warm tabs

**Archivo**: [`mobile/hooks/use-warm-tabs-snapshots.ts`](../../../mobile/hooks/use-warm-tabs-snapshots.ts)

`useWarmTabsSnapshots()` se monta en `AppTabs` (el componente de la barra de tabs). Difiere via `InteractionManager.runAfterInteractions()` para correr después que Home pintó su primer frame.

| Prefetch | Función | Propósito |
|---|---|---|
| Gastos | `prefetchGastosSnapshot(queryClient, {...})` | Calienta el snapshot del tab Gastos con el cupoDiario calculado |
| Control | `prefetchControlIntelligence(queryClient, familyId)` | Calienta la inteligencia del asesor (monthly summaries + limits + velocity) |

Si el user toca el tab antes de que resuelvan, React Query dedupea la promise pendiente (mismo queryKey).

### 7.3 Pre-mount de tabs

`AppTabs` usa `lazy: false` para pre-mountar los 5 tab screens al app boot (~80ms extra), y `animation: 'none'` para hacer el switch de tab en 1 frame (sin slide de 220ms). Replica el comportamiento de `UITabBarController` nativo que fue observado en el A/B test de `NativeTabs`.

### 7.4 Realtime

`useHomeRealtime(familyId)` suscribe a eventos de Supabase Realtime en las tablas `expenses`, `fixed_expenses`, `savings_goals`, y `notifications`. Cuando un miembro de la familia hace un cambio, los caches del Home se invalidan automáticamente sin pull-to-refresh.

---

## 8. Estado vs deuda técnica

### Estado por screen/flujo

| Item | Estado | Notas |
|---|---|---|
| **HomeScreen** | ✅ LIVE | Full-featured. Snapshot gate, telemetría, tour, realtime, salary confirmation. |
| **HomeDashboard** | ✅ LIVE | Todas las secciones activas. `ControlV2AsesorCard` removida de Home (vive en Asistente). |
| **HomeHeroCard** | ✅ LIVE | Redesigned. ShineOverlay + aurora + particles + CountUpText + savingsChip + trend. |
| **MonthSummaryCard** | ✅ LIVE | Top categoría chip + próximo fijo chip + fallbacks. |
| **MetaCard / MetaEmptyCard** | ✅ LIVE | MetaCard con QuickAddSavings. MetaEmptyCard ("Crea tu primera meta"): dark mode usa `surfaceMuted` + `border` (rgba blanco) a 1px, alineado con ACTIVIDAD y MonthSummaryCard. |
| **HomeActivitySection** | ✅ LIVE | `ActivityRowV2` con swipe-delete vía `SwipeRow`. Bg theme-aware (`surfaceMuted`/`creamCard`). Chrome unificado con Gastos. |
| **SalaryConfirmationSheet / OnboardingAvailableSheet** | ✅ LIVE | Lazy-mounted. Dispara Wrapped post-save. |
| **ControlV2Screen** | ✅ LIVE | 8 cards + hero + DailyGoalSheet. Empty-states per-card activos (feat/settings-dark-mode). Botón Wrapped en header + CTA en VsMesCard (2026-05-29). |
| **ControlV2Hero (variante A)** | ✅ LIVE | `ControlHeroTitular` en producción via `ControlV2Hero` adapter. |
| ~~**ControlV2HoyCard**~~ | 🗑️ Eliminado 2026-05-22 | En código para rollback rápido → owner descartó. |
| ~~**ControlV2AsesorCard**~~ | 🗑️ Eliminado 2026-05-22 | Removida del layout; señales viven en Home→Asistente. |
| **FijosV2Screen** | ✅ LIVE | La screen ruteada en producción. Incluye `FijosEmptyState` cuando no hay fijos (feat/settings-dark-mode). |
| **FijosEmptyState** | ✅ LIVE (feat/settings-dark-mode) | Intro card + previews de `FijosHeroCard`, `FijosProximosCard` y `FijoRow` en modo empty. Sin datos falsos. |
| ~~**FijosV3Screen**~~ | 🗑️ Eliminado 2026-05-22 | Revertida. Cluster completo eliminado (Bucket 1 de [09](09-candidatos-a-eliminar.md)). |
| **FijosHeroCard** | ✅ LIVE | Boarding pass + PaymentSegments + CycleRouteLine. Pulse de urgencia **focalizado al chip "N VENCIDOS"** (2026-05-31) — el viejo `urgencyRing` que envolvía toda la card fue removido (era invasivo). |
| **FijosProximosCard** | ✅ LIVE | **2026-05-31 redesign completo**: marquee horizontal auto-scrolling, tickets single-row (240pt), iOS list-cell feel. `useFrameCallback` + modulo en UI thread (sin drift). `Gesture.Pan` con continuación desde la nueva posición al soltar. Speed 35 px/seg. Eyebrow "POR PAGAR · ESTE CICLO". Sub-componentes: `UpcomingMarquee`, `MarqueeTicket`, `UrgentHeaderDot`. Iteraciones descartadas: lista vertical original, versión premium con shadows/edge-fades/double-row. |
| **FijosScheduledBanner** | ✅ LIVE (NUEVO 2026-05-31) | Banner contextual sobre el listado, en todas las tabs. Renderea `null` cuando no hay future items (99%). Card sky-muted, collapsible, "N fijos programados · Sin pagar todavía". Reemplaza la tab "Próximos" (v3 → v4). |
| **FijosTabs** | ✅ LIVE | Reutiliza GastosFilterPill. **2026-05-31 v4**: **3 buckets** (Vencidos / Pendientes / Pagados). Rojo brand-deep para Vencidos. La tab "Próximos" se eliminó tras descubrir que los `future` items eran <1% del tiempo; pasaron al `FijosScheduledBanner` contextual. Historial: v1 (4 tabs todos/pend/pag/zombis) → v2 (2 tabs, 2026-05-30) → v3 (4 tabs venc/pend/pag/prox, 2026-05-30) → v4 (3 tabs, 2026-05-31) → **v5 (tabs dinámicas, solo buckets con items, 2026-06-19)**. |
| **FijoRow** | ✅ LIVE | **Layout en 2 lanes (2026-05-31)**: top (name + amount + `InlinePayButton`), bottom-strip (month chip + status badge inline). Status badge wording corto: "Vencida 11d" / "En 5d" / "Hoy" / "Pagada" / "Próxima". Month chip tintado por status accent. Tap-to-expand → panel enriquecido con **status accent** (border-top dashed + bg statsHero + accent stripe tintados). 4 estados: paid (lime), pending (schedule peach), overdue (warning rojo), future (check sky). En rows `paid`: botón "Revertir pago" en el panel que dispara `revert_fixed_expense_payment`. ConfettiBurst + TrendBadge (variant `price`/`arrears`) + `SwipeRow` interno (`borderRadius 16`). Press scales 0.98/0.96/0.96. Wrapped en `memo`. |
| **InlinePayButton** (component interno de FijoRow) | ✅ LIVE (2026-05-30, refinado 2026-05-31) | Botón circular brand-coded con ícono `attach-money`. Pending: bg `forest-deep` + ícono blanco. Overdue: bg `red brand` + **halo pulse continuo** (1.5s, scale 1→1.45, opacity 0.45→0, ReduceMotion-aware). 40pt visual + hitSlop 8 = ~56pt efectivo. Press scale 0.88. Borde 1.5pt en tono más oscuro. **2026-05-31**: removido el inner highlight blanco tras feedback "se ve plástico" — quedó flat. |
| **`computeItemStatus` v4 cycle-covered-by-prior-payment** | ✅ LIVE (2026-05-31) | Refinamiento de `fijos-aggregates.model.ts`. Antes (v3): si `next_due_on >= cycleEnd` → `future`. Ahora (v4): si `next_due_on >= cycleEnd Y last_paid_at != null` → `paid` (cuota cubierta por pago anticipado). Solo cae a `future` si **nunca** se pagó. Resuelve el caso del user (Claude AI pagado anticipado, `next_due_on` 1 día después del cycleEnd → user lo entiende como `paid`, no `future`). Helper nuevo `previousCuotaPeriodMonth(item)` deriva el `cuotaMonth` para paid-via-coverage cases (resta 1 unidad de la frecuencia al `next_due_on`). |
| **Pull-to-refresh en Fijos+Control** | ✅ LIVE (2026-05-31) | `RefreshControl` con tint brand en `FijosV2Screen` y `ControlV2Screen`, dispara `useHomeSnapshot.refetch()` que re-seedea todos los caches del cluster (no solo el de la pantalla). Cierra el gap entre realtime y "forzar update ahora". |
| **`revert_fixed_expense_payment` RPC + hook** | ✅ LIVE (2026-05-30) | `useRevertFixedExpensePayment` toma el `paidPaymentId` del FijoItem (poblado por aggregates desde `paymentsThisCycle`) y dispara la RPC. Optimistic update: filtra el payment del cache `['fixed-expense-payments', …]` para que el row vuelva a aparecer como `pending` inmediatamente. `onError` rollback restaura todos los caches snapshot. `onSettled` `syncAllAfterMutation({ scopes: ['fixedPayment'] })` reconcilia next_due_on / last_paid_at / installments_paid con los valores reales post-rollback. |
| **Snackbar "Deshacer" post-pago** | ✅ LIVE (2026-05-30) | Tras un pago exitoso (tanto 1er pago directo como sheet de confirmación), aparece `toast.success('Pago de X registrado', { actionLabel: 'Deshacer', durationMs: 5000 })`. El handler busca el payment id real más reciente para ese fixed_expense (saltando rows optimistas) y dispara revert. Si solo hay optimistic en cache (raro, refetch no terminó), muestra error sugiriendo retry. |
| **ConfirmFixedPaymentSheet** | ✅ LIVE (2026-05-30) | Sheet de confirmación de precio al 2do+ pago. Trigger: `handleMarkPaid` en FijosV2Screen detecta si es 1er pago (no hay expense con commitment_id) → directo; si es 2do+ → abre sheet. Modos: mismo monto / cambió + delta inline. Confirma vía mutation con `amountOverride`. |
| **`computeItemStatus` cycle-aware** | ✅ LIVE (2026-05-30) | Refactor de `fijos-aggregates.model.ts`. Antes: solo comparaba `next_due_on < today`. Ahora: cuatro estados según relación con `[cycleStart, cycleEnd)`. Trimestral pagado en abril (`next_due_on = julio`) ya NO aparece como pendiente en mayo/junio (queda en `future` → tab "Pagados / Próximos"). `total` del summary excluye `future` (no sobreestima el costo del ciclo). |
| ~~**FijosSmartAlerts**~~ | 🗑️ Eliminado 2026-05-22 | Reemplazado por FijosProximosCard. |
| ~~**FijosUpcomingStrip**~~ | 🗑️ Eliminado 2026-05-22 | Reemplazado por FijosProximosCard. |
| **AddFijoV2Screen** | ✅ LIVE | Create + edit. Prefill desde Asistente. |
| ~~**fijos-hero-preview/ (41 archivos)**~~ | 🗑️ Eliminado 2026-05-22 | Cluster completo eliminado (Bucket 1 de [09](09-candidatos-a-eliminar.md)). |
| ~~**control-hero-preview/ variantes B-G**~~ | 🗑️ Eliminado 2026-05-22 | Solo quedan A + helpers (LIVE). |
| **ControlV2VsMesCard** (redesign 2026-05-29) | ✅ LIVE | "CÓMO VAS ESTE MES" — minimal, comparación-first, siempre data real. 3 estados + barras GrowReveal + mini-recap + CTA Wrapped. |
| **ControlV2Header WrappedButton** (2026-05-29) | ✅ LIVE | Botón circular con halo sonar `WrappedPulse`; aparece/desaparece según `wrappedSeen`. |
| **useMarkCycleWrappedSeen** (2026-05-29) | ✅ LIVE | Hook en `features/wrapped/`; update optimista + RPC `mark_cycle_wrapped_seen`. |
| **SwipeRow** (rebuild 2026-05-29) | ✅ LIVE | `components/ui/swipe-row.tsx`. Custom Gesture.Pan v2 + Reanimated v3. Reemplaza `SwipeableRow` viejo (eliminado). Aplicado en Home actividad, Gastos, Fijos, Notificaciones. |
| **Chrome unificado cross-surface** (2026-05-29) | ✅ LIVE | `ActivityRowV2`, `GastoRow`, `FijoRow.card`, `NotificationRow.row`: solo esquinas izquierdas redondeadas. El `SwipeRow` exterior provee el contorno completo. `ActivityRowV2` bg theme-aware (`surfaceMuted` dark / `creamCard` light). |
| **home_snapshot RPC** | ✅ LIVE | 1 round-trip. Seedea ~14 caches. Control layer incluido (migración 20260514010000). |
| **useWarmTabsSnapshots** | ✅ LIVE | Prefetch de Gastos + Control post-Home-first-paint. |
| **lazy: false + animation: none** | ✅ LIVE | Pre-mount + switch instantáneo de tabs (replicando NativeTabs feel). |

### Deuda técnica identificada

| Deuda | Severidad | Notas |
|---|---|---|
| ~~Dead code de `fijos-hero-preview/`~~ | ✅ RESUELTO | 🗑️ Eliminado 2026-05-22 (Bucket 1 de [09](09-candidatos-a-eliminar.md)). |
| ~~Dead code de `FijosV3Screen` + `adaptControllerToHeroState`~~ | ✅ RESUELTO | 🗑️ Eliminados 2026-05-22. |
| ~~`fixed-expense-form.tsx` en `components/fixed-expenses/`~~ | ✅ RESUELTO | 🗑️ Eliminado 2026-05-22 (Bucket 2 de [09](09-candidatos-a-eliminar.md)). |
| ~~`FijosSmartAlerts` y `FijosUpcomingStrip`~~ | ✅ RESUELTO | 🗑️ Eliminados 2026-05-22. |
| ~~`control-v2-placeholder.tsx`~~ | ✅ RESUELTO | 🗑️ Eliminado en feat/settings-dark-mode — reemplazado por empty-states per-card en cada componente de Control. |
| Muchos archivos en `components/home/` sin verificar uso live | 🟡 BAJA | ~20 archivos con nombre de "control-*" que pueden ser de iteraciones previas del Control card in-Home. Pendiente de verificar. |
| ~~`control-v2-asesor-card.tsx` en el código pero removida del layout~~ | ✅ RESUELTO | 🗑️ Eliminado 2026-05-22. |
| ~~`swipeable-row.tsx` en `components/ui/` (viejo wrapper sobre ReanimatedSwipeable)~~ | ✅ RESUELTO | 🗑️ Eliminado 2026-05-29 — reemplazado por `swipe-row.tsx` (rebuild completo). |
