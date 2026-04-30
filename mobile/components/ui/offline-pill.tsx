// Tiny offline status pill. Renders only when the network goes away.
// Animated entrance + exit so the transition reads as informative,
// not jumpy. Sits at the top of the screen content (callers place
// it where most appropriate — typically right under the header).

import { memo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useAppTheme } from '@/theme/theme-provider'

interface OfflinePillProps {
  /** Custom copy — defaults to a short Spanish string. */
  message?: string
}

export const OfflinePill = memo(function OfflinePill({
  message = 'Sin conexión · viendo datos guardados',
}: OfflinePillProps) {
  const online = useOnlineStatus()
  const { theme } = useAppTheme()
  if (online) return null
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(160)}
      style={[
        styles.pill,
        {
          backgroundColor: theme.isDark
            ? 'rgba(242,181,138,0.16)'
            : 'rgba(232,151,106,0.14)',
          borderColor: theme.isDark
            ? 'rgba(242,181,138,0.40)'
            : 'rgba(232,151,106,0.40)',
        },
      ]}
      accessibilityRole="text"
      accessibilityLabel={message}
    >
      <MaterialIcons
        name="cloud-off"
        size={13}
        color={theme.isDark ? '#F2B58A' : '#C25A3E'}
      />
      <Text
        style={[
          styles.text,
          { color: theme.isDark ? '#F2B58A' : '#C25A3E' },
        ]}
        numberOfLines={1}
      >
        {message}
      </Text>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
