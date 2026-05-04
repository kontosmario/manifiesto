import type { PropsWithChildren } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { TourProvider } from '@/features/tours'
import { queryClient, queryPersister, queryPersistOptions } from '@/lib/query-client'
import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider'

function StatusBarBridge() {
  const { theme } = useAppTheme()

  return <StatusBar animated style={theme.isDark ? 'light' : 'dark'} />
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister, ...queryPersistOptions }}
        >
          <AppThemeProvider>
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
          </AppThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
