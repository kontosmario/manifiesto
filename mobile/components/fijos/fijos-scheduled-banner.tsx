import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'

interface FijosScheduledBannerProps {
  /** Fijos en estado `'future'` — recién creados sin pago previo y
   *  con vencimiento en un ciclo posterior. */
  items: FijoItem[]
  /** Color del card del padre (FijoCategoryGroups vive sobre el canvas
   *  del Screen, así que usamos el theme.colors.creamCard / surfaceMuted
   *  matchea ese fondo). Necesario para el bg del banner. */
}

/**
 * Banner contextual de fijos programados sin pagar.
 *
 * Vive arriba del listado de FijoCategoryGroups, visible en TODAS las
 * tabs (vencidos/pendientes/pagados). Renderea null cuando no hay items
 * en estado 'future' — el patrón es "appears when needed, invisible
 * otherwise".
 *
 * Diseño (ui-ux-pro-max + impeccable):
 *   · Bg sky-muted subtle (info, no urgencia).
 *   · Icon `event` + label "N fijos programados".
 *   · Chevron right/down indicando expand/collapse.
 *   · Collapsed por default (low cognitive load). Tap → expande con
 *     fade-in stagger.
 *   · Lista expandida: nombre + vencimiento humano (cuando vence).
 *
 * Reemplaza la tab "Próximos" (deprecated 2026-05-31 v4) por algo más
 * contextual. Para 99% de los users la banner queda invisible; solo
 * aparece cuando hay items.
 */
export function FijosScheduledBanner({ items }: FijosScheduledBannerProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const bannerLayout = useGatedLayout(LinearTransition.duration(260))
  const reduced = useReducedMotion()
  const [expanded, setExpanded] = useState(false)

  // Animated chevron rotation (180° on expand).
  const rotation = useSharedValue(0)
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  const handleToggle = () => {
    setExpanded((v) => !v)
    if (reduced) {
      rotation.value = expanded ? 0 : 180
    } else {
      rotation.value = withTiming(expanded ? 0 : 180, {
        duration: motionDurations.standard,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    }
  }

  // Empty state: no render. La banner es "appears when relevant".
  if (items.length === 0) return null

  // Sky-muted palette (info, no urgencia).
  const accentSolid = theme.isDark ? '#9DC4DE' : '#3F7CA3'
  const accentBg = theme.isDark
    ? 'rgba(157,196,222,0.10)'
    : 'rgba(63,124,163,0.07)'
  const accentBorder = theme.isDark
    ? 'rgba(157,196,222,0.30)'
    : 'rgba(63,124,163,0.22)'

  const countLabel = t('fijos:scheduledBanner.count', { count: items.length })

  return (
    <Animated.View
      layout={bannerLayout}
      style={[
        styles.banner,
        { backgroundColor: accentBg, borderColor: accentBorder },
      ]}
    >
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('fijos:scheduledBanner.toggleHint', {
          label: countLabel,
          action: expanded
            ? t('fijos:scheduledBanner.toggleHide')
            : t('fijos:scheduledBanner.toggleShow'),
        })}
        style={styles.headerRow}
      >
        <View style={styles.headerLeft}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: accentSolid + '22', borderColor: accentBorder },
            ]}
          >
            <MaterialIcons name="event" size={14} color={accentSolid} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.headerLabel, { color: accentSolid }]}>
              {countLabel}
            </Text>
            <Text style={[styles.headerSub, { color: theme.colors.textMuted }]}>
              {t('fijos:scheduledBanner.unpaidYet')}
            </Text>
          </View>
        </View>
        <Animated.View style={chevronStyle}>
          <MaterialIcons
            name="expand-more"
            size={20}
            color={theme.colors.textMuted}
          />
        </Animated.View>
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={styles.list}
        >
          <View style={[styles.divider, { backgroundColor: accentBorder }]} />
          {items.map((item) => (
            <ScheduledRow
              key={item.id}
              item={item}
              accentSolid={accentSolid}
            />
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

function ScheduledRow({
  item,
  accentSolid,
}: {
  item: FijoItem
  accentSolid: string
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const dueLabel = (() => {
    if (!item.next_due_on) return t('fijos:scheduledBanner.noDate')
    const parts = item.next_due_on.split('-')
    if (parts.length < 3) return item.next_due_on
    const year = parseInt(parts[0]!, 10)
    const monthIdx = parseInt(parts[1]!, 10) - 1
    const day = parseInt(parts[2]!, 10)
    if (Number.isNaN(year) || Number.isNaN(monthIdx) || Number.isNaN(day)) {
      return item.next_due_on
    }
    const monthName = t(`fijos:months.${monthIdx}`)
    const currentYear = new Date().getFullYear()
    const yearSuffix = year === currentYear ? '' : ` ${year}`
    return `${day} ${monthName}${yearSuffix}`
  })()

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: accentSolid }]} />
      <Text
        style={[styles.rowName, { color: theme.colors.text }]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
      <Text style={[styles.rowDue, { color: theme.colors.textMuted }]}>
        {t('fijos:scheduledBanner.due', { date: dueLabel })}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 1 },
  headerLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontSize: 10.5,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  list: {
    marginTop: 8,
    gap: 6,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 4,
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  rowName: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  rowDue: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
})
