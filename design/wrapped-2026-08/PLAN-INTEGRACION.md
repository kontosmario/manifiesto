# Plan de integración — Wrapped "La Edición"

> **ESTADO 2026-08-13: V1 EJECUTADO de punta a punta** (F0–F5 + gate + preview + docs) con las
> opciones recomendadas de §6 — orden directa del owner, mismo precedente que Control/Jardín.
> Verificado: tsc ✓ · ESLint ✓ · vitest 58/58 ✓ · guards i18n ✓ · `expo export --platform ios` ✓.
> Nota: `guard:motion-tokens` rebota 15 violaciones PREEXISTENTES del branch (signup-screen ya
> viola en HEAD con baseline 0) — ninguna del wrapped. Pendiente: QA visual del owner en device
> (gate `'wrapped'` en `redesign-approval-status.ts`) · V1.5 (pantalla 04 + migración) · V2
> (compartir, trigger día-1). Desvío sobre §6.10: se implementó SIN auto-avance (la regla 2 del
> handoff le ganó al híbrido, que estaba ⚠ sin dato).
>
> **AJUSTES DEL OWNER 2026-08-13 (post-integración):** (1) el wrapped SIGUE EL TEMA DEL SISTEMA
> — revierte la recomendación §6.6 de nocturno canónico; el flujo claro (3a) entró como
> `WRAPPED_SPECS.light` rebasado al material del sistema ([OWNER-7] del spec: tres tintas del
> handoff sustituidas por `neoInk`/`textMuted` por contraste, CTA = radial del sistema). (2)
> Navegación POR BOTÓN: CTA primario en el footer de todas las páginas; tap lateral y
> swipe-down quedan de atajos.

> Handoff: `design/wrapped-2026-08/` (`README.md`, `Wrapped Manifiesto.dc.html`, `brot.js`, `particles.js`, `brot/logo-{light,dark}.png`).
> Estado actual documentado en [docs/sistemas/cycle-wrapped.md](../../docs/sistemas/cycle-wrapped.md) (sello de sync 2026-06-08, con 10 afirmaciones desalineadas — ver §8).
> Rama de trabajo: `feat/ui-redesign`. Todos los links son a rutas del repo; los `:NN` son líneas verificadas al momento de escribir este plan.

---

## 0. Proceso canónico de handoffs — dónde encaja este

Es el **sexto** handoff que entra por el mismo camino (`rediseno-2026-07`, `home-final-2026-07`, `gastos-2026-08-v2`, `fijos-2026-07`, `jardin-2026-08`). El proceso no se reinventa:

1. **Bundle a `design/`** — hecho: el handoff vive en `design/wrapped-2026-08/`, junto a los otros cinco. Se sirve con el server `design-8777` (config local de dev, no versionada) para comparar contra la réplica.
2. **Spec literal** — `wrapped-spec.ts` es una **transcripción**, no una interpretación: valores del `.dc.html` con la línea del HTML como ancla, gradientes como string CSS para `cssGradient()`, sombras como `boxShadow` literal. No se "mejoran" valores.
3. **Lo que el sistema ya define NO se duplica** — se lee de [`@/theme/neo-tokens`](../../mobile/theme/neo-tokens.ts). Precedente escrito en [jardin-spec.ts:20-33](../../mobile/components/redesign/jardin/jardin-spec.ts).
4. **Desvíos etiquetados `[OWNER-N]`** con motivo, en el encabezado del spec. Ninguno cosmético. Ver [jardin-spec.ts:35-70](../../mobile/components/redesign/jardin/jardin-spec.ts) como modelo — el §6 de este plan es la lista de candidatos a `[OWNER-N]` de este handoff.
5. **Réplica en Settings→Dev + gate del owner** — entrada `'wrapped'` en [redesign-approval-status.ts](../../mobile/screens/dev/redesign/redesign-approval-status.ts) arrancando en `'pendiente'`. El flip a `'aprobada'` lo hace el owner mirando en device (regla del repo: el preview web no rinde Skia ni gradientes, y en Apple Silicon no hay simulador).
6. **Cableado recién después**, componiendo los sub-componentes exportados del kit.

**Punto de partida ya verificado:** `brot.js`, `particles.js` y `support.js` de este bundle son **byte-idénticos** a los de `design/jardin-2026-08/` — el runtime de Brot ya fue portado una vez y su cobertura de poses aplica directo (§3.3).

