import { StyleSheet, View } from 'react-native'
import { neoTokens } from '@/theme/neo-tokens'
import { useThemeTokens } from '@/theme/theme-provider'

/**
 * Small horizontal pill rendered at the top of full-screen modals
 * (`presentation: 'modal'`) to visually telegraph the swipe-down
 * gesture that dismisses the sheet on iOS. Matches the dimensions
 * of the in-app numpad handle so the language is consistent across
 * every dismissable surface in the product.
 *
 * Geometría y tinta salen del handoff: píldora 44×5 radio 3 en
 * `neo.sheetHandle` — literalmente la misma que dibujan la piel neo de
 * `ModalCard`, `InAppNumpad` y `NumericEditSheet`. Ese "misma que el
 * numpad" del párrafo de arriba es un invariante real, no una
 * coincidencia: si acá quedaran los 40×4 de la V1, el alta de gasto,
 * la de ingreso y la de fijos mostrarían una píldora distinta a la de
 * cualquier hoja.
 */
export function ModalGrabHandle() {
  const theme = useThemeTokens()
  const neo = neoTokens(theme.mode)
  return (
    <View style={styles.area} pointerEvents="none">
      <View style={[styles.handle, { backgroundColor: neo.sheetHandle }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  area: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 0,
    // Pull the next element up to close the gap with the screen
    // header. The ScreenHeader's own paddingTop=10 leaves an awkward
    // void below the pill if we don't compensate.
    marginBottom: -25,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    // Sin `opacity`: la V1 la bajaba a 0.55 sobre un token de BORDE. Con
    // `sheetHandle` —que ya es la tinta exacta de la píldora en cada
    // tema— atenuarla la dejaría por debajo de 1.1:1 contra el fondo y
    // la única affordance del gesto de cierre desaparecería.
  },
})
