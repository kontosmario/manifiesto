# 🗑️ Candidatos a eliminar — dead code, deprecado y dead notes

> Verificado contra commit `7962ea2` · revisión 2026-05-22 · parte del snapshot docs/ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/.
>
> Barrido por 4 agentes paralelos + **verificación manual con grep de cada candidato** (se descartaron falsos positivos como `hero-stat`, que matcheaba "hero-state" por substring). **✅ EJECUTADO el 2026-05-22** — el owner aprobó y se eliminaron los Buckets 1-7 (156 archivos trackeados + cruft local), verificado con `tsc --noEmit` + `lint` verdes. Los links de abajo apuntan a archivos **ya eliminados**: quedan como registro de qué se removió.

## Convención de riesgo

| Riesgo | Significado |
|---|---|
| 🟢 BAJO | 0 referencias verificadas o solo dev-orphaned; borrar es seguro |
| 🟡 MEDIO | Rollback-kept intencional o dev-tool aún wireado; borrar requiere decisión |
| 🔵 LOCAL | Archivos gitignored (no en git); borrado solo libera disco local |

**Resumen:** ~87 archivos de código 🟢 + ~20 docs 🟢 + `legacy-web-src/` 🟢 + 2 grupos 🟡 (≈9 archivos) + cruft local 🔵 (~291 MB).

---

## 🟢 BUCKET 1 — Cluster fijos-v3 / fijos-hero-preview (≈68 archivos)

