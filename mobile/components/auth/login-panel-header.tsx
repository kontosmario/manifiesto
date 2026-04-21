import { StyleSheet, Text, View } from 'react-native'
import { authPalette } from '@/theme/auth-theme'

export function LoginPanelHeader({
  dense,
  subtitle,
  title,
}: {
  dense: boolean
  subtitle: string
  title: string
}) {
  return (
    <View style={[styles.panelHeader, dense && styles.panelHeaderDense]}>
      <Text style={[styles.panelTitle, dense && styles.panelTitleDense]}>{title}</Text>
      <Text style={[styles.panelSubtitle, dense && styles.panelSubtitleDense]}>{subtitle}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  panelHeader: {
    gap: 3,
  },
  panelHeaderDense: {
    gap: 1,
  },
  panelTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: authPalette.panel.title,
  },
  panelTitleDense: {
    fontSize: 20,
    lineHeight: 24,
  },
  panelSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: authPalette.panel.subtitle,
    marginBottom: 2,
  },
  panelSubtitleDense: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 0,
  },
})
