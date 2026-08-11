import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { SUPPORTS_INSET_SHADOW } from '@/components/wizard/inset-shadow-support'
import { usePressScale } from '@/hooks/use-press-scale'
import { motionDurations } from '@/lib/motion'
import { neoRadii } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import {
  EXPO_OUT,
  OPTION_ENTER_MS,
  OPTION_STAGGER_MS,
  type WrappedTone,
} from '../wrapped-constants'

/**
 * Card de opción de leftover, en el vocabulario del sistema: tile EXTRUIDO
 * en reposo y HUNDIDO CON ANILLO al elegirlo.
 *
 * Ni el `boxShadow` ni el gradiente se interpolan, así que las dos
 * superficies viven en capas absolutas y lo que cruza es su opacidad —
 * mismo recurso que los chips del alta de gasto. Eso reemplaza al halo
 * `shadowColor` animado que tenía antes: la propiedad existía sólo porque
 * Reanimated sí anima `shadow*`, y era el único punto del wrapped que no
 * hablaba el idioma de relieve del resto de la app.
 *
 * Motion stack:
 * 1. Entrance stagger (solo MODE pending, primer mount): opacity + Y
 *    rise con delay por staggerIndex.
 * 2. Crossfade reposo ↔ elegido sobre `selectedProgress` 0→1.
 * 3. Press scale 0.97 via usePressScale.
 */
export function LeftoverOptionCard({
  icon,
  title,
  subtitle,
  selected,
  tone,
  disabled = false,
  readOnly = false,
  onPress,
  staggerIndex,
  stagger,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  title: string
  subtitle: string
  selected: boolean
  tone: WrappedTone
  disabled?: boolean
  /** Replay mode: ya hay decisión persistida. La selected card se ve
   *  como confirmed (hundida + anillo); las no-selected se silencian
   *  con opacity 0.35. Disabled true → sin onPress, sin haptic. */
  readOnly?: boolean
  onPress: () => void
  staggerIndex: number
  /** Si true, la card entra con stagger (delay = idx * 70ms). False
   *  en past mode (read-only) y en reduced motion. */
  stagger: boolean
}) {
  const selectedProgress = useSharedValue(selected ? 1 : 0)
  useEffect(() => {
    selectedProgress.value = withTiming(selected ? 1 : 0, {
      duration: motionDurations.standard,
      easing: EXPO_OUT,
    })
  }, [selected, selectedProgress])

  const press = usePressScale({ pressedScale: 0.97 })

  const idleStyle = useAnimatedStyle(() => ({ opacity: 1 - selectedProgress.value }))
  const activeStyle = useAnimatedStyle(() => ({ opacity: selectedProgress.value }))
  const glyphInk = selected ? tone.accent : tone.foregroundSoft

  // Opacity wrapper — opaco siempre que esté enabled. Las cards en
  // readOnly no-seleccionadas se silencian, y los disabled bajan.
  const baseOpacity = readOnly && !selected ? 0.35 : disabled ? 0.4 : 1

  return (
    // Outer wrapper: SOLO el entering (FadeIn) layout animation. Sin
    // estilos de opacity/transform compitiendo — Reanimated alertaba
    // "Property opacity may be overwritten by a layout animation" si
    // el mismo Animated.View tenía entering={FadeIn} + style={opacity}.
    <Animated.View
      entering={
        stagger
          ? FadeIn.delay(staggerIndex * OPTION_STAGGER_MS)
              .duration(OPTION_ENTER_MS)
              .easing(EXPO_OUT)
          : undefined
      }
    >
      {/* Inner wrapper: press scale + opacity statica del estado
          (readOnly/disabled/normal). Separado del entering = sin
          conflicto. */}
      <Animated.View style={[press.animatedStyle, { opacity: baseOpacity }]}>
        <Pressable
          // `disabled` ya bloquea taps; no necesitamos un no-op fn cuando
          // está en readOnly. Mantener `onPress={onPress}` directo evita
          // crear una nueva fn ref en cada render.
          onPress={onPress}
          onPressIn={readOnly || disabled ? undefined : press.onPressIn}
          onPressOut={readOnly || disabled ? undefined : press.onPressOut}
          disabled={disabled || readOnly}
          accessibilityRole="button"
          accessibilityState={{ selected, disabled: disabled || readOnly }}
        >
          <View style={leftoverCardStyles.card}>
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                leftoverCardStyles.layer,
                {
                  backgroundColor: tone.raisedBackground,
                  boxShadow: tone.shadows.raisedSm,
                },
                idleStyle,
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                leftoverCardStyles.layer,
                {
                  backgroundColor: tone.selectedTint,
                  boxShadow: tone.shadows.ringSelected,
                  // Donde el sistema descarta el `boxShadow` las dos capas
                  // quedan idénticas: ahí el anillo se dibuja como borde.
                  borderWidth: SUPPORTS_INSET_SHADOW ? 0 : 2.5,
                  borderColor: tone.ring,
                },
                activeStyle,
              ]}
            />
            <View
              style={[
                leftoverCardStyles.iconWrap,
                { backgroundColor: tone.selectedTint },
              ]}
            >
              <MaterialIcons name={icon} size={18} color={glyphInk} />
            </View>
            <View style={leftoverCardStyles.text}>
              <Text
                style={[leftoverCardStyles.title, { color: tone.foreground }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              <Text
                style={[leftoverCardStyles.subtitle, { color: tone.foregroundSoft }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>
            <MaterialIcons
              name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
              size={18}
              color={glyphInk}
            />
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

const leftoverCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderRadius: neoRadii.tile,
  },
  layer: {
    borderRadius: neoRadii.tile,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: {
    fontSize: 13.5,
    fontWeight: '900',
    fontFamily: nunitoFamily('900'),
    marginBottom: 1,
  },
  subtitle: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
  },
})
