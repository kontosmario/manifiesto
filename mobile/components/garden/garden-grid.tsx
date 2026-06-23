import { memo, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Sprout } from './sprout'
import { useAppTheme } from '@/theme/theme-provider'
import type { GardenCell } from '@/features/garden/garden-model'

interface GardenGridProps {
  cells: GardenCell[]
  /** Anima la entrada del brote de HOY (solo al recién plantar). */
  justPlantedToday?: boolean
}

const COLS = 7
const GAP = 8

// Puntos de color de la leyenda (matchean los fills del prototipo).
const LEGEND: Array<{ label: string; color: string }> = [
  { label: 'semilla', color: '#C29A5E' },
  { label: 'creciendo', color: '#A9D57F' },
  { label: 'arraigado', color: '#4F9E45' },
  { label: 'salteado', color: '#CBC6B6' },
]

function isPlanted(stage: GardenCell['stage']): boolean {
  return stage === 'seed' || stage === 'germ' || stage === 'fern'
}

function GardenGridImpl({ cells, justPlantedToday }: GardenGridProps) {
  const { theme } = useAppTheme()
  const [width, setWidth] = useState(0)
  const cellSize = width > 0 ? (width - (COLS - 1) * GAP) / COLS : 0

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)

  return (
    <View>
      <View style={styles.grid} onLayout={onLayout}>
        {cellSize > 0 &&
          cells.map((cell) => {
            const planted = isPlanted(cell.stage)
            const soil =
              cell.stage === 'fern'
                ? theme.colors.gardenSoilFern
                : planted
                  ? theme.colors.gardenSoil
                  : cell.stage === 'pending'
                    ? 'rgba(166,239,143,0.12)'
                    : 'transparent'
            const bordered = !planted && cell.stage !== 'pending'
            return (
              <View
                key={cell.iso}
                style={[
                  styles.cell,
                  {
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: soil,
                    boxShadow: planted ? 'inset 0 -7px 11px -6px rgba(60,125,52,0.22)' : undefined,
                    borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
                    borderColor: theme.colors.line,
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
          <View key={l.label} style={[styles.chip, { backgroundColor: theme.colors.creamSoft }]}>
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
    paddingBottom: 6,
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
