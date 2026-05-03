import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { RiseView } from '@/components/home/animated/rise-view'
import { ModalCard } from '@/components/ui/modal-card'
import { SectionHeader } from '@/components/ui/section-header'
import { Screen } from '@/components/ui/screen'
import { SettingsRow, SettingsSwitchRow } from '@/components/settings/settings-primitives'
import {
  NOTIFICATION_KIND_GROUPS,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
  type NotificationPreferences,
} from '@/features/notifications/use-notification-preferences'
import { NOTIFICATION_GROUP_LABELS, type NotificationGroup } from '@/utils/notifications'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

type CheckinSlot = 'morning' | 'midday' | 'evening'

const CHECKIN_SLOTS: Array<{
  slot: CheckinSlot
  label: string
  field: keyof Pick<
    NotificationPreferences,
    'checkinMorningHour' | 'checkinMiddayHour' | 'checkinEveningHour'
  >
  subtitle: string
}> = [
  {
    slot: 'morning',
    label: 'Mañana',
    field: 'checkinMorningHour',
    subtitle: 'Tu arranque del día.',
  },
  {
    slot: 'midday',
    label: 'Mediodía',
    field: 'checkinMiddayHour',
    subtitle: 'Una revisión rápida del ritmo.',
  },
  {
    slot: 'evening',
    label: 'Noche',
    field: 'checkinEveningHour',
    subtitle: 'Cierre del día y racha.',
  },
]

const GROUP_ORDER: NotificationGroup[] = ['gastos', 'fijos', 'racha', 'meta', 'otros']

const GROUP_DESCRIPTIONS: Record<NotificationGroup, string> = {
  gastos: 'Gastos cargados por vos o tu familia.',
  fijos: 'Compromisos que vencen o se actualizan.',
  racha: 'Check-ins diarios, rachas y escudos.',
  meta: 'Hitos y aportes a tu meta.',
  otros: 'Avisos generales y limpieza de suscripciones.',
}

function formatHour(hour: number): string {
  const safe = Math.max(0, Math.min(23, hour))
  return `${safe.toString().padStart(2, '0')}:00`
}

export function NotificationsPreferencesScreen() {
  const { theme } = useAppTheme()
  const preferencesQuery = useNotificationPreferences()
  const updateMutation = useUpdateNotificationPreferences()
  const preferences = preferencesQuery.data

  const [pickerSlot, setPickerSlot] = useState<CheckinSlot | null>(null)

  const submitPatch = useCallback(
    (patch: Partial<NotificationPreferences>) => {
      updateMutation.mutate(patch, {
        onError: () => {
          void triggerHaptic('error')
          Alert.alert('No pudimos guardar', 'Revisá tu conexión e intentá de nuevo.')
        },
      })
    },
    [updateMutation],
  )

  const kindsMuted = preferences?.kindsMuted ?? []

  const groupMuteStates = useMemo(() => {
    const map: Record<NotificationGroup, boolean> = {
      gastos: false,
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

  const handlePickHour = useCallback(
    (hour: number) => {
      if (!pickerSlot) return
      const slotConfig = CHECKIN_SLOTS.find((s) => s.slot === pickerSlot)
      if (!slotConfig) return
      const patch: Partial<NotificationPreferences> = { [slotConfig.field]: hour }
      submitPatch(patch)
      void triggerHaptic('success')
      closePicker()
    },
    [closePicker, pickerSlot, submitPatch],
  )

  const currentPickerValue = (() => {
    if (!pickerSlot || !preferences) return 9
    if (pickerSlot === 'morning') return preferences.checkinMorningHour
    if (pickerSlot === 'midday') return preferences.checkinMiddayHour
    return preferences.checkinEveningHour
  })()

  const pickerTitle = (() => {
    if (!pickerSlot) return ''
    return `Check-in de ${CHECKIN_SLOTS.find((s) => s.slot === pickerSlot)?.label.toLowerCase() ?? ''}`
  })()

  return (
    <Screen
      canGoBack
      contentContainerStyle={styles.screenContent}
      title="Notificaciones"
      subtitle="Elegí qué te llega, cuándo y por dónde."
    >
      <View style={styles.stack}>
        <RiseView>
          <View style={styles.section}>
            <SectionHeader
              title="Canales"
              subtitle="Elegí por qué vías queremos avisarte."
            />
            <SettingsSwitchRow
              label="Push"
              description="Notificaciones que llegan a tu teléfono aunque la app esté cerrada."
              value={preferences?.channelPush ?? true}
              onValueChange={(value) => submitPatch({ channelPush: value })}
            />
            <SettingsSwitchRow
              label="In-app"
              description="El buzón dentro de Manifiesto con la actividad reciente."
              value={preferences?.channelInapp ?? true}
              onValueChange={(value) => submitPatch({ channelInapp: value })}
            />
          </View>
        </RiseView>

        <RiseView delay={120}>
          <View style={styles.section}>
            <SectionHeader
              title="Horarios de check-in"
              subtitle="A qué hora querés que te escribamos."
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
                  title={slot.label}
                  subtitle={slot.subtitle}
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
              title="Sugerencias inteligentes"
              subtitle="Avisos que te empujan cuando tu racha o tu ritmo corren peligro."
            />
            <SettingsSwitchRow
              label="Recordatorios y nudges"
              description="Te avisamos si tu racha está en riesgo o si pasaste el margen del día."
              value={preferences?.nudgesEnabled ?? true}
              onValueChange={(value) => submitPatch({ nudgesEnabled: value })}
            />
          </View>
        </RiseView>

        <RiseView delay={300}>
          <View style={styles.section}>
            <SectionHeader
              title="Silenciar por tipo"
              subtitle="Dejá encendidos los grupos que sí te interesan."
            />
            {GROUP_ORDER.map((group) => {
              const kinds = NOTIFICATION_KIND_GROUPS[group]
              if (kinds.length === 0) return null
              const isMuted = groupMuteStates[group]
              return (
                <SettingsSwitchRow
                  key={group}
                  label={NOTIFICATION_GROUP_LABELS[group]}
                  description={GROUP_DESCRIPTIONS[group]}
                  value={!isMuted}
                  onValueChange={(enabled) => handleToggleGroupMuted(group, enabled)}
                />
              )
            })}
          </View>
        </RiseView>
      </View>

      <ModalCard
        visible={pickerSlot !== null}
        title={pickerTitle}
        onClose={closePicker}
      >
        <View style={styles.hourList}>
          {Array.from({ length: 24 }).map((_, hour) => {
            const selected = hour === currentPickerValue
            return (
              <Pressable
                key={hour}
                onPress={() => handlePickHour(hour)}
                style={({ pressed }) => [
                  styles.hourRow,
                  {
                    backgroundColor: selected ? theme.colors.primary : 'transparent',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.hourLabel,
                    {
                      color: selected
                        ? theme.isDark
                          ? '#12211A'
                          : theme.colors.creamCard
                        : theme.colors.text,
                    },
                  ]}
                >
                  {formatHour(hour)}
                </Text>
                {selected ? (
                  <MaterialIcons
                    name="check"
                    size={18}
                    color={theme.isDark ? '#12211A' : theme.colors.creamCard}
                  />
                ) : null}
              </Pressable>
            )
          })}
        </View>
      </ModalCard>
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
  hourList: {
    gap: 2,
    paddingVertical: 4,
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
  },
  hourLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
})
