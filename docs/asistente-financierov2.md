# 📘 Asistente Financiero — Documentación Completa v2

> Capa de inteligencia local que detecta patrones, oportunidades y riesgos en las finanzas del usuario y los traduce en sugerencias accionables, no acumulables, con seguimiento periódico, **memoria de interacciones**, **razonamiento causal** y **prueba contable de valor entregado**.
>
> Documento audit-grade: cada fórmula, threshold, y flujo está verificado contra el código.
> **Versión 2** — incorpora capa cognitiva, fixes de unidades/TTL/race conditions, y diferenciadores únicos de mercado.
>
> **Documento canónico activo.** `docs/asistente-financiero.md` queda archivado como baseline v1.

---

## 🚦 Estado de integración

### P0 shipped — 2026-04-29

Capa **fundacional** integrada:

| Capacidad | Estado | Archivo |
|---|---|---|
| `impactScope` (`monthly` \| `oneTime` \| `cycle`) en `ControlAdvisorTask` | ✅ shipped | `control-v2-mock.ts:91` |
| `annualizedImpact()` en ranking — corrige unidades cruzadas | ✅ shipped | `control-signals.ts` |
| Stable tiebreak `score → annualized → urgency → id` | ✅ shipped | `control-signals.ts` |
| Diversity budget (≤3 por urgencia, ≤1 reinforcement, ≤2 supers) | ✅ shipped | `control-signals.ts` |
| TTL escalado por familia × ignoreCount (1–30d, ramp ×1.5 cap ×4) | ✅ shipped | `control-dismiss-store.ts` |
| Variable cooldown push por familia (4–168h) | ✅ shipped | `use-advisor-notification-sync.ts` |
| Quiet hours (22:00–08:00) — solo silencia push, no insert | ✅ shipped | `use-advisor-notification-sync.ts` |
| `insertedAt` ⊥ `pushedAt` — push se re-evalúa al salir de quiet hours | ✅ shipped | `use-advisor-notification-sync.ts` |
| Action kind `open-external-url` (https-only + Linking) | ✅ shipped | `control-action.ts`, dispatcher |
| Action kind `open-coach-mode` (route `/coach/[signalId]`) | ✅ shipped | `control-action.ts`, dispatcher |
| Circuit breaker en dispatcher (1500ms por key, kinds no-idempotentes) | ✅ shipped | `use-control-action-dispatcher.ts` |
| `dismissCard` debounce interno 1500ms — no inflar `ignoreCount` por doble-tap | ✅ shipped | `control-dismiss-store.ts` |
| Fix fusion `start-splurge` ⊕ `velocity` (regex captura el % real) | ✅ shipped | `control-signals.ts` |

### P1 shipped — 2026-04-29

Capa **cognitiva primer roundtrip** integrada (capa funcional sin DB live):

| Capacidad | Estado | Archivo |
|---|---|---|
| Señal atómica `high-single-expense` (T0, oneTime) | ✅ shipped | `control-signals.ts` |
| Señal atómica `duplicate-merchant` (descripción + price ±5%, 48h) | ✅ shipped | `control-signals.ts` |
| Señal atómica `data-gap-warning` (3–14d sin gastos cargados) | ✅ shipped | `control-signals.ts` |
| Señal atómica `savings-milestone` (meta 100% alcanzada) | ✅ shipped | `control-signals.ts` |
| Señal atómica `cycle-start-projection` (libreRatio < 25% al inicio del ciclo) | ✅ shipped | `control-signals.ts` |
| Señal atómica `income-missing` | ⏭️ deferred | requires payday-passed signal en adapter |
| Forecast 7d engine — `baseline / optimistic / pessimistic` + inflection days | ✅ shipped | `forecast-engine.ts` |
| Señal `forecast-tomorrow-risk` (peor DoW mañana + margen ajustado) | ✅ shipped | `control-signals.ts` |
| Señal `forecast-storm-week` (≥3 días distintos con cargos altos) | ✅ shipped | `control-signals.ts` |
| Señal `forecast-payday-gap` (pessimistic dailyAvg agota saldo antes del cobro) | ✅ shipped | `control-signals.ts` |
| Super-signal `super-perfect-storm` (fijos-ratio + velocity? + recovery, ≥2 alta) | ✅ shipped | `control-signals.ts` |
| Super-signal `super-savings-momentum` (streak + positive-forecast + cat-win/savings-over) | ✅ shipped | `control-signals.ts` |
| Super-signal `super-hidden-drain` (small-leaks + cat-dominance-* + undetected-sub-*, ≥2) | ✅ shipped | `control-signals.ts` |
| `advisor_interactions` table + RLS + `log_advisor_interaction()` RPC | ✅ live en Supabase remoto (2026-04-29) | `20260501000000_advisor_memory_layer.sql` |
| `advisor_value_log` table + `advisor_value_summary` view (security_invoker) + `log_advisor_value()` RPC | ✅ live en Supabase remoto | `20260501000000_advisor_memory_layer.sql` |
| `user_signal_blocklist` table + RLS owner-only | ✅ live en Supabase remoto | `20260501000000_advisor_memory_layer.sql` |
| `cron_prune_advisor_interactions()` mensual (180d retention) | ✅ live en Supabase remoto | `20260501000000_advisor_memory_layer.sql` |
| Hook `useInteractionStats(userId)` + `aggregateInteractionStats()` puro | ✅ shipped | `use-interaction-stats.ts` |
| `signalFamilyOf(signalId)` extractor (collapsing prefixes) | ✅ shipped | `use-interaction-stats.ts` |
| Auto-logging en dispatcher (`acted` / `dismissed`, fire-and-forget) | ✅ shipped | `use-control-action-dispatcher.ts` |
| `DispatchMeta` arg + `surface` tracking pasados desde `asistente-screen` | ✅ shipped | `use-control-action-dispatcher.ts`, `asistente-screen.tsx` |
| `inferPersona(stats)` — 4 personas / 3 framings, default `planner` cold-start | ✅ shipped | `persona.ts` |
| `composedOf?: string[]` field en `ControlAdvisorTask` para super-signals | ✅ shipped | `control-v2-mock.ts` |
| MaterialIcon avatars para 11 nuevos signal ids (atomic + forecast + super + duplicate + causal) | ✅ shipped | `asesor-signal-meta.ts` |

**Despliegue (2026-04-29)**: la migration `20260501000000_advisor_memory_layer.sql` fue aplicada al Supabase remoto (`supabase migration list` confirma `20260501000000` presente). El plumbing cliente está conectado — desde este punto:

- Cada `dispatch(action, meta)` en superficies `asistente_screen` / `coach-mode` registra una row en `advisor_interactions` (outcome `acted` o `dismissed`).
- `quick-savings-contribution` exitoso registra valor en `advisor_value_log` como `moved_to_savings` (1mo, no estimado).
- `savings-milestone` actuado registra `completed_goal` (1mo, no estimado).
- `useInteractionStats(userId)` empieza a devolver datos reales una vez que se acumulen rows; `inferPersona` gradualmente saldrá de `'planner'` cuando `totalShown >= 10`.
- El cron mensual `cron_prune_advisor_interactions()` borra rows >180d (programado vía `pg_cron`).

**`zombie` / `hike` value capture downstream**: pendiente de cablear en las mutations `delete-fixed-expense` / `update-fixed-expense` para registrar `cancelled_zombie` / `renegotiated_hike` solo cuando el cambio se confirma realmente, no cuando se abre el editor.

### P2 shipped — 2026-04-29

Capa **polish + valor demostrable** integrada:

| Capacidad | Estado | Archivo |
|---|---|---|
| Coach Mode screen real en `/(app)/coach/[signalId]` (hero + constituents para super-signals + CTA primaria + empty state) | ✅ shipped | `app/(app)/coach/[signalId].tsx`, `coach-mode-screen.tsx` |
| Stack registration de `coach/[signalId]` con presentación modal | ✅ shipped | `app-stack-shell.tsx` |
| Forecast 7d sparkline SVG (pessimistic dashed / baseline / optimistic area + inflection dots + DoW labels) | ✅ shipped | `forecast-sparkline.tsx` |
| `ForecastStrip` integrado en header de asistente entre TopBar y Constellation | ✅ shipped | `asistente-screen.tsx` |
| `forecast` field expuesto desde `useControlV2Data` | ✅ shipped | `use-control-v2-data.ts` |
| `log_advisor_value` client wrapper (fire-and-forget, valida `valueSaved >= 0`) | ✅ shipped | `log-advisor-value.ts` |
| Value capture: `quick-savings-contribution` success → `moved_to_savings` (1mo, no estimado) | ✅ shipped | dispatcher |
| Value capture: `savings-milestone acted` → `completed_goal` (1mo, no estimado) | ✅ shipped | dispatcher |
| Value capture zombie/hike: NO logean en CTA tap (sería over-eager — TODO downstream en mutación de fixed-expense) | ⏭️ deferred | dispatcher comentado |
| Persona inference live — `useControlV2Data(familyId, userId?)` invoca `useInteractionStats` + `inferPersona` | ✅ shipped | `use-control-v2-data.ts` |
| Copy variants por persona en `recovery-hard`, `velocity`, `fijos-ratio`, `positive-forecast` (loss/gain/neutral) | ✅ shipped | `control-signals-copy.ts`, `control-signals.ts` |
| `BuildSignalsArgs.persona` field + `framingFor()` resolution con default `'planner'` | ✅ shipped | `control-signals.ts`, `persona.ts` |
| Coach screen pasa `userId` para mantener consistencia de persona entre chat y deep view | ✅ shipped | `coach-mode-screen.tsx` |
| Sparkline DoW alignment con `startOfDay(tomorrow)` (mirror del engine, no drift en boundary nocturno) | ✅ shipped | `forecast-sparkline.tsx` |

### P3-A shipped — 2026-04-29

| Capacidad | Estado | Archivo |
|---|---|---|
| Value capture downstream `cancelled_zombie` en `useDeleteFixedExpense.onSuccess` cruzando con `zombie_alert` notif <30d | ✅ shipped | `fixed-expense-value-capture.ts`, `use-fixed-expenses.ts` |
| Value capture downstream `renegotiated_hike` en `useUpdateFixedExpense.onSuccess` cuando amount baja + `price_hike` notif <30d | ✅ shipped | `fixed-expense-value-capture.ts`, `use-fixed-expenses.ts` |
| Señal `income-missing` (T0, alta urgencia) consumiendo `isSalaryPendingConfirmation` del `usePayCycle` | ✅ shipped | `control-signals.ts`, `use-control-v2-data.ts` |
| `BuildSignalsArgs.paydayPending` field expuesto desde el adapter | ✅ shipped | `control-signals.ts` |
| Trust Receipt strip — `useAdvisorValueSummary` hook + `TrustReceiptStrip` component, integrado en header del asistente | ✅ shipped | `use-advisor-value-summary.ts`, `trust-receipt-strip.tsx` |
| Strip se oculta cuando `totalActions === 0` (no "te ahorré $0" en accounts vírgenes) | ✅ shipped | `trust-receipt-strip.tsx` |
| `useSignalBlocklist` + `useBlockSignalFamily` + `useUnblockSignalFamily` + `useSignalBlocklistEntries` hooks | ✅ shipped | `use-signal-blocklist.ts` |
| `BuildSignalsArgs.blockedFamilies` field + filtrado en `buildControlSignals` (drop antes del confidence floor) | ✅ shipped | `control-signals.ts` |
| Long-press en chat bubbles → Alert con "¿Por qué veo esto?" + "No mostrar más esta familia" + "Cancelar" | ✅ shipped | `asistente-screen.tsx` |

### P3-B shipped — 2026-04-29

| Capacidad | Estado | Archivo |
|---|---|---|
| Migration follow-up: policy `advisor_interactions_delete_own` + cron zombies daily | ✅ live en Supabase remoto (2026-04-29) | `20260501010000_advisor_followups.sql` |
| **Causal Engine** (`detectCausalLinks`) — Friday cascade, paired impulse, stress spending detectors | ✅ shipped | `causal-engine.ts` |
| Señal `causal-friday-cascade` (jueves preview, requiere ≥4 cascades) | ✅ shipped | `control-signals.ts` |
| Señal `causal-paired-impulse` (≥6 pairs en categoría) | ✅ shipped | `control-signals.ts` |
| Señal `causal-stress-spending` (≥3 stress days, ratio ≥1.3) | ✅ shipped | `control-signals.ts` |
| `BuildSignalsArgs.causalLinks` field + cómputo memoizado en adapter | ✅ shipped | `use-control-v2-data.ts` |
| Settings screen `/settings/asistente` (persona inferida + blocklist con unblock + clear-history) | ✅ shipped | `asistente-preferences-screen.tsx` |
| Stack registration de `settings/asistente` con `freezeOnBlur` | ✅ shipped | `app-stack-shell.tsx` |
| Settings entry "Preferencias del asistente" en main settings screen | ✅ shipped | `settings-screen.tsx` |
| Refactor: `signal-family.ts` puro (sin supabase) — `signalFamilyOf` + `aggregateInteractionStats` | ✅ shipped | `signal-family.ts` |
| Test suite — 26 tests nuevos en `cognitive-layer.test.ts` (forecast, causal, persona, stats, ranking) | ✅ shipped | `tests/unit/cognitive-layer.test.ts` |
| Fix regresión `control-signals.test.ts > member imbalance` (P0 diversity budget crowding test scenario) | ✅ shipped | `tests/unit/control-signals.test.ts` |

**Despliegue migration follow-up (2026-04-29)**: la migration `20260501010000_advisor_followups.sql` fue aplicada al Supabase remoto. Desde este punto:
- "Borrar mi historial" en `/settings/asistente` ejecuta el DELETE realmente (policy `advisor_interactions_delete_own` activa).
- Cron `cron_detect_zombies` re-programado a diario (`15 4 * * *` UTC). Latencia máxima de detección de zombies cae de 6 días a 24 horas.

## 📋 PENDIENTES — backlog explícito post-v2

> Todo lo que sigue está **fuera de scope del v2 shippable** y queda anotado para iteraciones futuras. Cada item incluye: bloqueante (qué impide shipearlo hoy), tipo de trabajo, y prioridad relativa.

### A. Bloqueados por datos / tiempo

| Item | Bloqueante | Tipo | Prioridad |
|---|---|---|---|
| **A/B test del framing por persona** | Requiere ≥4 semanas de `advisor_interactions` acumuladas para significancia estadística | Analytics + experimentación | Media — esperar Q3 2026 |
| **Predictive zombie pre-detection** | Necesita estabilizar baseline de `last_used_at` por usuario (mín. 60d de tracking) | Detector + cron adicional | Baja — el cron diario ya cubre el 90% del valor |
| **Per-signal CTR analytics dashboard** | Requiere ≥1k interacciones para insights accionables | Dashboard + RPC agregadora | Media — útil para tunear thresholds |

### B. Bloqueados por infra / config externa

| Item | Bloqueante | Tipo | Prioridad |
|---|---|---|---|
| **Push action buttons nativos** (`Cancelar` / `Pagar` desde push) | Requiere config de Expo notification categories + handler de dispatch al abrir | Native config + dispatcher routing | Alta — UX gain alto |
| **Morning digest push** (07:00 local) | Necesita otro cron + push template + lógica de "qué entra en el digest" | Cron + Edge Function | Media |
| **Conversation threads persistentes** (`asistente_conversations`) | Tabla ya prevista en schema §4 — falta migration + UI de hilo | Migration + UI | Baja — el modelo "card" actual funciona |
| **Cross-device dismiss sync** | Necesita tabla `advisor_dismissals` global + sync resolver | Migration + Real-time | Baja — el dismiss local-first es aceptable |

### C. Bloqueados por scope (necesitan diseño previo)

| Item | Bloqueante | Tipo | Prioridad |
|---|---|---|---|
| **Persona override manual** desde Settings | Hoy la persona es solo read-only en `/settings/asistente`. Override necesita tabla `user_advisor_prefs` o local-store + lógica de prioridad (override > inferred) | Migration o local-store + UI form | Media — útil para power users |
| **Family-aware aggregated signals** | Varias personas en una familia → señales que agregan comportamiento del hogar (no del usuario individual). Necesita repensar `signalFamilyOf` semántica + RLS para data agregada | Diseño + nueva clase de builders | Baja — alto esfuerzo, valor no validado |
| **Batch notification consolidation** (3+ signals → 1 push agrupado) | Necesita ventana de batching + template de "resumen" + decisión sobre quién es el "owner" del agrupamiento | Algoritmo + push template | Media |

### D. Calidad / robustez

| Item | Bloqueante | Tipo | Prioridad |
|---|---|---|---|
| **Test suite expandido** (top 12 builders individualmente + edge cases de ranking + fusion paths + super-signal composition) | Cobertura actual: 26 tests cognitivos + 10 control-signals integration. Falta: tests por builder, snapshots de copy, edge-case combinations | Vitest unit + snapshot | Alta — antes del próximo refactor mayor |
| **Test suite UI** (Coach Mode, Trust Receipt, Settings asistente render correcto en estados live/empty/error) | No hay tests UI hoy. Necesita setup Testing Library + RN | RTL + screen tests | Media |
| **Tests del causal-engine con datos reales** (replay de histórico anonimizado para validar precision/recall de los detectores) | Necesita pipeline para extraer + anonimizar histórico de production y un harness | Data pipeline + tests | Baja |

### E. Plataformas adicionales (XL effort)

| Item | Tipo | Prioridad |
|---|---|---|
| Widget iOS 16+ / Android | Native module + scoped data hook | Baja — depende de adopción |
| Apple Watch companion | watchOS app + sync | Baja |
| Export informe mensual PDF | PDF generation + share sheet | Baja |
| i18n + currency localization | i18n framework + currency helpers + reglas por locale | Baja — Argentina-first |

---

### Notas de priorización

- **P4-A** (datos/tiempo): no se pueden adelantar — solo esperar acumulación.
- **P4-B** (infra): el item de mayor leverage es **push action buttons** — convierte el push de "alerta" a "acción de 1 tap".
- **P4-C** (scope): **persona override manual** es la quick-win — cierra el feedback loop "el asistente me etiquetó mal y no puedo corregirlo".
- **P4-D** (calidad): el **test suite expandido** es la preparación para el siguiente refactor — sin él, cualquier cambio en el ranking/fusion arriesga regresiones silenciosas.
- **P4-E** (plataformas): out of scope hasta validar adopción base.

