# Suscripciones zombie — Detección, auditoría familiar y acción declarativa

**Fecha:** 2026-05-02
**Estado:** Aprobado en brainstorming, pendiente plan de implementación
**Alcance:** v1 de la feature de detección de suscripciones poco usadas en Manifiesto

---

## 1. Resumen ejecutivo

Manifiesto detecta hoy "suscripciones zombie" con una heurística pasiva pobre (`amount < $15.000` + `60 días sin pagar`) que confunde *"no se cobró"* con *"no se usa"*. El motor existe en `mobile/features/fijos/fijos-aggregates.model.ts` pero el loop está roto: detecta, no surfacea acciones, no aprende del feedback del usuario.

Esta feature reemplaza esa detección por un sistema de **auditoría familiar transparente**: cuando una suscripción cumple criterios objetivos para auditar, cada miembro de la familia responde individualmente cuánto la usa, todos ven todas las respuestas, un engine puro las clasifica y solo entonces el sistema sugiere acción operativa.

La acción es **declarativa, no ejecutiva**: la app no tiene integración con Netflix / Disney / Spotify / etc. Registra **intenciones del usuario** ("voy a cancelarla"), hace follow-up atado al ciclo de pago real, y solo archiva el fijo cuando el usuario confirma que la baja efectivamente ocurrió.

El surface principal vive en el Asesor (`mobile/components/control-v2/*`) — todas las preguntas, follow-ups y intenciones declaradas aparecen como cards en el feed del Asesor. La tab Fijos sigue siendo el hogar único de las suscripciones, con badges discretos cuando hay intent pendiente. Solo entran al radar fijos categorizados explícitamente como `Suscripciones` (categoría `scope = 'fixed_expense'` que ya existe en el seed de `bootstrap_family()`).

---

## 2. Definición operativa de zombie

### 2.1. Criterios de candidatura (engine puro determinista)

Un `fixed_expense` es **candidato a auditoría** si pasa todos estos filtros:

```
kind                === 'recurring'
status              === 'active'
category.name       === 'Suscripciones'
category.scope      === 'fixed_expense'
frequency           ∈ {'weekly', 'biweekly', 'monthly'}
ageDays             >= 60   // desde fixed_expense.created_at
NO existe audit abierta para él en el período actual
NO está en cooldown (ver §2.3)
```

Periodicidades trimestrales, semestrales y anuales **quedan fuera de v1**. El flujo de auditoría es mensual y preguntar *"¿usaste tu seguro anual este mes?"* es semánticamente roto. v2 puede agregar un flujo de auditoría anual diferente.

`commitment_id`-children, `installment`, `debt`, y `periodic` quedan también excluidos por el filtro de `kind === 'recurring'`.

### 2.2. Reglas de clasificación

Sobre la auditoría cerrada (cuando todos los miembros activos contestaron o vencieron 14 días desde la primera respuesta):

| Estado de la auditoría | Condición | Clasificación | Cooldown post-clasificación |
|---|---|---|---|
| Cerrada por consenso | Todas las respuestas son `casi_nunca` | **Zombie consensuado** | hasta resolución de intent |
| Cerrada con uso afirmado | Al menos una respuesta es `mucho` | **No zombie** | 180 días |
| Cerrada con uso parcial | Al menos una respuesta es `a_veces` y ninguna `mucho` | **Indecisa** | 90 días |
| Cerrada con mix | Al menos una `casi_nunca` Y al menos una `mucho` o `a_veces` | **Uso desigual** | 180 días |
| Cerrada parcial | < 50% miembros activos contestaron en 14 días | **Auditoría parcial** | 60 días, vuelve a preguntar el próximo período |

Tras una intent de cancelación **abandonada**: cooldown de 180 días.
Tras una intent de cancelación **completada**: el fijo queda `archived`, sale del radar permanente.

### 2.3. Cooldown — semántica precisa

