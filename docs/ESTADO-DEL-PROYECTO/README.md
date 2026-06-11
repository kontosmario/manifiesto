# �0 ESTADO-DEL-PROYECTO

> Documentación **fechada** del estado real de Manifiesto Mobile. Cada carpeta `YYYY-MM-DD-*` es una **foto completa** del proyecto en ese momento: cada vista, cada componente, cada estado, cada servicio — verificado contra el código real, no contra roadmaps.

## 🎯 Propósito

Esta carpeta es el **registro vivo por fechas** de:
1. El **estado actual completo** del proyecto (snapshot exhaustivo).
2. **Todo el trabajo reciente** a medida que se cierra.
3. **Dónde estamos hoy respecto a decisiones pasadas** (qué se hizo, qué se descartó, qué quedó en pausa).

A diferencia de [`REAL-VALUE-SUGGESTIONS/`](../auditorias/real-value-suggestions/) (que es un *audit de gaps* — qué falta para el ideal) y de los docs sueltos en [`docs/`](../) (mayormente roadmaps obsoletos), esta carpeta documenta **lo que ES, no lo que debería ser**.

## 🗂️ Convención de fechas

```
docs/ESTADO-DEL-PROYECTO/
├── README.md                      ← este archivo
└── 2026-05-21-estado-actual/      ← foto completa del proyecto a esa fecha
    ├── 00-INDICE.md
    ├── 01-arquitectura-stack-navegacion-estado.md
    ├── 02-auth-onboarding.md
    ├── 03-home-control-fijos.md
    ├── 04-gastos-add-flows.md
    ├── 05-insights-asistente-coach.md
    ├── 06-settings-engagement.md
    ├── 07-backend-servicios-db.md
    ├── 08-estado-vs-decisiones-pasadas.md
    └── 09-candidatos-a-eliminar.md      ← dead code / deprecado / dead notes (propuesta de limpieza)
```

**Cuando hagas una foto nueva:** creá `YYYY-MM-DD-<motivo>/` con la misma estructura. No edites snapshots viejos — son registro histórico. Para trabajo puntual (un refactor, un sprint), un solo doc fechado `YYYY-MM-DD-<tema>.md` en la raíz alcanza.

## 📌 Foto actual

→ **[`2026-06-11-security-hardening-FINAL.md`](2026-06-11-security-hardening-FINAL.md)** — 🟢 **TRULY 100% clean**. 11 audit passes + 14 sprints (E→Q) cerraron ~185 findings. Audit-saturated verdict. Owner action items DONE. App Store submit-ready. **Estado canónico actual de seguridad.**

→ **[`2026-06-11-app-store-assembled-ready-for-review.md`](2026-06-11-app-store-assembled-ready-for-review.md)** — App Store listing + screenshots + seed account para Apple Review. 7/8 H-items closed. Solo falta el click "Añadir a revisión".

→ **[`2026-06-08-estado-ready-pendientes.md`](2026-06-08-estado-ready-pendientes.md)** — snapshot operacional READY vs PENDIENTES. Útil para entender qué se construyó pre-junio. **Status hoy: todos los H1-H8 cerrados, listo para submit.**

→ **[`2026-05-21-estado-actual/`](2026-05-21-estado-actual/00-INDICE.md)** — snapshot exhaustivo pantalla-por-pantalla verificado contra commit `7962ea2`. Sigue siendo la foto canónica de sistemas/UI.

## 🚀 Roadmap priorizado

→ **[`2026-05-31-roadmap-priorizado.md`](2026-05-31-roadmap-priorizado.md)** — todos los pendientes del repo organizados por prioridad P0–P7, con effort, dependencias y sprint plan. Trigger: Apple Developer Program pago confirmado por owner (2026-05-31), que desbloquea todo el bloque iOS/store deferred desde 2026-05-11. **Sección §14 al final lista lo hecho post-2026-05-31**.

## 📑 Trabajo cerrado reciente (notas fechadas)

