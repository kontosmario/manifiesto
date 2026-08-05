// Cáscara de un wizard del rediseño: fondo, columna scrolleable, footer
// anclado al piso y hoja de teclado. Transcrito de `add-fijo-v2-screen.tsx`
// (la composición aprobada), sin la lógica del alta de fijos.
//
// La montan los dos wizards nuevos (`add-gasto-v2-screen` y
// `add-income-v2-screen`), que así no vuelven a derivar la cadena de `flexGrow`
// a ojo. El alta de fijos sigue montando su propia copia — migrarla es un
// cambio de una pantalla viva y aprobada, y va en otra tanda.
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import {
  Keyboard,
  Pressable,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native'
import { Screen } from '@/components/ui/screen'
import { StickyFooter } from '@/components/ui/sticky-footer'
import { useWizardSkin } from '@/components/wizard/wizard-skin'

export interface WizardShellProps {
  /** Paso actual (1-based). Al cambiar, el scroll vuelve arriba. */
  step: number
  /** Cuerpo del paso. NO montar un ScrollView propio acá adentro: el `Screen`
   *  ya scrollea y anidar otro duplica su padding de 20. */
  children: ReactNode
  /** Va dentro del `StickyFooter` — típicamente un `<WizardCta>`. */
  footer: ReactNode
  /** Aire arriba del CTA. El handoff usa 14 en el paso de carga y 10 en el de
   *  resumen (donde el contenido llega más abajo). */
  footerPaddingTop?: number
  /** Numpad / picker del flujo. Va FUERA del scroll y fuera del footer: es una
   *  hoja que se apoya sobre la pantalla. */
  keyboard?: ReactNode
  showGrabHandle?: boolean
  /** Default: cerrar el teclado. */
  onPressBackground?: () => void
  /**
   * Ref del ScrollView. Si no se pasa, la cáscara crea el suyo — se acepta de
   * afuera para que el flujo pueda cablear `useNumpadScrollAvoid`, que necesita
   * el MISMO ScrollView que scrollea el paso.
   */
  scrollRef?: RefObject<ScrollView | null>
  /** Se compone con el del `Screen` (que ya encadena el suyo). Lo pide el
   *  tracking de offset de `useNumpadScrollAvoid`. */
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  /**
   * Colchón extra abajo mientras una hoja tapa el piso de la pantalla (el
   * numpad). Sin él el `scrollTo` que destapa el campo se clampea contra el
   * final del contenido y el campo queda debajo de la hoja igual.
   */
  extraBottomPad?: number
}

export function WizardShell({
  step,
  children,
  footer,
  footerPaddingTop = 14,
  keyboard,
  showGrabHandle = true,
  onPressBackground,
  scrollRef: externalScrollRef,
  onScroll,
  extraBottomPad = 0,
}: WizardShellProps) {
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null

  // Al cambiar de paso el scroll vuelve arriba. Sin esto, quien llenó el paso
  // anterior hasta el final entra al siguiente con el scroll heredado y
  // aterriza a mitad de contenido, sin ver el encabezado del paso — que suele
  // ser el punto. `animated: false` porque el contenido se está reemplazando:
  // un scroll suave sobre un árbol que ya cambió se ve como un salto, no como
  // un desplazamiento.
  const ownScrollRef = useRef<ScrollView>(null)
  const scrollRef = externalScrollRef ?? ownScrollRef
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }, [step, scrollRef])

  return (
    <Screen
      // Sin esto el wizard usa el fondo de la app (`#F4F2ED`/`#12211A`) en vez
      // del del rediseño: el relieve del botón de volver no se lee y la banda
      // del footer queda de otro color.
      backgroundColor={neo ? neo.screenBackground : undefined}
      // El handoff ancla el CTA abajo (`margin-top:auto` en una columna
      // `flex:1`). Acá el `StickyFooter` vive DENTRO del ScrollView, así que
      // fluye con el contenido: en pantallas altas quedaba flotando a media
      // altura con aire muerto abajo. La cadena de `flexGrow` —contenedor del
      // scroll, cuerpo y stack— hace que la columna ocupe al menos el alto
      // disponible y que el stack empuje al footer contra el piso, sin
      // impedir que crezca y scrollee si el contenido es más alto. Los tres
      // eslabones son necesarios: si falta uno, o el footer flota o el
      // contenido deja de scrollear.
      scrollRef={scrollRef}
      onScroll={onScroll}
      contentContainerStyle={neo ? [styles.screen, styles.screenNeo] : styles.screen}
      bodyStyle={neo ? styles.bodyNeo : undefined}
      showGrabHandle={showGrabHandle}
      // Los DOS wizards que montan esta cáscara viven en rutas registradas
      // con `presentation: 'modal'` (`add-expense` y `add-income` en
      // `app-stack-shell.tsx`), o sea hojas de iOS: no les corresponde el
      // inset superior del dispositivo. Sin esto quedaba un hueco muerto de
      // ~59pt entre el borde de la hoja y el título — "ese gap de altura...
      // un safe area que no les corresponde" (owner, 2026-08-04). Está
      // hardcodeado y no expuesto como prop porque montar esta cáscara
      // FUERA de una hoja modal no es un caso que exista; si aparece uno,
      // convertilo en prop antes de montarlo.
      presentedAsSheet
    >
      {/* `accessible={false}` es LOAD-BEARING: `Pressable` pone
          `accessible: accessible !== false` por default, y en iOS un contenedor
          accesible FUSIONA a todos sus descendientes en un solo elemento. Sin
          esto, VoiceOver anunciaba el paso entero (card de monto, chips, tiles,
          input) como un único botón y ninguno de los controles se podía enfocar
          ni activar. El tap para cerrar el teclado se sigue capturando igual. */}
      <Pressable
        accessible={false}
        style={[
          neo ? [styles.stack, styles.stackNeo] : styles.stack,
          // El colchón va en el STACK, no en el contentContainer: así el
          // footer se corre abajo de la hoja (donde igual queda tapado) y lo
          // que gana recorrido es el paso, que es lo que hay que destapar.
          extraBottomPad > 0
            ? { paddingBottom: (neo ? 18 : 40) + extraBottomPad }
            : null,
        ]}
        onPress={onPressBackground ?? Keyboard.dismiss}
      >
        {children}
      </Pressable>

      {/* El footer pinta `theme.colors.canvas` (`#F4F2ED`/`#12211A`). Mientras
          toda la pantalla era canvas no se veía; con el fondo del rediseño
          (`#E9EBE0`/`#16271C`) se convierte en una banda de otro color abajo
          del CTA. El handoff separa el bloque con padding, no con una banda. */}
      <StickyFooter
        divider={false}
        style={
          neo
            ? {
                backgroundColor: neo.screenBackground,
                paddingTop: footerPaddingTop,
              }
            : undefined
        }
      >
        {footer}
      </StickyFooter>

      {keyboard}
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingTop: 4 },
  screenNeo: { flexGrow: 1 },
  bodyNeo: { flexGrow: 1 },
  stack: { gap: 12, paddingBottom: 40 },
  // El footer anclado ya no necesita el colchón de 40 para empujar al CTA
  // abajo — pero SÍ una separación mínima. Sin ella, en cuanto el contenido
  // llega hasta abajo el CTA queda pegado al último elemento. 18 + el
  // `paddingTop` del footer (14 / 10) da el aire del handoff en el caso corto
  // y una separación que se sostiene en el largo.
  stackNeo: { flexGrow: 1, paddingBottom: 18 },
})
