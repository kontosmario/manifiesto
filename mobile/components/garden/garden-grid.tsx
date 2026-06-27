import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import Svg, { Circle } from 'react-native-svg'
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated'
import { Sprout } from './sprout'
import { useAppTheme } from '@/theme/theme-provider'
import type { AppTheme } from '@/theme/palette'
import { weekdayLongFromMondayIndex } from '@/utils/date-format'
import { GARDEN_COLS, type BroteStage, type GardenCell } from '@/features/garden/garden-model'

interface GardenGridProps {
  cells: GardenCell[]
  /** Anima la entrada del brote de HOY (solo al recién plantar). */
  justPlantedToday?: boolean
  /** Muestra la leyenda (controlada por el toggle del header del card). */
  showLegend?: boolean
  /** ISO del hueco recuperable de la semana cerrada (6/7 + escudo) — null si no hay. */
  recoverableGapIso?: string | null
  /** Tap en la celda del hueco recuperable → abre la confirmación de plantar. */
  onPlantGap?: (iso: string) => void
}

const CORAL = '#E2935E'

const GAP = 7
// Inicial de cada día (Lunes=0 … Domingo=6) — espejo de deriveGardenCells /
// deriveWeekStrip. La letra se deriva del idioma activo (NO un array ES fijo).
const WEEKDAY_INITIALS = (): string[] =>
  Array.from({ length: 7 }, (_, i) =>
    weekdayLongFromMondayIndex(i).charAt(0).toUpperCase(),
  )

// Puntos de color de la leyenda (matchean los fills del glyph de cada estado).
// `key` resuelve el label vía i18n (garden:legend.*).
const LEGEND: Array<{ key: string; color: string }> = [
  { key: 'seed', color: '#C29A5E' },
  { key: 'growing', color: '#A9D57F' },
  { key: 'rooted', color: '#4F9E45' },
  { key: 'bloom', color: '#E2935E' },
  { key: 'skipped', color: '#CBC6B6' },
]

function isPlanted(stage: BroteStage): boolean {
  return (
    stage === 'seed' ||
    stage === 'germ' ||
    stage === 'fern' ||
    stage === 'bloom' ||
    stage === 'recovered'
  )
}

// Fondo del tile por estado. TODA celda tiene tile (la grilla se lee como una
// matriz contenida dentro de la card, no flotando sobre el fondo de pantalla).
function tileBg(stage: BroteStage, theme: AppTheme): string {
  const isDark = theme.isDark
  switch (stage) {
    case 'bloom':
    case 'fern':
      return theme.colors.gardenSoilFern
    case 'seed':
    case 'germ':
    case 'recovered':
      return theme.colors.gardenSoil
    case 'pending':
      return isDark ? 'rgba(166,239,143,0.18)' : '#E8F3DF'
    case 'missed':
      return theme.colors.gardenSkipped
    case 'pre':
    default:
      return isDark ? 'rgba(255,255,255,0.03)' : 'rgba(28,58,35,0.045)'
  }
}

// La grilla viene plana (weeks*7 celdas, L→D). La partimos en semanas para que
// cada fila sea un contenedor flex propio: 7 celdas `flex:1` llenan el ancho
// EXACTO (equivalente a repeat(7,1fr)), sin el sliver que dejaba el cellSize
// floored + flexWrap. Sin medición ni onLayout.
function toWeeks(cells: GardenCell[]): GardenCell[][] {
  const weeks: GardenCell[][] = []
  for (let i = 0; i < cells.length; i += GARDEN_COLS) {
    weeks.push(cells.slice(i, i + GARDEN_COLS))
  }
  return weeks
}

function GardenGridImpl({
  cells,
  justPlantedToday,
  showLegend,
  recoverableGapIso,
  onPlantGap,
}: GardenGridProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const weeks = toWeeks(cells)
  // Columna de HOY (0..6) → resaltamos su letra en el encabezado ("estás aquí").
  const todayIndex = cells.findIndex((c) => c.isToday)
  const todayCol = todayIndex >= 0 ? todayIndex % GARDEN_COLS : -1

  return (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_INITIALS().map((d, i) => (
          <Text
            key={i}
            style={[
              styles.weekday,
              {
                color: i === todayCol ? theme.colors.text : theme.colors.textMuted,
                fontWeight: i === todayCol ? '800' : '700',
              },
            ]}
          >
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((cell) => {
              // Hueco recuperable: celda tappable con afiche "planta el día que faltó".
              if (cell.iso === recoverableGapIso && onPlantGap) {
                return (
                  <Pressable
                    key={cell.iso}
                    onPress={() => onPlantGap(cell.iso)}
                    accessibilityRole="button"
                    accessibilityLabel={t('garden:grid.plantGapLabel')}
                    style={({ pressed }) => [
                      styles.cell,
                      styles.plantable,
                      { backgroundColor: theme.isDark ? 'rgba(226,147,94,0.18)' : 'rgba(226,147,94,0.12)' },
                      pressed && styles.cellPressed,
                    ]}
                  >
                    <Svg width={20} height={20}>
                      <Circle cx={10} cy={10} r={8} stroke={CORAL} strokeWidth={1.6} strokeDasharray="3 3" fill="none" />
                      <Circle cx={10} cy={10} r={2.4} fill={CORAL} />
                    </Svg>
                  </Pressable>
                )
              }
              const planted = isPlanted(cell.stage)
              return (
                <View
                  key={cell.iso}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: tileBg(cell.stage, theme),
                      // "Montículo" de tierra: sombra interna solo en las plantadas.
                      boxShadow: planted ? 'inset 0 -7px 11px -6px rgba(60,125,52,0.20)' : undefined,
                    },
                  ]}
                >
                  <Sprout
                    stage={cell.stage}
                    fernSize={cell.fernSize}
                    animateIn={Boolean(justPlantedToday) && cell.isToday && cell.stage === 'seed'}
                  />
                </View>
              )
            })}
          </View>
        ))}
      </View>

      {showLegend && (
        <Animated.View
          entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
          style={styles.legend}
        >
          {LEGEND.map((l) => (
            <View
              key={l.key}
              style={[
                styles.chip,
                { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : '#F2EFE6' },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: l.color }]} />
              <Text style={[styles.chipText, { color: theme.colors.textMuted }]}>
                {t(`garden:legend.${l.key}`)}
              </Text>
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  weekdayRow: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: 9,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  grid: {
    gap: GAP,
  },
  week: {
    flexDirection: 'row',
    gap: GAP,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    overflow: 'hidden',
  },
  plantable: {
    justifyContent: 'center',
    paddingBottom: 0,
  },
  cellPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    marginTop: 18,
    paddingBottom: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
  },
})

export const GardenGrid = memo(GardenGridImpl)
