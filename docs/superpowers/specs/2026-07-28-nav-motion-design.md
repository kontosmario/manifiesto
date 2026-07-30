# Nav — motion del tab bar neumórfico (FAB anclado)

**Fecha:** 2026-07-28 · **Branch:** `feat/ui-redesign` · **Estado:** diseño aprobado, sin implementar

## Problema

La barra de navegación del rediseño (`neo-tab-bar-live.tsx`, LIVE desde 2026-07-22) tiene dos carencias:

1. **El FAB central se corre de lugar.** La barra es un `flexDirection: 'row'` con `justifyContent: 'space-between'` y cinco hijos: `[inicio, gastos] · FAB · [fijos, control]`. El ítem activo se dibuja más ancho que el inactivo (`paddingHorizontal` 13 vs 6, label en peso 900 vs 800). Con `space-between`, la posición del FAB es

   ```
   x_fab = (anchoBarra − 66)/2 + (anchoGrupoIzq − anchoGrupoDer)/2
   ```

   Cuando la tab activa pasa del par izquierdo al derecho, el término `(izq − der)` cambia de signo y **el FAB se desplaza ~14px hacia la izquierda**. Inicio↔Gastos no lo mueve (el delta se cancela dentro del mismo grupo); Gastos→Fijos sí. Confirmado por el owner: es visible en uso.

2. **El cambio de tab no tiene motion.** El ítem activo y el inactivo son dos vistas distintas (`navActive` con surco vs `navIdle` plano) que se intercambian en un frame. No hay ninguna animación entre estados; lo único que se anima hoy es el `usePressScale` (0.94) de cada ítem.

## Constraint del owner

**El FAB central nunca se mueve de su posición.** El resto de los elementos de la barra sí pueden animarse.

## Por qué el motion tiene que ser un surco que se traslada

El estado activo del rediseño **no es un chip de color**: es un *surco tallado* en la superficie de la barra — `navActiveShadow` es un par de sombras `inset` (`inset 4px 4px 9px …, inset -4px -4px 9px …`), y en dark suma `navActiveBackground: '#142519'`. En light, `navActiveBackground` es `undefined`: el activo es literalmente el mismo material de la barra, hundido.

Eso restringe qué transformaciones son honestas con el material:

- **Trasladar el surco es válido.** Los offsets de la sombra son fijos (4/4 y −4/−4), así que la dirección de la luz no depende de dónde esté el surco. Un groove que se desliza por una superficie con luz constante es físicamente coherente.
- **Escalar el surco NO es válido.** Al escalar el nodo, la sombra inset escala con él: la profundidad percibida se estira y el material se delata como una imagen, no como un relieve.

Por eso la opción "aparece en el lugar con fade + escala" se descartó: peleaba con el material. El lenguaje de motion del proyecto ya lo anticipaba — `motionSprings.tabShift` está documentado en `mobile/lib/motion/tokens.ts` como *"matches the pill indicator's motion profile"*.

## Diseño

### 1. Anclaje estructural del FAB

La barra pasa de cinco hijos con `space-between` a **tres zonas**:

```
[ grupo izquierdo · flex: 1 ] [ FAB · ancho fijo ] [ grupo derecho · flex: 1 ]
```

Cada grupo distribuye sus dos ítems internamente. Con los dos flex iguales, el centro del FAB **es** el centro de la barra por construcción.

Esto lo vuelve inmune a todo lo que hoy lo movía: largo de los labels (ES vs EN — "Control" vs "Overview"), padding del ítem activo, `fontScale` del sistema, y cualquier animación futura sobre los ítems. El bug se elimina removiendo su causa, no compensándolo.

### 2. El surco viaja

Un **único nodo absoluto** dentro de la barra, con el `boxShadow` inset estático, animado por `translateX` con `motionSprings.tabShift`.

