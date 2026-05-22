# Auditoría de producto — Expansión multi-segmento (familias → solteros + pymes)

> 🗓️ **2026-05-22** · Auditoría estratégica basada en lectura completa de `docs/` (62 documentos) contrastada con el snapshot de estado real [ESTADO-DEL-PROYECTO/2026-05-21](../../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md).
>
> **Método:** framework de product management (RICE + JTBD + funnel) + 4 agentes de análisis en paralelo (estado real, auditoría existente, flujos/UX/sistemas, arquitectura/seguridad).
>
> **Alcance:** este documento es *advisory*. Manifiesto está **feature-complete desde 2026-05-09**; nada de lo de acá se implementa sin tu confirmación. Las afirmaciones provienen de los docs; antes de implementar conviene verificar contra código.

---

## 0. TL;DR

Manifiesto es hoy un producto **excelente para un nicho angosto**: el hogar/pareja argentino que comparte gastos. La calidad de ejecución (asistente heurístico de 43 señales, Wrapped, rachas, logros, Control v2) está muy por encima del promedio. **El problema no es la calidad — es el alcance del mercado.**

La unidad atómica del producto es la **`familia`**, cableada en el modelo de datos, el onboarding, el RLS, la lógica financiera y el copy. Eso crea tres barreras de aceptación:

1. **Un soltero se siente fuera de lugar** desde el paso 3 del onboarding ("¿crear familia o unirme?").
2. **Una pyme no encuentra su modelo** (facturación, IVA, clientes, cashflow, roles) — es otro producto.
3. **El mercado direccionable es chico**: las parejas que comparten gastos son una fracción de los adultos con un teléfono.

**Recomendación central:** abstraer `familia` → **`workspace`** (`individual | familia | negocio`) e ir por **solteros primero** (esfuerzo moderado, gran upside), **aceptación masiva** en paralelo (pulido + confianza + fricción), y **pymes como decisión de producto separada en fase 2** (pivote, no feature).

**Bloqueante #1 (hacer ya, 30 min):** la vulnerabilidad RLS en `expenses` — cualquier miembro puede editar/borrar gastos de otro. Bloquea cualquier lanzamiento serio y es inadmisible en B2B.

---

## 1. Diagnóstico: qué es Manifiesto hoy

| Dimensión | Estado |
|---|---|
| **Posicionamiento** | App de finanzas **familiares compartidas**, es-AR, mobile-first |
| **Unidad atómica** | `familia` (un usuario = una familia activa) |
| **Madurez** | Feature-complete (2026-05-09); foco en operación/hardening/pulido |
| **Calidad de ejecución** | Alta — asistente heurístico (43 señales, 4 personas), Control v2, Wrapped, rachas, logros, account deletion end-to-end |
| **Stack** | Expo 54 + RN 0.81 (New Arch) + Supabase (Postgres/RLS/RPC/Edge/cron/realtime) + React Query v5 |
| **Monetización** | 🟡 100% mock (RevenueCat en pausa; no compra de Apple Developer) |
| **Lo que frena el launch** | Apple Developer sin comprar (bloquea submit/IAP/push iOS/widgets) + deuda RLS crítica |

**Fortaleza estratégica subestimada:** el *encuadre argentino* (dólar, cuotas, día de cobro, inflación, lenguaje no-técnico). Es una ventaja competitiva local fuerte frente a YNAB/Monefy/Splitwise — y a la vez una barrera para expandir a otros países (es scope futuro, fuera de esta auditoría).

---

## 2. El núcleo del problema: acoplamiento a `familia`

Los 4 agentes convergen: `familia` no es solo copy, es la primitiva del sistema. Mapa del acoplamiento (de mayor a menor):

