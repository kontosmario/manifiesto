import { useEffect, useMemo, useState } from 'react'
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/button'
import { ModalCard } from '@/components/ui/modal-card'
import { triggerHaptic } from '@/lib/haptics'
import { useAppTheme } from '@/theme/theme-provider'
import { radii } from '@/theme/palette'

interface EditPaydaySheetProps {
  visible: boolean
  currentValue: number
  isSaving: boolean
  onClose: () => void
  onSave: (nextValue: number) => void
}

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1)
const GRID_COLUMNS = 7
const GRID_GAP = 8

export function EditPaydaySheet({
  visible,
  currentValue,
  isSaving,
  onClose,
  onSave,
}: EditPaydaySheetProps) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const [selected, setSelected] = useState(currentValue)
  const [cellSize, setCellSize] = useState(0)

  const handleGridLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width
    if (width <= 0) return
    const next = (width - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
    setCellSize((prev) => (Math.abs(prev - next) < 0.5 ? prev : next))
  }

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate draft when sheet opens
      setSelected(currentValue)
    }
  }, [visible, currentValue])

  const canSave = useMemo(
    () => selected >= 1 && selected <= 31 && selected !== currentValue,
    [selected, currentValue],
  )

  return (
    <ModalCard
      onClose={onClose}
      subtitle={t('settings:editPayday.subtitle')}
      title={t('settings:editPayday.title')}
      visible={visible}
    >
      <View style={styles.stack}>
        <View style={styles.grid} onLayout={handleGridLayout}>
          {cellSize > 0 && DAYS.map((day) => {
            const isOn = day === selected
            return (
              <Pressable
                key={day}
                accessibilityLabel={t('settings:editPayday.dayA11y', { day })}
                accessibilityRole="button"
                accessibilityState={{ selected: isOn }}
                hitSlop={4}
                onPress={() => {
                  void triggerHaptic('selection')
                  setSelected(day)
                }}
                style={[
                  styles.cell,
                  {
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: isOn ? theme.colors.primary : theme.colors.creamCard,
                    borderColor: isOn ? theme.colors.primary : theme.colors.line,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    { color: isOn ? '#FFFFFF' : theme.colors.text },
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <AppButton
          disabled={!canSave}
          label={t('settings:editPayday.saveDay', { day: selected })}
          loading={isSaving}
          onPress={() => {
            if (!canSave) return
            onSave(selected)
          }}
        />
      </View>
    </ModalCard>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  cell: {
    borderWidth: 1,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 14,
    fontWeight: '700',
  },
})
