import { memo } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Sprout } from './sprout'
import { CATEGORY_ICONS } from '@/components/category/category-icon-registry'
import { CardParticles } from '@/components/ui/card-particles'
import { useAppTheme } from '@/theme/theme-provider'
import type { AppTheme } from '@/theme/palette'
import { weekdayLongFromMondayIndex } from '@/utils/date-format'
import { GARDEN_COLS, type BroteStage, type GardenCell } from '@/features/garden/garden-model'

interface GardenGridProps {
  cells: GardenCell[]
  /** Anima la entrada del brote de HOY (solo al recién plantar). */
  justPlantedToday?: boolean
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
                // HOY en coral → conecta la letra del header con el anillo de
                // la celda de hoy ("estás acá").
                color: i === todayCol ? CORAL : theme.colors.textMuted,
                fontWeight: i === todayCol ? '800' : '700',
              },
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
                    <Image
                      source={CATEGORY_ICONS['crecimiento/recuperable']}
                      style={styles.gapImg}
                      resizeMode="contain"
                    />
                  </Pressable>
                )
              }
              const planted = isPlanted(cell.stage)
              return (
                <View
                  key={cell.iso}
                  style={[
                    styles.cell,
                    // HOY: anillo coral + halo para ubicarte en el calendario.
                    cell.isToday && styles.cellToday,
                    {
                      backgroundColor: cell.isToday
                        ? theme.isDark
                          ? 'rgba(226,147,94,0.16)'
                          : 'rgba(226,147,94,0.12)'
                        : tileBg(cell.stage, theme),
                      // "Montículo" de tierra (plantadas) + halo coral (hoy).
                      boxShadow:
                        [
                          planted ? 'inset 0 -7px 11px -6px rgba(60,125,52,0.20)' : '',
                          cell.isToday ? '0 0 0 3px rgba(226,147,94,0.22)' : '',
                        ]
                          .filter(Boolean)
                          .join(', ') || undefined,
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
            {weekBloomed && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {/* Colores theme-aware: en LIGHT mode las luciérnagas crema se
                    perdían sobre la tierra clara → cálidos saturados (gold/coral)
                    que contrastan. En dark, crema/heroAccent como siempre. */}
                <CardParticles
                  count={9}
                  color={theme.isDark ? '#FFFBF2' : '#D6961F'}
                  accentColor={theme.isDark ? theme.colors.heroAccent : '#C2603A'}
                  peachColor={theme.isDark ? undefined : '#E0954A'}
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
    // Centrado en el casillero (antes flex-end + paddingBottom → anclado abajo).
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // HOY: anillo coral (2px) para ubicarte de un vistazo en el calendario.
  cellToday: {
    borderWidth: 2,
    borderColor: CORAL,
  },
  plantable: {
    justifyContent: 'center',
    paddingBottom: 0,
  },
  cellPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  gapImg: { width: 26, height: 26 },
})

export const GardenGrid = memo(GardenGridImpl)
