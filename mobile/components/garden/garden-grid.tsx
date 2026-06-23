import { memo, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { Sprout } from './sprout'
import { useAppTheme } from '@/theme/theme-provider'
import type { AppTheme } from '@/theme/palette'
import type { BroteStage, GardenCell } from '@/features/garden/garden-model'

interface GardenGridProps {
  cells: GardenCell[]
  /** Anima la entrada del brote de HOY (solo al recién plantar). */
  justPlantedToday?: boolean
}

const COLS = 7
const GAP = 7
// Inset horizontal del grid = padding del Screen (20×2) + de la gardenCard (22×2).
// Solo para ESTIMAR el cellSize en el primer frame (onLayout corrige con el real).
const GRID_INSET = 84

// Puntos de color de la leyenda (matchean los fills del glyph de cada estado).
const LEGEND: Array<{ label: string; color: string }> = [
  { label: 'semilla', color: '#C29A5E' },
  { label: 'creciendo', color: '#A9D57F' },
  { label: 'arraigado', color: '#4F9E45' },
  { label: 'salteado', color: '#CBC6B6' },
]

function isPlanted(stage: BroteStage): boolean {
  return stage === 'seed' || stage === 'germ' || stage === 'fern'
}

// Fondo del tile por estado. TODA celda tiene tile (la grilla se lee como una
// matriz contenida dentro de la card, no flotando sobre el fondo de pantalla).
function tileBg(stage: BroteStage, theme: AppTheme): string {
  const isDark = theme.isDark
  switch (stage) {
    case 'fern':
      return theme.colors.gardenSoilFern
    case 'seed':
    case 'germ':
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

function GardenGridImpl({ cells, justPlantedToday }: GardenGridProps) {
  const { theme } = useAppTheme()
  const { width: windowWidth } = useWindowDimensions()
  const [measuredWidth, setMeasuredWidth] = useState(0)
  // Ancho del grid: estimado desde el window en el PRIMER frame (sin esperar
  // onLayout) → las celdas rinden ya, sin pop ni colapso de altura; onLayout
  // corrige con el ancho real. Floor → las 7 columnas SIEMPRE entran (sub-pixel
  // hacía wrappear la 7ª).
  const width = measuredWidth || Math.max(0, windowWidth - GRID_INSET)
  const cellSize = Math.floor((width - (COLS - 1) * GAP) / COLS)

  const onLayout = (e: LayoutChangeEvent) => setMeasuredWidth(e.nativeEvent.layout.width)

  return (
    <View>
      <View style={styles.grid} onLayout={onLayout}>
        {cellSize > 0 &&
          cells.map((cell) => {
            const planted = isPlanted(cell.stage)
            return (
              <View
                key={cell.iso}
                style={[
                  styles.cell,
                  {
                    width: cellSize,
                    height: cellSize,
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
      <View style={styles.legend}>
        {LEGEND.map((l) => (
          <View
            key={l.label}
            style={[
              styles.chip,
              { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : '#F2EFE6' },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: l.color }]} />
            <Text style={[styles.chipText, { color: theme.colors.textMuted }]}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    overflow: 'hidden',
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
