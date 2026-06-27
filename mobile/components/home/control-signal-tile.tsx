import { MaterialIcons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { getSignalPalette, type SignalTone } from '@/components/home/control-visual-utils'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

export interface ControlSignalTileProps {
  helper: string
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
  tone?: SignalTone
  value: string
  variant?: 'glass' | 'surface'
  wide?: boolean
}

export function ControlSignalTile({
  helper,
  icon,
  label,
  tone = 'default',
  value,
  variant = 'surface',
  wide = false,
}: ControlSignalTileProps) {
  const { theme } = useAppTheme()
  const palette = getSignalPalette(theme, tone)

  return (
    <View
      style={[
        styles.signalTile,
        wide ? styles.signalTileWide : null,
        {
          backgroundColor:
            variant === 'glass' && !theme.isDark
              ? withAlpha(theme.colors.backgroundElevated, 0.74)
              : palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.signalGlow,
          {
            backgroundColor: palette.iconBackgroundColor,
          },
        ]}
      />

      <View style={styles.signalTop}>
        <View
          style={[
            styles.signalIconWrap,
            {
              backgroundColor: palette.iconBackgroundColor,
            },
          ]}
        >
          <MaterialIcons color={palette.accentColor} name={icon} size={16} />
        </View>
        <Text style={[styles.signalLabel, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>

      <Text
        style={[styles.signalValue, { color: theme.colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      <Text style={[styles.signalHelper, { color: theme.colors.textSoft }]} numberOfLines={2}>
        {helper}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  signalTile: {
    flexBasis: '48%',
    flexGrow: 1,
    gap: 8,
    overflow: 'hidden',
    borderRadius: radii.xl,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  signalTileWide: {
    flexBasis: '100%',
  },
  signalGlow: {
    position: 'absolute',
    top: -28,
    right: -26,
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    opacity: 0.9,
  },
  signalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signalIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  signalValue: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  signalHelper: {
    fontSize: 12,
    lineHeight: 16,
  },
})
