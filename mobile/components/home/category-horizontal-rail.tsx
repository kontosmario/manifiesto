import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
// El hook PROPIO, nunca el de reanimated: `Tile` lo llama una vez POR TILE (el
// alta de ingreso monta 9), y el de la librería abre una suscripción a
// `AccessibilityInfo` en cada call site además de ignorar el override de
// Motion de Ajustes. El propio es un `useContext` sobre un store único.
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import type { Category } from '@/features/categories/use-categories'
import { CategoryIcon } from '@/components/category/category-icon'
import type { CategoryIconScope } from '@/components/category/category-icon-map'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations, motionSprings } from '@/lib/motion'
import { neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily, typography } from '@/theme/typography'
import { FIJOS_SHADOW_BLEED, useFijosSkin } from '@/components/fijos/fijos-skin'
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
 * Key de una columna por CONTENIDO, no por posición.
 *
 * Los tiles llegan rankeados por uso (`rankCategoriesByUsage`), y ese ranking
 * se recomputa cada vez que cambia el cache de gastos: refetch on focus, un
 * movimiento de otro miembro del hogar, el insert optimista. Con `key={index}`
 * un tile que pasa de la columna 2 a la 1 cambia de PADRE, así que React lo
 * desmonta y lo remonta: pierde sus shared values, `selectedProgress` vuelve a
 * 0 y el tile recién elegido se despinta (borde y check) con la hoja abierta y
 * sin que el form haya cambiado. Mismo idiom que las filas de `onb-numpad`.
 */
