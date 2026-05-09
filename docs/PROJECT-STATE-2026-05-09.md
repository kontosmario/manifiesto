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

- DB: **18 MB** / 8 GB plan Pro = **0.22% usado**
- Edge invocations/mes: <1K (proyectado a 5K MAU: ~150K, plan da 2M)
- Realtime: 3 conexiones pico
- Tests: 283 passing, 0 skip "TODO" (los pre-existentes ya cerrados)
- Validate: verde (typecheck + lint + tests + 3 guards)
- Migraciones aplicadas en prod: hasta `20260512090000`
- Edge functions deployed: `notifications-orchestrator`, `send-family-push v2`, (`control-advisor` eliminada por zombie)

---

## Lo que SÍ está hecho y desplegado (no rehacer)

### Backend hardening 5K MAU (Phases 1-7) — completado 2026-05-08
- Índices + RLS STABLE LEAKPROOF (con fallback STABLE en Cloud)
- `home_snapshot` payload trim (caps 120/100, family_finance columnas explícitas)
- `control_snapshot()` materializado + cron 6h
- Retention crones (purge expenses 14d post-cierre + monthly retention)
- Notifications orchestrator (Edge Function chunked, vault-based handover)
- `db_health_snapshot()` RPC + dev-only screen
- 23 tests pre-existentes skipped → ahora cerrados (5 borrados, 3 actualizados)

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

## Próximo bump esperado de este doc

Cuando alguno de estos cambie:
- Se sume / borre una cuenta real.
- Se cierre el push iOS setup.
- Se cierren todos los security pendings.
- Se aplique una migration de "ronda 2" (por gatillo de métricas).
- El usuario decida reanudar feature work.

Hasta entonces, este doc refleja el estado.
