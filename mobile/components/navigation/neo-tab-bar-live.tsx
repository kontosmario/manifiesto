import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { Text } from '@/components/ui/app-text'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { NeoTabIcon } from '@/components/navigation/neo-tab-icons'
import {
  NAV_FAB_GUTTER_X,
  NAV_FAB_SLOT_WIDTH,
  NAV_KEY_GROUPS,
  resolveIndicatorX,
  resolveWellWidth,
  type GroupOffsets,
  type SlotRect,
  type SlotRects,
} from '@/components/navigation/nav-indicator-geometry'
import { HOME_SPEC, type HomeMode, type HomeSpec } from '@/components/redesign/home/home-spec'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { usePressScale } from '@/hooks/use-press-scale'
import { motionDurations, motionEasings, motionSprings } from '@/lib/motion'
import { cssGradient } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import type { NeoTabKey } from '@/components/navigation/neo-tab-bar-route-map'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

// Ancho MÁXIMO de la barra flotante = la composición del mockup aprobado:
// frame de 393dp (design/home-final-2026-07/home.dc.html) − 18dp de inset
// por lado ⇒ 357dp. En ventanas más anchas (densidad de pantalla "pequeña"
// del OS, tablets, foldables) el sobrante tiene que irse a los MÁRGENES
// laterales, nunca a la barra: los dos `navGroup` son `flex: 1` con
// `space-between`, así que cada dp extra de barra se convierte en hueco
// entre ítems y desparrama la composición (visto en un moto g20 con
// "Tamaño de pantalla: pequeño" ⇒ ventana de 484dp de ancho).
const NAV_MAX_OUTER_WIDTH = 357

/**
 * Barra de navegación del rediseño (spec `home-final`, aprobada 2026-07-21)
 * extraída a componente PRESENTATIONAL reutilizable — es el visual canónico
 * (pastilla flotante continua + píldora activa inset que envuelve ícono+label +
 * FAB central con surco `fabWell` entre los grupos [inicio,gastos] | FAB |
 * [fijos,control]). Portado 1:1 del `HomeNavBar` del kit
 * (mobile/components/redesign/home/home-screen.tsx) + tokens `HOME_SPEC`
 * (home-spec.ts) + estilos (:1902-1944), con 3 cambios vs el mockup crudo:
 *
 *   1. Labels por i18n (`t('states:tabs.*')`), no el hardcode ES del mockup.
 *   2. Gradientes por el seam `cssGradient(css, fallbackSólido)` (neo-tokens),
 *      así el `experimental_backgroundImage` degrada a fill sólido si RN alguna
 *      vez no lo soporta (Android viejo). Los gradientes SÍ rinden con minSdk 29.
 *   3. Press-scale (0.94 spring, equivalente a TabBarPressable) en los 4 tabs;
 *      el `transform` sale del hook SIEMPRE como array (nunca undefined).
 *
 * Sin routing acá: `activeTab` / `itemDots` / `fabBadge` / `onPressTab` /
 * `onPressFab` / `renderFab` los alimenta el adapter (renderNeoTabBar en
 * app-tabs.tsx) o el preview dev con props mock. NO dibuja el homeIndicator
 * del mockup (chrome de preview): el anclaje usa `bottomInset` real.
 */

export interface NeoTabBarLiveProps {
  mode: HomeMode
  activeTab?: NeoTabKey
  /** Dot 8×8 naranja SOLO en ítems inactivos (catálogo §2). El kit suprime
   *  el dot en la tab activa internamente (`item.key !== activeTab`). */
  itemDots?: Partial<Record<NeoTabKey, boolean>>
  /** Badge 20×20 del FAB. Solo lo pinta el FAB presentational (preview); el
   *  FAB real (renderFab) dibuja su propia cara. null/0 = oculto. */
  fabBadge?: number | null
  onPressTab?: (tab: NeoTabKey) => void
  onPressFab?: () => void
  /** Slot del FAB central. Si se pasa (F4 monta el AddExpenseTabButton real),
   *  reemplaza al FAB presentational. Si se omite (preview), se dibuja el FAB
   *  canónico del mockup (surco + gradiente invertido en dark + badge). */
  renderFab?: () => ReactNode
  /** Safe-area inset inferior real (F4 lo pasa desde BottomTabBarProps.insets).
   *  Si se omite, cae al margin del mockup (22) para el preview. */
  bottomInset?: number
}

