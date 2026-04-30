# 📊 Home — Spec de telemetría

> Deliverable §4.1 del [Sprint 0 del roadmap](home-roadmap.md). Define eventos, shape, tabla, RPC y cliente para instrumentar el Home actual + cada Sprint nuevo.
>
> Decisión arquitectónica resuelta en [RFC §D5](home-sprint-0-rfc-meta.md): reusar el pattern de `advisor_interactions` en lugar de instalar un SDK comercial.

---

## 1. Inventario de eventos

### 1.1 Eventos del Home actual (medir baseline pre-Sprint 1)

| Evento | Cuándo dispara | Surface |
|---|---|---|
| `home.opened` | HomeScreen mount | — |
| `home.closed` | HomeScreen unmount | dwell_ms |
| `home.element_tapped` | Cualquier elemento interactivo del Home | element_id, slot |
| `home.scrolled_to_bottom` | Usuario llegó al fin del scroll | scroll_depth_pct |
| `home.refreshed` | Pull-to-refresh ejecutado | — |
| `home.left_without_tap` | Cierre de Home sin haber tap-eado nada | dwell_ms |
| `home.reopened_in_session` | Re-apertura del Home dentro de la misma sesión | gap_ms (tiempo desde el unmount anterior) |

### 1.2 Eventos por Sprint nuevo (cada chip que se agregue)

Mismo set para todos los Sprints. Usar `element_id` consistente:

| element_id | Sprint | Slot |
|---|---|---|
| `cycle_progress_bar` | 1 | S4 |
| `top_category_chip` | 2 | S5 |
| `next_fixed_chip` | 2 alt | S5 |
| `forecast_summary` | 3 | S3 |
| `fijos_coverage_microtext` | 4 | S5 |
| `contextual_banner` | post-4 | S7 |
| `trust_receipt_strip` | long-tail | S8 |

Eventos por chip:

| Evento | Cuándo |
|---|---|
| `home.element_shown` | El elemento entra al viewport (lazy emit, threshold visibility 50%) |
| `home.element_tapped` | Tap |
| `home.element_dismissed` | Solo aplica a banners contextuales — usuario dismisseó |

### 1.3 Eventos derivados (computed, no logged directamente)

Estos se derivan en queries SQL al analizar — no se loggean por evento:

- **tap_rate** = `count(tapped) / count(shown)`
- **dwell_time** = `tapped.created_at - shown.created_at`
- **derived_navigation** = % de `tapped` que generaron un `screen_view` en otra pantalla en los próximos 5s
- **bounce_rate** = `count(left_without_tap) / count(opened)`
- **session_repeat_rate** = `count(reopened_in_session) / count(opened)`

---

## 2. Shape del payload

Convención compartida con `advisor_interactions`. Una tabla por dominio (Home propio), columnas tipadas:

```typescript
interface HomeTelemetryEvent {
  id: string                     // uuid PK
  user_id: string                // FK auth.users
  family_id: string              // FK families
  event: 'home.opened' | 'home.closed' | 'home.element_tapped' | ...
  element_id: string | null      // ej: 'cycle_progress_bar' — null para eventos de surface
  slot: 'S1' | 'S2' | ... | null // slot per slot-map.md
  context: jsonb                 // payload contextual: dwell_ms, scroll_depth_pct, ...
  created_at: timestamptz
}
```

### 2.1 Convenciones de `context`

Por evento:

```jsonc
// home.opened
{ "session_id": "uuid", "from_route": "/(auth)/welcome | /(app)/(tabs)/expenses | ..." }

// home.closed
{ "session_id": "uuid", "dwell_ms": 12400, "scrolled_to_bottom": true }

// home.element_shown
{ "session_id": "uuid", "element_id": "cycle_progress_bar", "slot": "S4" }

// home.element_tapped
{ "session_id": "uuid", "element_id": "top_category_chip", "slot": "S5",
  "ms_since_shown": 2340, "destination_route": "/(app)/(tabs)/expenses" }

// home.element_dismissed
{ "session_id": "uuid", "element_id": "contextual_banner_dow_pattern",
  "slot": "S7", "ms_since_shown": 1200, "reason": "swipe | x_button" }

// home.left_without_tap
{ "session_id": "uuid", "dwell_ms": 3400 }

// home.reopened_in_session
{ "session_id": "uuid", "gap_ms": 18000, "previous_dwell_ms": 4200 }
```