function columnKey(column: readonly RailTile[]): string {
  return column.map((tile) => tile.id).join('-')
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
  // Extremos del glide, resueltos por piel. En `neo` la tinta de reposo es la
  // sub del rediseño (`theme.colors.textMuted` es verde NEÓN en oscuro) y la
  // de aviso el terracota para TEXTO CHICO — `accentClay` a secas se queda
  // abajo de AA como tinta en claro.
  //
  // Antes el estilo animado se aplicaba ANTES del objeto neo, así que el
  // `color` estático del skin lo pisaba y el aviso quedaba MUDO en las tres
  // altas: ahora viaja último y es el único que decide la tinta.
  const labelIdleInk = neoRail ? neoRail.mutedInk : theme.colors.textMuted
  const labelWarnInk = neoRail ? neoRail.add.accentClayInk : theme.colors.warning
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(warningProgress.value, [0, 1], [labelIdleInk, labelWarnInk]),
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

  // `onSelect` va DERECHO al tile, sin cerrarlo sobre `tile.id` acá: un arrow
  // inline por tile es una prop nueva por render y anula el `memo` de `Tile`
  // (que paga 3 `useAnimatedStyle` + la resolución de paleta). El háptico y la
  // llamada se arman adentro, colgados de `[tile.id, onSelect]`.
  const renderTile = (tile: RailTile, width: number) => (
    <Tile
      key={tile.id}
      tile={tile}
      selected={tile.id === selectedId}
      width={width}
      height={tileHeight}
      onSelect={onSelect}
    />
  )

  return (
    // El grupo de radios: sin él VoiceOver anuncia N radios sueltos sin decir
    // cuántas alternativas hay, que son excluyentes, ni a qué campo
    // pertenecen — el eyebrow es un `<Text>` hermano y tampoco se asocia.
    // Mismo tratamiento que los chips de día del alta de ingreso.
    <View style={styles.root} accessibilityRole="radiogroup" accessibilityLabel={labelText}>
      <View style={styles.eyebrowRow}>
        <Animated.Text
          style={[
            // `typography.eyebrow` primero, y NO se elimina en neo: de ahí sale
            // el `textTransform` que pone el label en mayúsculas, igual que los
            // de `Field`. El objeto de abajo pisa tamaño, peso y familia.
            typography.eyebrow,
            { paddingHorizontal: 4 },
            // Único eyebrow del paso 1 que no pasa por `Field`. Los tokens van
            // del skin (tamaño/peso/familia/tracking); el `color` NO, para que
            // el glide de aviso siga siendo el último en decidirlo.
            neoRail ? neoRail.add.sectionLabel : null,
            labelAnimatedStyle,
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
                // El `fontFamily` viaja con el peso: cada peso de Nunito es un
                // face estático, así que un `fontWeight: '800'` suelto rendía
                // el regular del sistema (mismo fix que ya tiene `Field`).
                fontFamily: neoRail.font('800'),
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
          {columns.map((column) => (
            <View key={columnKey(column)} style={[styles.column, { gap: STATIC_TILE_GAP }]}>
              {column.map((tile) => renderTile(tile, staticTileWidth))}
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Sin esto cae al default `'never'`: con el teclado abierto el
          // ScrollView se queda el toque para cerrarlo y NO se lo entrega al
          // `Pressable` del tile, así que el primer tap después de escribir la
          // descripción sólo baja el teclado y la categoría no cambia. Es el
          // control de un campo REQUERIDO. `'handled'` y no `'always'`: es el
          // mismo valor de los dos vecinos del paso (`SuggestedAmountStrip`,
          // `QuickTextChips`) y del ScrollView del `Screen`, y deja que el
          // fondo del `WizardShell` siga cerrando el teclado.
          keyboardShouldPersistTaps="handled"
          style={neoRail ? styles.scrollBleedNeo : undefined}
          contentContainerStyle={[styles.scrollContent, neoRail ? styles.scrollContentNeo : null]}
          decelerationRate="fast"
          snapToInterval={tileWidth + TILE_GAP}
          snapToAlignment="start"
        >
          {columns.map((column) => (
            <View key={columnKey(column)} style={styles.column}>
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
  // COMPARTIDO con add-gasto / add-ingreso: solo resuelve a `neo` dentro del
  // wizard de fijos, que es el único que monta el provider.
  const railSkin = useFijosSkin()
  const railNeo = railSkin.kind === 'neo'

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
              // NUNCA placa. La placa es una superficie CLARA detrás del
              // sticker: en oscuro se lee como un recorte de light mode
              // adentro de un tile oscuro. El sticker se apoya directo sobre
              // el tono, que a L=24%/S=50% tiene croma de sobra para
              // sostenerlo — el mismo criterio del watermark del colapsable.
              onLightSurface
            />
          ),
          accessibilityLabel: t('home:categoryRail.selectAccessibility', {
            name: displayName,
          }),
        }
      }),
    [categories, iconScope, t, railNeo],
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
  /** El id lo cierra el TILE, no el caller: ver `renderTile`. */
  onSelect: (id: string) => void
}

/**
 * MEMOIZADO — y por eso `onSelect` TIENE que llegar estable desde la pantalla.
 *
 * El rail del paso 1 de agregar gasto monta el catálogo variable entero (13
 * categorías + "Otros" + las custom del hogar) y cada tile paga `useFijosSkin`
 * + `useAppTheme` + `useReducedMotion` + `resolveFijosCategoryTone` + TRES
 * `useAnimatedStyle`. Sin memo, cada tecla tipeada en la descripción re-rendea
 * la screen → el paso → el rail → los ~14 tiles: tipear "Cafetería" son ~126
 * re-montajes de estilo animado. Es la trampa de memos derrotadas por
 * callbacks inestables, sólo que acá no había memo que derrotar.
 */
const Tile = memo(function Tile({ tile, selected, width, height, onSelect }: TileProps) {
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
  //
  // En `neo` este estilo NO se aplica (el tile se hunde con anillo, no se
  // bordea) y el worklet corta antes de interpolar: son ~14 tiles pagando una
  // interpolación de `theme.colors.border` por frame para nada.
  const isNeo = neo != null
  const borderStyle = useAnimatedStyle(() => {
    'worklet'
    if (isNeo) return { borderColor: 'transparent', borderWidth: 0 }
    return {
      borderColor: interpolateColor(
        selectedProgress.value,
        [0, 1],
        [theme.colors.border, hue.ink],
      ),
      borderWidth: 1 + selectedProgress.value * 2,
    }
  })

  const checkStyle = useAnimatedStyle(() => ({
    opacity: selectedProgress.value,
    transform: [{ scale: 0.5 + selectedProgress.value * 0.5 }],
  }))

  const tileId = tile.id
  const handlePress = useCallback(() => {
    void triggerHaptic('selection')
    onSelect(tileId)
  }, [onSelect, tileId])

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
        onPress={handlePress}
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
            style={[
              styles.label,
              { color: hue.ink },
              // El `fontFamily` viaja con el peso (Nunito son faces estáticas
              // por peso). Sólo en neo: en classic el label lo rinde la face
              // del sistema desde siempre y este componente también lo monta
              // import-review, que no pasó por el gate del rediseño.
              neo ? { fontFamily: neo.font('700') } : null,
            ]}
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
})

const styles = StyleSheet.create({
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintPill: {
    // Sólo se dibuja en `neo`, así que el radio sale del vocabulario del
    // rediseño en vez de un literal V1.
    borderRadius: neoRadii.chip,
    fontSize: 9.5,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
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
  // El ScrollView tiene `overflow: auto hidden`, así que RECORTA la sombra
  // contra sus bordes laterales. La sombra se extiende SHADOW_BLEED (offset 5
  // + blur 12), y con sólo 10px de padding se le comía la mitad.
  //
  // Subir el padding a 17 desalinearía el primer tile respecto del pozo del
  // nombre y del monto. Entonces el ScrollView SANGRA hacia afuera lo mismo
  // que su contenido se mete hacia adentro: el tile vuelve a caer donde caía
  // y la sombra tiene su aire dentro del área de clip.
  scrollBleedNeo: { marginHorizontal: -FIJOS_SHADOW_BLEED },
  scrollContentNeo: { paddingHorizontal: FIJOS_SHADOW_BLEED, paddingVertical: 13 },
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
    // Mismo valor que el `radii.lg` V1 que había acá (18): es el radio de tile
    // del rediseño, tokenizado. En neo lo pisa igual `neo.add.tile.radius`.
    borderRadius: neoRadii.tile,
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
    fontFamily: nunitoFamily('700'),
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
    // A 17×17 el `pill` del rediseño (22) redondea igual que el 999 V1.
    borderRadius: neoRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
