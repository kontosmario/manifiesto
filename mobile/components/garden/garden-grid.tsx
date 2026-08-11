import { memo, useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { BrotMascot, type BrotPose } from '@/components/brot'
import { CardParticles } from '@/components/ui/card-particles'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { GARDEN_GEOMETRY, GARDEN_SPEC, type GardenSpec } from '@/components/redesign/garden/garden-spec'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motionSprings } from '@/lib/motion'
import { neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useThemeTokens } from '@/theme/theme-provider'
import { weekdayLongFromMondayIndex } from '@/utils/date-format'
import { GARDEN_COLS, type BroteStage, type GardenCell } from '@/features/garden/garden-model'

interface GardenGridProps {
  cells: GardenCell[]
  /** Anima la entrada del brote de HOY (solo al recién plantar). */
  justPlantedToday?: boolean
}

// Inicial de cada día (Lunes=0 … Domingo=6) — espejo de deriveGardenCells /
// deriveWeekStrip. La letra se deriva del idioma activo (NO un array ES fijo).
const WEEKDAY_INITIALS = (): string[] =>
  Array.from({ length: 7 }, (_, i) =>
    weekdayLongFromMondayIndex(i).charAt(0).toUpperCase(),
  )

/**
 * Mini-Brot por estado del día (handoff L81): crecido = `idle`, perdido =
 * `wilted`, hoy pendiente = `seed`. El día que un escudo recuperó también
 * planta una semilla: cuenta para la racha pero nunca llegó a crecer — se
 * distingue del pendiente porque su celda SÍ tiene el fill verde.
 */
function poseForStage(stage: BroteStage): BrotPose | null {
  switch (stage) {
    case 'seed':
    case 'germ':
    case 'fern':
    case 'bloom':
      return 'idle'
    case 'recovered':
    case 'pending':
      return 'seed'
    case 'missed':
      return 'wilted'
    case 'pre':
    default:
      return null
  }
}

function isPlanted(stage: BroteStage): boolean {
  return (
    stage === 'seed' ||
    stage === 'germ' ||
    stage === 'fern' ||
    stage === 'bloom' ||
    stage === 'recovered'
  )
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

// `animated={false}` en TODA la grilla: son hasta 35 canvas de Skia y el
// jardín se lee igual estático (decisión de handoff para grids).
const StaticBrot = memo(function StaticBrot({ pose }: { pose: BrotPose }) {
  return (
    <BrotMascot pose={pose} size={GARDEN_GEOMETRY.cellBrotSize} animated={false} shadow={false} />
  )
})

/** Brote recién plantado: el mini-Brot entra con el rebote de celebración. */
function PoppingBrot({ pose }: { pose: BrotPose }) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced ? 1 : 0.2)

  useEffect(() => {
    if (reduced) return
    scale.value = withSpring(1, motionSprings.celebrate)
  }, [reduced, scale])

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View style={style}>
      <StaticBrot pose={pose} />
    </Animated.View>
  )
}

const GardenDayCell = memo(function GardenDayCell({
  cell,
  spec,
  popIn,
}: {
  cell: GardenCell
  spec: GardenSpec
  popIn: boolean
}) {
  const pose = poseForStage(cell.stage)
  const planted = isPlanted(cell.stage)
  // HOY = anillo dashed durazno, sin fill ni hundido (queda "abierto"
  // hasta que el día se planta). El resto: pozo hundido, o fill verde si
  // el día ya está cumplido.
  const openToday = cell.isToday && !planted
  const wellShadow = cell.stage === 'pre' ? spec.cellFutureShadow : spec.cellWellShadow

  return (
    <View
      style={[
        styles.cell,
        planted
          ? { backgroundColor: spec.cellGrownBackground, boxShadow: spec.cellGrownShadow }
          : openToday
            ? null
            : [
                { backgroundColor: spec.cellWellBackground, boxShadow: wellShadow },
                // Android < API 29 descarta el inset EN SILENCIO: sin fill
                // propio (claro) el pozo desaparecería del todo.
                SUPPORTS_INSET_SHADOW ? null : { borderWidth: 1, borderColor: spec.hairline },
              ],
        cell.isToday
          ? [styles.todayRing, { borderColor: spec.todayInk }]
          : null,
      ]}
    >
      {pose ? popIn ? <PoppingBrot pose={pose} /> : <StaticBrot pose={pose} /> : null}
    </View>
  )
})

function GardenGridImpl({ cells, justPlantedToday }: GardenGridProps) {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  const spec = GARDEN_SPEC[theme.mode]
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
              i === todayCol
                ? { color: spec.todayInk, fontFamily: nunitoFamily('800') }
                : { color: neo.textMuted, fontFamily: nunitoFamily('700'), fontWeight: '700' },
            ]}
          >
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {weeks.map((week, wi) => {
          // Semana FLORECIDA (perfecta 7/7): toda la fila se cubre de
          // luciérnagas — la floración = la grilla de la semana con partículas.
          const weekBloomed =
            week.length === GARDEN_COLS && week.every((c) => c.stage === 'bloom')
          return (
            <View key={wi} style={styles.week}>
              {week.map((cell) => (
                <GardenDayCell
                  key={cell.iso}
                  cell={cell}
                  spec={spec}
                  popIn={Boolean(justPlantedToday) && cell.isToday && isPlanted(cell.stage)}
                />
              ))}
              {weekBloomed && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <CardParticles
                    count={9}
                    color={spec.bloomParticles.base}
                    accentColor={spec.bloomParticles.accent}
                    peachColor={spec.bloomParticles.peach}
                  />
                </View>
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  weekdayRow: {
    flexDirection: 'row',
    gap: GARDEN_GEOMETRY.cellGap,
    marginBottom: 8,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.4,
  },
  grid: {
    gap: GARDEN_GEOMETRY.cellGap,
  },
  week: {
    flexDirection: 'row',
    gap: GARDEN_GEOMETRY.cellGap,
  },
  cell: {
    flex: 1,
    height: GARDEN_GEOMETRY.cellHeight,
    borderRadius: GARDEN_GEOMETRY.cellRadius,
    alignItems: 'center',
    // El mini-Brot se apoya en el piso de la celda (3g: flex-end + 2px).
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  // iOS dibuja el dashed como línea llena cuando hay borderRadius: el
  // anillo sigue marcando HOY igual, sólo pierde el punteado.
  todayRing: {
    borderWidth: GARDEN_GEOMETRY.todayRingWidth,
    borderStyle: 'dashed',
  },
})

export const GardenGrid = memo(GardenGridImpl)
