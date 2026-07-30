# Nav motion — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anclar el FAB central de la tab bar por estructura y darle motion al indicador de tab activa, respetando el material neumórfico.

**Architecture:** La barra pasa de cinco hijos con `space-between` a tres zonas (`[grupo flex:1][FAB fijo][grupo flex:1]`), lo que fija el centro del FAB por construcción. El estado activo deja de ser un swap de vistas y pasa a ser un único nodo absoluto — el surco tallado — que se traslada entre slots con `translateX`. La aritmética de posiciones vive en un módulo puro testeable; el componente solo mide y anima.

**Tech Stack:** React Native 0.81 (Fabric) · Reanimated v4 · react-native-svg · vitest (env `node`, sin React renderer).

**Spec:** [`docs/superpowers/specs/2026-07-28-nav-motion-design.md`](../specs/2026-07-28-nav-motion-design.md)

## Global Constraints

- **El FAB nunca cambia de posición.** Ninguna tarea puede introducir un estado del que dependa su `x`.
- **Solo se animan `transform` y `opacity`.** Nunca `width`, `height`, `boxShadow` ni props de SVG. Cero layout por frame.
- **Duraciones y springs salen de `@/lib/motion`** (`motionDurations`, `motionSprings`, `motionEasings`). `npm run guard:motion-tokens` corre en CI y rechaza literales inline.
- **`transform` siempre es un array**, nunca `undefined` (gotcha del proyecto: crashea iOS).
- **Worklets sin `Intl` ni locale** (gotcha del proyecto: crashea sin stack).
- **Reduced motion manda:** `useReducedMotion()` incluye el heurístico de hardware (`deviceYearClass < 2020`). Con reduced, el surco salta y el ícono no rebota.
- **El bash tool no carga nvm:** correr `source ~/.nvm/nvm.sh` antes de cualquier `npx`/`npm`.
- **Commits ACOTADOS a los archivos de la tarea** (autorizado por el owner 2026-07-28): `git add <ruta>` explícito por archivo, nunca `git add -A` ni `git add .`. La branch `feat/ui-redesign` tiene ~67 archivos sin commitear de tandas anteriores (Gastos, partículas, kit del rediseño) que **no se deben tocar ni commitear**. Si un `git status` muestra archivos ajenos a la tarea, se dejan como están.

---

### Task 1: Módulo puro de geometría del indicador

Toda la aritmética de "dónde para el surco" vive acá, fuera del componente, para que sea testeable sin renderer (el entorno de tests es `node` y no puede montar RN).

**Files:**
- Create: `mobile/components/navigation/nav-indicator-geometry.ts`
- Test: `tests/unit/nav-indicator-geometry.test.ts`

**Interfaces:**
- Consumes: `NeoTabKey` de `@/components/navigation/neo-tab-bar-route-map`.
- Produces:
  - `interface SlotRect { x: number; width: number }`
  - `type SlotRects = Partial<Record<NeoTabKey, SlotRect>>`
  - `interface GroupOffsets { left: number; right: number }`
  - `const NAV_WELL_PADDING_X = 7`
  - `const NAV_FAB_SLOT_WIDTH = 66`
  - `function slotCenterX(groupX: number, slot: SlotRect): number`
  - `function resolveWellWidth(slots: SlotRects): number`
  - `function resolveIndicatorX(slots: SlotRects, groups: GroupOffsets, active: NeoTabKey, wellWidth: number): number | null`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/unit/nav-indicator-geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  NAV_WELL_PADDING_X,
  resolveIndicatorX,
  resolveWellWidth,
  slotCenterX,
  type GroupOffsets,
  type SlotRects,
} from '@/components/navigation/nav-indicator-geometry'

// Layout de referencia: dos grupos de 2 ítems. Los `x` de los slots son
// RELATIVOS a su grupo (así los reporta onLayout), los del grupo son
// relativos a la barra.
const GROUPS: GroupOffsets = { left: 20, right: 240 }
const SLOTS: SlotRects = {
  inicio: { x: 0, width: 50 },
  gastos: { x: 60, width: 56 },
  fijos: { x: 0, width: 44 },
  control: { x: 54, width: 62 },
}

