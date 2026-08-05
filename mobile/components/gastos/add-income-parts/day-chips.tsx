// Chips "¿Cuándo?" del paso 2 (Hoy / Ayer / Anteayer).
//
// Comparten el idioma del chip de frecuencia de fijos: ELEVADO en reposo,
// INVERTIDO (sólido) al elegirlo. Ni el gradiente ni el `boxShadow` se
// interpolan, así que las dos superficies viven en capas absolutas y lo que se
// anima es su opacidad — es la única forma de que el chip cruce de un estado
// al otro con transición y no de un frame al siguiente.
import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
// Hook propio, nunca el de reanimated (import trap del jank de gama baja).
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { usePressScale } from '@/hooks/use-press-scale'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { triggerHaptic } from '@/lib/haptics'
import { motionDurations } from '@/lib/motion'
import { useAppTheme } from '@/theme/theme-provider'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface DayChoice<T extends number> {
  value: T
  label: string
}

export interface DayChipsProps<T extends number> {
  options: readonly DayChoice<T>[]
  value: T
  onSelect: (next: T) => void
  /** Nombre del GRUPO para el lector de pantalla (típicamente el eyebrow del
   *  campo). Sin el `radiogroup` que lo lleva, VoiceOver anuncia tres radios
   *  sueltos: no dice cuántas alternativas hay ni que son excluyentes. */
  accessibilityLabel?: string
}

export function DayChips<T extends number>({
  options,
  value,
  onSelect,
  accessibilityLabel,
}: DayChipsProps<T>) {
  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => (
        <DayChip
          key={option.value}
          label={option.label}
          selected={option.value === value}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  )
}

function DayChip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const reduceMotion = useReducedMotion()
  const press = usePressScale({ pressedScale: 0.95 })
  const progress = useSharedValue(selected ? 1 : 0)

  useEffect(() => {
    const target = selected ? 1 : 0
    progress.value = reduceMotion
      ? target
      : withTiming(target, { duration: motionDurations.standard })
  }, [selected, reduceMotion, progress])

  const idleStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }))
  const activeStyle = useAnimatedStyle(() => ({ opacity: progress.value }))
  // La tinta cruza junto con la superficie: al invertirse el chip, saltar de
  // la sub apagada a la activa de golpe se leía como parpadeo.
  const inkFrom = neo?.mutedInk ?? theme.colors.textMuted
  const inkTo = neo?.add.freqChip.activeInk ?? theme.colors.textOnPrimary
  const inkStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [inkFrom, inkTo]),
  }))

  if (!neo) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? theme.colors.primary : 'transparent',
            borderColor: selected ? theme.colors.primary : theme.colors.line,
            borderWidth: 1,
          },
        ]}
      >
        <Text
          style={[
            styles.label,
            { color: selected ? theme.colors.textOnPrimary : theme.colors.text },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    )
  }

  return (
    <AnimatedPressable
      onPress={() => {
        void triggerHaptic('selection')
        onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[
        styles.chipNeo,
        {
          borderRadius: neo.add.freqChip.radius,
          paddingHorizontal: neo.add.freqChip.padH,
          paddingVertical: neo.add.freqChip.padV,
        },
        press.animatedStyle,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: neo.add.freqChip.radius,
            backgroundColor: neo.add.quickChip.background,
            experimental_backgroundImage: neo.add.quickChip.gradientCss,
            boxShadow: neo.add.quickChip.shadow,
          },
          idleStyle,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: neo.add.freqChip.radius,
            backgroundColor: neo.add.freqChip.activeBackground,
            boxShadow: neo.add.freqChip.activeShadow,
          },
          activeStyle,
        ]}
      />
      <Animated.Text
        // Escala con el tamaño de texto del sistema —qué día se está eligiendo
        // es justo lo que hay que poder leer—, acotado para que las tres
        // opciones sigan entrando en una fila.
        maxFontSizeMultiplier={1.2}
        style={[
          styles.labelNeo,
          { fontSize: neo.add.freqChip.fontSize, fontFamily: neo.font('800') },
          inkStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Animated.Text>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  // `flex: 1` reparte el ancho entre las tres opciones: son alternativas del
  // mismo eje y tienen que leerse como una escala, no como tres pills sueltas.
  chipNeo: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700' },
  labelNeo: { fontWeight: '800', textAlign: 'center' },
})
