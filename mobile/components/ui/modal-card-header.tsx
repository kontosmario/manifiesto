import { Animated, StyleSheet, Text, View } from 'react-native'
import { PanGestureHandler, type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme } from '@/theme/theme-provider'

interface ModalCardHeaderProps {
  isClosing: boolean
  onGestureEvent: (event: PanGestureHandlerGestureEvent) => void
  onHandlerStateChange: (event: PanGestureHandlerStateChangeEvent) => void
  subtitle?: string
  title: string
}

export function ModalCardHeader({
  isClosing,
  onGestureEvent,
  onHandlerStateChange,
  subtitle,
  title,
}: ModalCardHeaderProps) {
  const { theme } = useAppTheme()

  return (
    <PanGestureHandler
      activeOffsetY={8}
      enabled={!isClosing}
      failOffsetX={[-16, 16]}
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
    >
      <Animated.View style={styles.dragHeader}>
        <View style={[styles.grabber, { backgroundColor: theme.colors.borderStrong }]} />
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text>
        ) : null}
      </Animated.View>
    </PanGestureHandler>
  )
}

const styles = StyleSheet.create({
  dragHeader: {
    gap: 8,
  },
  grabber: {
    alignSelf: 'center',
    borderRadius: radii.pill,
    height: 5,
    marginBottom: 4,
    width: 40,
  },
  title: {
    fontSize: 20, // no exact preset — titleMedium(18,800) and sectionTitle(22,800) bracket this; flagged
    fontWeight: '800',
  },
  subtitle: {
    ...typography.body, // fontSize:14, fontWeight:'400', lineHeight:20
  },
})
