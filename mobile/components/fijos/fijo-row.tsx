import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { pickIconForCategory } from '@/features/gastos/category-icons'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface FijoRowProps {
  item: FijoItem
  categoryColor: string
  categoryName: string
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

/**
 * Row for a single recurring/fijo item. Tap to expand a details panel
 * with frequency + method + category + primary actions (mark paid,
 * edit, pause). Swipe → Editar/Eliminar matching the activity row.
 */
export function FijoRow({
  item,
  categoryColor,
  categoryName,
  onMarkPaid,
  onEdit,
  onDelete,
}: FijoRowProps) {
  const { theme } = useAppTheme()
  const [open, setOpen] = useState(false)
  const emoji = pickIconForCategory(categoryName)
  const status = item.computedStatus
  const statusLabel =
    status === 'paid' ? 'Pagado' : status === 'overdue' ? 'Vencido' : 'Pendiente'
  const statusColor =
    status === 'paid' ? '#2E7D5B' : status === 'overdue' ? '#C03A2A' : '#A3452A'
  const statusBg =
    status === 'paid' ? '#DDEFE3' : status === 'overdue' ? '#F5C6B6' : '#FADFC8'

  const todayDay = new Date().getUTCDate()
  const diffDays = item.dayOfMonth - todayDay
  const dueLabel =
    status === 'paid'
      ? `Pagó día ${item.dayOfMonth}`
      : diffDays < 0
        ? `Vencido hace ${Math.abs(diffDays)}d`
        : diffDays === 0
          ? 'Vence hoy'
          : `Vence en ${diffDays}d`

  const actions: SwipeAction[] = []
  if (onEdit) actions.push({ label: 'Editar', tone: 'neutral', onPress: () => onEdit(item.id) })
  if (onDelete) actions.push({ label: 'Eliminar', tone: 'danger', onPress: () => onDelete(item.id) })

  return (
    <SwipeableRow accessibilityHint="Desliza para editar o eliminar" rightActions={actions}>
      <Animated.View layout={LinearTransition.duration(240)}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.creamCard,
              boxShadow: open ? '0px 8px 20px -8px rgba(15,42,30,0.2)' : undefined,
            },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <View
                style={[
                  styles.iconTile,
                  {
                    backgroundColor: hexAlpha(categoryColor, 0.14),
                    borderColor: hexAlpha(categoryColor, 0.22),
                  },
                ]}
              >
                <Text style={styles.iconText}>{emoji}</Text>
              </View>
              {item.isZombie ? (
                <View style={styles.zombieBadge}>
                  <Text style={styles.zombieBadgeText}>🧟</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.body}>
              <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.metaRow}>
                <View style={[styles.statusChip, { backgroundColor: statusBg }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                </View>
                <Text style={[styles.metaDot, { color: theme.colors.textMuted }]}>·</Text>
                <Text
                  style={[styles.metaText, { color: theme.colors.textMuted }]}
                  numberOfLines={1}
                >
                  {dueLabel}
                </Text>
              </View>
            </View>

            <View style={styles.amountBlock}>
              <Text style={[styles.amount, { color: theme.colors.text }]}>
                {formatMoney(item.amount)}
              </Text>
            </View>
          </View>

          {open ? (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(140)}
              style={[styles.detailBlock, { borderTopColor: theme.colors.line }]}
            >
              <View style={styles.detailGrid}>
                <DetailTile
                  label="FRECUENCIA"
                  value={frequencyLabel(item.frequency)}
                  theme={theme}
                />
                <DetailTile label="KIND" value={kindLabel(item.kind)} theme={theme} />
                <DetailTile
                  label="PRÓX. VENCIMIENTO"
                  value={`día ${item.dayOfMonth}`}
                  theme={theme}
                />
                <DetailTile label="CATEGORÍA" value={categoryName} theme={theme} />
              </View>
              <View style={styles.actionsRow}>
                {status !== 'paid' && onMarkPaid ? (
                  <Pressable
                    onPress={() => onMarkPaid(item.id)}
                    style={[styles.actionPrimary, { backgroundColor: theme.colors.text }]}
                    accessibilityRole="button"
                    accessibilityLabel="Registrar pago"
                  >
                    <Text style={[styles.actionPrimaryText, { color: theme.colors.creamCard }]}>
                      ✓ Registrar pago
                    </Text>
                  </Pressable>
                ) : null}
                {onEdit ? (
                  <Pressable
                    onPress={() => onEdit(item.id)}
                    style={[
                      styles.actionSecondary,
                      { backgroundColor: theme.colors.pageBg, borderColor: theme.colors.line },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Editar fijo"
                  >
                    <Text
                      style={[styles.actionSecondaryText, { color: theme.colors.text }]}
                    >
                      Editar
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </Animated.View>
          ) : null}
        </Pressable>
      </Animated.View>
    </SwipeableRow>
  )
}

function DetailTile({
  label,
  value,
  theme,
}: {
  label: string
  value: string
  theme: ReturnType<typeof useAppTheme>['theme']
}) {
  return (
    <View style={styles.detailTile}>
      <Text style={[styles.detailLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function frequencyLabel(f: string): string {
  switch (f) {
    case 'weekly':
      return 'Semanal'
    case 'biweekly':
      return 'Quincenal'
    case 'monthly':
      return 'Mensual'
    case 'quarterly':
      return 'Trimestral'
    case 'semiannual':
      return 'Semestral'
    case 'annual':
      return 'Anual'
    default:
      return f
  }
}

function kindLabel(k: string): string {
  switch (k) {
    case 'periodic':
      return 'Periódico'
    case 'installment':
      return 'Cuotas'
    case 'debt':
      return 'Deuda'
    default:
      return 'Recurrente'
  }
}

function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { position: 'relative' },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconText: { fontSize: 18 },
  zombieBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C9A6E0',
    borderWidth: 2,
    borderColor: '#FFFBF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zombieBadgeText: { fontSize: 8 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  statusChip: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '700' },
  metaDot: { fontSize: 11 },
  metaText: { fontSize: 11, flexShrink: 1 },
  amountBlock: { alignItems: 'flex-end' },
  amount: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  detailBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  detailTile: { flexBasis: '47%', flexGrow: 1 },
  detailLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  detailValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  actionPrimary: {
    flex: 2,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimaryText: { fontSize: 13, fontWeight: '700' },
  actionSecondary: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionSecondaryText: { fontSize: 13, fontWeight: '700' },
})
