import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { RiseView } from '@/components/home/animated/rise-view'
import { FijoRow } from '@/components/fijos/fijo-row'
import { useFijosSkin, type FijosNeoSkin } from '@/components/fijos/fijos-skin'
import { CategoryIcon } from '@/components/category/category-icon'
import { resolveCategoryHueByName } from '@/theme/category-hues'
import {
  resolveFijosCategoryTone,
  type FijosCategoryTone,
} from '@/components/fijos/fijos-category-palette'
import type { FijoCategoryGroup, FijoItem } from '@/features/fijos/fijos-aggregates.model'
import type { FijosTab } from '@/features/fijos/use-fijos-controller'
import { useGatedLayout } from '@/hooks/use-layout-transition-gate'
import { usePressScale } from '@/hooks/use-press-scale'
import { motionDurations, motionEasings, motionStagger } from '@/lib/motion'
import { formatMoney } from '@/utils/money'
import { useAppTheme } from '@/theme/theme-provider'

interface FijoCategoryGroupsProps {
  groups: FijoCategoryGroup[]
  /** Current UTC day-of-month. Computed once in the parent screen so
   *  rows share a single value instead of each creating a new Date. */
  todayDay: number
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  /** Revierte un pago confirmado (status='paid'). El row solo dispara
   *  la acción con el `paidPaymentId`; la pantalla huésped maneja la
   *  mutation. */
  onRevertPaid?: (paymentId: string) => void
  /** Fixed expense id whose delete/edit mutation is in flight. */
  pendingFixedExpenseId?: string | null
  /**
   * Tab activo. Cuando llega, gobierna el estado INICIAL de cada categoría:
   * `vencidos` abre (es lo que requiere acción), `pendientes` y `pagados`
   * cierran (son consulta). Sin este prop —la pantalla viva— todo abre, que
   * es el comportamiento de siempre.
   */
  tab?: FijosTab
}

/** Estado inicial por tab. Vencido = requiere acción → abierto. */
function defaultExpanded(tab: FijosTab | undefined): boolean {
  if (tab === undefined) return true
  return tab === 'vencidos'
}

export function FijoCategoryGroups({
  groups,
  todayDay,
  onMarkPaid,
  onEdit,
  onDelete,
  onRevertPaid,
  pendingFixedExpenseId,
  tab,
}: FijoCategoryGroupsProps) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const { t } = useTranslation()
  /**
   * Colapso MANUAL del usuario, por `${tab}:${categoryId}`.
   *
   * Vive acá y no dentro de `CategoryGroup` porque este componente NO se
   * desmonta al cambiar de tab (solo cambia `groups`), así que el mapa
   * sobrevive la navegación entre Vencidos/Pendientes/Pagados y al volver la
   * categoría reaparece como el usuario la dejó.
   *
   * La llave incluye el tab a propósito: el mismo fijo puede estar en dos
   * tabs y "colapsé Vivienda en Pagados" no debería colapsarla en Vencidos.
   * Sin override, manda `defaultExpanded(tab)`.
   */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const toggle = useCallback((key: string, next: boolean) => {
    setOverrides((prev) => ({ ...prev, [key]: next }))
  }, [])

  if (groups.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text
          style={[
            styles.emptyText,
            { color: skin.kind === 'neo' ? skin.ink.meta : theme.colors.textMuted },
          ]}
        >
          {t('fijos:categoryGroups.empty')}
        </Text>
      </View>
    )
  }
  return (
    <View style={[styles.stack, skin.kind === 'neo' ? styles.stackNeo : null]}>
      {groups.map((group, gi) => (
        // Stagger entry by `motionStagger.listItem` (40ms) per group
        // for a cascading reveal. Capped at 200ms total so long lists
        // don't have a noticeably slow finish.
        <RiseView
          key={group.categoryId}
          delay={Math.min(60 + gi * motionStagger.listItem, 240)}
        >
          <CategoryGroup
            group={group}
            todayDay={todayDay}
            onMarkPaid={onMarkPaid}
            onEdit={onEdit}
            onDelete={onDelete}
            onRevertPaid={onRevertPaid}
            pendingFixedExpenseId={pendingFixedExpenseId ?? null}
            expanded={
              overrides[`${tab ?? '-'}:${group.categoryId}`] ?? defaultExpanded(tab)
            }
            onToggle={toggle}
            toggleKey={`${tab ?? '-'}:${group.categoryId}`}
          />
        </RiseView>
      ))}
    </View>
  )
}

