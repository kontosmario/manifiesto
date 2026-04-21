import { Platform } from 'react-native'
import { Stack } from 'expo-router'
import { DailyBudgetNudgeBridge } from '@/components/bridges/daily-budget-nudge-bridge'

export function AppStackShell() {
  return (
    <>
      <DailyBudgetNudgeBridge />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
          animationMatchesGesture: true,
          freezeOnBlur: true,
          fullScreenGestureEnabled: false,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add-expense"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="add-fixed-expense"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="household-setup"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="expense-filters"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="expense-categories"
          options={{
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            animation: Platform.OS === 'ios' ? 'default' : 'fade_from_bottom',
            gestureDirection: 'vertical',
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            freezeOnBlur: true,
            fullScreenGestureEnabled: false,
          }}
        />
      </Stack>
    </>
  )
}
