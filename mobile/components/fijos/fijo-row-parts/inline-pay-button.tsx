import { Pressable, StyleSheet, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import Animated from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'
import { usePressScale } from '@/hooks/use-press-scale'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Botón inline "Pagar" — pill NEUTRO con el mismo lenguaje que el CTA
 * primario de la app: fill oscuro (`theme.colors.text`) + texto crema
 * (`theme.colors.creamCard`). Confiado, on-brand, calmo (la app no usa
 * fills saturados para acciones).
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
}: {
  status: 'pending' | 'overdue'
  pressScale: ReturnType<typeof usePressScale>
  onPress: () => void
}) {
  const { theme } = useAppTheme()
  const { t } = useTranslation()
  const isOverdue = status === 'overdue'

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressScale.onPressIn}
      onPressOut={pressScale.onPressOut}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isOverdue ? t('fijos:row.payOverdue') : t('fijos:row.pay')}
      accessibilityHint={t('fijos:row.payHint')}
      style={styles.inlinePayWrap}
    >
      <Animated.View
        style={[
          styles.inlinePayBtn,
          { backgroundColor: theme.colors.text },
          pressScale.animatedStyle,
        ]}
      >
        <MaterialIcons
          name="attach-money"
          size={16}
          color={theme.colors.creamCard}
        />
        <Text style={[styles.inlinePayLabel, { color: theme.colors.creamCard }]}>
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
    letterSpacing: 0.2,
  },
})
