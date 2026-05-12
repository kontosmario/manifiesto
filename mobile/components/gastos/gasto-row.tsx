import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { WhoPaidAvatar } from '@/components/home/who-paid-avatar'
import { pickIconForCategory } from '@/features/gastos/category-icons'
import { darkenForLightBg, lightenForDarkBg } from '@/utils/category-color'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

export interface GastoRowProps {
  title: string
  categoryName: string
  categoryColor: string
  whoName: string
  whoColor: string
  amount: number // always negative here (expense)
  time?: string // HH:MM
  /** Optional free-form note attached to the expense. Rendered as a
   *  third line below the category chip, truncated to a single line
   *  with an italic muted style so it reads as "context" without
   *  competing with the title. `null` / undefined / "" → not rendered. */
  notes?: string | null
}

/**
 * Movement row — shown inside day groups on Gastos. Same structure as
 * the Home ActivityRowV2 but with a colored category chip on the
 * subtitle line and the category color tinted into the icon tile.
 */
export function GastoRow({
  title,
  categoryName,
  categoryColor,
  whoName,
  whoColor,
  amount,
  time,
  notes,
}: GastoRowProps) {
  const { theme } = useAppTheme()
  const icon = pickIconForCategory(categoryName)
  const trimmedNotes = typeof notes === 'string' ? notes.trim() : ''
  // catChipText hue-preserved en ambos modos. Antes el pastel original
  // sobre los chip backgrounds fallaba WCAG:
  //   - light: pastel (L=55-77) sobre near-white tinted (L=0.91) → 1.6:1 ❌
  //   - dark: pastel sobre olive-tinted dark (L=0.13) → 3.3-4.5:1 marginal
  //
  // Fix con dos utils hue-preserved que mantienen la gama original:
  //   - light: `darkenForLightBg` baja L a 22% → ≥6:1 sobre chip bg light
  //   - dark: `lightenForDarkBg` sube L a 88% → ≥5:1 sobre chip bg dark
  // Cada categoría conserva su HUE (azul, verde, amarillo, rosa, etc.),
  // solo se ajusta la lightness al modo. Identidad visual preservada.
  const catChipTextColor = useMemo(
    () =>
      theme.isDark
        ? lightenForDarkBg(categoryColor)
        : darkenForLightBg(categoryColor),
    [categoryColor, theme.isDark],
  )
  return (
    <View style={[styles.row, { backgroundColor: theme.colors.creamCard }]}>
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
          <Text style={styles.iconText}>{icon}</Text>
        </View>
        <WhoPaidAvatar name={whoName} color={whoColor} size={16} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.subRow}>
          <View
            style={[
              styles.catChip,
              {
                backgroundColor: hexAlpha(categoryColor, 0.14),
                borderColor: hexAlpha(categoryColor, 0.22),
              },
            ]}
          >
            <Text style={[styles.catChipText, { color: catChipTextColor }]} numberOfLines={1}>
              {categoryName}
            </Text>
          </View>
          <Text style={[styles.subMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
            · {whoName}
            {time ? ` · ${time}` : null}
          </Text>
        </View>
        {trimmedNotes ? (
          <Text
            style={[styles.notes, { color: theme.colors.textSoft }]}
            numberOfLines={1}
          >
            “{trimmedNotes}”
          </Text>
        ) : null}
      </View>
      <View style={styles.amountBlock}>
        <Text style={[styles.amount, { color: theme.colors.text }]}>
          -{formatMoney(Math.abs(amount))}
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
  catChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, flexShrink: 0 },
  catChipText: { fontSize: 10, fontWeight: '700' },
  subMeta: { fontSize: 11, flexShrink: 1 },
  notes: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 3,
    lineHeight: 14,
  },
  amountBlock: { alignItems: 'flex-end' },
  // Tabular nums para que la columna right-aligned de montos alinee
  // verticalmente entre rows sin wobble por anchos de glifo
  // proporcionales (1 vs 8 ocupan distintos pixels en defaults).
  amount: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
})