- **El `boxShadow` no se anima.** Es un string: no se interpola en un worklet y animarlo costaría un commit de Fabric por frame. Se mueve el nodo; la sombra viaja con él sin recalcularse.
- **Ancho fijo** (decisión del owner): el surco mide siempre lo mismo — el del label más ancho — así el viaje es `translateX` puro, cero layout por frame. Desvío aceptado contra el mockup: en "Fijos" el surco queda levemente más holgado que en el aprobado.
- **Al cruzar el hueco central pasa por debajo del FAB**, que está elevado (`top: -26`) con su propia sombra exterior y lo ocluye.
- Como el surco es de ancho fijo y los slots no, el destino de cada tab es **el centro del slot menos la mitad del ancho del surco**. Los centros se miden una vez (`onLayout` de cada ítem) y se guardan en shared values; no se recalculan por frame. Un cambio de idioma o de `fontScale` dispara nuevos `onLayout` y el mapa se actualiza solo.

### 3. Pop del ícono y tinta

- **Ícono entrante:** spring corto de escala sobre un solo nodo, transform puro. Reusa `motionSprings.press` — es el perfil de confirmación táctil que ya usa toda la app. Si en device pide otro carácter, se agrega un token nuevo en `motion/tokens.ts`; nunca un literal inline (lo rechaza el guard).
- **Tinta:** `interpolateColor` de `navIdleInk` → `navActiveInk` en el UI thread, `motionDurations.quick` (180ms).

### 4. Transición entre pantallas

`animation: 'none'` → `'fade'` en los `screenOptions` de `app-tabs.tsx`.

Solo opacidad, **nunca desplazamiento**. El `shift` anterior se sentía lento por el recorrido de 220ms, no por el fade; con `lazy: false` las cinco pantallas ya están montadas, así que un crossfade es compositing puro. Es una sola línea: si al owner le suena a demora, se revierte sin tocar nada más.

### 5. Overlay del FAB — YA IMPLEMENTADO, sin cambios

Se auditó al escribir el plan: el panel de acciones rápidas **ya** entra anclado al FAB — `withSpring(1, motionSprings.radialEnter)` con `scale 0.85→1`, `translateY 40→0` y opacidad escalonada, más una rama de reduced-motion y un exit por `withTiming` deliberadamente corto para no dejar el `Modal` capturando taps ([`add-quick-actions-overlay.tsx:83-145`](../../../mobile/components/navigation/add-quick-actions-overlay.tsx)). El FAB no se mueve: el que escala es el overlay.

No hay trabajo acá. Queda documentado para que la próxima revisión no lo vuelva a proponer.

## Invariantes

| Invariante | Cómo se sostiene |
|---|---|
| El FAB nunca se mueve | Su posición no depende de ningún estado: las dos zonas laterales tienen `flex: 1` fijo |
| Reduced motion | Todo colapsa a instantáneo. En este proyecto `useReducedMotion` incluye el heurístico de hardware (`deviceYearClass < 2020`), así que la gama baja no anima |
| Tokens de motion | Duraciones y springs salen de `@/lib/motion/tokens`; `guard:motion-tokens` corre en CI y rechaza literales inline |
| `transform` siempre array | Gotcha del proyecto: `transform: undefined` crashea iOS |
| Worklets sin `Intl`/locale | Gotcha del proyecto: crashea sin stack |
| Cero layout por frame | Solo se animan `transform`, `opacity` y color — nunca `width`, `height` ni `boxShadow` |

## Verificación

- **El FAB:** medir su `pageX` en las cuatro tabs y comprobar que es idéntico. Es la aceptación del constraint del owner y se puede verificar sin ojo.
- **Motion:** revisión visual en device, no en simulador, en las cuatro transiciones (incluidas las dos que cruzan el FAB).
- **Gama baja:** verificar que con reduced-motion forzado la barra cambia de estado sin animar y sin quedar en un estado intermedio.
- `npm run typecheck`, `npm run lint`, `npm run guard:motion-tokens`.

## Fuera de alcance

- Rediseñar la cara del FAB o su feedback de press (el swap-a-inset + burst ring es decisión del owner, se conserva).
- El badge del FAB (`fabBadge`), que sigue sin fuente de datos y requiere decisión aparte.
- La barra vieja (`app-tabs-ui.tsx` y compañía), que queda inerte pero presente para poder revertir el swap borrando una línea.
