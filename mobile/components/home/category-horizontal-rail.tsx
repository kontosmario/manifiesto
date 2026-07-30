import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
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
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { useAppTheme } from '@/theme/theme-provider'
import { resolveFijosCategoryTone } from '@/components/fijos/fijos-category-palette'
import { resolveCategoryHueByName } from '@/theme/category-hues'

// Bumped 60 → 68pt (add-gasto pedido del owner): categorías más grandes y
// consistentes con el kind-picker de add-ingreso (badge 42 en ambos).
const DEFAULT_TILE_WIDTH = 68
// Bumped 76 → 86 → 94pt: aloja el badge (42) + label a DOS líneas sin truncar
// nombres de 2 palabras (Salud y bienestar…); las palabras largas de una pieza
// se achican con adjustsFontSizeToFit (ver el <Text> del Tile).
const DEFAULT_TILE_HEIGHT = 94
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
/** Alto de tile unificado (igual que add-fijo). 80 → 94 para el label a 2 líneas. */
export const RAIL_TILE_HEIGHT = 94
/**
 * Item genérico del rail de selección. Desacopla la presentación (tile +
 * scroll horizontal 2-filas + animaciones) del modelo de datos: lo usan tanto
 * las CATEGORÍAS (add-gasto / add-fijo, vía `CategoryHorizontalRail`) como los
 * TIPOS DE INGRESO (add-ingreso), unificando el formato de selección.
 *
 * - `hueName`: string que resuelve el color del tile (`resolveCategoryHueByName(...).light`).
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
  /** Píldora informativa a la derecha del label (solo piel `neo`). */
  hint?: string
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
  hint,
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
  const skinRail = useFijosSkin()
  const neoRail = skinRail.kind === 'neo' ? skinRail : null
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
      <View style={styles.eyebrowRow}>
        <Animated.Text
          style={[
            typography.eyebrow,
            { paddingHorizontal: 4 },
            labelAnimatedStyle,
            // Único eyebrow del paso 1 que no pasa por `Field`. La tinta va
            // del skin: `theme.colors.textMuted` es verde NEÓN en oscuro.
            neoRail ? { ...neoRail.add.sectionLabel, color: neoRail.mutedInk } : null,
          ]}
        >
          {labelText}
        </Animated.Text>
        {/* Píldora "sugerida por el nombre" del handoff. Solo cuando el caller
            la pasa Y estamos en `neo`; la pantalla vieja nunca la tuvo. */}
        {hint && neoRail ? (
          <Text
            style={[
              styles.hintPill,
              {
                color: neoRail.detail.ctaEditInk,
                backgroundColor: neoRail.accent('paid').chipBackground,
              },
            ]}
          >
            {hint}
          </Text>
        ) : null}
      </View>
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
          contentContainerStyle={[styles.scrollContent, neoRail ? styles.scrollContentNeo : null]}
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
  /** Píldora informativa a la derecha del label (solo piel `neo`). */
  hint?: string
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
  hint,
  tileWidth = DEFAULT_TILE_WIDTH,
  tileHeight = DEFAULT_TILE_HEIGHT,
  staticGrid = false,
  warning = false,
}: CategoryHorizontalRailProps) {
  const { t } = useTranslation()
  const { theme } = useAppTheme()
  // COMPARTIDO con add-gasto / add-ingreso: solo resuelve a `neo` dentro del
  // wizard de fijos, que es el único que monta el provider.
  const railSkin = useFijosSkin()
  const railNeo = railSkin.kind === 'neo'
  // En neo el tile se pinta con el TONO de la categoría, que en oscuro es una
  // superficie oscura (L=24%): ahí el sticker sí necesita su placa clara, que
  // es lo que hace `CategoryIcon` sin `onLightSurface`. En claro el tono ya es
  // pastel y el sticker se apoya directo.
  const stickerOnLight = railNeo ? !theme.isDark : true

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
              size={railNeo ? 42 : 32}
              emojiStyle={styles.emoji}
              // La cápsula del tile ya es el pastel CLARO del hue (ambos modos)
              // → el sticker se lee directo, sin placa.
              onLightSurface={stickerOnLight}
            />
          ),
          accessibilityLabel: t('home:categoryRail.selectAccessibility', {
            name: displayName,
          }),
        }
      }),
    [categories, iconScope, t, railNeo, stickerOnLight],
  )

  const labelText = warning
    ? t('home:categoryRail.warningLabel')
    : (label ?? t('home:categoryRail.label'))

  return (
    <TileRail
      tiles={tiles}
      selectedId={selectedCategoryId}
      onSelect={onSelect}
      hint={hint}
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
  // COMPARTIDO con add-gasto / add-ingreso: solo resuelve a `neo` dentro del
  // wizard de fijos, que es el único que monta el provider.
  const skin = useFijosSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const selectedProgress = useSharedValue(selected ? 1 : 0)
  // CLASSIC: siempre el pastel CLARO del hue — un solo color de fondo del
  // ícono, igual en light y dark (los stickers están ilustrados para fondo
  // claro → así se leen en ambos modos sin placa).
  //
  // NEO: el tono de `fijos-category-palette`, el MISMO que pinta los headers
  // colapsables de la lista. Es lo que hace que una categoría se vea igual
  // donde se la elige y donde se la lee después, y a diferencia de
  // `categoryHues` no repite familia entre las 11 del catálogo. Acá sí cambia
  // con el tema: la superficie oscura va a L=24%, que es donde el matiz
  // recién se lee (espejar el claro daba cards grises).
  const hue = neo
    ? resolveFijosCategoryTone(tile.hueName, theme.isDark)
    : resolveCategoryHueByName(tile.hueName).light

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

  // Selección bien diferenciable también en dark: borde grueso (1→3pt) en el
  // INK oscuro del hue (contrasta fuerte sobre el pastel claro del tile, en
  // ambos modos) + un check badge en la esquina.
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      selectedProgress.value,
      [0, 1],
      [theme.colors.border, hue.ink],
    ),
    borderWidth: 1 + selectedProgress.value * 2,
  }))

  const checkStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
    transform: [{ scale: 0.5 + selectedProgress.value * 0.5 }],
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
            // Un solo color de fondo (pastel claro del hue) ocupa TODO el tile,
            // igual en light y dark. Sin placa: el sticker va directo encima.
            { width, height, backgroundColor: hue.surface },
            neo ? null : borderStyle,
            // Handoff: el tile está ELEVADO y el seleccionado se HUNDE con un
            // anillo verde. No se rellena ni engorda el borde — es el recurso
            // de "presionado" del neumorfismo.
            //
            // El FONDO no se toca a propósito. El handoff pone el tile oscuro
            // en `rgba(255,255,255,0.06)`, pero ahí dibuja EMOJI; nosotros
            // ponemos los stickers PNG, que están ilustrados para fondo claro
            // y sobre ese velo se funden. El pastel del hue se conserva en los
            // dos temas, que es la decisión que ya tomaba este componente.
            neo
              ? {
                  borderRadius: neo.add.tile.radius,
                  borderWidth: 0,
                  boxShadow: selected
                    ? `${neo.add.tile.selectedShadow}, 0 0 0 2.5px ${neo.add.tile.selectedRing}`
                    : neo.add.tile.idleShadow,
                }
              : null,
          ]}
        >
          {tile.icon}
          <Text
            style={[styles.label, { color: hue.ink }]}
            // Clave del fix: una palabra ÚNICA larga (Transferencia, Suscripciones,
            // Entretenimiento) con numberOfLines=2 se char-breakea ("Transferen"/
            // "cia") y eso YA satisface las 2 líneas → adjustsFontSizeToFit nunca
            // dispara. Solución: las de una sola palabra van a 1 línea (sin
            // segunda línea donde partir → la fuente se achica hasta entrar); las
            // multi-palabra siguen a 2 líneas (wrappean por el espacio).
            numberOfLines={tile.label.trim().includes(' ') ? 2 : 1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            ellipsizeMode="tail"
            allowFontScaling={false}
          >
            {tile.label}
          </Text>
          <Animated.View
            pointerEvents="none"
            style={[styles.checkBadge, { backgroundColor: hue.ink }, checkStyle]}
          >
            <MaterialIcons name="check" size={11} color={hue.surface} />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintPill: {
    borderRadius: 8,
    fontSize: 9.5,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  root: {
    gap: 10,
  },
  scrollContent: {
    paddingHorizontal: 4,
    gap: TILE_GAP,
    paddingVertical: 4,
  },
  // Ver el comentario de `rowNeo` en suggested-amount-strip: el ScrollView
  // corta la sombra en vertical si no se le deja el aire que ocupa.
  scrollContentNeo: { paddingHorizontal: 10, paddingVertical: 13 },
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
    // Sin lineHeight explícito: en iOS un lineHeight fijo suprime
    // adjustsFontSizeToFit (la palabra larga no se achicaría). El lineHeight por
    // defecto (~14.3 a 12pt → 2 líneas ~28.6pt) entra en el tile de 92pt
    // (badge 42 + gap 4 + label + padding 16) y escala con la fuente al achicar.
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    width: '100%',
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 17,
    height: 17,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
