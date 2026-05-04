import type { PropsWithChildren } from 'react'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { CopilotProvider } from 'react-native-copilot'
import { TourTooltip } from '@/features/tours'
import { queryClient, queryPersister, queryPersistOptions } from '@/lib/query-client'
import { motionDurations } from '@/lib/motion/tokens'
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
              {/* CopilotProvider hosts the guided-tour overlay used by
                  the per-screen `useScreenTour` hook. Tooltip is the
                  Manifiesto-themed component; labels are in Spanish to
                  match the rest of the app. The animation duration
                  uses our motion token so the highlight rectangle
                  travels at the same pace as the rest of the UI. */}
              <CopilotProvider
                animationDuration={motionDurations.quick}
                arrowColor="transparent"
                // `view` overlay (vs default `svg`) keeps the
                // mask/highlight on the native UI thread instead of
                // routing through react-native-svg. Significantly
                // smoother on low-end Android, where the SVG path
                // re-render per frame was the source of the "tilda
                // y se siente lento" jank.
                overlay="view"
                // Darker forest-tinted scrim. The default ~40%
                // black was too transparent — the user couldn't
                // separate the highlighted target from the rest
                // of the screen. 78% on our deepest surface tone
                // gives strong isolation while keeping the app
                // legible enough to recognise *what* is being
                // highlighted (`continuity` rule).
                backdropColor="rgba(6, 18, 12, 0.78)"
                labels={{
                  finish: 'Finalizar',
                  next: 'Siguiente',
                  previous: 'Anterior',
                  skip: 'Saltar',
                }}
                margin={12}
                stopOnOutsideClick
                tooltipComponent={TourTooltip}
                verticalOffset={0}
              >
                {children}
              </CopilotProvider>
            </BottomSheetModalProvider>
          </AppThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
