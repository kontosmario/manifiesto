# Manifiesto — Estado del proyecto

**Fecha de este snapshot:** 2026-05-09
**Para Claude (futuras sesiones):** lee este doc PRIMERO. Sustituye lo que digan los roadmaps viejos.

---

## TL;DR

> **El producto está completo.** No agregamos features. La app cubre el caso de uso (finanzas familiares compartidas con asistente y rachas) y el roadmap de features está pausado.
>
> **El backend está overprovisioned para el tráfico actual** (2 cuentas reales, 7-10 MAU proyectados; preparado para 5-10K MAU). No hay urgencia de capacity.
>
> **La security posture está alta** — todas las criticals + most highs cerradas y desplegadas. Quedan ~13 ítems no-bloqueantes, mayormente dashboard toggles.
>
> **El único gap operacional** que tiene rendimiento esperándolo: push notifications iOS (Phase 5 backend manda mensajes que solo llegan a Android web push hoy).

---

## Cuentas reales en producción (post-sanitización 2026-05-09)

| Email | Rol |
|---|---|
| `kontosmario@gmail.com` | Owner / dev |
| `aye.tello18@gmail.com` | Pareja, usuaria real |

Total `auth.users` = 2. Cualquier otra cuenta que aparezca es nueva o test debe ser revisada antes de tocarla.

---

## Tamaño / capacidad actual (prod, 2026-05-09)

- DB: **18 MB** / 500 MB Free tier = **3.6% usado** (o 0.22% del plan Pro 8 GB)
- Edge invocations/mes: <1K (proyectado a 5K MAU: ~150K, plan Free da 500K)
- Realtime: 3 conexiones pico
- Tests: 283 passing, 0 skip "TODO" (los pre-existentes ya cerrados)
- Validate: verde (typecheck + lint + tests + 3 guards)
- Migraciones aplicadas en prod: hasta `20260513000000`
- Edge functions deployed: `notifications-orchestrator`, `send-family-push v2`, (`control-advisor` eliminada por zombie)

### Capacidad por plan (post-hardening + 30d retention)

| Plan Supabase | Costo/mes | MAU servibles |
|---|---|---|
| **Free** | $0 | ~700–1.400 |
| **Pro** | $25 | ~6.000–7.000 |
| **Pro + Compute Medium** | $55 | ~10.000–12.000 |

Bottleneck por plan:
- Free: egress 5 GB/mes (~500 MAU si todos abren mucho la app; ~1.4K si mix realista).
- Pro: realtime concurrent (200) — gating por presence está en backlog.
- Pro+Medium: compute hasta ~12K, después ronda 2 (particionado, edge migration del Asistente).

**Hoy estamos en Free tier funcionando para 2 users con ~3.6% del límite usado.**

---

## Lo que SÍ está hecho y desplegado (no rehacer)

### Backend hardening 5K MAU (Phases 1-7) — completado 2026-05-08
- Índices + RLS STABLE LEAKPROOF (con fallback STABLE en Cloud)
- `home_snapshot` payload trim (caps 120/100, family_finance columnas explícitas)
- `control_snapshot()` materializado + cron 6h
- Retention crones (purge expenses 14d post-cierre + monthly retention)
- Notifications orchestrator (Edge Function chunked, vault-based handover via supabase_vault — no JWT en `cron.job` text)
- `db_health_snapshot()` RPC + dev-only screen
- 23 tests pre-existentes skipped → ahora cerrados (5 borrados, 3 actualizados)
- **2026-05-09:** Retención de `notifications` bajada de 90d a 30d (migración `20260513000000`). 3× DB ahorrado en esa tabla — duplica el techo del Free tier de Supabase.

### Cambios deployados a producción 2026-05-09
- 11 migraciones de hardening aplicadas (`20260512000000` a `20260512090000`) + 1 de retention tightening (`20260513000000`).
- `notifications-orchestrator` Edge Function deployed (incluyendo bug-fix de columna `endpoint` vs `expo_push_token` y mejor serialización de errores).
- `send-family-push` v2 deployed (acepta `{ messages: [...] }` además de la firma vieja, compat preservada).
- `pg_net` extension habilitada en producción.
- Vault con secret `orchestrator_service_role_key` configurado.
- Cron handover ejecutado: 4 schedules nuevos (`notifications-morning/midday/evening/fixed-upcoming`) llaman a `dispatch_notifications_kind()` que lee del vault y postea al Edge orchestrator. 3 legacy schedules mantenidos (`streak-at-risk`, `streak-broken`, `weekly-insights`) porque el orchestrator todavía no implementa esos kinds.
- Sanitización de demo accounts: 3 users borrados (`control.demo`, `control.demo.partner`, `home.test`) + sus 2 familias en cascada. Quedan solo 2 users reales: `kontosmario@gmail.com`, `aye.tello18@gmail.com`.
- Push iOS error wrapper: en sideload sin Apple Developer, ahora muestra mensaje claro "Push iOS requiere Apple Developer Program ($99/año)" en vez del error nativo críptico (`MissingApsEntitlementError` en `mobile/features/push/use-push-notifications.ts`).