`isInCooldown(fixed_expense_id, now) =
  exists audit cerrada en últimos N días
  donde N = cooldown según clasificación previa`

El engine es 100% puro: input = `fixed_expense + audits + intents + payments + family_members + now`, output = `{ candidate: boolean, classification?: string, suggestedAction?: object }`.

### 2.4. Sin scoring fuzzy

No hay umbrales suaves, no hay weighted scoring, no hay confidence interval. Las reglas son booleanas y testeables con vitest línea por línea. Esto cumple §6.3 (engines puros) y §7.3 (cobertura unitaria) de `CODE_RULES.md`.

---

## 3. User journey

### 3.1. Fase 0 — Onboarding contextual silencioso

Sin sheet automático ni banner permanente. El engine inspecciona el catálogo de fijos `recurring` de la familia y, si encuentra ≥ 1 con `name` que matchea la lista hardcodeada de proveedores conocidos (`KNOWN_SUBSCRIPTION_PROVIDERS`) **Y** que **no** tiene categoría Suscripciones asignada → renderiza un **chip discreto inline en la card de ese fijo** en `app/(app)/(tabs)/fixed-expenses.tsx`:

> *¿Es una suscripción? Marcala para auditar su uso.* `[Marcar]`

Tap → `useUpdateFixedExpense` con `category_id` apuntando a la categoría Suscripciones de la familia (resuelta vía hook `useSubscriptionsCategoryId(familyId)`). Optimistic update, invalidación granular del queryKey factory de fixed-expenses + del nuevo factory de suscripciones zombie.

Si el catálogo está limpio (caso real verificado contra la cuenta `kontosmario@gmail.com`: 4 suscripciones ya bien categorizadas) el chip nunca aparece. Cero ruido para usuarios disciplinados.

`KNOWN_SUBSCRIPTION_PROVIDERS` vive en `mobile/features/subscriptions-zombie/known-providers.ts`. Lista mínima inicial:

```
['netflix', 'spotify', 'disney', 'disney+', 'hbo', 'hbo max', 'max',
 'prime video', 'amazon prime', 'apple', 'apple music', 'apple tv',
 'icloud', 'youtube premium', 'youtube music', 'crunchyroll',
 'storytel', 'audible', 'chatgpt', 'claude', 'notion',
 'adobe', 'canva', 'github', 'gym', 'smartfit', 'mega', 'fit']
```

Match es **case-insensitive substring**. Conservador a propósito — preferimos falsos negativos (no enchipar una marca local desconocida) sobre falsos positivos (enchipar algo que no es suscripción).

### 3.2. Fase 1 — Radar pasivo (días 1-59)

La app no dice nada sobre la suscripción. Vive normal en su tab. Esto es importante: §10 (lenguaje operativo) prohíbe preguntar sobre algo prematuro.

### 3.3. Fase 2 — Auditoría abierta (día 60+)

Cuando un miembro abre el Asesor y `isAuditCandidate(fijo, now) === true`:

**Si nadie de la familia contestó:**

```
┌──────────────────────────────────────┐
│  Disney+ — $18.400 / mes             │
│  La pagás hace 2 meses.              │
│  ¿La estás usando vos?               │
│                                      │
│  [La uso mucho] [A veces] [Casi nunca]│
└──────────────────────────────────────┘
```

**Si otro miembro ya contestó:**

```
┌──────────────────────────────────────┐
│  Disney+ — $18.400 / mes             │
│                                      │
│  (M) Mario · casi nunca · hace 1 día │
│                                      │
│  ¿Y vos?                             │
│  [La uso mucho] [A veces] [Casi nunca]│
└──────────────────────────────────────┘
```

Avatar circular renderizado con `<Avatar name={member.name} color={memberColor} size={24} />` desde `mobile/components/ui/avatar.tsx`. Color asignado por índice del miembro en la familia, mismo patrón que `family-strip.tsx`.