Cada sección de roadmap (§29) está marcada con su prioridad. Las secciones que documentan capacidades ya en código apuntan al archivo concreto.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Pipeline de datos end-to-end](#3-pipeline-de-datos-end-to-end)
4. [Esquemas de base de datos](#4-esquemas-de-base-de-datos)
5. [Hooks reactivos y queries](#5-hooks-reactivos-y-queries)
6. [Catálogo completo de señales (39 reglas)](#6-catálogo-completo-de-señales-39-reglas)
7. [Sistema de confianza](#7-sistema-de-confianza)
8. [Ranking, fusión, super-signals y cap](#8-ranking-fusión-super-signals-y-cap)
9. [Sistema de acciones (12 kinds)](#9-sistema-de-acciones-12-kinds)
10. [Sistema de dismiss (TTL escalado)](#10-sistema-de-dismiss-ttl-escalado)
11. [Sistema de notificaciones](#11-sistema-de-notificaciones)
12. [Server-side: crons y RPCs](#12-server-side-crons-y-rpcs)
13. [Capa cognitiva: Memory Layer](#13-capa-cognitiva-memory-layer)
14. [Capa cognitiva: Causal Insight Engine](#14-capa-cognitiva-causal-insight-engine)
15. [Capa cognitiva: Forecast 7-day Multi-Scenario](#15-capa-cognitiva-forecast-7-day-multi-scenario)
16. [Capa cognitiva: Counterfactual Value Tracking](#16-capa-cognitiva-counterfactual-value-tracking)
17. [Personalidad financiera + framing adaptativo](#17-personalidad-financiera--framing-adaptativo)
18. [Surface UI (visual)](#18-surface-ui-visual)
19. [Animaciones](#19-animaciones)
20. [Accesibilidad](#20-accesibilidad)
21. [Edge cases y resiliencia](#21-edge-cases-y-resiliencia)
22. [Time-of-day awareness](#22-time-of-day-awareness)
23. [Trust & transparencia](#23-trust--transparencia)
24. [Performance](#24-performance)
25. [Telemetría y testing](#25-telemetría-y-testing)
26. [Mapa de archivos](#26-mapa-de-archivos)
27. [Garantías de calidad](#27-garantías-de-calidad)
28. [Diferenciación vs competencia](#28-diferenciación-vs-competencia)
29. [Roadmap priorizado](#29-roadmap-priorizado)
30. [Apéndices](#30-apéndices)

---

## 1. Visión general

El **Asistente Financiero** es la capa de inteligencia del producto. Vive en dos superficies in-app:

- **Card compacto** en el Home (botón mint en el header) → preview teaser
- **Pantalla completa** `/asistente` (modal sheet desde abajo) → conversación + mini-mapa constellation

Es **completamente local-first**: las señales se calculan en el cliente desde datos reales de Supabase. **No hay LLM en runtime** — la "inteligencia" es un set determinístico de **39 reglas** que correlacionan datos para generar insights, complementadas por una **capa cognitiva** que aprende del comportamiento del usuario.

**Las 39 reglas se descomponen así**:
- **24 señales atómicas originales**
- **12 señales atómicas nuevas** (predictivas, causales, faltantes)
- **3 super-signals composicionales**

### Propósito
- Sugerencias **periódicas, no acumulables y de calidad declarada**
- No spammear; cuando aparece algo, vale la pena leerlo
- "El asistente te dice qué hacer" — no es chat conversacional
- **Aprende de cada interacción del usuario** — no es estático
- **Demuestra valor entregado** — no solo sugiere, prueba ahorro acumulado

### Filosofía
- Mismo input → mismo output (determinismo) **dentro de la misma personalidad inferida**
- Cap de 5 sugerencias máximas en pantalla
- Cooldown de 18h en push notifications (variable por tipo de signal)
- TTL de dismiss **escalado por urgencia y tipo**: 2-21 días según severidad
- "El asistente nunca compite con el usuario: no lo interrumpe, no lo culpa. Cuando aparece, tiene algo concreto que ofrecer."

### Tagline editorial
> "No es un chatbot. Es contabilidad cognitiva."

---

## 2. Arquitectura del sistema

```
┌───────────────────────────────────────────────────────────────┐
│  Datos reales (Supabase Postgres)                             │
│  · expenses, fixed_expenses, family_finance                   │
│  · monthly_summaries (rollup por ciclo cerrado)               │
│  · notifications (zombies, price-hikes, expense-logged…)      │
│  · velocity_snapshots (cron diario)                           │
│  · category_limits (caps por categoría)                       │
│  · savings_goals + user_streaks                               │
│  · advisor_interactions (NEW — memory layer)                  │
│  · advisor_value_log (NEW — counterfactual tracking)          │
│  · user_signal_blocklist (NEW — explicit feedback)            │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  RPC: home_snapshot(family_id)                                │
│  Devuelve un JSONB con TODO lo necesario en 1 query           │
│  Incluye ahora: interaction_history, value_log_summary        │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  use-control-v2-data.ts (adapter hook)                        │
│  · Compone BuildSignalsArgs                                   │
│  · ControlView (per-day breakdown, racha, vault, etc.)        │
│  · Memo-izado por familyId + última actualización             │
│  · Inyecta UserPersona (inferido de interactions)             │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  buildControlSignals(args) ── control-signals.ts              │
│  · 39 builders: atomics + super-signals composicionales       │
│  · MIN_CONFIDENCE = 0.4 → debajo, drop silencioso             │
│  · Confidence ramping: 5 tiers (T0/T1/T2/T3/T4)               │
│  · Persona-adaptive copy framing (3 variantes/builder)        │
│  · Causal Insight Engine inyecta nuevos signal types          │
│  · Forecast 7d alimenta señales predictivas                   │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
┌───────────────────────────────────────────────────────────────┐
│  fuseSignals + composeSuperSignals + ranking + cap 5          │
│  · annualizedImpact normaliza one-time vs monthly vs cycle    │
│  · score = urgencyWeight × max(1, annualized) × confidence    │
│  · sort DESC con tiebreak estable (impactRaw → urgency → id)  │
│  · Diversity budget: max 3 del mismo tipo, 1 reinforcement    │
│  · Super-signals reemplazan sus componentes                   │
└──────────────────────────┬────────────────────────────────────┘
                           ▼
                  ┌────────┴────────┐
                  ▼                 ▼
┌───────────────────────┐  ┌────────────────────────────────────┐
│  UI Surface           │  │  use-advisor-notification-sync    │
│  ControlV2AsesorCard  │  │  · Hidratación gate (no race)     │
│  AsistenteScreen      │  │  · Cooldown variable por signal   │
│  · Filter dismissed   │  │    type (6h–72h)                   │
│  · Render top 5       │  │  · Delivery window 8am-10pm local │
│  · Swipe-to-dismiss   │  │  · Batch consolidation si 2+ en   │
│  · CTA dispatcher     │  │    30min                           │
│  · Empty state ≠      │  │  · Push action buttons nativos    │
│    "AL DÍA" si        │  │  · SecureStore cache local        │
│    dismissed critical │  └────────────────────────────────────┘
└───────────┬───────────┘
            ▼
┌───────────────────────────────────────────────────────────────┐
│  use-control-action-dispatcher.ts (12 kinds únicos)           │
│  · 10 originales + open-external-url + open-coach-mode        │
│  · Circuit breaker: 3 fallos seguidos → cooldown 5min         │
│  · Undo toast 5s para acciones destructivas                   │
│  · Logs a advisor_interactions automáticamente                │
└───────────────────────────────────────────────────────────────┘
```

### Diagrama de capa cognitiva (NEW)

```
┌─────────────────────────────────────────────────────────┐
│  Capa Cognitiva (corre en paralelo al pipeline base)    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Memory Layer                                   │    │
│  │  · advisor_interactions table                   │    │
│  │  · CTR/effectiveness por signal_family          │    │
│  │  · Modula urgencia/copy de futuros signals     │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Causal Engine                                  │    │
│  │  · Detecta cascadas, impulsos pareados,        │    │
│  │    stress spending                              │    │
│  │  · Genera causal-* signals con explanation     │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Forecast Engine                                │    │
│  │  · Proyección 7d con 3 escenarios              │    │
│  │  · Inflection points detection                  │    │
│  │  · Genera forecast-* signals predictivos       │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Value Tracker                                  │    │
│  │  · advisor_value_log entries                    │    │
│  │  · Receipt UI: "Te ahorré $X este trimestre"   │    │
│  │  · Detección implícita de "acted" outcomes      │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────────────────────────────────┐    │
│  │  Persona Inference                              │    │
│  │  · planner | firefighter | avoider | optimizer  │    │
│  │  · Selecciona framing (loss/gain/neutral)      │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Pipeline de datos end-to-end

### Flujo completo: data → signal → UI → action → memory

```
USER OPENS /asistente
        ↓
[1] useControlV2Data(familyId) → React Query cache hit/miss
        ↓ miss
[2] supabase.rpc('home_snapshot', { familyId })
        → JSONB con: profile, family, family_finance,
          fixed_expenses, expenses (current cycle),
          categories, notifications (80 rows recientes),
          family_members, savings_goals,
          fixed_expense_payments (mes actual),
          monthly_summaries_history (last 6 DESC),
          category_limits, velocity_today,
          interaction_history (last 90 days), [NEW]
          value_log_summary (last 90 days), [NEW]
          user_signal_blocklist [NEW]
        ↓
[3] buildControlDataFromSnapshot(snapshot)
        → Compone ControlData + ControlView (igual que v1)
        ↓
[3.5] inferUserPersona(interactionHistory) [NEW]
        → 'planner' | 'firefighter' | 'avoider' | 'optimizer'
        → Disponible en buildSignalsArgs.persona
        ↓
[3.6] runCausalEngine(expenses, summaries) [NEW]
        → CausalLink[] detectados
        → Disponible en buildSignalsArgs.causalLinks
        ↓
[3.7] runForecastEngine(view, fixedExpenses, dowStats) [NEW]
        → Forecast { baseline, optimistic, pessimistic, inflection_days }
        → Disponible en buildSignalsArgs.forecast
        ↓
[4] buildControlSignals({
      view, expenses, fixedExpenses, summaries,
      categoriesExpense, limits, velocity,
      notifications, savingsGoal,
      cupoDiario, gastoHoy, diasRestantes,
      ingresoMes, fijosMes,
      dismissedHikes, baselines, now,
      persona,            // NEW
      causalLinks,        // NEW
      forecast,           // NEW
      interactionHistory, // NEW
      blocklist           // NEW
    })
        → Itera 39 builders + composeSuperSignals
        → Cada builder consulta blocklist (skip si bloqueado)
        → Cada builder usa persona para framing
        → fuseSignals: deduplica + reescala duplicates
        → Filter: confidence >= MIN_CONFIDENCE (0.4)
        → Sort: score DESC con tiebreak estable
        → Diversity budget: max 3 mismo tipo, 1 reinforcement
        → Slice top 5
        ↓
[5] UI render → ControlAdvisorTask[]
        → useDismissedIds() filtra los con TTL activo
        → Time-of-day filter: 22:00–02:00 oculta CRITICAL
        → AsistenteScreen renderiza chat bubbles
        → Receipt footer muestra value_log_summary [NEW]
        ↓
[5.5] analytics.track('advisor_signal_shown', ...) [NEW]
        ↓
USER TAPS CTA
        ↓
[6] useControlActionDispatcher.dispatch(task.action)
        → Circuit breaker check
        → switch (action.kind) { ... 12 kinds ... }
        → Auto-log a advisor_interactions [NEW]
        → Auto-log a advisor_value_log si aplica [NEW]
        → Undo toast 5s para acciones destructivas
        ↓
[6.5] analytics.track('advisor_signal_action', ...) [NEW]
        ↓
[7] (paralelo) useAdvisorNotificationSync
        → Wait for dismiss store hydration [FIX]
        → Filter signals: urgency='alta' AND conf>=0.7
        → Time-of-day check: 22:00–06:00 solo 'alta' urgent
        → Variable cooldown por signal type (6h–72h)
        → Batch consolidation si 2+ pending en 30min
        → INSERT INTO notifications (kind=`advisor_${id}`)
        → IF conf >= 0.85: send Expo push con action buttons
        → UPDATE cooldown cache: { [signalId]: Date.now() }
```

### Adapter: `BuildSignalsArgs` (extendido)

```typescript
interface BuildSignalsArgs {
  // === Original ===
  view: ControlView
  expenses: Expense[]
  fixedExpenses: FixedExpense[]
  categoriesExpense: Category[]
  summaries: MonthlySummaryHistory[]
  limits: CategoryLimit[]
  velocity: VelocitySnapshot | null
  notifications: NotificationLite[]
  savingsGoal: SavingsGoal | null
  cupoDiario: number
  gastoHoy: number
  diasRestantes: number
  ingresoMes: number
  fijosMes: number
  dismissedHikes?: Record<string, number>
  baselines?: UserBaselines
  now?: Date

  // === Cognitive layer (NEW) ===
  persona: UserPersona                  // 'planner' | 'firefighter' | 'avoider' | 'optimizer'
  causalLinks: CausalLink[]             // detectados en runtime
  forecast: Forecast7Day                // proyección multi-scenario
  interactionHistory: InteractionStats  // stats per signal_family
  blocklist: Set<string>                // signal_family IDs bloqueados por user
}

interface InteractionStats {
  perFamily: Record<string, {
    shown: number
    acted: number
    dismissed: number
    expired: number
    ctr: number              // acted / shown
    avgTimeToAction: number  // ms
    lastSeen: Date | null
    lastActed: Date | null
    consecutiveDismisses: number  // streak de dismisses sin actuar
  }>
  overall: {
    totalShown: number
    totalActed: number
    totalDismissed: number
    overallCtr: number
  }
}

type UserPersona = 'planner' | 'firefighter' | 'avoider' | 'optimizer'
```

---

## 4. Esquemas de base de datos

### Tablas existentes (mantenidas sin cambios)

`notifications`, `velocity_snapshots`, `monthly_summaries`, `savings_goals`, `user_streaks`, `category_limits`, `expenses`, `fixed_expenses`, `family_finance` — **sin cambios respecto a v1**.

### Tablas nuevas (capa cognitiva)

#### `advisor_interactions` ⭐ NEW
**Migración**: `20260501000000_advisor_memory_layer.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `family_id` | uuid | NOT NULL, FK cascaded |
| `user_id` | uuid | NOT NULL, FK auth.users |
| `signal_id` | text | NOT NULL ej. `'zombie-abc-123'` |
| `signal_family` | text | NOT NULL ej. `'zombie'` (para queries agregadas) |
| `outcome` | text | `'shown_only'\|'acted'\|'dismissed'\|'expired'\|'blocked'` |
| `surface` | text | `'control_card'\|'asistente_screen'\|'push_notification'` |
| `context` | jsonb | NOT NULL default `'{}'` — `{ confidence, urgency, impactRaw, dow, hour, persona }` |
| `time_to_action_ms` | int | nullable, ms entre shown y acted |
| `created_at` | timestamptz | default `now()` |

**Índices**:
- `advisor_interactions_user_family_idx (user_id, signal_family, created_at desc)`
- `advisor_interactions_family_outcome_idx (family_id, outcome, created_at desc)`

**RLS**: SELECT propio. INSERT solo via SECURITY DEFINER RPC `log_advisor_interaction()`.

**Pruning**: cron mensual `cron_prune_advisor_interactions()` elimina rows >180 días.

#### `advisor_value_log` ⭐ NEW
**Migración**: `20260501000000_advisor_memory_layer.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `family_id` | uuid | NOT NULL, FK cascaded |
| `user_id` | uuid | NOT NULL |
| `signal_id` | text | NOT NULL |
| `signal_family` | text | NOT NULL |
| `action_taken` | text | `'cancelled_zombie'\|'reduced_category'\|'moved_to_savings'\|'renegotiated_hike'\|'avoided_overspend'` |
| `value_saved` | numeric(14,2) | NOT NULL — valor mensual estimado |
| `value_horizon_months` | int | NOT NULL default 12 |
| `evidence` | jsonb | NOT NULL — datos que prueban el ahorro |
| `is_estimated` | boolean | true si fue inferred, false si user-confirmed |
| `acted_at` | timestamptz | default `now()` |

**Índices**:
- `advisor_value_log_user_idx (user_id, acted_at desc)`
- `advisor_value_log_family_idx (family_id, acted_at desc)`

**RLS**: SELECT propio en familia. INSERT via SECURITY DEFINER.

**Computed view** `advisor_value_summary`:
```sql
CREATE VIEW advisor_value_summary AS
SELECT
  user_id,
  family_id,
  SUM(value_saved * value_horizon_months) AS total_saved_lifetime,
  SUM(value_saved) FILTER (WHERE acted_at >= NOW() - INTERVAL '90 days') AS saved_quarter,
  SUM(value_saved) FILTER (WHERE acted_at >= NOW() - INTERVAL '30 days') AS saved_month,
  COUNT(*) AS total_actions,
  COUNT(DISTINCT signal_family) AS distinct_signal_families
FROM advisor_value_log
GROUP BY user_id, family_id;
```

#### `user_signal_blocklist` ⭐ NEW
**Migración**: `20260501000000_advisor_memory_layer.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `user_id` | uuid | NOT NULL |
| `signal_family` | text | NOT NULL ej. `'night-impulse'` |
| `reason` | text | nullable, copia del feedback del user |
| `blocked_at` | timestamptz | default `now()` |

**PK compuesta**: `(user_id, signal_family)`.

**RLS**: SELECT/INSERT/DELETE solo propio.

#### `asistente_conversations` ⭐ NEW (opcional, P3)
**Migración**: `20260501000001_asistente_threads.sql`

| Columna | Tipo | Notas |
|---------|------|-------|
| `id` | uuid | PK |
| `family_id` | uuid | NOT NULL, FK cascaded |
| `user_id` | uuid | NOT NULL |
| `thread_signal_id` | text | NOT NULL — el signal que originó el thread |
| `status` | text | `'open'\|'resolved'\|'snoozed'` |
| `created_at` | timestamptz | default `now()` |
| `resolved_at` | timestamptz | nullable |
| `resolution` | text | `'acted'\|'dismissed'\|'expired'` nullable |

---

## 5. Hooks reactivos y queries

### Hooks existentes (extendidos)

#### `useControlV2Data(familyId)`
**Archivo**: `mobile/features/insights/use-control-v2-data.ts`

Devuelve ahora:
```typescript
{
  data: ControlData,
  view: ControlView,
  signals: ControlAdvisorTask[],
  usingMock: boolean,
  // NEW
  persona: UserPersona,
  valueSummary: { saved_month: number, saved_quarter: number, saved_lifetime: number },
  forecast: Forecast7Day,
}
```

Queries que ejecuta:
1. `home_snapshot(familyId)` RPC (extendido con interaction_history + value_log_summary)
2. Implícitamente: `monthly_summaries` last 6
3. **NEW**: `advisor_interactions` last 90 días por user
4. **NEW**: `advisor_value_summary` view por user

### Hooks nuevos

#### `useUserPersona(userId)` ⭐ NEW
```typescript
// mobile/features/insights/use-user-persona.ts
function useUserPersona(userId: string): UserPersona {
  const { data: history } = useInteractionHistory(userId)
  return useMemo(() => inferPersona(history), [history])
}
```

#### `useSignalEffectiveness(signalFamily)` ⭐ NEW
```typescript
// mobile/features/insights/use-signal-effectiveness.ts
function useSignalEffectiveness(signalFamily: string): {
  ctr: number
  totalShown: number
  totalActed: number
  consecutiveDismisses: number
  lastActed: Date | null
} { ... }
```

#### `useAdvisorValueSummary()` ⭐ NEW
```typescript
// mobile/features/insights/use-advisor-value-summary.ts
function useAdvisorValueSummary(): {
  saved_month: number
  saved_quarter: number
  saved_lifetime: number
  top_action_family: string  // 'zombie' | 'savings' | etc.
  total_actions: number
} { ... }
```

#### `useDismissStoreHydrated()` ⭐ NEW (FIX)
```typescript
// mobile/features/insights/control-dismiss-store.ts
function useDismissStoreHydrated(): boolean { ... }
// Gate para useAdvisorNotificationSync — evita race condition
```

---

## 6. Catálogo completo de señales (39 reglas)

**Convención de unidades** (CORREGIDA):
- `impactRaw`: número crudo (puede ser monthly, oneTime, o cycle)
- `impactScope`: nuevo campo discriminador `'monthly' | 'oneTime' | 'cycle'`
- **Ranking usa `annualizedImpact()`** que normaliza a valor anualizado
- `body` muestra el formato más legible para humanos (no necesariamente el anualizado)

```typescript
function annualizedImpact(signal: ControlAdvisorTask): number {
  const raw = signal.impactRaw
  switch (signal.impactScope) {
    case 'monthly':  return raw * 12
    case 'oneTime':  return raw
    case 'cycle':    return raw * (365 / cycleDays)
  }
}
```

### 6.1 — Tabla resumen de las 39 señales

#### Atómicas originales (24)

| # | ID | Trigger | Urgencia | Tier | Scope | Type |
|---|----|---------|----------|------|-------|------|
| 1 | `stress-week` | 3+ fijos vencen en 7d | alta | T0 | oneTime | warning |
| 2 | `payday-proximity` | 1–14d cobro + capacidad <70% | media/alta | T0 | oneTime | warning |
| 3 | `start-splurge` | Primeros 3d >15% libreMes | media | T1 | cycle | warning |
| 4 | `end-acceleration` | Últimos 3d >130% promedio | alta | T1 | cycle | warning |
| 5 | `recovery-hard` | Sobre-gasto fuerza cupo <40% | alta | T0 | oneTime | critical |
| 6 | `recovery-soft` | Sobre-gasto modera cupo | media | T0 | oneTime | warning |
| 7 | `velocity` | forecast > 115% libre mes | media/alta | T1 | monthly | critical |
| 8 | `positive-forecast` | sobrante ≥ 2× cupo + meta | baja | T1 | oneTime | positive |
| 9 | `cat-accel` | Top cat +40% vs P75 4sem | media | T2 | monthly | warning |
| 10 | `cap-{cat}-{level}` | Cat supera warning/cap | media/alta | T0 | monthly | warning |
| 11 | `cat-dominance-{cat}` | Una cat >40% del total | media | T1 | monthly | insight |
| 12 | `cat-win` | Cat bajó al 30% histórico | baja | T2 | monthly | positive |
| 13 | `small-leaks` | 10+ gastos <$5k = >12% ciclo | media | T1 | monthly | insight |
| 14 | `night-impulse` | >70% discrecional 22-02h | media | T3 | monthly | insight |
| 15 | `undetected-sub-{amt}` | Mismo monto 2+ fechas | baja | T3 | monthly | insight |
| 16 | `weekly-pattern` | Peor DoW 1.4× / wkend 1.5× | baja | T3 | monthly | insight |
| 17 | `fijos-ratio` | Fijos >50% ingreso (≥60%=alta) | media/alta | T0 | monthly | critical |
| 18 | `income-volatility` | Ingreso ±10% vs 3m | baja/media | T2 | monthly | insight |
| 19 | `zombie-{id}` | Sub inactiva 2+ meses | alta | T4 | monthly | critical |
| 20 | `hike-{id}` | Fijo subió ≥10% | baja | T4 | monthly | warning |
| 21 | `savings-feasibility` | Plan corto este mes | media | T1 | monthly | warning |
| 22 | `savings-over` | Adelantado ≥15% (≥1 mes) | baja | T1 | monthly | positive |
| 23 | `member-imbalance-{userId}` | Miembro >70% discrecional | baja | T1 | monthly | insight |
| 24 | `streak-ok` | 3+ días consecutivos bajo cupo | baja | T0 | monthly | positive |

#### Atómicas nuevas (12) ⭐

| # | ID | Trigger | Urgencia | Tier | Scope | Type |
|---|----|---------|----------|------|-------|------|
| 25 | `high-single-expense` | Gasto único >30% cupo diario | media | T0 | oneTime | warning |
| 26 | `duplicate-merchant` | Mismo comercio + monto en <48h | baja | T0 | oneTime | insight |
| 27 | `data-gap-warning` | Sin gastos por 3+ días | baja | T0 | n/a | insight |
| 28 | `income-missing` | Payday pasó sin actualizar | alta | T0 | oneTime | critical |
| 29 | `savings-milestone` | Meta 100% alcanzada | baja | T0 | oneTime | positive |
| 30 | `cycle-start-projection` | Día 1-2: margen libre proyectado bajo | media | T0 | cycle | warning |
| 31 | `forecast-tomorrow-risk` | Mañana DoW peor + saldo apretado | media | T3 | oneTime | warning |
| 32 | `forecast-storm-week` | 3+ inflection points en 7d | alta | T1 | oneTime | critical |
| 33 | `forecast-payday-gap` | Proyección pessimista cruza zero antes de cobro | alta | T1 | oneTime | critical |
| 34 | `causal-friday-cascade` | Pattern: Friday > $20k → Saturday >1.5× | baja | T2 | monthly | insight |
| 35 | `causal-paired-impulse` | Misma cat, 2+ gastos en <3h, 6+ veces/30d | baja | T2 | monthly | insight |
| 36 | `causal-stress-spending` | Días con 4+ tx promedian 1.4× gasto | baja | T2 | monthly | insight |

#### Composicionales (super-signals) (3) ⭐

| # | ID | Compone | Urgencia | Type |
|---|----|---------|----------|------|
| 37 | `super-perfect-storm` | fijos-ratio + velocity + recovery-* | alta | critical |
| 38 | `super-savings-momentum` | streak-ok + positive-forecast + cat-win/savings-over | baja | positive |
| 39 | `super-hidden-drain` | small-leaks + cat-dominance-* + undetected-sub-* | media | insight |

### 6.2 — Detalle de las 12 señales nuevas

#### `high-single-expense`
```typescript
function buildHighSingleExpense(args): ControlAdvisorTask | null {
  const today = args.expenses.filter(e => isSameDay(e.created_at, args.now))
  const max = Math.max(...today.map(e => e.price))
  if (max < args.cupoDiario * 0.3) return null

  const expense = today.find(e => e.price === max)
  return {
    id: 'high-single-expense',
    title: 'Gasto único alto',
    body: `Hoy registraste ${formatMoney(max)} en un solo movimiento. Es ${Math.round(max/args.cupoDiario*100)}% del cupo diario.`,
    impactRaw: max,
    impactScope: 'oneTime',
    urgency: 'media',
    type: 'WARNING',
    confidence: 1.0,  // T0
    cat: 'comportamiento',
    cta: 'Ver detalle',
    action: { kind: 'open-expenses-filtered', filter: { focusExpenseId: expense.id } }
  }
}
```

#### `duplicate-merchant`
```typescript
function buildDuplicateMerchant(args): ControlAdvisorTask[] {
  // Group expenses last 48h by description (normalized) + price (±5%)
  const groups = groupSimilar(args.expenses, { hours: 48, priceTolerance: 0.05 })
  return groups
    .filter(g => g.length >= 2)
    .map(g => ({
      id: `duplicate-${normalize(g[0].description)}`,
      title: 'Posible cargo duplicado',
      body: `Detecté ${g.length} cargos similares de ${formatMoney(g[0].price)} en menos de 48h. ¿Confirmás que son distintos?`,
      impactRaw: g[0].price,
      impactScope: 'oneTime',
      urgency: 'baja',
      type: 'INSIGHT',
      confidence: 1.0,
      cta: 'Revisar',
      action: { kind: 'open-expenses-filtered', filter: { description: g[0].description } }
    }))
}
```

#### `data-gap-warning`
```typescript
function buildDataGapWarning(args): ControlAdvisorTask | null {
  const lastExpense = args.expenses[0]?.created_at
  const daysSince = lastExpense ? daysBetween(lastExpense, args.now) : 0
  if (daysSince < 3) return null

  return {
    id: 'data-gap-warning',
    title: 'Hace días sin registros',
    body: `Llevás ${daysSince} días sin gastos cargados. Si tuviste, registralos para que el asistente vea bien el panorama.`,
    impactRaw: 0,
    impactScope: 'oneTime',
    urgency: 'baja',
    type: 'INSIGHT',
    confidence: 1.0,
    cta: 'Cargar gastos',
    action: { kind: 'navigate', route: '/(app)/(tabs)/expenses', params: { action: 'add' } }
  }
}
```

#### `income-missing`
```typescript
function buildIncomeMissing(args): ControlAdvisorTask | null {
  const expectedPaydayPassed = args.diasRestantes < 0  // negativo = pasó
  if (!expectedPaydayPassed) return null
  if (Math.abs(args.diasRestantes) > 7) return null  // sólo en ventana de 7d post-payday

  return {
    id: 'income-missing',
    title: 'Cobro esperado no registrado',
    body: `Tu cobro estaba previsto hace ${Math.abs(args.diasRestantes)} días. Si llegó, actualizá el balance del nuevo ciclo. Si cambió, ajustá la fecha.`,
    impactRaw: args.ingresoMes,
    impactScope: 'oneTime',
    urgency: 'alta',
    type: 'CRITICAL',
    confidence: 1.0,
    cta: 'Actualizar',
    action: { kind: 'navigate', route: '/(app)/(tabs)/control', params: { action: 'confirm-cycle' } }
  }
}
```

#### `savings-milestone`
```typescript
function buildSavingsMilestone(args): ControlAdvisorTask | null {
  const goal = args.savingsGoal
  if (!goal || !goal.is_active) return null
  if (goal.current_amount < goal.goal_amount) return null

  return {
    id: 'savings-milestone',
    title: '¡Meta alcanzada! 🎯',
    body: `Llegaste al 100% de "${goal.title}". ${formatMoney(goal.current_amount)} ahorrados. ¿Crear una nueva meta?`,
    impactRaw: goal.goal_amount,
    impactScope: 'oneTime',
    urgency: 'baja',
    type: 'POSITIVE',
    confidence: 1.0,
    cta: 'Celebrar 🎉',
    action: { kind: 'open-savings-goal' }
  }
}
```

#### `cycle-start-projection`
```typescript
function buildCycleStartProjection(args): ControlAdvisorTask | null {
  const closedDays = args.view.detalleDias.filter(d => !d.inProgress).length
  if (closedDays > 2) return null  // sólo días 1-2 del ciclo

  const libre = args.ingresoMes - args.fijosMes - (args.savingsGoal?.target_monthly ?? 0)
  const libreRatio = libre / args.ingresoMes

  if (libreRatio >= 0.25) return null  // saludable

  return {
    id: 'cycle-start-projection',
    title: 'Ciclo arranca apretado',
    body: `Después de fijos y meta, te queda ${formatPct(libreRatio)} libre. Histórico saludable: ≥25%. Considerá pausar la meta este mes o renegociar algún fijo.`,
    impactRaw: Math.round(args.ingresoMes * 0.25 - libre),
    impactScope: 'monthly',
    urgency: 'media',
    type: 'WARNING',
    confidence: 1.0,
    cta: 'Ver fijos',
    action: { kind: 'navigate', route: '/(app)/(tabs)/fixed-expenses' }
  }
}
```

#### `forecast-tomorrow-risk`
```typescript
function buildForecastTomorrowRisk(args): ControlAdvisorTask | null {
  const tomorrow = addDays(args.now, 1)
  const tomorrowDow = dayOfWeek(tomorrow)
  const peorDow = args.view.peorDow
  if (!peorDow || peorDow.dow !== tomorrowDow) return null

  const remaining = args.view.restanteMes
  const expectedSpend = peorDow.average
  if (remaining > expectedSpend * 1.5) return null

  return {
    id: 'forecast-tomorrow-risk',
    title: 'Mañana es tu día riesgoso',
    body: `Mañana es ${dowName(tomorrowDow)}, tu peor día (promedio ${formatMoney(expectedSpend)}). Hoy te queda ${formatMoney(remaining)} libre — gastá menos de ${formatMoney(remaining - expectedSpend)} para no arrancar mañana en rojo.`,
    impactRaw: expectedSpend,
    impactScope: 'oneTime',
    urgency: 'media',
    type: 'WARNING',
    confidence: rampThreeWeeks(args.view.detalleDias.length),
    cta: 'Ver mañana',
    action: { kind: 'scroll-to-section', section: 'semana' }
  }
}
```

#### `forecast-storm-week`
```typescript
function buildForecastStormWeek(args): ControlAdvisorTask | null {
  const inflectionPoints = args.forecast.inflection_days
  if (inflectionPoints.length < 3) return null

  const totalImpact = inflectionPoints.reduce((sum, p) => sum + p.expected_amount, 0)

  return {
    id: 'forecast-storm-week',
    title: 'Semana cargada por delante',
    body: `Próximos 7 días: ${inflectionPoints.length} eventos importantes (${formatMoney(totalImpact)} en total). Reservá margen.`,
    impactRaw: totalImpact,
    impactScope: 'oneTime',
    urgency: 'alta',
    type: 'CRITICAL',
    confidence: rampOneCycle(args.view.detalleDias.length),
    cat: 'predictivo',
    cta: 'Ver semana',
    action: { kind: 'scroll-to-section', section: 'semana' }
  }
}
```

#### `forecast-payday-gap`
```typescript
function buildForecastPaydayGap(args): ControlAdvisorTask | null {
  const { pessimistic } = args.forecast
  const remaining = args.view.restanteMes
  if (pessimistic.totalProjected <= remaining) return null  // no hay gap

  const daysToZero = Math.floor(remaining / pessimistic.dailyAvg)
  if (daysToZero >= args.diasRestantes) return null

  const gapDays = args.diasRestantes - daysToZero

  return {
    id: 'forecast-payday-gap',
    title: 'Riesgo de quedar en cero',
    body: `Si mantenés el ritmo de los últimos 3 días, llegás a $0 unos ${gapDays} días antes del próximo cobro. Hay margen para corregir si recortás ahora.`,
    impactRaw: pessimistic.dailyAvg * gapDays,
    impactScope: 'oneTime',
    urgency: 'alta',
    type: 'CRITICAL',
    confidence: rampOneCycle(args.view.detalleDias.length),
    cat: 'predictivo',
    cta: 'Ajustar plan',
    action: { kind: 'navigate', route: '/(app)/(tabs)/control' }
  }
}
```

#### `causal-friday-cascade`
```typescript
function buildCausalFridayCascade(args): ControlAdvisorTask | null {
  const link = args.causalLinks.find(l =>
    l.cause.type === 'day' && l.cause.value === 'friday' &&
    l.effect.type === 'spending_spike' && l.occurrences >= 4
  )
  if (!link) return null

  const today = dayOfWeek(args.now)
  if (today !== 4 /* thursday */) return null  // sólo aviso jueves

  return {
    id: 'causal-friday-cascade',
    title: 'Patrón viernes-sábado',
    body: `Detecté ${link.occurrences} veces que un viernes con gasto alto dispara un sábado ${Math.round(link.effect.magnitude*100)}% más caro. Hoy es jueves: si mañana hay salida, ojo el sábado.`,
    impactRaw: link.effect.magnitude * 5000,  // estimación monthly
    impactScope: 'monthly',
    urgency: 'baja',
    type: 'INSIGHT',
    confidence: link.confidence,
    cat: 'patrón causal',
    cta: 'Entendido',
    action: { kind: 'dismiss', dismissId: 'causal-friday-cascade' }
  }
}
```

#### `causal-paired-impulse`
```typescript
function buildCausalPairedImpulse(args): ControlAdvisorTask | null {
  const link = args.causalLinks.find(l =>
    l.cause.type === 'category' &&
    l.effect.type === 'spending_spike' &&
    l.occurrences >= 6
  )
  if (!link) return null

  const catName = args.categoriesExpense.find(c => c.id === link.cause.value)?.name ?? 'esa categoría'

  return {
    id: `causal-paired-${link.cause.value}`,
    title: 'Compras pareadas',
    body: `Cuando comprás en ${catName}, ${Math.round(link.confidence*100)}% de las veces hay otro gasto similar en menos de 3h. Si te pasa hoy, esperá 24h antes del segundo.`,
    impactRaw: link.effect.magnitude,
    impactScope: 'monthly',
    urgency: 'baja',
    type: 'INSIGHT',
    confidence: link.confidence,
    cat: 'patrón causal',
    cta: 'Entendido',
    action: { kind: 'dismiss', dismissId: `causal-paired-${link.cause.value}` }
  }
}
```

#### `causal-stress-spending`
```typescript
function buildCausalStressSpending(args): ControlAdvisorTask | null {
  const link = args.causalLinks.find(l =>
    l.cause.type === 'time' && l.cause.value === 'multi-tx-day' &&
    l.effect.type === 'spending_spike'
  )
  if (!link || link.occurrences < 3) return null

  return {
    id: 'causal-stress-spending',
    title: 'Días de muchas compras chicas',
    body: `Detecté ${link.occurrences} días con 4+ transacciones — esos días gastás ${Math.round(link.effect.magnitude*100)}% más en promedio, mayoritariamente en discrecional. Probá una pausa antes de la 5ta compra del día.`,
    impactRaw: link.effect.magnitude * 8000,
    impactScope: 'monthly',
    urgency: 'baja',
    type: 'INSIGHT',
    confidence: link.confidence,
    cat: 'patrón causal',
    cta: 'Entendido',
    action: { kind: 'dismiss', dismissId: 'causal-stress-spending' }
  }
}
```

### 6.3 — Detalle de los 3 super-signals

#### `super-perfect-storm`

**Composition rule**:
```typescript
{
  id: 'super-perfect-storm',
  requires: ['fijos-ratio', 'velocity', 'recovery-hard|recovery-soft'],
  minMatch: 3,
  when: ({ urgencies }) => urgencies.filter(u => u === 'alta').length >= 2
}
```

**Output**:
```typescript
{
  id: 'super-perfect-storm',
  title: 'Confluencia crítica',
  body: 'Tres factores se alinean: fijos altos (62% ingreso), velocidad fuera de control (+18%), y faltan 11 días al cobro. Plan urgente sugerido.',
  composedOf: ['fijos-ratio', 'velocity', 'recovery-hard'],
  type: 'CRITICAL',
  urgency: 'alta',
  impactRaw: sum(componentImpactsAnnualized) * 1.2,  // boost por confluencia
  impactScope: 'oneTime',
  confidence: min(componentConfidences),
  cta: 'Plan integral',
  action: { kind: 'open-coach-mode', topic: 'crisis' }
}
```

**UI especial**: card más grande, los 3 signals constituyentes como bullets internas, una sola CTA macro.

#### `super-savings-momentum`

**Composition rule**:
```typescript
{
  id: 'super-savings-momentum',
  requires: ['streak-ok', 'positive-forecast', 'cat-win|savings-over'],
  minMatch: 3,
  when: ({ types }) => types.every(t => t === 'POSITIVE')
}
```

**Output**:
```typescript
{
  title: 'Momentum positivo',
  body: 'Llevás 12 días bajo cupo, vas a cerrar el ciclo con sobrante, y "Restaurantes" bajó 35% vs histórico. Es el momento de subir la meta de ahorro.',
  composedOf: ['streak-ok', 'positive-forecast', 'cat-win'],
  type: 'POSITIVE',
  urgency: 'baja',
  cta: 'Capitalizar',
  action: { kind: 'open-savings-goal', params: { suggest_increase: true } }
}
```

#### `super-hidden-drain`

**Composition rule**:
```typescript
{
  id: 'super-hidden-drain',
  requires: ['small-leaks', 'cat-dominance-*', 'undetected-sub-*'],
  minMatch: 2,
  when: () => true
}
```

**Output**:
```typescript
{
  title: 'Drenaje invisible',
  body: 'Los gastos chicos suman 18% del ciclo, una categoría domina 42%, y hay 2 montos repetidos sin registrar como fijos. Auditoría sugerida.',
  composedOf: ['small-leaks', 'cat-dominance-restaurantes', 'undetected-sub-3500'],
  type: 'INSIGHT',
  urgency: 'media',
  cta: 'Auditar',
  action: { kind: 'open-coach-mode', topic: 'leaks' }
}
```

### 6.4 — Tipos semánticos (UI tone)

- **POSITIVE** (verde) — refuerzo: streak, cat-win, savings-over, positive-forecast, savings-milestone, super-savings-momentum
- **WARNING** (amarillo) — atención: stress, payday, splurge, soft, cap, cycle-start, forecast-tomorrow, etc.
- **CRITICAL** (peach) — acción urgente: recovery-hard, velocity, fijos-ratio, zombie, income-missing, forecast-storm, forecast-payday-gap, super-perfect-storm
- **INSIGHT** (neutro) — patrón: dominance, leaks, night, weekly, sub, member, causal-*, super-hidden-drain

---

## 7. Sistema de confianza

`confidence ∈ [0, 1]` por señal. **Mínimo para surface: 0.4**. Bajo eso, drop silencioso.

### 7.1 — Tiers de ramping (5 tiers)

| Tier | Cómo se calcula | Días requeridos | Ejemplos |
|------|-----------------|-----------------|----------|
| **T0 — real-time** | `1.0 × freshnessPenalty` | 0 | stress-week, payday, recovery-*, caps, fijos-ratio, streak-ok, high-single-expense |
| **T1 — 1 ciclo** | `closedDays / 14 × freshnessPenalty` | ~7-14 | start-splurge, velocity, cat-dominance, savings-* |
| **T2 — 3 ciclos** | `T1 × (summariesCount / 3)` | ~14d + 3 ciclos | cat-accel, cat-win, income-volatility, causal-* |
| **T3 — 60 días** | `closedDays / 21 × freshnessPenalty` | ~21 | night-impulse, weekly-pattern, undetected-sub, forecast-tomorrow-risk |
| **T4 — external** ⭐ NEW | `0.9` fija (cron-detected) | n/a | zombies, hikes |

### 7.2 — Helpers de ramping

```typescript
function rampOneCycle(closedDays: number): number {
  return Math.max(0, Math.min(1, closedDays / 14))
}
function rampSummaries(count: number): number {
  return Math.max(0, Math.min(1, count / 3))
}
function rampThreeWeeks(closedDays: number): number {
  return Math.max(0, Math.min(1, closedDays / 21))
}

// NEW: Penalty por datos viejos
function freshnessPenalty(lastExpenseDate: Date | null, now: Date): number {
  if (!lastExpenseDate) return 0.5  // sin datos = mucha duda
  const daysSince = daysBetween(lastExpenseDate, now)
  if (daysSince <= 2) return 1.0
  return Math.max(0.3, 1 - (daysSince - 2) * 0.1)
  // 3d → 0.9, 5d → 0.7, 10d → 0.2 → clamped 0.3
}
```

### 7.3 — Surfacing en UI (`ConfidenceChip`)

| Tier | Threshold | UI |
|------|-----------|-----|
| `solid` | conf ≥ 0.85 | sin chip — la señal habla por sí misma |
| `building` | 0.6 ≤ conf < 0.85 | chip "evidencia parcial" + icon `pending` |
| `early` | conf < 0.6 | chip "señal temprana · Nd" + icon `history` |

### 7.4 — Confianza modulada por interaction history (NEW)

```typescript
function adjustConfidenceByHistory(
  baseConfidence: number,
  signalFamily: string,
  history: InteractionStats
): number {
  const stats = history.perFamily[signalFamily]
  if (!stats || stats.shown < 5) return baseConfidence  // muy pocos datos

  // Si CTR es muy alto (>0.6) → boost confianza (señal probada)
  if (stats.ctr > 0.6) return Math.min(1, baseConfidence * 1.15)

  // Si dismisses consecutivos > 3 → penalize
  if (stats.consecutiveDismisses >= 3) return baseConfidence * 0.7

  return baseConfidence
}
```

El usuario sabe cuándo el sistema tiene certeza vs cuándo está aprendiendo. **No simula certidumbre falsa.**

---

## 8. Ranking, fusión, super-signals y cap

### 8.1 — Fórmula de score (CORREGIDA)

```typescript
score(signal) =
  urgencyWeight(urgency) ×
  Math.max(1, annualizedImpact(signal)) ×    // ⭐ NEW: normalizado a anual
  confidence

// urgencyWeight: alta=3, media=2, baja=1
```

### 8.2 — Orden con tiebreak estable

```typescript
signals.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score
  if (b.impactRaw !== a.impactRaw) return b.impactRaw - a.impactRaw
  // ⭐ NEW: tiebreaks adicionales para estabilidad
  const urgencyA = URGENCY_ORDER[a.urgency]
  const urgencyB = URGENCY_ORDER[b.urgency]
  if (urgencyB !== urgencyA) return urgencyB - urgencyA
  return a.id.localeCompare(b.id)  // estable, lexicográfico
})
```

### 8.3 — Fusión (`fuseSignals`)

Antes de rankear, dedupes signals que apuntan al mismo dominio (ej. `cat-accel` + `cat-dominance` para la misma categoría):

```typescript
// Si cat-accel y cat-dominance apuntan a la misma cat:
const winner = catAccel  // gana el de mayor score
winner.impactRaw = catAccel.impactRaw + Math.round(dominance.impactRaw * 0.5)
// el otro se descarta
```

### 8.4 — Composición de super-signals ⭐ NEW

```typescript
function composeSuperSignals(
  atomics: ControlAdvisorTask[],
  rules: CompositionRule[]
): ControlAdvisorTask[] {
  const consumed = new Set<string>()
  const supers: ControlAdvisorTask[] = []

  for (const rule of rules) {
    const matches = atomics.filter(s => matchesRequirement(s.id, rule.requires))
    if (matches.length < rule.minMatch) continue
    if (rule.when && !rule.when(matches)) continue

    const superSignal = buildSuperSignal(rule, matches)
    supers.push(superSignal)
    matches.forEach(m => consumed.add(m.id))
  }

  // Atomicas que no fueron consumidas + super-signals
  return [...atomics.filter(s => !consumed.has(s.id)), ...supers]
}
```

### 8.5 — Diversity budget ⭐ NEW

```typescript
function applyDiversityBudget(ranked: ControlAdvisorTask[]): ControlAdvisorTask[] {
  const result: ControlAdvisorTask[] = []
  const counts = { CRITICAL: 0, WARNING: 0, INSIGHT: 0, POSITIVE: 0 }
  const MAX_PER_TYPE = 3
  const MAX_REINFORCEMENT = 1

  for (const sig of ranked) {
    if (result.length >= MAX_SIGNALS) break

    if (sig.type === 'POSITIVE' && counts.POSITIVE >= MAX_REINFORCEMENT) continue
    if (counts[sig.type] >= MAX_PER_TYPE) continue

    result.push(sig)
    counts[sig.type]++
  }

  return result
}
```

### 8.6 — Pipeline completo

```typescript
function rankAndCapSignals(rawSignals: ControlAdvisorTask[]): ControlAdvisorTask[] {
  const fused = fuseSignals(rawSignals)
  const composed = composeSuperSignals(fused, COMPOSITION_RULES)
  const filtered = composed.filter(s => s.confidence >= MIN_CONFIDENCE)
  const sorted = filtered.sort(scoreCmp)
  const diverse = applyDiversityBudget(sorted)
  return diverse  // ya cap-ed
}
```

### 8.7 — Ejemplo de cálculo (NUEVO con annualized)

```
Tarea A: zombie-disney
  · impactRaw=2000, scope=monthly → annualized=24000
  · score = 3 × 24000 × 0.9 = 64,800

Tarea B: recovery-hard
  · impactRaw=50000, scope=oneTime → annualized=50000
  · score = 3 × 50000 × 1.0 = 150,000

Tarea C: cat-accel restaurantes
  · impactRaw=15000, scope=monthly → annualized=180000
  · score = 2 × 180000 × 0.7 = 252,000

Sort: C(252k) > B(150k) > A(64.8k)
```

**Nota clave**: bajo el sistema viejo (sin annualized), el ranking habría sido B > C > A — favoreciendo lo one-time injustamente. Ahora `cat-accel` (que cuesta $180k/año si no se actúa) gana correctamente sobre `recovery-hard` ($50k one-time).

---

## 9. Sistema de acciones (12 kinds)

Cada `action.kind` es una experiencia distinta. La UI los traduce a icono + haptic + label fallback únicos via `asesor-action-meta.ts`.

### 9.1 — Tabla resumen

| Kind | Icon | Haptic | Fallback label | Reversible | NEW |
|------|------|--------|----------------|------------|-----|
| `navigate` | `north-east` | selection | "Abrir" | n/a | |
| `open-fixed-expense` | `tune` | selection | "Ajustar" | ✅ | |
| `open-expenses-filtered` | `filter-list` | selection | "Explorar" | n/a | |
| `open-add-fixed-prefilled` | `add-circle-outline` | selection | "Registrar" | ✅ | |
| `open-savings-goal` | `flag` | selection | "Ver meta" | ✅ | |
| `open-streak-sheet` | `local-fire-department` | success | "Ver racha" | n/a | |
| `scroll-to-section` | `south` | selection | "Ir a sección" | n/a | |
| `send-member-warning` | `campaign` | warning | "Avisar" | ❌ | |
| `quick-savings-contribution` | `savings` | success | "Mover ahora" | ⚠️ undo 5s | FIXED |
| `dismiss` | `check-circle` | success | "Entendido" | ✅ TTL 7d | |
| `open-external-url` | `open-in-new` | selection | "Comparar" | n/a | ⭐ |
| `open-coach-mode` | `psychology` | medium | "Sesión guiada" | n/a | ⭐ |

### 9.2 — Detalle de los 2 nuevos kinds

#### `open-external-url` ⭐ NEW
```typescript
case 'open-external-url': {
  // SafariViewController iOS / Chrome Custom Tab Android
  WebBrowser.openBrowserAsync(action.url, {
    presentationStyle: 'pageSheet',
    enableBarCollapsing: true,
  })
  // Log interaction outcome='acted'
  logInteraction(task.id, 'acted', { destination: action.url })
}
```

Usado por `hike-*` para "Comparar precios" llevando a comparadores externos.

#### `open-coach-mode` ⭐ NEW
```typescript
case 'open-coach-mode': {
  router.push({
    pathname: '/(app)/asistente/coach',
    params: { topic: action.topic, signalIds: action.relatedSignalIds.join(',') }
  })
}
```

Modo concentrado donde el asistente presenta signals secuencialmente (ver § 18.4).

### 9.3 — Mejora en `quick-savings-contribution` (FIX)

```typescript
case 'quick-savings-contribution': {
  if (!savingsGoal) {
    Alert.alert('Sin meta activa', 'Creá una meta primero.')
    return
  }
  Alert.alert(
    'Mover a tu meta',
    `Vamos a mover ${formatMoney(action.amount)} a '${savingsGoal.title}'.`,
    [
      { text: 'Cancelar' },
      { text: 'Confirmar', onPress: async () => {
        try {
          const result = await addContributionMutation.mutateAsync({...})

          // ⭐ NEW: Undo toast con 5s window
          showUndoToast({
            message: `${formatMoney(action.amount)} movidos a "${savingsGoal.title}"`,
            duration: 5000,
            onUndo: async () => {
              await reverseContributionMutation.mutateAsync({
                contributionId: result.id
              })
              triggerHaptic('warning')
            }
          })

          triggerHaptic('success')
          dismissCard(action.dismissId)

          // ⭐ NEW: Log to value tracker
          logValueAction({
            signalId: task.id,
            actionTaken: 'moved_to_savings',
            valueSaved: action.amount,
            valueHorizonMonths: 1,  // one-time, no anualizado
            evidence: { goalId: savingsGoal.id, contributionId: result.id }
          })

        } catch (error) {
          Alert.alert('No pudimos mover', 'Reintentá en unos segundos.')
          triggerHaptic('error')
          // ⭐ FIX: NO dismissear si falló
        }
      }}
    ]
  )
}
```

### 9.4 — Circuit breaker ⭐ NEW

```typescript
const dispatcherCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 5 * 60 * 1000,  // 5 minutos
  fallback: (action) => {
    Alert.alert(
      'Servicio temporalmente no disponible',
      'Probá de nuevo en unos minutos.'
    )
  }
})

async function dispatch(action: ControlAction) {
  return dispatcherCircuitBreaker.execute(() => dispatchInner(action))
}
```

Si `quick-savings-contribution` o `send-member-warning` fallan 3 veces seguidas (network/RPC issues), el dispatcher rechaza intentos por 5 minutos.

### 9.5 — Auto-logging a `advisor_interactions` ⭐ NEW

Cada acción del dispatcher logea automáticamente:

```typescript
async function dispatchInner(action: ControlAction, task: ControlAdvisorTask) {
  const startedAt = Date.now()
  try {
    await executeAction(action)
    await logInteraction({
      signalId: task.id,
      signalFamily: extractFamily(task.id),
      outcome: 'acted',
      surface: currentSurface,
      context: {
        confidence: task.confidence,
        urgency: task.urgency,
        impactRaw: task.impactRaw,
        dow: new Date().getDay(),
        hour: new Date().getHours(),
        persona: currentPersona,
      },
      timeToActionMs: Date.now() - startedAt,
    })
  } catch (e) {
    // log failed action
  }
}
```

---

## 10. Sistema de dismiss (TTL escalado)

**Archivo**: `mobile/features/insights/control-dismiss-store.ts`

### 10.1 — API

```typescript
function dismissCard(id: string, signal?: ControlAdvisorTask): void
function isDismissed(id: string): boolean
function dismissedIgnoreCount(id: string): number
function useDismissedIds(): ReadonlySet<string>
function clearExpired(): void
function useDismissStoreHydrated(): boolean   // ⭐ NEW: gate para race fix
```

### 10.2 — Persistencia

- **Native**: `expo-secure-store`
- **Web**: `localStorage`
- **Local-first**: no syncea entre devices

### 10.3 — TTL escalado (CORREGIDO) ⭐

```typescript
// control-dismiss-store.ts
const TTL_BY_TYPE: Record<SignalType, Record<Urgency, number>> = {
  CRITICAL: { alta: 2,  media: 5,  baja: 7  },  // críticas vuelven rápido
  WARNING:  { alta: 3,  media: 7,  baja: 10 },  // default
  INSIGHT:  { alta: 5,  media: 10, baja: 14 },  // educativos toleran snooze largo
  POSITIVE: { alta: 7,  media: 14, baja: 21 },  // refuerzos: no quemar
}

function computeDismissTtl(signal: ControlAdvisorTask): number {
  return TTL_BY_TYPE[signal.type][signal.urgency]
}

function dismissCard(id: string, signal?: ControlAdvisorTask) {
  const ttlDays = signal ? computeDismissTtl(signal) : 7  // fallback default
  const expiresAt = Date.now() + ttlDays * DAY_MS
  store.set(id, { dismissedAt: Date.now(), expiresAt, ignoreCount: (store.get(id)?.ignoreCount ?? 0) + 1 })
}
```

### 10.4 — Override de dismiss por cambio significativo ⭐ NEW

```typescript
function shouldOverrideDismiss(
  signalId: string,
  currentImpactRaw: number,
  storedAt: number
): boolean {
  const dismissed = store.get(signalId)
  if (!dismissed) return false

  // Si la condición empeoró ≥25% → resurface
  const previousImpact = dismissed.context?.impactRaw ?? 0
  const delta = (currentImpactRaw - previousImpact) / Math.max(previousImpact, 1)
  return delta >= 0.25
}
```

Aplicación en el filter del UI:

```typescript
const visibleSignals = signals.filter(s => {
  if (!isDismissed(s.id)) return true
  if (shouldOverrideDismiss(s.id, s.impactRaw, ...)) return true
  return false
})
```

### 10.5 — `ignoreCount` aplicado (NEW)

Cada dismiss incrementa el contador. Los builders consultan via `dismissedIgnoreCount(id)`:

```typescript
function buildSmallLeaks(args): ControlAdvisorTask | null {
  // ... lógica base ...

  const ignoreCount = dismissedIgnoreCount('small-leaks')
  if (ignoreCount >= 3) {
    // Usuario lo ignoró 3+ veces → degradar a INSIGHT con copy diferente
    return {
      ...baseSignal,
      urgency: 'baja',
      body: `Seguís viendo gastos chicos hace 3 ciclos — quizás quieras revisar el filtro general antes de la próxima sugerencia.`,
    }
  }

  return baseSignal
}
```

### 10.6 — Disparadores

1. **Swipe-to-dismiss**: `SwipeableRow` con acción derecha "Visto"
2. **CTA "Entendido"**: signals con `action.kind === 'dismiss'`
3. **Auto-dismiss**: tras `quick-savings-contribution` exitosa
4. **Long-press menu** ⭐ NEW:
   - "Visto (snooze TTL)"
   - "Snooze 30 días"
   - "No me interesa nunca" → INSERT en `user_signal_blocklist`
   - "Dame menos así" → ajusta personal threshold

### 10.7 — Helper único: `dismissKeyFor(task)`

```typescript
function dismissKeyFor(task: ControlAdvisorTask): string {
  return task.action?.kind === 'dismiss' ? task.action.dismissId : task.id
}
```

---

## 11. Sistema de notificaciones

**Archivo**: `mobile/features/insights/use-advisor-notification-sync.ts`

### 11.1 — Pipeline (CORREGIDO con hidratación gate)

```
[Dismiss store hydrated?] → si NO, esperar
        ↓
Signals (hasta 5) → Filter (urgency='alta' AND conf>=0.7)
                  → Time-of-day check (skip 22:00-06:00 if !alta)
                  → For each: shouldPipe(id)?
                      ↓ (true)
                  → Add to pending queue (30min batch window)
                  → Si hay 2+ pending:
                      → Consolidar en 1 push: "Tenés N alertas"
                  → Si hay 1:
                      → INSERT INTO notifications
                      → IF conf >= 0.85: send Expo push con action buttons
                  → UPDATE cooldown cache: { [id]: Date.now() }
```

### 11.2 — Filtros

```typescript
const candidates = signals.filter(s =>
  s.urgency === 'alta' &&
  s.confidence >= 0.7 &&
  shouldPipe(s.id) &&
  !isInBlocklist(extractFamily(s.id))  // ⭐ NEW
)
```

### 11.3 — Cooldown variable por signal type ⭐ NEW

```typescript
const COOLDOWN_BY_TYPE: Record<string, number> = {
  // signal_family → hours
  'recovery-hard':       6,    // urgente, alto valor
  'recovery-soft':       12,
  'velocity':            8,
  'fijos-ratio':         48,   // estructural, no cambia rápido
  'zombie':              72,   // detectado por cron, ya estable
  'hike':                48,
  'income-missing':      6,
  'forecast-storm-week': 24,
  'forecast-payday-gap': 12,
  // Refuerzos NUNCA push
  'streak-ok':           Infinity,
  'cat-win':             Infinity,
  'savings-over':        Infinity,
  'savings-milestone':   Infinity,  // celebración → in-app sí, push no
  // Default
  '_default':            18,
}

function getCooldownHours(signalId: string): number {
  const family = extractFamily(signalId)
  return COOLDOWN_BY_TYPE[family] ?? COOLDOWN_BY_TYPE._default
}

function shouldPipe(signalId: string): boolean {
  const last = cache[signalId]
  if (last == null) return true
  const cooldownMs = getCooldownHours(signalId) * HOUR_MS
  return Date.now() - last >= cooldownMs
}
```

### 11.4 — Time-of-day gating ⭐ NEW

```typescript
function isWithinDeliveryWindow(now: Date, urgency: Urgency): boolean {
  const hour = now.getHours()  // local time
  // 22:00–06:00: solo urgency='alta' (críticas)
  if (hour >= 22 || hour < 6) return urgency === 'alta'
  // 06:00–22:00: cualquier urgency
  return true
}
```

### 11.5 — Batch consolidation ⭐ NEW

```typescript
const BATCH_WINDOW_MS = 30 * 60 * 1000  // 30 minutos
const pendingBatch = new Map<string, ControlAdvisorTask>()

async function pipeWithBatch(signal: ControlAdvisorTask) {
  pendingBatch.set(signal.id, signal)

  // Debounce 30s — si llega otro signal, suma al batch
  await sleep(30 * 1000)

  if (pendingBatch.size === 1) {
    await pipeSingleNotification(signal)
  } else if (pendingBatch.size >= 2) {
    const allSignals = Array.from(pendingBatch.values())
    await pipeBatchNotification(allSignals)
  }
  pendingBatch.clear()
}

async function pipeBatchNotification(signals: ControlAdvisorTask[]) {
  await sendFamilyPush({
    familyId,
    title: `Tenés ${signals.length} alertas financieras`,
    body: signals.map(s => `· ${s.title}`).join('\n'),
    data: {
      route: '/(app)/asistente',
      signal_ids: signals.map(s => s.id),
      kind: 'batch',
    }
  })
}
```

### 11.6 — Push action buttons nativos ⭐ NEW

```typescript
const PUSH_ACTIONS_BY_FAMILY: Record<string, ExpoNotificationAction[]> = {
  'zombie':            [{ identifier: 'cancel', buttonTitle: 'Cancelar suscripción' }],
  'recovery-hard':     [{ identifier: 'plan',   buttonTitle: 'Ver plan' }],
  'positive-forecast': [{ identifier: 'save',   buttonTitle: 'Mover ahora' }],
  'income-missing':    [{ identifier: 'update', buttonTitle: 'Actualizar' }],
}

await Notifications.scheduleNotificationAsync({
  content: {
    title: task.title,
    body: task.body,
    data: { route, signal_id: task.id },
    categoryIdentifier: extractFamily(task.id),  // matches PUSH_ACTIONS_BY_FAMILY
  },
  trigger: null,
})
```

### 11.7 — Insertion en Supabase

```typescript
{
  family_id, user_id: currentUser,
  title: task.title,
  body: task.body,
  kind: `advisor_${task.id}`,
  severity: 'warning',
  metadata: {
    source: 'control-advisor',
    signal_id: task.id,
    signal_family: extractFamily(task.id),  // ⭐ NEW
    category: task.cat,
    impact_raw: task.impactRaw,
    impact_scope: task.impactScope,         // ⭐ NEW
    cta: task.cta,
    confidence: task.confidence,
    data_days: task.dataDays,
    persona: currentPersona,                 // ⭐ NEW
    route: '/(app)/(tabs)/control'
  }
}
```

### 11.8 — Race condition fix ⭐

```typescript
function useAdvisorNotificationSync({ signals, familyId, userId }) {
  const dismissed = useDismissedIds()
  const isHydrated = useDismissStoreHydrated()  // ⭐ NEW

  useEffect(() => {
    if (!isHydrated) return  // ESPERA hidratación antes de pipear
    syncSignals(signals.filter(s => !dismissed.has(dismissKeyFor(s))))
  }, [signals, dismissed, isHydrated])
}
```

**Resultado**: usuario nunca recibe spam. Con cooldown variable + batch + time-window + blocklist + race-fixed, el sistema es ~10× más controlado que v1.

---

## 12. Server-side: crons y RPCs

### 12.1 — Crons existentes (ajustes)

#### `cron_compute_velocity_snapshots()` (sin cambios)
**Schedule**: `0 4 * * *` (diario 04:00 UTC)

#### `cron_detect_zombies()` ⚠️ CAMBIO DE FRECUENCIA
**Schedule original**: `15 4 * * 1` (lunes semanal)
**Schedule corregido**: `15 4 * * *` (diario)
**Dedup**: 14 días (sin cambio)

**Razón**: la latencia semanal hacía que un zombie creado el martes se detectara recién el lunes siguiente (6 días). Con dedup de 14d, correrlo diario no genera duplicados pero reduce latencia a 24h máximo.

#### `cron_detect_price_hikes()` (sin cambios)
**Schedule**: `30 4 * * *` (diario)

### 12.2 — Crons nuevos ⭐

#### `cron_prune_advisor_interactions()` ⭐ NEW
**Schedule**: `0 3 * * 0` (domingo 03:00 UTC, semanal)

```sql
DELETE FROM advisor_interactions
WHERE created_at < NOW() - INTERVAL '180 days';
```

#### `cron_prune_stale_notifications()` ⭐ NEW
**Schedule**: `0 3 * * 0` (domingo 03:00 UTC)

```sql
DELETE FROM notifications
WHERE kind LIKE 'advisor_%'
  AND created_at < NOW() - INTERVAL '30 days'
  AND read_at IS NOT NULL;
```

#### `cron_infer_acted_outcomes()` ⭐ NEW
**Schedule**: `0 5 * * *` (diario 05:00 UTC)

Detecta acciones implícitas (el usuario no presionó la CTA pero el problema desapareció):

```sql
-- Ejemplo: zombie cancelado externamente
INSERT INTO advisor_value_log (...)
SELECT
  fe.family_id,
  fe.created_by,
  ai.signal_id,
  'zombie',
  'cancelled_zombie_implicit',
  fe.amount,
  12,
  jsonb_build_object('inferred', true, 'fixed_expense_id', fe.id),
  true,
  fe.archived_at
FROM advisor_interactions ai
JOIN fixed_expenses fe ON fe.id = (ai.context->>'fixed_expense_id')::uuid
WHERE ai.outcome IN ('shown_only', 'dismissed')
  AND ai.signal_family = 'zombie'
  AND fe.status = 'completed'  -- el user lo dió de baja
  AND fe.archived_at > ai.created_at
  AND fe.archived_at < ai.created_at + INTERVAL '14 days'
  AND NOT EXISTS (
    SELECT 1 FROM advisor_value_log avl
    WHERE avl.signal_id = ai.signal_id
  );
```

### 12.3 — RPCs invocados por el cliente (extendido)

| RPC | Cuándo | Args | Devuelve |
|-----|--------|------|----------|
| `home_snapshot(family_id)` | onMount/invalidate | `family_id` | JSONB extendido |
| `add_savings_contribution(goal_id, amount)` | quick-savings-contribution | `goal_id, amount` | `{ id, success, new_current_amount }` |
| `reverse_savings_contribution(contribution_id)` ⭐ | undo toast | `contribution_id` | `{ success }` |
| `send_member_warning(...)` | send-member-warning | `…` | `{ success, notification_id }` |
| `log_advisor_interaction(...)` ⭐ | dispatcher auto-log | `signal_id, outcome, context, surface, time_to_action_ms` | `{ success }` |
| `log_advisor_value(...)` ⭐ | post-action | `signal_id, action_taken, value_saved, evidence` | `{ success }` |
| `add_signal_blocklist(signal_family, reason)` ⭐ | "no me interesa" | `signal_family, reason` | `{ success }` |

---

## 13. Capa cognitiva: Memory Layer

⭐ **NUEVA SECCIÓN — diferenciador clave**

### 13.1 — Concepto

El asistente recuerda cómo el usuario interactuó con cada señal en el pasado. Esto modula urgencia, copy, threshold y decisión de mostrar/no-mostrar futuras señales del mismo tipo.

**Sin esta capa, el sistema es estático**: muestra el mismo `zombie-disney` a todos los usuarios indefinidamente, aunque uno lo dismissee 10 veces y otro lo cancele al primer toque.

### 13.2 — Esquema (ver § 4)

`advisor_interactions` con outcome, context, time-to-action, surface.

### 13.3 — Hook: `useInteractionStats(userId)`

```typescript
// mobile/features/insights/use-interaction-stats.ts
function useInteractionStats(userId: string): InteractionStats {
  const { data } = useQuery({
    queryKey: ['advisor-interactions-stats', userId],
    queryFn: () => supabase.rpc('get_interaction_stats', { user_id: userId }),
    staleTime: 5 * 60 * 1000,
  })
  return useMemo(() => computeStats(data ?? []), [data])
}

function computeStats(interactions: AdvisorInteraction[]): InteractionStats {
  const byFamily = groupBy(interactions, 'signal_family')

  return {
    perFamily: mapValues(byFamily, (items) => ({
      shown: items.length,
      acted: items.filter(i => i.outcome === 'acted').length,
      dismissed: items.filter(i => i.outcome === 'dismissed').length,
      expired: items.filter(i => i.outcome === 'expired').length,
      ctr: items.filter(i => i.outcome === 'acted').length / Math.max(items.length, 1),
      avgTimeToAction: avg(items.filter(i => i.time_to_action_ms).map(i => i.time_to_action_ms)),
      lastSeen: items[0]?.created_at,
      lastActed: items.find(i => i.outcome === 'acted')?.created_at,
      consecutiveDismisses: countConsecutive(items, 'dismissed'),
    })),
    overall: {
      totalShown: interactions.length,
      totalActed: interactions.filter(i => i.outcome === 'acted').length,
      totalDismissed: interactions.filter(i => i.outcome === 'dismissed').length,
      overallCtr: interactions.filter(i => i.outcome === 'acted').length / Math.max(interactions.length, 1),
    }
  }
}
```

### 13.4 — Aplicación en builders

#### Modulación de urgencia
```typescript
function buildZombieSignal(args, history): ControlAdvisorTask | null {
  const baseSignal = buildZombieBase(args)
  if (!baseSignal) return null

  const stats = history.perFamily['zombie']
  if (!stats || stats.shown < 5) return baseSignal  // pocos datos

  // Si CTR > 0.5 → power user de zombie killing → urgencia normal pero copy concisa
  if (stats.ctr > 0.5) {
    return { ...baseSignal, body: shortenBody(baseSignal.body) }
  }

  // Si dismisses > 3× actuados → degradar a INSIGHT, copy más educativo
  if (stats.dismissed > stats.acted * 3) {
    return {
      ...baseSignal,
      urgency: 'baja',
      type: 'INSIGHT',
      body: `Detecté otra suscripción inactiva. Tu historial muestra que preferís mantenerlas — anotá esta para revisar más adelante.`,
    }
  }

  return baseSignal
}
```

#### Skip si en blocklist
```typescript
function buildSignal(args, blocklist): ControlAdvisorTask | null {
  const family = extractFamily(this.id)
  if (blocklist.has(family)) return null  // user opted out
  // ... lógica normal
}
```

### 13.5 — RPC server-side

```sql
CREATE FUNCTION log_advisor_interaction(
  p_signal_id text,
  p_outcome text,
  p_context jsonb DEFAULT '{}',
  p_surface text DEFAULT 'unknown',
  p_time_to_action_ms int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_family uuid;
BEGIN
  SELECT family_id INTO v_family
  FROM family_members WHERE user_id = v_user LIMIT 1;

  INSERT INTO advisor_interactions(
    family_id, user_id, signal_id, signal_family,
    outcome, surface, context, time_to_action_ms
  ) VALUES (
    v_family, v_user, p_signal_id,
    -- extract family from signal_id (split en '-')
    split_part(p_signal_id, '-', 1) ||
      CASE WHEN array_length(string_to_array(p_signal_id, '-'), 1) > 1
           THEN '-' || split_part(p_signal_id, '-', 2)
           ELSE '' END,
    p_outcome, p_surface, p_context, p_time_to_action_ms
  );
END;
$$;
```

### 13.6 — Beneficios mensurables

- **Reducción de fatiga**: signals que el user no actúa se degradan automáticamente
- **Personalización auto**: power users ven copy conciso, novicios ven copy explicativo
- **Datos para iterar copy**: signals con CTR < 5% se identifican y reescriben
- **Alimenta persona inference** (§17)

---

## 14. Capa cognitiva: Causal Insight Engine

⭐ **NUEVA SECCIÓN — diferenciador clave**

### 14.1 — Concepto

Hoy los signals son descriptivos ("gastaste mucho en restaurantes"). El causal engine pasa de **qué pasó** a **por qué**, detectando correlaciones temporales y categóricas en el comportamiento del usuario.

**Sin esta capa, el sistema es reactivo**. Con ella, predice cascadas y avisa antes.

### 14.2 — Estructura

```typescript
// mobile/features/insights/causal-engine.ts
interface CausalLink {
  cause: {
    type: 'day' | 'category' | 'merchant' | 'time' | 'amount-range'
    value: string
  }
  effect: {
    type: 'spending_spike' | 'cap_breach' | 'streak_break' | 'paired_purchase'
    magnitude: number  // delta multiplicador (1.5 = 50% más)
  }
  confidence: number   // ∈ [0, 1] — cuántas veces se dio vs no
  occurrences: number  // observaciones positivas
  observations: number // total observaciones
}
```

### 14.3 — Detectores

```typescript
function inferCausalLinks(args: {
  expenses: Expense[],
  summaries: MonthlySummaryHistory[]
}): CausalLink[] {
  const links: CausalLink[] = []

  links.push(...detectDayOfWeekCascade(args.expenses))
  links.push(...detectPairedImpulse(args.expenses))
  links.push(...detectStressSpending(args.expenses))
  links.push(...detectMerchantTrigger(args.expenses))
  links.push(...detectAmountRangeEscalation(args.expenses))

  return links.filter(l => l.confidence >= 0.5 && l.occurrences >= 3)
}
```

#### `detectDayOfWeekCascade` — el viernes-sábado
```typescript
function detectDayOfWeekCascade(expenses: Expense[]): CausalLink[] {
  // Para cada día de semana D y umbral T:
  // ¿Qué frecuencia tiene "D con gasto > T" → "D+1 con gasto > avg(D+1) × 1.5"?

  const links: CausalLink[] = []
  const expensesByDay = groupByDay(expenses)

  for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
    const highDays = Object.entries(expensesByDay)
      .filter(([date, total]) => dayOfWeek(new Date(date)) === dow && total > 20000)

    let cascadeOccurrences = 0
    for (const [date, total] of highDays) {
      const nextDay = expensesByDay[addDays(date, 1)]
      const nextDow = (dow + 1) % 7
      const nextDowAvg = avgByDow(expensesByDay, nextDow)
      if (nextDay > nextDowAvg * 1.5) cascadeOccurrences++
    }

    if (cascadeOccurrences >= 4 && highDays.length >= 6) {
      links.push({
        cause: { type: 'day', value: dowName(dow) },
        effect: { type: 'spending_spike', magnitude: 1.5 },
        confidence: cascadeOccurrences / highDays.length,
        occurrences: cascadeOccurrences,
        observations: highDays.length,
      })
    }
  }

  return links
}
```

#### `detectPairedImpulse` — categorías que disparan otra compra
```typescript
function detectPairedImpulse(expenses: Expense[]): CausalLink[] {
  // Para cada categoría C: ¿qué % de los gastos de C son seguidos en <3h por otro gasto de C?
  const byCategoryAndTime = sortByTime(expenses)
  const links: CausalLink[] = []

  for (const [catId, items] of groupBy(byCategoryAndTime, 'category_id')) {
    let pairedCount = 0
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i]
      const b = items[i + 1]
      if (b.category_id === a.category_id &&
          hoursBetween(a.created_at, b.created_at) < 3) {
        pairedCount++
      }
    }

    if (pairedCount >= 6 && pairedCount / items.length > 0.4) {
      links.push({
        cause: { type: 'category', value: catId },
        effect: { type: 'paired_purchase', magnitude: 2.0 },
        confidence: pairedCount / items.length,
        occurrences: pairedCount,
        observations: items.length,
      })
    }
  }

  return links
}
```

#### `detectStressSpending` — días de muchas microtransacciones
```typescript
function detectStressSpending(expenses: Expense[]): CausalLink[] {
  const expensesByDay = groupByDay(expenses)
  const stressDays = Object.entries(expensesByDay)
    .filter(([date, exps]) => exps.length >= 4)

  if (stressDays.length < 3) return []

  const stressTotals = stressDays.map(([_, exps]) => sum(exps.map(e => e.price)))
  const stressAvg = avg(stressTotals)
  const overallAvg = avg(Object.values(expensesByDay).map(exps => sum(exps.map(e => e.price))))
  const magnitude = stressAvg / overallAvg

  if (magnitude < 1.3) return []

  return [{
    cause: { type: 'time', value: 'multi-tx-day' },
    effect: { type: 'spending_spike', magnitude },
    confidence: 0.7,  // hard-coded por simplicidad
    occurrences: stressDays.length,
    observations: Object.keys(expensesByDay).length,
  }]
}
```

### 14.4 — Trigger en builders

Los signals `causal-*` (#34, #35, #36 del catálogo) consumen estos links como input.

### 14.5 — Privacy y compute

- Todo el cálculo es **local** (en el cliente, RN worklets opcional)
- Latencia: ~50ms para 6 meses de gastos (<1000 expenses)
- Memoización por `expenses.length` + `lastExpense.id` para evitar recompute
- No genera ningún tráfico extra de red

---

## 15. Capa cognitiva: Forecast 7-day Multi-Scenario

⭐ **NUEVA SECCIÓN — diferenciador clave**

### 15.1 — Concepto

El sistema actual proyecta linealmente fin de mes. El forecast 7d es más granular: predice gasto día por día con 3 escenarios y detecta "inflection days" donde se concentran cargos.

### 15.2 — Estructura

```typescript
// mobile/features/insights/forecast-engine.ts
interface Forecast7Day {
  generatedAt: Date
  horizon: 7

  baseline: ForecastTrack    // ritmo actual constante
  optimistic: ForecastTrack  // si mantiene racha o cae 20%
  pessimistic: ForecastTrack // si DoW peor se materializa + fijos vencidos

  inflection_days: Array<{
    day: Date
    event: 'fixed_payment' | 'historical_high_dow' | 'paydate_proximity' | 'cap_breach_risk'
    expected_amount: number
    description: string
  }>
}

interface ForecastTrack {
  daily: number[]            // monto proyectado para cada uno de los 7 días
  totalProjected: number     // sum de daily
  endingBalance: number      // restanteMes - totalProjected
  dailyAvg: number
}
```

### 15.3 — Algoritmo

```typescript
function forecast7Days(args: {
  view: ControlView,
  fixedExpenses: FixedExpense[],
  dowStats: DowBucket[],
  remaining: number,
}): Forecast7Day {
  const today = new Date()
  const tomorrow = addDays(today, 1)

  const baselineDailyAvg = args.view.promedioDiario
  const peorDow = args.view.peorDow
  const wkStats = computeWeekendStats(args.dowStats)

  // Track baseline: gasto promedio últimos 7 días
  const baseline = projectTrack({
    days: 7,
    base: baselineDailyAvg,
    fixedDates: extractFixedPaymentsIn7d(args.fixedExpenses, today),
  })

  // Track optimistic: -20% del baseline (sustained discipline)
  const optimistic = projectTrack({
    days: 7,
    base: baselineDailyAvg * 0.8,
    fixedDates: baseline.fixedDates,  // fijos no cambian
  })

  // Track pessimistic: cada día usa el avg de su DoW × 1.2
  const pessimistic = projectTrack({
    days: 7,
    perDayBase: (date) => avgByDow(args.dowStats, date.getDay()) * 1.2,
    fixedDates: baseline.fixedDates,
  })

  // Detectar inflection points
  const inflection_days: Forecast7Day['inflection_days'] = []

  // 1. Fijos en próximos 7d
  for (const f of args.fixedExpenses) {
    if (f.next_due_on && daysBetween(today, f.next_due_on) <= 7) {
      inflection_days.push({
        day: new Date(f.next_due_on),
        event: 'fixed_payment',
        expected_amount: f.amount,
        description: f.name,
      })
    }
  }

  // 2. Días con DoW históricamente alto
  for (let i = 1; i <= 7; i++) {
    const futureDay = addDays(today, i)
    const dowAvg = avgByDow(args.dowStats, futureDay.getDay())
    if (dowAvg > baselineDailyAvg * 1.6) {
      inflection_days.push({
        day: futureDay,
        event: 'historical_high_dow',
        expected_amount: dowAvg,
        description: `${dowName(futureDay.getDay())} suele ser caro`,
      })
    }
  }

  // 3. Riesgo de cap breach
  for (const lim of args.limits) {
    if (lim.current_pct > 0.85 && projectedBreachIn7d(lim, baselineDailyAvg)) {
      inflection_days.push({
        day: estimateBreachDay(lim),
        event: 'cap_breach_risk',
        expected_amount: lim.monthly_cap - lim.current,
        description: `Cap de ${lim.category_name} cerca`,
      })
    }
  }

  return {
    generatedAt: today,
    horizon: 7,
    baseline,
    optimistic,
    pessimistic,
    inflection_days: inflection_days.sort((a, b) => a.day.getTime() - b.day.getTime()),
  }
}
```

### 15.4 — UI de visualización

En el header del Asistente, mini-sparkline 7-day con 3 trayectorias:

```
        ╱╲          ← pessimistic (top)
      ╱   ╲
    ╱      ╲╱╲      ← baseline (middle)
  ╱___________╲    ← optimistic (bottom, hatched area positiva)
  L M M J V S D
```

Touch en cada día → tooltip con expected_amount y eventos.

### 15.5 — Trigger en builders

Las señales `forecast-*` (#31, #32, #33) consumen este forecast.

### 15.6 — Performance

- Cálculo: ~30ms para 6 meses de baseline
- Memo por `expenses.length + view.detalleDias.length`
- Recalcula solo cuando llega nuevo expense o cambian fijos

---

## 16. Capa cognitiva: Counterfactual Value Tracking

⭐ **NUEVA SECCIÓN — diferenciador clave**

### 16.1 — Concepto

El asistente sugiere acciones, pero ¿cuánto valor entregó? Sin medir esto, los users no perciben el ROI del feature y churn-ean.

**Counterfactual Value Tracking** logea cada acción del user con un valor monetario estimado y muestra el resultado acumulado.

### 16.2 — Esquema (ver § 4)

`advisor_value_log` con `value_saved`, `value_horizon_months`, `evidence`, `is_estimated`.

### 16.3 — Captura de valor

#### Captura explícita (cuando el user actúa via CTA)
```typescript
// En el dispatcher post-success
async function dispatchInner(action: ControlAction, task: ControlAdvisorTask) {
  // ... ejecuta acción ...

  switch (action.kind) {
    case 'quick-savings-contribution':
      await logValueAction({
        signalId: task.id,
        actionTaken: 'moved_to_savings',
        valueSaved: action.amount,
        valueHorizonMonths: 1,
        evidence: { goalId, contributionId },
      })
      break

    case 'open-fixed-expense':
      // No sabemos aún si va a actuar — wait for downstream cron
      break
  }
}
```

#### Captura implícita (via `cron_infer_acted_outcomes`)
Si el user vio un `zombie-disney`, no presionó CTA, pero 5 días después archivó el `fixed_expense` correspondiente → el cron infiere "acted" y crea una entry en value_log con `is_estimated=true`.

### 16.4 — Cálculo del receipt

```typescript
// useAdvisorValueSummary.ts
function useAdvisorValueSummary() {
  return useQuery({
    queryKey: ['advisor-value-summary', userId],
    queryFn: () => supabase
      .from('advisor_value_summary')
      .select('*')
      .eq('user_id', userId)
      .single(),
    staleTime: 60 * 1000,
  })
}
```

### 16.5 — UI: "Trust Receipt"

En el footer del modal `/asistente`:

```
┌──────────────────────────────────────────┐
│  💚 Te ayudé a ahorrar $147.500          │
│     este trimestre.                      │
│                                          │
│   · 2 zombies cancelados   $28.000/mes   │
│   · 1 hike renegociado     $4.000/mes    │
│   · 8 contribuciones       $115.500      │
│                                          │
│   [Ver historial completo]               │
└──────────────────────────────────────────┘
```

Tap en "Ver historial completo" → screen `/asistente/value-log` con timeline de cada acción + impacto.

### 16.6 — Tipos de value action

| `action_taken` | Cómo se captura | Cómo se valora |
|---|---|---|
| `cancelled_zombie` | Implícito: fixed_expense.status='completed' después de zombie signal | `amount × 12` (anualizado) |
| `cancelled_zombie_implicit` | Idem, sin pasar por CTA | Idem |
| `reduced_category` | Implícito: categoría bajó ≥30% next cycle después de cat-accel | `delta × 12` |
| `moved_to_savings` | Explícito: quick-savings-contribution | `amount` (one-time) |
| `renegotiated_hike` | Implícito: fixed_expense.amount bajó después de hike signal | `delta × 12` |
| `avoided_overspend` | Implícito: el user terminó el ciclo bajo cupo después de recovery-* signal | `delta proyectado` |

### 16.7 — Por qué esto es el moat psicológico más grande

Sin value tracking, el asistente es "alguien que te molesta con notificaciones". Con value tracking, es "alguien que te ha pagado $X". Los users no abandonan algo que les paga.

Las apps competidoras (Mint, Cleo, Rocket Money) NO tienen receipt acumulado — porque dependen de sugerencias generativas (LLM) que no pueden trazar resultados.

---

## 17. Personalidad financiera + framing adaptativo

⭐ **NUEVA SECCIÓN**

### 17.1 — Concepto

Mismo signal, mismo contexto, distinto user → distinto framing.

Investigación de behavioral economics (Kahneman/Tversky) muestra que loss aversion vs gain framing afecta dramáticamente el accionar — pero el efecto **depende del perfil del usuario**. Un planner se irrita con loss framing; un firefighter lo necesita.

### 17.2 — 4 personas

```typescript
type UserPersona = 'planner' | 'firefighter' | 'avoider' | 'optimizer'

const PERSONA_PROFILES: Record<UserPersona, { framing: 'loss' | 'gain' | 'neutral', tone: string }> = {
  planner:     { framing: 'neutral', tone: 'analytical, data-forward' },
  firefighter: { framing: 'loss',    tone: 'urgent, direct' },
  avoider:     { framing: 'gain',    tone: 'gentle, encouraging' },
  optimizer:   { framing: 'gain',    tone: 'opportunity-focused' },
}
```

### 17.3 — Inferencia

```typescript
function inferPersona(history: InteractionStats): UserPersona {
  const { perFamily, overall } = history
  if (overall.totalShown < 10) return 'planner'  // default

  const ctrByType = {
    CRITICAL: avgCtrFor(perFamily, ['recovery-hard', 'fijos-ratio', 'income-missing', 'super-perfect-storm']),
    INSIGHT:  avgCtrFor(perFamily, ['small-leaks', 'night-impulse', 'cat-dominance', 'weekly-pattern']),
    POSITIVE: avgCtrFor(perFamily, ['streak-ok', 'cat-win', 'positive-forecast', 'savings-over']),
  }

  // Avoider: dismissea casi todo
  if (overall.overallCtr < 0.1) return 'avoider'

  // Firefighter: solo actúa en críticas
  if (ctrByType.CRITICAL > 0.5 && ctrByType.INSIGHT < 0.15) return 'firefighter'

  // Optimizer: actúa en positives + savings
  if (ctrByType.POSITIVE > 0.4) return 'optimizer'

  // Planner: actúa en insights
  return 'planner'
}
```

### 17.4 — 3 variantes de copy por signal

```typescript
// control-signals-copy.ts
const RECOVERY_HARD_COPY = {
  loss:    'Vas a perder $X si no recortás $Y/día los próximos N días.',
  gain:    'Recortando $Y/día, recuperás el ritmo y cerrás con margen.',
  neutral: 'Para volver al ritmo: $Y/día los próximos N días.',
}

function buildRecoveryHard(args, persona): ControlAdvisorTask {
  const framing = PERSONA_PROFILES[persona].framing
  const body = RECOVERY_HARD_COPY[framing]
    .replace('$X', formatMoney(args.expectedLoss))
    .replace('$Y', formatMoney(args.dailyTarget))
    .replace('N', args.daysRemaining.toString())
  return { ...baseSignal, body }
}
```

### 17.5 — A/B test del framing

```typescript
// Si hay duda, alternar framing y medir CTR
function chooseCopyVariant(signal, persona, history) {
  if (history.perFamily[signal.family]?.shown >= 5) {
    // Usar el framing que históricamente funcionó mejor
    return getBestFraming(history, signal.family)
  }
  // Defaultear al perfil
  return PERSONA_PROFILES[persona].framing
}
```

### 17.6 — Settings exposable

En `/settings/asistente`, mostrar la persona inferida con copy:
> "Te estoy mostrando como **planner**: priorizo análisis sobre alertas. Cambiar perfil"

Permitir override manual.

---

## 18. Surface UI (visual)

### 18.1 — Compact card en Control v2
**Archivo**: `mobile/components/control-v2/control-v2-asesor-card.tsx`

Theme-aware con identidad emerald saturada.

**Light mode** 🌿:
- Shell: gradiente mint→sage `#E6F7D5 → #CCEAB0`
- Border: emerald @ 32% (1.5px)
- Hero accent: deep emerald `#1C7E3A`
- CTA: gradiente emerald sólido + texto blanco

**Dark mode** 🌲:
- Shell: gradiente forest emerald `#15402F → #082218`
- Border: mint @ 22% (1.5px)
- Hero accent: mint `#C7EE9C`
- CTA: gradiente mint + texto dark

**Layout**:
- Eyebrow: Brand badge (sparkle, breathing 1.4s) + "ASISTENTE" + count pill
- Hero: `+$X /mes` con prefijo semántico (CountUp 1400ms)
- Hairline divider
- Task rows: avatar 44pt + title + body + meta chips + CTA
- Critical glow: rows con urgencia critical pulsan opacity 0.05→0.13
- **Receipt strip** ⭐ NEW: footer con "💚 Te ahorré $X este trimestre"
- Periodicity hint: `swipe-left` icon + microtexto

### 18.2 — Hero stat con prefijo semántico ⭐ FIX

```typescript
function getHeroPrefix(topSignal: ControlAdvisorTask): { prefix: string, color: string } {
  switch (topSignal.type) {
    case 'POSITIVE': return { prefix: '+', color: emerald }
    case 'CRITICAL': return { prefix: '−', color: peach }
    case 'WARNING':  return { prefix: '~', color: amber }
    case 'INSIGHT':  return { prefix: '·', color: neutral }
  }
}
// Antes: hero siempre mostraba "+$X" — engañoso para CRITICAL
// Ahora: el prefijo refleja la naturaleza del top signal
```

### 18.3 — Empty state corregido ⭐ FIX

```typescript
function getEmptyState(dismissed: ControlAdvisorTask[]): EmptyState {
  const hadCritical = dismissed.some(s => s.type === 'CRITICAL')

  if (hadCritical) {
    return {
      label: 'EN ESPERA',
      labelColor: amber,
      title: 'Snoozeaste alertas urgentes',
      body: 'Las urgentes vuelven en 2-3 días. Mientras tanto, todo lo demás está al día.',
    }
  }

  return {
    label: 'AL DÍA',
    labelColor: emerald,
    title: 'Revisaste todas las sugerencias',
    body: 'Volverán a aparecer si los patrones persisten.',
  }
}
```

### 18.4 — Pantalla completa `/asistente`
**Archivo**: `mobile/screens/home/asistente-screen.tsx`

Modal sheet (presentation: `'modal'` iOS / `'card' + fade_from_bottom` Android):
- Top bar: avatar identity + impact pill (sin X close — gesture swipe-down dismiss)
- **Forecast sparkline** ⭐ NEW: mini-gráfico 7d con 3 trayectorias debajo del top bar
- Constellation header: 5 nodos en posiciones fijas + connection lines + pulse rings críticos
- Chat bubbles: intro tag + bubble cream + impact bar + confidence dots + "Visto" reply
- **Trust receipt strip** ⭐ NEW: encima del compose bar, "💚 $147.500 ahorrados este trimestre"
- Twinkling stars background (18 partículas)
- Empty state celebration cuando todas dismissed

### 18.5 — Coach Mode ⭐ NEW
**Archivo**: `mobile/screens/asistente/coach-mode-screen.tsx`

Trigger: long-press en botón mint del Home, o CTA `open-coach-mode` desde super-signals.

**Flow**:
1. **Step 1 — "¿Qué te preocupa hoy?"** — 3 chips: gastos / ahorro / fin de mes
2. **Step 2 — Filter signals por tema** — el asistente carga TODOS los signals del tema (sin cap-5)
3. **Step 3 — Presentación secuencial** — uno por uno: muestra → acepta/dismissea → siguiente
4. **Step 4 — Resumen** — "Hoy decidiste: ✅ X (acted), ❌ Y (skipped), ⏸ Z (snoozed)"

UI estilo "stories" — fullscreen cards horizontales con swipe.

### 18.6 — Avatares por signal id (extendido)

```typescript
const ENTRIES = [
  // ... existentes ...
  { id: 'forecast-tomorrow-risk',    icon: 'wb-twilight' },        // ⭐ NEW
  { id: 'forecast-storm-week',       icon: 'thunderstorm' },        // ⭐ NEW
  { id: 'forecast-payday-gap',       icon: 'event-busy' },          // ⭐ NEW
  { id: 'savings-milestone',         icon: 'emoji-events' },        // ⭐ NEW
  { id: 'income-missing',            icon: 'priority-high' },       // ⭐ NEW
  { id: 'data-gap-warning',          icon: 'wifi-off' },            // ⭐ NEW
  { id: 'cycle-start-projection',    icon: 'calendar-today' },      // ⭐ NEW
  { id: 'high-single-expense',       icon: 'attach-money' },        // ⭐ NEW
  { id: 'super-perfect-storm',       icon: 'severe-cold' },         // ⭐ NEW
  { id: 'super-savings-momentum',    icon: 'rocket-launch' },       // ⭐ NEW
  { id: 'super-hidden-drain',        icon: 'remove-from-queue' },   // ⭐ NEW
  { prefix: 'duplicate-',            icon: 'content-copy' },        // ⭐ NEW
  { prefix: 'causal-',               icon: 'route' },               // ⭐ NEW
]
```

### 18.7 — Estados especiales (resumen)

- **Empty (todas dismissed, no críticas)**: "AL DÍA" verde + check pulsing
- **Empty (dismissed crítica reciente)** ⭐ FIX: "EN ESPERA" amarillo + reloj
- **Empty (sin signals)**: card retorna `null`
- **Empty con value tracking** ⭐ NEW: "AL DÍA · Te ahorré $X este trimestre"
- **Loading skeleton** ⭐ NEW: 3 task rows fantasma con shimmer
- **Error state** ⭐ NEW: ícono `wifi-off` + "Sin conexión · Volvemos cuando vuelva la red"

---

## 19. Animaciones

| Animación | Función | Duración | Ease | Reduced-motion |
|-----------|---------|----------|------|----------------|
| RiseView entrada | Fade + translateY | 700ms | cubic | ✅ |
| BrandBadge breath | Scale 1↔1.06 | 1400ms | inOut quad | ✅ |
| PanelAura drift A | TranslateXY | 12000ms | inOut sin | ✅ |
| PanelAura drift B | TranslateXY (delay 2400) | 14000ms | inOut sin | ✅ |
| CountUpText hero | 0 → totalImpact | 1400ms | out cubic | ✅ |
| Stagger entry | FadeIn delay 60ms × i | 220ms | linear | ✅ |
| Re-entry post-dismiss ⭐ | FadeIn delay 80ms | 180ms | linear | ✅ |
| Exit task | FadeOut | 140ms | linear | ✅ |
| CriticalCardGlow | Opacity 0.05↔0.13 | 2200ms | inOut quad | ✅ |
| BreatheDot avatar | Scale 1↔1.08 | 1800ms | inOut quad | ✅ |
| CTA press scale | 1 → 0.94 | 120ms | out quad | n/a |
| CTA release spring | 0.94 → 1 | spring (d:14, s:220) | n/a | n/a |
| EmptyHero check spring | 0.6 → 1 | spring (d:10, s:120) | n/a | ✅ |
| EmptyHero pulse | Opacity 0.10↔0.22 | 1800ms | inOut quad | ✅ |
| Constellation pulse ring | Scale + opacity | 2000ms | out quad | ✅ |
| Twinkling star | Opacity wave | 4800ms | inOut sin | ✅ |
| **Receipt strip slide-up** ⭐ | TranslateY + Fade | 600ms | spring | ✅ |
| **Forecast sparkline draw** ⭐ | Path stroke-dashoffset | 1000ms | out cubic | ✅ |
| **Super-signal expand** ⭐ | Height 0→auto | 280ms | out cubic | ✅ |
| **Persona switch transition** ⭐ | CrossFade copy | 400ms | linear | ✅ |
| **Coach mode card swipe** ⭐ | TranslateX gesture | n/a | n/a | n/a |
| Swipe gesture | Real-time follow | n/a | n/a | n/a |

### 19.1 — Haptics por urgencia de panel ⭐ NEW

```typescript
function panelEntryHaptic(signals: ControlAdvisorTask[]) {
  const hasCritical = signals.some(s => s.type === 'CRITICAL')
  const allPositive = signals.every(s => s.type === 'POSITIVE')

  if (hasCritical) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  } else if (allPositive) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)  // celebratorio
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }
}
```

**Todas usan `useLoopAnimation`** que auto-cancela en blur de pantalla y respeta `prefers-reduced-motion`.

---

## 20. Accesibilidad

- **Color no es único indicador**: todos los signals tienen icon + texto + posición
- **Contrast ratios**: text primary ≥ 7:1 (AAA) en ambos temas; secondary ≥ 4.5:1; tertiary ≥ 3:1
- **Touch targets**: ≥44pt en CTAs, swipe rows, explainer toggles, badge pills
- **`accessibilityRole="button"`** en todos los Pressables
- **`accessibilityLabel`** con contexto: ej. `"${ctaLabel} para ${task.title}"`
- **`accessibilityHint`** en SwipeableRow: "Desliza a la izquierda para marcarla como vista"
- **`accessibilityState={{ expanded }}`** en explainer toggles + map expand
- **`accessibilityLiveRegion="polite"`** en EmptyHero (anuncia tras último dismiss)
- **`accessibilityLiveRegion="polite"`** en count pill ⭐ NEW (anuncia "3 ideas" → "2 ideas")
- **CountUpText `accessibilityLabel`**: full money string (no caracter-by-caracter)
- **VoiceOver order** = visual order
- **Dynamic Type** ⭐ NEW: todas las fuentes usan unidades escalables; layout soporta hasta `xxxLarge` sin overflow horizontal
- **VoiceOver focus en explainer expand** ⭐ NEW: tras tocar toggle, foco salta al contenido del explainer
- **VoiceOver focus en super-signal** ⭐ NEW: lectura agrupada de "esto es composición de X, Y, Z"
- **Compose bar y suggested prompts** marcados `accessible={false}` (no funcionales aún)
- **RTL support** ⭐ NEW: swipe-to-dismiss invierte dirección (left→right) en locale RTL

---

## 21. Edge cases y resiliencia

### 21.1 — Cold start (usuario nuevo)
- `useControlV2Data` devuelve `{ usingMock: true, signals: [] }`
- Card retorna `null` → no se muestra
- Botón mint en home muestra count 0 → tap abre sheet con EmptyState
- ⭐ Persona default: `'planner'` hasta que haya 10+ interactions

### 21.2 — Sin income configurado (`monthlyIncome = 0`)
- `cupoDiario = 0` → la mayoría de signals no fire (zero guards)
- `streak-ok` puede fire-ear si no hay gastos
- ⭐ NEW: `income-missing` signal aparece prominente
- Hero del Home muestra setup CTA en lugar del número

### 21.3 — Cycle pending payday
- `cycleEnd = expected_payday`, `diasRestantes = 0` cuando today == payday
- `payday-proximity` signal con threshold y urgencia ajustadas
- ⭐ NEW: si `diasRestantes < 0` (payday pasó), `income-missing` toma precedencia

### 21.4 — Día 1-3 del ciclo (poca data)
- `confidenceTier = early` para casi todas
- Signals T1/T2/T3 con `closedDays < 4` retornan `confidence < 0.4` → drop silencioso
- Solo T0 y T4 sobreviven el primer ciclo
- ⭐ NEW: `cycle-start-projection` aparece si margen libre <25%

### 21.5 — Cycle starting balance override activo
- `family_finance.current_cycle_starting_balance` ≠ NULL
- `effectiveCycleIncome = override`
- Todos los signals usan los valores efectivos
- Card "Alcanza" muestra callout "Ajustado para este ciclo"

### 21.6 — Todas las signals dismissed
- Card persiste con state diferenciado:
  - "AL DÍA" si no había críticas
  - "EN ESPERA" si había críticas dismissadas ⭐ FIX
- Chat screen muestra EmptyState celebratorio o de espera
- Reactivación: cuando dismiss expira (TTL escalado) o nuevo signal id surge

### 21.7 — Reduced motion enabled
- `useReducedMotion()` retorna `true`
- Todas las loops auto-disable
- Entradas reducidas a fade simples
- Forecast sparkline se renderea sin animación de draw
- `useLoopAnimation` cancela on blur automáticamente

### 21.8 — Notification spam prevention
- Cooldown variable por signal type (6h–72h) ⭐ NEW
- Time-of-day window 06:00–22:00 (excepto críticas) ⭐ NEW
- Batch consolidation si 2+ pending en 30min ⭐ NEW
- Cleanup auto: entries >30d removidas en hydration
- Blocklist user-defined ⭐ NEW

### 21.9 — Signal builder no reconocido
- `iconForSignal()` fallback: `lightbulb-outline`
- `bubbleHeadline()` fallback: `task.cat || 'Insight'`
- `impactChipLabel()` fallback: `'Impacto mensual'`
- Sistema sigue funcionando con copy genérico

### 21.10 — RPC failure (quick-savings-contribution)
- Alert error: `"No pudimos mover"`
- Haptic error
- Botón vuelve a estado idle
- Card NO se dismissea hasta success real ⭐ FIX
- Circuit breaker: si 3 fallos en 5min → bloquea más intentos ⭐ NEW

### 21.11 — Race condition en notification sync ⭐ FIX
- Hook `useDismissStoreHydrated()` gate
- `useAdvisorNotificationSync` espera hidratación antes de pipear
- Resultado: no se pipea un signal que ya estaba dismissed

### 21.12 — User cambió de timezone
- Push delivery window usa local time del device
- Si user viaja: ventana se ajusta automáticamente
- Cooldowns siguen siendo en UTC (consistente)

### 21.13 — Modo "ningún dato" (todas las queries fallan)
- ⭐ NEW: error state explícito en lugar de empty state
- Mensaje: "Sin conexión · Revisamos tus finanzas cuando vuelva la red"
- Pull-to-refresh dispara reintento

---

## 22. Time-of-day awareness

⭐ **NUEVA SECCIÓN**

### 22.1 — Concepto

El asistente respeta el ritmo circadiano del usuario. Una notificación de `recovery-hard` a las 3am genera ansiedad sin posibilidad de actuar — destruye trust.

### 22.2 — Reglas de surface por hora

```typescript
const TIME_PROFILES = {
  morning:   { hours: [6, 12],  label: 'planner',    icon: 'wb-sunny' },
  afternoon: { hours: [12, 18], label: 'check-in',   icon: 'schedule' },
  evening:   { hours: [18, 22], label: 'reflective', icon: 'nights-stay' },
  night:     { hours: [22, 6],  label: 'gentle',     icon: 'bedtime' },
}

function applyTimeOfDayFilter(signals: ControlAdvisorTask[], now: Date): ControlAdvisorTask[] {
  const hour = now.getHours()
  const isNight = hour >= 22 || hour < 6

  if (!isNight) return signals  // sin filter durante el día

  // De noche, ocultar CRITICAL (induce anxiety nocturna)
  return signals.filter(s => {
    if (s.type === 'CRITICAL') {
      // Reemplazar por mensaje gentil
      return false  // o mejor: reemplazar por wrapper
    }
    return true
  })
}
```

### 22.3 — Reemplazo gentil nocturno

```typescript
function nightWrapper(criticals: ControlAdvisorTask[]): ControlAdvisorTask | null {
  if (criticals.length === 0) return null

  return {
    id: 'night-wrapper',
    title: 'Hay alertas urgentes para mañana',
    body: `Detecté ${criticals.length} cosas que vale la pena mirar con cabeza fresca. Te las muestro a las 9am.`,
    impactRaw: 0,
    impactScope: 'oneTime',
    urgency: 'baja',
    type: 'INSIGHT',
    confidence: 1.0,
    cat: 'descanso',
    cta: 'OK, mañana',
    action: { kind: 'dismiss', dismissId: 'night-wrapper' },
  }
}
```

### 22.4 — Push delivery windows

| Hora local | Permitido pushear |
|---|---|
| 06:00–22:00 | Todo (urgency alta, media, baja) |
| 22:00–06:00 | Solo `urgency='alta'` AND `type !== 'CRITICAL'` que no induzca ansiedad nocturna |

### 22.5 — Morning digest ⭐ NEW (P3)

A las 9:00am local time, si hubo signals críticos durante la noche que se reprimieron:

```typescript
async function morningDigest() {
  const suppressed = await getSuppressedNighttimeSignals()
  if (suppressed.length === 0) return

  await sendFamilyPush({
    title: 'Buen día — hay 2 cosas para revisar',
    body: suppressed.map(s => `· ${s.title}`).join('\n'),
    data: { route: '/(app)/asistente', kind: 'digest' }
  })
}
// Schedule via Notifications.scheduleNotificationAsync con trigger calendar daily 9am
```

---

## 23. Trust & transparencia

⭐ **NUEVA SECCIÓN**

### 23.1 — "¿Por qué veo esto?" panel real

Hoy el explainer toggle muestra copy genérico. Propuesta: **debug panel real** con datos.

```typescript
function ExplainerPanel({ task }: { task: ControlAdvisorTask }) {
  return (
    <View>
      <Text>Señal: {task.id}</Text>

      <Text>Datos analizados:</Text>
      {task.evidence?.map(e => (
        <Text key={e.label}>· {e.label}: {e.value}</Text>
      ))}

      <Text>Confianza: {(task.confidence * 100).toFixed(0)}%</Text>
      <Text>Tier: {task.confidenceTier}</Text>
      <Text>Disparado: hace {timeSince(task.firedAt)}</Text>

      <Text>Si dismisseás: vuelve en {computeDismissTtl(task)} días si el patrón persiste.</Text>

      <Pressable onPress={() => openLongPressMenu(task)}>
        <Text>Más opciones (snooze 30d, no me interesa nunca, dame menos así)</Text>
      </Pressable>
    </View>
  )
}
```

Cada builder ahora declara `evidence: { label, value }[]`:

```typescript
{
  id: 'cat-accel-restaurantes',
  // ...
  evidence: [
    { label: 'Gasto Restaurantes', value: '$42.300 / mes' },
    { label: 'Promedio últimos 4 ciclos', value: '$18.900' },
    { label: 'Aceleración', value: '+124% (umbral: +40%)' },
  ]
}
```

### 23.2 — Track Record público del asistente

Pantalla `/settings/asistente`:

```
Estadísticas del asistente
─────────────────────────
Sugerencias mostradas:        347
Sugerencias aceptadas:        89  (26%)
Ahorro estimado:              $284.500
Falsos positivos reportados:  12

Por familia de señal:
  zombies        12/14 acertados (86%)
  recovery-hard  8/15  acertados (53%)
  night-impulse  3/18  acertados (17%) ⚠
```

Esto **calibra al sistema mismo**: si una signal_family tiene CTR < 5%, el sistema baja su urgencia auto y/o sugiere bloquearla.

### 23.3 — Long-press menu (feedback explícito)

```typescript
const LONG_PRESS_OPTIONS = [
  { id: 'dismiss',      label: 'Visto (snooze TTL)',      action: 'dismiss' },
  { id: 'snooze30',     label: 'Snooze 30 días',           action: 'long-snooze' },
  { id: 'never',        label: 'No me interesa nunca',     action: 'block-family' },
  { id: 'less',         label: 'Dame menos así',           action: 'increase-threshold' },
  { id: 'why',          label: '¿Por qué veo esto?',       action: 'open-explainer' },
]

async function handleLongPressOption(task, option) {
  switch (option.action) {
    case 'block-family':
      await supabase.rpc('add_signal_blocklist', {
        signal_family: extractFamily(task.id),
        reason: 'user_explicit_block'
      })
      Toast.show(`No te muestro más señales de tipo "${extractFamily(task.id)}"`)
      break

    case 'increase-threshold':
      await supabase.rpc('adjust_signal_threshold', {
        signal_family: extractFamily(task.id),
        delta: 0.2  // +20% threshold
      })
      Toast.show('Vas a verlas con menos frecuencia')
      break

    // ... otros casos
  }
}
```

### 23.4 — Privacy declarations

En `/settings/asistente`:

```
✅ Procesamiento local
   Todos los patrones se calculan en tu dispositivo. Tus datos
   financieros nunca salen hacia un servicio de IA externo.

✅ Sin profiling cross-app
   El asistente no comparte tus datos con publicistas, brokers
   de datos, ni redes sociales.

✅ Datos de interacción
   Guardamos qué señales viste y cómo respondiste para mejorar
   las sugerencias. Estos datos son solo tuyos y se borran
   automáticamente a los 6 meses.

   [Borrar mi historial ahora]
```

### 23.5 — Botón "Borrar mi historial"

```sql
-- RPC: clear_advisor_history()
DELETE FROM advisor_interactions WHERE user_id = auth.uid();
DELETE FROM advisor_value_log    WHERE user_id = auth.uid();
DELETE FROM user_signal_blocklist WHERE user_id = auth.uid();
```

Cliente:
```typescript
async function clearAdvisorHistory() {
  await Alert.alert(
    'Borrar historial del asistente',
    'Esto va a resetear lo que el asistente sabe sobre tus interacciones. El asistente vuelve a partir de cero. ¿Confirmás?',
    [
      { text: 'Cancelar' },
      { text: 'Borrar', style: 'destructive', onPress: async () => {
        await supabase.rpc('clear_advisor_history')
        await SecureStore.deleteItemAsync('advisor-piped:v1')
        await SecureStore.deleteItemAsync('control-dismiss-store:v1')
        queryClient.invalidateQueries()
      }}
    ]
  )
}
```

---

## 24. Performance

### 24.1 — Query patterns
- `home_snapshot()` RPC: 1 round-trip único en lugar de N queries paralelas
- React Query cache: `staleTime: 30s`, `cacheTime: 5m`
- Invalidación granular: solo expense/savings/contribution mutations invalidan el snapshot
- ⭐ NEW: `interaction_history` y `value_log_summary` se incluyen en `home_snapshot` (no extra queries)

### 24.2 — Memoización
- `BuildSignalsArgs` es `useMemo`-izado por `[snapshotData, dismissedIds, persona]`
- `signals` array es `useMemo`-izado por args
- Cada signal builder es deterministic
- ⭐ NEW: `causalLinks` cacheado por `(expensesCount, lastExpenseId)` — no recompute si no hay nuevos gastos
- ⭐ NEW: `forecast7Days` cacheado igual

### 24.3 — Animation cost
- 18 stars × `useAnimatedStyle` en chat screen (~ 1ms/frame)
- 14 stars en compact card
- Reanimated worklets corren en UI thread, no bloquean JS
- `useLoopAnimation` auto-cancela en blur → 0% cost cuando no visible
- ⭐ Forecast sparkline: SVG path único, animación con `stroke-dashoffset` (1 worklet)

### 24.4 — Render count
- Compact card: re-renders solo cuando `signals` o `dismissedIds` cambian
- Chat screen: similar; `LinearTransition` evita layout thrash en dismiss
- ⭐ Receipt strip: re-renderea solo cuando `valueSummary` cambia (cache 60s)

### 24.5 — Cognitive layer cost
- `inferUserPersona`: <1ms (hash de stats)
- `inferCausalLinks`: ~50ms para 6 meses de gastos (worker thread opcional)
- `forecast7Days`: ~30ms
- ⭐ Total overhead: ~80ms en el cold start, 0 en re-renders gracias a memo

### 24.6 — Bundle size
- Sin LLM, sin remote config, sin SDKs externos para signals
- `react-native-svg` ya estaba en bundle
- Cognitive layer: ~12KB extra (engines + types)
- Total impact: ~42KB para la feature completa

### 24.7 — Database performance
- `advisor_interactions`: índices compuestos por user_id + signal_family
- `advisor_value_summary`: VIEW computada (no materialized — datos pequeños)
- Si scale > 1M usuarios: considerar materialized view + refresh hourly

---

## 25. Telemetría y testing

⭐ **NUEVA SECCIÓN**

### 25.1 — Eventos de telemetría obligatorios

```typescript
// mobile/features/insights/advisor-analytics.ts
import { analytics } from '@/lib/analytics'

// Cada signal mostrado al usuario
analytics.track('advisor_signal_shown', {
  signal_id: task.id,
  signal_family: extractFamily(task.id),
  urgency: task.urgency,
  type: task.type,
  confidence: task.confidence,
  surface: 'control_card' | 'asistente_screen' | 'push',
  position_in_cap: 0..4,
  persona: currentPersona,
  is_super: !!task.composedOf,
})

// Cada acción tomada
analytics.track('advisor_signal_action', {
  signal_id, signal_family, action_kind,
  time_to_action_ms,  // entre shown y action
  surface,
  persona,
})

// Cada dismiss
analytics.track('advisor_signal_dismissed', {
  signal_id, signal_family,
  dismiss_count_for_user: ignoreCount,
  surface,
  gesture: 'swipe' | 'cta' | 'long_press_snooze',
})

// Long-press feedback
analytics.track('advisor_signal_blocked', { signal_family, reason })

// Value tracker
analytics.track('advisor_value_recorded', {
  signal_family, action_taken,
  value_saved, value_horizon_months,
  is_estimated,
})

// Persona changes
analytics.track('advisor_persona_inferred', {
  persona, previous_persona,
  total_interactions, overall_ctr,
})
```

### 25.2 — Métricas clave a trackear

| Métrica | Cálculo | Target |
|---|---|---|
| **Signal CTR global** | acted / shown | >25% |
| **Signal CTR por family** | idem por signal_family | >15% por family |
| **Time-to-action median** | shown → action delay | <30s para urgency=alta |
| **Dismiss rate** | dismissed / shown | <50% |
| **Block rate** | blocked / shown | <2% |
| **Value saved per active user / month** | sum(value_saved × horizon) | >$5k |
| **Notification CTR** | tap_push / sent_push | >12% |
| **Notification opt-out rate** | disable / shown | <5%/mes |
| **Persona distribution** | % por type | balanced (no >50% avoider) |
| **Forecast accuracy** | actual end-cycle vs baseline forecast | within ±15% |

### 25.3 — Test suite (gap del audit original) ⭐

```
mobile/features/insights/__tests__/
  control-signals.builders.test.ts          # 1 describe por builder, 39 builders
  control-signals.fusion.test.ts             # dedup + super-signals
  control-signals.ranking.test.ts            # score, tiebreaks, cap, diversity
  control-signals.annualized.test.ts         # impact normalization
  control-dismiss-store.test.ts              # TTL escalado, ignoreCount, override
  use-advisor-notification-sync.test.ts      # cooldown variable, batch, race
  causal-engine.test.ts                      # detectores
  forecast-engine.test.ts                    # 3-track projection
  persona-inference.test.ts                  # casos edge
  value-tracker.test.ts                      # capture explícita e implícita
  use-control-action-dispatcher.test.ts      # 12 kinds + circuit breaker
```

### 25.4 — Estructura de un test de builder

```typescript
// control-signals.builders.test.ts
describe('buildRecoveryHard', () => {
  const baseArgs = createMockArgs()

  it('returns null when delta >= 0', () => {
    const signal = buildRecoveryHard({ ...baseArgs, view: { ...baseArgs.view, delta: 100 }})
    expect(signal).toBeNull()
  })

  it('returns null when diasRestantes <= 1', () => {
    const signal = buildRecoveryHard({ ...baseArgs, diasRestantes: 1 })
    expect(signal).toBeNull()
  })

  it('returns critical signal when newCupo < 40% of cupoDiario', () => {
    const args = {
      ...baseArgs,
      view: { ...baseArgs.view, delta: -50000 },
      cupoDiario: 10000,
      diasRestantes: 5,
    }
    const signal = buildRecoveryHard(args)
    expect(signal).toMatchObject({
      id: 'recovery-hard',
      type: 'CRITICAL',
      urgency: 'alta',
      impactRaw: 50000,
      impactScope: 'oneTime',
    })
  })

  it('uses loss framing for firefighter persona', () => {
    const signal = buildRecoveryHard({ ...baseArgs, persona: 'firefighter', /* ... */ })
    expect(signal?.body).toMatch(/Vas a perder/)
  })

  it('uses gain framing for optimizer persona', () => {
    const signal = buildRecoveryHard({ ...baseArgs, persona: 'optimizer', /* ... */ })
    expect(signal?.body).toMatch(/Recortando .+ recuperás/)
  })

  it('respects blocklist', () => {
    const blocklist = new Set(['recovery'])
    const signal = buildRecoveryHard({ ...baseArgs, blocklist, /* ... */ })
    expect(signal).toBeNull()
  })
})
```

### 25.5 — Snapshot tests del copy

```typescript
describe('signal copy snapshots', () => {
  it('all 39 signals render correctly', () => {
    const allSignals = buildAllSignalsForTesting(mockFullContext)
    expect(allSignals).toMatchSnapshot()
  })
})
```

Cuando un copy cambia, el snapshot se rompe → el reviewer ve el diff y aprueba conscientemente.

### 25.6 — RLS audit tests

```typescript
describe('cross-family leak prevention', () => {
  it('user_a cannot see family_b notifications', async () => {
    const { data, error } = await supabaseAsUserA
      .from('notifications')
      .select('*')
      .eq('family_id', familyB.id)
    expect(data).toEqual([])
  })

  it('advisor_interactions are scoped to user', async () => {
    /* idem */
  })

  it('advisor_value_log are scoped to user', async () => {
    /* idem */
  })
})
```

---

## 26. Mapa de archivos

### Backend / lógica (TypeScript)
- `mobile/features/insights/control-signals.ts` — 39 builders + ranking + fusion + composeSuperSignals
- `mobile/features/insights/control-signals-copy.ts` ⭐ — variantes de copy por persona
- `mobile/features/insights/control-action.ts` — `ControlAction` type discriminado (12 kinds)
- `mobile/features/insights/control-dismiss-store.ts` — dismiss store + TTL escalado + override
- `mobile/features/insights/use-control-action-dispatcher.ts` — dispatcher + circuit breaker + auto-log
- `mobile/features/insights/use-advisor-notification-sync.ts` — pipe a notifications + variable cooldown + batch + time-window
- `mobile/features/insights/use-control-v2-data.ts` — adapter que arma BuildSignalsArgs (extendido con persona/causal/forecast)
- `mobile/features/insights/control-section-anchors.ts` — context para scroll-to-section
- `mobile/features/insights/control-v2-mock.ts` — mocks para testing y storybook
- `mobile/features/insights/control-advisor.types.ts` ⭐ NEW — types de producción (movidos desde mock)

### Capa cognitiva ⭐ NEW
- `mobile/features/insights/causal-engine.ts` — detectores causales
- `mobile/features/insights/forecast-engine.ts` — proyección 7d multi-scenario
- `mobile/features/insights/persona-inference.ts` — UserPersona inference
- `mobile/features/insights/value-tracker.ts` — captura explícita e implícita de valor
- `mobile/features/insights/use-interaction-stats.ts` — hook de InteractionStats
- `mobile/features/insights/use-user-persona.ts` — hook de UserPersona
- `mobile/features/insights/use-signal-effectiveness.ts` — CTR per family
- `mobile/features/insights/use-advisor-value-summary.ts` — receipt summary

### UI components
- `mobile/components/control-v2/control-v2-asesor-card.tsx` — compact card en Control
- `mobile/screens/home/asistente-screen.tsx` — pantalla completa modal
- `mobile/screens/asistente/coach-mode-screen.tsx` ⭐ NEW — sesión guiada
- `mobile/components/control-v2/asesor-action-meta.ts` — mapping action.kind → icono/haptic/label
- `mobile/components/control-v2/asesor-signal-meta.ts` — mapping signal id → MaterialIcon (extendido)
- `mobile/components/control-v2/asesor-bubble-meta.ts` — adapter task → bubble shape
- `mobile/components/control-v2/asesor-explainer-panel.tsx` ⭐ NEW — debug panel "¿por qué?"
- `mobile/components/control-v2/asesor-receipt-strip.tsx` ⭐ NEW — value tracker UI
- `mobile/components/control-v2/forecast-sparkline.tsx` ⭐ NEW — mini-gráfico 7d
- `mobile/components/control-v2/super-signal-card.tsx` ⭐ NEW — layout especial composicional
- `mobile/components/home/home-assistant-button.tsx` — botón mint en home (con long-press → coach mode)
- `mobile/components/ui/swipeable-row.tsx` — wrapper genérico de swipe
- `mobile/components/ui/undo-toast.tsx` ⭐ NEW — toast con 5s window
- `mobile/components/home/animated/breathe-dot.tsx`
- `mobile/components/home/animated/count-up-text.tsx`
- `mobile/components/home/animated/rise-view.tsx`

### Routing
- `app/(app)/asistente.tsx` — route wrapper con RequireAuth
- `app/(app)/asistente/coach.tsx` ⭐ NEW
- `app/(app)/asistente/value-log.tsx` ⭐ NEW
- `app/(app)/settings/asistente.tsx` ⭐ NEW
- `mobile/components/root/app-stack-shell.tsx` — Stack.Screen registration

### Theme
- `mobile/theme/state-tokens.ts` — `getStateTokens(state, theme)` + `urgencyToState` + `REINFORCEMENT_TASK_IDS`
- `mobile/components/control-v2/control-v2-tokens.ts` — paleta tonal del módulo Control

### Server / DB (SQL migrations)
- `supabase/migrations/20260423215800_notifications_ecosystem.sql` — tabla notifications + RLS
- `supabase/migrations/20260424150000_control_intelligence.sql` — velocity, zombie (ahora diario), hike crons
- `supabase/migrations/20260424040000_monthly_rollup.sql` — monthly_summaries + cron close-cycle
- `supabase/migrations/20260422235900_home_redesign_savings_goals_and_fixed_payments.sql` — savings_goals
- `supabase/migrations/20260423203804_add_user_streaks.sql` — user_streaks + advance_streak()
- `supabase/migrations/20260501000000_advisor_memory_layer.sql` ⭐ NEW — advisor_interactions + advisor_value_log + user_signal_blocklist + RPCs + crons (prune + infer)
- `supabase/migrations/20260501000001_asistente_threads.sql` ⭐ NEW (P3) — asistente_conversations

### Tests ⭐ NEW
- `mobile/features/insights/__tests__/` — ver § 25.3

---

## 27. Garantías de calidad

✅ **Periódico, no acumulable** — cooldown variable por type + cap 5 + TTL escalado
✅ **No-spam** — solo `urgency=alta` y `confidence≥0.7` salen como notification; solo `≥0.85` como push; time-window 06–22; batch consolidation
✅ **Calidad declarada** — chips visibles + "¿Por qué veo esto?" panel real con evidence
✅ **Acciones únicas** — 12 action kinds con icono/haptic/label distintos
✅ **Local-first** — funciona offline, instantáneo, sin coste por inferencia, sin datos enviados a LLM
✅ **Determinismo modulado** — mismo input → mismo output dentro de la misma persona inferida
✅ **Theme-aware** — Light + Dark con identidad mint/emerald premium
✅ **A11y completo** — touch targets, labels, live regions, contraste AAA, Dynamic Type, RTL
✅ **Reduced-motion** — todas las loops se desactivan; entradas se reducen a fade simples
✅ **Resiliente** — empty state diferenciado (AL DÍA / EN ESPERA); fallback iconos; null cuando no hay data; circuit breaker; race fix
✅ **Math precision** — `annualizedImpact` normaliza one-time vs monthly vs cycle; ranking compara apples-to-apples
✅ **RLS por familia** — toda la data scoped, ningún signal cross-family; tests de leak prevention
✅ **Idempotent crons** — re-ejecución segura, dedup window por table; pruning automático
✅ **Memory-aware** ⭐ — el sistema aprende de cada interacción del user; ningún competidor lo hace
✅ **Causal reasoning** ⭐ — pasa de "qué pasó" a "por qué"; explanation engine único
✅ **Predictive** ⭐ — forecast 7d multi-scenario con inflection points
✅ **Value-proven** ⭐ — receipt acumulado de ahorro; los users no abandonan algo que les paga
✅ **Persona-adaptive** ⭐ — 3 framings por signal, inferidos de behavior
✅ **Time-of-day intelligent** ⭐ — no causa anxiety nocturna; morning digest opcional
✅ **Reversible** — quick-savings undo 5s; dismiss TTL; blocklist removible; history clearable
✅ **Auditable** — cada signal tiene id estable + evidence + telemetría + tests

---

## 28. Diferenciación vs competencia

### 28.1 — Tabla comparativa

| Feature | Mint | Cleo | Rocket Money | Monarch | **Este Asistente** |
|---|:---:|:---:|:---:|:---:|:---:|
| Reglas determinísticas | ❌ (LLM) | ❌ (LLM) | ✅ | ✅ | ✅ |
| Confidence calibrado | ❌ | ❌ | ❌ | ❌ | ✅ |
| Local-first (no LLM runtime) | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Memoria de interacciones** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Causal reasoning** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Forecast multi-scenario** | ❌ | ❌ | parcial | parcial | ✅ |
| **Counterfactual value receipts** | ❌ | ❌ | parcial | ❌ | ✅ |
| **Compound super-signals** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Persona-adaptive framing** | ❌ | parcial | ❌ | ❌ | ✅ |
| **"Why am I seeing this?"** | ❌ | ❌ | ❌ | parcial | ✅ |
| **Time-of-day intelligence** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Coach Mode (focused session)** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Privacy radical (data borrable)** | ❌ | ❌ | ❌ | parcial | ✅ |

### 28.2 — Las 4 features que nadie puede copiar fácilmente

1. **Counterfactual Value Tracking**
   - Requiere conocer el contrafáctico (qué hubiera pasado sin la sugerencia)
   - Solo posible con reglas determinísticas + tracking de outcomes
   - LLMs no pueden hacerlo — generan distintas sugerencias cada vez

2. **Causal Insight Engine**
   - Requiere cómputo agregado por usuario
   - LLMs no pueden hacerlo reliably (alucinan correlaciones)
   - Privacy-friendly (corre local)

3. **Memory Layer compounding**
   - Cada apertura es mejor que la anterior
   - Compound interest aplicado a calidad de sugerencias
   - Requiere infra de logging que ningún competidor tiene

4. **Persona-adaptive framing basado en behavior real**
   - No es "elige tu tono" del onboarding
   - Es inferido de patterns de aceptación/rechazo
   - Requiere Memory Layer como prerequisito

---

## 29. Roadmap priorizado

### P0 — Crítico (corregir antes de lanzar v2)

| Cambio | Esfuerzo | Sección |
|---|---|---|
| Fix "30 reglas" → 39 documentadas (24+12+3) | XS | §6 |
| Annualized impact normalization | S | §8 |
| TTL escalado por urgencia + tipo | S | §10 |
| Race fix `useDismissStoreHydrated` | S | §11 |
| Empty state diferenciado (AL DÍA / EN ESPERA) | XS | §18 |
| Hero stat con prefijo semántico | XS | §18 |
| Test suite mínima (top 12 builders + ranking + dismiss) | M | §25 |
| `quick-savings-contribution` undo + no-dismiss-on-fail | S | §9 |
| Cron zombies → diario (no semanal) | XS | §12 |

### P1 — Alto valor (capa cognitiva primer roundtrip)

| Cambio | Esfuerzo | Sección |
|---|---|---|
| **Memory Layer (`advisor_interactions` + RPCs + hooks)** | L | §13 |
| **Counterfactual Value Tracking** | L | §16 |
| Telemetría completa | M | §25 |
| Time-of-day awareness + delivery windows | S | §22 |
| Cooldown variable por signal type | S | §11 |
| Push action buttons nativos | M | §11 |
| "¿Por qué veo esto?" panel real con evidence | M | §23 |
| Long-press menu + blocklist + threshold adjustment | M | §10/§23 |
| Privacy declarations + clear history button | S | §23 |
| Hidratación gate + circuit breaker | S | §11/§9 |

### P2 — Diferenciadores (segundo roundtrip)

| Cambio | Esfuerzo | Sección |
|---|---|---|
| **Causal Insight Engine + 3 causal-* signals** | XL | §14 |
| **Forecast 7d Engine + 3 forecast-* signals** | L | §15 |
| **Compound Super-Signals (3)** | M | §6/§8 |
| 6 atomic signals nuevas (high-single, duplicate, data-gap, income-missing, milestone, cycle-start) | M | §6 |
| **Persona inference + 3 framings por signal** | L | §17 |
| Coach Mode (long-press flow) | M | §18 |
| Forecast sparkline UI | M | §18 |
| Receipt strip UI + value-log screen | M | §18 |
| Diversity budget en ranking | XS | §8 |
| Batch notification consolidation | M | §11 |
| Morning digest push | S | §22 |

### P3 — Long tail / polish

| Cambio | Esfuerzo | Sección |
|---|---|---|
| Conversation threads persistentes | L | §4 |
| Cross-device dismiss sync | M | - |
| A/B copy testing framework | M | §17 |
| Per-signal CTR analytics dashboard | M | §25 |
| Deep-links en notifications | S | §11 |
| Streak-based confidence boost | S | §7 |
| Family-aware signals (agregados) | L | §6 |
| Predictive zombie pre-detection | M | §12 |
| Home screen widget (iOS 16+ / Android) | XL | - |
| Apple Watch companion | XL | - |
| Export informe mensual PDF | M | - |
| i18n + currency localization | L | - |

---

## 30. Apéndices

### Apéndice A — Glosario

- **Cupo diario** — `(monthly_income − fixed_expenses − savings_goal) / cycle_days`. Cap discrecional canónico.
- **Libre del mes** — `monthly_income − fixed_expenses − savings_goal`. Total discrecional del ciclo.
- **Cycle** — período entre 2 paydays consecutivos.
- **`commitment_id`** — FK en `expenses` que apunta a un `fixed_expense`.
- **`archived_at`** — timestamp en `expenses` set cuando el ciclo cierra.
- **Vault** — `cycleVault` = ahorro acumulado del ciclo.
- **Racha** — días consecutivos con `gasto ≤ cupo` desde el último gasto sobre cupo.
- **`signalId`** — string que identifica únivocamente una señal.
- **`signalFamily`** ⭐ — prefijo del signalId (ej: `'zombie'` para `'zombie-abc-123'`).
- **`dismissId`** — id usado por el dismiss store.
- **`annualizedImpact`** ⭐ — valor anualizado del impactRaw, considerando impactScope.
- **`UserPersona`** ⭐ — `'planner' | 'firefighter' | 'avoider' | 'optimizer'`.
- **`CausalLink`** ⭐ — correlación detectada entre cause y effect.
- **`Forecast7Day`** ⭐ — proyección de 7 días con baseline/optimistic/pessimistic.
- **`InteractionStats`** ⭐ — agregados de `advisor_interactions` por signal_family.
- **Super-signal** ⭐ — composición de 3+ signals atómicas en una sola row UI.
- **Trust Receipt** ⭐ — UI footer que muestra value_saved acumulado.
- **Coach Mode** ⭐ — modo focused-session full-screen secuencial.

### Apéndice B — Convenciones de código

- **Comentarios**: en español, audiencia es desarrolladores del producto
- **`impactRaw`**: número crudo (ARS); el scope determina el horizonte (`monthly`, `oneTime`, `cycle`)
- **`annualizedImpact`**: usado solo internamente por el ranking, nunca mostrado al user
- **`impact`**: string de display ("+$X/mes", "Cancelar suscripción")
- **`urgency`**: `'alta' | 'media' | 'baja'` — tradúce a `urgencyWeight` (3/2/1)
- **`type`**: `'POSITIVE' | 'WARNING' | 'CRITICAL' | 'INSIGHT'` — semantic UI tone
- **`confidence`**: `[0, 1]`. Mínimo 0.4 para surface
- **Per-signal IDs**: kebab-case para fixed (`recovery-hard`), prefix con `-` para dynamic (`zombie-{uuid}`)
- **Per-signal families**: prefix antes del primer `-` de un id dinámico
- **Cron names**: `cron_<verb>_<entity>` (ej: `cron_detect_zombies`)
- **RPC names**: `<verb>_<entity>` (ej: `add_savings_contribution`)
- **Test files**: mismo path que el source con sufijo `.test.ts`

### Apéndice C — Definiciones formales

```typescript
// Tipos centrales
type SignalType = 'POSITIVE' | 'WARNING' | 'CRITICAL' | 'INSIGHT'
type Urgency = 'alta' | 'media' | 'baja'
type ImpactScope = 'monthly' | 'oneTime' | 'cycle'
type ConfidenceTier = 'solid' | 'building' | 'early'
type UserPersona = 'planner' | 'firefighter' | 'avoider' | 'optimizer'
type ActionKind =
  | 'navigate'
  | 'open-fixed-expense'
  | 'open-expenses-filtered'
  | 'open-add-fixed-prefilled'
  | 'open-savings-goal'
  | 'open-streak-sheet'
  | 'scroll-to-section'
  | 'send-member-warning'
  | 'quick-savings-contribution'
  | 'dismiss'
  | 'open-external-url'
  | 'open-coach-mode'

interface ControlAdvisorTask {
  id: string                          // 'recovery-hard' | 'zombie-{uuid}'
  title: string                        // headline corto
  body: string                         // explicación full
  cat: string                          // category label ej. 'comportamiento'
  cta: string                          // CTA copy
  type: SignalType
  urgency: Urgency
  impactRaw: number                    // crudo, en ARS
  impactScope: ImpactScope             // ⭐ NEW
  confidence: number                   // [0, 1]
  confidenceTier: ConfidenceTier
  dataDays?: number                    // días de data usados
  evidence?: Array<{label: string, value: string}>  // ⭐ NEW
  composedOf?: string[]                // ⭐ NEW (super-signals)
  action?: ControlAction
  firedAt: Date                        // ⭐ NEW
}

interface ControlAction {
  kind: ActionKind
  // ... discriminated union per kind ...
}

// Per-action types
interface NavigateAction { kind: 'navigate'; route: string; params?: Record<string, any> }
interface OpenExternalUrlAction { kind: 'open-external-url'; url: string; title: string }
interface OpenCoachModeAction { kind: 'open-coach-mode'; topic: string; relatedSignalIds: string[] }
// ... etc
```

### Apéndice D — Migration path desde v1

Para teams que ya tienen v1 en producción:

1. **Sprint 1 (P0 fixes)**:
   - Deploy migración `_advisor_memory_layer.sql` (vacía, solo schema)
   - Update tipos y add `impactScope` con default `'monthly'` para retrocompatibilidad
   - Fix race condition en notification sync
   - Implementar TTL escalado
   - Test suite mínima

2. **Sprint 2 (Memory + Value)**:
   - Backfill `advisor_interactions` desde notifications históricas (best effort)
   - Lanzar Memory Layer leyendo only (sin modular urgencias todavía)
   - Lanzar Value Tracker capturando solo eventos explícitos

3. **Sprint 3 (Cognitive layer activa)**:
   - Activar persona inference + framing
   - Activar causal-* signals
   - Activar forecast-* signals
   - Activar super-signals
   - Habilitar Trust Receipt UI

4. **Sprint 4 (Polish)**:
   - Coach Mode
   - Long-press menu
   - "¿Por qué?" panel real
   - Time-of-day awareness completo

5. **Continuous**:
   - Telemetría desde día 1
   - Iterar copies según CTR

---

## Versión y autoría

**Versión**: 2.0
**Fecha**: 2026-04-28
**Cambios mayores vs v1**:
- 24 → 39 señales (+12 atomics + 3 super)
- 10 → 12 action kinds
- TTL fijo → TTL escalado por type/urgency
- Cooldown fijo → variable por signal_family
- Sin memoria → Memory Layer (`advisor_interactions`)
- Sin value tracking → Counterfactual Value Tracker (`advisor_value_log`)
- Sin razonamiento causal → Causal Insight Engine
- Forecast lineal → Forecast 7d multi-scenario
- Sin personas → 4 personas con framing adaptativo
- Sin time-of-day → delivery windows + morning digest
- Sin tests → suite completo
- Sin telemetría → eventos completos
- Trust radical: explainer real, history clearable, blocklist user-defined

> "No es un chatbot. Es contabilidad cognitiva."