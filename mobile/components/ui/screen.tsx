import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useSegments } from 'expo-router'
import { ModalGrabHandle } from '@/components/ui/modal-grab-handle'
import { SCROLL_EDGE_THRESHOLD, ScreenEdgeEffect } from '@/components/ui/screen-edge-effect'
import { ScreenHeader } from '@/components/ui/screen-header'
import { useScreenEntrance } from '@/components/ui/use-screen-entrance'
import { useTabScreenEntrance } from '@/components/ui/use-tab-screen-entrance'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { triggerHaptic } from '@/lib/haptics'
import { useIsAnyModalOpen } from '@/lib/modal-visibility'
import { useNumpadOffset } from '@/lib/numpad-visibility'
import { useAppTheme } from '@/theme/theme-provider'

interface ScreenProps extends ScrollViewProps {
  title?: string
  titleColor?: string
  subtitle?: string
  rightSlot?: ReactNode
  canGoBack?: boolean
  keyboardAware?: boolean
  scrollable?: boolean
  bodyStyle?: StyleProp<ViewStyle>
  /**
   * Override the SafeAreaView background. Use for screens whose canvas
   * is intentionally brand-fixed (e.g. auth flow on cream regardless of
   * theme). Defaults to `theme.colors.background`.
   */
  backgroundColor?: string
  /**
   * Render the small horizontal grab handle at the very top of the
   * screen — visually telegraphs the swipe-down dismiss gesture for
   * full-page modals. Use on screens registered with
   * `presentation: 'modal'` (add-expense, add-fixed-expense, etc).
   */
  showGrabHandle?: boolean
  /**
   * Forwarded ref to the underlying ScrollView. Use it from the
   * parent screen to call imperative APIs like `scrollToEnd` —
   * needed e.g. on login to bring the password CTA into view when
   * the keyboard opens.
   */
  scrollRef?: React.RefObject<ScrollView | null>
  /**
   * Rendered inside the safe-area, BEHIND the scrollable content.
   * Use for absolute-positioned ambient decorations (blobs,
   * gradients) that must cover the full viewport and stay fixed
   * while the content scrolls. Putting them inside `children` would
   * either scroll with content (scrollable Screen) or get clipped
   * to the inner stack View's bounds.
   */
  backgroundSlot?: ReactNode
  /**
   * Opt-out del scroll edge effect (safe area superior transparente con
   * material difuminado). Ponelo en `true` en pantallas que dibujan su
   * PROPIO chrome hasta el borde y no quieren el material encima
   * (splash a pantalla completa, wrapped, visores de media).
   */
  disableEdgeEffect?: boolean
  /**
   * La pantalla maneja SUS PROPIOS insets. Para las que montan una lista
   * virtualizada (SectionList/FlatList) en vez del ScrollView del Screen:
   * si el Screen inyectara los insets en el contenedor, la lista quedaría
   * empujada hacia adentro y el contenido NO podría pasar por debajo del
   * safe area (se pierde el edge-to-edge). Con esto en `true` el Screen
   * no toca el padding vertical y la pantalla aplica los insets en el
   * `contentContainerStyle` de su lista + monta su propio
   * `ScreenEdgeEffect`.
   */
  ownInsets?: boolean
  /**
   * La pantalla se presenta como HOJA MODAL de iOS (las rutas registradas
   * con `presentation: 'modal'` en `mobile/components/root/app-stack-shell.tsx`).
   *
   * CONSTRAINT no evidente: `react-native-screens` mapea `'modal'` a
   * `UIModalPresentationAutomatic`, que en iPhone es un *page sheet* — la
   * tarjeta ARRANCA desplazada hacia abajo, nunca toca la isla dinámica y
   * su propia vista tiene `safeAreaInsets.top = 0`. Pero
   * `useSafeAreaInsets()` acá adentro NO devuelve el inset de la tarjeta
   * sino el del DISPOSITIVO (59pt en un iPhone con isla): el único
   * `SafeAreaProvider` de la app está en la raíz (`app-providers.tsx`) y
   * react-navigation NO monta uno por screen a propósito
   * (`SafeAreaProviderCompat`: "If we already have insets, don't wrap the
   * stack in another safe area provider"). Resultado sin este flag: 59pt de
   * hueco muerto entre el borde de la hoja y el título, más un
   * `ScreenEdgeEffect` difuminando una franja de sistema que sobre la hoja
   * no existe (el chrome del sistema está encima de la pantalla de ATRÁS).
   *
   * Es la MISMA convención que usa react-navigation internamente:
   * `NativeStackView.native.js` pisa a mano `topInset = 0` cuando
   * `Platform.OS === 'ios' && isModal`.
   *
   * Se gatea por plataforma: en Android esas mismas rutas se registran como
   * `presentation: 'card'`, sí ocupan el tope de la ventana y el inset SÍ
   * corresponde — ahí el flag se ignora. `insets.bottom` no se toca en
   * ninguna plataforma: la hoja sí llega al home indicator.
   *
   * Ponelo SOLO en pantallas cuya ruta esté registrada como `'modal'`. Si
   * mañana una de esas rutas pasa a `fullScreenModal` (o a `card` en iOS),
   * hay que sacar el flag o el contenido queda debajo de la isla.
   */
  presentedAsSheet?: boolean
  /**
   * Estado CONTROLADO del scroll edge effect. Para las pantallas con
   * `ownInsets` (lista propia): el Screen no ve ese scroll, así que el
   * booleano lo calcula la pantalla y lo pasa acá. Montar el overlay en
   * el Screen —y no en la pantalla— hace que cubra TODAS sus ramas de
   * render (feed, vacío, ciclo cerrado), que es donde se escapaba.
   */
  edgeActive?: boolean
}

