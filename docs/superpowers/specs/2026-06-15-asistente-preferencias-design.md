# Preferencias del Asistente Financiero — diseño

> 2026-06-15 · branch `feature/asistente-preferencias`. Surge de la
> auditoría multi-agente: la vista `asistente-preferences-screen.tsx` no
> ofrece nada configurable (3 secciones read-only/destructivas) y el
> sistema ya calcula datos ricos que nunca muestra.

## Decisiones de producto (owner, 2026-06-15)
1. **Card de valor:** mostrar ahorro **realizado** (mes/trimestre), sin
   proyectar. Si es $0 → ocultar la card.
2. **Persona override:** toggle "usar perfil inferido" (default ON) +
   override opcional entre los 4. Reversible.
3. **Controles de push:** **cross-device** → persisten en
   `notification_preferences` (DB), aplican en todos los devices.
4. **Stats por familia:** lenguaje natural ("actuás seguido / a veces /
   rara vez"), no porcentaje.

## Persistencia (split por dominio)
- **`user_advisor_prefs` (NUEVA)** — comportamiento del asistente:
  - `user_id uuid PK refs auth.users`
  - `use_inferred_persona boolean default true`
  - `persona_override text null CHECK in ('planner','firefighter','avoider','optimizer')`
  - `advisor_enabled boolean default true` (kill-switch total)
  - `updated_at timestamptz default now()`
  - RLS: select/insert/update own (espejo de `notification_preferences`).
- **`notification_preferences` (EXTENDER)** — delivery de push del asistente:
  - `advisor_push_enabled boolean default true` ("solo in-app" = false)
  - `advisor_quiet_start smallint default 22`, `advisor_quiet_end smallint default 8`
  - `advisor_push_min_urgency text default 'alta' CHECK in ('alta','media','baja')`

## Secciones de la pantalla (orden final)
1. **Lo que te ahorré** (#1) — lee `advisor_value_summary` (mes/trimestre,
   acciones, tipos). Oculta si 0. Hook nuevo `useAdvisorValueSummary`.
2. **Tu perfil** (#2) — card de persona + toggle "usar inferido" + (si OFF)
   SegmentedControl de 4. Override gana sobre `inferPersona`.
3. **Tus señales** (#3) — top 5 familias por CTR (shown≥3), lenguaje natural;
   oculta si totalShown<10. Reusa `useInteractionStats` (ya cargado).
4. **Notificaciones del asistente** (NUEVA) — On/Off total (#6), "solo en la
   app" (#6), quiet hours (#4 pickers 24h), urgencia mínima de push (#5
   segmented). Todo cross-device.
5. **Familias bloqueadas** (existente).
6. **Privacidad** (existente).

## Wiring
- **#2 persona:** `use-control-v2-data.ts` (~:484): si `!use_inferred_persona
  && persona_override` → usar override en vez de `inferPersona(stats)`.
- **#6 total off:** `use-control-v2-data.ts` memo `signals` → `[]` si
  `advisor_enabled===false` + empty-state "Asistente en pausa". El badge
  (`use-advisor-badge`) respeta el flag.
- **#4/#5/#6 push:** `use-advisor-notification-sync.ts` recibe las prefs como
  args (ya recibe SyncArgs): early-return si `!advisor_push_enabled`; usar
  `advisor_quiet_start/end` en `isQuietHour`; comparar `urgency` contra
  `advisor_push_min_urgency` (orden baja<media<alta). Mantener
  `confidence>=0.85` (default real verificado, NO 0.7).

## Plan de tandas
- **Tanda 1 (cero backend):** #1 + #3. Hook `useAdvisorValueSummary` +
  render de las 2 secciones read-only. Riesgo mínimo, valor inmediato.
- **Tanda 2 (backend nuevo):** migración `user_advisor_prefs` + hooks
  `useAdvisorPreferences`/`useUpdateAdvisorPreferences` (espejo de
  `use-notification-preferences`) + UI persona + wiring del override y el
  kill-switch total.
- **Tanda 3 (extiende notification_preferences):** columnas advisor_push_* +
  sección "Notificaciones del asistente" + wiring en el sync hook.

Cada tanda: typecheck + lint + `npx expo export` si toca deps; commit.

## No-goals (este scope)
- Confidence floor (#7), bloquear-desde-settings (#8), borrado granular (#9).
- Sync cross-device del cooldown cache (el cache de dedup sigue per-device;
  solo las PREFERENCIAS son cross-device).
