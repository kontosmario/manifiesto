# 📚 Documentación de Manifiesto

> Hub único de toda la documentación del proyecto. Todo lo que antes estaba disperso (raíz, carpetas sueltas, audit) vive ahora acá, organizado por tema.
>
> **Última reorganización:** 2026-05-22.

---

## 🧭 Estado general del proyecto (TL;DR)

**Manifiesto** es una app mobile (Expo + React Native + Supabase) de **finanzas familiares compartidas** (es-AR). Está **feature-complete desde 2026-05-09**; el foco actual es operación, hardening, performance y pulido — no scope nuevo.

- ✅ **LIVE:** auth completo, onboarding, Home + Control + Fijos (V2), Gastos (V2), asistente heurístico, rachas, logros, Manifiesto Wrapped, ediciones, account deletion end-to-end.
- ⏸️ **En pausa:** monetización (RevenueCat/IAP), Sentry, PostHog, AI Coach LLM, OCR.
- ⛔ **Bloqueado por Apple Developer Program** (sin comprar): submit a App Store, IAP, push iOS, widgets.
- 🔴 **Deuda crítica abierta** (independiente de Apple): vulnerabilidad RLS en `expenses` (cualquier miembro de familia puede editar/borrar gastos de otro).

> **La fuente de verdad del estado real y actual** (cada vista, componente, servicio) es el snapshot fechado **[ESTADO-DEL-PROYECTO](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md)**.

---

## 🗂️ Mapa de la documentación

Marcadores de frescura: 📸 snapshot (fuente de verdad) · ✅ vigente · 🔧 operativo · 🗓️ histórico/referencia · 📦 archivado.

### 📸 [`ESTADO-DEL-PROYECTO/`](ESTADO-DEL-PROYECTO/) — estado real por fechas (fuente de verdad)

Snapshots completos del proyecto verificados contra el código. Foto vigente: **[2026-05-21](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md)**.

| Doc | Cubre |
|---|---|
| [00 · Índice](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md) | Resumen ejecutivo + mapa del snapshot |
| [01 · Arquitectura/nav/estado/theme](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/01-arquitectura-stack-navegacion-estado.md) | Stack, routing, navegación custom, theme, providers, lib, hooks |
| [02 · Auth y onboarding](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/02-auth-onboarding.md) | Login/signup/join, OAuth, biometría, onboarding, account deletion |
| [03 · Home, Control y Fijos](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/03-home-control-fijos.md) | Home, Control v2, gastos fijos |
| [04 · Gastos y altas](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/04-gastos-add-flows.md) | Lista de gastos, alta gasto/ingreso, historial, filtros, notas |
| [05 · Insights/Asistente/Coach](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/05-insights-asistente-coach.md) | Motor de señales, asistente heurístico, rachas |
| [06 · Settings y engagement](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/06-settings-engagement.md) | Settings, logros, Wrapped, ediciones, billing mock |
| [07 · Backend/servicios/DB](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/07-backend-servicios-db.md) | Edge functions, esquema, RPCs, RLS, crons, CI |
| [08 · Estado vs decisiones](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/08-estado-vs-decisiones-pasadas.md) | Dónde estamos hoy respecto a cada decisión del owner |
| [09 · Candidatos a eliminar](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/09-candidatos-a-eliminar.md) | Registro de la limpieza de dead code (ejecutada 2026-05-22) |

### ✅ [`arquitectura/`](arquitectura/) — reglas técnicas

| Doc | Estado | Cubre |
|---|---|---|
| [code-rules.md](arquitectura/code-rules.md) | ✅ vigente | Guía normativa de arquitectura, capas, performance y UX (CODE RULES v2) |

### 🗓️ [`producto/`](producto/) — visión, flujos, marca

| Doc | Estado | Cubre |
|---|---|---|
| [documento-institucional-tecnico.md](producto/documento-institucional-tecnico.md) | 🗓️ histórico (abr-2026) | Visión institucional/técnica del producto |
| [flujos-y-funcionamiento.md](producto/flujos-y-funcionamiento.md) | 🗓️ histórico (abr-2026) | Flujos funcionales de la app |
| [brief-ui-ux.md](producto/brief-ui-ux.md) | 🗓️ histórico (abr-2026) | Brief para diseñador UI/UX |
| [branding.md](producto/branding.md) | ✅ vigente | Identidad visual; la Home es la fuente de verdad visual |

