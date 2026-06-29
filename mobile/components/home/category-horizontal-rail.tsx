import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  useReducedMotion,
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { Category } from '@/features/categories/use-categories'
import { CategoryIcon } from '@/components/category/category-icon'
import type { CategoryIconScope } from '@/components/category/category-icon-map'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionSprings } from '@/lib/motion'
import { radii } from '@/theme/palette'
import { typography } from '@/theme/typography'
import { useAppTheme, useCategoryHueByName } from '@/theme/theme-provider'

// Bumped 60 → 68pt (add-gasto pedido del owner): categorías más grandes y
// consistentes con el kind-picker de add-ingreso (badge 42 en ambos).
const DEFAULT_TILE_WIDTH = 68
// Bumped 76 → 86pt para alojar el badge más grande (42) + label sin apretar.
const DEFAULT_TILE_HEIGHT = 86
const TILE_GAP = 8
// Wider gap for the static grid — without horizontal overflow to use
// as breathing room, tiles end up visually adjacent at 8pt. 12pt
// keeps them comfortably separated on a 4-column layout.
export const STATIC_TILE_GAP = 12

/**
 * Ancho de tile que llena la fila con ~4 columnas. MISMO criterio en los 3
 * flujos (add-gasto / add-fijo / add-ingreso) para una selección consistente.
 * Resta los paddings del Screen (40) + el padding interno del rail (8) + los 3
 * gaps de 8pt entre las 4 columnas (24).
 */
export function railTileWidth(windowWidth: number): number {
  return Math.max(64, Math.floor((windowWidth - 40 - 8 - 24) / 4))
}
/** Alto de tile unificado (igual que add-fijo). */
export const RAIL_TILE_HEIGHT = 80
/**
 * Item genérico del rail de selección. Desacopla la presentación (tile +
 * scroll horizontal 2-filas + animaciones) del modelo de datos: lo usan tanto
 * las CATEGORÍAS (add-gasto / add-fijo, vía `CategoryHorizontalRail`) como los
 * TIPOS DE INGRESO (add-ingreso), unificando el formato de selección.
 *
 * - `hueName`: string que determina el color del badge (`useCategoryHueByName`).
 * - `icon`: nodo a renderizar dentro del badge (sticker `<CategoryIcon>` para
 *   categorías; `<Image>` del sticker para ingresos).
 */
export interface RailTile {
  id: string
  label: string
  hueName: string
  icon: ReactNode
  accessibilityLabel: string
}

interface TileRailProps {
  tiles: RailTile[]
  selectedId: string
  onSelect: (id: string) => void
  /** Texto del eyebrow sobre el rail (lo computa el caller — la copy de
   *  "requerido/sin elegir" difiere entre categorías e ingresos). */
  labelText: string
  /** Number of rows to stack vertically. Columns flow horizontally
   *  with overflow scroll. Defaults to 3 (gastos). */
  rows?: number
  /** Per-tile width in points. Defaults to 68. */
  tileWidth?: number
  /** Per-tile height in points. Defaults to 86. */
  tileHeight?: number
  /** Static (no horizontal scroll) layout that distributes columns across
   *  the available width. */
  staticGrid?: boolean
  /** Tints the eyebrow to `theme.colors.warning` (the label TEXT is the
   *  caller's responsibility via `labelText`). Glides in via Reanimated. */
  warning?: boolean
}

/**
 * Rail presentacional genérico (scroll horizontal 2-filas + tiles animadas).
 * No conoce categorías ni ingresos — sólo `RailTile[]`.
 */
