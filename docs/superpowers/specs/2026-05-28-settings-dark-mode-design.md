# Dark mode del cluster Ajustes — Design Spec

**Fecha:** 2026-05-28
**Sub-proyecto:** A (de 5 — ver mensaje de decomposición del rediseño de Ajustes)
**Branch:** `feat/settings-dark-mode`

## Objetivo

Que el cluster de pantallas de Ajustes use en dark mode el mismo canvas near-black (`DARK_TAB_CANVAS #0A0F0C`) + ambient blobs `calm` que las tabs principales (home/gastos/fijos/control), en vez del canvas forest `#12211A` que las hace ver "demasiado verde y cansa la vista" (mismo feedback que motivó el rediseño de las tabs).

## Insight clave

Home usa **el mismo** `creamCard #305A47` para sus cards que Ajustes. Lo que hace que home lea limpio NO es un color de card distinto — es el **canvas near-black detrás**. Por lo tanto NO se re-tunean colores de superficie (`creamCard`, `surfaceMuted`, `line`); solo cambia el canvas + el tono de los blobs. Light mode queda 100% intacto.

## House-style a replicar (idéntico a las 4 tabs)

```tsx
<Screen backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined} ...>
// y los blobs tone-aware:
<AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />
```

## Alcance — las 8 pantallas del cluster

Todas reciben el canvas near-black en dark. Las que ya tienen blobs cambian a tone-aware; las que no tienen, se les agregan blobs `calm` para consistencia de familia.

| Pantalla | Tiene blobs hoy | Acción |
|---|---|---|
| `settings-screen.tsx` | sí (`<AmbientBlobs />` como child) | + `backgroundColor`; blob → tone-aware |
| `family-admin-screen.tsx` | sí | + `backgroundColor`; blob → tone-aware |
| `savings-goal-screen.tsx` | sí (+ `<Screen>` de loading) | + `backgroundColor` en ambos `<Screen>`; blob → tone-aware |
| `billing-screen.tsx` | sí | + `backgroundColor`; blob → tone-aware |
| `asistente-preferences-screen.tsx` | no | + `backgroundColor`; agregar blobs `calm` |
| `notifications-preferences-screen.tsx` | no | + `backgroundColor`; agregar blobs `calm` |
| `achievements-gallery-screen.tsx` | no (+ `<Screen>` de loading) | + `backgroundColor` en ambos; agregar blobs `calm` |
| `editions-screen.tsx` | no (+ `<Screen>` de loading) | + `backgroundColor` en ambos; agregar blobs `calm` |

**Por qué las 8 y no solo la principal:** navegar de un Ajustes near-black a una sub-pantalla forest flashea el fondo viejo y se siente roto. El cluster tiene que ser una familia visual.

## Fuera de alcance (son B/C/D/E)

Layout, contenido, animaciones, rediseño de cards, detalle de planes, UX de meta, grid de avatares. A es **solo el canvas dark**.

## Verificación

- Cada `<Screen>` del cluster pinta near-black en dark, forest-libre.
- Ningún elemento (header, safe-area, estados de loading/error) pinta `background`/`canvas` forest por detrás. `<Screen>` ya maneja el safe-area; riesgo bajo — se confirma visualmente pantalla por pantalla.
- Light mode sin cambios.
- `npm run typecheck` + `npm run lint` clean.
- Smoke visual (device, lo corre el usuario): entrar a Ajustes y a cada sub-pantalla en dark → canvas near-black consistente, sin flash forest.