### ⚙️ [`sistemas/`](sistemas/) — docs canónicos de sistemas LIVE

| Doc | Estado | Cubre |
|---|---|---|
| [achievements.md](sistemas/achievements.md) | ✅ vigente | Sistema de logros (14 codes, triggers, realtime, galería) |
| [cycle-wrapped.md](sistemas/cycle-wrapped.md) | ✅ vigente | Manifiesto Wrapped (modal post-cobro, escenas) |
| [editions.md](sistemas/editions.md) | ✅ vigente | Archivo de Wrappeds anteriores |
| [asistente-financiero.md](sistemas/asistente-financiero.md) | ✅ vigente | Asistente heurístico (doc canónico, ex-v2) |
| [asistente-llm-augmentation-notes.md](sistemas/asistente-llm-augmentation-notes.md) | ✅ vigente | Plan de augmentation con LLM (deferred) |

### 🔧 [`operaciones/`](operaciones/) — setup, runbooks, backlog operativo

| Doc | Estado | Cubre |
|---|---|---|
| [setup-entorno.md](operaciones/setup-entorno.md) | 🔧 vigente | Setup local, env vars, Supabase CLI, email, push, deep linking, CI |
| [runbook-backend-hardening.md](operaciones/runbook-backend-hardening.md) | 🔧 vigente | Runbook operacional de backend (refresh, retention, rollback) |
| [pendientes-seguridad.md](operaciones/pendientes-seguridad.md) | 🔧 backlog | Backlog de seguridad pendiente |
| [push-notifications-ios-setup.md](operaciones/push-notifications-ios-setup.md) | 🔧 pendiente | Setup de push iOS (bloqueado por Apple Dev) |
| [project-state-2026-05-09.md](operaciones/project-state-2026-05-09.md) | 🗓️ histórico | Estado del proyecto al 2026-05-09 (superado por ESTADO-DEL-PROYECTO) |

### 🔍 [`auditorias/`](auditorias/) — auditorías y refactors

| Doc | Estado | Cubre |
|---|---|---|
| [real-value-suggestions/](auditorias/real-value-suggestions/README.md) | 🗓️ audit | Auditoría exhaustiva de gaps para llegar al "ideal" (showstoppers, engagement, monetización, ASO, calidad, roadmap) + refactors de nav/hero documentados |

### 📦 [`archivo/`](archivo/) — históricos sin valor operativo activo

`gastos-architecture-v2.md`, `home-handoff.md`, `performance-audit-2026-05-02.md`, `performance-audit-prompt.md` — referencia histórica; superados por los docs vigentes.

---

## 🚦 Por dónde empezar

- **¿Cómo está el proyecto hoy?** → [ESTADO-DEL-PROYECTO/2026-05-21](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md)
- **¿Cómo levanto el proyecto?** → [operaciones/setup-entorno.md](operaciones/setup-entorno.md)
- **¿Reglas de código?** → [arquitectura/code-rules.md](arquitectura/code-rules.md)
- **¿Cómo funciona un sistema (logros/Wrapped/asistente)?** → [sistemas/](sistemas/)
- **¿Qué falta para el "ideal"?** → [auditorias/real-value-suggestions/](auditorias/real-value-suggestions/README.md)

---

## 📐 Convención

- **Estado actual del código** → siempre en `ESTADO-DEL-PROYECTO/` (snapshots fechados; no editar fotos viejas, crear una nueva carpeta `YYYY-MM-DD-*`).
- **Docs de sistemas vivos** → `sistemas/`, se actualizan in-place cuando cambia el sistema.
- **Nuevos runbooks/setup** → `operaciones/`.
- **Auditorías nuevas** → `auditorias/`.
- Cuando un doc quede obsoleto: moverlo a `archivo/` (no borrarlo si tiene valor histórico) o eliminarlo si es una dead note.
- Nombres de archivo en `kebab-case`.