Spec/plan/runbook: `docs/superpowers/specs/2026-05-08-backend-hardening-5k-mau-design.md`, `docs/superpowers/plans/2026-05-08-backend-hardening-5k-mau-plan.md`, `docs/runbooks/backend-hardening.md`.

### Security hardening — completado 2026-05-07 a 2026-05-11
- 5 vulnerabilidades **críticas** del audit principal (RLS bypass, notif spoofing, edge billing abuse, JWT plaintext, financial cache plaintext)
- 8 vulnerabilidades **alta/media** del audit principal
- 5 vulnerabilidades del **advisor layer** (ADV-1..ADV-5)
- iOS native (`NSAllowsLocalNetworking` removed)
- PAT y DB password rotados
- Pre-commit secret scanner activo
- `legacy-web-src/` confirmado dead code

Status detallado: `docs/PENDIENTES A IMPLEMENTAR/security-pendings-2026-05-08.md`.

---

## Pendings reales (deferred, no urgentes)

### Acción próxima razonable: push iOS setup
- Doc: `docs/PENDIENTES A IMPLEMENTAR/push-notifications-ios-setup-2026-05-09.md`
- Esfuerzo: 1-3h (requiere APNs keys, build local)
- **Por qué:** Phase 5 (notifications orchestrator) ya está corriendo, pero los push solo llegan a Android web. Sin esto, el Asistente no completa el ciclo en iPhone.

### Tail de security pendings (low impact, dashboard mostly)
13 ítems en `docs/PENDIENTES A IMPLEMENTAR/security-pendings-2026-05-08.md`. Los más relevantes:
- Password policy 10 chars + complexity (30s en dashboard)
- HIBP leaked password protection (1 toggle)
- Realtime private channels confirm (1 click)
- Captcha integration (15 min + build update)
- Universal Links iOS (requiere dominio)
- Android prebuild + manifest audit (antes de Play Store)

### Backend roadmap "ronda 2" (gatillado por métricas, NO por ahora)
| Trigger | Acción |
|---|---|
| DB > 70% (5.6 GB) | Auditar y archivar `monthly_summaries` viejos |
| Egress > 60% (150 GB/mes) | Más caps en RPCs |
| Edge invocations > 70% (1.4M/mes) | Mover motor del Asistente a Edge |
| Realtime concurrent > 70% (140) | Implementar gating por presence |
| `expenses` rows > 5M | Particionar por año |
| Compute Medium CPU > 70% sostenido | Upgrade a Compute Large ($30/mes extra) |

Detalle en `docs/runbooks/backend-hardening.md` §6.

---

## Lo que NO está pendiente (importante para no rabbit-hole)

Hay docs viejos en `docs/PENDIENTES A IMPLEMENTAR/` y `docs/` que mencionan features. **Están obsoletos en cuanto a "agregar".** Los más comunes que pueden confundir:

- `home-roadmap.md`, `home-handoff.md`, `home-sprint-0-*.md`: el Inicio v2 ya se shippeó. No hay una v3 planeada.
- `gastos-architecture-v2.md`: la arquitectura v2 de gastos ya está implementada.
- `asistente-financiero.md`, `asistente-financierov2.md`: el Asistente está en v2 implementado y desplegado. La Phase 3 del backend hardening lo materializó server-side.
- `home-data-opportunities.md`, `home-audit.md`, `home-remediation-status.md`: análisis ya aplicados.
- `gastos-audit.md`: auditoría aplicada.
- `animation-audit-2026-05-03.md`, `performance-audit-2026-05-02.md`: tickets de mejora aplicados.
- `transitions-preview.html`: prototipo prototipo de motion ya implementado.

**Regla de oro:** si un doc tiene fecha < 2026-05-08 y describe "lo que hay que hacer", probablemente ya está hecho. Verificá grep por feature antes de implementar.

---

## Stack y decisiones

- **Mobile:** Expo + React Native + Expo Router + TypeScript estricto
- **State:** TanStack Query v5 (server state), useState/Zustand donde corresponda
- **Backend:** Supabase Postgres 17 + pg_cron + pg_net + supabase_vault + Edge Functions (Deno)
- **Auth:** Supabase Auth + PKCE + biometric unlock
- **Tests:** vitest (unit + integration). Integration tests skip cuando Supabase local no está corriendo.
- **Migrations:** convención `YYYYMMDDhhmmss_descripcion.sql`, idempotentes, con header `-- WHAT / -- WHY` en español, down script en comentario al pie. RLS habilitado por defecto.
- **CODE_RULES.md:** mobile-first, layers (`app/` → `screens/` → `features/` → `lib/`), nada de Supabase desde components/screens.
- **Idioma:** copy + comentarios en español; identificadores en inglés.

