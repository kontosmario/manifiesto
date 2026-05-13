import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { formatMoney } from '@/utils/money'
import { triggerHaptic } from '@/lib/haptics'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { buildProximosPalette } from './proximos-colors'
import type { FijoItem } from './fijo-list-sample'

interface RowDayMarkerProps {
  item: FijoItem
  /** When true (default), the row is tap-expandable to reveal action
   *  buttons (registrar pago / editar / eliminar). When false the row
   *  is read-only (used in Próximos section where we don't want
   *  actions). */
  withActions?: boolean
  /** Optional handlers for action buttons. When omitted, buttons render
   *  decoratively (preview mode). */
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  /** When true, hides actions (e.g. while a mutation is in flight). */
  isPending?: boolean
}

/**
 * Variant D · Calendar day marker. Cada row tiene un "día del mes"
 * visual a la izquierda — círculo o cuadradito con el número del día
 * que paga el fijo (e.g. "5" para Alquiler que paga el 5). El usuario
 * mapea cuándo se paga sin leer el dueLabel.
 *
 * El día se tinta según status:
 *   paid    → success ring + check chico abajo
 *   overdue → urgency-strong fill + warning
 *   pending → cat color outline + day number
 *
 * El día está en CAJA cuadrada estilo "ticket/agenda".
 */
export function RowDayMarker({
  item,
  withActions = true,
  onMarkPaid,
  onEdit,
  onDelete,
  isPending = false,
}: RowDayMarkerProps) {
  const { theme } = useAppTheme()
  const palette = buildProximosPalette(theme)
  const press = usePressScale({ pressedScale: 0.98 })
  const [expanded, setExpanded] = useState(false)

  const isPaid = item.status === 'paid'
  const isOverdue = item.status === 'overdue'

  const handleTap = useCallback(() => {
    if (!withActions) return
    void triggerHaptic('selection')
    setExpanded((v) => !v)
  }, [withActions])

  const dayBoxStyle = isOverdue
    ? {
        backgroundColor: palette.urgencyStrong,
        borderColor: palette.urgencyStrong,
        textColor: theme.isDark ? '#0F2E1F' : '#FFFBF2',
      }
    : isPaid
    ? {
        backgroundColor: 'transparent',
        borderColor: palette.success,
        textColor: palette.success,
      }
    : {
        backgroundColor: 'transparent',
        borderColor: item.categoryColor,
        textColor: theme.colors.text,
      }

  const label =
    item.status === 'paid'
      ? `Pagado · ${item.category}`
      : item.status === 'overdue'
      ? `Vencido hace ${Math.abs(item.daysUntil)} días`
      : item.daysUntil === 0
      ? `Vence HOY · ${item.category}`
      : item.daysUntil === 1
      ? `Vence MAÑANA · ${item.category}`
      : `En ${item.daysUntil} días · ${item.category}`

  return (
    <Animated.View layout={LinearTransition.duration(240)}>
      <Pressable
        onPress={handleTap}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${item.name}, día ${item.dayOfMonth}, ${label}, ${formatMoney(item.amount)}${withActions ? ', tocá para acciones' : ''}`}
      >
        <Animated.View
          style={[
            styles.row,
            press.animatedStyle,
            isPaid && !expanded ? { opacity: 0.6 } : null,
          ]}
        >
        <View
          style={[
            styles.dayBox,
            {
              backgroundColor: dayBoxStyle.backgroundColor,
              borderColor: dayBoxStyle.borderColor,
            },
          ]}
        >
          <Text style={[styles.dayNum, { color: dayBoxStyle.textColor }]}>
            {item.dayOfMonth}
          </Text>
          {isPaid ? (
            <MaterialIcons
              name="check"
              size={9}
              color={palette.success}
              style={styles.dayCheck}
            />
          ) : null}
        </View>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.hikeDeltaPct ? (
              <View
                style={[
                  styles.hikeBadge,
                  {
                    borderColor: palette.urgencyBadgeBorder,
                    backgroundColor: palette.urgencyBadgeBg,
                  },
                ]}
              >
                <Text style={[styles.hikeText, { color: palette.urgency }]}>
                  ↑{item.hikeDeltaPct}%
                </Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[
              styles.label,
              {
                color: isOverdue
                  ? palette.urgencyStrong
                  : item.daysUntil <= 1 && !isPaid
                  ? palette.urgency
                  : theme.colors.textMuted,
              },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
          <Text style={[styles.amount, { color: theme.colors.text }]}>
            {formatMoney(item.amount)}
          </Text>
          {withActions ? (
            <MaterialIcons
              name={expanded ? 'expand-less' : 'expand-more'}
              size={18}
              color={theme.colors.textMuted}
              style={styles.chevron}
            />
          ) : null}
        </Animated.View>
      </Pressable>

      {/* Action panel — tap-to-expand. Replaces the destructive swipe of
          the old FijoRow. Mark paid (primary, only if pending) + Editar
          + Eliminar. Handlers wired via props para producción; en preview
          quedan no-op (decorativos). */}
      {expanded && withActions ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(140)}
          style={[
            styles.actionsRow,
            { borderTopColor: theme.colors.line },
          ]}
        >
          {!isPaid ? (
            <ActionButton
              icon="check"
              label={isPending ? 'Pagando…' : 'Pagar'}
              primary
              palette={palette}
              theme={theme}
              disabled={isPending}
              onPress={() => onMarkPaid?.(item.id)}
            />
          ) : null}
          <ActionButton
            icon="edit"
            label="Editar"
            palette={palette}
            theme={theme}
            disabled={isPending}
            onPress={() => onEdit?.(item.id)}
          />
          <ActionButton
            icon="delete-outline"
            label="Eliminar"
            destructive
            palette={palette}
            theme={theme}
            disabled={isPending}
            onPress={() => onDelete?.(item.id)}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

function ActionButton({
  icon,
  label,
  primary,
  destructive,
  disabled,
  onPress,
  palette,
  theme,
}: {
  icon: 'check' | 'edit' | 'delete-outline'
  label: string
  primary?: boolean
  destructive?: boolean
  disabled?: boolean
  onPress?: () => void
  palette: ReturnType<typeof buildProximosPalette>
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  const press = usePressScale({ pressedScale: 0.96 })
  const bg = primary
    ? palette.success
    : destructive
    ? palette.urgencyBadgeBg
    : 'transparent'
  const border = primary
    ? palette.success
    : destructive
    ? palette.urgencyBadgeBorder
    : theme.colors.line
  const fg = primary
    ? theme.isDark
      ? '#0F2E1F'
      : '#FFFBF2'
    : destructive
    ? palette.urgency
    : theme.colors.text
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={styles.actionBtnWrap}
    >
      <Animated.View
        style={[
          styles.actionBtn,
          { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : 1 },
          press.animatedStyle,
        ]}
      >
        <MaterialIcons name={icon} size={14} color={fg} />
        <Text style={[styles.actionLabel, { color: fg }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  dayBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayNum: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  dayCheck: {
    position: 'absolute',
    bottom: 1,
    right: 2,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  hikeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  hikeText: {
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
  amount: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    marginLeft: 2,
    opacity: 0.6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 10,
    paddingBottom: 8,
    paddingLeft: 48,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  actionBtnWrap: {
    flex: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
})
