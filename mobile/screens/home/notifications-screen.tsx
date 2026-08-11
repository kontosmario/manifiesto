import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { AmbientBlobs } from '@/components/home/ambient-blobs'
import { NotificationFeedList } from '@/components/home/notification-feed-list'
import { RiseView, RiseViewGate } from '@/components/home/animated/rise-view'
import { Screen } from '@/components/ui/screen'
import { useIsNavigationSettled } from '@/hooks/use-is-navigation-settled'
import {
  useDeleteAllNotifications,
  useDeleteNotification,
  useFamilyNotifications,
  useFamilyNotificationsRealtime,
  useMarkNotificationsSeen,
  type FamilyNotification,
} from '@/features/notifications/use-notifications'
import { triggerHaptic } from '@/lib/haptics'
import { DARK_TAB_CANVAS } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { getErrorMessage } from '@/utils/error-message'
import { nunitoFamily } from '@/theme/typography'

interface NotificationsScreenProps {
  userId: string
  familyId: string
}

export function NotificationsScreen({ userId, familyId }: NotificationsScreenProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const router = useRouter()
  const isNavSettled = useIsNavigationSettled()
  const notificationsQuery = useFamilyNotifications(familyId, userId, 80)
  const notificationsData = notificationsQuery.data
  const notifications = useMemo(() => notificationsData ?? [], [notificationsData])
  const deleteOne = useDeleteNotification(familyId)
  const deleteAll = useDeleteAllNotifications(familyId, userId)
  const markSeen = useMarkNotificationsSeen(familyId, userId)

  useFamilyNotificationsRealtime(familyId)

  // Mark-on-open: abrir esta pantalla = "viste tus notificaciones" → marca todo
  // leído (el badge del bell se va a 0). Una sola vez por apertura; las filas
  // siguen visibles para accionarlas y el cron diario las poda a las 48h.
  const seenFiredRef = useRef(false)
  useEffect(() => {
    if (seenFiredRef.current || !familyId) return
    seenFiredRef.current = true
    markSeen.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId])

  const count = notifications.length

  const handleMarkRead = useCallback(
    (notification: FamilyNotification) => {
      void triggerHaptic('selection')
      deleteOne.mutate({ id: notification.id })
    },
    [deleteOne],
  )

  const handleMarkAll = useCallback(() => {
    if (count === 0) return
    void triggerHaptic('success')
    deleteAll.mutate()
  }, [deleteAll, count])

  const handleBack = () => {
    void triggerHaptic('selection')
    if (router.canGoBack()) router.back()
    else router.replace('/(app)/(tabs)/home')
  }

  const backPillBg = theme.isDark ? theme.colors.surfaceMuted : theme.colors.creamCard

  return (
    <Screen
      backgroundColor={theme.isDark ? DARK_TAB_CANVAS : undefined}
      contentContainerStyle={styles.screenContent}
      scrollable={false}
    >
      <RiseViewGate skip={!isNavSettled}>
        <View style={styles.stack}>
          <AmbientBlobs tone={theme.isDark ? 'calm' : 'aurora'} />

          <RiseView>
            <View style={styles.header}>
              <View style={styles.topRow}>
                <Pressable
                  onPress={handleBack}
                  accessibilityRole="button"
                  accessibilityLabel={t('home:notificationsScreen.back')}
                  hitSlop={10}
                  style={[
                    styles.backPill,
                    { backgroundColor: backPillBg, borderColor: theme.colors.line },
                  ]}
                >
                  <MaterialIcons name="arrow-back-ios-new" size={18} color={theme.colors.text} />
                </Pressable>
                <Text style={[styles.topTitle, { color: theme.colors.text }]}>
                  {t('home:notificationsScreen.title')}
                </Text>
              </View>

              {/* Sub-línea solo cuando HAY pendientes. Con la lista vacía
                  el EmptyState ("Todo al día") es el único dueño del
                  mensaje — antes se duplicaba aquí y en el empty state. */}
              {count > 0 ? (
                <View style={styles.subRow}>
                  <Text style={[styles.subLine, { color: theme.colors.textMuted }]}>
                    {t('home:notificationsScreen.pendingCount', { count })}
                  </Text>
                  <Pressable
                    onPress={handleMarkAll}
                    accessibilityRole="button"
                    accessibilityLabel={t('home:notificationsScreen.markAllAccessibility')}
                    hitSlop={8}
                    style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.markAll, { color: theme.colors.primary }]}>
                      {t('home:notificationsScreen.markAll')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </RiseView>

          <View style={styles.listWrap}>
            <NotificationFeedList
              familyId={familyId}
              errorMessage={
                notificationsQuery.isError
                  ? getErrorMessage(
                      notificationsQuery.error,
                      t('home:notificationsScreen.loadError'),
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
            />
          </View>
        </View>
      </RiseViewGate>
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
  header: {
    gap: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  topTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: -0.6,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 52,
    gap: 12,
  },
  subLine: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  markAll: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
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
})
