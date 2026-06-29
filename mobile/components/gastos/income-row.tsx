import { memo, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { WhoPaidAvatar } from '@/components/home/who-paid-avatar'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { CategorySticker } from '@/components/category/category-sticker'
import { resolveCategoryHueByName } from '@/theme/category-hues'
import { formatMoney } from '@/utils/money'
import { useThemeTokens } from '@/theme/theme-provider'
import type { IncomeEventKind } from '@/features/income/use-income-events'
import { INCOME_KIND_BY_KEY } from '@/features/income/income-kinds'

export interface IncomeRowProps {
  title?: string
  kind: IncomeEventKind
  whoName?: string
  whoColor?: string
  amount?: number
  time?: string
}

// Sticker / emoji / label por tipo de ingreso → catálogo central
// `income-kinds.ts` (cubre los 11 kinds). Si la key faltara en el registry,
// el render cae al emoji.

/**
 * Movement row for income events — mirrors `GastoRow`'s chrome exactly
 * so income and expense sit on the same surface inside the Gastos
 * SectionList. The previous treatment (gradient banner above the day
 * with collapsible expansion) read as a "notice", not as a row. The
 * user pushed back: "es dos polos opuestos con el resto".
 *
 * Differentiation lives in COLOR and PILL TEXT, not in shape:
 *   - Icon tile tinted with `theme.colors.primary` (instead of the
 *     expense's category color).
 *   - Emoji per income kind (💸 transfer, ⭐ bono, 🎁 regalo, 💵 otro).
 *   - "Transferencia / Bono / Regalo / Ingreso" pill where the expense
 *     row carries the category name pill.
 *   - Amount in `theme.colors.primary` with a "+" prefix instead of
 *     the expense's "-" in `theme.colors.text`.
 *
 * The chrome stays identical: same radius, padding, gap, fontSize,
 * weight, tabular-nums on the amount. Same left-only-rounded corners
 * so the row visually slots into the same SwipeRow-shaped column the
 * expenses do (income is read-only — no SwipeRow wrap — but the corner
 * shape keeps the list rhythm coherent).
 */
function IncomeRowImpl({
  title = '',
  kind,
  whoName = '',
  whoColor = '#329315',
  amount = 0,
  time,
}: IncomeRowProps) {
  const theme = useThemeTokens()
  const { t } = useTranslation()
  const meta = INCOME_KIND_BY_KEY[kind]
  const emoji = meta.emoji
  const pillLabel = t(meta.labelKey)
  const accent = theme.colors.primary

  // Same memoization shape as GastoRow so the row stays cheap during
  // SectionList recycle. Theme-stable values — only re-runs on theme
  // swap.
  const tile = useMemo(
    () => ({
      bg: hexAlpha(accent, theme.isDark ? 0.18 : 0.14),
      border: hexAlpha(accent, theme.isDark ? 0.38 : 0.28),
    }),
    [accent, theme.isDark],
  )
  const iconTileStyle = useMemo(
    () => [styles.iconTile, { backgroundColor: tile.bg, borderColor: tile.border }],
    [tile.bg, tile.border],
  )
  const kindPillStyle = useMemo(
    () => [styles.catChip, { backgroundColor: tile.bg, borderColor: tile.border }],
    [tile.bg, tile.border],
  )

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.isDark
            ? theme.colors.surfaceMuted
            : theme.colors.creamCard,
        },
      ]}
    >
      <View style={styles.iconWrap}>
        <View style={iconTileStyle}>
          {CATEGORY_ICONS[meta.icon] ? (
            <CategorySticker
              source={CATEGORY_ICONS[meta.icon]}
              size={24}
              plateColor={resolveCategoryHueByName(kind).light.surface}
            />
          ) : (
            <Text style={styles.iconText}>{emoji}</Text>
          )}
        </View>
        <WhoPaidAvatar name={whoName} color={whoColor} size={16} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.subRow}>
          <View style={kindPillStyle}>
            <Text
              style={[styles.catChipText, { color: accent }]}
              numberOfLines={1}
            >
              {pillLabel}
            </Text>
          </View>
          <Text style={[styles.subMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
            · {whoName}
            {time ? ` · ${time}` : null}
          </Text>
        </View>
      </View>
      <View style={styles.amountBlock}>
        <Text style={[styles.amount, { color: accent }]}>
          +{formatMoney(Math.abs(amount))}
        </Text>
      </View>
    </View>
  )
}

function hexAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6 && normalized.length !== 3) return hex
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
  // 1:1 with GastoRow so the rows align pixel-perfect in the
  // SectionList. Any visual drift between the two would re-introduce
  // the "two polos" feeling the user just flagged.
  row: {
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: { position: 'relative' },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconText: { fontSize: 18 },
  body: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  catChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  catChipText: { fontSize: 10, fontWeight: '700' },
  subMeta: { fontSize: 11, flexShrink: 1 },
  amountBlock: { alignItems: 'flex-end' },
  // Same tabular nums as GastoRow.amount so the amount column aligns
  // vertically across mixed expense + income rows.
  amount: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
})

export const IncomeRow = memo(IncomeRowImpl)
