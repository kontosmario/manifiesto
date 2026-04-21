import { MaterialIcons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
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
    <View style={[styles.feedbackPill, intent === 'error' ? styles.feedbackError : styles.feedbackInfo]}>
      <MaterialIcons
        color={intent === 'error' ? authPalette.feedback.error.icon : authPalette.feedback.info.icon}
        name={intent === 'error' ? 'error-outline' : 'mark-email-read'}
        size={16}
      />
      <Text style={styles.feedbackText}>{message}</Text>
    </View>
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
