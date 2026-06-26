import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { SkeletonBlock } from '@/components/ui/skeleton-block'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'

interface LoadingBlockProps {
  label?: string
}

export function LoadingBlock({ label }: LoadingBlockProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const resolvedLabel = label ?? t('states:loading.generic')

  return (
    <View
      accessibilityLabel={resolvedLabel}
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.skeletonStack}>
        <SkeletonBlock height={12} width="34%" />
        <SkeletonBlock height={18} width="100%" />
        <SkeletonBlock height={18} width="84%" />
      </View>
      <Text
        style={[
          styles.label,
          theme.typography.body,
          {
            color: theme.colors.textMuted,
          },
        ]}
      >
        {resolvedLabel}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.lg, // was 20; nearest token lg=18 (intentional 2pt tightening)
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  skeletonStack: {
    gap: 10,
  },
  label: {},
})