const NAV_ITEMS: {
  key: NeoTabKey
  icon: 'home' | 'expenses' | 'fixed' | 'control'
  labelKey: string
}[] = [
  { key: 'inicio', icon: 'home', labelKey: 'states:tabs.home' },
  { key: 'gastos', icon: 'expenses', labelKey: 'states:tabs.expenses' },
  { key: 'fijos', icon: 'fixed', labelKey: 'states:tabs.fixed' },
  { key: 'control', icon: 'control', labelKey: 'states:tabs.control' },
]

// Derivados de `NAV_KEY_GROUPS` (nav-indicator-geometry.ts) — ÚNICA fuente de
// la partición por grupo. Antes cada `navGroup` se armaba con
// `NAV_ITEMS.slice(0, 2)` / `.slice(2)`, una segunda codificación del mismo
// hecho que `resolveIndicatorX` ya usaba por su cuenta: coincidían solo
// porque nadie había reordenado `NAV_ITEMS` todavía. Filtrar por key en vez
// de por posición hace que un reorder no pueda desalinear el grupo que
// renderiza un ítem del grupo que el indicador usa para ubicarlo. Módulo-level
// (no `useMemo`): `NAV_ITEMS` y `NAV_KEY_GROUPS` son estáticos, así que esto
// se calcula una sola vez por proceso, no por render.
const NAV_ITEMS_LEFT = NAV_ITEMS.filter((item) => NAV_KEY_GROUPS.left.includes(item.key))
const NAV_ITEMS_RIGHT = NAV_ITEMS.filter((item) => NAV_KEY_GROUPS.right.includes(item.key))

/** Fallback sólido de los gradientes cuando `experimental_backgroundImage` no
 *  esté soportado. El de la barra usa el `bg` neo (el gradiente ronda ese tono);
 *  el del FAB usa el segundo stop de su gradiente (verde profundo claro / crema
 *  oscuro). No pintan en RN 0.81 — el gradiente rinde — pero el seam los deja
 *  listos. */
const FAB_FALLBACK: Record<HomeMode, string> = {
  light: '#327E39',
  dark: '#DCE0D0',
}

