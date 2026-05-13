import { useColorScheme, View } from 'react-native'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import {
  Badge,
  Icon,
  Label,
  NativeTabs,
} from 'expo-router/unstable-native-tabs'
import { FloatingAddFab } from '@/components/navigation/floating-add-fab'
import { useAdvisorBadge } from '@/features/insights/use-advisor-badge'

/**
 * Native iOS 26 tab bar con Liquid Glass · vía `expo-router/unstable-
 * native-tabs`. Delegamos el rendering del tab bar completamente al
 * UITabBarController nativo de UIKit:
 *
 *  - iOS 26+ · Liquid Glass auténtico (material genuino, no BlurView
 *    simulado · auto-tonalizado con el content debajo · morphic merge
 *    cuando otros glass shapes están cerca).
 *  - iOS 18 y anteriores · tab bar tradicional iOS (estilo familiar).
 *  - Android · Material 3 tabs.
 *
 * Trade-offs aceptados (vs el AppTabs custom anterior):
 *  ✓ Tab bar 100% nativa · 60fps OS-level · 0 cost JS thread
 *  ✓ Scroll-to-top + pop-to-root + predictive back built-in
 *  ✗ FAB "Agregar" se sacó de la tab bar (no se puede cells custom de
 *    tamaño diferente en UITabBarController) → ahora es `FloatingAddFab`
 *    overlay encima de la tab bar.
 *  ✗ La pill custom y el `TabBarPressable` se vuelven obsoletos en este
 *    layout · el OS dibuja su propia indicator (auténtico Liquid Glass
 *    de iOS 26).
 *  ⚠ `NativeTabs` está en `alpha` (SDK 54+) · API subject to change ·
 *    documentado en https://docs.expo.dev/router/advanced/native-tabs/
 *
 * Rollback path: importar `AppTabs` en lugar de `AppNativeTabs` en
 * `app/(app)/(tabs)/_layout.tsx`. El archivo `app-tabs.tsx` queda
 * intacto en código para fast revert.
 */
export function AppNativeTabs() {
  const colorScheme = useColorScheme()
  const advisorBadge = useAdvisorBadge()

  return (
    // ThemeProvider de React Navigation con DarkTheme/DefaultTheme:
    // workaround documentado para el "white flash" en dark mode con
    // NativeTabs iOS 26 (issue #39930 de expo/expo). El theme default
    // de React Navigation no matchea el system dark mode → bg flashes
    // durante tab transitions.
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        <NativeTabs>
          <NativeTabs.Trigger name="home">
            <Icon sf="house.fill" drawable="ic_menu_home" />
            <Label>Inicio</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="expenses">
            <Icon
              sf="list.bullet.rectangle.portrait.fill"
              drawable="ic_menu_recent_history"
            />
            <Label>Gastos</Label>
          </NativeTabs.Trigger>
          {/* "add" route oculta · el FAB flotante de abajo es la entrada
              visual a esta ruta. El archivo `(tabs)/add.tsx` sigue
              existiendo como Redirect a `/(app)/add-expense` para que
              deep links funcionen, pero NO aparece en la tab bar. */}
          <NativeTabs.Trigger name="add" hidden />
          <NativeTabs.Trigger name="fixed-expenses">
            <Icon
              sf="calendar.badge.clock"
              drawable="ic_menu_my_calendar"
            />
            <Label>Fijos</Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="insights">
            <Icon
              sf="chart.line.uptrend.xyaxis"
              drawable="ic_menu_recent_history"
            />
            <Label>Control</Label>
            {advisorBadge.show ? (
              // String empty en Android → "small dot" badge (no count) ·
              // en iOS muestra el count como texto si lo pasamos. Para
              // el advisor unread indicator queremos un dot sutil, no
              // un número (no es decision-grade · solo "hay algo").
              <Badge>{advisorBadge.altaCount > 0 ? String(advisorBadge.altaCount) : ''}</Badge>
            ) : null}
          </NativeTabs.Trigger>
        </NativeTabs>
        {/* FAB flotante sibling de la tab bar · zIndex 50 lo pone por
            encima del UITabBarController · pointerEvents="box-none" en
            su wrapper permite que los taps fuera del FAB pasen al tab
            bar. */}
        <FloatingAddFab />
      </View>
    </ThemeProvider>
  )
}
