import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import { triggerHaptic } from '@/lib/haptics'
import { cssGradient, neoRadii, neoTokens } from '@/theme/neo-tokens'
import { nunitoFamily } from '@/theme/typography'
import { useTour } from './tour-context'

/**
 * Tinta del overlay del tour.
 *
 * La card flota SIEMPRE sobre el scrim del tour, que es oscuro en los dos
 * temas (`tour-provider.tsx` L16-17: '#06120C' al 0.78, sin rama clara).
 * Por eso el tooltip se ancla a la rama OSCURA de la paleta neo en claro y
 * en oscuro: es la misma intención del docblock V1 ("la card es
 * deliberadamente oscura porque una superficie clara leería como un halo
 * sobre el scrim"), ahora expresada en tokens del rediseño en vez de en la
 * rampa verde-bosque de la V1.
 *
 * ACOPLE: si algún día el scrim pasa a ser `neo.scrim` theme-aware (en
 * claro es '#B9BEAC', un salvia CLARO), esta constante tiene que pasar a
 * `neoTokens(useThemeTokens().mode)` EN EL MISMO CAMBIO — si no, en claro
 * quedaría una card oscura sobre un scrim claro.
 */
const overlayNeo = neoTokens('dark')

const FALLBACK_BACKGROUND = overlayNeo.sheet
const FALLBACK_FOREGROUND = overlayNeo.text
const FALLBACK_FOREGROUND_MUTED = overlayNeo.textMuted

/**
 * ¿Este device dibuja `boxShadow` OUTSET? RN 0.81 lo traduce a la API
 * nativa de Android, que soporta outset desde API 28 (el helper compartido
 * `SUPPORTS_INSET_SHADOW` mide el piso del INSET, API 29). Por debajo el
 * valor se descarta EN SILENCIO.
 *
 * Importa acá porque el relieve es lo único que separa (a) la card del
 * scrim y (b) la píldora "Anterior" de la card — su fill `surface`
 * (#1D3426) contra la hoja (#1B2F22) es ~1.05:1. Sin sombra desaparecen
 * las dos, así que en ese piso caemos a `elevation` (card) y a un hairline
 * (píldora), igual que hace `NeoButton` con su variante `ghost`.
 */
const SUPPORTS_OUTSET_SHADOW =
  Platform.OS !== 'android' ||
  (typeof Platform.Version === 'number' && Platform.Version >= 28)

/**
 * The card that explains what each step is about. Pulls everything
 * — current step text, step number, navigation, defaults — from the
 * tour context. Per-step `tooltip` overrides on the active step's
 * `<TourTarget>` win over provider defaults.
 *
 * Material del rediseño neumórfico: hoja `sheet` con relieve `raisedXl`
 * (superficie flotante), píldora secundaria extruida `raisedSm` y CTA con
 * el fill radial verde del handoff — el mismo que monta `NeoButton`
 * variante `primary` en modo oscuro. Ver `overlayNeo` arriba para por qué
 * la paleta está fijada a la rama oscura en los dos temas.
 */
