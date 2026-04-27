import { useMemo } from 'react'
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import type { AvatarSlug } from '@/assets/avatars'
import { Avatar } from '@/components/ui/avatar'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SwipeableRow } from '@/components/ui/swipeable-row'
import { useFamilyMembers } from '@/features/family/use-family-members'
import type { FamilyNotification } from '@/features/notifications/use-notifications'
import type { NotificationFilter } from '@/components/home/notifications-filter-pills'
import { useAppTheme } from '@/theme/theme-provider'
import {
  formatRelativeNotificationTime,
  groupForKind,
  iconForKind,
  notificationSectionTitles,
  pillForSeverity,
  timeSectionForDate,
  type NotificationSectionKey,
} from '@/utils/notifications'

interface NotificationFeedSection {
  key: NotificationSectionKey
  title: string
  data: FamilyNotification[]
}

interface NotificationFeedListProps {
  errorMessage?: string
  isLoading: boolean
  notifications: FamilyNotification[]
  onRefresh: () => void
  onRetry?: () => void
  refreshing: boolean
  familyId: string
  filter: NotificationFilter
  onMarkRead: (notification: FamilyNotification) => void
  /** Notification id currently being marked read/unread (mutation in flight). */
  pendingNotificationId?: string | null
  ListHeaderComponent?: React.ReactElement | null
}

/**
 * Scrollable notification timeline aligned with the Home/Gastos/Fijos
 * design language: bordered creamCard rows, eyebrow-style section
 * headers with an underline, LinearTransition on row updates so
 * mark-as-read animates instead of snapping. Filter pills + hero live
 * outside this component and are wired via `ListHeaderComponent`.
 */
export function NotificationFeedList({
  errorMessage,
  isLoading,
  notifications,
  onRefresh,
  onRetry,
  refreshing,
  familyId,
  filter,
  onMarkRead,
  pendingNotificationId,
  ListHeaderComponent,
}: NotificationFeedListProps) {
  const { theme } = useAppTheme()
  const router = useRouter()
  const membersQuery = useFamilyMembers(familyId)

  const memberById = useMemo(() => {
    const map = new Map<
      string,
      { name: string; color: string; avatarSlug: AvatarSlug | null }
    >()
    for (const m of membersQuery.data ?? []) {
      map.set(m.id, { name: m.name, color: m.color, avatarSlug: m.avatarSlug })
    }
    return map
  }, [membersQuery.data])

  const sections = useMemo<NotificationFeedSection[]>(
    () => buildSections(notifications, filter),
    [notifications, filter],
  )

  if (isLoading && notifications.length === 0) {
    return (
      <View style={styles.container}>
        {ListHeaderComponent}
        <LoadingBlock label="Cargando notificaciones..." />
      </View>
    )
  }

  if (errorMessage && notifications.length === 0) {
    return (
      <View style={styles.container}>
        {ListHeaderComponent}
        <ErrorState
          description={errorMessage}
          title="No pudimos cargar la timeline"
          onAction={onRetry}
        />
      </View>
    )
  }

  const handleRowPress = (item: FamilyNotification) => {
    if (!item.read_at) {
      onMarkRead(item)
    }
    const route = item.metadata?.route
    if (typeof route === 'string' && route.length > 0) {
      router.push(route as never)
    }
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
      ListHeaderComponent={ListHeaderComponent ?? null}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>
            {section.title}
          </Text>
          <View style={[styles.sectionUnderline, { backgroundColor: theme.colors.line }]} />
        </View>
      )}
      renderItem={({ item }) => {
        const author = item.created_by ? memberById.get(item.created_by) ?? null : null
        const isUnread = !item.read_at
        const readActionLabel = isUnread ? 'Leído' : 'No leído'
        const readActionIcon = isUnread ? 'visibility' : 'visibility-off'
        return (
          <Animated.View layout={LinearTransition.duration(240)}>
            <SwipeableRow
              accessibilityHint={`Desliza para marcar como ${readActionLabel.toLowerCase()}`}
              borderRadius={16}
              borderColor={theme.colors.line}
              isProcessing={pendingNotificationId === item.id}
              rightActions={[
                {
                  label: readActionLabel,
                  tone: 'neutral',
                  icon: readActionIcon,
                  onPress: () => onMarkRead(item),
                },
              ]}
            >
              <NotificationRow
                notification={item}
                author={author}
                onPress={() => handleRowPress(item)}
              />
            </SwipeableRow>
          </Animated.View>
        )
      }}
      ListEmptyComponent={
        <View style={styles.emptyWrapper}>
          <EmptyState
            icon="notifications-none"
            title="Sin novedades por ahora"
            subtitle="Acá vas a ver los movimientos del hogar, tu racha y tus metas."
          />
        </View>
      }
      contentContainerStyle={
        sections.length === 0 ? styles.emptyContent : styles.content
      }
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={styles.rowSpacer} />}
      SectionSeparatorComponent={() => <View style={styles.sectionSpacer} />}
    />
  )
}

