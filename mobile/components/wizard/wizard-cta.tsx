// CTA primario de un wizard del rediseño. Transcrito de
// `add-fijo-v2-screen.tsx` (los dos botones del footer colapsados en uno con
// `variant`), sin la lógica del alta de fijos.
//
// SIN CONSUMIDORES todavía: se crea para agregar-gasto y agregar-ingreso. El
// alta de fijos sigue montando su copia hasta que se migre en otra tanda.
import { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { usePressScale } from '@/hooks/use-press-scale'
import { motionDurations } from '@/lib/motion'
import { useWizardSkin } from '@/components/wizard/wizard-skin'
import { useAppTheme } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface WizardCtaProps {
  /** Ya traducido, y ya resuelto para el estado: quien lo monta decide si dice
   *  "Ver impacto" o "Completá los datos". */
  label: string
  accessibilityLabel: string
  /** ¿El paso está completo? NO deshabilita: atenúa. */
  ready: boolean
  /** Se llama SIEMPRE que se toca. El flujo decide qué hacer con `ready`
   *  false: marcar los campos que faltan, no ignorar el tap. */
  onPress: () => void
  /** Mutation en vuelo. Es el ÚNICO caso en que el botón no responde. */
  pending?: boolean
  /** `primary` = avanzar (verde con gradiente); `confirm` = cerrar el flujo
   *  (par invertido sólido, sin gradiente). El handoff los distingue a
   *  propósito: el verde dice "seguí", y confirmar no es seguir. */
  variant?: 'primary' | 'confirm'
}

/**
 * El botón NUNCA va `disabled` por datos faltantes: se atenúa pero sigue
 * siendo tocable, y el tap routea al branch de "marcá lo que falta", que pinta
 * los campos vacíos con su glide de warning. Un `disabled` deja al usuario sin
 * ninguna forma de averiguar qué le falta. Mismo patrón que el PrimaryCTA de
 * import-review.
 *
 * El paso de "faltan datos" a "listo" se INTERPOLA: sin transición son dos
 * estados sin relación entre sí; con ella el botón se lee como un indicador de
 * que el formulario se está completando.
 *
 * CONTRASTE — por qué la atenuación NO va sobre el Pressable entero:
 * `opacity` en RN aplana el subárbol en una capa y la compone contra el fondo,
 * así que atenuar el conjunto desvanece el FILL y la TINTA contra el mismo
 * `screenBackground`: el par `#4E9E52`/`#F5F2E1` a 0.45 colapsaba a ~1.58:1
 * sobre un texto de 16px, y el paso 1 ABRE en ese estado. No aplica la
 * excepción de WCAG para controles inactivos —el botón no está deshabilitado y
 * es el único camino para enterarse de qué falta—. Ahora se atenúa SÓLO la
 * superficie (capa propia debajo del label) y la tinta cruza con
 * `interpolateColor` a una que sí contrasta contra el fill desvanecido: 6.9:1
 * en claro y 5.7:1 en oscuro para el CTA de avanzar. El único caso donde el
 * conjunto se sigue atenuando es `pending`, que SÍ va `disabled`.
 */
export function WizardCta({
  label,
  accessibilityLabel,
  ready,
  onPress,
  pending = false,
  variant = 'primary',
}: WizardCtaProps) {
  const { theme } = useAppTheme()
  const skin = useWizardSkin()
  const neo = skin.kind === 'neo' ? skin : null
  const press = usePressScale({ pressedScale: 0.97 })
  const reduceMotion = useReducedMotion()

  const readyValue = useSharedValue(ready ? 1 : 0)
  useEffect(() => {
    const to = ready ? 1 : 0
    readyValue.value = reduceMotion
      ? to
      : withTiming(to, { duration: motionDurations.standard })
  }, [ready, reduceMotion, readyValue])
  // SÓLO la superficie. El `pending` no entra acá: va como opacidad del
  // Pressable, que en ese estado sí está `disabled`.
  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + readyValue.value * 0.55,
  }))

  // Tinta del estado "faltan datos": la que contrasta contra el fill YA
  // desvanecido hacia `screenBackground`, no la del estado listo (que se
  // diseñó contra el fill a plena opacidad y ahí deja de leerse).
  //  · neo, avanzar   → `ink.title` (6.9:1 en claro, 5.7:1 en oscuro).
  //  · neo, confirmar → `ink.title` en claro (4.4:1); en oscuro el fill del
  //    paso 2 es el par INVERTIDO (crema sólido), así que su propia tinta
  //    oscura es la que sigue leyéndose sobre el desvanecido (4.2:1).
  //  · classic        → la tinta oscura del tema (el fill es el opuesto).
  const mutedInk = neo
    ? theme.isDark && variant === 'confirm'
      ? neo.add.ctaStep2.ink
      : neo.ink.title
    : theme.isDark
      ? theme.colors.creamCard
      : theme.colors.text
  const readyInk = neo
    ? variant === 'primary'
      ? neo.add.cta.ink
      : neo.add.ctaStep2.ink
    : theme.colors.creamCard
  const inkStyle = useAnimatedStyle(() => ({
    color: interpolateColor(readyValue.value, [0, 1], [mutedInk, readyInk]),
  }))

  // Geometría en el Pressable (define el área táctil y el alto de la banda);
  // material en la capa de abajo, que es la única que se atenúa.
  const neoGeometry = neo
    ? { borderRadius: neo.add.cta.radius, paddingVertical: neo.add.cta.padV }
    : null
  const surfaceMaterial = neo
    ? variant === 'primary'
      ? {
          backgroundColor: neo.add.cta.background,
          experimental_backgroundImage: neo.add.cta.gradientCss,
          borderRadius: neo.add.cta.radius,
          boxShadow: neo.add.cta.shadow,
        }
      : {
          backgroundColor: neo.add.ctaStep2.background,
          borderRadius: neo.add.cta.radius,
          boxShadow: neo.add.ctaStep2.shadow,
        }
    : { backgroundColor: theme.colors.text, borderRadius: 16 }

  return (
    <Animated.View style={press.animatedStyle}>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={pending}
        style={[styles.primaryCta, neoGeometry, { opacity: pending ? 0.7 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {/* Capa de material, DEBAJO del label: es lo único que se desvanece.
            `pointerEvents="none"` para no robarle el tap al Pressable. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, surfaceMaterial, surfaceStyle]}
        />
        <Animated.Text
          style={[
            styles.primaryCtaText,
            neo
              ? {
                  fontSize: neo.add.cta.fontSize,
                  fontWeight: '900',
                  fontFamily: neo.font('900'),
                }
              : null,
            inkStyle,
          ]}
        >
          {label}
        </Animated.Text>
      </AnimatedPressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  primaryCta: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // No marginHorizontal acá: el StickyFooter vive adentro del contenido del
    // ScrollView del Screen, que ya aplica 20pt de padding horizontal.
    // Agregar margen encima double-padea el CTA y lo deja ~40pt más angosto
    // que los inputs de arriba.
  },
  primaryCtaText: { fontSize: 15, fontWeight: '800', fontFamily: nunitoFamily('800') },
})