**Y la paleta ya es, casi entera, la del sistema.** De los 21 hexes del handoff, 14 están declarados en [neo-tokens.ts](../../mobile/theme/neo-tokens.ts) / [neo-ink.ts](../../mobile/theme/neo-ink.ts) y otros 4 en [jardin-spec.ts](../../mobile/components/redesign/jardin/jardin-spec.ts). **Sólo 3 son nuevos en todo el repo:** `#14301E` y `#1C3325` (stops del gradiente nocturno y del card raised) y `#D9DCC8` (ranking #2–3).

⚠️ **El desvío de color que hay que decidir explícitamente:** el fondo que pide el handoff (`#1E3F2A → #14301E → #0F1E14`, 165°) **no es** el hero del sistema (`#234931 → #1B3A26 → #16301F`, 150°, [neo-tokens.ts:232-233](../../mobile/theme/neo-tokens.ts)). Es un gradiente propio. Dado el antecedente del owner rechazando colores fuera del design system, esto va como `[OWNER-N]` argumentado —el wrapped es una superficie de marca, no una tab— o se rebasa al hero del sistema. No se absorbe en silencio.

---

## 1. Qué trae el rediseño

Delta real contra lo que corre hoy en producción.

| Eje | Hoy (prod, desde 2026-05-12) | Handoff "La Edición" | Naturaleza del cambio |
|---|---|---|---|
| Pantallas | 5 máx / 3 mín, condicionales (`topCategory`, `topExpense`) | 7 (6 en veredicto JUSTO) | Reescritura de composición |
| Estética | Crema editorial, sigue el tema del sistema (5 tonos en [wrapped-constants.ts:89](../../mobile/components/wrapped/wrapped-constants.ts)) | Nocturno forest `#1E3F2A→#14301E→#0F1E14` **canónico en ambos temas** | Nuevo spec de tokens |
| Navegación | Auto-advance 4500 ms + tap 33/67 + long-press pausa | **Sin auto-advance**; tap 50/50 + swipe-down para cerrar | Se borra el driver; se agrega gesto |
| CTA | Solo en la última escena | CTA propio en 01, 05, 06 y 07 | Cambia el contrato de `Scene` |
| Portada | Título display | **Sello circular** 206/162 + logo + chip de rango | Primitiva nueva |
| Números | Escena de veredicto con 1 monto | Fila editorial ×3 con divisor de 2 px | Primitiva nueva |
| Top | 1 categoría con barra de participación | **Ranking de 3** con rank fantasma + strip de fijos | Datos nuevos + primitiva nueva |
| Jardín | No existe | Aro 130/10 + card "Semana a semana" + chip de racha | **Pantalla nueva, bloqueada por datos** |
| Veredicto | `>0 / <0 / =0` | `>$10.000 MARGEN / <0 EXCEDIDO / 0..$10.000 JUSTO` + **estampa rotada** con haptic | Umbral + animación nuevos |
| Paso del sobrante | Sección dentro del cierre, solo rama MARGEN | Pantalla completa con **dos ramas** (destino / plan de recuperación) | Feature nueva (rama EXCEDIDO) |
| Cierre | Escena de cierre con decisión inline | **Contratapa** con estantería de 3 ediciones + saldo acumulado | Primitiva nueva + semántica a definir |
| Compartir | No existe | Sheet + toggle privacidad + tarjeta 9:16 export 1080×1920 + 4 destinos | **Greenfield, deps nativas** |
| Entrada | Post-confirmar-cobro / auto-fire dinámico | Día 1 del ciclo nuevo, badge + push | Cambia la orquestación entera |
| Marca de "visto" | `monthly_summaries.wrapped_seen_at` | Igual | Sirve, pero **está roto en el path fixed** (§8) |

**Lectura corta:** no es un reskin. Cambian simultáneamente *cuándo aparece*, *cómo se navega*, *qué decide* y *qué datos consume*. Lo único que sobrevive intacto es el plumbing (emitter, bridge, payload builder, RPC de decisión).

---

## 2. Veredicto de integración

**Recomendación: evolución incremental sobre el módulo existente, con swap total del orquestador y de las escenas.** Es decir: se conserva y se extiende la capa de datos/disparo; se tira y se rehace la capa de presentación.

### Por qué no swap total

Un swap completo (módulo nuevo `wrapped-v2/` paralelo) obligaría a reimplementar:

- el retry ×5 contra `monthly_summaries` recién cerrado ([use-month-close-orchestration.ts:266-278](../../mobile/features/home/use-month-close-orchestration.ts)),
- la query fresca de `month_close_decisions` ([use-launch-cycle-wrapped.ts:46-105](../../mobile/features/wrapped/use-launch-cycle-wrapped.ts)),
- el mark-seen optimista ([use-mark-cycle-wrapped-seen.ts](../../mobile/features/wrapped/use-mark-cycle-wrapped-seen.ts)),
- el guard de re-fire ([cycle-wrapped-bridge.tsx:32-52](../../mobile/components/bridges/cycle-wrapped-bridge.tsx)),
- y los 370 LOC de tests de [build-wrapped-payload.test.ts](../../tests/unit/build-wrapped-payload.test.ts).

Son ~600 LOC de trabajo sucio ya pagado que el handoff **no invalida**: el disparo cambia de momento, no de mecánica.

### Por qué no evolución pura de las escenas

Las 5 escenas actuales no sobreviven 1:1 ninguna. El orquestador ([cycle-wrapped-modal.tsx](../../mobile/components/wrapped/cycle-wrapped-modal.tsx), 638 LOC) es en su mayoría el driver de auto-advance que el handoff elimina, más un crossfade de fondo con `interpolateColor` que deja de aplicar (el fondo pasa a ser un gradiente único para las 7 pantallas). Intentar "parchear" ese archivo deja código muerto entrelazado con lógica viva.

### Costo comparado

| Camino | Costo | Riesgo |
|---|---|---|
| Swap total (módulo paralelo) | +600 LOC de plumbing reescrito + re-testear disparos en 6 superficies | Alto: se duplica lógica de disparo en 6 call sites y se pierden los tests existentes |
| **Incremental (recomendado)** | Reescribir orquestador + 7 escenas + ~15 primitivas; conservar datos/disparo | Medio: hay que arreglar 4 bugs de la carcasa antes de portar (§8) |
| Solo cosmético sobre 5 escenas | Bajo | No entrega el producto: quedan fuera jardín, top 3, contratapa, plan de recuperación |

### Corte de alcance recomendado

- **V1 (sin migraciones, sin build nativo):** 6 pantallas — 01, 02, 03, 05, 06, 07. Nocturno único. Trigger sin tocar. Sin compartir. La barra y el marcador salen de `scenes.length`.
- **V1.5 (una migración):** pantalla 04 (jardín) + `edition_number` congelado + denominador de fijos → el flujo llega a 7.
- **V2:** compartir 9:16 completo, "ajustar el nuevo ciclo" persistible, trigger día-1 con push y badge como entrada canónica.

---

## 3. Inventario de reuso

### 3.1 Shell y orquestación

| Pieza | Veredicto | Ancla |
|---|---|---|
| Emitter + payload type | **REUSAR** (ensanchar tipo) | [mobile/lib/cycle-wrapped-emitter.ts](../../mobile/lib/cycle-wrapped-emitter.ts) |
| Bridge / host de overlay | **REUSAR** (mover de posición, §8) | [mobile/components/bridges/cycle-wrapped-bridge.tsx](../../mobile/components/bridges/cycle-wrapped-bridge.tsx) |
| Orquestador / modal | **REESCRIBIR** | [mobile/components/wrapped/cycle-wrapped-modal.tsx](../../mobile/components/wrapped/cycle-wrapped-modal.tsx) |
| `transitionToScene` (mutación síncrona pre-`setState`) | **CONSERVAR el patrón** | [cycle-wrapped-modal.tsx:202-224](../../mobile/components/wrapped/cycle-wrapped-modal.tsx) |
| Efecto de reset de sesión (deps acotadas a propósito) | **CONSERVAR literal** | [cycle-wrapped-modal.tsx:152-175](../../mobile/components/wrapped/cycle-wrapped-modal.tsx) |
| Composición de escenas | **ADAPTAR** | [mobile/components/wrapped/build-scenes.ts](../../mobile/components/wrapped/build-scenes.ts) |
| Barra de progreso | **ADAPTAR** (`width:'%'` → `scaleX`, fill de 200 ms) | [scenes/progress-segment.tsx:22-29](../../mobile/components/wrapped/scenes/progress-segment.tsx) |
| Auto-advance (`SCENE_DURATION_MS`, `isPaused`, long-press) | **DESCARTAR** | [wrapped-constants.ts:12](../../mobile/components/wrapped/wrapped-constants.ts), [cycle-wrapped-modal.tsx:239-328](../../mobile/components/wrapped/cycle-wrapped-modal.tsx) |
| `wrappedPalette()` (5 tonos por tema) | **DESCARTAR** → `wrapped-spec.ts` | [wrapped-constants.ts:89-165](../../mobile/components/wrapped/wrapped-constants.ts) |
| Swipe-down (receta) | **CREAR** copiando | [mobile/components/ui/modal-card.tsx:254-280](../../mobile/components/ui/modal-card.tsx) |

### 3.2 Tokens y material

| Pieza | Veredicto | Ancla |
|---|---|---|
| Sombras raised/inset (11 recetas × 2 temas, `boxShadow` string) | **REUSAR** | [mobile/theme/neo-tokens.ts:143-169](../../mobile/theme/neo-tokens.ts) |
| `cssGradient()` (único seam de `experimental_backgroundImage`) | **REUSAR** | [neo-tokens.ts:25-27](../../mobile/theme/neo-tokens.ts) |
| 4 tiles pastel del paso 06 (`#EDE6D4`/`#E6E0F4`/`#D4EBDF`/`#F7E3CF`) | **REUSAR tal cual** — son `neoCategoryPastels.ropa/.ocio/.mascotas/.comida` | [neo-tokens.ts:316-328](../../mobile/theme/neo-tokens.ts) |
| Estampa MARGEN/EXCEDIDO/JUSTO (`#A4E3A6`/`#F2A87E`/`#F1EEDD`) | **REUSAR** — `darkNeo.green/warm/text` | [neo-tokens.ts:223,227,229](../../mobile/theme/neo-tokens.ts) |
| Partículas nocturnas (3 hexes exactos) | **REUSAR** — `neoParticlePresets.celebrationDark` | [neo-tokens.ts:400](../../mobile/theme/neo-tokens.ts) |
| Nunito 400/500/600/700/800/900 | **REUSAR** (cobertura 100 %) | [app/_layout.tsx:13-20](../../app/_layout.tsx), [mobile/theme/typography.ts:12-21](../../mobile/theme/typography.ts) |
| Patrón "spec por modo + primitivas con `spec` como prop" | **REUSAR patrón** | [mobile/components/redesign/control/control-spec.ts:221](../../mobile/components/redesign/control/control-spec.ts) |
| Ancla nocturna con constante de módulo | **REUSAR patrón** (argumento idéntico ya escrito) | [mobile/components/garden/floracion-view.tsx:43-52](../../mobile/components/garden/floracion-view.tsx) |
| ~9 tokens propios (gradiente 165°, pozo translúcido, divisor editorial, rank fantasma, ink de leyenda `#8A6A42`, CTA crema, glows) | **CREAR** en `wrapped-spec.ts` | — |

### 3.3 Componentes

| Pieza | Veredicto | Ancla |
|---|---|---|
| `BrotMascot` — 11/11 poses del handoff | **REUSAR** (pasar `animated={idx===activo}`) | [mobile/components/brot/brot-mascot.tsx:79-102](../../mobile/components/brot/brot-mascot.tsx) |
| `BrotParticles` — física 1:1 con `particles.js` | **REUSAR** (`count` por prop) | [mobile/components/brot/brot-particles.tsx](../../mobile/components/brot/brot-particles.tsx) |
| Aro 130/10 (`r=59`, `C=370.71`, rotate −90, linecap round) | **PARAMETRIZAR** (falta prop `sweepMs`, hoy `SWEEP_MS=600`) | [redesign/jardin/parts/growth-ring.tsx:36,170,214](../../mobile/components/redesign/jardin/parts/growth-ring.tsx) |
| `ringGeometry(size, stroke)` | **REUSAR** + mover a módulo puro | [redesign/jardin/jardin-spec.ts:1063-1066](../../mobile/components/redesign/jardin/jardin-spec.ts) |
| Tokens del jardín (`ringGreen`, `ringTrack`, `ringWellBackground`, `WELL_FOCUS_D`, `INS_CHIP_D`, `historyDotMissed`) | **REUSAR** — coinciden byte a byte | [jardin-spec.ts:174,182,767,769,770,871](../../mobile/components/redesign/jardin/jardin-spec.ts) |
| Card "Semana a semana" (dots 13 px) | **CREAR / EXTRAER** (patrón inline, con otro tamaño) | [redesign/jardin/jardin-screen.tsx:985-995](../../mobile/components/redesign/jardin/jardin-screen.tsx) |
| Halo pulsante 3 s del `radiant` | **REUSAR** `HeroHalo` | [jardin-screen.tsx:413-447](../../mobile/components/redesign/jardin/jardin-screen.tsx) |
| Glow proyectado (Android necesita `elevation`) | **REUSAR patrón** | [jardin-screen.tsx:598-608](../../mobile/components/redesign/jardin/jardin-screen.tsx) |
| Option card pozo→raised con crossfade de 2 capas | **ADAPTAR** (agregar `borderWidth:2, borderColor:'transparent'` en reposo) | [scenes/leftover-option-card.tsx:67-142](../../mobile/components/wrapped/scenes/leftover-option-card.tsx) |
| Aplicación de la decisión (input, confetti post-`await`, error al caller) | **REUSAR** | [scenes/cycle-wrapped-cta.tsx:120-181](../../mobile/components/wrapped/scenes/cycle-wrapped-cta.tsx) |
| `CountUpText` | **PARAMETRIZAR** (falta `unit` con signo, §8) | [home/animated/count-up-text.tsx:67-88](../../mobile/components/home/animated/count-up-text.tsx) |
| `ConfettiBurst` (ya acepta `colors`) | **REUSAR** para el burst de la estampa | [ui/confetti-burst.tsx:106](../../mobile/components/ui/confetti-burst.tsx) |
| Logo del sello / estantería / footer | **REUSAR** `FernLogo` (no copiar los PNG) | [components/auth/fern-logo.tsx:91-97](../../mobile/components/auth/fern-logo.tsx) |
| `SUPPORTS_INSET_SHADOW` (obligatorio en pozos nuevos) | **REUSAR** | [components/wizard/inset-shadow-support.ts:16-18](../../mobile/components/wizard/inset-shadow-support.ts) |
| `usePressScale`, `triggerHaptic('medium')` | **REUSAR** | [hooks/use-press-scale.ts](../../mobile/hooks/use-press-scale.ts), [lib/haptics.ts:27-29](../../mobile/lib/haptics.ts) |
| `WrTag`, `WrChip`, `WrSeal`, `WrBubble`, `WrStamp`, `WrCta`, `WrStatRow`, `WrRankItem`, estantería, mini-cards | **CREAR** (`wrapped-primitives.tsx`) | — |
| `ShareCard({ data, variant, scale })` | **CREAR** (parametrizada por escala, nunca por `Dimensions`) | — |
| Escena `top-expense` + `formatLongDate` | **DESCARTAR** | [scenes/top-expense-scene.tsx](../../mobile/components/wrapped/scenes/top-expense-scene.tsx) |
| Marco 393×830, status bar falsa del mockup | **DESCARTAR** (es chrome de maqueta) | — |

### 3.4 Componentes compartidos que resuelven el tema por dentro

Con el wrapped anclado a nocturno, estos devuelven material claro y necesitan prop `mode`/`spec` o un fork:

[NeoSurface:46](../../mobile/components/ui/neo-surface.tsx) · [NeoButton:16](../../mobile/components/ui/neo-button.tsx) · [SegmentedControl:47](../../mobile/components/ui/segmented-control.tsx) · [ModalGrabHandle:21](../../mobile/components/ui/modal-grab-handle.tsx) · [NeoSkeleton:27](../../mobile/components/ui/neo-skeleton.tsx) · `ModalCard`. `ConfettiBurst` ya está mitigado (acepta `colors`).

Seguros (no leen el tema): `GrowthRing`, `BrotMascot`, `BrotParticles`, `CountUpText`, `usePressScale`, `FernLogo`.

---

## 4. Brechas de datos

### 4.0 Corrección de premisa — no se puede leer `expenses`

`cron_purge_archived_expenses()` hace **hard delete** de los gastos variables archivados a los 14 días ([20260512050000_purge_archived_expenses.sql:21-26](../../supabase/migrations/20260512050000_purge_archived_expenses.sql), redefinida en [20260620210000:43-50](../../supabase/migrations/20260620210000_fixed_payment_expenses_retention.sql)), y los pagos de fijos quedan reducidos a los últimos 3 por fijo (`:76-88`). **Ningún ciclo cerrado hace más de 14 días es reconstruible desde `expenses`.** Cualquier derivación que lea esa tabla degrada en silencio: la 04 mostraría "30 de 30" el día 1 y "0 de 30" el día 15 para la misma edición.

Las tres fuentes que sí sobreviven para siempre y, unidas, cubren la definición de "día plantado" del jardín:

- `monthly_summaries.daily_totals` (jsonb congelado al cierre) → días con gasto variable,
- `streak_marked_days` → días marcados sin gastos (ningún cron la purga),
- `fixed_expense_payments` → días con pago de fijo (ledger nunca purgado por cron).

### 4.1 Derivable en cliente (sin migración)

| Dato | Pantalla | Cómo se resuelve | Ancla |
|---|---|---|---|
| Top 3 categorías | 03 | Ampliar `pickTopCategory` a `pickTopCategories(3)`; el array del server ya viene ordenado desc | [build-wrapped-payload.ts:152-200](../../mobile/features/wrapped/build-wrapped-payload.ts) |
| % de participación | 03, tarjeta | **Recalcular en cliente** `amount / totalSpent`. El `pct` del server usa `total_variable_spent` como base y lo consume Control: no tocarlo | — |
| `fixed_paid_count`, `total_fixed_spent`, `nominal_period_end` | 03 | Agregarlos a los 3 selects + al tipo. **Ya vienen en `home_snapshot`** y siembran la cache → hoy la línea de fijos renderizaría en cold start y desaparecería tras el refetch | [use-monthly-editions.ts:35](../../mobile/features/wrapped/use-monthly-editions.ts), [use-control-v2-data.ts:794](../../mobile/features/insights/use-control-v2-data.ts), [use-month-close-orchestration.ts:271](../../mobile/features/home/use-month-close-orchestration.ts), [control-v2-adapter.ts:64-96](../../mobile/features/insights/control-v2-adapter.ts) |
| Meta activa con montos | 06 | Ensanchar `activeGoal` a `{id,title,emoji,currentAmount,goalAmount}`; los campos ya vienen del repo de metas | [cycle-wrapped-emitter.ts:79](../../mobile/lib/cycle-wrapped-emitter.ts), [savings-goals/savings-goal.model.ts:60-61](../../mobile/features/savings-goals/savings-goal.model.ts) |
| Reserva disponible | 06 EXCEDIDO | Pasar `monthly_reserve_amount` al payload (ya se lee) | [finance/family-finance.model.ts:97](../../mobile/features/finance/family-finance.model.ts), [use-home-metrics.ts:418-420](../../mobile/features/home/use-home-metrics.ts) |
| Cupo diario nuevo/viejo | 06 EXCEDIDO | `useHomeMetrics().dailyBudget` | [use-home-metrics.ts:383](../../mobile/features/home/use-home-metrics.ts) |
| Comparación vs ciclo previo | 05 | `summaries[1]` del array que ya se lee. **No** usar `delta_vs_previous_percent` (es % de gasto variable y exige que los ciclos encadenen) | [use-control-v2-data.ts:792-798](../../mobile/features/insights/use-control-v2-data.ts) |
| Rango del ciclo siempre visible | 01, tarjeta | Quitar el early-return de `buildPeriodRange` (hoy devuelve `null` en ciclos calendario) + formateador de meses en palabra | [build-wrapped-payload.ts:134](../../mobile/features/wrapped/build-wrapped-payload.ts) |
| Estantería (3 ediciones) | 07 | `useMonthlyEditions` ya trae 12 | [use-monthly-editions.ts:29-42](../../mobile/features/wrapped/use-monthly-editions.ts) |
| Decisión tomada (chip) | 07 | Extraer el enriquecimiento de `useLaunchCycleWrapped` a helper y llamarlo también desde Ediciones | [use-launch-cycle-wrapped.ts:46-105](../../mobile/features/wrapped/use-launch-cycle-wrapped.ts), [editions-screen.tsx:103-112](../../mobile/screens/settings/editions-screen.tsx) |
| Logros del ciclo | — | Pasar los `earned_at` reales; hoy `achievementsEarnedAt: []` en los 3 call sites → el chip nunca aparece | [use-achievements.ts:70-73](../../mobile/features/achievements/use-achievements.ts) |
| Jardín: días plantados, grilla, dot celeste, mejor racha del ciclo | 04 | 2 queries nuevas (`streak_marked_days` por rango, `fixed_expense_payments.paid_at` por rango con join `fixed_expenses!inner(family_id)`) unidas a `keys(daily_totals)` | [fixed-expense-payment.repository.ts:25-30](../../mobile/features/fixed-expenses/fixed-expense-payment.repository.ts), [use-subscription-audit-feed.ts:112-114](../../mobile/features/subscriptions-zombie/use-subscription-audit-feed.ts) |

**Dos imprecisiones asumidas y documentadas en la derivación del jardín:** `daily_totals` bucketea en tz `America/Argentina/Buenos_Aires` hardcodeada mientras el jardín corta el día en tz del device ([garden-model.ts:100-112](../../mobile/features/garden/garden-model.ts)) → exacto para AR, ±1 día fuera de AR; y el rollup no filtra `created_by is null`, que el jardín sí excluye (`garden-model.ts:114-128`).

### 4.2 Necesita migración

| Dato | Columna propuesta | Backfill | Nota crítica |
|---|---|---|---|
| Número de edición ("Nº 3") | `edition_number int` = `count(period_start < v_start) + 1` | Exacto (`row_number() over (partition by family_id order by period_start)`) | **NO incluirla en el `on conflict do update set`** o un re-cierre con `p_force` recorre un ordinal ya visto (y compartido) |
| Denominador de fijos ("de 16") | `fixed_total_count int` = fijos `status='active'` al cierre | **Imposible** → `NULL` + copy degradado sin denominador | Contar los activos de hoy miente retroactivamente |
| Racha récord al cierre | `longest_streak_at_close int` (+ `streak_at_close int`) | **Imposible** (`family_streaks` no guarda historia) → `NULL` + ocultar el badge ✦ | Es lo único del jardín no derivable |
| Coherencia conteo↔monto de fijos | Bucketear `fixed_paid_count` por `paid_at`, no por `period_month` | Recalculable | Con payday 20, un fijo pagado el 25 aporta monto a un ciclo y conteo al anterior |
| "64 MOV" con fijos *(si se decide)* | `movements_count int` | Exacto y trivial | Hoy `expenses_count` excluye fijos y `total_spent` los incluye |
| Deep-link del push del día 1 | Metadata con `monthly_summary_id` + ruta nueva | — | Hoy la ruta es `/(app)/(tabs)/control` y el body **spoilea** el veredicto |
| Plan de recuperación persistible | Relajar **dos** CHECK: `sobrante >= 0` y `decision in (...)` | — | Esfuerzo L. Recomendado fuera del V1 |

Regla de proceso ineludible: **no aplicar migraciones a prod por MCP** (re-estampa el timestamp y desalinea el ledger). Van por archivo + `supabase db push`. Y toda redefinición de `close_monthly_cycle` **debe partir del cuerpo vivo en producción**, no del archivo del repo, o se regresa el fix de tz de `daily_totals` — está escrito en [20260813120100_close_monthly_cycle_dual_mode.sql:23-27](../../supabase/migrations/20260813120100_close_monthly_cycle_dual_mode.sql).

---

## 5. Brechas de plataforma

### 5.1 Compartir / export — el ítem más caro y el único con riesgo de crash

Dependencias verificadas en `package.json`: `react-native-view-shot`, `expo-sharing`, `expo-media-library` y `react-native-share` **no están**. `expo-share-intent` es share **entrante**. `expo-file-system` existe en `node_modules` pero **no está declarado** (llega transitivo de `expo`): si se usa, hay que declararlo.

Dos caminos, ambos con trampas verificadas en la fuente de las libs:

- **`makeImageFromView` de Skia — roto en esta configuración.** En iOS el servicio se construye contra el `RCTUIManager` de Paper y hace `RCTFatal` si el tag no existe; la app corre con `newArchEnabled: true` ([app.config.ts:30](../../app.config.ts)) → aborta la app, no devuelve error manejable.
- **Capturadores genéricos (`view.draw()`) — Brot y partículas salen en negro en Android**, porque Skia monta un `SkiaTextureView` y `View.draw(canvas)` no dibuja el contenido de un `TextureView`. Además el walker de vistas ignora el mapeo de zIndex → la composición del PNG puede diferir de lo que se ve en pantalla.

**Salida recomendada:** la tarjeta 9:16 se dibuja como escena Skia aparte (`Skia.PictureRecorder` + `makeImageSnapshot`), reusando la geometría pura de [brot-geometry.ts](../../mobile/components/brot/brot-geometry.ts) y el `_draw` de [brot-particles.tsx:234-275](../../mobile/components/brot/brot-particles.tsx), que ya es un worklet portable. Alternativa barata para una primera versión: exportar la tarjeta **sin Brot ni partículas** (tipografía + sello + aro SVG), donde un capturador de vistas alcanza.

Destinos: **Copiar** se puede shippear sin nada nuevo (`expo-clipboard` ya está y expone `setImageAsync`). **WhatsApp** y **Guardar** requieren `expo-sharing` (la hoja del sistema ya ofrece "Guardar imagen" en iOS). **No agregar `expo-media-library`** en V1: mete `NSPhotoLibraryAddUsageDescription` + `READ_MEDIA_IMAGES` y contradice la política de permisos mínimos documentada en [app.config.ts:99-115,307-320,322-333](../../app.config.ts). **Stories** es el más caro (`react-native-share` + `LSApplicationQueriesSchemes` + Facebook App ID).

### 5.2 Push de entrada

**Ya existe y funciona.** El cron `close-previous-cycles` cierra el ciclo a las 00:00 AR de todas las familias sin intervención del usuario, y el trigger `notify_cycle_closed` emite el push por miembro ([20260625145637_notifications_settings_alignment.sql:162-234](../../supabase/migrations/20260625145637_notifications_settings_alignment.sql)). Falta:

- reescribir el copy (hoy dice "Te sobró $X · Comida fue tu top" → **spoilea** la edición),
- agregar `monthly_summary_id` a la metadata,
- **unificar `route` vs `url`**: el cliente lee `data?.url` ([notification-router-bridge.tsx:91,97](../../mobile/components/root/notification-router-bridge.tsx)) y el relay manda `metadata` crudo, que trae la clave `route` → hoy todo push cae a Home,
- sumar la ruta de destino a `SAFE_PUSH_ROUTES` ([mobile/utils/routes.ts:13-23](../../mobile/utils/routes.ts)),
- crear una entrada navegable (pantalla flaca que hidrata el payload y llama `triggerCycleWrapped`), **sin** convertir el wrapped en ruta con `freezeOnBlur` heredado (§8).

### 5.3 Haptics

**Cero trabajo.** `triggerHaptic('medium')` —el único haptic publicado en el handoff— ya existe en [mobile/lib/haptics.ts:27-29](../../mobile/lib/haptics.ts) y el wrapped actual ya lo consume. Sin preferencia de usuario "hápticos on/off" en el repo: gatear por `useReducedMotion` del repo. ⚠ sin verificar: si el owner quiere un haptic de `warning` para EXCEDIDO — el handoff no lo define.

### 5.4 Rebuild nativo

| Alcance | ¿Rebuild? |
|---|---|
| V1 (6 pantallas, nocturno, sin compartir) | **No.** Sale por OTA |
| V1.5 (migración + pantalla 04) | **No** (es SQL + cliente) |
| V2 compartir con `expo-sharing` / view-shot | **Sí** — `runtimeVersion: {policy:'sdkVersion'}` ([app.config.ts:39](../../app.config.ts)) implica que ningún módulo nativo nuevo sale por OTA. Bump de `buildNumber` + TestFlight |
| V2 compartir vía Skia offscreen puro | **No** para capturar, pero exige redibujar la tarjeta (incluido el texto) en primitivas Skia |

---

## 6. Decisiones de producto pendientes

1. **¿El wrapped se auto-abre o espera un tap?** — Si pasa a badge-only, el `MonthCloseDecisionSheet` standalone gana siempre la carrera ([use-month-close-orchestration.ts:127-183](../../mobile/features/home/use-month-close-orchestration.ts)) y el paso 6 nunca se ve en modo pending. **Recomendación:** en V1 no tocar el trigger; auto-abrir como hoy y sumar el badge de "sin ver" en Control. Diferir el trigger día-1 a V2, junto con la decisión de qué pasa con el sheet standalone.
2. **¿Qué pasa con la confirmación de cobro si la edición llega antes?** — **Recomendación:** que la contratapa termine en un CTA "Confirmar mi cobro" que abra la `SalaryConfirmationSheet`. Mantiene el hábito y le da destino real a la 07.
3. **Umbral JUSTO: $10.000 fijo o relativo.** — **Recomendación: relativo con piso**, `max($1.000, 0,5 % del ingreso del ciclo)`. Un nominal se desactualiza con la inflación y no puede corregirse sin release. **Debe ser el mismo número que gatea "¿hay decisión?"** — hoy `SOBRANTE_THRESHOLD = 1000` ([sobrante.ts:24](../../mobile/features/month-close/sobrante.ts)) más el literal `1000` duplicado en [use-launch-cycle-wrapped.ts:92](../../mobile/features/wrapped/use-launch-cycle-wrapped.ts) y [use-month-close-orchestration.ts:342](../../mobile/features/home/use-month-close-orchestration.ts).
4. **En JUSTO, ¿se ejecuta el `acumular` automático?** — Mover plata sin confirmación explícita es algo que la app nunca hace, y el RPC es owner-only y rate-limited → falla en silencio para miembros. **Recomendación: no ejecutar nada; persistir `decision='skip'`** (valor ya aceptado por el CHECK) para que el sheet standalone no vuelva a preguntar.
5. **Alcance del plan de recuperación (EXCEDIDO).** — De las 3 opciones: "cubrir con la reserva" tiene RPC listo **pero el copy miente** (no salda nada: inyecta la reserva al presupuesto del ciclo nuevo, los únicos targets son `'cycle'` y `'meta'`); "ajustar el nuevo ciclo" —la default del mockup— **no tiene RPC** y colisiona con la confirmación de cobro sobre el mismo campo; "revisar el top 3" es un producto nuevo (`category_limits` solo se lee, no hay una sola escritura en la app). **Recomendación V1:** reserva con copy reescrito + top 3 como navegación sin persistencia.
6. **¿Nocturno siempre o seguir el tema del sistema?** — **Recomendación: nocturno canónico.** Reduce a la mitad el trabajo de tokens, elimina los tres gaps de "estados sin versión clara" del handoff, y evita reintroducir dos hexes que el repo rechazó con el cálculo de contraste escrito en el código (`#6C7B67` como texto secundario y `#63B168` como foco del CTA claro, [neo-tokens.ts:99-113,199-205](../../mobile/theme/neo-tokens.ts)).
7. **Semántica del "saldo acumulado" de la contratapa.** — Sumar sobrantes es **doble conteo**: un `acumular` reinyecta el sobrante como `extra_income` del ciclo siguiente, y el código lo documenta y lo rechaza ([editions-screen.tsx:78-101](../../mobile/screens/settings/editions-screen.tsx)). **Recomendación:** definir el acumulado como lo que fue a **reserva + metas** (eso no se reinyecta) — es honesto y derivable en cliente sin migración.
8. **Numeración de ediciones: ¿ciclos cerrados o ediciones publicadas?** — Afecta portada, tarjeta y contratapa, y es irreversible una vez visto. **Recomendación:** ordinal por conteo en cliente mientras no exista compartir; **congelarlo en columna antes de habilitarlo**. Para hogares `dynamic`/semanales, degradar el sello a la etiqueta de rango que el server ya genera en vez del ordinal.
9. **¿La decisión sigue siendo owner-only?** — Hoy sí por RPC, y la UI no lo refleja: un miembro elige, confirma y recibe un toast genérico. Además `apply_reserve_decision` acepta cualquier miembro → dos puertas de permisos en la misma pantalla. **Recomendación:** gatear la UI por rol (modo lectura + "pedile al dueño") y unificar el criterio entre los dos RPC.
10. **¿Se conserva algo de auto-avance?** — Sin él, 7 pantallas exigen 7 taps y el punto de abandono probable es la 03/04, justo antes del veredicto. **Recomendación:** híbrido — auto-avance solo en las pantallas informativas (02, 03, 04), tap obligatorio en 01, 05, 06, 07. ⚠ sin verificar: no hay dato de retención del wrapped actual para respaldarlo.
11. **¿Emojis del handoff o catálogo sticker propio** para los tiles del paso 06 (🐷🎯🔄📉🔍)? — **Recomendación:** emojis en V1 (el handoff los especifica y el tile pastel ya es token), revisar con el owner antes de V2.
12. **¿Entra Compartir en el V1?** — **Recomendación: no.** Solo, es comparable en tamaño a rehacer las 7 pantallas, y arrastra el riesgo de crash de §5.1. Degradar el CTA de la contratapa al link secundario que el propio mockup ya dibuja ("Empezar el nuevo ciclo ›").

---

## 7. Plan por fases

### Fase 0 — Desbloqueo: arreglar la carcasa y los bugs que el swap amplifica

**Objetivo:** dejar el overlay en condiciones de recibir gestos, CTAs por pantalla y Brot, y cerrar los 4 bugs que hoy están tapados por el diseño viejo. Si esto se deja para el final, obliga a re-testear las 7 pantallas.

**Toca:**
- [cycle-wrapped-modal.tsx:586](../../mobile/components/wrapped/cycle-wrapped-modal.tsx) — sacar `overflow:'hidden'` del card (la tinta de Brot sobresale 12 u de su caja).
- [cycle-wrapped-modal.tsx:519-536,626-637](../../mobile/components/wrapped/cycle-wrapped-modal.tsx) — reordenar hermanos: tap zones **primero**, header/CTA después; borrar el comentario falso de `:633-634`.
- [app-stack-shell.tsx:196](../../mobile/components/root/app-stack-shell.tsx) — mover `<CycleWrappedBridge />` después de `<ArcHubHost />` (último hermano gana el hit-test; `zIndex` solo refuerza el pintado). Cuidado: `ToastHost` debe quedar **después** del wrapped.
- Montar `<StatusBar style="light" />` local (patrón [welcome-screen.tsx:69](../../mobile/screens/auth/welcome-screen.tsx)), `accessibilityViewIsModal` (patrón [modal-card.tsx:319](../../mobile/components/ui/modal-card.tsx)) y `BackHandler`.
- [use-month-close-orchestration.ts:380-382](../../mobile/features/home/use-month-close-orchestration.ts) — marcar `wrapped_seen_at` al cerrar desde el bridge, no desde el caller (hoy el path fixed **nunca** marca visto).
- [neo-control-screen.tsx:128,159,641,698](../../mobile/screens/home/neo/neo-control-screen.tsx) — restaurar el dot de "edición sin ver" (regresión del rediseño neo).
- [editions-screen.tsx:103-112](../../mobile/screens/settings/editions-screen.tsx) — enriquecer el replay con `pastLeftoverDecision` / `activeGoal` extrayendo el helper de `use-launch-cycle-wrapped.ts`.
- [count-up-text.tsx:67-88](../../mobile/components/home/animated/count-up-text.tsx) — agregar un `unit` con signo que emita `+` y U+2212 en el worklet, sin `Intl`.
- Unificar el umbral en [sobrante.ts](../../mobile/features/month-close/sobrante.ts) y borrar los dos literales `1000`.

**Listo cuando:** en device, la X y el CTA reciben el tap en todas las escenas; el back físico de Android cierra el wrapped; VoiceOver no atraviesa el overlay; el status bar es claro sobre el fondo verde en tema claro; cerrar el wrapped desde el path fixed apaga el dot de Control; un replay desde Ediciones muestra la decisión tomada.

**Preview de dev:** [cycle-wrapped-preview-screen.tsx](../../mobile/screens/dev/cycle-wrapped-preview-screen.tsx) — los 3 presets actuales alcanzan para verificar hit-test, back y status bar.

---

### Fase 1 — Spec y primitivas

**Objetivo:** tener el vocabulario visual completo antes de tocar una sola pantalla.

**Toca:** `mobile/components/wrapped/wrapped-spec.ts` (nuevo, `WRAPPED_SPEC: Record<'light'|'dark', WrappedSpec>` con ambas entradas apuntando al mismo objeto nocturno, como constante de módulo) · `mobile/components/wrapped/wrapped-primitives.tsx` (nuevo) · [wrapped-constants.ts](../../mobile/components/wrapped/wrapped-constants.ts) (queda solo el pacing; muere `wrappedPalette()`) · prop `mode`/`spec` en los 6 componentes compartidos de §3.4 · bloque `wrapped*` en `decorativeDurations` de [mobile/lib/motion/tokens.ts](../../mobile/lib/motion/tokens.ts) (900/700/800/350/450/250/150 no tienen token y [guard-motion-tokens.mjs](../../scripts/guard-motion-tokens.mjs) falla el build).

**Listo cuando:** `npm run validate` pasa (incluidos `guard:motion-tokens`, `guard:i18n-hardcoded`, `guard:i18n-quality` y la regla ESLint `require-font-family-with-weight`) y existe una pantalla de catálogo en dev que muestra las ~15 primitivas.

**Preview de dev:** pantalla nueva de catálogo de primitivas (sello, estampa ×3 estados, burbuja, CTA, chip, fila editorial, rank item).

---

### Fase 2 — Orquestador nuevo

**Objetivo:** shell de N pantallas sin auto-advance, con gesto de cierre y CTA por escena.

**Toca:** [cycle-wrapped-modal.tsx](../../mobile/components/wrapped/cycle-wrapped-modal.tsx) (reescritura) · [scenes/types.ts](../../mobile/components/wrapped/scenes/types.ts) (agregar `cta?: {label,onPress}`) · [scenes/progress-segment.tsx](../../mobile/components/wrapped/scenes/progress-segment.tsx) (`scaleX`, fill 200 ms) · [build-scenes.ts](../../mobile/components/wrapped/build-scenes.ts).

Puntos no negociables: fondo montado **una vez** en la raíz con `cssGradient` (los gradientes no interpolan); barra y marcador desde `scenes.length`; `active = (idx === current)` propagado a `BrotMascot`, `BrotParticles`, `GrowthRing` y `CountUpText` (los cuatro arrancan en el mount, no cuando la pantalla se ve); swipe-down con `Gesture.Pan().activeOffsetY(8).failOffsetX([-16,16])` soltando en `onTouchesUp`.

**Listo cuando:** con 3 escenas de prueba, el tap 50/50 navega, el swipe-down cierra, la barra se llena de a un segmento, y las animaciones de una escena arrancan al llegar a ella (verificable con un contador visible).

**Preview de dev:** preset con escenas dummy numeradas.

---

### Fase 3 — Datos en cliente

**Objetivo:** que el payload lleve todo lo que las 6 pantallas del V1 necesitan.

**Toca:** [build-wrapped-payload.ts](../../mobile/features/wrapped/build-wrapped-payload.ts) (top 3, rango siempre, share recalculado) · [cycle-wrapped-emitter.ts](../../mobile/lib/cycle-wrapped-emitter.ts) (tipo ensanchado: `activeGoal` con montos, reserva, fijos, estantería, comparación previa) · los 3 selects de §4.1 + [control-v2-adapter.ts](../../mobile/features/insights/control-v2-adapter.ts) · [use-launch-cycle-wrapped.ts](../../mobile/features/wrapped/use-launch-cycle-wrapped.ts) y los call sites de logros.

**Listo cuando:** los tests de [build-wrapped-payload.test.ts](../../tests/unit/build-wrapped-payload.test.ts) pasan extendidos, y el strip de fijos sigue mostrando el mismo número **después** de un pull-to-refresh (prueba de la divergencia de shape en cache).

**Preview de dev:** presets con top 3 completo / con 1 sola categoría / sin meta activa / con reserva 0.

---

### Fase 4 — Pantallas 01, 02, 03, 05

**Objetivo:** el tramo narrativo, sin decisiones.

**Toca:** `scenes/` — reemplazo de `cover-scene`, `verdict-scene`, `top-category-scene`; borrado de `top-expense-scene` y sus claves i18n; nuevas `numbers-scene`, `ranking-scene` · bloque `control:wrapped` en [es/control.json](../../mobile/lib/i18n/locales/es/control.json) y [en/control.json](../../mobile/lib/i18n/locales/en/control.json) (~60 claves nuevas, paridad obligatoria).

**Listo cuando:** las 4 pantallas se ven en device idénticas al `.dc.html` en tipografía, sombras y espaciado; el monto héroe muestra `+`/`−` correctos; la estampa sella con haptic medio; y **el estado reduced-motion de las 4 se lee sin animación** (`deviceYearClass < 2020` entra solo, sin que el usuario lo pida).

**Preview de dev:** matriz MARGEN / EXCEDIDO / JUSTO × motion normal / reducido.

---

### Fase 5 — Pantallas 06 y 07

**Objetivo:** las dos pantallas con acción real.

**Toca:** [scenes/leftover-option-card.tsx](../../mobile/components/wrapped/scenes/leftover-option-card.tsx) (tiles pastel, sub 2 líneas, borde transparente en reposo, variante durazno) · [scenes/cycle-wrapped-cta.tsx](../../mobile/components/wrapped/scenes/cycle-wrapped-cta.tsx) (rama EXCEDIDO) · nuevas `destination-scene` y `backcover-scene` (estantería, listón, mini-cards, chip de decisión) · gate de rol en la UI.

Detalle que suele salir mal: la barra de la meta tiene **dos** medidas — ancho del fill `= (actual+aporte)/meta`, corte del gradiente `= actual/(actual+aporte)` — y se resuelve con dos `View` hermanas (78 %/22 %), no con `locations:[0.78,0.78]`.

**Listo cuando:** las 3 decisiones de MARGEN ejecutan y se reflejan en el chip de la contratapa; el modo lectura funciona desde Ediciones y desde Control con el mismo comportamiento; un miembro no-owner ve modo lectura en vez de un error.

**Preview de dev:** pending con meta / pending sin meta / past por cada decisión / `skip` / no-owner.

---

### Fase 6 — Migración y pantalla 04 (V1.5)

**Objetivo:** cerrar el flujo de 7 pantallas y congelar el ordinal.

**Toca:** **una sola migración** con `create or replace` completo de `close_monthly_cycle` partiendo de la definición viva en prod, columnas con `add column if not exists`: `edition_number`, `fixed_total_count`, `longest_streak_at_close`, `streak_at_close` (+ `movements_count` si se decide) · backfill solo de `edition_number` · mover `ringGeometry` a módulo puro · prop `sweepMs` en [growth-ring.tsx](../../mobile/components/redesign/jardin/parts/growth-ring.tsx) · extraer la card de dots del jardín · nueva `garden-scene` · las 2 queries del jardín.

**Listo cuando:** la 04 muestra el mismo conteo que el jardín vivo para el ciclo recién cerrado; una edición de hace 3 meses la muestra igual (prueba de que no se lee `expenses`); el badge ✦ se oculta cuando `longest_streak_at_close` es `NULL`; y la grilla dibuja `ceil(days/7)` filas en un ciclo extendido.

**Preview de dev:** jardín 30/30, 24/30, ciclo de 45 días, edición vieja sin racha congelada.

---

### Fase 7 — Compartir (V2)

**Objetivo:** tarjeta 9:16 exportable.

**Gate de entrada obligatorio:** spike de 1 día **en device** sobre la estrategia de captura (§5.1). Sin ese resultado no se planifica el sheet.

**Toca:** `ShareCard({ scale })` · sheet dentro del propio wrapped (no `<Modal>` nativo: rompe la continuidad de gestos y deja invisibles los overlay hosts) · deps nativas + `app.config.ts` + rebuild + TestFlight.

**Listo cuando:** el PNG exportado es 1080×1920, incluye a Brot y las partículas, y se ve idéntico en iOS y Android.

---

### Fase 8 — Trigger día-1, push y badge (V2)

**Objetivo:** la entrada canónica del handoff.

**Toca:** migración del trigger `notify_cycle_closed` (copy + `monthly_summary_id` + ruta) · fix `route`↔`url` en el relay o en las migraciones · [routes.ts](../../mobile/utils/routes.ts) allowlist · entrada navegable que dispara el emitter · resolución de la convivencia con el `MonthCloseDecisionSheet` standalone (decisión 1).

**Listo cuando:** el push del día 1 abre la edición correcta y el sheet standalone no se adelanta.

---

### Fase 9 — Documentación y preview

**Toca:** [docs/sistemas/cycle-wrapped.md](../../docs/sistemas/cycle-wrapped.md) (10 afirmaciones desalineadas, reescribir en el mismo commit del código) · [cycle-wrapped-preview-screen.tsx](../../mobile/screens/dev/cycle-wrapped-preview-screen.tsx) migrado a neo con la matriz completa.

---

## 8. Riesgos y trampas específicos de este repo

| # | Trampa | Mitigación |
|---|---|---|
| 1 | **`overflow:'hidden'` guillotina a Brot.** La tinta sobresale 12 u de su caja ([brot-geometry.ts:28](../../mobile/components/brot/brot-geometry.ts), advertencia en [brot-mascot.tsx:1611-1614](../../mobile/components/brot/brot-mascot.tsx)). Invisible en el preview web | Sacarlo del card y prohibirlo en el pozo del aro ([growth-ring.tsx:222-224](../../mobile/components/redesign/jardin/parts/growth-ring.tsx)). El clip correcto es `borderRadius` dentro de Skia |
| 2 | **Todo lo decorativo arranca en el mount.** `GrowthRing` y `CountUpText` no tienen gate de foco; `BrotMascot`/`BrotParticles` gatean por foco de **navegación**, que con 7 páginas bajo la misma ruta da "enfocado" a las 7 | `active = idx === current` explícito, o `key={activeIdx}` para remontar. Si no, el barrido de 900 ms del aro corre mientras el usuario mira la portada |
| 3 | **El count-up del UI thread se come el signo menos** y hardcodea es-AR (`Math.abs` + separador `.` en el worklet, [count-up-text.tsx:67-88](../../mobile/components/home/animated/count-up-text.tsx)) | `unit` con signo. **Nunca** `Intl`/`toLocaleString` dentro de un worklet: hace `abort()` nativo sin stack |
| 4 | **Las tap zones se pintan encima del header y del CTA** (último hermano gana), con un comentario que afirma lo contrario | Reordenar en Fase 0. Con CTAs en 4 pantallas, el bug pasa de latente a permanente |
| 5 | **`freezeOnBlur: true` global** en el `<Stack>` ([app-stack-shell.tsx:209](../../mobile/components/root/app-stack-shell.tsx)): con freeze, Reanimated escribe a un view tag inválido y los handlers de RNGH quedan zombis | No convertir el wrapped en ruta. Si se hace, `freezeOnBlur: false` explícito, como hace `(tabs)` |
| 6 | **El overlay no es el último hermano** (sube solo por `zIndex:999`) | Moverlo. La regla del repo es "último hermano para el hit-test, `zIndex` solo pintado". El síntoma es traicionero: arrastrando anda, tocando no |
| 7 | **No envolverlo en `<Modal>` nativo**: remonta otro `GestureHandlerRootView`, deja invisibles `neoConfirm`/toasts de la raíz, y iOS descarta en silencio un segundo `<Modal>` | Sheet de compartir **dentro** del wrapped. Si algún día es Modal: montar `<OverlayHosts />` adentro + `InteractionManager.runAfterInteractions` para la cadena de dismiss |
| 8 | **En iOS un `Pan` que no activa muere sin emitir** — ni `END`, ni `FAILED`, ni `onFinalize` | Soltar estado en `onTouchesUp`/`onTouchesCancelled`. Receta completa en [modal-card.tsx:254-280](../../mobile/components/ui/modal-card.tsx) |
| 9 | **Reduced motion es un gate de hardware**, no un toggle: todo device con `deviceYearClass < 2020` entra solo ([reduced-motion-provider.tsx:55-56](../../mobile/features/preferences/reduced-motion-provider.tsx)) — el segmento prioritario del producto | Diseñar el estado estático de las 7 pantallas como parte del entregable, no como degradación. Usar **siempre** el hook del repo, nunca el de Reanimated (import trap con regla ESLint) |
| 10 | **Guards de CI que van a rebotar:** `guard:i18n-hardcoded`, `guard:i18n-quality` (paridad de `{{var}}`), `guard:motion-tokens` (baseline drenado a 0) y la regla ESLint que exige `fontFamily` junto a `fontWeight` | Resolver en Fase 1. Ojo: la regla **no mira objetos con spread**, así que `{...base, fontWeight:'900'}` pasa el lint y cae a la face del sistema en runtime |
| 11 | **`SCREEN_WIDTH` congelado a nivel de módulo** ([wrapped-constants.ts:24](../../mobile/components/wrapped/wrapped-constants.ts)), consumido por 5 archivos | El handoff da px fijos; donde quede escala, `useWindowDimensions()`. La `ShareCard` **jamás** lee `Dimensions` |
| 12 | **El efecto de reset del modal es load-bearing**: sus deps están acotadas a propósito para que tap-ear una opción no reinicie desde la escena 1 (bug reportado por el owner) | Copiarlo textual en el orquestador nuevo, que además suma estado de selección y de compartir |
| 13 | **El guard de re-apertura de 1500 ms** descarta triggers en silencio ([cycle-wrapped-bridge.tsx:32-52](../../mobile/components/bridges/cycle-wrapped-bridge.tsx)) | Con "Ver ediciones" en la contratapa, un tap dentro del segundo y medio no hace nada. Decidir si el guard se levanta para replays |
| 14 | **No animar `boxShadow`**, y `transform: undefined` crashea iOS | Sombra estática en la vista cuya `opacity`/`transform` se anima; array de transform siempre presente |
| 15 | **QA solo en device.** El preview web no rinde Skia ni gradientes; en Apple Silicon el proyecto no corre en simulador (ML Kit) | La aprobación del owner es en device, sobre la réplica de Settings→Dev, que dispara el emitter real |
| 16 | **`npm run validate` no es un bundle** | Rematar con `npx expo export --platform ios` |

---

## 9. Lo que NO entra

| Excluido | Por qué |
|---|---|
| **Modo claro completo del wrapped** | El handoff declara el nocturno como canónico; el claro reintroduce dos hexes que el repo rechazó por contraste con el cálculo escrito en el código, y ninguno de los 4 estados de la matriz (EXCEDIDO, plan, JUSTO, jardín incompleto) tiene versión clara publicada |
| **Compartir 9:16 en V1** | Deps nativas + rebuild + TestFlight + riesgo de crash verificado en la ruta de captura. Solo, es comparable en tamaño a rehacer las 7 pantallas |
| **Destino "Stories" de Instagram** | `react-native-share` + `LSApplicationQueriesSchemes` + Facebook App ID. El más caro del sheet y el menos reusable |
| **`expo-media-library`** | Infla la declaración de privacidad de App Store / Play y contradice la política de permisos mínimos del repo. La hoja del sistema ya ofrece "Guardar imagen" |
| **"Ajustar el nuevo ciclo" persistible** | Requiere relajar dos CHECK, un RPC atómico nuevo, y resolver la precedencia contra la confirmación de cobro sobre el mismo campo. Sin eso es un bug silencioso de plata |
| **"Marcar categorías a recortar"** | `category_limits` no tiene una sola escritura en la app; falta definir incluso qué hace el límite (alerta / cupo / visual). Es un producto aparte |
| **Wrapped por miembro del hogar** | Feature nueva, no un estado faltante del handoff. Solo cuidado: no hardcodear "del hogar" de forma que impida un filtro futuro |
| **Estado "Generando tu edición"** | La edición se genera server-side en el cron; cuando el usuario abre, ya existe. Gatear el badge por existencia de la fila hace desaparecer el estado |
| **Transición dissolve+squash entre poses de Brot** | No está portada al componente Skia y ninguna pantalla la necesita (cada una tiene su pose fija) |
| **Reparar el bucketing de `daily_totals`** | Lo consume el calendario de intensidad de Gastos con un fix de tz ya aplicado. Si algún día molesta la imprecisión del jardín, la salida es congelar `cycle_days` en el cierre, no mutar la columna vieja |
| **Backfill de datos del jardín para ediciones viejas** | Imposible: el cron de retención borra los gastos archivados a los 14 días. Se degrada con `NULL` + copy alternativo |
