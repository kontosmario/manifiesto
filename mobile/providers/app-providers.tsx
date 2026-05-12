import type { PropsWithChildren } from 'react'
import { useColorScheme } from 'react-native'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotionPreferenceProvider } from '@/features/preferences/motion-preference-provider'
import { TourProvider } from '@/features/tours'
import { queryClient, queryPersister, queryPersistOptions } from '@/lib/query-client'
import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider'

function StatusBarBridge() {
  const { theme } = useAppTheme()

  return <StatusBar animated style={theme.isDark ? 'light' : 'dark'} />
}

// Canvas colors hard-coded acá porque GestureHandlerRootView vive
// FUERA del AppThemeProvider y no puede usar `useAppTheme()`.
// Estos hex deben mantenerse en sync con `palette.ts:canvas` para
// que el "very-root" layer no flashee blanco durante transiciones
// de tab (`shift`) o stack push antes de que el navigator
// theme-aware tome el control. Si la paleta cambia, actualizar acá.
const CANVAS_LIGHT = '#F4F2ED'
const CANVAS_DARK = '#12211A'

export function AppProviders({ children }: PropsWithChildren) {
  // `useColorScheme()` lee directo del sistema (no del user-override
  // del theme provider) — es la mejor aproximación disponible afuera
  // del provider. El user que ponga su tema en modo dark forzado en
  // un device claro puede ver un frame de flash al primer mount;
  // todos los demás casos coinciden. Es un trade-off aceptable
  // contra restructurar la chain de providers entera.
  const systemScheme = useColorScheme()
  const rootBg = systemScheme === 'dark' ? CANVAS_DARK : CANVAS_LIGHT

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: rootBg }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister, ...queryPersistOptions }}
        >
          <AppThemeProvider>
            {/* MotionPreferenceProvider exposes the user's animations
                preference ('auto' | 'always' | 'never') and persists
                it across launches. `useReducedMotion()` reads from it
                to decide whether `withRepeat`-driven decorative loops
                should run on this device. Placed outside TourProvider
                so the tour can also respect the same setting. */}
            <MotionPreferenceProvider>
              <BottomSheetModalProvider>
                <StatusBarBridge />
                {/* TourProvider hosts the guided-tour overlay used by
                    the per-screen `useScreenTour` hook. Custom in-house
                    implementation — drove the previous
                    `react-native-copilot` integration off the cliff
                    because of measureLayout deprecations on Fabric +
                    bridge-driven SVG re-renders. The custom path uses
                    Reanimated worklets + animated SVG mask + custom
                    motion tokens, so the tour's feel matches the rest
                    of the app's motion vocabulary. */}
                <TourProvider>{children}</TourProvider>
              </BottomSheetModalProvider>
            </MotionPreferenceProvider>
          </AppThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