interface NotificationRowProps {
  notification: FamilyNotification
  author: { name: string; color: string; avatarSlug: AvatarSlug | null } | null
  onPress: () => void
}

function NotificationRow({ notification, author, onPress }: NotificationRowProps) {
  const { theme } = useAppTheme()
  const isUnread = !notification.read_at
  const pill = pillForSeverity(notification.severity, theme.isDark)
  const relativeTime = formatRelativeNotificationTime(notification.created_at)
  const accent = pill?.ink ?? theme.colors.primary

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: theme.colors.creamCard,
          borderColor: isUnread ? accent : theme.colors.line,
          borderLeftWidth: isUnread ? 3 : 1,
          opacity: pressed ? 0.94 : 1,
        },
      ]}
    >
      <View style={styles.avatarColumn}>
        {author ? (
          author.avatarSlug ? (
            <AvatarAnimal slug={author.avatarSlug} size={36} />
          ) : (
            <Avatar name={author.name} color={author.color} size={36} />
          )
        ) : (
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: theme.isDark
                  ? (theme.colors.surfaceMuted ?? theme.colors.creamSoft)
                  : theme.colors.creamSoft,
                borderColor: theme.colors.line,
              },
            ]}
          >
            <Text style={styles.iconGlyph}>{iconForKind(notification.kind)}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            numberOfLines={2}
            style={[
              styles.title,
              {
                color: theme.colors.text,
                fontWeight: isUnread ? '800' : '700',
              },
            ]}
          >
            {notification.title}
          </Text>
          <Text style={[styles.time, { color: theme.colors.textMuted }]}>{relativeTime}</Text>
        </View>
        {notification.body ? (
          <Text
            numberOfLines={3}
            style={[styles.bodyText, { color: theme.colors.textMuted }]}
          >
            {notification.body}
          </Text>
        ) : null}
        {pill ? (
          <View style={styles.pillRow}>
            <View style={[styles.pill, { backgroundColor: pill.surface }]}>
              <Text style={[styles.pillLabel, { color: pill.ink }]}>{pill.label}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

function buildSections(
  notifications: FamilyNotification[],
  filter: NotificationFilter,
): NotificationFeedSection[] {
  const filtered =
    filter === 'all'
      ? notifications
      : notifications.filter((n) => groupForKind(n.kind) === filter)

  if (filtered.length === 0) return []

  const now = new Date()
  const unread: FamilyNotification[] = []
  const today: FamilyNotification[] = []
  const yesterday: FamilyNotification[] = []
  const thisWeek: FamilyNotification[] = []
  const older: FamilyNotification[] = []

  for (const n of filtered) {
    if (!n.read_at) {
      unread.push(n)
      continue
    }
    const key = timeSectionForDate(n.created_at, now)
    if (key === 'today') today.push(n)
    else if (key === 'yesterday') yesterday.push(n)
    else if (key === 'thisWeek') thisWeek.push(n)
    else older.push(n)
  }

  const sections: NotificationFeedSection[] = []
  if (unread.length) sections.push({ key: 'unread', title: notificationSectionTitles.unread, data: unread })
  if (today.length) sections.push({ key: 'today', title: notificationSectionTitles.today, data: today })
  if (yesterday.length) sections.push({ key: 'yesterday', title: notificationSectionTitles.yesterday, data: yesterday })
  if (thisWeek.length) sections.push({ key: 'thisWeek', title: notificationSectionTitles.thisWeek, data: thisWeek })
  if (older.length) sections.push({ key: 'older', title: notificationSectionTitles.older, data: older })
  return sections
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    gap: 10,
  },
  content: {
    paddingBottom: 24,
  },
  emptyContent: {
    // flexGrow fills the screen without centering children, so the
    // list header stays pinned at the top. The EmptyState itself
    // (inside emptyWrapper) stretches via flex:1 to fill whatever is
    // left and centers its own content.
    flexGrow: 1,
    paddingBottom: 24,
  },
  emptyWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 24,
    minHeight: 240,
  },
  sectionHeader: {
    paddingTop: 18,
    paddingBottom: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  sectionUnderline: {
    height: 1,
    opacity: 0.6,
  },
  rowSpacer: { height: 8 },
  sectionSpacer: { height: 0 },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatarColumn: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconGlyph: {
    fontSize: 18,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  time: {
    fontSize: 11,
    fontWeight: '600',
  },
  bodyText: {
    fontSize: 12,
    lineHeight: 17,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
})