`session_id`: identifica una "sesión Home" — desde `home.opened` hasta `home.closed`. Generado en el cliente al primer mount, reusado en eventos posteriores hasta el unmount.

---

## 3. Schema SQL — migration

```sql
-- 20260502000000_home_telemetry.sql

set search_path = public;

create table if not exists public.home_telemetry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  event text not null,
  element_id text,
  slot text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists home_telemetry_user_event_idx
  on public.home_telemetry (user_id, event, created_at desc);

create index if not exists home_telemetry_family_element_idx
  on public.home_telemetry (family_id, element_id, created_at desc);

create index if not exists home_telemetry_session_idx
  on public.home_telemetry ((context->>'session_id'), created_at);

alter table public.home_telemetry enable row level security;

-- RLS: usuario ve solo lo propio. INSERT solo via SECURITY DEFINER RPC.
create policy "home_telemetry_select_own"
  on public.home_telemetry for select
  using (auth.uid() = user_id);

-- RPC SECURITY DEFINER (cliente nunca insert directo)
create or replace function public.log_home_event(
  p_family_id uuid,
  p_event text,
  p_element_id text default null,
  p_slot text default null,
  p_context jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Auth required';
  end if;

  if not exists (
    select 1 from public.family_members fm
    where fm.family_id = p_family_id and fm.user_id = auth.uid()
  ) then
    raise exception 'Forbidden: not a member of family';
  end if;

  insert into public.home_telemetry (
    user_id, family_id, event, element_id, slot, context
  )
  values (
    auth.uid(), p_family_id, p_event, p_element_id, p_slot,
    coalesce(p_context, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_home_event from public;
grant execute on function public.log_home_event to authenticated;

-- Pruning: 90 días retention. Más es exceso para análisis tactical.
create or replace function public.cron_prune_home_telemetry()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.home_telemetry
  where created_at < now() - interval '90 days';
end;
$$;

revoke all on function public.cron_prune_home_telemetry from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('cron_prune_home_telemetry');
    perform cron.schedule(
      'cron_prune_home_telemetry',
      '0 5 1 * *',  -- 05:00 UTC el 1 de cada mes
      $cron$select public.cron_prune_home_telemetry();$cron$
    );
  end if;
exception when others then null;
end;
$$;
```

---

## 4. Cliente — wrapper TypeScript

Patrón: fire-and-forget, swallow errors, batched es un nice-to-have V2.

```typescript
// mobile/features/home/log-home-event.ts

import { supabase } from '@/lib/supabase'

export type HomeEvent =
  | 'home.opened'
  | 'home.closed'
  | 'home.element_shown'
  | 'home.element_tapped'
  | 'home.element_dismissed'
  | 'home.scrolled_to_bottom'
  | 'home.refreshed'
  | 'home.left_without_tap'
  | 'home.reopened_in_session'

export type HomeSlot = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8'

interface LogArgs {
  familyId: string
  event: HomeEvent
  elementId?: string
  slot?: HomeSlot
  context?: Record<string, unknown>
}

export async function logHomeEvent(args: LogArgs): Promise<void> {
  try {
    await supabase.rpc('log_home_event', {
      p_family_id: args.familyId,
      p_event: args.event,
      p_element_id: args.elementId ?? null,
      p_slot: args.slot ?? null,
      p_context: args.context ?? {},
    })
  } catch {
    // Telemetry must never break the foreground UX.
  }
}
```

### 4.1 Hook de sesión

