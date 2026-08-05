// @i18n-ignore-file — kit de rediseño bajo gate; copy literal, i18n en el pase posterior.
//
// BK · Botón "Volver al calendario" (handoff v2, Componentes §07).
//
// REEMPLAZA al chip `📅 Ver mes` de v1. El chip dibujaba ~23px de alto y era el
// ÚNICO camino de vuelta del detalle de día al calendario: llegaba a 44px solo
// a fuerza de `hitSlop={12}`, o sea el target era invisible. v2 lo convierte en
// un botón real de la fila — `flex:1`, `minHeight:44`, superficie elevada,
// chevron en pastilla hundida y etiqueta que trunca — y baja `DÍA SELECCIONADO`
// a una segunda línea, que además le deja el ancho al badge de estado.
import { memo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { GASTOS_SPEC, type GastosMode } from '@/components/redesign/gastos/gastos-spec'
import { usePressScale } from '@/hooks/use-press-scale'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

function ChevronBack({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 6l-6 6 6 6" />
    </Svg>
  )
}

export interface BackToCalendarButtonProps {
  mode: GastosMode
  /** Etiqueta visible. Trunca con elipsis (BK · "texto largo"). */
  label?: string
  onPress?: () => void
}

/**
 * El press hunde la superficie (`backBtnPressedShadow`) ADEMÁS del scale 0.96
 * del handoff. El scale va por `usePressScale` (hilo de UI); la sombra NO puede
 * ir por ahí — `boxShadow` es un string multi-capa, no un valor interpolable, y
 * `usePressScale` además no anima nada con reduced-motion activo (ahí el hundido
 * queda como el único feedback). Un `useState` local alcanza: el componente es
 * una hoja memoizada, así que el re-render del press no toca el resto del
 * encabezado.
 */
export const BackToCalendarButton = memo(function BackToCalendarButton({
  mode,
  label = 'Volver al calendario',
  onPress,
}: BackToCalendarButtonProps) {
  const s = GASTOS_SPEC[mode]
  const press = usePressScale({ pressedScale: 0.96 })
  const [isPressed, setIsPressed] = useState(false)

  const inner = (
    <>
      <View
        style={[
          styles.ico,
          { backgroundColor: s.backBtnIcoBackground ?? 'transparent', boxShadow: s.backBtnIcoShadow },
        ]}
      >
        <ChevronBack color={s.backBtnIcoInk} />
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: s.backBtnTextInk }]}>
        {label}
      </Text>
    </>
  )

  const surface = [
    styles.btn,
    { backgroundColor: s.backBtnBackground },
    s.backBtnGradientCss ? { experimental_backgroundImage: s.backBtnGradientCss } : null,
  ]

  if (!onPress) {
    return <View style={[...surface, { boxShadow: s.backBtnShadow }]}>{inner}</View>
  }
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={() => {
        setIsPressed(true)
        press.onPressIn()
      }}
      onPressOut={() => {
        setIsPressed(false)
        press.onPressOut()
      }}
      style={[
        ...surface,
        { boxShadow: isPressed ? s.backBtnPressedShadow : s.backBtnShadow },
        press.animatedStyle,
      ]}
    >
      {inner}
    </AnimatedPressable>
  )
})

const styles = StyleSheet.create({
  btn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    // El target de 44px es el punto del componente: no bajar de acá.
    minHeight: 44,
    borderRadius: 16,
    paddingLeft: 7,
    paddingRight: 14,
  },
  ico: {
    flexShrink: 0,
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flexShrink: 1, fontSize: 13, fontWeight: '900', fontFamily: nunitoFamily('900') },
})