export function TileRail({
  tiles,
  selectedId,
  onSelect,
  labelText,
  rows = 3,
  tileWidth = DEFAULT_TILE_WIDTH,
  tileHeight = DEFAULT_TILE_HEIGHT,
  staticGrid = false,
  warning = false,
}: TileRailProps) {
  const { theme } = useAppTheme()
  const scrollRef = useRef<ScrollView>(null)
  // Smooth label tint transition when `warning` toggles. iOS-cubic at
  // standard duration so the color glides in instead of snapping.
  const warningProgress = useSharedValue(warning ? 1 : 0)
  useEffect(() => {
    warningProgress.value = withTiming(warning ? 1 : 0, {
      duration: motionDurations.standard,
      easing: Easing.bezier(0.32, 0.72, 0, 1),
    })
  }, [warning, warningProgress])
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      warningProgress.value,
      [0, 1],
      [theme.colors.textMuted, theme.colors.warning],
    ),
  }))

  const columns = useMemo(() => {
    const chunked: RailTile[][] = []
    for (let i = 0; i < tiles.length; i += rows) {
      chunked.push(tiles.slice(i, i + rows))
    }
    return chunked
  }, [tiles, rows])

  const selectedIndex = tiles.findIndex((tile) => tile.id === selectedId)
  const selectedColumnIndex = selectedIndex >= 0 ? Math.floor(selectedIndex / rows) : -1

  useEffect(() => {
    if (staticGrid) return
    if (selectedColumnIndex < 0 || !scrollRef.current) return
    const x = Math.max(0, selectedColumnIndex * (tileWidth + TILE_GAP) - tileWidth)
    scrollRef.current.scrollTo({ x, animated: true })
  }, [selectedColumnIndex, tileWidth, staticGrid])

  // Measure the rail's own container width (not the screen width) so
  // we don't have to guess what padding the parent <Screen> applies.
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const handleStaticLayout = useCallback((e: LayoutChangeEvent) => {
    setMeasuredWidth(e.nativeEvent.layout.width)
  }, [])
  const staticTileWidth = useMemo(() => {
    if (!staticGrid || measuredWidth == null) return tileWidth
    const STATIC_INNER_PADDING = 8
    const totalGap = Math.max(0, columns.length - 1) * STATIC_TILE_GAP
    const available = measuredWidth - STATIC_INNER_PADDING - totalGap
    if (columns.length === 0 || available <= 0) return tileWidth
    const computed = Math.floor(available / columns.length)
    return Math.max(tileWidth, Math.min(computed, 110))
  }, [staticGrid, measuredWidth, tileWidth, columns.length])

  const renderTile = (tile: RailTile, width: number) => (
    <Tile
      key={tile.id}
      tile={tile}
      selected={tile.id === selectedId}
      width={width}
      height={tileHeight}
      onPress={() => {
        void triggerHaptic('selection')
        onSelect(tile.id)
      }}
    />
  )

  return (
    <View style={styles.root}>
      <Animated.Text
        style={[typography.eyebrow, { paddingHorizontal: 4 }, labelAnimatedStyle]}
      >
        {labelText}
      </Animated.Text>
      {staticGrid ? (
        <View
          onLayout={handleStaticLayout}
          style={[styles.staticContent, { gap: STATIC_TILE_GAP }]}
        >
          {columns.map((column, columnIndex) => (
            <View key={columnIndex} style={[styles.column, { gap: STATIC_TILE_GAP }]}>
              {column.map((tile) => renderTile(tile, staticTileWidth))}
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          decelerationRate="fast"
          snapToInterval={tileWidth + TILE_GAP}
          snapToAlignment="start"
        >
          {columns.map((column, columnIndex) => (
            <View key={columnIndex} style={styles.column}>
              {column.map((tile) => renderTile(tile, tileWidth))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

interface CategoryHorizontalRailProps {
  categories: Category[]
  selectedCategoryId: string
  onSelect: (categoryId: string) => void
  /** Number of rows to stack vertically. Defaults to 3 (gastos). */
  rows?: number
  /** Scope para resolver el ícono de categoría (sticker/emoji). */
  iconScope?: CategoryIconScope
  /** Override which label is shown above the rail. */
  label?: string
  /** Per-tile width in points. Defaults to 68. */
  tileWidth?: number
  /** Per-tile height in points. Defaults to 86. */
  tileHeight?: number
  /** Static (no scroll) layout. */
  staticGrid?: boolean
  /** Required-and-unfilled hint: tints the eyebrow + overrides the label. */
  warning?: boolean
}

/**
 * Rail de selección de CATEGORÍAS (add-gasto / add-fijo). Adapta `Category[]`
 * al rail genérico `TileRail`: ícono sticker por nombre+scope, color del badge
 * por nombre (hue), label = displayName localizado.
 */
export function CategoryHorizontalRail({
  categories,
  selectedCategoryId,
  onSelect,
  rows = 3,
  iconScope = 'expense',
  label,
  tileWidth = DEFAULT_TILE_WIDTH,
  tileHeight = DEFAULT_TILE_HEIGHT,
  staticGrid = false,
  warning = false,
}: CategoryHorizontalRailProps) {
  const { t } = useTranslation()

  const tiles = useMemo<RailTile[]>(
    () =>
      categories.map((category) => {
        const displayName = category.displayName || category.name
        return {
          id: category.id,
          label: displayName,
          hueName: category.name,
          icon: (
            <CategoryIcon
              name={category.name}
              scope={iconScope}
              size={32}
              emojiStyle={styles.emoji}
            />
          ),
          accessibilityLabel: t('home:categoryRail.selectAccessibility', {
            name: displayName,
          }),
        }
      }),
    [categories, iconScope, t],
  )

  const labelText = warning
    ? t('home:categoryRail.warningLabel')
    : (label ?? t('home:categoryRail.label'))

  return (
    <TileRail
      tiles={tiles}
      selectedId={selectedCategoryId}
      onSelect={onSelect}
      labelText={labelText}
      rows={rows}
      tileWidth={tileWidth}
      tileHeight={tileHeight}
      staticGrid={staticGrid}
      warning={warning}
    />
  )
}

interface TileProps {
  tile: RailTile
  selected: boolean
  width: number
  height: number
  onPress: () => void
}

function Tile({ tile, selected, width, height, onPress }: TileProps) {
  const { theme } = useAppTheme()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const selectedProgress = useSharedValue(selected ? 1 : 0)
  const hue = useCategoryHueByName(tile.hueName)

  // Animate the selected state via Reanimated so the border eases in
  // and out — same pattern AmountCard uses for its focus ring.
  useEffect(() => {
    const target = selected ? 1 : 0
    selectedProgress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [selected, reduceMotion, selectedProgress])

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : scale.value }],
  }))

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [theme.colors.border, theme.colors.primary],
    ),
    borderWidth: 1 + selectedProgress.value,
  }))

  return (
    <Animated.View style={[styles.tileWrap, { width, height }, scaleStyle]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={tile.accessibilityLabel}
        hitSlop={4}
        onPressIn={() => {
          if (reduceMotion) return

          scale.value = withSpring(0.94, motionSprings.press)
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motionSprings.press)
        }}
        onPress={onPress}
        style={({ pressed }) => [{ width, height, opacity: pressed ? 0.92 : 1 }]}
      >
        <Animated.View
          style={[
            styles.tile,
            // El color de la categoría (hue) ocupa TODO el tile — una sola
            // cápsula coloreada (antes había 2: tile neutro + badge de color).
            // hue.surface/ink es el par con contraste AA en ambos modos.
            { width, height, backgroundColor: hue.surface },
            borderStyle,
          ]}
        >
          {tile.icon}
          <Text
            style={[styles.label, { color: hue.ink }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
          >
            {tile.label}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 10,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: TILE_GAP,
    paddingVertical: 4,
  },
  staticContent: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    gap: TILE_GAP,
  },
  tileWrap: {
    // width/height are applied inline so the rail can adapt per call site.
  },
  tile: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emoji: {
    // 21pt para llenar el badge de 42pt (fallback cuando no hay sticker).
    fontSize: 21,
    lineHeight: 23,
    textAlign: 'center',
    includeFontPadding: false,
  },
  label: {
    // 12pt: legible y consistente con el kindLabel de add-ingreso.
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    width: '100%',
  },
})
