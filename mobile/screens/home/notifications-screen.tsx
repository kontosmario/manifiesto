import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { NotificationFeedList } from '@/components/home/notification-feed-list'
import { NotificationsFilterPills, type NotificationFilter } from '@/components/home/notifications-filter-pills'
import { NotificationsHero } from '@/components/home/notifications-hero'
import { RiseView } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import {
  useFamilyNotifications,
  useFamilyNotificationsRealtime,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  type FamilyNotification,
} from '@/features/notifications/use-notifications'
import { groupForKind, type NotificationGroup } from '@/utils/notifications'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'

interface NotificationsScreenProps {
  userId: string
  familyId: string
}

export function NotificationsScreen({ userId, familyId }: NotificationsScreenProps) {
  const { theme } = useAppTheme()
  const router = useRouter()
  const notificationsQuery = useFamilyNotifications(familyId, userId, 80)
  const notificationsData = notificationsQuery.data
  const notifications = useMemo(() => notificationsData ?? [], [notificationsData])
  const markOne = useMarkNotificationRead(familyId)
  const markAll = useMarkAllNotificationsRead(familyId, userId)

  const [filter, setFilter] = useState<NotificationFilter>('all')
  useFamilyNotificationsRealtime(familyId)

  const counts = useMemo<Partial<Record<NotificationFilter, number>>>(() => {
    const acc: Partial<Record<NotificationFilter, number>> = { all: notifications.length }
    const byGroup: Record<NotificationGroup, number> = {
      gastos: 0,
      fijos: 0,
      racha: 0,
      meta: 0,
      otros: 0,
    }
    for (const n of notifications) {
      const g = groupForKind(n.kind)
      if (g && g in byGroup) byGroup[g] += 1
    }
    acc.gastos = byGroup.gastos
    acc.fijos = byGroup.fijos
    acc.racha = byGroup.racha
    acc.meta = byGroup.meta
    return acc
  }, [notifications])

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => (n.read_at ? acc : acc + 1), 0),
    [notifications],
  )
  const latestAt = notifications[0]?.created_at ?? null

  const handleMarkRead = useCallback(
    (notification: FamilyNotification) => {
      markOne.mutate({ id: notification.id, read: !notification.read_at })
    },
    [markOne],
  )

  const handleMarkAll = useCallback(() => {
    if (unreadCount === 0) return
    void triggerHaptic('success')
    markAll.mutate()
  }, [markAll, unreadCount])

  const handleBack = () => {
    void triggerHaptic('selection')
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/home')
  }

  const sectionLayout = LinearTransition.duration(260)

  const listHeader = (
    <View style={styles.headerBlock}>
      <Animated.View layout={sectionLayout}>
        <NotificationsHero
          unreadCount={unreadCount}
          totalCount={notifications.length}
          latestAt={latestAt}
          onMarkAllRead={unreadCount > 0 ? handleMarkAll : undefined}
        />
      </Animated.View>

      <Animated.View layout={sectionLayout}>
        <RiseView delay={140}>
          <NotificationsFilterPills
            filter={filter}
            counts={counts}
            onChange={setFilter}
          />
        </RiseView>
      </Animated.View>
    </View>
  )

  return (
    <Screen contentContainerStyle={styles.screenContent} scrollable={false}>
      <View style={styles.stack}>
        <AmbientBlobs />

        <Animated.View layout={sectionLayout}>
          <RiseView>
            <View style={styles.topRow}>
              <Pressable
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel="Volver"
                hitSlop={10}
                style={[
                  styles.backPill,
                  { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.line },
                ]}
              >
                <MaterialIcons name="arrow-back-ios-new" size={18} color={theme.colors.text} />
              </Pressable>
              <Text style={[styles.topTitle, { color: theme.colors.text }]}>
                Notificaciones
              </Text>
            </View>
          </RiseView>
        </Animated.View>

        <View style={styles.listWrap}>
          <NotificationFeedList
            familyId={familyId}
            filter={filter}
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
            onMarkRead={handleMarkRead}
            pendingNotificationId={
              markOne.isPending ? (markOne.variables?.id ?? null) : null
            }
            ListHeaderComponent={listHeader}
          />
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 14,
  },
  stack: {
    flex: 1,
    gap: 12,
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  topTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  backPill: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
  },
  headerBlock: {
    gap: 14,
    paddingBottom: 4,
  },
})
