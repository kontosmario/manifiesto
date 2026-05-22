# Estado vs decisiones pasadas — 2026-05-21

> Verificado contra commit `7962ea2` · 2026-05-21 · parte del snapshot docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/.
>
> Este documento cruza **dónde estamos HOY** contra cada decisión tomada en el pasado: el audit [`REAL-VALUE-SUGGESTIONS/`](../../../docs/auditorias/real-value-suggestions/), el [`STATUS-2026-05-11.md`](../../../docs/auditorias/real-value-suggestions/STATUS-2026-05-11.md) (última actualización 2026-05-12) y la declaración de *feature-complete* del owner (2026-05-09). Los hallazgos están verificados contra el código real por los docs 01–07 de este snapshot.

---

## 1. Marco general

El owner declaró el producto **feature-complete el 2026-05-09**. Desde entonces el foco es **operación, hardening, performance y pulido**, no scope nuevo. La app cubre el caso de uso completo: finanzas familiares compartidas con control de ciclo, gastos sueltos y fijos, asistente heurístico, rachas y sistemas de engagement (logros, Wrapped, ediciones).

El último trabajo de código fue el **refactor de navegación (2026-05-13)** — posterior al STATUS — que está LIVE en `7962ea2`: tab bar custom con BlurView Liquid Glass + performance equivalente a nativo (ver [01](01-arquitectura-stack-navegacion-estado.md) y [`NAV-REFACTOR-2026-05-13.md`](../../../docs/auditorias/real-value-suggestions/NAV-REFACTOR-2026-05-13.md)).

**Working tree limpio** al momento de esta foto.

---

## 2. Decisiones del owner → estado hoy

| Decisión (fecha) | Qué se decidió | Estado HOY (verificado) |
|---|---|---|
| **Feature-complete** (2026-05-09) | No agregar features sin confirmación explícita | ✅ Vigente. Roadmap de features pausado. |
| **Skip Sentry** (1.6) | Postponer crash reporting a post-launch | ⏸️ EN PAUSA. No hay crash reporting externo. Se lanza ciego a crashes en v1. |
| **Skip PostHog** (1.7) | Postponer analytics externo | ⏸️ EN PAUSA. Telemetría interna propia (`home_events`) LIVE — ver [07](07-backend-servicios-db.md). |
| **Skip RevenueCat / Bucket B** (2026-05-11) | No comprometer Apple Dev Program ($99/año) hasta tener claridad de roadmap | ⏸️ EN PAUSA. `useBilling` 100% mock; no existe backend de billing — ver [06](06-settings-engagement.md) y [07](07-backend-servicios-db.md). |
| **Logo canónico** | El SVG del fern es la fuente de verdad, no redibujar | ✅ Respetado (`assets/brand/`). |
| **Site público** | Landing + Privacy + Terms en GitHub Pages bajo `manifiesto.app` | 🟡 Implementado en código; pendiente enable de GH Pages + DNS (owner-side). |
| **Streak chip en Home** | Revertido — el streak queda solo en Gastos | ✅ Revertido. La racha vive en Gastos vía `StreakFlameIcon`. |
| **Search global** | SKIP — redundante con filtros contextuales | ⛔ No construido. Búsqueda contextual en filtros LIVE — ver [04](04-gastos-add-flows.md). |
| **Reactions sobre gastos** | SKIP — producto utilitario, no social | ⛔ No construido. |
| **OCR de tickets** (Gemini 2.5 Flash) | QUEUED esperando tokens del owner | 🟡 QUEUED. No implementado. |
| **AI Coach LLM** | DEFERRED hasta ≥500 MAU + Bucket B activo | ⏸️ DEFERRED. El asistente sigue 100% heurístico — ver [05](05-insights-asistente-coach.md). |

---

## 3. Buckets del audit → estado hoy

