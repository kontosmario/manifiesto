import { useMemo, type ComponentProps } from 'react'
import { Pressable, StyleSheet, Switch, View, type ViewStyle } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { AppSymbol } from '@/components/ui/app-symbol'
import { NeoSurface } from '@/components/ui/neo-surface'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { triggerHaptic } from '@/lib/haptics'
import { DEFAULT_HIT_SLOP, DEFAULT_PRESS_RETENTION_OFFSET } from '@/theme/interaction'
import { useThemeTokens } from '@/theme/theme-provider'
import { neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'

/**
 * Primitivas sueltas de Ajustes (las consumen `household-setup` y
 * `notifications-preferences`), en material neumórfico desde 2026-08-05.
 *
 * Antes eran V1: `borderWidth: 1` + `surfaceMuted` y un tile de ícono con
 * hairline. Traducción al vocabulario del handoff:
 *  · HeroStat  → pozo `insetSm` (dato hundido, no card flotante)
 *  · fila      → `NeoSurface raisedLg` suelta (no van dentro de un grupo)
 *  · ícono     → sub-tile `raisedSm` radio `chip`
 */

/** Ver el mismo razonamiento en `settings-grouped-list`. */
function useFlatFallback(): ViewStyle | null {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  return useMemo(
    () => (SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: neo.sheetDivider }),
    [neo],
  )
}

export function HeroStat({
  compact = false,
  label,
  value,
}: {
  compact?: boolean
  label: string
  value: string
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const flatFallback = useFlatFallback()

  return (
    <NeoSurface
      backgroundColor={neo.well}
      radius={neoRadii.tile}
      style={[styles.heroStat, compact ? styles.heroStatCompact : null, flatFallback]}
      variant="insetSm"
    >
      <Text style={[styles.heroStatLabel, { color: neo.textMuted }]}>{label}</Text>
      {/* El valor es un dato (monto, "20% · $ 300.000"): en un tile a media
          columna no entra a 14px y cortarlo lo vuelve ilegible. Encoge antes
          de recortar. */}
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        numberOfLines={1}
        style={[styles.heroStatValue, { color: neo.text }]}
      >
        {value}
      </Text>
    </NeoSurface>
  )
}

export function SettingsRow({
  iconFallback,
  iconName,
  isLoading = false,
  onPress,
  subtitle,
  title,
  value,
}: {
  iconFallback: ComponentProps<typeof AppSymbol>['fallback']
  iconName: string
  isLoading?: boolean
  onPress: () => void
  subtitle: string
  title: string
  value: string
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const flatFallback = useFlatFallback()

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
      style={({ pressed }) => [{ opacity: pressed ? 0.94 : 1 }]}
    >
      <NeoSurface radius={neoRadii.card} style={[styles.row, flatFallback]} variant="raisedLg">
        <NeoSurface
          radius={neoRadii.chip}
          style={[styles.rowIconWrap, flatFallback]}
          variant="raisedSm"
        >
          <AppSymbol color={neo.text} fallback={iconFallback} name={iconName} size={18} />
        </NeoSurface>

        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, { color: neo.text }]}>{title}</Text>
          <Text style={[styles.rowSubtitle, { color: neo.textMuted }]}>{subtitle}</Text>
        </View>

        <View style={styles.rowTrailing}>
          <Text numberOfLines={1} style={[styles.rowValue, { color: neo.text }]}>
            {isLoading ? '...' : value}
          </Text>
          <AppSymbol
            color={neo.textMuted}
            fallback="chevron-right"
            name="chevron.right"
            size={14}
          />
        </View>
      </NeoSurface>
    </Pressable>
  )
}

export function SettingsSwitchRow({
  description,
  label,
  onValueChange,
  value,
}: {
  description: string
  label: string
  onValueChange: (value: boolean) => void
  value: boolean
}) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const flatFallback = useFlatFallback()
  const trackOff = neo.sheetHandle
  const toggleValue = (nextValue: boolean) => {
    void triggerHaptic('selection')
    onValueChange(nextValue)
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={DEFAULT_HIT_SLOP}
      onPress={() => {
        toggleValue(!value)
      }}
      pressRetentionOffset={DEFAULT_PRESS_RETENTION_OFFSET}
    >
      <NeoSurface radius={neoRadii.card} style={[styles.switchRow, flatFallback]} variant="raisedLg">
        <View style={styles.switchRowCopy}>
          <Text style={[styles.switchRowTitle, { color: neo.text }]}>{label}</Text>
          <Text style={[styles.switchRowDescription, { color: neo.textMuted }]}>{description}</Text>
        </View>
        <Switch
          ios_backgroundColor={trackOff}
          onValueChange={toggleValue}
          thumbColor="#FFFFFF"
          trackColor={{ false: trackOff, true: neo.green }}
          value={value}
        />
      </NeoSurface>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  heroStat: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  // 46 y no 48: el `gap` de la fila se SUMA al basis, así que a 48% el segundo
  // tile ya no entra en la línea y cada uno terminaba solo en su renglón, a
  // media pantalla. Con 46% + grow entran de a dos y llenan el ancho.
  heroStatCompact: {
    flexBasis: '46%',
    flexGrow: 1,
  },
  heroStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroStatValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    maxWidth: '52%',
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    flexShrink: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  switchRowCopy: {
    flex: 1,
    gap: 3,
  },
  switchRowTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
  },
  switchRowDescription: {
    fontSize: 13,
    fontFamily: nunitoFamily('600'),
    lineHeight: 18,
  },
})