---

## Identidades / accesos relevantes

- **Supabase project ref:** `xaquigyhylzvuyfslkqq`
- **Region:** us-east-1
- **Postgres host:** `db.xaquigyhylzvuyfslkqq.supabase.co` (no IPv4 directo desde local; usar pooler `aws-0-us-east-1.pooler.supabase.com:5432` o el management API).
- **Management API:** `https://api.supabase.com/v1/projects/xaquigyhylzvuyfslkqq/database/query` (acepta SQL POST con access token Bearer).
- **Vault secrets activos:** `orchestrator_service_role_key` (para que `dispatch_notifications_kind()` autentique el push al Edge orchestrator).
- **Cron jobs activos:** 16 (lista completa en `docs/runbooks/backend-hardening.md` §3).
- **Repo:** https://github.com/kontosmario/manifiesto (rama `main`)

---

## Si la próxima sesión es para...

| Caso | Hacer |
|---|---|
| Bugfix puntual | Reproducir, fix mínimo, commit + push. Validate verde antes de mergear. |
| Pulido de UX existente | OK siempre que no agregue features nuevas. Confirmar con el user que el cambio no cruce esa línea. |
| "El asistente sugiere mal" / "el cron no corrió" | Empezar leyendo `docs/runbooks/backend-hardening.md`. Logs en Supabase dashboard → Logs. Forzar refresh con `select public.compute_control_snapshot('<family-uuid>')`. |
| Nueva feature | **Detener.** Confirmar con el user antes de avanzar (regla de feature-complete del 2026-05-09). |
| Métrica preocupante | Ver `db_health_snapshot()` o pantalla dev-health. Cross-referenciar contra `docs/runbooks/backend-hardening.md` §6 para los umbrales de "ronda 2". |
| Revisar el último cambio que hice | `git log --oneline -20` y el commit body. Spec y plan del último sprint en `docs/superpowers/`. |

---

## Cambios investigados / pendientes diagnóstico

### Web layout shift en welcome / home / cards — resuelto 2026-05-09
- Síntoma: en web browser, el FernLogo + cards en welcome y home cambiaban de posición después de unos segundos. Native (iOS/Android) funcionaba bien.
- Root cause: `<RiseView>` en `mobile/components/home/animated/rise-view.tsx` usa Reanimated v4 `Keyframe entering` animation. En native el coordinator aplica el initial state `{opacity:0, translateY:N}` antes del primer paint. En web, soporte parcial → el View arranca en estado final, salta al inicial un frame después, después anima → flex containers recalculan altura → todo lo que está ARRIBA en el stack (FernLogo, hero card, etc.) se desplaza visualmente.
- Fix: en web, `RiseView` rendea `<View>` plano sin entering. Pierde el stagger fade-in pero el layout queda estable. Native sigue idéntico (commit `dba7187`).
- Bonus: el fix arregló en cascada los mismos saltos en home-dashboard, home-hero-card, meta-card, month-summary-card, greeting-header, add-expense-dashboard — todos consumen `RiseView`.
- Fixes related (commits del day): `0a3e354` (fineprint reserve mismatch), `ad8d2cf` (paddingTop/animate align), `d27773b` (skip AuthLaunchSplash en web), `be9bb46` (unmount AuthTransitionSplash en web cuando hidden) — todos defense-in-depth, dejados en código.

### Android APK crashea al abrir — root cause encontrada 2026-05-09
- iOS sideloaded build funciona OK.
- Android APK build (May 6) se cierra automáticamente al abrir, sin UI visible.
- **Causa identificada (commit `9e4eac5`):** `package.json` tenía DOS librerías de worklets instaladas en paralelo (`react-native-worklets@0.5.1` requerida por Reanimated v4 + `react-native-worklets-core@1.6.3` huérfana sin imports en código). En Android, Hermes tiene resolución estricta de símbolos JNI y la colisión crasheaba el bundle al cargar; iOS con JSC toleraba la duplicación.
- **Fix aplicado:** removido `react-native-worklets-core` de dependencies. `npm ls` confirmó que era huérfana (top-level only, 0 transitive deps).
- **Pendiente para confirmar fix:** rebuild del APK desde HEAD post-`9e4eac5`. Comandos: `eas build --platform android --profile preview` o local `expo run:android`.
- Si el crash persiste post-rebuild, correr en device: `adb logcat -c && adb logcat | grep -E "AndroidRuntime|FATAL"` para ver el stack trace real.

## Próximo bump esperado de este doc

Cuando alguno de estos cambie:
- Se sume / borre una cuenta real.
- Se cierre el push iOS setup.
- Se cierren todos los security pendings.
- Se aplique una migration de "ronda 2" (por gatillo de métricas).
- El usuario decida reanudar feature work.
- Se resuelva el crash de Android APK.

Hasta entonces, este doc refleja el estado.
