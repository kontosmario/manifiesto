# 2026-06-17 · Pulido UI + navegación (settings cleanup, flicker, warp del primer attach)

> Tanda de pulido pre-launch sobre el branch `feature/settings-cleanup` (9 commits,
> mergeado a `main`). Foco: limpieza de Settings para el build de producción + matar el
> "flicker/salto" de Gastos y Control al navegar entre tabs. Detalle técnico del sistema de
> animaciones de navegación en [`docs/sistemas/navigation-animations.md`](../sistemas/navigation-animations.md).

## Qué se cerró

### 1. Limpieza de Settings pre-launch (`cd2ad09`)
- Sección **Asistente**: solo "Preferencias del asistente" (las visitas guiadas ya viven en *Ayuda*).
- Los 2 **dev import-tools** (preview wizard + test REAL) movidos a la sección `__DEV__`
  "Desarrollo" → visibles en Expo Go/dev, omitidos en release.
- Eliminada **"Beta · Activity OCR"** (quedaba visible incluso en release).
- Eliminada **"Ayuda y legal"** — *Información → "Acerca de"* ya centraliza privacidad/términos/soporte.
- Limpieza de handlers/imports huérfanos (`legal-urls`, `Linking`, `Platform`, etc.).

### 2. Flicker aleatorio de Gastos/Control (`8907b31`)
- **Causa:** `gastosSnapshotQueryKey` incluía `cupoDiario` (float sin redondear, derivado de la
  lista de gastos) → drift → cache miss → swap a skeleton. Y `CountUpText` reseteaba el número
  del hero a 0 en cada cambio de valor.
- **Fix:** `computeCupoDiario()` redondea al peso en los 3 sitios (screen/controller/warm-prefetch);
  `keepPreviousData` en snapshot + calendar; `CountUpText` interpola desde el valor actual (no resetea a 0).

### 3. Saludo del Home (`299cc85`, `4181e0a`)
- Nombres largos/compuestos ya no rompen el título: `getGreetingName()` (primeros 2 tokens +
  cap) + auto-shrink en 1 línea + nombre completo en `accessibilityLabel`. +7 tests.
- Se sacó el "Hola," redundante (el eyebrow ya saluda) → la línea grande es solo el nombre.

### 4. Tiles de actividad coloreados por categoría (`6040a3e`)
- El feed de actividad del Home dejó de usar `peachBand` fijo → tinta el icon-tile por categoría
  (igual que Gastos · Movimientos, vía `withAlpha`). Ingresos en verde de crédito.

### 5. Instrumentación dev de animaciones (`9c483d1`, `457982f`)
- `mobile/lib/dev/anim-log.ts` — logger dev-only (focus/blur, frames por transición, lifecycle,
  gate, CountUpText, branch, stack). **Default OFF** (se prende en Ajustes → Desarrollo). Se usó
  para diagnosticar los bugs de abajo.

### 6. Warp/salto del primer attach (`26bbb83`, `127b955`) — el core de la tanda
- **Causa:** el gate de `LinearTransition` abría con un timer (~72ms post-focus), pero el
  SectionList virtualizado de Gastos seguía asentando su layout después → la `LinearTransition`
  interpolaba ese settle = warp. Home/Fijos no lo sufren (data warm, layout asentado al primer paint).
- **Fix de fondo:** el gate ahora abre con la **primera interacción** (scroll), no con timer;
  fallback 1500ms; re-cierra en blur. + gateo de entradas crudas (barras, fades, hero de Control).
- **Último delta (Gastos):** el **advisor chip** crecía `0→52px` tarde → el `ListHeaderComponent`
  re-medía → salto. Fix: **slot de altura fija** con afirmación calma cuando no hay alerta
  (`content-jumping` + `empty-states`).

## Estado
- **Confirmado en device/Expo Go por el owner:** los 4 tabs (Inicio/Gastos/Fijos/Control) entran
  sin flicker ni warp. ✅
- El sistema y los gotchas quedaron documentados en `docs/sistemas/navigation-animations.md` con
  un checklist para no reintroducir el jank en screens nuevos.

## Aprendizajes portables (ver doc de sistema)
1. **Warm-seed = layout asentado al primer paint** → nada que la `LinearTransition` interpole.
   Es lo que hace inmunes a Home/Fijos.
2. **No metas floats derivados en queryKeys.** Redondealos o sacalos.
3. **`LinearTransition` se arma con la interacción, no con un timer** — así el settle del primer
   attach snapea.
4. **`ListHeaderComponent` de altura estable** — reservá altura para elementos async (no `null`→grow),
   o el list virtualizado re-mide y salta.