| Fecha | Doc | Cubre |
|---|---|---|
| **2026-06-11** | [`2026-06-11-security-hardening-FINAL.md`](2026-06-11-security-hardening-FINAL.md) | 🟢 **TRULY 100% clean — security journey end-to-end**. 11 audit passes + 14 sprints (E→Q) cerraron ~185 findings. Owner action items DONE (EXPO_UPDATE_PRIVATE_KEY, App Store password, Universal Links AASA + assetlinks, Supabase Auth config). Tests 748 verde. App Store submit-ready. Audit-saturated verdict |
| 2026-06-11 | [`2026-06-11-app-store-assembled-ready-for-review.md`](2026-06-11-app-store-assembled-ready-for-review.md) | App Store listing copy + 9 screenshots upload + seed account `apple.review@manifiestoapp.com` para Apple Review. H1-H7 closed, solo falta H8 (click submit). Brand cover decision + risk docs |
| 2026-06-10 | [`2026-06-10-security-hardening-DONE.md`](2026-06-10-security-hardening-DONE.md) | 🟡 **HISTÓRICO** — cubrió solo Sprints E→I. El doc FINAL del 2026-06-11 supera y reemplaza |
| 2026-06-10 | [`2026-06-10-security-hardening-sprints.md`](2026-06-10-security-hardening-sprints.md) | Plan inicial de los 4 sprints (E-H) antes de ejecutar — útil para entender cómo arrancó el journey |
| 2026-06-10 | [`2026-06-10-domain-and-legal-site-completed.md`](2026-06-10-domain-and-legal-site-completed.md) | Dominio `manifiestoapp.com` LIVE (Cloudflare Registrar). Privacy + Terms hosteados en repo separado. Email forwarding. Mobile OTA aplicado. H1+H2 cerrados |
| 2026-06-09 | [`2026-06-09-apple-dev-setup-completed.md`](2026-06-09-apple-dev-setup-completed.md) | Apple Developer + EAS + TestFlight setup completo. App ID + APNs key + ASC API key + certs + provisioning profile. Build 1.0.0 (1) en device del owner |
| 2026-06-08 | [`2026-06-08-estado-ready-pendientes.md`](2026-06-08-estado-ready-pendientes.md) | **Master READY vs PENDIENTES post-ciclo de junio**. Features completos (Spec B + Reserva + Meta wizard + Wrapped integration), 3 rondas de CR (78+46+9 findings closed), 4 sprints (A-D), backlog tests (+113), 12 migrations remote-verified. Lista accionable de pendientes high/medium/low + decisiones owner. Estado camino a App Store |
| 2026-06-08 | [`2026-06-08-codereview-hardening-completed.md`](2026-06-08-codereview-hardening-completed.md) | **Code review + hardening sprint** (2 rondas, ~124 findings cerrados). Sprint A (data layer, 10 commits, `syncAllAfterMutation` adoption en 12 hooks), Sprint B (SQL, 2 migrations, `is_family_member` excluye blocked), Sprint C (integration tests en CI), Sprint D (cleanup, 18 archivos huérfanos eliminados, `pointerEvents` migrado a prop). Backlog tests (+113). Fix-round mobile (5 commits: data-layer refinements, streak-sheet cleanup, screens hardening, lint config). Fix-round backend (1 commit: control-advisor schema fix, multi-family guard, docs assumption, blocked-member RLS test). 29 commits, 5 migrations, 654 tests verdes |
| 2026-06-08 | [`2026-06-08-spec-b-leftover-decision-shipped.md`](2026-06-08-spec-b-leftover-decision-shipped.md) | **Spec B — month-close leftover decision** (meta/acumular/reserva/skip persistido en `month_close_decisions`) + **Reserva management** (RPC `apply_reserve_decision` con atomic WHERE-guard, ReserveBlock en Control v2) + **Meta wizard de 4 steps + Settings simplificación** (read-only + lifecycle, nuevo `useLatestSavingsGoal`). Integración inline en la closing scene del Wrapped (pending + past read-only). Fixes UX importantes: tap zones siempre ocultas en última escena del wrapped, bridge re-trigger guard 1.5s, chip stack horizontal del hero, chip Reserva amber/gold, MetaCard post-create (userId plumbing), empty state engañoso de gastos en cycle frozen. 3 rondas de code review todas cerradas. 75 commits, 8 migrations, 544/544 tests |
| 2026-06-04 | [`2026-06-04-gastos-cronologia-fixes-shipped.md`](2026-06-04-gastos-cronologia-fixes-shipped.md) | Pulido del listado Gastos: fix today/yesterday at bottom (day-of-month sort bleed), income visualization aligned to expense row chrome via new `IncomeRow` (3 iteraciones), section header polish, animation re-fire fix, delete crash defensive guards — 6 commits. + Fix encadenado del badge de variación en Fijos (2 bugs: fórmula post-payment + cap del snapshot ocultaba pagos viejos), nuevo `useCommitmentExpenses` query dedicado — 2 commits |
| 2026-06-03 | [`2026-06-03-activity-ocr-shipped.md`](2026-06-03-activity-ocr-shipped.md) | Activity OCR + Import Review wizard (Phases A-D + wizard refactor + cross-form validation pattern rollout) — 73 commits, 8 bancos soportados, 4 forms migrados al patrón de validación nuevo |
| 2026-06-02 | [`2026-06-02-plans-ui-redesign-shipped.md`](2026-06-02-plans-ui-redesign-shipped.md) | Redesign del Plans / Billing screen |
| 2026-06-01 | [`2026-06-01-no-spend-day-feature-shipped.md`](2026-06-01-no-spend-day-feature-shipped.md) | "Día sin gasto" feature |
| 2026-06-01 | [`2026-06-01-code-review-2-completed.md`](2026-06-01-code-review-2-completed.md) | Code review 2 cerrado |
| 2026-05-31 | [`2026-05-31-code-review-hardening-completed.md`](2026-05-31-code-review-hardening-completed.md) | Code review 1 + hardening |

## 🔖 Convención de estados (heredada del audit)

| Marcador | Significado |
|----------|-------------|
| ✅ **LIVE** | Existe en código y funciona en producción |
| 🟡 **PARCIAL** | Existe pero incompleto / mock / no wireado |
| 🔴 **NO EXISTE** | No está construido |
| ⏸️ **EN PAUSA** | Decisión explícita de no hacerlo ahora |
| ⛔ **BLOQUEADO** | Depende de algo externo (ej. Apple Dev Program) |