/**
 * Padding vertical que pidió el caller en un borde. Hay que mirar TAMBIÉN los
 * atajos (`padding` / `paddingVertical`), no solo la longhand: el estilo de
 * insets que el `Screen` inyecta al final lleva `paddingTop`/`paddingBottom`,
 * que en el flatten de RN PISAN al atajo. Leyendo solo la longhand, un caller
 * que escribe `padding: 16` perdía sus 16pt sin que nada lo avise (pasaba en
 * `dev-health-screen`).
 *
 * Precedencia longhand > paddingVertical > padding = la misma que aplica RN.
 * `null` = el caller no pidió nada en ese borde (distinto de "pidió 0").
 */
function resolveCallerPad(longhand: unknown, vertical: unknown, all: unknown): number | null {
  if (typeof longhand === 'number') return longhand
  if (typeof vertical === 'number') return vertical
  if (typeof all === 'number') return all
  return null
}

export function Screen({
  title,
  titleColor,
  subtitle,
  rightSlot,
  canGoBack = false,
  keyboardAware = true,
  scrollable = true,
  bodyStyle,
  backgroundColor,
  showGrabHandle = false,
  scrollRef,
  backgroundSlot,
  disableEdgeEffect = false,
  ownInsets = false,
  presentedAsSheet = false,
  edgeActive: edgeActiveProp,
  children,
  contentContainerStyle,
  ...scrollViewProps
}: ScreenProps) {
  const router = useRouter()
  const segments = useSegments()
  const { theme } = useAppTheme()
  const isReducedMotionEnabled = useReducedMotion()
  // `isTabScreen` tiene que ser ESTABLE por pantalla: un screen de tab SIEMPRE
  // es de tab. Pero `useSegments()` es GLOBAL (la ruta ACTUAL), así que cuando
  // navegás a una sub-pantalla de Settings, los tab screens MONTADOS (lazy:false)
  // ven segments=Settings → isTabScreen=false → usan el bottomPadding chico (20).
  // Al volver y actualizarse a (tabs) → isTabScreen=true → bottomPadding salta a
  // 96 → el frame del contenido se encoge ~96px y TODO se reacomoda = el
  // "warp/parpadeo" al volver de Settings (medido: frame 860→764). En el flujo
  // normal segments siempre es (tabs) → no se nota.
  // Fix: latch. Una vez que esta instancia se vio dentro de (tabs), lo es para
  // siempre — ignora los segments transitorios de otra ruta mientras sigue
  // montada. Los screens NO-tab (settings, modales) montan con SU ruta (nunca
  // (tabs)), así que nunca quedan latcheados en true.
  const segmentsAreTabs = (segments as readonly string[]).includes('(tabs)')
  const isTabScreenRef = useRef(segmentsAreTabs)
  if (segmentsAreTabs) isTabScreenRef.current = true
  const isTabScreen = isTabScreenRef.current
  const baseBottomPadding = theme.spacing.xxl + (isTabScreen ? 96 : 20)
  // Reserve extra bottom space when the shared InAppNumpad is open so
  // fields near the bottom of the scroll view stay reachable above
  // the numpad sheet.
  const numpadOffset = useNumpadOffset()
  // ── EDGE-TO-EDGE ────────────────────────────────────────────────
  // El SafeAreaView ya NO consume los insets vertical (ver `edges`
  // abajo): el contenido se dibuja de borde a borde y pasa POR DEBAJO
  // de la isla dinámica y del home indicator. Para que el contenido
  // ARRANQUE igual donde arrancaba, los insets se reinyectan como
  // padding del contentContainer — la diferencia es que ahora es
  // padding scrolleable (el contenido lo atraviesa) en vez de un borde
  // opaco que lo recorta.
  const insets = useSafeAreaInsets()
  // Inset SUPERIOR efectivo. En una hoja modal de iOS el inset del
  // dispositivo NO corresponde (ver el docblock de `presentedAsSheet`): la
  // tarjeta arranca debajo de la isla y lo que tiene arriba es su propio
  // borde redondeado, no la franja del sistema. Anular acá cubre los dos
  // consumidores de una: el padding del contenido y la altura del material
  // difuminado (que con 0 ni se monta).
  const topInset = presentedAsSheet && Platform.OS === 'ios' ? 0 : insets.top
  const bottomPadding = baseBottomPadding + numpadOffset + insets.bottom
  // Los insets se SUMAN a lo que pida el caller en vez de pisarlo: el
  // objeto va al final del array de estilos, así que hay que leer sus
  // valores para no perderlos.
  const callerContent = useMemo(
    () => StyleSheet.flatten(contentContainerStyle) ?? {},
    [contentContainerStyle],
  )
  const callerTop =
    resolveCallerPad(
      callerContent.paddingTop,
      callerContent.paddingVertical,
      callerContent.padding,
    ) ?? 0
  // `null` = el caller NO pidió paddingBottom y vale el clearance por
  // defecto. Hay que distinguirlo de "pidió 0": `bottomPadding` YA trae
  // `insets.bottom` sumado, así que usarlo como fallback y volver a
  // sumarle el inset abajo contaba el home indicator DOS VECES (34pt de
  // aire muerto al final del scroll en todo iPhone moderno).
  const callerBottom = resolveCallerPad(
    callerContent.paddingBottom,
    callerContent.paddingVertical,
    callerContent.padding,
  )
  // ARRIBA el inset ABSORBE el padding del caller (`Math.max`), abajo se
  // SUMAN. No es una asimetría caprichosa:
  //
  // - El `paddingTop` que traen las pantallas existía para despegarse del
  //   borde del `SafeAreaView` que las recortaba. Ahora esa función la
  //   cumple el inset, así que sumarlos deja el contenido flotando: es el
  //   "gap gigante" que el owner reportó en device (2026-08-04) y que
  //   volvió a marcar con una captura ("aún sigue muy alto") hasta que se
  //   pasó a absorber. La geometría VALIDADA en un iPhone real es esta;
  //   HEAD todavía tiene la versión previa al edge-to-edge y NO es la
  //   referencia.
  // - Abajo sí se suman: el home indicator no reemplaza al clearance de la
  //   tab bar, son dos cosas apiladas.
  //
  // En una hoja modal `topInset` es 0, y ahí `Math.max(callerTop, 0)`
  // devuelve el padding del handoff tal cual — los dos arreglos conviven
  // sin pisarse.
  const insetContentStyle = useMemo(
    () =>
      ownInsets
        ? null
        : {
            paddingTop: Math.max(callerTop, topInset),
            paddingBottom:
              callerBottom === null ? bottomPadding : callerBottom + insets.bottom,
          },
    [ownInsets, callerTop, callerBottom, bottomPadding, topInset, insets.bottom],
  )

  // El material del borde superior aparece SOLO con contenido debajo.
  // Se trackea con un booleano (no con el offset por frame): el estado
  // cambia una vez al cruzar el umbral y el fade lo hace el propio
  // overlay con withTiming — cero re-renders por frame de scroll.
  const [edgeActiveInternal, setEdgeActive] = useState(false)
  const edgeActive = edgeActiveProp ?? edgeActiveInternal
  const callerOnScroll = scrollViewProps.onScroll
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y
      setEdgeActive((prev) => {
        const next = y > SCROLL_EDGE_THRESHOLD
        return prev === next ? prev : next
      })
      callerOnScroll?.(event)
    },
    [callerOnScroll],
  )
  const { contentAnimatedStyle, headerAnimatedStyle } = useScreenEntrance({
    reducedMotion: isReducedMotionEnabled,
    // Tab screens are pre-mounted + detached; this mount-only rise would
    // fire on their first native attach and jump the content up from
    // translateY 18. Tabs use the opacity-only `useTabScreenEntrance`
    // below instead, so skip the generic translate rise here.
    skip: isTabScreen,
  })
  // Calm, professional first-load entrance for tab screens: a single
  // opacity fade (no translate → no position jolt on the first attach
  // of a detached tab). Replaces the old translateX `useTabFocusFade`,
  // whose instant position snap was the remaining "first-load jolt".
  // First focus fades in; later switches are instant.
  const tabEntrance = useTabScreenEntrance(isTabScreen)
  const tabFocusStyle = isTabScreen ? tabEntrance.style : null

  // When a ModalCard is open on top, suspend the Screen's keyboard
  // avoidance so the content behind the sheet doesn't jump up when
  // the sheet's input opens the keyboard. The sheet handles its own
  // avoidance internally.
  const isAnyModalOpen = useIsAnyModalOpen()
  const shouldAvoidKeyboard = keyboardAware && !isAnyModalOpen
  // Double-avoidance guard. In scrollable + iOS mode the ScrollView's
  // `automaticallyAdjustKeyboardInsets` already pushes content up by
  // the keyboard height natively — if we ALSO wrap in
  // KeyboardAvoidingView with behavior="padding", the content jumps
  // up by 2× keyboard height. Only enable the KAV padding when we
  // can't rely on the ScrollView's native adjustment: non-scrollable
  // screens (no ScrollView), or Android (where the OS handles it via
  // windowSoftInputMode=adjustResize).
  const kavBehavior =
    shouldAvoidKeyboard && Platform.OS === 'ios' && !scrollable
      ? 'padding'
      : undefined

  // Only render the ScreenHeader when there's something to show. An
  // empty header still costs ~32pt (10 paddingTop + 22 gap to the body),
  // which pushes custom tops (back+title rows, hero cards) way below
  // the safe area. Skipping it keeps the first visible element tight
  // at the top — aligning with the Ajustes screen's look.
  const hasHeaderContent = Boolean(title || subtitle || canGoBack || rightSlot)
  const header = hasHeaderContent ? (
    <Animated.View style={headerAnimatedStyle}>
      <ScreenHeader
        canGoBack={canGoBack}
        rightSlot={rightSlot}
        subtitle={subtitle}
        title={title}
        titleColor={titleColor}
        onBackPress={() => {
          void triggerHaptic('selection')
          router.back()
        }}
      />
    </Animated.View>
  ) : null

  return (
    // EDGE-TO-EDGE: un View pelado, NO un SafeAreaView. El SafeAreaView
    // aplicaba `paddingTop = insets.top` aun pasándole `edges` sin
    // 'top' (medido: 59px en un iPhone con isla), y como el inset ya se
    // reinyecta en el contentContainer el padding quedaba DUPLICADO —
    // el contenido arrancaba al doble de altura. Acá el borde físico es
    // el límite y el inset vive en un solo lugar. La app es
    // portrait-only (app.config.ts), así que no hay insets laterales
    // que consumir.
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: backgroundColor ?? theme.colors.background,
        },
      ]}
    >
      <KeyboardAvoidingView
        behavior={kavBehavior}
        keyboardVerticalOffset={isTabScreen ? 8 : 0}
        style={styles.safeArea}
      >
        <Animated.View style={[styles.safeArea, tabFocusStyle]}>
        {backgroundSlot}
        {scrollable ? (
          <ScrollView
            ref={scrollRef}
            automaticallyAdjustKeyboardInsets={shouldAvoidKeyboard}
            // 'never', NO 'automatic': con el ScrollView llegando al borde
            // físico (edge-to-edge), iOS le sumaba POR SU CUENTA el inset
            // del safe area además del que inyectamos en el
            // contentContainer — el contenido arrancaba al doble de
            // altura (medido en un iPhone 16 Pro: 62 + 62 + 10 = 134pt).
            // Antes no se notaba porque el SafeAreaView ya recortaba el
            // scroll y el ajuste automático no tenía nada que agregar. Es
            // iOS-only, por eso en web el layout se veía correcto.
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={[
              styles.content,
              {
                paddingBottom: bottomPadding,
              },
              contentContainerStyle,
              insetContentStyle,
            ]}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            // 16ms = un evento por frame: el umbral del edge effect
            // necesita muestreo continuo (el default de iOS dispara una
            // sola vez por gesto). El caller puede subirlo, no bajarlo.
            scrollEventThrottle={16}
            {...scrollViewProps}
            onScroll={handleScroll}
          >
            {showGrabHandle ? <ModalGrabHandle /> : null}
            {header}
            <Animated.View style={[contentAnimatedStyle, bodyStyle]}>{children}</Animated.View>
          </ScrollView>
        ) : (
          <View
            style={[
              styles.nonScrollableContent,
              // Con `ownInsets` tampoco reservamos el clearance de la tab
              // bar: lo aplica la lista en su propio contentContainer.
              ownInsets ? null : { paddingBottom: bottomPadding },
              contentContainerStyle,
              insetContentStyle,
            ]}
          >
            {showGrabHandle ? <ModalGrabHandle /> : null}
            {header}
            <Animated.View style={[styles.nonScrollableBody, contentAnimatedStyle, bodyStyle]}>
              {children}
            </Animated.View>
          </View>
        )}
        </Animated.View>
      </KeyboardAvoidingView>
      {/* Último hijo = capa superior del Screen. Solo en la rama
          scrollable: sin scroll no hay contenido que pueda pasar por
          debajo del borde, así que no hay nada que difuminar. El
          `topInset > 0` se chequea acá y no adentro del overlay para no
          montar nada en las hojas modales (`presentedAsSheet`): sobre una
          hoja no hay franja de sistema que materializar y el material
          ensuciaría el `ModalGrabHandle`. */}
      {(scrollable || ownInsets) && !disableEdgeEffect && topInset > 0 ? (
        <ScreenEdgeEffect
          active={edgeActive}
          backgroundColor={backgroundColor ?? theme.colors.background}
          height={topInset}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 22,
  },
  nonScrollableContent: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 22,
  },
  nonScrollableBody: {
    flex: 1,
    minHeight: 0,
  },
})
