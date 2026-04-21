import type { PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { queryClient } from '@/lib/query-client'
import { AppThemeProvider, useAppTheme } from '@/theme/theme-provider'

function StatusBarBridge() {
  const { theme } = useAppTheme()

  return <StatusBar animated style={theme.isDark ? 'light' : 'dark'} />
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppThemeProvider>
            <StatusBarBridge />
            {children}
          </AppThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