```typescript
// mobile/features/home/use-home-telemetry.ts

import { useEffect, useRef } from 'react'
import { logHomeEvent } from './log-home-event'

export function useHomeTelemetry(familyId: string | undefined) {
  const sessionIdRef = useRef<string>(crypto.randomUUID())
  const mountedAtRef = useRef<number>(Date.now())
  const lastUnmountedAtRef = useRef<number | null>(null)
  const tappedRef = useRef<boolean>(false)

  useEffect(() => {
    if (!familyId) return

    // home.opened (con detección de re-apertura)
    const now = Date.now()
    const reopened =
      lastUnmountedAtRef.current != null &&
      now - lastUnmountedAtRef.current < 60_000

    if (reopened) {
      void logHomeEvent({
        familyId,
        event: 'home.reopened_in_session',
        context: {
          session_id: sessionIdRef.current,
          gap_ms: now - lastUnmountedAtRef.current!,
        },
      })
    }
    void logHomeEvent({
      familyId,
      event: 'home.opened',
      context: { session_id: sessionIdRef.current },
    })

    return () => {
      const dwellMs = Date.now() - mountedAtRef.current
      lastUnmountedAtRef.current = Date.now()

      void logHomeEvent({
        familyId,
        event: 'home.closed',
        context: { session_id: sessionIdRef.current, dwell_ms: dwellMs },
      })

      if (!tappedRef.current) {
        void logHomeEvent({
          familyId,
          event: 'home.left_without_tap',
          context: { session_id: sessionIdRef.current, dwell_ms: dwellMs },
        })
      }
    }
  }, [familyId])

  return {
    sessionId: sessionIdRef.current,
    markTapped: () => { tappedRef.current = true },
  }
}
```

### 4.2 Helper para componentes

```typescript
// mobile/features/home/use-track-element.ts

import { useEffect, useRef } from 'react'
import { logHomeEvent, type HomeSlot } from './log-home-event'

interface Args {
  familyId: string | undefined
  sessionId: string
  elementId: string
  slot: HomeSlot
  /** Whether the element is currently visible. Driver should track
   *  viewport intersection or simple mount state. */
  isVisible: boolean
}

export function useTrackElement(args: Args) {
  const shownRef = useRef(false)
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!args.familyId || !args.isVisible || shownRef.current) return
    shownRef.current = true
    shownAtRef.current = Date.now()
    void logHomeEvent({
      familyId: args.familyId,
      event: 'home.element_shown',
      elementId: args.elementId,
      slot: args.slot,
      context: { session_id: args.sessionId },
    })
  }, [args.familyId, args.isVisible, args.elementId, args.slot, args.sessionId])

  return {
    onTap: (destinationRoute?: string) => {
      if (!args.familyId) return
      void logHomeEvent({
        familyId: args.familyId,
        event: 'home.element_tapped',
        elementId: args.elementId,
        slot: args.slot,
        context: {
          session_id: args.sessionId,
          ms_since_shown: shownAtRef.current ? Date.now() - shownAtRef.current : null,
          destination_route: destinationRoute,
        },
      })
    },
    onDismiss: (reason: 'swipe' | 'x_button') => {
      if (!args.familyId) return
      void logHomeEvent({
        familyId: args.familyId,
        event: 'home.element_dismissed',
        elementId: args.elementId,
        slot: args.slot,
        context: {
          session_id: args.sessionId,
          ms_since_shown: shownAtRef.current ? Date.now() - shownAtRef.current : null,
          reason,
        },
      })
    },
  }
}
```

### 4.3 Wiring en HomeScreen

```typescript
// home-screen.tsx

const telemetry = useHomeTelemetry(familyId)

// Para cada elemento existente, envolver el onPress:
const heroTrack = useTrackElement({
  familyId, sessionId: telemetry.sessionId, elementId: 'hero_card', slot: 'S3',
  isVisible: true,
})

// En el Pressable existente:
<Pressable onPress={() => {
  telemetry.markTapped()
  heroTrack.onTap('/(app)/(tabs)/expenses')
  // ... acción real
}}>
```

---

## 5. Queries de análisis (referencia)

### 5.1 Tap rate del Home actual (baseline)