| Capa | Acoplamiento | Soltero | Pyme |
|---|---|---|---|
| **Datos** — `families`, `family_members`, `family_finance`, FK `family_id` en ~15 tablas | 🔴 Alto | Reutilizable (familia "invisible" de 1) | 🔴 Reescritura (company/roles/clientes) |
| **RLS** — `is_family_member()` / `is_family_owner()` en todas las policies | 🔴 Alto | Simplifica | 🔴 Roles (admin/contador/empleado) |
| **Onboarding** — paso obligatorio "crear/unirse a familia" | 🔴 Alto | Eliminar el paso | 🔴 Rehacer ("crear empresa/sumarme a equipo") |
| **Lógica financiera** — ciclo de cobro + cupo diario | 🟡 Medio | Aplica 1:1 | 🔴 No aplica (fiscal, IVA, cashflow, facturación) |
| **Copy** — "hogar", "aporte mensual", "nuestros fijos" | 🟡 Medio | ~20-30 keys | 🔴 50+ keys + conceptos nuevos |
| **Engagement** — logros, rachas, Wrapped, ediciones | 🟢 Bajo | ~90% reutilizable | Reframe ("primer balance positivo", etc.) |
| **Asistente** — 43 señales, 4 personas | 🟢 Bajo-medio | ~85% señales + 100% personas | ~40% señales; faltan rentabilidad/cashflow |
| **Flujo alta de gasto** | 🟢 Nulo | Idéntico | Idéntico (+ centro de costo/proyecto) |

**Lectura:** lo *caro* de cambiar (engagement, asistente, alta de gasto) ya es casi agnóstico. Lo acoplado (datos/RLS/onboarding/copy) es acotable para solteros y profundo para pymes.

---

## 3. Tesis arquitectónica: de `familia` a `workspace`

En vez de mantener tres productos, abstraer la unidad:

```
workspaces (workspace_type: 'individual' | 'family' | 'business')
  └─ workspace_members (role: owner | admin | member | viewer)
       └─ workspace_finance / expenses / fixed_expenses / notifications ... (FK workspace_id)
```

**Por qué funciona y no es reescritura:**
- La arquitectura por capas (`app → screens → features → lib`) y el **patrón snapshot RPC** ([code-rules.md](../../arquitectura/code-rules.md)) ya aíslan el acceso a datos. Se reusa el patrón para un `workspace_snapshot()`.
- Migración **aditiva**: `workspace_id` coexiste con `family_id` 1-2 sprints; luego se deprecia. Riesgo bajo.
- El cliente cambia `useFamilyId()` → `useWorkspaceId()` (~50 sitios) detrás de un hook con compat.
- Las RLS rotan `is_family_member(family_id)` → `is_workspace_member(workspace_id)` + rol. Las policies no cambian de forma, solo de check.

**Esfuerzo backend del workspace genérico:** ~50h. Cliente ~46h. UX ~36h. (Detalle en §8.)

> Para **solteros** se puede hacer una versión *lite* (familia invisible de 1) sin la abstracción completa, y dejar el `workspace` completo como prerequisito de **pymes**. Ver decisión en §10.

---

## 4. Análisis por segmento

### 4.1 Solteros / individuos — **ir primero**

- **JTBD:** "Quiero saber cuánto puedo gastar hoy sin descarrilar mi mes, sin planillas ni jerga." Idéntico al de la familia, sin el eje de coordinación.
- **Fit del producto actual:** alto. Cupo diario, ciclo de cobro, fijos, asistente, rachas, Wrapped — todo aplica 1:1 a una persona.
- **Fricción hoy:** el onboarding pregunta por familia; la Home dice "el hogar"; Settings muestra "mi aporte / invitar / administrar miembros". Confunde y aliena.
- **Esfuerzo:** moderado — **~3-4 semanas** (onboarding branch, copy condicional, ocultar UI de familia, RLS fix). Versión lite no requiere el workspace completo.
- **Upside:** el mercado de individuos es varias veces el de parejas que comparten gastos. Es la palanca de crecimiento de mayor ROI.

### 4.2 Pymes / emprendedores — **fase 2, decisión separada**

