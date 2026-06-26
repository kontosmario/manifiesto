// Contextual advisor chip for the Gastos screen. Lives between the
// smart filter and the movements list so the user sees the advisor
// finding right where they're looking at category-level data.
//
// Two scenarios:
//   1. The user has filtered by a specific category that has a
//      `cap-breach` or `cat-accel` signal → chip surfaces THAT
//      signal with the category name in the title.
//   2. No filter active → the top category-domain signal is shown
//      regardless (cap-breach, cat-accel, cat-dominance, small-leaks
//      or cat-win, in priority order).

import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { usePressScale } from '@/hooks/use-press-scale'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import type { ControlAdvisorTask } from '@/features/insights/control-v2-mock'

/** Helper para tint suaves del icon-tile sin recurrir a `rgba(...)` hard.
 *  Asume hex `#RRGGBB`. Si no matchea, devuelve el color sin alpha. */
function hexAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const r = parseInt(m[1]!, 16)
  const g = parseInt(m[2]!, 16)
  const b = parseInt(m[3]!, 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface GastosAdvisorChipProps {
  signals: ControlAdvisorTask[]
  selectedCategoryId: string | null
  categoryNameById: Map<string, string>
  onPress?: (signal: ControlAdvisorTask) => void
}

const CATEGORY_DOMAIN_PREFIXES = [
  'cap-',
  'cat-accel',
  'cat-dominance-',
  'small-leaks',
  'cat-win',
] as const

function isCategoryDomain(id: string): boolean {
  return CATEGORY_DOMAIN_PREFIXES.some((prefix) =>
    prefix.endsWith('-') ? id.startsWith(prefix) : id === prefix,
  )
}

export function GastosAdvisorChip({
  signals,
  selectedCategoryId,
  categoryNameById,
  onPress,
}: GastosAdvisorChipProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const press = usePressScale({ pressedScale: 0.97 })
  const chipLayout = useGatedLayout(LinearTransition.duration(220))
  // Gateado: si el chip aparece en el primer attach (sus signals llegan
  // tarde), NO hace FadeIn — entra asentado. El fade solo corre después
  // del gate (cuando cambiás de filtro y aparece otro signal).
  const chipEntering = useGatedLayout(FadeIn.duration(220))

  const target = useMemo<ControlAdvisorTask | null>(() => {
    // Filter to category-domain signals first.
    const domain = signals.filter((s) => isCategoryDomain(s.id))
    if (domain.length === 0) return null

    // If the user filtered by category, prefer signals matching that
    // category's name (cat field).
    if (selectedCategoryId) {
      const targetName = categoryNameById.get(selectedCategoryId) ?? ''
      const match = domain.find((s) => s.cat === targetName)
      if (match) return match
      // Otherwise fall through — no signal for this specific
      // category, but the user may still benefit from seeing the
      // global top one.
    }
    return domain[0]
  }, [signals, selectedCategoryId, categoryNameById])

  // Slot de altura fija: si no hay señal, en vez de `return null` (que hacía
  // crecer el ListHeaderComponent del SectionList virtualizado de 0→52px
  // cuando los signals llegaban tarde → re-medición → "salto" del header)
  // mostramos una afirmación calma con la MISMA estructura/altura. El header
  // nunca cambia de tamaño → no re-mide → no salta (content-jumping).
  if (!target) {
    const calmTone = theme.colors.textMuted
    return (
      <Animated.View entering={chipEntering} layout={chipLayout}>
        <View
          style={[
            styles.row,
            {
              backgroundColor: theme.isDark
                ? theme.colors.surfaceMuted
                : theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
          ]}
        >
          <View
            style={[
              styles.iconTile,
              {
                backgroundColor: hexAlpha(calmTone, 0.12),
                borderColor: hexAlpha(calmTone, 0.24),
              },
            ]}
          >
            <MaterialIcons name="check" size={16} color={calmTone} />
          </View>
          <View style={styles.body}>
            <Text
              style={[styles.title, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {t('gastos:advisorChip.calmTitle')}
            </Text>
            <Text
              style={[styles.impact, { color: theme.colors.textSoft }]}
              numberOfLines={1}
            >
              {t('gastos:advisorChip.calmBody')}
            </Text>
          </View>
        </View>
      </Animated.View>
    )
  }

  const tone =
    target.urgency === 'alta'
      ? theme.colors.danger
      : target.urgency === 'media'
        ? theme.colors.warning
        : theme.colors.textMuted
  const icon: keyof typeof MaterialIcons.glyphMap = target.id.startsWith('cap-')
    ? 'block'
    : target.id === 'cat-accel'
      ? 'trending-up'
      : target.id.startsWith('cat-dominance-')
        ? 'donut-large'
        : target.id === 'small-leaks'
          ? 'water-drop'
          : 'verified'

  return (
    <Animated.View
      entering={chipEntering}
      exiting={FadeOut.duration(160)}
      layout={chipLayout}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('gastos:advisorChip.a11yLabel', { title: target.title })}
        onPress={() => {
          void triggerHaptic('selection')
          onPress?.(target)
        }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Animated.View
          style={[
            styles.row,
            {
              backgroundColor: theme.isDark
                ? theme.colors.surfaceMuted
                : theme.colors.creamCard,
              borderColor: theme.colors.line,
            },
            press.animatedStyle,
          ]}
        >
          {/* Icon-tile tinted con el tone — reemplaza el side-stripe
              border viejo (`width: 3, left: 0, top: 0, bottom: 0`)
              que impeccable banea explícitamente. El tile carga el
              color del urgency sin invadir la geometría del card. */}
          <View
            style={[
              styles.iconTile,
              {
                backgroundColor: hexAlpha(tone, 0.14),
                borderColor: hexAlpha(tone, 0.28),
              },
            ]}
          >
            <MaterialIcons name={icon} size={16} color={tone} />
          </View>
          <View style={styles.body}>
            <Text
              style={[styles.title, { color: theme.colors.text }]}
              numberOfLines={1}
            >
              {target.title}
            </Text>
            <Text
              style={[styles.impact, { color: theme.colors.textMuted }]}
              numberOfLines={1}
            >
              {target.impact}
            </Text>
          </View>
          <MaterialIcons
            name="chevron-right"
            size={18}
            color={theme.colors.textMuted}
          />
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconTile: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  impact: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
})
