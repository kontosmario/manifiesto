import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { SwipeableRow, type SwipeAction } from '@/components/ui/swipeable-row'
import { FijoTrendSpark } from '@/components/fijos/fijo-trend-spark'
import { ConfettiBurst } from '@/components/ui/confetti-burst'
import { pickIconForFixedExpenseCategory } from '@/features/gastos/category-icons'
import type { FijoItem } from '@/features/fijos/fijos-aggregates.model'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface FijoRowProps {
  item: FijoItem
  categoryColor: string
  categoryName: string
  /** Current UTC day-of-month, passed from the parent so every row shares
   *  the same value and we don't create a Date per row per render. */
  todayDay: number
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  /** Toggle true while a delete/edit mutation is in flight for this item. */
  isPending?: boolean
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
  todayDay,
  onMarkPaid,
  onEdit,
  onDelete,
  isPending = false,
}: FijoRowProps) {
  const { theme } = useAppTheme()
  const [open, setOpen] = useState(false)
  const emoji = pickIconForFixedExpenseCategory(categoryName)
  const status = item.computedStatus

  // ── Local celebration on status flip → 'paid' ──────────────────
  // Capture the row's initial status on mount via a ref. The pulse
  // only fires if the row transitions INTO 'paid' DURING its
  // lifetime — rows that were already paid when the user first
  // landed on the screen render quietly (no confetti on cold open).
  // ConfettiBurst de-dupes by lastTokenRef so any re-render with the
  // same pulseToken=1 is a no-op.
  const initialStatusRef = useRef(status)
  const confettiPulse =
    status === 'paid' && initialStatusRef.current !== 'paid' ? 1 : 0
  const statusLabel =
    status === 'paid' ? 'Pagado' : status === 'overdue' ? 'Vencido' : 'Pendiente'
  const statusColor =
    status === 'paid' ? '#297811' : status === 'overdue' ? '#973511' : '#973511'
  const statusBg =
    status === 'paid' ? '#EAFBE4' : status === 'overdue' ? '#F8D1C3' : '#FCEAE3'

  const diffDays = item.dayOfMonth - todayDay
  const dueLabel =
    status === 'paid'
      ? `Pagó día ${item.dayOfMonth}`
      : diffDays < 0
        ? `Vencido hace ${Math.abs(diffDays)}d`
        : diffDays === 0
          ? 'Vence hoy'
          : `Vence en ${diffDays}d`

  // Swipe reveals only "Eliminar". Edit + Registrar pago live inside
  // the tap-to-expand details panel.
  const actions: SwipeAction[] = []
  if (onDelete) {
    actions.push({
      label: 'Eliminar',
      tone: 'danger',
      icon: 'delete',
      onPress: () => onDelete(item.id),
    })
  }

  return (
    <SwipeableRow
      accessibilityHint="Desliza para editar o eliminar"
      rightActions={actions}
      isProcessing={isPending}
    >
      <Animated.View layout={LinearTransition.duration(240)}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.creamCard,
              shadowColor: '#12211A',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: open ? 0.18 : 0,
              shadowRadius: 10,
              elevation: open ? 4 : 0,
              // Allow confetti particles to render outside the card
              // bounds without being clipped (default `overflow:
              // hidden` on rounded cards would chop the burst).
              overflow: 'visible',
            },
          ]}
        >
          {/*
            Confetti for this specific row. Triggered by the status
            flip → 'paid'. originY=0 puts the burst at the top of the
            card; particles spread outward and downward over the row.
            Inert (renders null) until the first pulse arrives.
          */}
          <ConfettiBurst pulseToken={confettiPulse} originY={0} />
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
              {/* Zombie badge removed — auditing moved to the family-transparent
                  audit flow in the Asistente. Cards no longer flag zombies inline. */}
            </View>

            <View style={styles.body}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.trendDeltaPct != null && Math.abs(item.trendDeltaPct) >= 1 ? (
                  <TrendBadge deltaPct={item.trendDeltaPct} />
                ) : null}
              </View>
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
              {item.priceHistory.length >= 2 ? (
                <FijoTrendSpark points={item.priceHistory} />
              ) : null}
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

function TrendBadge({ deltaPct }: { deltaPct: number }) {
  const up = deltaPct > 0
  const bg = up ? 'rgba(242,167,140,0.18)' : 'rgba(166,239,143,0.16)'
  const fg = up ? '#B84014' : '#297811'
  return (
    <View style={[styles.trendBadge, { backgroundColor: bg }]}>
      <Text style={[styles.trendBadgeText, { color: fg }]}>
        {up ? '+' : ''}
        {deltaPct}%
      </Text>
    </View>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  trendBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  trendBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  statusChip: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '700' },
  metaDot: { fontSize: 11 },
  metaText: { fontSize: 11, flexShrink: 1 },
  amountBlock: { alignItems: 'flex-end', gap: 2 },
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