```sql
with sessions as (
  select context->>'session_id' as session_id, family_id
  from home_telemetry
  where event = 'home.opened'
    and created_at >= now() - interval '7 days'
),
tapped_sessions as (
  select distinct context->>'session_id' as session_id
  from home_telemetry
  where event = 'home.element_tapped'
    and created_at >= now() - interval '7 days'
)
select
  count(*) as total_sessions,
  count(*) filter (where exists (
    select 1 from tapped_sessions ts
    where ts.session_id = sessions.session_id
  )) as tapped_sessions,
  round(100.0 * count(*) filter (where exists (
    select 1 from tapped_sessions ts
    where ts.session_id = sessions.session_id
  )) / count(*), 2) as tap_rate_pct
from sessions;
```

### 5.2 Heatmap de primer-tap (qué buscan al abrir Home)

```sql
with first_tap as (
  select distinct on (context->>'session_id')
    context->>'session_id' as session_id,
    element_id,
    slot,
    extract(epoch from (created_at - lag(created_at) over (
      partition by context->>'session_id' order by created_at
    ))) as ms_since_open
  from home_telemetry
  where event in ('home.opened', 'home.element_tapped')
    and created_at >= now() - interval '7 days'
  order by context->>'session_id', created_at
)
select
  element_id,
  slot,
  count(*) as taps,
  round(100.0 * count(*) / sum(count(*)) over (), 2) as pct_of_first_taps
from first_tap
where element_id is not null
group by element_id, slot
order by taps desc;
```

### 5.3 Bounce rate del Home

```sql
select
  date_trunc('day', created_at) as day,
  count(*) as opens,
  count(*) filter (where event = 'home.left_without_tap') as bounces,
  round(100.0 * count(*) filter (where event = 'home.left_without_tap') / count(*), 2) as bounce_rate_pct
from home_telemetry
where event in ('home.opened', 'home.left_without_tap')
  and created_at >= now() - interval '14 days'
group by 1
order by 1;
```

### 5.4 Tap rate de un chip nuevo (post Sprint)

```sql
with shown as (
  select context->>'session_id' as session_id
  from home_telemetry
  where event = 'home.element_shown'
    and element_id = $1  -- ej: 'top_category_chip'
    and created_at >= now() - interval '14 days'
),
tapped as (
  select context->>'session_id' as session_id
  from home_telemetry
  where event = 'home.element_tapped'
    and element_id = $1
    and created_at >= now() - interval '14 days'
)
select
  count(distinct shown.session_id) as shown_count,
  count(distinct tapped.session_id) as tapped_count,
  round(100.0 * count(distinct tapped.session_id) / count(distinct shown.session_id), 2) as tap_rate_pct
from shown
left join tapped on shown.session_id = tapped.session_id;
```

---

## 6. Plan de implementación

### Día 1-2 (al cierre del Sprint 0)

1. Migration `20260502000000_home_telemetry.sql` — escribir + revisar (no aplicar aún).
2. Wrappers `log-home-event.ts` + `use-home-telemetry.ts` + `use-track-element.ts`.
3. Wiring en HomeScreen para los 7 eventos baseline.
4. Type-check + tests del wrapper (similar a `single-entry-memo.test.ts`).

### Día 3 (post-aprobación de migration)

5. Aplicar migration a Supabase remoto (con autorización explícita del usuario, igual que las migrations advisor).
6. Verificar el RPC con un evento de prueba.
7. Empezar captura de baseline.

### Día 5-7

8. Análisis de baseline — ejecutar queries §5.1, §5.2, §5.3 y entregar matriz "los usuarios abren el Home buscando X, Y, Z" requerida por §4.1 del roadmap.
9. Decisión final del orden de Sprints 1-4 con la data en mano.

---

