import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BreatheDot } from '@/components/home/animated/breathe-dot'
import { CountUpText } from '@/components/home/animated/count-up-text'
import { RiseView } from '@/components/home/animated/rise-view'
import { ShineOverlay } from '@/components/home/animated/shine-overlay'
import { useAppTheme } from '@/theme/theme-provider'

interface NotificationsHeroProps {
  unreadCount: number
  totalCount: number
  latestAt: string | null
  onMarkAllRead?: () => void
}

/**
 * Compact header for the Notifications screen. Single row, ~64-72pt
 * tall — down from ~170pt on the previous hero card. Keeps the brand
 * language (heroGradient + ShineOverlay + BreatheDot + CountUpText)
 * but in a horizontal layout so it reads as "top-of-feed status bar"
 * instead of a competing card.
 */
export function NotificationsHero({
  unreadCount,
  totalCount,
  latestAt,
  onMarkAllRead,
}: NotificationsHeroProps) {
  const { theme } = useAppTheme()
  const hasUnread = unreadCount > 0

  const subtitle = (() => {
    if (totalCount === 0) return 'Sin novedades'
    if (!hasUnread) {
      const relative = formatLatestRelative(latestAt)
      return relative ? `Al día · último ${relative}` : 'Todo al día'
    }
    if (unreadCount === 1) return '1 sin leer'
    return `${unreadCount} sin leer`
  })()

  const displayCount = hasUnread ? unreadCount : totalCount

  return (
    <RiseView delay={60}>
      <LinearGradient
        colors={[...theme.colors.heroGradient] as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.card, { borderColor: 'rgba(199,238,156,0.12)' }]}
      >
        <ShineOverlay
          width={420}
          height={80}
          tint={theme.colors.shineOverlay}
          delayMs={1000}
          periodMs={4200}
        />

        <View style={styles.row}>
          <View style={styles.leftBlock}>
            <BreatheDot
              size={8}
              color={theme.colors.heroAccent}
              glow={theme.colors.heroAccent}
            />
            {displayCount > 0 ? (
              <CountUpText
                value={displayCount}
                duration={700}
                format={(n) => String(n)}
                style={[styles.count, { color: theme.colors.heroText }]}
              />
            ) : (
              <Text style={[styles.count, { color: theme.colors.heroText }]}>0</Text>
            )}
            <Text
              numberOfLines={1}
              style={[styles.subtitle, { color: theme.colors.heroMuted }]}
            >
              {subtitle}
            </Text>
          </View>

          {hasUnread && onMarkAllRead ? (
            <Pressable
              onPress={onMarkAllRead}
              accessibilityRole="button"
              accessibilityLabel="Marcar todas como leídas"
              hitSlop={8}
              style={({ pressed }) => [
                styles.markAllBtn,
                {
                  backgroundColor: theme.colors.heroAccent,
                  opacity: pressed ? 0.86 : 1,
                },
              ]}
            >
              <Text style={styles.markAllText}>Marcar todas</Text>
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>
    </RiseView>
  )
}

function formatLatestRelative(iso: string | null): string | null {
  if (!iso) return null
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return null
  const diffMs = Date.now() - then.getTime()
  if (diffMs < 60_000) return 'ahora'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} d`
  const weeks = Math.floor(days / 7)
  if (weeks === 1) return 'hace 1 sem'
  if (weeks < 4) return `hace ${weeks} sem`
  const months = Math.floor(days / 30)
  if (months === 1) return 'hace 1 mes'
  return `hace ${months} meses`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 2,
  },
  leftBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  count: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 26,
  },
  subtitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  markAllBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0A1410',
    letterSpacing: -0.2,
  },
})
