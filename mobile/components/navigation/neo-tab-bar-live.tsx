import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { NeoTabIcon } from '@/components/navigation/neo-tab-icons'
import { NAV_FAB_GUTTER_X, NAV_FAB_SLOT_WIDTH } from '@/components/navigation/nav-indicator-geometry'
import { HOME_SPEC, type HomeMode, type HomeSpec } from '@/components/redesign/home/home-spec'
import { usePressScale } from '@/hooks/use-press-scale'
import { cssGradient } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import type { NeoTabKey } from '@/components/navigation/neo-tab-bar-route-map'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

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
}: {
  s: HomeSpec
  item: (typeof NAV_ITEMS)[number]
  active: boolean
  dot: boolean
  label: string
  onPress?: () => void
}) {
  // Press-scale equivalente a TabBarPressable (0.94 spring). El haptic NO va
  // acá: en live lo dispara `screenListeners.tabPress` del <Tabs>.
  const pressScale = usePressScale({ pressedScale: 0.94 })

  const inner = active ? (
    <View style={[styles.navActive, { backgroundColor: s.navActiveBackground, boxShadow: s.navActiveShadow }]}>
      <NeoTabIcon name={item.icon} color={s.navActiveInk} size={20} strokeWidth={2.3} />
      <Text style={[styles.navActiveLabel, { color: s.navActiveInk }]}>{label}</Text>
    </View>
  ) : (
    <View style={styles.navIdle}>
      <NeoTabIcon name={item.icon} color={s.navIdleInk} size={20} strokeWidth={2.2} />
      <Text style={[styles.navIdleLabel, { color: s.navIdleInk }]}>{label}</Text>
      {dot ? <View style={[styles.navItemDot, { backgroundColor: s.navItemDot }]} /> : null}
    </View>
  )

  if (!onPress) {
    // Preview estático sin handler: sin press-scale (nada que presionar).
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

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => (
    <NeoNavItem
      key={item.key}
      s={s}
      item={item}
      label={t(item.labelKey)}
      active={item.key === activeTab}
      dot={Boolean(itemDots?.[item.key]) && item.key !== activeTab}
      onPress={onPressTab ? () => onPressTab(item.key) : undefined}
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
        // gap catastrófico. left/right:0 dejan que `marginHorizontal:18` fije el
        // inset lateral; `marginBottom` (compone el inset con el float 22) fija la
        // separación del borde inferior. El `marginTop:22` queda inerte (no hay
        // flow arriba). El homeIndicator dibujado NO se pinta (se usa el inset
        // real). En preview (`bottomInset` undefined) NO aplica → sigue in-flow
        // dentro del PreviewPhoneSection.
        bottomInset != null
          ? { position: 'absolute', left: 0, right: 0, bottom: 0, marginBottom: Math.max(bottomInset, 22) }
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
  navActive: { alignItems: 'center', gap: 4, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 13 },
  navActiveLabel: { fontSize: 10.5, fontWeight: '900', fontFamily: nunitoFamily('900') },
  navIdle: { alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 6 },
  navIdleLabel: { fontSize: 10.5, fontWeight: '800', fontFamily: nunitoFamily('800') },
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
