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

→ **[`2026-06-08-estado-ready-pendientes.md`](2026-06-08-estado-ready-pendientes.md)** — snapshot inmediatamente actionable READY vs PENDIENTES post-ciclo de junio (CR v1+v2+v3 + Sprints A-D + Backlog + Spec B). HEAD `814925f`, 654/654 tests, 12 migrations remote-verified.

→ **[`2026-05-21-estado-actual/`](2026-05-21-estado-actual/00-INDICE.md)** — snapshot exhaustivo pantalla-por-pantalla verificado contra commit `7962ea2`. Sigue siendo la foto canónica de sistemas/UI; el doc 2026-06-08 es el delta operacional encima.

## 🚀 Roadmap priorizado

→ **[`2026-05-31-roadmap-priorizado.md`](2026-05-31-roadmap-priorizado.md)** — todos los pendientes del repo organizados por prioridad P0–P7, con effort, dependencias y sprint plan. Trigger: Apple Developer Program pago confirmado por owner (2026-05-31), que desbloquea todo el bloque iOS/store deferred desde 2026-05-11. **Sección §14 al final lista lo hecho post-2026-05-31**.

## 📑 Trabajo cerrado reciente (notas fechadas)

| Fecha | Doc | Cubre |
|---|---|---|
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