La auditoría queda abierta **14 días desde la primera respuesta** o hasta que todos los miembros activos contesten, lo que ocurra primero. Quien no entró al Asesor en el plazo, no contesta — la auditoría cierra parcial.

### 3.4. Fase 3 — Clasificación y surface de acciones

Engine corre cada vez que un miembro contesta o cuando vence el plazo. Surfacea distintos cards según el resultado:

**Zombie consensuado:**

```
┌──────────────────────────────────────┐
│  Disney+ — $18.400 / mes             │
│  La familia casi no la usa.          │
│  En 2 meses fueron $36.800.          │
│  ¿Qué hacen?                         │
│                                      │
│  [Voy a cancelarla]                  │
│  [Voy a pausarla]                    │
│  [Voy a bajar el plan]               │
│  [Sigo bancándola]                   │
└──────────────────────────────────────┘
```

**Uso desigual:**

```
┌──────────────────────────────────────┐
│  Apple marito — $15.267 / mes        │
│  La usa solo Mario.                  │
│  ¿Es lo que esperaban?               │
│                                      │
│  [Sí, está bien]                     │
│  [Conversémoslo]   (close)           │
└──────────────────────────────────────┘
```

(Se decidió no sugerir "pasarla a presupuesto personal" porque hoy no hay presupuesto personal por miembro en Manifiesto. La card abre la conversación en lugar de proponer una mecánica que no existe.)

**Indecisa / Auditoría parcial:** sin card propio. El sistema espera al próximo ciclo (cooldown corto) sin molestar.

### 3.5. Fase 4 — Declaración de intención

El miembro toca *"Voy a cancelarla"*. Mutación `useDeclareSubscriptionIntent`:

- Inserta row en `fixed_expense_action_intent` con `intent='cancel'`, `user_id = auth.uid()`, `declared_at = now`.
- **NO** modifica `fixed_expense.status`. La realidad sigue siendo que el fijo está activo hasta que se cancele en el proveedor real.
- Optimistic update.

Todos los miembros ven en su Asesor:

```
┌──────────────────────────────────────┐
│  Mario va a dar de baja Disney+      │
│  Hace 2 días                         │
│  Ahorro estimado: $18.400 / mes      │
└──────────────────────────────────────┘
```

En la lista de Fijos, la card de Disney+ muestra un badge discreto: `🟠 Pendiente de cancelar`. Tap en la card abre el sheet de detalle con el follow-up actual (mismo que en Asesor).

Las opciones de intent son:
- `cancel` → confirmación final → `status = 'archived'`
- `pause` → confirmación final → `status = 'paused'`
- `downgrade` → confirmación final → abre numpad para editar `amount`, `status` permanece `'active'`

### 3.6. Fase 5 — Follow-up atado al ciclo de pago

Cuando llega `next_due_on` del fijo con intent abierta:

**Si llegó un nuevo `fixed_expense_payment` después de `intent.declared_at`:**

```
┌──────────────────────────────────────┐
│  Disney+ se volvió a cobrar.         │
│  Hace 25 días ibas a cancelarla.     │
│  ¿Pasó algo?                         │
│                                      │
│  [Sí, sigue activa] [La di de baja]  │
└──────────────────────────────────────┘
```

**Si pasaron 5 días después de `next_due_on` y NO hubo pago:**

```
┌──────────────────────────────────────┐
│  Disney+ no se cobró este mes.       │
│  ¿Confirmás que la diste de baja?    │
│                                      │
│  [Sí, ya está] [Todavía no, esperá]  │
└──────────────────────────────────────┘
```

### 3.7. Fase 6 — Confirmación final

Cualquier miembro de la familia (no necesariamente quien declaró) toca **"Sí, ya está"**:

- `intent.resolved_at = now`, `intent.resolution = 'completed'`.
- Para `intent='cancel'`: `fixed_expense.status = 'archived'`.
- Para `intent='pause'`: `fixed_expense.status = 'paused'`.
- Para `intent='downgrade'`: abre numpad inline; al guardar el nuevo `amount`, `fixed_expense.amount = nuevo_valor`, `intent.resolved_at = now`.
- Toast operativo: *"Listo. No la cuento más. Vas a ahorrar $18.400 por mes."*

