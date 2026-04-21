import { StyleSheet, View } from 'react-native'
import { NotificationFeedList } from '@/components/home/notification-feed-list'
import { AmbientBackdrop } from '@/components/ui/ambient-backdrop'
import { Screen } from '@/components/ui/screen'
import { SummaryHeroCard } from '@/components/ui/summary-hero-card'
import { BrandedPanel } from '@/components/ui/branded-panel'
import { useFamilyNotifications, useFamilyNotificationsRealtime } from '@/features/notifications/use-notifications'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface NotificationsScreenProps {
  familyId: string
}

export function NotificationsScreen({ familyId }: NotificationsScreenProps) {
  const { theme } = useAppTheme()
  const notificationsQuery = useFamilyNotifications(familyId, 60)
  const notifications = notificationsQuery.data ?? []

  useFamilyNotificationsRealtime(familyId)

  return (
    <Screen
      canGoBack
      contentContainerStyle={styles.screenContent}
      scrollable={false}
      subtitle="Actividad reciente del hogar en formato timeline, más cercano a iOS."
      title="Notificaciones"
    >
      <View style={styles.sectionStack}>
        {!theme.isDark ? <AmbientBackdrop variant="history" /> : null}

        <SummaryHeroCard
          eyebrow="Actividad del hogar"
          meta="Pull para refrescar la timeline si esperas un evento nuevo."
          subtitle="Eventos recientes entre gastos, cambios y avisos internos."
          value={String(notifications.length)}
        />

        <BrandedPanel style={styles.card}>
          <NotificationFeedList
            errorMessage={
              notificationsQuery.isError
                ? getErrorMessage(
                    notificationsQuery.error,
                    'No pudimos cargar la actividad reciente del hogar.',
                  )
                : undefined
            }
            isLoading={notificationsQuery.isLoading}
            notifications={notifications}
            onRefresh={() => {
              void notificationsQuery.refetch()
            }}
            onRetry={() => {
              void notificationsQuery.refetch()
            }}
            refreshing={notificationsQuery.isRefetching}
          />
        </BrandedPanel>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 4,
  },
  sectionStack: {
    flex: 1,
    gap: 18,
    position: 'relative',
  },
  card: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
})