function NeoNavItem({
  s,
  item,
  active,
  dot,
  label,
  onPress,
  onMeasure,
  reduceMotion,
}: {
  s: HomeSpec
  item: (typeof NAV_ITEMS)[number]
  active: boolean
  dot: boolean
  label: string
  onPress?: () => void
  /** Reporta el slot (x relativo al grupo, width) al padre para que el
   *  indicador sepa a dónde viajar. Ausente en el preview sin `onMeasure`. */
  onMeasure?: (key: NeoTabKey, rect: SlotRect) => void
  /** Bajado desde `NeoTabBarLive` (una sola lectura de `useReducedMotion`)
   *  para que los cuatro ítems y el surco animen contra la misma fuente de
   *  verdad — mismo patrón que el prop homónimo de `usePressScale`. */
  reduceMotion: boolean
}) {
  // Press-scale equivalente a TabBarPressable (0.94 spring). El haptic NO va
  // acá: en live lo dispara `screenListeners.tabPress` del <Tabs>.
  const pressScale = usePressScale({ pressedScale: 0.94, reduceMotion })

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onMeasure?.(item.key, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })
    },
    [onMeasure, item.key],
  )

  // Cross-fade de la tinta (Task 4). El color del ícono es el `stroke` de un
  // SVG: animarlo exigiría `Animated.createAnimatedComponent` sobre los
  // `Path` de react-native-svg (más nodos animados + la gotcha del cast de
  // children). En cambio dos copias apiladas — la idle siempre montada, la
  // activa superpuesta con `absoluteFill` — y una sola opacidad animada:
  // transform/opacity puro, un solo shared value por ítem.
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

  // Pop del ícono que entra (Task 4, fix ronda 1): rebote corto SOLO en el
  // flanco de subida REAL, no en "está activo". Un `if (!active) return`
  // pelado no alcanza: el efecto también corre en el MONTAJE, y ahí la tab
  // inicial ya llega con `active === true` — el ícono de Inicio rebotaría en
  // cada arranque de la app sin que nadie lo haya tocado. El pop es
  // confirmación de un tap; sin tap no hay nada que confirmar.
  // (`activeProgress` no sufre esto: se siembra en `active ? 1 : 0`, así que
  // su `withTiming` de montaje anima hacia el valor que ya tiene y es
  // visualmente inerte. `pop` siempre arranca en 0, así que su corrida de
  // montaje SÍ se ve.)
  //
  // Comparar contra el valor anterior (`wasActiveRef`) también deja el
  // efecto inmune a re-runs que no son cambios de tab: si cambiara
  // `reduceMotion` estando la tab ya activa, `wasActive === active` y no
  // rebota.
  const pop = useSharedValue(0)
  const wasActiveRef = useRef(active)
  useEffect(() => {
    const wasActive = wasActiveRef.current
    wasActiveRef.current = active
    if (!active || wasActive || reduceMotion) return
    pop.value = withSequence(withSpring(1, motionSprings.press), withSpring(0, motionSprings.press))
  }, [active, reduceMotion, pop])
  useEffect(() => () => cancelAnimation(pop), [pop])

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.14 }],
  }))

  // `onLayout` va en la raíz REAL del ítem — nunca en el `Animated.View` de
  // `navIdle`, que es el nodo que escala con el pop. RN reporta `x`/`y`
  // relativos al padre INMEDIATO nada más (no se acumulan atravesando
  // wrappers), y `SlotRect.x` está documentado + testeado
  // (nav-indicator-geometry.test.ts) como relativo a `navGroup`. Con
  // `onPress` la raíz es `AnimatedPressable` — el `View` de abajo queda
  // anidado un nivel adentro, y como el Pressable no tiene ancho/padding
  // propio abraza a ese `View` exacto, así que su `x` (relativo al
  // Pressable) da SIEMPRE 0, sin importar dónde caiga el Pressable dentro
  // del grupo. En los `space-between` de dos ítems eso es coincidentemente
  // correcto para el primero de cada grupo (inicio/fijos, que arrancan al
  // ras) pero rompe el segundo (gastos/control, empujados al borde
  // opuesto): el surco aterrizaría en el lugar del primer ítem. Por eso el
  // layout se mide en `AnimatedPressable` (la raíz real) cuando hay
  // `onPress`, y en este `View` (que ahí sí es la raíz) cuando no lo hay.
  const inner = (
    <View onLayout={onPress ? undefined : handleLayout}>
      <Animated.View style={[styles.navIdle, popStyle]}>
        <NeoTabIcon name={item.icon} color={s.navIdleInk} size={20} strokeWidth={2.2} />
        <Text style={[styles.navIdleLabel, { color: s.navIdleInk }]}>{label}</Text>
        {/* Capa activa: duplica ícono+label del `navIdle` de arriba, así que en
            la rama SIN `onPress` (preview estático) la anunciaría dos veces —
            en la rama interactiva el `Pressable` colapsa a un solo elemento
            accesible, pero acá no hay Pressable. Ocultarla explícitamente de
            a11y en los dos casos: es decoración de cross-fade, no contenido. */}
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.navInkOverlay, activeInkStyle]}
        >
          <NeoTabIcon name={item.icon} color={s.navActiveInk} size={20} strokeWidth={2.3} />
          <Text style={[styles.navActiveLabel, { color: s.navActiveInk }]}>{label}</Text>
        </Animated.View>
        {dot ? <View style={[styles.navItemDot, { backgroundColor: s.navItemDot }]} /> : null}
      </Animated.View>
    </View>
  )

  if (!onPress) {
    // Preview estático sin handler: sin press-scale (nada que presionar).
    // Acá el `View` de arriba YA es la raíz del ítem.
    return inner
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      onLayout={handleLayout}
      style={pressScale.animatedStyle}
    >
      {inner}
    </AnimatedPressable>
  )
}

/** FAB presentational del mockup (preview + visual canónico): pastilla 62 con
 *  gradiente, surco `fabWell` y "+", swap-a-inset en press, badge opcional. */
