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

→ **[`2026-05-21-estado-actual/`](2026-05-21-estado-actual/00-INDICE.md)** — snapshot completo verificado contra commit `7962ea2`.

## 🔖 Convención de estados (heredada del audit)

| Marcador | Significado |
|----------|-------------|
| ✅ **LIVE** | Existe en código y funciona en producción |
| 🟡 **PARCIAL** | Existe pero incompleto / mock / no wireado |
| 🔴 **NO EXISTE** | No está construido |
| ⏸️ **EN PAUSA** | Decisión explícita de no hacerlo ahora |
| ⛔ **BLOQUEADO** | Depende de algo externo (ej. Apple Dev Program) |
