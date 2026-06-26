// Reusable hour picker — a bottom sheet wrapping the infinite HourCarousel
// plus a "Listo" CTA. The single component used everywhere the user sets a
// time-of-day (advisor quiet hours, check-in times, …) so every hour picker
// in the app looks and behaves the same.
//
// Commit model: the carousel commits live as it settles (onChange mutates),
// and the user dismisses with "Listo" (or backdrop / swipe-down). Pass a
// distinct `instanceKey` per slot so the reel remounts and re-centres on the
// new value when a different slot opens.

import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalCard } from '@/components/ui/modal-card'
import { HourCarousel } from '@/components/ui/hour-carousel'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

interface Props {
  visible: boolean
  title: string
  /** Selected hour, 0–23. */
  value: number
  /** Identity of the open slot — remounts the reel when it changes. */
  instanceKey: string | number
  /** Commits the picked hour (live, as the reel settles). Does NOT close. */
  onChange: (hour: number) => void
  onClose: () => void
  subtitle?: string
  accessibilityLabel?: string
}

export function HourPickerSheet({
  visible,
  title,
  value,
  instanceKey,
  onChange,
  onClose,
  subtitle,
  accessibilityLabel,
}: Props) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()

  return (
    <ModalCard
      visible={visible}
      title={title}
      subtitle={subtitle ?? t('states:hourPicker.sheetSubtitle')}
      onClose={onClose}
    >
      <View style={styles.wrap}>
        <HourCarousel
          key={instanceKey}
          value={value}
          onChange={onChange}
          accessibilityLabel={accessibilityLabel}
        />
        <Pressable
          onPress={() => {
            void triggerHaptic('selection')
            onClose()
          }}
          style={({ pressed }) => [
            styles.doneButton,
            { backgroundColor: theme.colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.done')}
        >
          <Text
            style={[styles.doneLabel, { color: theme.isDark ? theme.colors.background : '#FFFFFF' }]}
          >
            {t('common:actions.done')}
          </Text>
        </Pressable>
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  doneButton: {
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: { fontSize: 15, fontWeight: '700' },
})