function CategoryGroup({
  group,
  todayDay,
  onMarkPaid,
  onEdit,
  onDelete,
  onRevertPaid,
  pendingFixedExpenseId,
  expanded,
  onToggle,
  toggleKey,
}: {
  group: FijoCategoryGroup
  todayDay: number
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onRevertPaid?: (paymentId: string) => void
  pendingFixedExpenseId?: string | null
  /** CONTROLADO por el padre: el estado sobrevive el cambio de tab. */
  expanded: boolean
  onToggle: (key: string, next: boolean) => void
  toggleKey: string
}) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const { t } = useTranslation()
  // Ícono por nombre CRUDO (matcher ES); el header sigue en `group.label`.
  // CategoryIcon rendea el sticker si hay slug mapeado, sino cae al emoji.
  // Press scale subtle 0.98 — toda la row es tap-target grande, escala
  // sutil para no competir con la rotation del chevron.
  const press = usePressScale({ pressedScale: 0.98 })
  /** La card de categoría se pinta con el tono de SU categoría y usa esa misma
   *  tinta para nombre, conteo, monto y chevron. Como el fondo deja de ser
   *  neutro, las tintas del skin —calibradas contra el neutro— no aplican acá.
   *  Solo en `neo`: la pantalla viva no tiene tono. */
  const tone =
    skin.kind === 'neo' ? resolveFijosCategoryTone(group.rawLabel, theme.isDark) : null
  const groupLayout = useGatedLayout(
    LinearTransition.duration(motionDurations.standard).easing(motionEasings.standard),
  )
  return (
    <Animated.View layout={groupLayout}>
      <Pressable
        onPress={() => onToggle(toggleKey, !expanded)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('fijos:categoryGroups.categoryAccessibility', {
          label: group.label,
        })}
      >
        <Animated.View
          style={[
            styles.header,
            // En `neo` la fila de categoría NO es texto pelado: el handoff la
            // dibuja como CARD elevada (radio 22, mismo raise que las cards
            // del sistema). Es la superficie que se toca para expandir, así
            // que tener relieve además la vuelve legible como control.
            skin.kind === 'neo' ? neoGroupCardStyle(skin, tone) : null,
            press.animatedStyle,
          ]}
        >
        {/* El sticker de la categoría, GRANDE y clipeado por la card: deja de
            ser un ícono y pasa a ser el fondo que la identifica. Sangra por el
            borde derecho a propósito. `pointerEvents:none` para no comerse el
            tap del colapso. */}
        {tone ? (
          <View pointerEvents="none" style={styles.categoryBackdrop}>
            <View
              style={[
                styles.categoryWatermark,
                { opacity: theme.isDark ? 0.34 : 0.3 },
              ]}
            >
              <CategoryIcon
                name={group.rawLabel}
                scope="fixed_expense"
                size={124}
                onLightSurface
              />
            </View>
          </View>
        ) : null}
        <View style={styles.headerLeft}>
          {/* Sin tile: el sticker ya vive de fondo a tamaño grande, y
              repetirlo chico al lado competía con él. */}
          {tone ? null : (
          <View
            style={[
              styles.iconTile,
              {
                backgroundColor: hexAlpha(group.color, skin.kind === 'neo' ? skin.groupTile.alpha : 0.16),
                borderColor: hexAlpha(group.color, 0.4),
              },
              skin.kind === 'neo'
                ? {
                    width: skin.group.tileSize,
                    height: skin.group.tileSize,
                    borderRadius: skin.group.tileRadius,
                    borderWidth: 0,
                    // En CLARO el handoff usa el pastel OPACO de la categoría;
                    // en OSCURO el mismo hue al 14%. No es el mismo alpha en
                    // los dos temas, y el sticker fue dibujado para fondo
                    // claro — por eso en claro se lee a pleno.
                    ...(skin.groupTile.opaqueInLight
                      ? { backgroundColor: resolveCategoryHueByName(group.rawLabel).light.surface }
                      : null),
                  }
                : null,
            ]}
          >
            <CategoryIcon
              name={group.rawLabel}
              scope="fixed_expense"
              size={skin.kind === 'neo' ? 28 : 22}
              emojiStyle={styles.iconText}
              onLightSurface={skin.kind === 'neo'}
            />
          </View>
          )}
          <View>
            <Text
              style={[
                styles.title,
                { color: skin.kind === 'neo' ? skin.ink.title : theme.colors.text },
                skin.kind === 'neo'
                  ? { ...skin.type.name, fontSize: skin.group.nameSize }
                  : null,
                tone ? { color: tone.ink } : null,
              ]}
            >
              {group.label}
            </Text>
            <Text
              style={[
                styles.count,
                { color: skin.kind === 'neo' ? skin.ink.meta : theme.colors.textMuted },
                skin.kind === 'neo' ? { fontSize: skin.group.countSize } : null,
                // Tinta PLENA, sin opacidad. Se probó al 78% y al 85% para
                // bajarle peso, y en los dos casos el conteo (12.5px, texto
                // normal para WCAG) cae por debajo de 4.5:1 — el peor caso,
                // Deporte en claro, daba 3.63:1. La jerarquía la dan el tamaño
                // y el peso (19/900 vs 12.5/700), no el contraste.
                tone ? { color: tone.ink } : null,
              ]}
            >
              {t('fijos:categoryGroups.itemCount', { count: group.items.length })}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text
            style={[
              styles.total,
              { color: skin.kind === 'neo' ? skin.ink.amount : theme.colors.text },
              skin.kind === 'neo'
                ? { ...skin.type.name, fontSize: skin.group.totalSize }
                : null,
              tone ? { color: tone.ink } : null,
            ]}
          >
            {formatMoney(group.total)}
          </Text>
          <Chevron
            color={
              tone
                ? tone.ink
                : skin.kind === 'neo'
                  ? skin.ink.chevron
                  : theme.colors.textMuted
            }
            expanded={expanded}
          />
        </View>
        </Animated.View>
      </Pressable>
      {expanded ? (
        <Animated.View
          // Entrada y salida SIN desplazamiento propio.
          //
          // Se probó `FadeInUp`/`FadeOutUp` y rompe el layout: Reanimated deja
          // el elemento saliente ocupando su posición mientras el padre
          // —envuelto en `LinearTransition`— ya colapsó la altura, así que las
          // categorías se montan una encima de otra y el orden se mezcla.
          // El desplazamiento vertical lo aporta la layout transition del
          // grupo, que es quien SÍ conoce las alturas nuevas.
          entering={FadeIn.duration(motionDurations.standard).easing(
            motionEasings.enterSmooth,
          )}
          exiting={FadeOut.duration(motionDurations.exitTab).easing(
            motionEasings.exitStandard,
          )}
          // `gap: 6` alcanzaba cuando las filas no tenían relieve. Con la
          // sombra visible, 6px hace que el raise de una fila se pise con el
          // de la de abajo y el bloque se lee como una masa. 12px es el aire
          // mínimo para que cada card respire su propia sombra.
          style={[styles.list, skin.kind === 'neo' ? styles.listNeo : null]}
        >
          {group.items.map((item) => (
            <ItemSlot
              key={item.id}
              item={item}
              color={group.color}
              label={group.label}
              rawLabel={group.rawLabel}
              todayDay={todayDay}
              onMarkPaid={onMarkPaid}
              onEdit={onEdit}
              onDelete={onDelete}
              onRevertPaid={onRevertPaid}
              isPending={pendingFixedExpenseId === item.id}
            />
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

function ItemSlot({
  item,
  color,
  label,
  rawLabel,
  todayDay,
  onMarkPaid,
  onEdit,
  onDelete,
  onRevertPaid,
  isPending,
}: {
  item: FijoItem
  color: string
  label: string
  rawLabel: string
  todayDay: number
  onMarkPaid?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onRevertPaid?: (paymentId: string) => void
  isPending?: boolean
}) {
  // FijoRow ya wrappea el card en SwipeRow internamente (con la acción
  // 'Eliminar' cuando recibe onDelete). No hace falta wrappear aquí —
  // hacerlo causaba double-wrap y press-halo. Solo pasamos los handlers.
  return (
    <FijoRow
      item={item}
      categoryColor={color}
      categoryName={label}
      categoryRawName={rawLabel}
      todayDay={todayDay}
      onMarkPaid={onMarkPaid}
      onEdit={onEdit}
      onDelete={onDelete}
      onRevertPaid={onRevertPaid}
      isPending={isPending}
    />
  )
}

function Chevron({ color, expanded }: { color: string; expanded: boolean }) {
  // Antes hacíamos path-swap entre up y down → SNAP visual sin transition.
  // Ahora: path fijo "down" + rotation 180° animado vía Reanimated.
  // Resultado: el chevron rota suavemente cuando expandís/colapsás.
  const rotation = useSharedValue(expanded ? 180 : 0)
  useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, {
      duration: motionDurations.standard,
      // Token del sistema en vez de la curva inline: es exactamente la misma
      // bezier (0.16, 1, 0.30, 1) que ya estaba, ahora nombrada.
      easing: motionEasings.enterSmooth,
    })
  }, [expanded, rotation])
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))
  return (
    <Animated.View style={style}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
        <Path
          d="M6 9l6 6 6-6"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Animated.View>
  )
}

/**
 * Card de la fila de categoría — radio 22 + raise, literal del handoff.
 *
 * El gradiente del kit se emite SOLO cuando no hay tono de categoría, y la
 * decisión se toma acá adentro a propósito. Antes se componían dos objetos de
 * estilo —el del kit con gradiente, y encima uno con el `backgroundColor` del
 * tono— y el gradiente SOBREVIVÍA, porque el segundo objeto solo pisaba el
 * color. En web no se notaba: `experimental_backgroundImage` no renderiza en
 * react-native-web. En el teléfono sí, así que el gradiente verde oscuro del
 * kit pintaba sobre el tono y todas las cards se veían verdes en dark.
 */
function neoGroupCardStyle(skin: FijosNeoSkin, tone: FijosCategoryTone | null) {
  return {
    backgroundColor: tone ? tone.surface : skin.row.background,
    experimental_backgroundImage: tone ? undefined : skin.row.gradientCss,
    ...(tone ? { overflow: 'hidden' as const } : null),
    boxShadow: skin.row.shadow,
    borderRadius: skin.row.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    // El estilo base trae `paddingBottom: 8` para separar del listado; la
    // card lo resuelve con su propio padding simétrico.
    paddingBottom: 12,
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
  // Separación ENTRE categorías. Con las cards elevadas, 16 dejaba el raise de
  // una categoría tocando la de abajo; 20 las separa como bloques.
  stack: { gap: 16 },
  stackNeo: { gap: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconText: { fontSize: 16 },
  title: { fontSize: 14, fontWeight: '700' },
  count: { fontSize: 11 },
  // Tabular nums para que totals por categoría alineen verticalmente
  // cuando varios groups están expandidos uno encima del otro.
  total: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  // Capa de identificación de categoría — detrás del contenido, clipeada por
  // la card. `pointerEvents:none` para no comerse el tap del colapso.
  categoryBackdrop: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 22 },
  categoryWatermark: {
    position: 'absolute',
    top: '50%',
    // Centrado vertical del sticker de 124px + sangrado por el borde derecho.
    marginTop: -62,
    right: -18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 6 },
  // Aire para el relieve. SIN sangría: los ítems van al MISMO ancho que la
  // card de categoría (fallo del owner) — la jerarquía la comunican el raise
  // más chico y el orden vertical, no un escalón horizontal.
  listNeo: { gap: 12, marginTop: 12 },
  emptyWrap: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13 },
})