- **JTBD:** "Quiero ver la salud de mi negocio: qué entra, qué debo, a quién le facturo, cuánto me queda" — **distinto** del cupo diario personal.
- **Gap de producto (lo que hoy NO existe):** facturación, clientes, proyectos/centros de costo, IVA/retenciones, cashflow (cuentas por cobrar vs pagar), ciclo fiscal, roles (admin/contador/empleado), exportación contable (CSV/PDF), reportes (P&L, balance).
- **Modelo financiero incompatible:** "ahorro" → utilidad; "fijos" → costos operativos/COGS; "ciclo de cobro" → período fiscal. El asistente necesitaría señales nuevas (rentabilidad por cliente, alerta de cashflow, margen).
- **Esfuerzo:** **~8-12 semanas** (workspace completo + modelo de negocio + roles + reportes). Más legal/compliance fiscal AR y un panorama competitivo poblado (Xero, QuickBooks, Zoho, locales).
- **Recomendación:** tratarlo como **un producto adyacente sobre la misma base `workspace`**, no como una variante de copy. Empezar por el sub-segmento más cercano: **monotributista/freelancer de 1 persona**, que es casi "soltero + facturación". Validar TAM y willingness-to-pay antes de invertir.

---

## 5. Auditoría por área (hallazgos + acciones)

### 5.1 🔴 Deuda crítica (resolver antes de cualquier expansión)

| # | Hallazgo | Severidad | Esfuerzo | Fuente |
|---|---|---|---|---|
| C1 | **RLS `expenses`**: cualquier miembro edita/borra gastos de otro (UPDATE/DELETE no filtran `created_by`) | 🔴 Crítica | ~30 min (1 migración) | [pendientes-seguridad.md](../../operaciones/pendientes-seguridad.md), [08](../../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/08-estado-vs-decisiones-pasadas.md) |
| C2 | **Apple Developer sin comprar** → no submit, no IAP, no push iOS, no widgets | 🔴 Bloqueante | $99/año + setup | [08](../../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/08-estado-vs-decisiones-pasadas.md) |
| C3 | **Billing 100% mock** (la app actúa "todo-pro") | 🟠 Alta (si se monetiza) | ver §7 | [06](../../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md) |
| C4 | **CI sin tests** (corre solo lint+typecheck; ~54 Vitest + 4 Playwright no corren) | 🟠 Alta | 1-2 días | [07](../../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/07-backend-servicios-db.md) |
| C5 | **Sin crash reporting ni analytics externo** (Sentry/PostHog skipped) → se lanza "a ciegas" | 🟡 Media | free tiers | [05-quality](../real-value-suggestions/05-quality-readiness/audit.md) |
| C6 | **Android manifest audit** pendiente (exported/backup/cleartext) | 🟡 Media (bloquea Play) | 2-3h | [pendientes-seguridad.md](../../operaciones/pendientes-seguridad.md) |

> C1 es el más barato y el más importante. **Hacerlo primero, hoy.**

### 5.2 UX y fricción de onboarding (palanca de aceptación masiva)

- **Time-to-value alto:** ~4-5 min hasta la Home (5 pasos obligatorios). Estándar fintech de alta conversión: <2 min.
- **Onboarding mandatorio** sin escape: no se puede cargar un gasto sin completar familia + parámetros.
- **Acciones:**
  - **Segmentación temprana** post-signup: 3 tarjetas *Solo / Familia / Negocio* que ramifican el wizard.
  - **Fast-track:** permitir cargar el primer gasto antes de configurar metas/fijos (draft + banner "completá tu setup").
  - **Empty states con dirección** en Home en vez de campos vacíos/N/A.
  - **Tooltips de conceptos** ("ciclo", "cupo diario", "buffer") — hoy son jerga propia.

### 5.3 Copy e i18n

- Hoy el copy es familia-explícito: "tu hogar", "mi aporte mensual", "nuestros fijos", "próximo cobro familiar".
- **Acción:** introducir capa de strings con variantes por `workspace_type`. ~20-30 keys para solteros, 50+ para pymes. Neutralizar la Home, Settings y el asistente.

### 5.4 Engagement (alto reuso, bajo costo)

- Logros (11/14 ya neutrales; 3 con "fijo" = renombrar), rachas, Wrapped, Ediciones → reutilizables casi tal cual. Para pyme: reframe ("primera factura", "break-even", "objetivo de ingresos").
- **Oportunidad de aceptación social:** hoy no hay loops virales (reactions descartado por decisión de owner; invitación solo por código de familia). Para solteros conviene un loop liviano: **compartir Wrapped/racha** (imagen) y **referral**. Sin volverlo "social" — solo *shareable*.

