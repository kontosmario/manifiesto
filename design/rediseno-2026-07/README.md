# Rediseño UI 2026-07 — assets importados de Claude Design

Fuente: proyecto "Rediseño Manifiesto app neumórfico"
(claude.ai/design/p/0892036b-cd5a-4f5e-b188-d8f119804d96).

## Estado de los archivos

| Archivo | Estado |
| --- | --- |
| `notes/contenido-app.md` | ✅ completo — spec de contenido + decisiones + tokens de ambos temas |
| `brot.js` | ✅ completo — mascota vectorial canvas (18 poses), fuente del port a Skia |
| `particles.js` | ✅ completo — partículas flotantes |
| `support.js` | ✅ completo — runtime dc para renderizar el .dc.html |
| `brot/logo-light.png` / `logo-dark.png` | ✅ completos — LA marca (logo brote 2 hojas), por tema |
| `manifiesto-rediseno.dc.html` | ⚠️ **TRUNCADO a 256KiB** — solo cubre Turno 5 (onboarding 5a–5f claro+oscuro). Faltan turnos 4 (login+alta 4a–4m), 3 (8 flujos), 2 (Brot), 1 (exploración) |
| `brot/brot-front/back/side/small.png` | ⚠️ **TRUNCADOS** (referencia estática; superseded por brot.js vectorial) |

El truncamiento viene del cap de 256KiB por archivo de la herramienta de
lectura del proyecto de diseño. El documento completo se debe re-importar
(sesión claude.ai en browser, o export manual) a `incoming/`.

## Decisiones clave (de notes/contenido-app.md)

- Estilo neumórfico, temas claro (1b) y oscuro (1c). Tipografía Nunito 700–900.
- Tokens y recetas de sombra ya portados a `mobile/theme/neo-tokens.ts`.
- Brot es asistente/mascota; el logo brote (2 hojas) sigue siendo LA marca.
- Logo oficial por tema: `brot/logo-light.png` (claro) / `brot/logo-dark.png` (oscuro).
