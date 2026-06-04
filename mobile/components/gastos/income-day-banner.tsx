import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
import { LinearGradient } from 'expo-linear-gradient'
import { motionDurations } from '@/lib/motion/tokens'
import { triggerHaptic } from '@/lib/haptics'
import { withAlpha } from '@/theme/color-utils'
import { useAppTheme } from '@/theme/theme-provider'
import type { IncomeEvent } from '@/features/income/use-income-events'

interface Props {
  incomes: readonly IncomeEvent[]
  onDeleteIncome?: (id: string) => void
}

const KIND_LABEL: Record<IncomeEvent['kind'], string> = {
  transfer: 'Transferencia',
  bonus: 'Bono',
  gift: 'Regalo',
  other: 'Ingreso',
}

const KIND_ICON: Record<IncomeEvent['kind'], keyof typeof MaterialIcons.glyphMap> = {
  transfer: 'swap-horiz',
  bonus: 'workspace-premium',
  gift: 'card-giftcard',
  other: 'attach-money',
}

const EASE_IOS = Easing.bezier(0.32, 0.72, 0, 1)

/**
 * Per-day income strip. Renders inside the Gastos SectionList header,
 * BELOW the date / count / total row. Pulls income out of the inline
 * expense rows so the chronological list of "what I spent today"
 * stays pure expenses; income gets its own visually distinct treatment.
 *
 * Visual language:
 * - Horizontal strip with rounded full pill on the LEFT (icon +
 *   "Recibí $X") and a subtle gradient bg tinted with the brand
 *   primary at low alpha. NOT a card — reads as a "banner" floating
 *   under the day header.
 * - Tap expands the strip into a vertical list of the day's individual
 *   incomes (each with kind icon + description + amount). Caret rotates.
 * - For days with a single income, expanded view collapses to one
 *   row; the strip's compact label already conveys most of the info,
 *   so expansion is a "see who/where" detail.
 *
 * Why a banner, not a regular row:
 * - The user explicitly asked for income to be DIFFERENT inside Gastos.
 * - Mixing inline made the daily expense list feel ambiguous ("which
 *   ones counted toward today's spend?").
 * - Banner above the rows = "context for today's day", expenses
 *   below = "what you spent". Crisp mental separation.
 */
export function IncomeDayBanner({ incomes, onDeleteIncome }: Props) {
  const { theme } = useAppTheme()
  const [expanded, setExpanded] = useState(false)
  const chevronRotation = useSharedValue(0)
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
  }))

  if (incomes.length === 0) return null

  const total = incomes.reduce((sum, i) => sum + Math.abs(Number(i.amount ?? 0)), 0)
  const compactLabel =
    incomes.length === 1
      ? incomes[0]!.description?.trim() || KIND_LABEL[incomes[0]!.kind]
      : `${incomes.length} ingresos`

  const handleToggle = () => {
    void triggerHaptic('selection')
    const next = !expanded
    chevronRotation.value = withTiming(next ? 1 : 0, {
      duration: motionDurations.quick,
      easing: EASE_IOS,
    })
    setExpanded(next)
  }

  const gradientColors = theme.isDark
    ? ([
        withAlpha(theme.colors.primary, 0.18),
        withAlpha(theme.colors.primary, 0.06),
      ] as const)
    : ([
        withAlpha(theme.colors.primary, 0.12),
        withAlpha(theme.colors.primary, 0.04),
      ] as const)

  const borderColor = withAlpha(theme.colors.primary, theme.isDark ? 0.35 : 0.22)

  return (
    <Animated.View
      layout={LinearTransition.duration(motionDurations.standard).easing(EASE_IOS)}
      style={[styles.shell, { borderColor }]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFillObject}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${incomes.length} ingreso${incomes.length === 1 ? '' : 's'} hoy, ${expanded ? 'colapsar' : 'expandir'}`}
        onPress={handleToggle}
        style={styles.headerRow}
      >
        <View
          style={[
            styles.iconBadge,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <MaterialIcons
            name="trending-up"
            size={16}
            color={theme.isDark ? '#0E1B14' : '#FFFFFF'}
          />
        </View>
        <View style={styles.headerTextCol}>
          <Text
            style={[styles.headerLabel, { color: theme.colors.primary }]}
            numberOfLines={1}
          >
            Recibí ${formatThousands(total)}
          </Text>
          <Text
            style={[styles.headerSub, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {compactLabel}
          </Text>
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
          entering={FadeIn.duration(motionDurations.quick).easing(EASE_IOS)}
          exiting={FadeOut.duration(motionDurations.micro).easing(EASE_IOS)}
          style={[
            styles.list,
            { borderTopColor: withAlpha(theme.colors.primary, 0.2) },
          ]}
        >
          {incomes.map((income, idx) => (
            <IncomeRow
              key={income.id}
              income={income}
              isLast={idx === incomes.length - 1}
              onDelete={onDeleteIncome}
            />
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

interface IncomeRowProps {
  income: IncomeEvent
  isLast: boolean
  onDelete?: (id: string) => void
}

function IncomeRow({ income, isLast, onDelete }: IncomeRowProps) {
  const { theme } = useAppTheme()
  const description =
    income.description?.trim() || KIND_LABEL[income.kind]
  return (
    <View
      style={[
        styles.itemRow,
        !isLast
          ? { borderBottomColor: withAlpha(theme.colors.primary, 0.12) }
          : null,
      ]}
    >
      <MaterialIcons
        name={KIND_ICON[income.kind]}
        size={14}
        color={theme.colors.primary}
      />
      <View style={styles.itemCol}>
        <Text style={[styles.itemLabel, { color: theme.colors.text }]} numberOfLines={1}>
          {description}
        </Text>
        <Text style={[styles.itemMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {KIND_LABEL[income.kind]}
        </Text>
      </View>
      <Text style={[styles.itemAmount, { color: theme.colors.primary }]} numberOfLines={1}>
        +${formatThousands(Math.abs(Number(income.amount ?? 0)))}
      </Text>
      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar ingreso"
          onPress={() => {
            void triggerHaptic('warning')
            onDelete(income.id)
          }}
          hitSlop={8}
          style={styles.deleteBtn}
        >
          <MaterialIcons
            name="close"
            size={14}
            color={theme.colors.textMuted}
          />
        </Pressable>
      ) : null}
    </View>
  )
}

function formatThousands(n: number): string {
  const fixed = Math.abs(n).toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return decPart === '00' ? withDots : `${withDots},${decPart}`
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: {
    flex: 1,
    gap: 1,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  list: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemCol: { flex: 1, gap: 1 },
  itemLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  itemMeta: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  itemAmount: {
    fontSize: 13,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  deleteBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
})
