import { useMemo } from 'react'
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  FadeIn,
  FadeOutRight,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { motionDurations, motionStagger } from '@/lib/motion'
import type { AvatarSlug } from '@/assets/avatars'
import { Avatar } from '@/components/ui/avatar'
import { AvatarAnimal } from '@/components/ui/avatar-animal'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { LoadingBlock } from '@/components/ui/loading-block'
import { SwipeableRow } from '@/components/ui/swipeable-row'
import { useFamilyMembers } from '@/features/family/use-family-members'
import type { FamilyNotification } from '@/features/notifications/use-notifications'
import { useAppTheme } from '@/theme/theme-provider'
import {
  formatRelativeNotificationTime,
  iconForKind,
  pillForSeverity,
} from '@/utils/notifications'

interface NotificationFeedListProps {
  errorMessage?: string
  isLoading: boolean
  notifications: FamilyNotification[]
  onRefresh: () => void
  onRetry?: () => void
  refreshing: boolean
  familyId: string
  /** Marca la notificación como leída → HARD DELETE de la fila. */
  onMarkRead: (notification: FamilyNotification) => void
  ListHeaderComponent?: React.ReactElement | null
}

/**
 * Notificaciones V2: lista plana y minificada. Solo muestra pendientes
 * (todo lo que está en la tabla está sin leer), sin secciones ni
 * filtros. Marcar leída = borrar la fila, vía botón de check o swipe.
 * El tap en el cuerpo no hace nada destructivo (el borrado es
 * permanente; las únicas affordances son el check y el swipe).
 */
export function NotificationFeedList({
  errorMessage,
  isLoading,
  notifications,
  onRefresh,
  onRetry,
  refreshing,
  familyId,
  onMarkRead,
  ListHeaderComponent,
}: NotificationFeedListProps) {
  const { theme } = useAppTheme()
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
          title="No pudimos cargar las notificaciones"
          onAction={onRetry}
        />
      </View>
    )
  }

  const cardBg = theme.isDark
    ? (theme.colors.surfaceMuted ?? theme.colors.creamCard)
    : theme.colors.creamCard

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
      ListHeaderComponent={ListHeaderComponent ?? null}
      renderItem={({ item, index }) => {
        const author = item.created_by
          ? memberById.get(item.created_by) ?? null
          : null
        // Entrada escalonada de 40ms por fila, tope en index 8 → 320ms.
        const staggerDelay = Math.min(index, 8) * motionStagger.listItem
        return (
          <Animated.View
            entering={FadeIn.delay(staggerDelay)
              .duration(motionDurations.enterTab)
              .reduceMotion(ReduceMotion.System)}
            // Salida intuitiva: la fila se desliza a la derecha mientras
            // se desvanece (lee como "la despachaste / listo"), más corta
            // que la entrada (exit-faster-than-enter). El reflow de las
            // filas restantes usa un spring para que el hueco se cierre
            // suave y natural en vez de un colapso lineal mecánico.
            exiting={FadeOutRight.duration(220).reduceMotion(
              ReduceMotion.System,
            )}
            layout={LinearTransition.springify()
              .damping(22)
              .stiffness(190)
              .mass(0.6)
              .reduceMotion(ReduceMotion.System)}
          >
            <SwipeableRow
              accessibilityHint="Desliza para marcar como leída"
              borderRadius={16}
              borderColor={theme.colors.line}
              rightActions={[
                {
                  label: 'Listo',
                  tone: 'neutral',
                  icon: 'done',
                  onPress: () => onMarkRead(item),
                },
              ]}
            >
              <NotificationRow
                notification={item}
                author={author}
                cardBg={cardBg}
                onMarkRead={() => onMarkRead(item)}
              />
            </SwipeableRow>
          </Animated.View>
        )
      }}
      ListEmptyComponent={
        <View style={styles.emptyWrapper}>
          <EmptyState
            icon="notifications-none"
            title="Todo al día"
            subtitle="No tienes notificaciones pendientes."
          />
        </View>
      }
      contentContainerStyle={
        notifications.length === 0 ? styles.emptyContent : styles.content
      }
      showsVerticalScrollIndicator={false}
      ItemSeparatorComponent={() => <View style={styles.rowSpacer} />}
    />
  )
}

interface NotificationRowProps {
  notification: FamilyNotification
  author: { name: string; color: string; avatarSlug: AvatarSlug | null } | null
  cardBg: string
  onMarkRead: () => void
}

function NotificationRow({
  notification,
  author,
  cardBg,
  onMarkRead,
}: NotificationRowProps) {
  const { theme } = useAppTheme()
  const pill = pillForSeverity(notification.severity, theme.isDark)
  const relativeTime = formatRelativeNotificationTime(notification.created_at)

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: cardBg,
          borderColor: theme.colors.line,
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
            style={[styles.title, { color: theme.colors.text }]}
          >
            {notification.title}
          </Text>
          <Text style={[styles.time, { color: theme.colors.textMuted }]}>
            {relativeTime}
          </Text>
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
              <Text style={[styles.pillLabel, { color: pill.ink }]}>
                {pill.label}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Marcar leída"
        hitSlop={8}
        onPress={onMarkRead}
        style={({ pressed }) => [
          styles.checkButton,
          {
            backgroundColor: theme.colors.creamSoft,
            borderColor: theme.colors.line,
            transform: [{ scale: pressed ? 0.9 : 1 }],
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <MaterialIcons name="check" size={18} color={theme.colors.primary} />
      </Pressable>
    </View>
  )
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
    flexGrow: 1,
    paddingBottom: 24,
  },
  emptyWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 24,
    minHeight: 240,
  },
  rowSpacer: { height: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    fontWeight: '700',
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
  checkButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
})
