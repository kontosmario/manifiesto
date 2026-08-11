// @i18n-ignore-file — tooling dev-only gated por __DEV__.
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Screen } from '@/components/ui/screen'
import { NeoTabBarLive } from '@/components/navigation/neo-tab-bar-live'
import { AddExpenseTabButtonFace } from '@/components/navigation/add-expense-tab-button-face'
import { useAddExpenseButtonBurst } from '@/components/navigation/add-expense-tab-button.model'
import type { NeoTabKey } from '@/components/navigation/neo-tab-bar-route-map'
import type { HomeMode } from '@/components/redesign/home/home-spec'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { withAlpha } from '@/theme/color-utils'
import { useAppTheme, useThemeTokens } from '@/theme/theme-provider'
import {
  PreviewHomeIndicator,
  PreviewPhoneSection,
} from '@/screens/dev/redesign/redesign-preview-shared'
import { nunitoFamily } from '@/theme/typography'

/**
 * Preview dev-only de la NAV NUEVA extraída (`NeoTabBarLive`), el visual
 * canónico de la spec `home-final` (aprobada 2026-07-21). Renderiza el MISMO
 * componente que montará el adapter live (renderNeoTabBar), alimentado con
 * props mock (mode / activeTab / itemDots) en claro + oscuro, para comparar
 * contra design/home-final-2026-07/home.dc.html a 393px.
 *
 * El FAB central usa la CARA NEO REAL (`AddExpenseTabButtonFace variant="neo"`)
 * vía `renderFab` — la misma cara que monta el FAB live — para revisar el disco
 * con surco + gradiente invertido en dark + el press (swap-a-inset + burst-ring).
 * NO monta el overlay/sheets/hooks reales del `AddExpenseTabButton` (colisionan
 * en el preview: doble registro del paso 8 del HOME_TOUR + deps de sesión); el
 * `PreviewNeoFab` es un harness liviano con solo la cara + press + burst.
 *
 * Los tabs son interactivos (tap mueve la píldora activa + press-scale). El swap
 * live YA está puesto (`tabBar={renderNeoTabBar}` en app-tabs.tsx, F5 2026-07-22);
 * este preview queda como banco de comparación visual claro/oscuro vs el mockup.
 */
export function RedesignNavBarPreviewScreen() {
  const [activeLight, setActiveLight] = useState<NeoTabKey>('inicio')
  const [activeDark, setActiveDark] = useState<NeoTabKey>('control')

  return (
    <Screen
      title="Rediseño · Nav nueva (home-final)"
      subtitle="NeoTabBarLive extraído del HomeNavBar aprobado. Compará contra design/home-final-2026-07/home.dc.html a 393px. El FAB usa la cara neo REAL (variant neo): tocá el disco para ver el swap-a-inset del surco + el anillo burst. Control lleva el dot §2."
      canGoBack
    >
      <View style={styles.stack}>
        <PreviewLabel title="Tema claro — Salvia" note="cara neo real (surco + press inset + burst) · dot en Control" />
        <PreviewPhoneSection mode="light" minHeight={230}>
          <NeoTabBarLive
            mode="light"
            activeTab={activeLight}
            itemDots={{ control: true }}
            onPressTab={setActiveLight}
            renderFab={() => <PreviewNeoFab mode="light" />}
          />
          <PreviewHomeIndicator mode="light" />
        </PreviewPhoneSection>

        <PreviewLabel title="Tema oscuro — Noche de bosque" note="FAB invertido crema + surco · press inset + burst · dot en Control" />
        <PreviewPhoneSection mode="dark" minHeight={230}>
          <NeoTabBarLive
            mode="dark"
            activeTab={activeDark}
            itemDots={{ control: true }}
            onPressTab={setActiveDark}
            renderFab={() => <PreviewNeoFab mode="dark" />}
          />
          <PreviewHomeIndicator mode="dark" />
        </PreviewPhoneSection>
      </View>
    </Screen>
  )
}

/**
 * Harness liviano del FAB neo para el preview: la CARA REAL
 * (`AddExpenseTabButtonFace variant="neo"`) + el swap-a-inset en press + el
 * burst-ring del modelo real (`useAddExpenseButtonBurst`). Sin overlay/sheets/
 * hooks de sesión — solo el visual + la interacción de press, forzado al `mode`
 * de la sección (los PreviewPhoneSection no proveen contexto de tema).
 */
function PreviewNeoFab({ mode }: { mode: HomeMode }) {
  const { theme } = useAppTheme()
  const isReducedMotion = useReducedMotion()
  const { burstRingStyle, triggerBurst } = useAddExpenseButtonBurst(isReducedMotion)
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Agregar (preview)"
      onPress={triggerBurst}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={fabStyles.wrap}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          fabStyles.burstRing,
          { borderColor: withAlpha(theme.brand.bright, 0.9) },
          burstRingStyle,
        ]}
      />
      <AddExpenseTabButtonFace theme={theme} variant="neo" mode={mode} pressed={pressed} />
    </Pressable>
  )
}

function PreviewLabel({ title, note }: { title: string; note: string }) {
  const theme = useThemeTokens()
  return (
    <View style={styles.labelBlock}>
      <Text style={[styles.labelTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.labelSource, { color: theme.colors.textMuted }]}>
        Fuente: design/home-final-2026-07/home.dc.html · {note}
      </Text>
    </View>
  )
}

const fabStyles = StyleSheet.create({
  // Mismo lift que el wrap live (`addButtonWrap.top: -18`) para que el preview
  // muestre lo que renderiza el FAB neo live, no el -26 crudo del mockup.
  wrap: {
    top: -18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Anillo burst — geometría idéntica a la del AddExpenseTabButton live.
  burstRing: {
    position: 'absolute',
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
  },
})

const styles = StyleSheet.create({
  stack: {
    paddingBottom: 40,
  },
  labelBlock: {
    gap: 2,
    marginTop: 18,
    marginBottom: 10,
  },
  labelTitle: {
    fontSize: 15,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
  },
  labelSource: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
})
