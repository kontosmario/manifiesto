import { FlatList, StyleSheet, Text, View } from 'react-native'
import { ErrorState } from '@/components/ui/error-state'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SectionHeader } from '@/components/ui/section-header'
import type { FamilyNotification } from '@/features/notifications/use-notifications'
import { withAlpha } from '@/theme/color-utils'
import { radii } from '@/theme/palette'
import { useAppTheme } from '@/theme/theme-provider'
import { formatNotificationDate, notificationKindLabel } from '@/utils/notifications'

interface NotificationFeedListProps {
  errorMessage?: string
  isLoading: boolean
  notifications: FamilyNotification[]
  onRefresh: () => void
  onRetry?: () => void
  refreshing: boolean
}

export function NotificationFeedList({
  errorMessage,
  isLoading,
  notifications,
  onRefresh,
  onRetry,
  refreshing,
}: NotificationFeedListProps) {
  const { theme } = useAppTheme()

  if (isLoading && notifications.length === 0) {
    return <LoadingBlock label="Cargando notificaciones..." />
  }

  if (errorMessage && notifications.length === 0) {
    return (
      <ErrorState
        description={errorMessage}
        title="No pudimos cargar la timeline"
        onAction={onRetry}
      />
    )
  }

  return (
    <FlatList
      contentContainerStyle={[
        notifications.length === 0 ? styles.emptyContent : null,
        styles.content,
      ]}
      data={notifications}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        notifications.length > 0 ? (
          <SectionHeader
            subtitle="Lectura cronológica, con el evento más reciente primero."
            title="Timeline"
          />
        ) : null
      }
      onRefresh={onRefresh}
      refreshing={refreshing}
      renderItem={({ item, index }) => (
        <View
          style={[
            styles.itemRow,
            {
              backgroundColor: theme.isDark
                ? theme.colors.surfaceMuted
                : withAlpha(theme.colors.backgroundElevated, 0.94),
              borderColor:
                index === 0
                  ? theme.isDark
                    ? theme.colors.borderStrong
                    : withAlpha(theme.colors.primary, 0.14)
                  : theme.colors.border,
            },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
          <View style={styles.itemCopy}>
            <View style={styles.itemHeader}>
              <Text style={[styles.kind, { color: theme.colors.primaryStrong }]}>
                {notificationKindLabel(item.kind)}
              </Text>
              <Text style={[styles.date, { color: theme.colors.textSoft }]}>
                {formatNotificationDate(item.created_at)}
              </Text>
            </View>
            <Text style={[styles.title, { color: theme.colors.text }]}>{item.title}</Text>
            <Text style={[styles.body, theme.typography.body, { color: theme.colors.textMuted }]}>{item.body}</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <EmptyState icon="notifications-none" stateKey="notifications" />
      }
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    gap: 12,
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  dot: {
    height: 10,
    marginTop: 8,
    borderRadius: radii.pill,
    width: 10,
  },
  itemCopy: {
    flex: 1,
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  kind: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  date: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  body: {},
})