### 5.5 Asistente financiero

- 4 personas (planner/firefighter/avoider/optimizer) = 100% reutilizables. ~85% de señales aplican a solteros; ~40% a pymes.
- El backend `control-advisor` (Claude Sonnet) existe pero **no se invoca** desde el mobile (asistente 100% heurístico). El plan de augmentation LLM está documentado y diferido ([asistente-llm-augmentation-notes.md](../../sistemas/asistente-llm-augmentation-notes.md)). Buen diferenciador a futuro, no urgente.

---

## 6. Aceptación en la sociedad (mass-adoption levers)

Más allá de segmentos, lo que mueve la aguja de adopción amplia:

1. **Posicionamiento inclusivo.** Pasar de "gastos en pareja/hogar" a "controlá tu plata, solo o con quien quieras". El store listing actual (ASO) apunta a "gastos en pareja" — angosto. Ver §7/ASO.
2. **Confianza con datos financieros (decisivo).** Mensaje explícito y visible: *qué se guarda, qué no se vende, cómo se protege*. Hoy los datos financieros no se persisten en cache (bien) — comunicarlo. Privacy Policy + Terms hosteados y linkeados in-app son además requisito de App Review.
3. **Reducción de fricción inicial** (§5.2) — el factor #1 de retención W1 en fintech.
4. **Accesibilidad.** VoiceOver/TalkBack **no auditados**. Una pasada de accesibilidad (labels, foco, contraste ya AA) amplía alcance real y mejora rating.
5. **Prueba social y rating prompt** en el momento de alegría (post-Wrapped, post-logro), no al azar.
6. **Referral / shareable** liviano (Wrapped como imagen). Crecimiento orgánico de bajo costo.
7. **Generosidad del free tier.** Para adopción masiva, el free debe resolver el core (cargar gastos + cupo diario + asistente básico) sin castigar. Monetizar profundidad, no lo esencial.
8. **Inclusión financiera como narrativa de marca.** "Para personas reales que no son expertas en finanzas" ya está en el ADN — explotarlo en marketing/onboarding/copy.

---

## 7. Monetización (re-pensada por segmento)

La auditoría existente ([03-monetization](../real-value-suggestions/03-monetization/audit.md)) propone tiers **100% familia** (Free/Pro/Family+). No contempla solteros ni pymes. Propuesta de re-encuadre:

| Segmento | Free | Pago | Eje de valor a monetizar |
|---|---|---|---|
| **Individual** | Core completo (gastos, cupo, asistente básico, 3 meses historial) | ~US$ pequeño/mes | Historial completo + export + asistente avanzado/LLM + OCR + widgets |
| **Familia** | 2 miembros, fijos limitados | Pro / Family+ | Miembros, sub-presupuestos, reportes, roles |
| **Pyme** | 1 usuario, 1 negocio | Tier mayor (B2B paga más) | Multi-usuario+roles, facturación, reportes contables, export, soporte |

Principios: **free generoso en lo esencial** (adopción), monetizar **profundidad y multi-usuario**; pymes con disposición de pago muy superior justifican un tier propio. Reactivar billing implica RevenueCat + StoreKit + tabla `subscriptions` + entitlement RLS + paywalls (depende de C2/Apple Dev).

---

## 8. Roadmap priorizado

Estimaciones de los agentes; ordenadas por ROI (valor/esfuerzo).

### Fase 0 — Pre-requisitos (días) · *hacer ya*
- **C1** Fix RLS `expenses` (filtrar `created_by` en UPDATE/DELETE). ~30 min. **Máxima prioridad.**
- Decidir **C2** (comprar Apple Developer) — desbloquea submit/IAP/push iOS.
- Password policy + C6 Android manifest. Horas.