| Bucket | Estado en STATUS (05-12) | Estado HOY (verificado) |
|---|---|---|
| **A · Showstoppers iOS** | DONE en código | ✅ Delete Account end-to-end LIVE en prod (soft-delete + cron hard-delete + lockdown service_role) — ver [07](07-backend-servicios-db.md). Pendiente solo trabajo operacional del owner. |
| **B · Monetization** | SKIPPED | ⏸️ Sin cambios. Sin Apple Dev Program no hay IAP. |
| **C · Pulido** | DONE | ✅ Confetti en pago de fijos (`FijoRow` + `ConfettiBurst`) y web-parity del streak flame, ambos LIVE — ver [03](03-home-control-fijos.md). |
| **D · Features nuevas** | Mayoría DONE | ✅ Logros (14 codes), Manifiesto Wrapped, Ediciones, Goal milestones 25/50/75, Notas en gastos, StarterNudge, dev preview tools — todos LIVE, ver [06](06-settings-engagement.md). |

---

## 4. Bloqueos por Apple Developer Program

El owner **no compró** el Apple Developer Program ($99/año). Esto mantiene bloqueado en cascada (el código existe y espera, pero no se puede activar/enviar):

| Item | Estado |
|---|---|
| Submit a App Store | ⛔ BLOQUEADO |
| IAP / RevenueCat | ⛔ BLOQUEADO (product IDs requieren App Store Connect) |
| Push iOS | ⛔ BLOQUEADO (stack backend completo y esperando — ver [07](07-backend-servicios-db.md)) |
| Widget / Live Activity / Siri / Watch | ⛔ BLOQUEADO |

Todo lo demás (site, Delete Account, Apple Sign-In wiring) se construyó igual para estar listo cuando se active — ver [02](02-auth-onboarding.md).

---

## 5. Deuda crítica abierta (verificada contra código)

| Deuda | Estado HOY | Origen |
|---|---|---|
| **Vulnerabilidad RLS en `expenses`** | 🔴 ABIERTA. La política update/delete sigue siendo a nivel familia: cualquier miembro puede editar/borrar gastos de otro. El hardening de 2026-05-10 cerró 8 hallazgos pero NO este — ver [07](07-backend-servicios-db.md). | Audit hallazgo crítico #4 |
| **Sin crash reporting** | 🔴 No hay Sentry ni equivalente. | Decisión skip (asumida) |
| **CI sin tests** | 🟡 CI corre solo lint + typecheck. Existen ~54 specs Vitest + 4 Playwright pero **no corren en CI** — ver [07](07-backend-servicios-db.md). | Audit hallazgo #5 |
| **Billing mock** | 🟡 `useBilling` 100% mock; no hay backend de billing. | Bucket B en pausa |

---

## 6. Pendientes operacionales del owner (no código)

Bloquean el submit final pero no tienen deadline (sin urgencia mientras Apple Dev no esté pago):

1. Habilitar GitHub Pages (Settings → Pages → "GitHub Actions"). El workflow ya está committed.
2. DNS de `manifiesto.app` apuntando a GH Pages.
3. Inbox `soporte@manifiesto.app` (Cloudflare Email Routing o ImprovMX → forward a Gmail).
4. Legal review de Privacy + Terms (abogado AR, Ley 25.326).

---

## 7. Qué cambió desde el STATUS (05-12)

El STATUS de REAL-VALUE quedó en 2026-05-12. Después:

- **2026-05-13 · Refactor de navegación** (commits `e035900`→`7962ea2`): se probó `NativeTabs` nativo iOS 26 y se revirtió ("perdemos identidad"); se replicaron las ganancias de performance sobre la tab bar custom (`lazy: false` + `animation: 'none'` + prefetch de snapshots + BlurView Liquid Glass + press feedback). LIVE — ver [01](01-arquitectura-stack-navegacion-estado.md).
- **Confirmaciones / post-limpieza 2026-05-22**: `FijosV3Screen`, `fijos-hero-preview` (41 archivos) y variantes B-G de `control-hero-preview` (junto con 12 dev routes, 12 dev screens y helpers — total ≈68 archivos del cluster fijos + archivos de Bucket 2/3) **fueron eliminados**. Solo sobrevive `control-hero-a-titular` (LIVE en producción). Ver [03](03-home-control-fijos.md) y [09](09-candidatos-a-eliminar.md).

---

## 8. Síntesis

> **App feature-complete y técnicamente lista para iOS en código. El launch real está en pausa esperando que el owner decida sobre el Apple Developer Program y la monetización.** La única deuda que conviene cerrar independientemente de esa decisión es la **vulnerabilidad RLS en `expenses`** (riesgo de integridad de datos entre miembros de familia, sin dependencia de Apple).