Si toca **"Cambié de idea"** en cualquier punto: `intent.resolved_at = now`, `intent.resolution = 'abandoned'`. El fijo entra en cooldown de auditoría de 180 días (la familia decidió bancarla, no preguntar pronto).

---

## 4. Modelo de datos

### 4.1. Nueva tabla: `fixed_expense_usage_audit`

```sql
create table public.fixed_expense_usage_audit (
  id                uuid primary key default gen_random_uuid(),
  fixed_expense_id  uuid not null references public.fixed_expenses(id) on delete cascade,
  family_id         uuid not null references public.families(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  period            text not null,  -- 'YYYY-MM'
  level             text not null check (level in ('mucho', 'a_veces', 'casi_nunca')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (fixed_expense_id, user_id, period)
);

create index fixed_expense_usage_audit_family_idx
  on public.fixed_expense_usage_audit (family_id, period);
create index fixed_expense_usage_audit_fixed_expense_idx
  on public.fixed_expense_usage_audit (fixed_expense_id);
```

**RLS:**
- `select`: `is_family_member(family_id)` (lee todos los miembros, transparencia familiar).
- `insert`: `user_id = auth.uid()` AND `is_family_member(family_id)`.
- `update`: deshabilitado en v1 (no se permite editar respuesta una vez registrada — la próxima auditoría reabre).
- `delete`: deshabilitado.

### 4.2. Nueva tabla: `fixed_expense_action_intent`

```sql
create table public.fixed_expense_action_intent (
  id                uuid primary key default gen_random_uuid(),
  fixed_expense_id  uuid not null references public.fixed_expenses(id) on delete cascade,
  family_id         uuid not null references public.families(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete set null,
  intent            text not null check (intent in ('cancel', 'pause', 'downgrade')),
  declared_at       timestamptz not null default now(),
  resolved_at       timestamptz null,
  resolution        text null check (resolution in ('completed', 'abandoned')),
  notes             text null,  -- para downgrade: nuevo amount sugerido
  unique (fixed_expense_id) where (resolved_at is null)  -- una intent abierta a la vez por fijo
);

create index fixed_expense_action_intent_family_open_idx
  on public.fixed_expense_action_intent (family_id) where (resolved_at is null);
```

**RLS:**
- `select`: `is_family_member(family_id)` (todos ven todas las intents de la familia).
- `insert`: `user_id = auth.uid()` AND `is_family_member(family_id)`.
- `update`: cualquier miembro de la familia puede resolver (`resolved_at` + `resolution`). No se permite cambiar `intent`, `fixed_expense_id`, `declared_at` ni `user_id`.
- `delete`: deshabilitado.

### 4.3. Cambios en tablas existentes

**Ninguno.** No se agrega columna a `fixed_expenses`. La categoría Suscripciones ya existe en el seed de `bootstrap_family()` con `scope = 'fixed_expense'` y color `#C9A6E0`.

### 4.4. Backfill / migración de families pre-existentes

Riesgo: las familias creadas **antes de** `supabase/migrations/20260423151925_add_fixed_expense_category_scope.sql` pueden no tener la categoría Suscripciones. Plan de implementación debe incluir un script de backfill que para cada `family` sin categoría `name = 'Suscripciones'` con `scope = 'fixed_expense'`, la inserte con el color y nombre canónicos.

### 4.5. RPCs nuevas (opcionales)

Para evitar round-trips, el plan puede definir:

- `audit_subscription(fixed_expense_id, level)` — inserta row en `fixed_expense_usage_audit` con `period` calculado server-side.
- `declare_subscription_intent(fixed_expense_id, intent, notes?)` — inserta row en `fixed_expense_action_intent`, falla si ya hay una abierta.
- `resolve_subscription_intent(intent_id, resolution, new_amount?)` — actualiza `resolved_at` + `resolution`, dispara cambio de `status` o `amount` según corresponda.

