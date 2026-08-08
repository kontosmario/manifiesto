# 📚 Documentación de Manifiesto

> Hub único de toda la documentación del proyecto. Todo lo que antes estaba disperso (raíz, carpetas sueltas, audit) vive ahora acá, organizado por tema.
>
> **Última reorganización:** 2026-05-22 · **Última actualización TL;DR:** 2026-06-11.

---

## 🧭 Estado general del proyecto (TL;DR)

**Manifiesto** es una app mobile (Expo + React Native + Supabase) de **finanzas familiares compartidas** (es-AR). **Feature-complete desde 2026-05-09**, **security-hardened audit-saturated desde 2026-06-11**, **listo para Apple submit** (solo falta el click del owner).

- ✅ **LIVE en código:** auth completo (Apple Sign-In con nonce CSPRNG, PIN 4-8 dígitos + 600k PBKDF2 + weak blocklist + server lockout mirror, biometric Keychain authority), onboarding, Home + Control + Fijos (V2), Gastos (V2), asistente heurístico, rachas, logros, Manifiesto Wrapped, ediciones, account deletion end-to-end (FK fixed, owner-of-family guard), Activity OCR + Import Review wizard.
- ✅ **LIVE en producción operacional:** dominio `manifiestoapp.com` con Privacy + Terms hosteados (Cloudflare Pages), Universal Links + App Links (`/.well-known/` para iOS/Android), email forwarding `soporte@`, EAS OTA code-signing (RSA-2048 keypair + cert↔key CI verify), seed account `apple.review@manifiestoapp.com` para Apple Review.
- ✅ **App Store v1.0 ASSEMBLED:** build 1.0.0 (1) en TestFlight, listing copy + 9 screenshots subidos, Privacy Nutrition + Age Rating completados, seed account configurada. Solo falta el click "Añadir a revisión".
- ⏸️ **En pausa por decisión owner:** monetización (RevenueCat/IAP), Sentry, PostHog, Google Sign-In (no nonce en SDK free), AI Coach LLM.
- 🟢 **Security state:** TRULY 100% clean — 11 audit passes + 14 remediation sprints (E→Q) cerraron ~185 findings. Audit-saturated verdict.

> **Fuente de verdad para sistemas/UI**: [ESTADO-DEL-PROYECTO/2026-05-21](ESTADO-DEL-PROYECTO/2026-05-21-estado-actual/00-INDICE.md). **Fuente de verdad para security state actual**: [ESTADO-DEL-PROYECTO/2026-06-11-security-hardening-FINAL.md](ESTADO-DEL-PROYECTO/2026-06-11-security-hardening-FINAL.md).

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
| [feature-layering-ui-vs-domain.md](arquitectura/feature-layering-ui-vs-domain.md) | ✅ vigente | Convención `gastos/expenses` y `fijos/fixed-expenses` — UI español sobre dominio inglés (no son duplicados) |

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
| [activity-ocr.md](sistemas/activity-ocr.md) | ✅ vigente (2026-06-03) | OCR de feeds bancarios + wizard de import. Bancos soportados + recipe para agregar nuevos. |
| [form-validation-pattern.md](sistemas/form-validation-pattern.md) | ✅ vigente (2026-06-03) | Patrón compartido: no preselect, visual-only disabled CTA, per-field warning glide. |
| [apple-pay-captura.md](sistemas/apple-pay-captura.md) | ⚠️ código completo (2026-08-08), sin verificar en device | Captura de gastos por Atajo de iOS: App Intent nativo, cola en UserDefaults, drenaje al wizard de revisión. |

### 🔧 [`operaciones/`](operaciones/) — setup, runbooks, backlog operativo

| Doc | Estado | Cubre |
|---|---|---|
| [setup-entorno.md](operaciones/setup-entorno.md) | 🔧 vigente | Setup local, env vars, Supabase CLI, email, push, deep linking, CI |
| [ambiente-dev.md](operaciones/ambiente-dev.md) | 🔧 vigente | **Ambiente de desarrollo de DB y backend**: stack local (Docker) + staging en la nube, cuentas de prueba, cómo se promueve un cambio hasta prod |
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
- **¿Cómo pruebo un cambio de backend sin tocar producción?** → [operaciones/ambiente-dev.md](operaciones/ambiente-dev.md)
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