describe('slotCenterX', () => {
  it('suma el offset del grupo al centro del slot', () => {
    expect(slotCenterX(20, { x: 60, width: 56 })).toBe(108)
  })
})

describe('resolveWellWidth', () => {
  it('usa el slot MÁS ANCHO más el padding a ambos lados', () => {
    // el más ancho es control (62) → 62 + 7*2
    expect(resolveWellWidth(SLOTS)).toBe(62 + NAV_WELL_PADDING_X * 2)
  })

  it('devuelve 0 sin mediciones (todavía no hubo onLayout)', () => {
    expect(resolveWellWidth({})).toBe(0)
  })

  it('ignora slots a medio medir', () => {
    expect(resolveWellWidth({ inicio: { x: 0, width: 50 } })).toBe(
      50 + NAV_WELL_PADDING_X * 2,
    )
  })
})

describe('resolveIndicatorX', () => {
  const wellWidth = resolveWellWidth(SLOTS)

  it('centra el surco sobre el slot activo', () => {
    // gastos: centro = 20 + 60 + 56/2 = 108 → x = 108 - wellWidth/2
    expect(resolveIndicatorX(SLOTS, GROUPS, 'gastos', wellWidth)).toBe(
      108 - wellWidth / 2,
    )
  })

  it('usa el offset del grupo DERECHO para fijos y control', () => {
    // fijos: centro = 240 + 0 + 44/2 = 262
    expect(resolveIndicatorX(SLOTS, GROUPS, 'fijos', wellWidth)).toBe(
      262 - wellWidth / 2,
    )
  })

  it('devuelve null si el slot activo todavía no se midió', () => {
    expect(resolveIndicatorX({}, GROUPS, 'inicio', wellWidth)).toBeNull()
  })

  it('devuelve null con ancho de surco 0 (nada que posicionar)', () => {
    expect(resolveIndicatorX(SLOTS, GROUPS, 'inicio', 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit/nav-indicator-geometry.test.ts
```

Esperado: FAIL — `Failed to resolve import "@/components/navigation/nav-indicator-geometry"`.

- [ ] **Step 3: Escribir el módulo**

Crear `mobile/components/navigation/nav-indicator-geometry.ts`:

```ts
// Aritmética del indicador (surco) de la tab bar neo. Vive fuera del
// componente para poder testearse sin renderer: el entorno de tests es `node`
// y no monta React Native.
//
// Convención de coordenadas — la misma que reporta `onLayout`:
//   · `SlotRect.x` es RELATIVO al grupo que contiene al ítem.
//   · `GroupOffsets.left/right` son relativos a la barra.
// El centro absoluto de un slot es entonces `groupX + slot.x + slot.width / 2`.
import type { NeoTabKey } from '@/components/navigation/neo-tab-bar-route-map'

export interface SlotRect {
  x: number
  width: number
}

/** Mediciones por tab. Parcial: hasta el primer onLayout no hay ninguna. */
export type SlotRects = Partial<Record<NeoTabKey, SlotRect>>

export interface GroupOffsets {
  left: number
  right: number
}

/** Holgura horizontal del surco respecto del contenido del ítem. Reproduce el
 *  footprint de la píldora aprobada (paddingHorizontal 13) sobre un ítem que
 *  mide con padding 6, SIN que el ítem cambie de tamaño al activarse — que es
 *  lo que hacía moverse al FAB. */
export const NAV_WELL_PADDING_X = 7

/** Ancho del hueco central reservado al FAB. */
export const NAV_FAB_SLOT_WIDTH = 66

/** Tabs de cada grupo, en orden visual. El surco cruza de un grupo al otro
 *  pasando por debajo del FAB. */
const LEFT_KEYS: readonly NeoTabKey[] = ['inicio', 'gastos']

export function slotCenterX(groupX: number, slot: SlotRect): number {
  return groupX + slot.x + slot.width / 2
}

/**
 * Ancho FIJO del surco (decisión de diseño): el del ítem más ancho más el
 * padding a ambos lados. Fijo para que el viaje sea `translateX` puro — animar
 * el ancho pagaría una pasada de layout por frame.
 */
export function resolveWellWidth(slots: SlotRects): number {
  let widest = 0
  for (const slot of Object.values(slots)) {
    if (slot && slot.width > widest) widest = slot.width
  }
  if (widest === 0) return 0
  return widest + NAV_WELL_PADDING_X * 2
}

/**
 * `x` del surco para la tab activa, o `null` cuando todavía no se puede
 * posicionar (falta la medición del slot, o no hay ancho). El caller trata el
 * null como "no dibujar el surco todavía" — nunca como 0, que lo plantaría en
 * el borde izquierdo por un frame.
 */
export function resolveIndicatorX(
  slots: SlotRects,
  groups: GroupOffsets,
  active: NeoTabKey,
  wellWidth: number,
): number | null {
  if (wellWidth <= 0) return null
  const slot = slots[active]
  if (!slot) return null
  const groupX = LEFT_KEYS.includes(active) ? groups.left : groups.right
  return slotCenterX(groupX, slot) - wellWidth / 2
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit/nav-indicator-geometry.test.ts
```

Esperado: PASS, 7 tests.

- [ ] **Step 5: Typecheck y lint**

```bash
source ~/.nvm/nvm.sh && npx tsc --noEmit && npx eslint mobile/components/navigation/nav-indicator-geometry.ts tests/unit/nav-indicator-geometry.test.ts
```

Esperado: sin salida (ambos limpios).

---

### Task 2: Layout de tres zonas — el ancla del FAB

Elimina la causa del salto: el FAB deja de depender de los anchos de los ítems.

**Files:**
- Modify: `mobile/components/navigation/neo-tab-bar-live.tsx` (el `return` de `NeoTabBarLive` y el bloque `styles`)

**Interfaces:**
- Consumes: `NAV_FAB_SLOT_WIDTH` de la Task 1.
- Produces: la barra renderiza `[navGroup][fabSlot][navGroup]`; los ítems ya no son hijos directos del contenedor `nav`.

- [ ] **Step 1: Reemplazar el cuerpo del `return`**

En `NeoTabBarLive`, cambiar el bloque de hijos (hoy `NAV_ITEMS.slice(0, 2).map(renderItem)` / FAB / `NAV_ITEMS.slice(2).map(renderItem)`) por:

```tsx
      {/* TRES ZONAS — el ancla del FAB.
          Antes esto eran 5 hijos con `justifyContent: 'space-between'`, y como
          el ítem ACTIVO se dibuja más ancho que el inactivo (paddingHorizontal
          13 vs 6, label 900 vs 800), la posición del FAB salía de
          `(ancho − 66)/2 + (grupoIzq − grupoDer)/2`: al pasar la tab activa del
          par izquierdo al derecho el término cambiaba de signo y el FAB se
          corría ~14px. Con dos grupos de `flex: 1` idéntico, el centro del FAB
          ES el centro de la barra por construcción — inmune al largo de los
          labels (ES vs EN), al padding del activo y al fontScale. */}
      <View style={styles.navGroup}>
        {NAV_ITEMS.slice(0, 2).map(renderItem)}
      </View>
      <View style={styles.fabSlot}>
        {renderFab ? (
          renderFab()
        ) : (
          <DefaultNeoFab s={s} mode={mode} fabBadge={fabBadge} label={t('states:tabs.add')} onPress={onPressFab} />
        )}
      </View>
      <View style={styles.navGroup}>
        {NAV_ITEMS.slice(2).map(renderItem)}
      </View>
```

- [ ] **Step 2: Agregar los estilos de zona**

En `styles`, agregar `navGroup` y reemplazar `fabSlot`:

```ts
  navGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // `space-between`, NO `space-around` (fallo del owner 2026-07-28): con
    // `space-around` el grupo agrega un hueco de `sobrante/4` ANTES del primer
    // ítem y DESPUÉS del último, y el mockup aprobado los tiene AL RAS del
    // borde interno de la barra (design/home-final-2026-07/home.dc.html:80-86,
    // cinco hijos planos bajo un solo `space-between`). Con `space-between`
    // dentro del grupo, "Inicio" y "Control" vuelven al ras y todo el sobrante
    // del grupo queda ENTRE sus dos ítems, que es donde estaba antes.
    justifyContent: 'space-between',
  },
  // Ancho FIJO: es la mitad de la ecuación del ancla (la otra mitad son los dos
  // `flex: 1` idénticos de los grupos). Lleva el disco MÁS la calle a cada lado:
  // con `space-between` en los grupos, el aire que antes ponía el reparto entre
  // el último ítem y el FAB ahora tiene que vivir en el propio hueco, o los
  // ítems interiores quedarían pegados al disco.
  fabSlot: {
    width: NAV_FAB_SLOT_WIDTH + NAV_FAB_GUTTER_X * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
```

Importar las constantes:

```ts
import { NAV_FAB_GUTTER_X, NAV_FAB_SLOT_WIDTH } from '@/components/navigation/nav-indicator-geometry'
```

`NAV_FAB_GUTTER_X` no existe todavía: agregarlo al módulo de la Task 1 con valor `15` y este docblock:

```ts
/** Calle a cada lado del FAB. Reproduce el aire que el layout viejo repartía
 *  entre el último ítem de un grupo y el disco: con `space-between` dentro de
 *  los grupos ese sobrante ya no se reparte, así que la calle es explícita.
 *  15 sale de medir el reparto original a 393pt en español. */
export const NAV_FAB_GUTTER_X = 15
```

- [ ] **Step 3: Typecheck y lint**

```bash
source ~/.nvm/nvm.sh && npx tsc --noEmit && npx eslint mobile/components/navigation/neo-tab-bar-live.tsx
```

Esperado: sin salida.

- [ ] **Step 4: Verificar el ancla EN DEVICE (es la aceptación del constraint)**

Esto no se puede testear sin renderer; es la verificación explícita del spec. Abrir la app, y en cada una de las cuatro tabs medir la posición horizontal del FAB (screenshot y comparación de píxeles alcanza, o `onLayout` temporal con `console.log` de su `pageX`).

Esperado: el mismo valor en las cuatro tabs. Antes de este cambio, Gastos y Fijos difieren ~14px.

Verificar también que la barra sigue viéndose igual que el mockup aprobado (`design/home-final-2026-07/home.dc.html` a 393px): los grupos con `space-around` deben dejar los cuatro ítems donde estaban. Si la distribución cambió de forma visible, ajustar el `justifyContent` del grupo antes de seguir.

---

### Task 3: El surco que viaja

**Files:**
- Modify: `mobile/components/navigation/neo-tab-bar-live.tsx`

**Interfaces:**
- Consumes: `resolveIndicatorX`, `resolveWellWidth`, `SlotRect`, `SlotRects` (Task 1); `groupOffsets` (Task 2).
- Produces: `NeoNavItem` acepta dos props nuevos —
  `onMeasure?: (key: NeoTabKey, rect: SlotRect) => void` y `reduceMotion: boolean`—
  y el estado activo ya NO se dibuja dentro del ítem. El `reduceMotion` lo lee
  `NeoTabBarLive` UNA vez y lo baja por prop (mismo patrón que el prop
  homónimo de `usePressScale`): así los cuatro ítems y el surco animan contra
  la misma fuente de verdad. `NeoNavItem` se lo pasa además a su
  `usePressScale({ pressedScale: 0.94, reduceMotion })`.

- [ ] **Step 1: Medir los dos grupos**

En el cuerpo de `NeoTabBarLive` (los `onLayout` se cablean en el JSX de la Task 2, sobre los dos `styles.navGroup`):

```tsx
  // Parcial a propósito: `0` es un offset MEDIBLE, así que no sirve como valor
  // inicial — con `{left: 0, right: 0}` el surco se daría por posicionable
  // apenas llega un slot, aunque los offsets de grupo todavía no hubieran
  // reportado, y el primer posicionamiento aterrizaría en groupX = 0 para
  // saltar después ~20pt (grupo izquierdo) o ~230pt (derecho): justo el
  // "entra deslizándose desde la izquierda" que queremos evitar.
  const [groupOffsets, setGroupOffsets] = useState<Partial<GroupOffsets>>({})
  const onLayoutLeftGroup = useCallback((e: LayoutChangeEvent) => {
    const x = e.nativeEvent.layout.x
    setGroupOffsets((prev) => (prev.left === x ? prev : { ...prev, left: x }))
  }, [])
  const onLayoutRightGroup = useCallback((e: LayoutChangeEvent) => {
    const x = e.nativeEvent.layout.x
    setGroupOffsets((prev) => (prev.right === x ? prev : { ...prev, right: x }))
  }, [])
  // Solo con AMBOS medidos hay marco de coordenadas completo.
  const groups: GroupOffsets | null =
    groupOffsets.left != null && groupOffsets.right != null
      ? { left: groupOffsets.left, right: groupOffsets.right }
      : null
```

y en el Step 5, `targetX` se calcula solo con `groups` no-null:

```tsx
  const targetX = useMemo(
    () => (groups ? resolveIndicatorX(slots, groups, activeTab, wellWidth) : null),
    [slots, groups, activeTab, wellWidth],
  )
```

y agregarlos al JSX: `<View style={styles.navGroup} onLayout={onLayoutLeftGroup}>` y `onLayout={onLayoutRightGroup}` en el derecho.

Imports: `useCallback`, `useState` de react; `type LayoutChangeEvent` de react-native; `type GroupOffsets` del módulo de geometría.

- [ ] **Step 2: Medir cada slot desde `NeoNavItem`**

Agregar el prop y el `onLayout` sobre el nodo raíz del ítem (tanto la rama con `onPress` como la del preview estático):

```tsx
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onMeasure?.(item.key, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })
    },
    [onMeasure, item.key],
  )
```

- [ ] **Step 3: Unificar el interior del ítem**

El ítem deja de tener dos vistas distintas: siempre dibuja la misma caja, y lo que cambia es la tinta. El surco lo pone el indicador, no el ítem. (La Task 4 vuelve sobre este mismo bloque para cruzar las tintas; acá queda en su forma simple.)

```tsx
  const inner = (
    <View style={styles.navIdle} onLayout={handleLayout}>
      <NeoTabIcon name={item.icon} color={active ? s.navActiveInk : s.navIdleInk} size={20} strokeWidth={active ? 2.3 : 2.2} />
      <Text style={[styles.navIdleLabel, { color: active ? s.navActiveInk : s.navIdleInk }]}>{label}</Text>
      {dot ? <View style={[styles.navItemDot, { backgroundColor: s.navItemDot }]} /> : null}
    </View>
  )
```

Borrar el estilo `navActive` y `navActiveLabel` (el surco y el peso los toma el indicador y la Task 4).

- [ ] **Step 4: Acumular las mediciones en el padre**

En `NeoTabBarLive`:

```tsx
  const [slots, setSlots] = useState<SlotRects>({})
  const onMeasureSlot = useCallback((key: NeoTabKey, rect: SlotRect) => {
    setSlots((prev) => {
      const cur = prev[key]
      if (cur && cur.x === rect.x && cur.width === rect.width) return prev
      return { ...prev, [key]: rect }
    })
  }, [])
```

y pasarlo en `renderItem`: `onMeasure={onMeasureSlot}`.

- [ ] **Step 5: Animar el surco**

```tsx
  const reduceMotion = useReducedMotion()
  const wellWidth = useMemo(() => resolveWellWidth(slots), [slots])
  const targetX = useMemo(
    () => resolveIndicatorX(slots, groupOffsets, activeTab, wellWidth),
    [slots, groupOffsets, activeTab, wellWidth],
  )

  // "Tengo posición" va en un FLAG PROPIO, no codificado en el signo de la x.
  //
  // Un centinela negativo parece natural pero es un bug: `targetX` puede ser
  // legítimamente negativo. Para `inicio` (primer hijo del grupo, `slot.x = 0`,
  // `groupX` = el paddingLeft de la barra = 20):
  //   targetX = 20 + w/2 − (masAncho + 14)/2 = 13 − (masAncho − w)/2
  // o sea negativo apenas el label más ancho supera al de Inicio por más de
  // 26pt. En inglés ("Expenses" vs "Home") eso queda a un pelo, y como
  // `navIdleLabel` no capea `maxFontSizeMultiplier`, la diferencia escala con
  // Dynamic Type y cruza el cero cerca de fontScale 1.6 — el PRIMER tamaño de
  // accesibilidad de iOS. Con el signo como centinela eso falla doble y en
  // silencio: el surco se dibuja con opacidad 0 (invisible mientras Inicio esté
  // activa) y además vuelve para siempre a la rama de "primer posicionamiento",
  // así que ningún cambio de tab vuelve a animar.
  const indicatorX = useSharedValue(0)
  const hasPosition = useSharedValue(false)
  useEffect(() => {
    if (targetX == null) return
    if (!hasPosition.value || reduceMotion) {
      // Primer posicionamiento (o reduced motion): sin viaje.
      indicatorX.value = targetX
      hasPosition.value = true
      return
    }
    indicatorX.value = withSpring(targetX, motionSprings.tabShift)
  }, [targetX, reduceMotion, indicatorX, hasPosition])
  useEffect(() => () => cancelAnimation(indicatorX), [indicatorX])

  const wellStyle = useAnimatedStyle(() => ({
    opacity: hasPosition.value ? 1 : 0,
    transform: [{ translateX: indicatorX.value }],
  }))
```

Y como PRIMER hijo del contenedor `nav` (para que quede detrás de ítems y FAB):

```tsx
      {/* EL SURCO. Es el mismo material de la barra, hundido — en light
          `navActiveBackground` es undefined a propósito. Se TRASLADA, nunca
          escala: los offsets de la sombra inset son fijos (4/4 y −4/−4), así
          que mover el nodo mantiene la dirección de la luz y el relieve se lee
          real; escalarlo estiraría la profundidad percibida y delataría el
          material. El `boxShadow` NO se anima (es un string: no se interpola en
          worklet y costaría un commit de Fabric por frame) — viaja con el nodo
          sin recalcularse. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.well,
          { width: wellWidth, backgroundColor: s.navActiveBackground, boxShadow: s.navActiveShadow },
          wellStyle,
        ]}
      />
```

Estilo:

```ts
  well: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 13,
    borderRadius: 18,
  },
```

Imports nuevos: `useEffect`, `useMemo` de react; `cancelAnimation`, `useAnimatedStyle`, `useSharedValue`, `withSpring` de reanimated; `useReducedMotion` de `@/hooks/use-reduced-motion`; `motionSprings` de `@/lib/motion`.

- [ ] **Step 6: Typecheck, lint y guard de motion**

```bash
source ~/.nvm/nvm.sh && npx tsc --noEmit && npx eslint mobile/components/navigation/neo-tab-bar-live.tsx && npm run guard:motion-tokens
```

Esperado: tsc y eslint sin salida. El guard puede fallar por las 26 violaciones PRE-EXISTENTES en otros archivos (billing, fijos, garden, count-up-text, use-border-glow, intro-slides, signup, asistente, achievements-gallery) — eso es de antes y tiene su propia tarea. Lo que NO puede aparecer en la lista es `neo-tab-bar-live.tsx`.

- [ ] **Step 7: Revisión visual en device**

Las cuatro transiciones, incluidas las dos que cruzan el FAB (Gastos→Fijos y Fijos→Gastos). Verificar: el surco pasa POR DEBAJO del FAB, no por encima; al abrir la app el surco aparece ya puesto en la tab activa (sin viaje desde el borde); y con "Reducir movimiento" activado en el sistema el surco salta sin animar.

---

### Task 4: Pop del ícono y cross-fade de la tinta

**Files:**
- Modify: `mobile/components/navigation/neo-tab-bar-live.tsx` (solo `NeoNavItem`)

**Interfaces:**
- Consumes: el prop `active` que `NeoNavItem` ya recibe.
- Produces: nada nuevo hacia afuera.

- [ ] **Step 1: Cross-fade de la tinta con dos capas**

La tinta NO se anima con `interpolateColor`: el color del ícono es el `stroke` de un SVG y animarlo exigiría `Animated.createAnimatedComponent` sobre los `Path` de `react-native-svg` (más nodos animados, y el proyecto ya tiene la gotcha del cast de children). En su lugar, dos copias apiladas y una opacidad — transform/opacity puro, un solo valor animado por ítem.

En `NeoNavItem`, reemplazar `inner` por:

```tsx
  const activeProgress = useSharedValue(active ? 1 : 0)
  useEffect(() => {
    if (reduceMotion) {
      activeProgress.value = active ? 1 : 0
      return
    }
    activeProgress.value = withTiming(active ? 1 : 0, {
      duration: motionDurations.quick,
      easing: motionEasings.standard,
    })
  }, [active, reduceMotion, activeProgress])
  useEffect(() => () => cancelAnimation(activeProgress), [activeProgress])

  const activeInkStyle = useAnimatedStyle(() => ({ opacity: activeProgress.value }))
```

La capa activa se superpone con `absoluteFill` y el mismo centrado del padre; el JSX final del ítem (ya con el pop del Step 2) se muestra completo en el Step 2 para no dejar dos versiones dando vueltas.

Estilo:

```ts
  navActiveInk: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
```

- [ ] **Step 2: Pop del ícono que entra**

Sobre el mismo `activeProgress`, un rebote corto que solo corre en el flanco de subida:

```tsx
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.14 }],
  }))
```

con

```tsx
  const pop = useSharedValue(0)
  // FLANCO DE SUBIDA REAL, no "está activo".
  //
  // Un `if (!active) return` pelado NO alcanza: el efecto también corre en el
  // MONTAJE, y ahí la tab inicial ya llega con `active === true` — así que el
  // ícono de Inicio rebotaría en cada arranque de la app sin que nadie lo haya
  // tocado. El pop es confirmación de un tap; sin tap no hay nada que confirmar.
  // (`activeProgress` no sufre esto porque se siembra en `active ? 1 : 0`, así
  // que su withTiming de montaje anima hacia el valor que ya tiene y es
  // visualmente inerte. `pop` siempre arranca en 0, así que su corrida de
  // montaje SÍ se ve.)
  //
  // Comparar contra el valor anterior también deja el efecto inmune a re-runs
  // que no son cambios de tab: si cambiara `reduceMotion` estando la tab
  // activa, `wasActive === active` y no rebota.
  const wasActiveRef = useRef(active)
  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = active
    if (!active || wasActive || reduceMotion) return
    pop.value = withSequence(
      withSpring(1, motionSprings.press),
      withSpring(0, motionSprings.press),
    )
  }, [active, reduceMotion, pop])
  useEffect(() => () => cancelAnimation(pop), [pop])
```

`useRef` va a los imports de react si no está ya.

Envolver la caja del ítem en el nodo del pop, dejando el `onLayout` afuera:

**OJO con el `onLayout`.** Va en el nodo raíz REAL de cada rama, y ese nodo
difiere: en la rama interactiva la raíz es el `AnimatedPressable`, no este
wrapper. Poner `onLayout={handleLayout}` incondicional acá lo dispara DOS veces
por ítem interactivo, y la segunda reporta `x ≈ 0` porque el wrapper está dentro
del Pressable — que es exactamente el bug que arregló la Task 3. Conservá el
`onPress ? undefined : handleLayout` que ya está en el archivo.

```tsx
  const inner = (
    <View onLayout={onPress ? undefined : handleLayout}>
      <Animated.View style={[styles.navIdle, popStyle]}>
        <NeoTabIcon name={item.icon} color={s.navIdleInk} size={20} strokeWidth={2.2} />
        <Text style={[styles.navIdleLabel, { color: s.navIdleInk }]}>{label}</Text>
        <Animated.View pointerEvents="none" style={[styles.navActiveInk, activeInkStyle]}>
          <NeoTabIcon name={item.icon} color={s.navActiveInk} size={20} strokeWidth={2.3} />
          <Text style={[styles.navIdleLabel, { color: s.navActiveInk }]}>{label}</Text>
        </Animated.View>
        {dot ? <View style={[styles.navItemDot, { backgroundColor: s.navItemDot }]} /> : null}
      </Animated.View>
    </View>
  )
```

El `onLayout` va en el nodo exterior por prolijidad, no por necesidad: en React
Native el layout lo calcula Yoga y los `transform` son de pintado, así que un
`scale` NO altera lo que reporta `onLayout`. Medir afuera del nodo que escala
igual deja la intención explícita para el que lea esto después.

Imports nuevos: `withSequence`, `withTiming` de reanimated; `motionDurations`, `motionEasings` de `@/lib/motion`.

- [ ] **Step 3: Typecheck, lint y guard**

```bash
source ~/.nvm/nvm.sh && npx tsc --noEmit && npx eslint mobile/components/navigation/neo-tab-bar-live.tsx && npm run guard:motion-tokens
```

Esperado: tsc y eslint limpios; `neo-tab-bar-live.tsx` ausente de la lista del guard.

- [ ] **Step 4: Revisión visual en device**

El rebote tiene que leerse como confirmación del tap, no como un juguete: si a los diez taps cansa, bajar el `0.14`. Verificar además que la capa activa queda EXACTAMENTE encima de la idle (sin doble contorno ni desalineación de medio píxel): las dos se centran en la misma caja y el padding es simétrico, así que cualquier corrimiento visible significa que el `navActiveInk` perdió el `alignItems`/`gap` del padre.

---

### Task 5: Transición entre pantallas

**Files:**
- Modify: `mobile/components/navigation/app-tabs.tsx:300`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Cambiar `animation`**

Reemplazar la línea `animation: 'none' as const,` y su comentario por:

```ts
      // `animation: 'fade'` · el `shift` original (220ms de desplazamiento
      // direccional) se sentía lento y por eso se había apagado del todo. Lo
      // que costaba era el RECORRIDO, no el fundido: con `lazy: false` las
      // cinco pantallas ya están montadas, así que un crossfade es compositing
      // puro y no re-monta nada. Si vuelve a leerse como demora, esta línea
      // sola vuelve a `'none'`.
      animation: 'fade' as const,
```

- [ ] **Step 2: Typecheck y lint**

```bash
source ~/.nvm/nvm.sh && npx tsc --noEmit && npx eslint mobile/components/navigation/app-tabs.tsx
```

Esperado: sin salida.

- [ ] **Step 3: Juicio del owner en device**

Este paso es una decisión, no una verificación técnica: el owner eligió `animation: 'none'` después de un A/B contra NativeTabs porque la navegación se sentía "MUY SUPERIOR en rapidez". Probar las cuatro tabs en un device de gama baja y preguntar explícitamente si se siente más lento que antes. **Si hay la menor duda, revertir a `'none'`** — la barra ya aporta el motion y no vale la pena pagarlo con velocidad percibida.

---

### Task 6: Verificación integral

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite completa**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit
```

Esperado: verde. La baseline antes de este plan es 150 archivos / 1317 tests; con la Task 1 suma un archivo y 7 tests.

- [ ] **Step 2: Typecheck y lint del proyecto**

```bash
source ~/.nvm/nvm.sh && npm run typecheck && npm run lint
```

Esperado: ambos limpios.

- [ ] **Step 3: Medición final del ancla**

Repetir la medición del `pageX` del FAB en las cuatro tabs, ahora con TODO el motion puesto. Es el criterio de aceptación del constraint del owner y tiene que dar idéntico en las cuatro.

- [ ] **Step 4: Gama baja**

Con reduced-motion activado en el sistema (o en un device con `deviceYearClass < 2020`): el surco salta, el ícono no rebota, la tinta cambia seca. Nada tiene que quedar en un estado intermedio.