Si se prefiere evitar RPCs, las mutations corren queries directas con RLS. Decisión de plan, no de spec.

---

## 5. Lugar en la app

### 5.1. Tab Fijos (`app/(app)/(tabs)/fixed-expenses.tsx`)

- Hogar único de las suscripciones. La lista ya filtra por categoría — Suscripciones aparece como un grupo más.
- Cards de suscripciones con intent abierta muestran badge: `🟠 Pendiente de cancelar` / `Pendiente de pausar` / `Pendiente de bajar plan`.
- Tap en una card con intent abierta → sheet de detalle con el follow-up actual (mismo flow que aparece en el Asesor, reusable).
- Chip de onboarding contextual (§3.1) aparece inline en cards de fijos sin categoría Suscripciones cuyo `name` matchea proveedor conocido.

### 5.2. Asesor / control-v2 (`mobile/components/control-v2/*`)

- Toda pregunta inicial de auditoría → card en el feed del Asesor.
- Toda preview de respuestas familiares → card en el feed del Asesor.
- Todo follow-up atado al ciclo → card en el feed del Asesor.
- Toda intent declarada por la familia → card informativa en el feed del Asesor.
- Las cards se rankean con el sistema actual (`urgency × impactRaw × confidence`) que ya implementa `control-signals.ts`.
- **No hay sección dedicada "Zombies"** — son señales más entre las que ya vienen.

### 5.3. Push notifications

- Trigger único: cuando el engine emite **clasificación final** de zombie consensuado o uso desigual y la card aparece por primera vez en el feed del Asesor.
- Una notificación por candidata, no por miembro. Va a todos los `push_subscriptions` activos de la familia vía la edge function existente `send-family-push`.
- Frecuencia esperada: 1-3 por familia por trimestre.
- Copy: *"Disney+ — la familia casi no la usa. Pagás $18.400 al mes. Tocá para revisar."*
- Deep link: abre el feed del Asesor scrolleado a la card relevante.

### 5.4. Lo que NO agrega la feature en v1

- Card en Home — Home ya está cargado, no quiero ruido nuevo.
- Pantalla full-screen dedicada — todo es sheet desde Asesor o desde Fijos.
- Encuesta mensual masiva — se descartó por fricción.
- Integración con proveedores externos — fuera de scope.
- Presupuesto personal por miembro — no existe en Manifiesto v1.
- Suscripciones compartidas entre familias — no hay primitive para esto.

---

## 6. Arquitectura por capas (CODE_RULES §2)

```
mobile/features/subscriptions-zombie/
├── known-providers.ts                  # lista hardcodeada de proveedores
├── subscription-audit-engine.ts        # engine puro determinista (no React, no IO, no Date.now)
├── subscription-audit-engine.test.ts   # tests vitest (≥ 90% cobertura)
├── period.ts                           # cálculo de period 'YYYY-MM' desde Date inyectada
├── period.test.ts
├── query-keys.ts                       # factory de queryKeys
├── use-subscription-audit-feed.ts      # hook React Query, lee audits + fijos + intents
├── use-record-subscription-audit.ts    # mutation con optimistic update
├── use-declare-subscription-intent.ts  # mutation
├── use-resolve-subscription-intent.ts  # mutation
├── use-subscriptions-category-id.ts    # hook que resuelve category_id de Suscripciones por familia
├── types.ts                            # tipos compartidos (no domain)
└── index.ts                            # re-exports

mobile/components/subscriptions-zombie/
├── audit-prompt-card.tsx               # card del Asesor con pregunta inicial / con preview familiar
├── classification-card.tsx             # card del Asesor con resultado (zombie / uso desigual / etc.)
├── intent-status-card.tsx              # card del Asesor con intent declarada
├── intent-followup-card.tsx            # card del Asesor con follow-up del ciclo
├── subscription-onboarding-chip.tsx    # chip inline para onboarding contextual
└── usage-level-buttons.tsx             # 3 botones (mucho / a_veces / casi_nunca) reusable

supabase/migrations/
├── 20260502XXXXXX_subscription_zombie_audit.sql        # tablas + RLS + indices
├── 20260502XXXXXY_subscription_zombie_rpcs.sql         # RPCs (opcional, decisión del plan)
└── 20260502XXXXXZ_subscription_zombie_backfill.sql     # backfill categoría Suscripciones para families viejas
```

