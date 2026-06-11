import { MaterialIcons } from '@expo/vector-icons'
import { StyleSheet, Text } from 'react-native'
import Animated, { FadeInDown, FadeOut, ReduceMotion } from 'react-native-reanimated'
import { authPalette } from '@/theme/auth-theme'
import { radii } from '@/theme/palette'

export function FeedbackPill({
  intent,
  message,
}: {
  intent: 'error' | 'info'
  message: string
}) {
  return (
    // Entrada 180ms desde abajo / salida 120ms — los mensajes de
    // validación aparecen con motion en vez de popear, y la salida es
    // más rápida que la entrada (el sistema responde, no demora).
    <Animated.View
      entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(120).reduceMotion(ReduceMotion.System)}
      style={[styles.feedbackPill, intent === 'error' ? styles.feedbackError : styles.feedbackInfo]}
    >
      <MaterialIcons
        color={intent === 'error' ? authPalette.feedback.error.icon : authPalette.feedback.info.icon}
        name={intent === 'error' ? 'error-outline' : 'mark-email-read'}
        size={16}
      />
      <Text style={styles.feedbackText}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  feedbackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  feedbackError: {
    backgroundColor: authPalette.feedback.error.background,
    borderColor: authPalette.feedback.error.border,
  },
  feedbackInfo: {
    backgroundColor: authPalette.feedback.info.background,
    borderColor: authPalette.feedback.info.border,
  },
  feedbackText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: authPalette.feedback.text,
    fontWeight: '600',
  },
})