export function TourTooltip() {
  const {
    activeIndex,
    totalSteps,
    isFirstStep,
    isLastStep,
    currentStep,
    next,
    prev,
    stop,
    defaults,
  } = useTour()

  if (!currentStep) return null

  // Read the current step's config fresh from the ref — this lets
  // per-step `text` / `tooltip` updates flow through without the
  // step needing to re-register.
  const config = currentStep.configRef.current
  const tooltipStyle = config.tooltip
  const background = tooltipStyle?.backgroundColor ?? FALLBACK_BACKGROUND
  const foreground = tooltipStyle?.foregroundColor ?? FALLBACK_FOREGROUND
  const muted = tooltipStyle?.mutedForeground ?? FALLBACK_FOREGROUND_MUTED
  // El CTA del rediseño no es un fill plano: es el radial `circle at
  // 32% 28%` sobre el par `ctaGradient` + la sombra proyectada con línea
  // de luz interna (misma receta que `NeoButton` primary). Un paso que
  // pise `primaryColor` sigue ganando, pero entonces cae al fill plano de
  // ese color — un gradiente teñido a mano leería como error de render.
  const primaryOverride = tooltipStyle?.primaryColor
  const primaryMaterial = primaryOverride
    ? { backgroundColor: primaryOverride }
    : {
        ...cssGradient(
          `radial-gradient(circle at 32% 28%, ${overlayNeo.ctaGradient[0]}, ${overlayNeo.ctaGradient[1]} 85%)`,
          overlayNeo.ctaGradient[1],
        ),
        boxShadow: overlayNeo.shadows.cta,
      }
  const primaryFg = tooltipStyle?.primaryForeground ?? overlayNeo.ctaText

  const labels = defaults.labels

  const handleNext = () => {
    void triggerHaptic('light')
    if (isLastStep) {
      stop(true)
    } else {
      next()
    }
  }
  const handlePrev = () => {
    void triggerHaptic('light')
    prev()
  }
  const handleSkip = () => {
    void triggerHaptic('selection')
    stop(false)
  }

  return (
    <View style={[styles.card, { backgroundColor: background }]}>
      <View style={styles.header}>
        <Text style={[styles.counter, { color: muted }]}>
          {activeIndex + 1} / {totalSteps}
        </Text>
        <Pressable
          accessibilityLabel={labels.skip}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleSkip}
        >
          <Text style={[styles.skip, { color: muted }]}>{labels.skip}</Text>
        </Pressable>
      </View>
      {/* SOLO el texto scrollea. La cabecera (contador + Saltar) y la botonera
          de abajo quedan FIJAS: cuando el copy es largo —o la escala de texto
          es grande— el tooltip se recorta contra el hueco disponible, y si los
          botones vivieran dentro del scroll habria que desplazarse para llegar
          a "Siguiente". `flexShrink` deja que este bloque ceda alto primero;
          los otros dos conservan el suyo. */}
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyScrollContent}
        bounces={false}
        showsVerticalScrollIndicator
      >
        <Text style={[styles.body, { color: foreground }]}>{config.text}</Text>
      </ScrollView>
      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={labels.previous}
          accessibilityRole="button"
          accessibilityState={{ disabled: isFirstStep }}
          disabled={isFirstStep}
          hitSlop={8}
          onPress={handlePrev}
          style={({ pressed }) => [
            styles.secondary,
            {
              backgroundColor: overlayNeo.surface,
              opacity: isFirstStep ? 0.32 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.secondaryLabel, { color: foreground }]}>
            {labels.previous}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={isLastStep ? labels.finish : labels.next}
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleNext}
          style={({ pressed }) => [
            styles.primary,
            primaryMaterial,
            { opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <Text style={[styles.primaryLabel, { color: primaryFg }]}>
            {isLastStep ? labels.finish : labels.next}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: neoRadii.card,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
    // Sin borde: la card se despega por relieve, no por outline. Es una
    // superficie FLOTANTE, así que lleva `raisedXl` (10/22 + línea de luz
    // superior) y no la sombra `sheet`, que apunta hacia arriba porque
    // asume una hoja pegada al borde inferior.
    boxShadow: overlayNeo.shadows.raisedXl,
    // Android < API 28 descarta el boxShadow en silencio: ahí la card
    // quedaría plana sobre el scrim. `elevation` es la única sombra que
    // ese piso entiende (era la de la V1); arriba de API 28 va en 0 para
    // no duplicar el relieve.
    elevation: SUPPORTS_OUTSET_SHADOW ? 0 : 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bodyScroll: { flexShrink: 1, flexGrow: 0 },
  bodyScrollContent: { flexGrow: 0 },
  counter: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  skip: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    fontFamily: nunitoFamily('600'),
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  secondary: {
    borderRadius: neoRadii.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    // Tile extruido (mismo material que un chip), no un outline: el
    // secundario del rediseño se lee por relieve. El hairline sólo
    // aparece en el piso Android donde el boxShadow no existe.
    boxShadow: overlayNeo.shadows.raisedSm,
    borderWidth: SUPPORTS_OUTSET_SHADOW ? 0 : 1,
    borderColor: overlayNeo.sheetDivider,
  },
  secondaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    letterSpacing: 0.2,
  },
  primary: {
    borderRadius: neoRadii.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
    minWidth: 110,
    alignItems: 'center',
  },
  primaryLabel: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: nunitoFamily('800'),
    letterSpacing: 0.3,
  },
})