**Nada de Supabase desde components o screens.** Toda IO pasa por hooks de feature.

**Engine puro:** ningún import de React, Supabase, AsyncStorage, fecha global. `now: Date` se inyecta en cada llamada. Mismo patrón que `forecast-engine.ts`.

**queryKey factory:** `subscriptionZombieQueryKeys.feed(familyId)`, `.audits(familyId, period)`, `.intents(familyId)`. Invalidaciones granulares — `invalidate(['subscription-zombie'])` solo afecta esta feature.

---

## 7. Migración de la heurística vieja

`mobile/features/fijos/fijos-aggregates.model.ts` tiene hoy:

```ts
const ZOMBIE_INACTIVITY_DAYS = 60
const ZOMBIE_MAX_AMOUNT = 15000
const HIKE_MIN_DELTA_PCT = 5

function isLikelyZombie(fijo, now) { ... }
```

`FijosCycleSummary.zombies: number` se calcula desde esto. `FijosSmartAlerts` renderiza un card "🧟 X suscripciones zombi".

**Plan:**

1. **Borrar** `ZOMBIE_INACTIVITY_DAYS`, `ZOMBIE_MAX_AMOUNT`, `isLikelyZombie()`.
2. **Reemplazar** `FijosCycleSummary.zombies` por una derivación del nuevo engine (o quitar la propiedad si ya no se usa en UI).
3. **Reemplazar el card de FijosSmartAlerts** que dice "🧟 X suscripciones zombi" por un card que linkea al Asesor: *"Tenés X auditorías de suscripciones abiertas — revisalas en el Asesor"*. O eliminarlo si la duplicación con el Asesor es ruido — decisión a tomar en el plan.
4. **`captureZombieDeletion()`** queda obsoleto y se elimina (no hay más notifications de `kind = 'zombie_alert'` generadas por el sistema viejo).
5. **`HIKE_MIN_DELTA_PCT`** se mantiene — no es parte de esta feature, vive separado.

Esto es **alcance obligatorio** del plan, no opcional. Dejar las dos lógicas conviviendo genera doble surface y confusión.

---

## 8. Métricas

A instrumentar en v1, todas vía `notifications` o tabla nueva `subscription_zombie_events` (decisión del plan):

- **Engagement con la pregunta** — % de candidatas con ≥ 1 respuesta familiar.
- **Tiempo a primera respuesta** — desde que la card aparece hasta que un miembro contesta.
- **Distribución de respuestas** — % `mucho` / `a_veces` / `casi_nunca`.
- **Acciones declaradas** — % de zombies consensuados que generan intent (`cancel` / `pause` / `downgrade`).
- **Resolución de intent** — % de intents que terminan `completed` vs `abandoned`.
- **Ahorro real estimado** — Σ (`amount` × `meses_no_cobrados`) de los archivados por intent completada.
- **Falsos positivos detectados** — % de uso desigual que el usuario marca "está bien así".

---

## 9. Riesgos

### 9.1. Bajos engagement con el Asesor

Si los usuarios no abren el Asesor, las preguntas nunca aparecen. **Mitigación v1:** push notification al emitir clasificación final. Si el push tampoco mueve el engagement (objetivo: ≥ 40% de candidatas con respuesta en 14 días post-launch), revisar ubicación en v2 (capaz banner en Home).