### Fase 1 — Solteros (3-4 semanas) · *mayor ROI* · 🟢 **EN CURSO (v1 implementada 2026-05-22)**
- ✅ Onboarding con segmentación (Solo / Familia) y branch sin paso "familia".
- ✅ Familia invisible de 1 (lite, `families.kind`). Ver [spec](spec-modo-soltero-v1.md) · [plan](plan-modo-soltero-v1.md) · [sistema](../../sistemas/account-kinds.md).
- ✅ Copy condicional + ocultar UI de familia (FamilyStrip, invitar, admin) en modo solo.
- ⏳ Pendiente fast-follow: conversión solo→compartido (invitar después); validar asistente/logros en contexto de 1 persona; QA manual en simulador.
- **Meta:** signup→primer gasto >60%, time-to-value <2 min.

### Fase 2 — Aceptación masiva / pulido (2-3 semanas) · *en paralelo*
- Fast-track onboarding + empty states + tooltips de conceptos.
- Auditoría de accesibilidad (VoiceOver/TalkBack).
- Privacy/Terms hosteados + disclosure + mensaje de confianza de datos.
- Sentry + analytics (free), CI corriendo tests (C4/C5).
- Rating prompt contextual + shareable de Wrapped + referral liviano.
- ASO re-encuadrado a multi-segmento (no solo "gastos en pareja").

### Fase 3 — Monetización (2 semanas) · *si Apple Dev*
- RevenueCat + StoreKit + `subscriptions` + entitlement RLS + paywalls.
- Tiers por segmento (§7). Trial sin tarjeta.

### Fase 4 — Pymes (8-12 semanas) · *decisión de producto separada*
- Workspace completo + `companies/roles/customers/projects/invoices`.
- Modelo financiero de negocio (IVA, cashflow, ciclo fiscal) + reportes + export contable.
- Empezar por monotributista/freelancer (1 persona + facturación). Validar TAM/WTP antes.

---

## 9. KPIs de éxito

| Métrica | Hoy (estimado) | Meta solteros |
|---|---|---|
| Conversión signup → primer gasto | ~40% | >60% |
| Time-to-value (login → primer gasto) | ~5 min | <2 min |
| Retención W1 | ~40% (mediana fintech) | >50% |
| Open rate del asistente | ~25% | >40% |
| Rating App Store | — | ≥4.5 |

**North Star sugerida:** *usuarios que cierran ≥1 ciclo con un gasto registrado por semana* (mide el valor real: control sostenido del mes).

---

## 10. Decisiones que necesito de vos

1. **¿Orden de segmentos?** Recomendado: **solteros primero**, pymes en fase 2. ¿Confirmás, o querés pymes antes?
2. **¿Lite o workspace completo?** Si pymes es seguro y pronto → conviene el `workspace` genérico de una. Si solteros es la apuesta y pymes es "tal vez" → versión lite (familia invisible) y diferir el refactor.
3. **¿Apple Developer?** Casi todo lo de monetización/push/iOS depende de comprarlo (C2).
4. **¿Empiezo por el fix C1 (RLS)?** Es barato, crítico e independiente de todo lo demás.

---

## Apéndice — Fuentes

- Snapshot estado real: [ESTADO-DEL-PROYECTO/2026-05-21](../../ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md) (docs 01-09)
- Auditoría existente (familia): [real-value-suggestions/](../real-value-suggestions/README.md) (showstoppers, engagement, monetización, ASO, calidad, master-roadmap)
- Producto/visión: [documento-institucional-tecnico.md](../../producto/documento-institucional-tecnico.md), [flujos-y-funcionamiento.md](../../producto/flujos-y-funcionamiento.md), [brief-ui-ux.md](../../producto/brief-ui-ux.md), [branding.md](../../producto/branding.md)
- Sistemas: [asistente-financiero.md](../../sistemas/asistente-financiero.md), [achievements.md](../../sistemas/achievements.md), [cycle-wrapped.md](../../sistemas/cycle-wrapped.md), [editions.md](../../sistemas/editions.md)
- Arquitectura/seguridad/ops: [code-rules.md](../../arquitectura/code-rules.md), [pendientes-seguridad.md](../../operaciones/pendientes-seguridad.md), [runbook-backend-hardening.md](../../operaciones/runbook-backend-hardening.md)

<!-- Auditoría doc-based; verificar contra código antes de implementar -->
