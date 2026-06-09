import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated'

interface ProgressSegmentProps {
  index: number
  currentIndex: number
  progress: SharedValue<number>
  trackColor: string
  fillColor: string
}

export function ProgressSegment({
  index,
  currentIndex,
  progress,
  trackColor,
  fillColor,
}: ProgressSegmentProps) {
  const fillStyle = useAnimatedStyle(() => {
    // Past: 100%, current: progress, future: 0%
    let pct: number
    if (index < currentIndex) pct = 1
    else if (index === currentIndex) pct = progress.value
    else pct = 0
    return { width: `${pct * 100}%` }
  })

  return (
    <View style={[progressStyles.track, { backgroundColor: trackColor }]}>
      <Animated.View
        style={[progressStyles.fill, { backgroundColor: fillColor }, fillStyle]}
      />
    </View>
  )
}

const progressStyles = StyleSheet.create({
  track: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
})