### 9.2. Familias con un solo miembro activo

La transparencia familiar es semánticamente neutra (no hay otros con quien comparar). El loop de auditoría → intent → confirmación funciona igual para single-user. La pieza social se pierde pero el resto del valor se mantiene.

### 9.3. Click-bait inverso ("casi nunca" para callar la pregunta)

Mitigación:
- Cooldown de 90 días después de **abandonar una intent** (la pregunta no vuelve pronto).
- La pregunta aparece **una sola vez por período** — no se puede spamear.
- Copy de la pregunta es no acusatorio: *"¿La estás usando vos?"*, no *"¿Vale la pena seguir pagando?"*.

### 9.4. Suscripciones compartidas entre hogares

Spotify Familiar a $4.200 dividido entre dos familias distintas → fuera del modelo de Manifiesto en v1. Si emerge como caso real frecuente, v2 puede considerar el primitive de "plan compartido entre familias".

### 9.5. Heurística de proveedores conocidos pifia

`KNOWN_SUBSCRIPTION_PROVIDERS` puede no matchear nombres locales (ej. *"MultiPlay Premium"*). En ese caso, el chip de onboarding no aparece y el usuario tiene que asignar la categoría manualmente desde el detalle del fijo. **No es bloqueante** — la categorización manual ya existe.

### 9.6. Dependencia de `last_paid_at` y `fixed_expense_payments`

El follow-up atado al ciclo (§3.6) depende de que el usuario marque pagos puntualmente. Si no los marca, la lógica "se cobró igual" / "no se cobró este mes" pifia. **Mitigación:** además de la señal automática, el follow-up siempre tiene los botones manuales `[Sí, ya está]` / `[Todavía no]`. La señal automática es ayuda, no fuente de verdad única.

### 9.7. Backfill de families pre-2026-04-23

Si `bootstrap_family()` empezó a sembrar la categoría Suscripciones recién en `20260423151925`, las families anteriores no la tienen. **Mitigación:** migración de backfill explícita en el plan. Tarea trivial pero obligatoria.

### 9.8. Race condition en intents

Dos miembros tocan "Voy a cancelarla" al mismo tiempo. El UNIQUE parcial `where (resolved_at is null)` previene a nivel DB — el segundo insert falla. La UI debe manejar el error gracefully (refetchear y mostrar "Mario ya declaró la intent").

---

## 10. Memoria del proyecto que la feature debe respetar

- **No Intl/locale dentro de worklets** — toda animación de entrada de cards en el Asesor formatea (montos, fechas) en JS thread y pasa el string al worklet via `runOnJS`. Memoria: `feedback_reanimated_worklet_globals`.
- **`freezeOnBlur: false` en `<Tabs>`** — si la lista de Fijos suma swipe-to-dismiss para badges de intent, se respeta el setting. Memoria: `feedback_freeze_on_blur_breaks_gestures`.
- **Form modal pattern (savings-goal style)** — la sheet de auditoría usa scroll nativo + `RiseView` staggered + CTA inline, NO `StickyFooter`. Memoria: `feedback_form_modal_pattern`.
- **Reanimated Easing** — si hay timing complexo, usar solo `Easing` de `react-native-reanimated`, no de `react-native`. Memoria: `feedback_reanimated_easing_runtime`.
- **`react-native-svg` typing** — si se diseña un icono custom de auditoría, usar pattern `Raw + React.FC cast`. Memoria: `feedback_react_native_svg_typing`.
- **Worklets no llaman fns JS inline** — si hay gesto, factor el work entero en un useCallback JS y disparar via `runOnJS(callback)()`. Memoria: `feedback_reanimated_worklet_calling_js_fns`.

---

## 11. Criterios de aceptación

