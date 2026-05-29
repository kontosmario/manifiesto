# 📸 Estado actual de Manifiesto Mobile — 2026-05-21

> Foto completa del proyecto verificada contra el código real en commit `7962ea2` (rama `main`).
> Generado por exploración directa del código vía 7 agentes paralelos + síntesis.
>
> ⚠️ **Nota (2026-05-22):** foto al commit `7962ea2`, **antes** de la limpieza del doc 09. El 2026-05-22 se ejecutó esa limpieza (156 archivos eliminados) y se reorganizó la documentación bajo `docs/`. Varios archivos de código citados aquí (los listados en [09](09-candidatos-a-eliminar.md)) ya no existen — esperable en una foto fechada.
>
> 🆕 **Novedad post-foto (2026-05-22):** se cerró la vuln RLS de `expenses` (migración `20260522000000`) y se implementó el **modo soltero / familia invisible** (`families.kind`, onboarding Solo/Familia, UI de familia oculta en Home/Settings). Doc canónico: [sistemas/account-kinds.md](../../sistemas/account-kinds.md). Esta foto no refleja esos cambios.
>
> 🆕 **Novedad post-foto (2026-05-27):** **Pre-onboarding biometric setup** — toda cuenta nueva pasa por una pantalla intermedia `/(app)/biometric-setup` (entre signup y wizard) para activar Face ID conscientemente. Controlada por `AppEntryGate` con flag per-user en SecureStore; cubre email+password, Apple, Google y magic-link confirm. Detalle en [02 § "Pre-onboarding biometric setup"](02-auth-onboarding.md#pre-onboarding-biometric-setup--live-2026-05-27).
>
> 🆕 **Novedad post-foto (2026-05-27, parte 2):** **Tour-seen backend sync** — el estado "tour visto" se movió de SecureStore device-local a 4 columnas timestamptz en `profiles` (`home_tour_seen_at`, `gastos_tour_seen_at`, `fijos_tour_seen_at`, `control_tour_seen_at`) + 3 RPCs (`mark_tour_seen`, `reset_tour_seen`, `reset_all_tours_seen`). Logout deja de borrar el estado (backend persiste cross-session/device); migración one-shot por device hoistea flags legacy al backend. Resuelve el bug "después de logout veo el tour de nuevo". Detalle en [06 § "Tours / Walkthroughs"](06-settings-engagement.md#7-tours--walkthroughs).
>
> 🆕 **Novedad post-foto (2026-05-29) — rama `feat/settings-dark-mode`:** paquete grande de modo oscuro + engagement, mergeado a `main`. Incluye: **modo oscuro near-black** (`#0A0F0C`) en todo el cluster Ajustes (cards en `surfaceMuted`); **lenguaje de celebración de logros** nuevo (`AuroraBloom` + anillo que se dibuja `DrawRing` + pop spring) y **racha** con dial de llama centrado, todo con **tonos de tier dark-aware**; **Plan del Hogar** con detalle por plan (highlights, ahorro anual); **bloque derivado de plan de ahorro** en la config de Meta; **grid completo de avatares** navegable con "Guardar avatar" fijo; **Notificaciones V2** (minificado, sin filtros, ver + marcar leída con hard-delete, salida más suave); **empty states reales** en Fijos y Gastos (componentes reales en modo placeholder, sin data falsa) y **empty-state por card en Control** con condiciones de activación reales (`closedDays`/`diasConGasto`); borde dark unificado en cards de Home; copy neutralizado (sin voseo); y migración `20260528120000` que repara la policy RLS del catálogo de logros. Detalle en [02](02-auth-onboarding.md), [03](03-home-control-fijos.md), [04](04-gastos-add-flows.md), [06](06-settings-engagement.md) y [07](07-backend-servicios-db.md).

---

## Cómo leer este snapshot

Cada documento cubre un dominio del producto, con:
- **Narrativa** de cada vista/screen y cada sistema/servicio.
- **Tablas-inventario** que catalogan todos los componentes, features, hooks, libs y migraciones del dominio.
- **Estado** de cada pieza (✅ LIVE / 🟡 PARCIAL / 🔴 NO EXISTE / ⏸️ EN PAUSA / ⛔ BLOQUEADO).
- **Referencias** clicables a archivos reales.

---

## 📚 Documentos

| # | Documento | Cubre |
|---|-----------|-------|
| 01 | [Arquitectura, stack, navegación, estado y theme](01-arquitectura-stack-navegacion-estado.md) | Stack técnico, dependencias, expo-router layouts, navegación custom, theme system, providers, query-client, runtime/lib infra, stores de estado, hooks globales |
| 02 | [Auth y Onboarding](02-auth-onboarding.md) | Welcome, login, signup, join, forgot/reset password, callback OAuth, Apple/Google Sign-In, biometría, **pre-onboarding biometric-setup gate** (2026-05-27), onboarding wizard, household setup, account deletion UI |
| 03 | [Home, Control y Fijos](03-home-control-fijos.md) | Home screen, Control v2 (+ hero), gastos fijos (fijos v2/v3, alta de fijo), todos los componentes de home |
| 04 | [Gastos y flujos de alta](04-gastos-add-flows.md) | Lista de gastos / gastos v2, alta de gasto e ingreso, historial, filtros, categorías, notas |
| 05 | [Insights, Asistente y Coach](05-insights-asistente-coach.md) | Motor de señales, asistente financiero heurístico, coach mode, achievements, streaks, finance |
| 06 | [Settings y sistemas de engagement](06-settings-engagement.md) | Settings stack completo, family-admin, plan/billing, notificaciones, galería de logros, ediciones, Wrapped, dev tools, subscriptions-zombie, tours, bridges |
| 07 | [Backend, servicios y base de datos](07-backend-servicios-db.md) | Edge functions, esquema DB (107 migraciones), RPCs, RLS, triggers, crons, telemetría, push, CI/CD, tests, scripts |
| 08 | [Estado vs decisiones pasadas](08-estado-vs-decisiones-pasadas.md) | Dónde estamos hoy respecto a cada decisión del owner (audit, buckets, skips, deferrals, bloqueos Apple) |
| 09 | [Candidatos a eliminar](09-candidatos-a-eliminar.md) | Dead code, deprecado y dead notes verificados con grep: ~87 archivos de código + ~20 docs + `legacy-web-src/` + cruft local. ✅ Ejecutado 2026-05-22 (156 archivos eliminados) |

---

## ⚡ Resumen ejecutivo

**Producto:** app de finanzas familiares compartidas (es-AR). **Feature-complete** desde 2026-05-09; foco actual en operación, hardening, performance y pulido.

**Stack** ([01](01-arquitectura-stack-navegacion-estado.md)): Expo 54 + React Native 0.81.5 (New Architecture) + expo-router + Supabase (Postgres/RLS/RPC/Edge/cron/realtime). React Query v5 para server state (staleTime 30s, gcTime 24h, sin persistir datos financieros), pub/sub módulo-level para UI efímera, Reanimated v4 para animación. 3 stacks anidados (Root → AppStack → Tabs); tab bar **custom** con BlurView Liquid Glass + `lazy:false`/`animation:'none'` (refactor de nav del 2026-05-13, LIVE).

**Vistas — qué está LIVE vs no:**
- ✅ Auth completo (email/pass LIVE; Apple/Google 🟡 wired pero bloqueados por Apple Dev), onboarding wizard 5 pasos, account deletion end-to-end ([02](02-auth-onboarding.md)).
- ✅ Home + Control v2 + **FijosV2** (FijosV3 revertida). `fijos-hero-preview` (41 archivos) y variantes B-G de `control-hero-preview` fueron **eliminados el 2026-05-22** (Bucket 1 de [09](09-candidatos-a-eliminar.md)). Solo sobrevive `control-hero-a-titular` + helpers (LIVE) ([03](03-home-control-fijos.md)).
- ✅ **GastosV2** (lista LIVE), alta de gasto/ingreso, historial, filtros, categorías, notas. Search global = SKIP por decisión owner ([04](04-gastos-add-flows.md)).
- ✅ Asistente financiero **100% heurístico** (`control-signals.ts`: 2171 líneas, 43 builders, 4 personas); coach mode scaffold; AI Coach LLM ⏸️ DEFERRED ([05](05-insights-asistente-coach.md)).
- ✅ Settings completo + engagement: Logros (14 codes, realtime), Manifiesto Wrapped, Ediciones, tours, subscriptions-zombie. Billing 🟡 **MOCK** (RevenueCat en pausa) ([06](06-settings-engagement.md)).

**Backend** ([07](07-backend-servicios-db.md)): 33 tablas / ~30 RPCs / 12 crons. Patrón snapshot (`home_snapshot`, `gastos_snapshot`) colapsa N round-trips. `control-advisor` (edge) usa `claude-sonnet-4-6` pero **no está invocado desde el mobile** (el asistente es 100% heurístico). Rachas viven en DB (`user_streaks`).

**Lo que frena el launch** ([08](08-estado-vs-decisiones-pasadas.md)): Apple Developer Program sin comprar → bloquea submit, IAP, push iOS, widgets. Deuda crítica independiente de Apple: **vulnerabilidad RLS abierta en `expenses`** (cualquier miembro de familia puede editar/borrar gastos de otro). CI corre solo lint+typecheck (los ~54 tests Vitest + 4 Playwright no corren en CI).