## 7. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| Volumen de eventos hace caer la perf del cliente | RPC fire-and-forget en background, no bloquea render. Si viéramos issues, batchear (V2). |
| Cantidad de rows en `home_telemetry` crece sin freno | Pruning mensual a 90 días + indexes correctos. |
| Cliente con red intermitente pierde eventos | Aceptable — mejor que un buffer local que complica state. Para análisis tactical (4-12 semanas) la pérdida ocasional no afecta señales agregadas. |
| Costo de inserts en hot paths del Home | Cada interacción es 1 RPC call. Si el Home tiene 100k MAU, es ~10-15 inserts/sesión × 5 sesiones/día = 5M inserts/mes. Supabase plan estándar lo soporta sin issue. |
| RLS bloquea inserts | Test explícito post-migration: insertar 1 evento y leerlo de vuelta como el mismo user. Si falla, fix antes de continuar. |
| Telemetría revela problemas que requieren acción inmediata | Beneficio, no riesgo. Lo que mide ahora va a guiar Sprints 1-4. |

---

## Resumen — Estado de implementación (2026-04-29)

| Componente | Archivo | Estado |
|---|---|---|
| Migration base | `supabase/migrations/20260502000000_home_telemetry.sql` | ✅ live en Supabase remoto |
| Migration follow-up (lockdown) | `supabase/migrations/20260502010000_home_telemetry_lockdown.sql` | ✅ live en Supabase remoto |
| Pure helpers (testables) | `mobile/features/home/home-telemetry-helpers.ts` | ✅ shipped |
| Client wrapper RPC | `mobile/features/home/log-home-event.ts` | ✅ shipped |
| Session hook | `mobile/features/home/use-home-telemetry.ts` | ✅ shipped |
| Element tracker hook | `mobile/features/home/use-track-element.ts` | ✅ shipped (con session-scoped shown memory) |
| Wiring HomeScreen baseline events | `mobile/screens/home/home-screen.tsx` | ✅ shipped (opened, closed, refreshed, scrolled_to_bottom, left_without_tap, reopened) |
| Wiring HomeDashboard element trackers | `mobile/components/home/home-dashboard.tsx` | ✅ shipped (header buttons, payday-pill, hero CTA, MonthSummary panels, activity rows + empty CTA) |
| Tests | `tests/unit/home-telemetry-helpers.test.ts` | ✅ 10 tests pasan |

### Fixes post code-review

| Fix | File:Line | Acción |
|---|---|---|
| **P0-1** Render-time `isReopen` flag | `use-home-telemetry.ts` | Capturar `{ isReopen, gapMs }` en render, no comparar `lastSessionId === sessionId` (tautológico) |
| **P0-2** Re-arm scroll-to-bottom en pull-to-refresh | `home-screen.tsx` | `reachedBottomRef.current = false` antes del refetch |
| **P1-2** `useTrackElement` session-scoped shown memory | `use-track-element.ts` | Module-level `SHOWN_KEYS` Set keyed por `${sessionId}:${elementId}` evita re-fire en remounts condicionales |
| **P1-4** Defense-in-depth revoke INSERT/UPDATE/DELETE | `20260502010000_home_telemetry_lockdown.sql` | Explicit revoke a `authenticated` y `anon` |

### Eventos cableados en este turn

Sobre 7 baseline + 9 elementos del Home actual:

- `home.opened` ✅
- `home.closed` ✅
- `home.refreshed` ✅
- `home.scrolled_to_bottom` ✅ (con re-arm)
- `home.left_without_tap` ✅
- `home.reopened_in_session` ✅ (correcto post fix P0-1)
- `home.element_tapped` ✅ — header_bell, header_settings, header_assistant, hero_setup_cta, payday_pill, month_summary_variables, month_summary_fixed, activity_row (delete), activity_empty_cta
- `home.element_shown` ✅ (vía `useTrackElement` — usado por chips de Sprint 1+ cuando entren)
- `home.element_dismissed` ✅ (cableado, usado por banners contextuales en S7)

### Falta para activar el análisis

Capturar baseline 5-7 días sobre el Home actual (los eventos ya fluyen). Después correr las queries §5.1-§5.4 del spec y producir la matriz de "los usuarios abren el Home buscando X, Y, Z" que reordena los Sprints.