### Engine
- [ ] `subscription-audit-engine.ts` no importa React, Supabase, AsyncStorage, ni usa `Date.now()` global.
- [ ] Tests vitest cubren ≥ 90% de líneas.
- [ ] Test cases: candidato no candidato, cooldown, todas las clasificaciones (consensuado / no zombie / indecisa / uso desigual / parcial), edge case de family de 1 miembro, edge case de auditoría sin respuestas, edge case de intent abierta bloqueando nueva auditoría.

### Datos
- [ ] Migración crea las dos tablas con RLS, indices y constraints unique parciales.
- [ ] Backfill de categoría Suscripciones para families pre-existentes corre idempotente.
- [ ] RLS testeado: un user de family A NO ve audits de family B.

### UI
- [ ] El chip de onboarding aparece SOLO cuando hay match + sin categoría.
- [ ] La pregunta inicial NO aparece para fijos < 60 días.
- [ ] La preview de respuestas familiares muestra avatar, nombre, nivel y relativeTime.
- [ ] El badge de intent aparece en la card del fijo en la tab Fijos.
- [ ] El follow-up cambia de copy según haya cobro nuevo o no.
- [ ] Toast operativo al confirmar cancelación con monto y "Vas a ahorrar X".

### Migración de heurística vieja
- [ ] `ZOMBIE_INACTIVITY_DAYS`, `ZOMBIE_MAX_AMOUNT`, `isLikelyZombie()`, `captureZombieDeletion()` borrados.
- [ ] `FijosCycleSummary.zombies` migrado o eliminado.
- [ ] El card "🧟 X suscripciones zombi" en `FijosSmartAlerts` reemplazado o eliminado.

### Push
- [ ] Push se dispara solo en clasificación final, no en cada respuesta de auditoría.
- [ ] Deep link abre el feed del Asesor en la card correcta.
- [ ] Reusa `send-family-push` edge function existente, sin nuevas dependencias.

### A11y / §11
- [ ] Cada botón tiene `accessibilityRole="button"` y `accessibilityLabel` con copy operativo completo.
- [ ] Los avatares con color tienen el nombre como `accessibilityLabel`, no se confía en color.
- [ ] El badge de intent es legible sin color (texto + ícono).
- [ ] Animaciones respetan `prefers-reduced-motion`.

### Performance
- [ ] El engine corre en < 50ms para una family con 50 fijos.
- [ ] Listas usan `FlatList` con `keyExtractor` estable, no `ScrollView`.
- [ ] queryKey invalidation es granular: tocar un audit no invalida `home-snapshot`.

---

## 12. Lo que se decidió y NO va en v1

- **Sheet de onboarding bulk** ("marcá tus suscripciones existentes con checkboxes") — descartado a favor del chip contextual. Razón: catálogo real verificado ya está bien categorizado, sheet sería ruido para el caso común.
- **Edición de respuesta dentro de la auditoría** — descartado. Reabrir una auditoría agrega complejidad sin valor proporcional. La oportunidad de cambiar de opinión es la próxima auditoría.
- **Frecuencias trimestrales / semestrales / anuales** — fuera de v1.
- **Detección de uso vía `expenses.commitment_id`** — descartada como anchor primario. Sirve para gym-like (`comprás ropa, cargás expense con commitment_id apuntando al gym`) pero no para suscripciones digitales puras (Netflix). El anchor primario es **respuesta del usuario**, las señales pasivas (`commitment_id`-linked expenses, `last_paid_at`) sirven solo como input de cooldown.
- **Score / weighted scoring** — descartado. Reglas booleanas explícitas son testeables, las heurísticas pondereadas no.
- **Encuesta mensual masiva** — descartada por fricción.
- **Categoría auto-asignada por matching de nombre** — descartada. La asignación es siempre del usuario (manual o vía chip contextual). Evita falsos positivos en marcas locales.
- **Push opt-in granular** — v1 reusa el opt-in general de la familia. Opt-in específico para suscripciones queda para v2 si las métricas lo justifican.

---

**Próximo paso:** generar plan de implementación con `superpowers:writing-plans`, decomponer en 2-3 PRs mergeables, y proceder a ejecutar.
