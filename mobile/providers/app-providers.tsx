import type { PropsWithChildren } from 'react'
import { useColorScheme } from 'react-native'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { MotionPreferenceProvider } from '@/features/preferences/motion-preference-provider'
import { ReducedMotionProvider } from '@/features/preferences/reduced-motion-provider'
import { LanguageProvider } from '@/features/preferences/language-provider'
import { FontScaleProvider } from '@/features/preferences/font-scale-provider'
import { TourProvider } from '@/features/tours'
import { queryClient, queryPersister, queryPersistOptions } from '@/lib/query-client'
import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider'

function StatusBarBridge() {
  const { theme } = useAppTheme()

  return <StatusBar animated style={theme.isDark ? 'light' : 'dark'} />
}

// Canvas colors hard-coded aquí porque GestureHandlerRootView vive
// FUERA del AppThemeProvider y no puede usar `useAppTheme()`.
// Estos hex deben mantenerse en sync con `palette.ts:canvas` para
// que el "very-root" layer no flashee blanco durante transiciones
// de tab (`shift`) o stack push antes de que el navigator
// theme-aware tome el control. Si la paleta cambia, actualizar aquí.
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
            {/* LanguageProvider: idioma del sistema por defecto + override
                manual (ES/EN/Sistema) persistido en persistent-kv, igual que
                el tema. Mantiene i18next sincronizado. Montado alto para que
                cualquier consumidor pueda usar `useTranslation`/`t`. */}
            <LanguageProvider>
            {/* FontScaleProvider: escala de texto propia de la app (4 niveles,
                persistida). El desacople del fontScale del OS lo hace el
                wrapper de `@/components/ui/app-text`, que lee este factor. */}
            <FontScaleProvider>
            {/* MotionPreferenceProvider exposes the user's animations
                preference ('auto' | 'always' | 'never') and persists
                it across launches. `useReducedMotion()` reads from it
                to decide whether `withRepeat`-driven decorative loops
                should run on this device. Placed outside TourProvider
                so the tour can also respect the same setting. */}
            <MotionPreferenceProvider>
            {/* ReducedMotionProvider owns the SINGLE app-wide
                reduced-motion decision + the SINGLE AccessibilityInfo
                'reduceMotionChanged' subscription, and exposes the
                resolved boolean via context. Mounted INSIDE
                MotionPreferenceProvider because it combines the user's
                motion preference with the OS toggle + hardware class.
                `useReducedMotion()` is a pure read of this context, so
                the ~80 call sites (and the pressables they fan out to)
                no longer each register their own native listener /
                async bridge round-trip. */}
            <ReducedMotionProvider>
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
            </ReducedMotionProvider>
            </MotionPreferenceProvider>
            </FontScaleProvider>
            </LanguageProvider>
          </AppThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