function DefaultNeoFab({
  s,
  mode,
  fabBadge,
  label,
  onPress,
}: {
  s: HomeSpec
  mode: HomeMode
  fabBadge: number | null
  label: string
  onPress?: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        cssGradient(s.fabGradientCss, FAB_FALLBACK[mode]),
        { boxShadow: pressed ? s.fabPressedShadow : s.fabShadow },
      ]}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.fabWell, { boxShadow: pressed ? s.fabPressedWellShadow : s.fabWellShadow }]}>
            <NeoTabIcon name="plus" color={s.fabInk} size={24} strokeWidth={3} />
          </View>
          {fabBadge ? (
            <View style={[styles.fabBadge, { backgroundColor: s.badgeBackground, borderColor: s.fabBadgeBorder }]}>
              <Text style={[styles.fabBadgeText, { color: s.badgeInk }]}>{fabBadge}</Text>
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  )
}

export function NeoTabBarLive({
  mode,
  activeTab = 'inicio',
  itemDots,
  fabBadge = null,
  onPressTab,
  onPressFab,
  renderFab,
  bottomInset,
}: NeoTabBarLiveProps) {
  const { t } = useTranslation()
  const s = HOME_SPEC[mode]
  const { width: windowWidth } = useWindowDimensions()

  // ── Geometría del surco ──────────────────────────────────────────────
  // Los dos `navGroup` reportan su offset x relativo a `nav`; cada ítem
  // reporta su slot (x relativo a SU grupo, width) relativo a sí. Juntos
  // resuelven `targetX` (Task 1, módulo puro, testeado ahí — no se
  // reimplementa la aritmética acá).
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
  // Solo con AMBOS medidos hay marco de coordenadas completo. En su propio
  // `useMemo` para no fabricar un objeto (referencia nueva) en cada render:
  // sin esto el `useMemo` de `targetX` de abajo, que depende de `groups`,
  // nunca memoiza de verdad (recalcula siempre, aunque los offsets no
  // cambiaron) — eslint lo marca como `exhaustive-deps`.
  const groups = useMemo<GroupOffsets | null>(
    () =>
      groupOffsets.left != null && groupOffsets.right != null
        ? { left: groupOffsets.left, right: groupOffsets.right }
        : null,
    [groupOffsets.left, groupOffsets.right],
  )

  const [slots, setSlots] = useState<SlotRects>({})
  const onMeasureSlot = useCallback((key: NeoTabKey, rect: SlotRect) => {
    setSlots((prev) => {
      const cur = prev[key]
      if (cur && cur.x === rect.x && cur.width === rect.width) return prev
      return { ...prev, [key]: rect }
    })
  }, [])

  // Leído UNA vez acá y bajado por prop a los cuatro ítems (+ el spring de
  // abajo): una sola fuente de verdad, mismo patrón que `usePressScale`.
  const reduceMotion = useReducedMotion()
  const wellWidth = useMemo(() => resolveWellWidth(slots), [slots])
  const targetX = useMemo(
    () => (groups ? resolveIndicatorX(slots, groups, activeTab, wellWidth) : null),
    [slots, groups, activeTab, wellWidth],
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
  // Rising-edge de CAMBIO DE TAB — mismo patrón que `wasActiveRef` en
  // `NeoNavItem` más abajo. `targetX` no se mueve solo cuando cambia la tab:
  // un cambio de idioma, de Dynamic Type, o directamente un segundo batch de
  // `onLayout` en el primer mount (los cuatro ítems no siempre miden en el
  // mismo frame) también lo recalculan. Esos casos deben SALTAR, no animar —
  // comparar contra `targetX` no lo distingue (una tab distinta puede
  // compartir `targetX` con la anterior si los labels miden igual, y la
  // MISMA tab puede recalcular `targetX` sin haber cambiado). Comparar
  // contra `activeTab` sí aísla la causa real.
  const prevActiveRef = useRef(activeTab)
  useEffect(() => {
    if (targetX == null) return
    // Actualizado SIEMPRE, antes de cualquier return de acá abajo: si se
    // actualizara solo en la rama del spring, una transición de geometría
    // (que cae en la rama de "salto") se comería el cambio de tab que la
    // originó, y la vuelta a esa tab ya no animaría (creería que sigue ahí).
    const isTabChange = prevActiveRef.current !== activeTab
    prevActiveRef.current = activeTab
    if (!hasPosition.value || reduceMotion || !isTabChange) {
      // Primer posicionamiento, reduced motion, o geometría que se movió
      // SIN cambio de tab: sin viaje.
      indicatorX.value = targetX
      hasPosition.value = true
      return
    }
    indicatorX.value = withSpring(targetX, motionSprings.tabShift)
  }, [targetX, reduceMotion, indicatorX, hasPosition, activeTab])
  useEffect(() => () => cancelAnimation(indicatorX), [indicatorX])

  const wellStyle = useAnimatedStyle(() => ({
    opacity: hasPosition.value ? 1 : 0,
    transform: [{ translateX: indicatorX.value }],
  }))

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => (
    <NeoNavItem
      key={item.key}
      s={s}
      item={item}
      label={t(item.labelKey)}
      active={item.key === activeTab}
      dot={Boolean(itemDots?.[item.key]) && item.key !== activeTab}
      onPress={onPressTab ? () => onPressTab(item.key) : undefined}
      onMeasure={onMeasureSlot}
      reduceMotion={reduceMotion}
    />
  )

  return (
    <View
      style={[
        styles.nav,
        cssGradient(s.navGradientCss, s.bg),
        { boxShadow: s.navShadow },
        // ── Anclaje LIVE (F5): FLOTA sobre el contenido (position absolute) ──
        // Cuando el adapter provee `bottomInset` (renderNeoTabBar), la barra se
        // monta como `tabBar` custom del <Tabs>. En ese modo DEBE flotar como el
        // bar viejo (buildFloatingTabBarStyle: position absolute): así NO reserva
        // espacio de flow y las tab-screens se dibujan a altura completa por
        // debajo. El paddingBottom que YA traen las 4 tab-screens (Screen ⇒ 144;
        // Gastos SectionList ⇒ insets.bottom+96) — calibrado para el bar viejo
        // (footprint fijo 102 = bottom14+alto88) — despeja la barra neo, cuyo
        // footprint (max(inset,22)+~79 ≈ 101–113) es ≤/≈ el del viejo en todo
        // device. Sin esto (bar in-flow) reservaría ~135px + los 144 del scroll =
        // gap catastrófico. El ancho flotante se calcula acá (no con
        // left/right:0): `min(ventana − 36, NAV_MAX_OUTER_WIDTH)` centrado a
        // mano — en teléfonos ≤393dp es idéntico al viejo `left/right:0 +
        // marginHorizontal:18`, y en ventanas anchas la barra conserva la
        // composición del mockup y el sobrante va a los márgenes.
        // El cap corre SOLO EN ANDROID (decisión owner 2026-08-21): en un
        // iPhone Plus/Pro Max (414-430dp) también mordería, pero la 2.0.0
        // ya está viva en el App Store con la barra estirada QA-da — iOS
        // conserva el render shippeado hasta que el cap se apruebe mirando
        // un device grande. `marginHorizontal:0` neutraliza el 18 del estilo
        // base (con `left` explícito sumaría un corrimiento). `marginBottom`
        // (compone el inset con el float 22) fija la separación del borde
        // inferior. El `marginTop:22` queda inerte (no hay flow arriba). El
        // homeIndicator dibujado NO se pinta (se usa el inset real). En
        // preview (`bottomInset` undefined) NO aplica → sigue in-flow dentro
        // del PreviewPhoneSection.
        bottomInset != null
          ? (() => {
              const maxOuter =
                Platform.OS === 'android' ? NAV_MAX_OUTER_WIDTH : Number.POSITIVE_INFINITY
              const floatWidth = Math.min(windowWidth - 36, maxOuter)
              return {
                position: 'absolute' as const,
                bottom: 0,
                marginHorizontal: 0,
                width: floatWidth,
                left: (windowWidth - floatWidth) / 2,
                marginBottom: Math.max(bottomInset, 22),
              }
            })()
          : null,
      ]}
    >
      {/* TRES ZONAS — el ancla del FAB.
          Antes esto eran 5 hijos con `justifyContent: 'space-between'`, y como
          el ítem ACTIVO se dibuja más ancho que el inactivo (paddingHorizontal
          13 vs 6, label 900 vs 800), la posición del FAB salía de
          `(ancho − 66)/2 + (grupoIzq − grupoDer)/2`: al pasar la tab activa del
          par izquierdo al derecho el término cambiaba de signo y el FAB se
          corría ~14px. Con dos grupos de `flex: 1` idéntico, el centro del FAB
          ES el centro de la barra por construcción — inmune al largo de los
          labels (ES vs EN), al padding del activo y al fontScale. */}
      {/* EL SURCO. Es el mismo material de la barra, hundido — en light
          `navActiveBackground` es undefined a propósito. Se TRASLADA, nunca
          escala: los offsets de la sombra inset son fijos (4/4 y −4/−4), así
          que mover el nodo mantiene la dirección de la luz y el relieve se lee
          real; escalarlo estiraría la profundidad percibida y delataría el
          material. El `boxShadow` NO se anima (es un string: no se interpola en
          worklet y costaría un commit de Fabric por frame) — viaja con el nodo
          sin recalcularse. Primer hijo de `nav` para pintar detrás de ítems y
          FAB (cruza por DEBAJO del disco, que tiene su propia sombra externa). */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.well,
          { width: wellWidth, backgroundColor: s.navActiveBackground, boxShadow: s.navActiveShadow },
          wellStyle,
        ]}
      />
      <View style={styles.navGroup} onLayout={onLayoutLeftGroup}>
        {NAV_ITEMS_LEFT.map(renderItem)}
      </View>
      <View style={styles.fabSlot}>
        {renderFab ? (
          renderFab()
        ) : (
          <DefaultNeoFab s={s} mode={mode} fabBadge={fabBadge} label={t('states:tabs.add')} onPress={onPressFab} />
        )}
      </View>
      <View style={styles.navGroup} onLayout={onLayoutRightGroup}>
        {NAV_ITEMS_RIGHT.map(renderItem)}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // nav (estilos literales del mockup home-final, home-screen.tsx:1902-1944).
  nav: {
    marginTop: 22,
    marginHorizontal: 18,
    marginBottom: 22,
    borderRadius: 32,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
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
  // El surco (indicador activo) — mismo material de la barra, hundido. Ancho
  // dinámico (`resolveWellWidth`, seteado inline junto al style), posición
  // animada vía `wellStyle` (translateX puro). `top: 12` / `bottom: 13` calzan
  // con el paddingTop/paddingBottom de `nav`: el surco (absolute dentro de
  // `nav`) termina cubriendo exactamente la altura de contenido de un ítem —
  // paddingVertical 8 (×2) + ícono 20 + gap 4 + label 10.5 ⇒ ~54 — el
  // footprint vertical de la vieja píldora `navActive`.
  well: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 13,
    borderRadius: 18,
  },
  navIdle: { alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6 },
  // Capa activa del cross-fade (Task 4): se superpone exacto sobre `navIdle`
  // vía `absoluteFill` + el mismo `alignItems`/`gap` — ambas capas centran su
  // contenido en la misma caja, y el padding de `navIdle` es simétrico, así
  // que no hace falta compensar ningún offset. Nombrado `navInkOverlay` (no
  // `navActiveInk`) a propósito: ese nombre quedaba a un carácter de
  // `s.navActiveInk`, el token de color de HOME_SPEC usado en las líneas de
  // al lado — mismo prefijo, cosas distintas, fácil de confundir al leer.
  navInkOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navIdleLabel: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
  // Label de la capa ACTIVA únicamente (catálogo aprobado: 900 vs 800 del
  // idle — design/home-final-2026-07/home.dc.html:81, kit home-screen.tsx
  // `navActiveLabel`). Peso propio: el ítem no cambia de ancho al activarse
  // (esta capa es `absoluteFill` sobre `navInkOverlay`), así que el 900 no
  // puede mover al FAB — el ancla de la Task 2 sigue intacta.
  navActiveLabel: { fontSize: 10.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  navItemDot: { position: 'absolute', top: 3, right: 6, width: 8, height: 8, borderRadius: 4 },
  fab: {
    position: 'relative',
    top: -26,
    marginBottom: -26,
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
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
  fabWell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  fabBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBadgeText: { fontSize: 11, fontWeight: '900', fontFamily: nunitoFamily('900') },
})