**Qué es:** la exploración de diseño del hero de Fijos (V3). El owner revirtió a FijosV2 quirúrgico y los **nav links a estas dev screens fueron removidos el 2026-05-13** (comentario explícito en [settings-screen.tsx:1041](../../../mobile/screens/settings/settings-screen.tsx#L1041)). `FijosV3Screen` tiene **0 rutas** y **0 referencias de producción** (verificado). Todo el cluster es inalcanzable incluso en dev build.

**Orden de borrado (evita errores de compilación):**

1. **12 rutas dev** — `app/(app)/settings/dev/fijos-*.tsx`:
   `fijos-header-variants`, `fijos-hero-manifiesto`, `fijos-hero-pasaje`, `fijos-hero-preview`, `fijos-hero-titular`, `fijos-proximos-variants`, `fijos-row-variants`, `fijos-seleccion-final`, `fijos-smart-alerts-variants`, `fijos-tabs-v2`, `fijos-tabs-variants`, `fijos-vista-completa`
2. **12 dev screens** — `mobile/screens/dev/fijos-*-screen.tsx` (homónimos de arriba)
3. [mobile/screens/home/fijos-v3-screen.tsx](../../../mobile/screens/home/fijos-v3-screen.tsx) — 0 refs
4. [mobile/features/fijos/adapt-controller-to-hero-state.ts](../../../mobile/features/fijos/adapt-controller-to-hero-state.ts) — solo lo usaba fijos-v3-screen
5. [mobile/components/fijos-hero-preview/](../../../mobile/components/fijos-hero-preview/) — **directorio completo, 41 archivos**
6. [mobile/components/fijos/fijos-smart-alerts.tsx](../../../mobile/components/fijos/fijos-smart-alerts.tsx) — solo lo usaba la dev route fijos-smart-alerts-variants (su reemplazo prod es `FijosProximosCard`)

> Impacto: ~68 archivos, varios miles de LOC que el bundler incluye hoy (las dev routes entran al bundle aunque no tengan link). Es el cleanup de mayor volumen y el más seguro.

---

## 🟢 BUCKET 2 — Componentes huérfanos (0 refs) (17 archivos)

Verificados con import-path exacto (no substring):

| Archivo | Motivo |
|---|---|
| [control-v2/forecast-sparkline.tsx](../../../mobile/components/control-v2/forecast-sparkline.tsx) | 0 imports |
| [control-v2/control-v2-asesor-card.tsx](../../../mobile/components/control-v2/control-v2-asesor-card.tsx) | 0 imports (los signals se movieron permanentemente al Asistente) |
| [fixed-expenses/fixed-expense-form.tsx](../../../mobile/components/fixed-expenses/fixed-expense-form.tsx) | 0 imports |
| [fijos/fijos-upcoming-strip.tsx](../../../mobile/components/fijos/fijos-upcoming-strip.tsx) | 0 imports (absorbido por `FijosProximosCard`) |
| [home/hero-stat.tsx](../../../mobile/components/home/hero-stat.tsx) | 0 imports (el `HeroStat` vivo es el de `settings-primitives`) |
| [home/mini-bars.tsx](../../../mobile/components/home/mini-bars.tsx) | 0 imports |
| [ui/mini-bars.tsx](../../../mobile/components/ui/mini-bars.tsx) | 0 imports |

**Barrel `home/control-sections.tsx` + sus 4 hijos** (los hijos solo los importa el barrel huérfano):
[control-sections.tsx](../../../mobile/components/home/control-sections.tsx), [control-hero-card.tsx](../../../mobile/components/home/control-hero-card.tsx), [control-months-section.tsx](../../../mobile/components/home/control-months-section.tsx), [control-plan-section.tsx](../../../mobile/components/home/control-plan-section.tsx), [control-today-section.tsx](../../../mobile/components/home/control-today-section.tsx)

**Barrel `settings/settings-sections.tsx` + sus 2 hijos** (idem):
[settings-sections.tsx](../../../mobile/components/settings/settings-sections.tsx), [settings-finance-card.tsx](../../../mobile/components/settings/settings-finance-card.tsx), [settings-hero-summary.tsx](../../../mobile/components/settings/settings-hero-summary.tsx)

**Barrels sueltos sin consumidores** (re-exportan componentes que sí viven por import directo; solo el barrel está muerto):
[ui/index.ts](../../../mobile/components/ui/index.ts), [auth/login-primitives.tsx](../../../mobile/components/auth/login-primitives.tsx)

---

## 🟢 BUCKET 3 — Lib huérfanos (2 archivos)

| Archivo | Motivo |
|---|---|
| [lib/permission-priming-state.ts](../../../mobile/lib/permission-priming-state.ts) | 0 imports |
| [lib/copy/glossary.ts](../../../mobile/lib/copy/glossary.ts) | 0 imports |

---

## 🟢 BUCKET 4 — `legacy-web-src/` (directorio trackeado, 256 KB)

[legacy-web-src/](../../../legacy-web-src/) es la **web app anterior pre-React Native** (Ionic/React Router — ver `App.tsx`). **0 imports** desde `app/` o `mobile/`. El propio [pendientes-seguridad.md](../../../docs/operaciones/pendientes-seguridad.md) ya lo clasifica como dead code seguro de borrar.

```
git rm -r legacy-web-src/
```

---

## 🟢 BUCKET 5 — Docs deprecados / dead notes

La app es **feature-complete (2026-05-09)**; muchos docs son roadmaps/audits/plans de trabajo **ya implementado** → dead notes históricas.

### Eliminar (DEAD NOTE — describen trabajo ya cerrado)

| Doc | Motivo |
|---|---|
| docs/PENDIENTES A IMPLEMENTAR/animation-audit-2026-05-03.md | audit sin tracking; app feature-complete |
| docs/home-audit.md | los 3 críticos resueltos (ver home-remediation-status) |
| docs/home-roadmap.md | Sprint 0-4 de features nunca ejecutado |
| docs/home-remediation-status.md | tracking de PRs 1-9, todos shipped |
| docs/home-data-opportunities.md | inventario para chips nunca ejecutados |
| docs/home-sprint-0-rfc-meta.md | RFC de Sprint 0 no ejecutado |
| docs/home-sprint-0-slot-map.md | mapa de slots de Sprints no ejecutados |
| docs/home-sprint-0-telemetry-spec.md | spec de telemetría no implementada |
| docs/gastos-audit.md | 17/22 shipped, 5 diferidos documentados; trabajo cerrado |
| docs/asistente-financiero.md | auto-marcado "archivado, canónico es v2" |
| docs/transitions-preview.html | artefacto HTML de exploración, sin refs |
| docs/superpowers/2026-05-08-backend-hardening-executive-summary.md | hardening completado |
| docs/superpowers/plans/ (carpeta, 11 archivos) | planes de features ya ejecutadas |
| docs/superpowers/specs/ (carpeta, 6 archivos) | specs de features ya ejecutadas |
| Home Redesign (1).html (root) | exploración visual ya implementada |
| home-plan-remediacion.docx (root) | plan cuyo trabajo está todo cerrado |

### Archivar (mover a `docs/archive/`, no borrar — referencia histórica con valor)

| Doc | Motivo |
|---|---|
| docs/PENDIENTES A IMPLEMENTAR/performance-audit-2026-05-02.md | mayormente cerrado; su ítem de `three` ya no aplica (deps ya removidas — verificado) |
| docs/home-handoff.md | superado por [03-home-control-fijos.md](03-home-control-fijos.md) |
| docs/gastos-architecture-v2.md | superado por la solución `gastos_snapshot` (ver [04](04-gastos-add-flows.md)) |
| docs/performance-audit-prompt.md | prompt de audit; uso infrecuente |

### Mantener (VIGENTE)

`PROJECT-STATE-2026-05-09.md`, `PENDIENTES.../push-notifications-ios-setup`, `PENDIENTES.../security-pendings` (backlog activo), `asistente-financierov2.md` (sección PENDIENTES vigente), `asistente-llm-augmentation-notes.md`, `achievements-system.md`, `cycle-wrapped-system.md`, `editions-system.md`, `runbooks/backend-hardening.md`, `CODE_RULES.md`, `BRANDING.md`, `DOCUMENTO_INSTITUCIONAL_TECNICO.md`, `FLUJOS_Y_FUNCIONAMIENTO_APP.md`, `BRIEF_UI_UX_MANIFIESTO.md`, esta carpeta `ESTADO-DEL-PROYECTO/`.

> Nota: `README.md` (root) menciona `legacy-web-src/` como parte activa — actualizar 2 líneas si se borra el directorio.

---

## 🟡 BUCKET 6 — Requieren decisión del owner (no borrar sin confirmar)

| Item | Por qué es 🟡 |
|---|---|
| [control-v2/control-v2-hoy-card.tsx](../../../mobile/components/control-v2/control-v2-hoy-card.tsx) | **Rollback-kept intencional**: el import está comentado en [control-v2-screen.tsx:19](../../../mobile/screens/home/control-v2-screen.tsx#L19) con nota "sigue en código para rollback rápido". 0 uso activo. Borrar solo si se descarta volver a la HoyCard. |
| **Galería A/B de control-hero** (8 archivos) | Dev-tool **aún wireado** ([settings-screen.tsx:1053](../../../mobile/screens/settings/settings-screen.tsx#L1053)). El A/B ya se resolvió (variante A = `control-hero-a-titular` es LIVE). Si no se necesita más la galería: borrar variantes B-G (`control-hero-b-velocimetro`, `-c-termometro`, `-d-coach`, `-e-periodico`, `-f-reloj`, `-g-coach-magazine`) + `screens/dev/control-hero-variants-screen.tsx` + `app/(app)/settings/dev/control-hero-variants.tsx` + la row del link en settings. **Conservar** `control-hero-a-titular`, `control-hero-states`, `control-hero-helpers` (LIVE). |

> Dev-tools que **se mantienen** (siguen útiles y wireados): `settings/dev/preview` (logros & racha) y `settings/dev/cycle-wrapped`.
>
> `features/insights/assistant-demo-signals.ts` es dev-only (modo demo gated `__DEV__`); no eliminar, opcionalmente aislar en carpeta `dev/`.

---

## 🔵 BUCKET 7 — Cruft local gitignored (libera ~291 MB, no afecta git)

Ya están en `.gitignore` (no se commitean), pero ocupan disco local:

| Path | Tamaño |
|---|---|
| dist/ | 261 MB |
| tmp/ | 30 MB |
| test-results/ | 892 KB |
| backups/ | 1.1 MB |
| .expo/ | (regenerable) |

Borrado opcional de mantenimiento local: `rm -rf dist tmp test-results backups .expo` (se regeneran).

---

## ▶️ Plan de ejecución sugerido

1. **Tanda 1 (🟢, sin riesgo):** Buckets 1-5 + 6(legacy-web-src). Un commit por bucket o uno solo `chore: remove dead code & deprecated docs`.
2. **Verificar** tras borrar: `npx tsc --noEmit` + `npm run lint` deben quedar verdes (atrapan cualquier import colgado).
3. **Tanda 2 (🟡):** decidir control-v2-hoy-card y la galería control-hero según roadmap.
4. **Local:** Bucket 7 cuando quieras recuperar disco.
