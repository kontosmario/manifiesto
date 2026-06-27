import { useCallback, useMemo, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { RiseView } from '@/components/home/animated/rise-view'
import { HourPickerSheet } from '@/components/ui/hour-picker-sheet'
import { SectionHeader } from '@/components/ui/section-header'
import { Screen } from '@/components/ui/screen'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { SettingsRow, SettingsSwitchRow } from '@/components/settings/settings-primitives'
import {
  NOTIFICATION_KIND_GROUPS,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferences,
} from '@/features/notifications/use-notification-preferences'
import { type NotificationGroup } from '@/utils/notifications'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { DARK_TAB_CANVAS } from '@/theme/palette'

type CheckinSlot = 'morning' | 'midday' | 'evening'

const CHECKIN_SLOTS: Array<{
  slot: CheckinSlot
  field: keyof Pick<
    NotificationPreferences,
    'checkinMorningHour' | 'checkinMiddayHour' | 'checkinEveningHour'
  >
}> = [
  { slot: 'morning', field: 'checkinMorningHour' },
  { slot: 'midday', field: 'checkinMiddayHour' },
  { slot: 'evening', field: 'checkinEveningHour' },
]

const GROUP_ORDER: NotificationGroup[] = [
  'gastos',
  'ingresos',
  'fijos',
  'racha',
  'meta',
  'otros',
]

function formatHour(hour: number): string {
  const safe = Math.max(0, Math.min(23, hour))
  return `${safe.toString().padStart(2, '0')}:00`
}

export function NotificationsPreferencesScreen() {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const preferencesQuery = useNotificationPreferences()
  const updateMutation = useUpdateNotificationPreferences()
  const preferences = preferencesQuery.data

  const [pickerSlot, setPickerSlot] = useState<CheckinSlot | null>(null)

  const submitPatch = useCallback(
    (patch: Partial<NotificationPreferences>) => {
      updateMutation.mutate(patch, {
        onError: () => {
          void triggerHaptic('error')
          Alert.alert(t('settings:notif.saveErrorTitle'), t('settings:notif.saveErrorMessage'))
        },
      })
    },
    [updateMutation, t],
  )

  const kindsMutedRaw = preferences?.kindsMuted
  const kindsMuted = useMemo(() => kindsMutedRaw ?? [], [kindsMutedRaw])

  const groupMuteStates = useMemo(() => {
    const map: Record<NotificationGroup, boolean> = {
      gastos: false,
      ingresos: false,
      fijos: false,
      racha: false,
      meta: false,
      otros: false,
    }
    for (const group of GROUP_ORDER) {
      const kinds = NOTIFICATION_KIND_GROUPS[group]
      if (kinds.length === 0) {
        map[group] = false
        continue
      }
      map[group] = kinds.every((k) => kindsMuted.includes(k))
    }
    return map
  }, [kindsMuted])

  const handleToggleGroupMuted = useCallback(
    (group: NotificationGroup, nextEnabled: boolean) => {
      const groupKinds = NOTIFICATION_KIND_GROUPS[group]
      const currentlyMuted = new Set(kindsMuted)
      if (nextEnabled) {
        // "on" = NOT muted → remove the group's kinds.
        for (const k of groupKinds) currentlyMuted.delete(k)
      } else {
        for (const k of groupKinds) currentlyMuted.add(k)
      }
      submitPatch({ kindsMuted: Array.from(currentlyMuted) })
    },
    [kindsMuted, submitPatch],
  )

  const openPicker = useCallback((slot: CheckinSlot) => {
    void triggerHaptic('selection')
    setPickerSlot(slot)
  }, [])

  const closePicker = useCallback(() => setPickerSlot(null), [])

  // El carrusel commitea al asentar (mientras se explora); solo actualiza el
  // valor, NO cierra. El usuario cierra con "Listo". El haptic por hora lo
  // dispara el propio carrusel.
  const handleSetCheckinHour = useCallback(
    (hour: number) => {
      if (!pickerSlot) return
      const slotConfig = CHECKIN_SLOTS.find((s) => s.slot === pickerSlot)
      if (!slotConfig) return
      submitPatch({ [slotConfig.field]: hour })
    },
    [pickerSlot, submitPatch],
  )

  const currentPickerValue = (() => {
    if (!pickerSlot || !preferences) return 9
    if (pickerSlot === 'morning') return preferences.checkinMorningHour
    if (pickerSlot === 'midday') return preferences.checkinMiddayHour
    return preferences.checkinEveningHour
  })()

  const pickerTitle = (() => {
    if (!pickerSlot) return ''
    return t('settings:notif.checkinPickerTitle', {
      slot: t(`settings:notif.checkinSlot.${pickerSlot}.labelLower`),
    })
  })()

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      canGoBack
      contentContainerStyle={styles.screenContent}
      title={t('settings:notif.title')}
      subtitle={t('settings:notif.subtitle')}
    >
      <View style={styles.stack}>
        <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />
        <RiseView>
          <View style={styles.section}>
            <SectionHeader
              title={t('settings:notif.channelsTitle')}
              subtitle={t('settings:notif.channelsSubtitle')}
            />
            <SettingsSwitchRow
              label={t('settings:notif.pushLabel')}
              description={t('settings:notif.pushDescription')}
              value={preferences?.channelPush ?? true}
              onValueChange={(value) => submitPatch({ channelPush: value })}
            />
            <SettingsSwitchRow
              label={t('settings:notif.inappLabel')}
              description={t('settings:notif.inappDescription')}
              value={preferences?.channelInapp ?? true}
              onValueChange={(value) => submitPatch({ channelInapp: value })}
            />
          </View>
        </RiseView>

        <RiseView delay={120}>
          <View style={styles.section}>
            <SectionHeader
              title={t('settings:notif.checkinTitle')}
              subtitle={t('settings:notif.checkinSubtitle')}
            />
            {CHECKIN_SLOTS.map((slot) => {
              const value = preferences
                ? (preferences[slot.field] as number)
                : slot.slot === 'morning'
                  ? 9
                  : slot.slot === 'midday'
                    ? 14
                    : 20
              return (
                <SettingsRow
                  key={slot.slot}
                  iconFallback="schedule"
                  iconName="clock"
                  title={t(`settings:notif.checkinSlot.${slot.slot}.label`)}
                  subtitle={t(`settings:notif.checkinSlot.${slot.slot}.subtitle`)}
                  value={formatHour(value)}
                  onPress={() => openPicker(slot.slot)}
                />
              )
            })}
          </View>
        </RiseView>

        <RiseView delay={220}>
          <View style={styles.section}>
            <SectionHeader
              title={t('settings:notif.smartTitle')}
              subtitle={t('settings:notif.smartSubtitle')}
            />
            <SettingsSwitchRow
              label={t('settings:notif.nudgesLabel')}
              description={t('settings:notif.nudgesDescription')}
              value={preferences?.nudgesEnabled ?? true}
              onValueChange={(value) => submitPatch({ nudgesEnabled: value })}
            />
          </View>
        </RiseView>

        <RiseView delay={300}>
          <View style={styles.section}>
            <SectionHeader
              title={t('settings:notif.muteTitle')}
              subtitle={t('settings:notif.muteSubtitle')}
            />
            {GROUP_ORDER.map((group) => {
              const kinds = NOTIFICATION_KIND_GROUPS[group]
              if (kinds.length === 0) return null
              const isMuted = groupMuteStates[group]
              return (
                <SettingsSwitchRow
                  key={group}
                  label={t(`settings:notif.groupLabel.${group}`)}
                  description={t(`settings:notif.groupDescription.${group}`)}
                  value={!isMuted}
                  onValueChange={(enabled) => handleToggleGroupMuted(group, enabled)}
                />
              )
            })}
          </View>
        </RiseView>
      </View>

      <HourPickerSheet
        visible={pickerSlot !== null}
        title={pickerTitle}
        value={currentPickerValue}
        instanceKey={pickerSlot ?? 'closed'}
        onChange={handleSetCheckinHour}
        onClose={closePicker}
        accessibilityLabel={pickerTitle || t('settings:notif.checkinPickerA11y')}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    // Align with Ajustes top offset (safe area + 14pt).
    paddingTop: 4,
  },
  stack: {
    gap: 22,
  },
  section: {
    gap: 12,
  },
})
