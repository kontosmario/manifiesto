import { Pressable, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { useFijosSkin } from '@/components/fijos/fijos-skin'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Botón inline "Pagar" — pill NEUTRO con el mismo lenguaje que el CTA
 * primario de la app: fill y tinta son el par de máximo contraste del tema,
 * nunca un color de estado. Confiado, on-brand, calmo (la app no usa fills
 * saturados para acciones).
 *
 * Igual para `pending` y `overdue` a propósito: la urgencia del vencido ya
 * la comunica el status badge de la fila ("Vencida Nd"), así que el botón
 * no necesita gritar. SIN halo pulse — el loop infinito anterior era
 * invasivo y contradecía el criterio del owner ("no más pulsos").
 *
 * Único movimiento: press-scale sutil al tocar (vía `pressScale`).
 */
export function InlinePayButton({
  status,
  pressScale,
  onPress,
  fullWidth = false,
}: {
  status: 'pending' | 'overdue'
  pressScale: ReturnType<typeof usePressScale>
  onPress: () => void
  /**
   * CTA de ancho completo, para la card EXPANDIDA. En la fila superior del
   * handoff el pill convive con el monto a 21/900 y no queda ancho para el
   * nombre (medido: 47px disponibles, "Netflix" necesita ~75). El handoff ya
   * usa un CTA de ancho completo abajo de la card ("Editar" en pendiente,
   * acción doble en pagada), así que Pagar baja a ese slot al expandir.
   */
  fullWidth?: boolean
}) {
  const { theme } = useAppTheme()
  const skin = useFijosSkin()
  const { t } = useTranslation()
  const isOverdue = status === 'overdue'
  const ink = skin.kind === 'neo' ? skin.pay.ink : theme.colors.creamCard

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isOverdue ? t('fijos:row.payOverdue') : t('fijos:row.pay')}
      accessibilityHint={t('fijos:row.payHint')}
      style={[styles.inlinePayWrap, fullWidth ? styles.fullWidthWrap : null]}
    >
      <Animated.View
        style={[
          styles.inlinePayBtn,
          { backgroundColor: theme.colors.text },
          // El par del handoff se INVIERTE por tema: forest sobre crema en
          // claro, crema sobre forest en oscuro — el mismo par que el tab
          // activo, que es el ancla del "esto se toca" de la vista.
          skin.kind === 'neo'
            ? {
                backgroundColor: skin.pay.background,
                borderRadius: skin.pay.radius,
                boxShadow: skin.pay.shadow,
                paddingHorizontal: skin.pay.padH,
                paddingVertical: skin.pay.padV,
              }
            : null,
          fullWidth ? styles.fullWidthBtn : null,
          pressScale.animatedStyle,
        ]}
      >
        <MaterialIcons name="attach-money" size={16} color={ink} />
        <Text
          style={[
            styles.inlinePayLabel,
            { color: ink },
            skin.kind === 'neo' ? { fontFamily: skin.font('800') } : null,
          ]}
        >
          {t('fijos:row.pay')}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  inlinePayWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    // Aire entre el monto (dato) y el pill (acción) → leen como columnas
    // distintas, no como "dos cosas de plata" pegadas.
    marginLeft: 10,
  },
  inlinePayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 11,
  },
  inlinePayLabel: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.2,
  },
  // Ancho completo: el wrap pierde el margen izquierdo (ya no está al lado
  // del monto, es una fila propia) y el botón se estira.
  fullWidthWrap: { marginLeft: 0, alignSelf: 'stretch' },
  fullWidthBtn: { alignSelf: 'stretch', paddingVertical: 13 },
})
