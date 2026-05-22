# 📂 REAL-VALUE-SUGGESTIONS

> Auditoría exhaustiva de **Manifiesto Mobile** para llevar la app al nivel "ideal para el mundo" — release iOS, engagement, monetización, ASO, calidad y roadmap.
>
> 🗓️ **Documento HISTÓRICO (audit del 2026-05-11).** Refleja el estado y los gaps detectados en esa fecha, no el estado actual. Para el estado real de hoy, ver [`docs/ESTADO-DEL-PROYECTO/`](../../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md).

**Fecha del audit:** 2026-05-11
**Estado del repo auditado:** rama actual de `~/apps/manifiesto`
**Plataforma objetivo (foco):** iOS 17+ (release inminente). Android = fase 2.

---

## ⚡ Estado vivo

→ **Leer primero [`STATUS-2026-05-11.md`](STATUS-2026-05-11.md)** para el estado actual, decisiones del owner y orden de ejecución. Los status boards de cada subcarpeta se mantienen para detalle por sección pero el doc de status manda en caso de conflicto.

## 🗂️ Estructura

```
REAL-VALUE-SUGGESTIONS/
├── README.md                     ← este archivo (índice + metodología)
├── 01-showstoppers-ios/          ← bloqueantes para submit a App Store
├── 02-engagement-gaps/           ← lo que falta para que sea atrapante
├── 03-monetization/              ← subscriptions, paywalls, IAP, RevenueCat
├── 04-aso/                       ← listing, screenshots, keywords, ranking
├── 05-quality-readiness/         ← tests, CI/CD, observabilidad, performance
└── 06-master-roadmap/            ← plan sprint-by-sprint + presupuesto total
```

Cada subcarpeta contiene:
- `README.md` — índice + dashboard de status (DONE / IN PROGRESS / TO DO)
- `audit.md` — hallazgos detallados vista-por-vista contra el código real
- `roadmap.md` — pasos concretos de implementación
- `budget.md` — items que requieren 💰 (servicios pagos, contrataciones, assets)

---

## 🎯 Cómo leer este audit

### Convenciones de estado

| Marcador | Significado |
|----------|-------------|
| ✅ **DONE** | Ya existe en el código y funciona |
| 🟡 **PARTIAL** | Existe pero incompleto / mock / no wireado |
| 🔴 **TO DO** | No existe, hay que construirlo |
| ⛔ **BLOCKER** | Bloquea release iOS — resolver antes del submit |
| 💰 **BUDGET** | Requiere dinero (servicio externo, licencia, contratación) |
| ⚡ **QUICK WIN** | < 1 día de trabajo, alto impacto |
| 🧠 **STRATEGIC** | Requiere decisión de producto, no solo ejecución |

### Prefijos de tipo de gap

- `[SHOWSTOPPER]` — bloquea submission
- `[COMPLIANCE]` — Apple/legal/data
- `[ENGAGEMENT]` — retención, activación, viralidad
- `[MONETIZATION]` — punto de conversión a paid
- `[FEATURE]` — capacidad de producto faltante
- `[iOS-NATIVE]` — afordancias iOS (widgets, Siri, Watch, Live Activity)
- `[POLISH]` — pulido visual / UX / copy
- `[SECURITY]` — riesgo de seguridad o privacidad
- `[INFRA]` — backend/edge/DB/jobs
- `[TELEMETRY]` — observabilidad y métricas
- `[CI]` — pipeline, automatización, releases
- `[TESTING]` — cobertura, e2e, integración

---

## 🔬 Metodología

1. **Lectura completa** de documentación interna:
   - `README.md`, `BRIEF_UI_UX_MANIFIESTO.md`, `DOCUMENTO_INSTITUCIONAL_TECNICO.md`, `FLUJOS_Y_FUNCIONAMIENTO_APP.md`, `BRANDING.md`, `CODE_RULES.md`
2. **Inspección de configuración**: `app.config.ts`, `package.json`, `eas.json`, `supabase/config.toml`
3. **Ground-truth de código vía 4 agentes paralelos**:
   - Auth + onboarding flow
   - Core operativo (Home, Expenses, Add, Fixed, Insights, Asistente)
   - Settings stack (settings, family-admin, plan, notifications, dev-health)
   - Backend (schema SQL, edge functions, billing, telemetry, CI, tests)
4. **Cruce con frameworks de skills instaladas**:
   - `auditing-appstore-readiness` → checklist Apple Guidelines
   - `monetization-strategy` → tiers, paywalls, conversion
   - `app-store-optimization` → keywords, ASO, listing
   - `product-manager-toolkit` → prioritización, scoring
5. **Síntesis** en docs estructurados con estados y presupuesto.

---

## 📊 Status board global

Visión macro al cierre de la auditoría inicial (2026-05-11):

| Área | ✅ DONE | 🟡 PARTIAL | 🔴 TO DO | ⛔ BLOCKER | 💰 Budget año 1 |
|------|---------|-----------|----------|-----------|------------------|
| 01 Showstoppers iOS | 1 | 2 | 15 | 8 | $50-200 one-time |
| 02 Engagement | 0 | 2 | 26 | 0 | $0-3000 one-time + $50/mes |
| 03 Monetization | 0 | 6 | 19 | 9 | $0 (RevenueCat free) + 30% Apple |
| 04 ASO | 1 | 0 | 28 | 6 | $0-500 + $300/mes ASA opcional |
| 05 Quality | 1 | 3 | 36 | 0 | $0-30/mes |
| **TOTAL macro** | **3** | **13** | **124** | **23** | **~$2000-4000 año 1** |

**Hallazgos críticos transversales:**
1. **AI Coach backend YA wired** a Claude Sonnet (`supabase/functions/control-advisor/`) pero NO expuesto en UI — oportunidad enorme con 3 días de UX
2. **Streaks lógica existe pero sin tabla DB** — toda la persistencia se recalcula runtime, no se puede celebrar/compartir
3. **Billing UI 1110 líneas pulidas** pero `useBilling` 100% mock — Apple App Review rechazaría aunque el resto pase
4. **RLS vulnerability**: cualquier miembro de familia puede editar/borrar gastos de cualquier otro
5. **CI corre lint+typecheck** pero NO unit tests existentes, NO e2e, NO build, NO submit
6. **Cero crash reporting + cero analytics externo** — lanzás ciego sin esto

> Total de items catalogados: **163 items discretos** distribuidos en 6 secciones.

---

## 🚦 Cómo usar esto en el día a día del proyecto

1. Cuando empieces una task, buscala en el `roadmap.md` correspondiente y cambiá su estado a 🟡.
2. Al cerrarla, marcala ✅ con commit hash.
3. Antes de submit a App Store, todos los ⛔ deben estar ✅.
4. Antes de activar paywall, todos los items críticos de `03-monetization/` deben estar ✅ o decididos.
5. Para revisar progreso macro, mirá el status board de cada subcarpeta + el de `06-master-roadmap/README.md`.

---

## 🤖 Generación

Este conjunto de documentos fue generado por Claude Code con inspección directa del código + análisis cruzado contra skills especializadas. Es un **documento vivo** — los estados se actualizan a medida que el equipo cierra tasks.

Cuando se complete una mejora, actualizar el archivo correspondiente cambiando `🔴 TO DO` por `✅ DONE — commit abc1234 (YYYY-MM-DD)`.
