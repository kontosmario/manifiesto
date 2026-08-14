// @i18n-ignore-file — tooling dev-only gateado por __DEV__.
import { useCallback, useMemo, useState } from 'react'
import {
  PixelRatio,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { Text } from '@/components/ui/app-text'
import { LinearGradient } from 'expo-linear-gradient'
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  type EdgeInsets,
  type Metrics,
} from 'react-native-safe-area-context'
import { Screen } from '@/components/ui/screen'
import {
  buildEdgeLayers,
  buildEdgeVeil,
  EDGE_CURVE,
  LEGACY_BLUR_LAYERS,
  LEGACY_VEIL,
  SCROLL_EDGE_THRESHOLD,
  ScreenEdgeEffect,
  type EdgeLayer,
  type ScreenEdgeSide,
} from '@/components/ui/screen-edge-effect'
import { withAlpha } from '@/theme/color-utils'
import { useAppTheme, useThemeTokens } from '@/theme/theme-provider'
import { nunitoFamily } from '@/theme/typography'

/**
 * Banco de pruebas del EDGE-TO-EDGE + SCROLL EDGE EFFECT.
 *
 * El efecto solo existe cuando el device reporta un inset superior, así
 * que en web (inset 0) y en cualquier simulador sin notch no se puede
 * juzgar. Este preview inyecta métricas FALSAS —las de un iPhone con
 * isla dinámica— para poder verlo funcionar en el navegador: el
 * contenido pasa por debajo de la franja y el material aparece al
 * scrollear.
 *
 * Se proveen los CONTEXTOS directamente en vez de `SafeAreaProvider
 * initialMetrics`: `initialMetrics` es solo el valor de arranque y el
 * provider lo pisa apenas mide el layout real (en web, 0) — con lo cual
 * el banco de pruebas no probaba nada.
 *
 * ── QUÉ SE JUZGA ACÁ (2026-08-04) ──────────────────────────────────
 * El owner reportó ESCALINATAS horizontales dentro de la franja: los
 * bordes inferiores de las capas de blur, que se cortan duro. El banco
 * está armado para poder VERIFICARLO y para cerrar el tuning en una
 * sola sesión en device:
 *
 *  ▸ A/B lado a lado: mitad izquierda con la tabla VIEJA (4 capas,
 *    orden de pintado alto→bajo) y mitad derecha con la NUEVA, sobre
 *    el MISMO contenido y en el MISMO instante. Una sola captura
 *    alcanza para comparar.
 *  ▸ Lupa: multiplica el inset falso (59 → 118 → 177) para separar los
 *    bordes. Ampliar la franja REAL es mejor que ampliar el JPG.
 *  ▸ Fondos de peor caso: los escalones se ven sobre TONOS PLANOS y
 *    bordes nítidos, no sobre cards. Sin el fondo plano y el de alto
 *    contraste el banco puede dar un falso "quedó perfecto".
 *  ▸ Aislamiento: "sin velo" / "solo velo" separan las dos causas
 *    posibles (escalón de blur vs banding de 8 bits del gradiente);
 *    "orden viejo" muestra cuánto aporta por sí solo invertir el orden
 *    de pintado; "reglas" dibuja una línea en el y exacto del borde de
 *    cada capa para confirmar si una línea que se cree ver es un borde
 *    real o una banda de Mach.
 *  ▸ Steppers N/K/p: recalculan la curva en vivo con la misma fórmula
 *    que producción (`buildEdgeLayers`). El valor elegido se transcribe
 *    tal cual a `EDGE_CURVE`.
 *  ▸ Borde: arriba / abajo. Es LA MISMA curva espejada, así que los
 *    steppers valen para las dos; lo que hay que juzgar por separado es
 *    la franja (abajo el inset es ~34 contra ~59 arriba, o sea la mitad
 *    de recorrido para repartir los mismos N escalones) y el contenido
 *    que pasa por detrás. El panel de controles se ancla al borde
 *    OPUESTO al que se está probando: si tapara la franja bajo estudio
 *    no habría nada que mirar.
 *
 * Ojo: es un banco de pruebas del COMPORTAMIENTO (aparece/desaparece,
 * el contenido atraviesa la franja). El MATERIAL en sí sigue siendo
 * fiel solo EN DEVICE: en iOS es un UIVisualEffectView y en web
 * expo-blur cae a un backdrop-filter aproximado. En particular, que
 * las capas altas suavicen los bordes de las cortas (el efecto del
 * orden de pintado) NO se reproduce igual fuera de iOS.
 */

/** Métricas de un iPhone 17 Pro (isla dinámica). */
const FAKE_FRAME: Metrics['frame'] = { x: 0, y: 0, width: 393, height: 852 }
const BASE_TOP_INSET = 59
const BASE_BOTTOM_INSET = 34

type BackdropKind = 'filas' | 'plano' | 'rampa' | 'contraste'

const BACKDROPS: readonly BackdropKind[] = ['filas', 'plano', 'rampa', 'contraste']
const ZOOMS = [1, 2, 3] as const
const EDGES: readonly ScreenEdgeSide[] = ['top', 'bottom']
const EDGE_LABELS: Record<ScreenEdgeSide, string> = { top: 'arriba', bottom: 'abajo' }

function Pill({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const theme = useThemeTokens()
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: active ? theme.colors.primary : 'transparent',
          borderColor: active ? theme.colors.primary : theme.colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.pillText,
          { color: active ? theme.colors.textOnPrimary : theme.colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function Stepper({
  label,
  value,
  onStep,
}: {
  label: string
  value: string
  onStep: (direction: -1 | 1) => void
}) {
  const theme = useThemeTokens()
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => onStep(-1)}
        style={[styles.stepperButton, { borderColor: theme.colors.border }]}
      >
        <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>−</Text>
      </Pressable>
      <Text style={[styles.stepperLabel, { color: theme.colors.text }]}>
        {label} {value}
      </Text>
      <Pressable
        onPress={() => onStep(1)}
        style={[styles.stepperButton, { borderColor: theme.colors.border }]}
      >
        <Text style={[styles.pillText, { color: theme.colors.textMuted }]}>+</Text>
      </Pressable>
    </View>
  )
}

/**
 * Fondos de peor caso. La franja se juzga sobre lo que pasa POR
 * DEBAJO: sobre cards con bordes redondeados cualquier escalón se
 * disimula, sobre un tono plano que cruza los 393pt de ancho no.
 */
function Backdrop({ kind }: { kind: BackdropKind }) {
  const theme = useThemeTokens()

  // Un ÚNICO wrapper con gap 0: los hijos directos del Screen llevan
  // `gap: 22`, y esa separación cortaría los tonos planos en bandas
  // (justo lo que este fondo tiene que evitar).
  if (kind === 'plano') {
    // Tonos planos full-bleed: el caso donde una banda de Mach se lee
    // mejor (no hay detalle que la esconda).
    return (
      <View style={styles.backdropGroup}>
        {['#FFFFFF', '#B9B9B9', '#7A7A7A', '#3A3A3A', '#000000', '#EDE7DA'].map((tone) => (
          <View key={tone} style={[styles.bleedBlock, { backgroundColor: tone }]} />
        ))}
      </View>
    )
  }

  if (kind === 'rampa') {
    // Degradé vertical continuo: si aparece una línea acá es del
    // efecto, porque el fondo no tiene ninguna.
    return (
      <View style={styles.backdropGroup}>
        <LinearGradient
          colors={['#FFFFFF', '#8C8C8C', '#101010']}
          style={styles.rampBlock}
        />
        <LinearGradient
          colors={['#101010', '#8C8C8C', '#FFFFFF']}
          style={styles.rampBlock}
        />
      </View>
    )
  }

  if (kind === 'contraste') {
    // Bordes nítidos + texto invertido: el peor caso para el blur.
    return (
      <View style={styles.backdropGroup}>
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={styles.backdropGroup}>
            <View style={[styles.bleedRow, { backgroundColor: '#FFFFFF' }]}>
              <Text style={[styles.contrastText, { color: '#000000' }]}>
                Texto negro sobre blanco · {index + 1}
              </Text>
            </View>
            <View style={[styles.bleedRow, { backgroundColor: '#000000' }]}>
              <Text style={[styles.contrastText, { color: '#FFFFFF' }]}>
                Texto blanco sobre negro · {index + 1}
              </Text>
            </View>
            <View style={styles.stripes}>
              {Array.from({ length: 14 }, (_, stripe) => (
                <View
                  key={stripe}
                  style={[
                    styles.stripe,
                    { backgroundColor: stripe % 2 === 0 ? '#000000' : '#FFFFFF' },
                  ]}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    )
  }

  return (
    <View style={styles.rowGroup}>
      {Array.from({ length: 24 }, (_, index) => (
        <View
          key={index}
          style={[
            styles.row,
            {
              backgroundColor:
                index % 2 === 0 ? theme.colors.surfaceMuted : theme.colors.creamCard,
            },
          ]}
        >
          <Text style={[styles.rowText, { color: theme.colors.text }]}>
            Fila {index + 1} · scrolleá y mirá la franja de arriba
          </Text>
        </View>
      ))}
    </View>
  )
}

export function EdgeEffectPreviewScreen() {
  const { theme } = useAppTheme()

  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1)
  const [edge, setEdge] = useState<ScreenEdgeSide>('top')
  const [backdrop, setBackdrop] = useState<BackdropKind>('filas')
  const [split, setSplit] = useState(true)
  const [frozen, setFrozen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  // Arranca en `true`: todos los fondos de este banco desbordan la
  // pantalla por varias veces, así que en el primer frame YA hay
  // contenido por debajo — igual que en una pantalla real, donde el
  // material de abajo nace visible y se apaga recién al tocar el fondo.
  const [hasContentBelow, setHasContentBelow] = useState(true)
  const [showVeil, setShowVeil] = useState(true)
  const [showBlur, setShowBlur] = useState(true)
  const [legacyOrder, setLegacyOrder] = useState(false)
  const [rulers, setRulers] = useState(false)
  const [count, setCount] = useState(EDGE_CURVE.count)
  const [density, setDensity] = useState(EDGE_CURVE.density)
  const [falloff, setFalloff] = useState(EDGE_CURVE.falloff)

  // La lupa amplía LOS DOS insets: el que está bajo estudio para separar
  // los bordes de las capas, y el otro para que la geometría de la
  // pantalla siga siendo la de un device (si solo creciera uno, el
  // contenido se correría respecto de lo que se ve en el iPhone).
  const topInset = BASE_TOP_INSET * zoom
  const bottomInset = BASE_BOTTOM_INSET * zoom
  const insets = useMemo<EdgeInsets>(
    () => ({ top: topInset, left: 0, right: 0, bottom: bottomInset }),
    [topInset, bottomInset],
  )
  const isBottom = edge === 'bottom'
  const edgeInset = isBottom ? bottomInset : topInset
  const fadeHeight = Math.round(edgeInset * 1.35)

  const curve = useMemo(() => ({ count, density, falloff }), [count, density, falloff])
  const nextLayers = useMemo(() => buildEdgeLayers(curve), [curve])
  const nextVeil = useMemo(() => buildEdgeVeil(curve), [curve])

  // `buildEdgeLayers` devuelve las capas de la más CORTA a la más ALTA
  // (ese orden ES parte del arreglo: las altas repintan encima y
  // difuminan los bordes de las cortas). El toggle las invierte para
  // que se vea cuánto aporta el orden por sí solo.
  const paintedLayers = useMemo<readonly EdgeLayer[]>(
    () => (showBlur ? (legacyOrder ? [...nextLayers].reverse() : nextLayers) : []),
    [showBlur, legacyOrder, nextLayers],
  )
  const legacyLayers = useMemo<readonly EdgeLayer[]>(
    () => (showBlur ? LEGACY_BLUR_LAYERS : []),
    [showBlur],
  )

  // Cada borde tiene SU condición: arriba se activa con contenido por
  // encima, abajo mientras quede contenido por debajo. "congelar" las
  // fuerza para poder capturar la franja sin sostener el gesto.
  const active = frozen || (isBottom ? hasContentBelow : scrolled)
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    setScrolled((prev) => {
      const next = contentOffset.y > SCROLL_EDGE_THRESHOLD
      return prev === next ? prev : next
    })
    const hiddenBelow = contentSize.height - layoutMeasurement.height - contentOffset.y
    setHasContentBelow((prev) => {
      const next = hiddenBelow > SCROLL_EDGE_THRESHOLD
      return prev === next ? prev : next
    })
  }, [])

  const tableText = nextLayers
    .map((layer) => `${Math.round(layer.heightRatio * 100)}%·${layer.intensity}`)
    .join('  ')

  const edgeProps = {
    active,
    backgroundColor: theme.colors.background,
    edge,
    height: edgeInset,
    veil: showVeil ? nextVeil : null,
  }

  return (
    <SafeAreaFrameContext.Provider value={FAKE_FRAME}>
      <SafeAreaInsetsContext.Provider value={insets}>
        <View style={[styles.host, { backgroundColor: theme.colors.background }]}>
          <Screen
            backgroundColor={theme.colors.background}
            // El panel de controles es un overlay fijo contra un borde:
            // hay que reservarle el alto de los DOS lados para que el
            // contenido siga siendo alcanzable sin importar dónde se
            // ancle.
            contentContainerStyle={
              isBottom ? [styles.scrollContent, styles.scrollContentPanelTop] : styles.scrollContent
            }
            disableEdgeEffect
            onScroll={handleScroll}
            scrollable
          >
            <Text style={[styles.title, { color: theme.colors.text }]}>Scroll edge effect</Text>
            <Text style={[styles.body, { color: theme.colors.textMuted }]}>
              Borde {EDGE_LABELS[edge]} · inset simulado {edgeInset} · franja {fadeHeight}pt. Sin
              contenido cruzando el borde es transparente; con contenido detrás aparece el
              material. El veredicto sale del iPhone: en web el blur es una aproximación.
            </Text>
            <Backdrop kind={backdrop} />
          </Screen>

          {/* Overlay del efecto. Va FUERA del Screen (que monta con
              `disableEdgeEffect`) para poder recortarlo a media
              pantalla: la franja es uniforme en horizontal, así que
              media franja se ve idéntica a la entera. */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {split ? (
              <>
                <View style={[styles.half, styles.halfLeft]}>
                  <ScreenEdgeEffect
                    {...edgeProps}
                    layers={legacyLayers}
                    veil={showVeil ? LEGACY_VEIL : null}
                  />
                </View>
                <View style={[styles.half, styles.halfRight]}>
                  <ScreenEdgeEffect {...edgeProps} layers={paintedLayers} />
                </View>
                <View
                  style={[
                    styles.splitSeam,
                    isBottom ? styles.splitSeamBottom : styles.splitSeamTop,
                    { backgroundColor: withAlpha(theme.colors.text, 0.35), height: fadeHeight },
                  ]}
                />
                <View
                  style={[
                    styles.splitLabels,
                    isBottom ? { bottom: fadeHeight + 4 } : { top: fadeHeight + 4 },
                  ]}
                >
                  <Text style={[styles.splitLabel, { color: theme.colors.textMuted }]}>
                    ← anterior ({LEGACY_BLUR_LAYERS.length} capas)
                  </Text>
                  <Text style={[styles.splitLabel, { color: theme.colors.textMuted }]}>
                    nueva ({nextLayers.length} capas) →
                  </Text>
                </View>
              </>
            ) : (
              <ScreenEdgeEffect {...edgeProps} layers={paintedLayers} />
            )}

            {rulers
              ? nextLayers.map((layer) => {
                  // La regla marca el borde INTERIOR de cada capa, o sea
                  // se mide desde el borde bajo estudio.
                  const offset = PixelRatio.roundToNearestPixel(fadeHeight * layer.heightRatio)
                  return (
                  <View
                    key={layer.heightRatio}
                    style={[
                      styles.ruler,
                      { backgroundColor: withAlpha(theme.colors.text, 0.5) },
                      isBottom ? { bottom: offset } : { top: offset },
                    ]}
                  >
                    <Text style={[styles.rulerLabel, { color: theme.colors.text }]}>
                      {layer.intensity}
                    </Text>
                  </View>
                  )
                })
              : null}
          </View>

          <View
            style={[
              styles.panel,
              // El panel se va al borde OPUESTO al que se está probando:
              // anclado contra la franja bajo estudio la taparía entera.
              isBottom ? styles.panelTop : styles.panelBottom,
              { backgroundColor: theme.colors.creamCard, borderColor: theme.colors.border },
            ]}
          >
            <View style={styles.pillRow}>
              {EDGES.map((side) => (
                <Pill
                  active={edge === side}
                  key={side}
                  label={EDGE_LABELS[side]}
                  onPress={() => setEdge(side)}
                />
              ))}
              <Pill active={split} label="A/B" onPress={() => setSplit((v) => !v)} />
              <Pill active={frozen} label="congelar" onPress={() => setFrozen((v) => !v)} />
              <Pill active={rulers} label="reglas" onPress={() => setRulers((v) => !v)} />
              <Pill active={!showVeil} label="sin velo" onPress={() => setShowVeil((v) => !v)} />
              <Pill active={!showBlur} label="solo velo" onPress={() => setShowBlur((v) => !v)} />
              <Pill
                active={legacyOrder}
                label="orden viejo"
                onPress={() => setLegacyOrder((v) => !v)}
              />
            </View>
            <View style={styles.pillRow}>
              {BACKDROPS.map((kind) => (
                <Pill
                  active={backdrop === kind}
                  key={kind}
                  label={kind}
                  onPress={() => setBackdrop(kind)}
                />
              ))}
              {ZOOMS.map((value) => (
                <Pill
                  active={zoom === value}
                  key={value}
                  label={`${value}×`}
                  onPress={() => setZoom(value)}
                />
              ))}
            </View>
            <View style={styles.pillRow}>
              <Stepper
                label="N"
                onStep={(direction) =>
                  setCount((v) => Math.min(10, Math.max(4, v + direction)))
                }
                value={`${count}`}
              />
              <Stepper
                label="K"
                onStep={(direction) =>
                  setDensity((v) => Math.min(40, Math.max(20, v + direction * 2)))
                }
                value={`${density}`}
              />
              <Stepper
                label="p"
                onStep={(direction) =>
                  setFalloff((v) =>
                    Math.min(3, Math.max(1.5, Math.round((v + direction * 0.25) * 100) / 100)),
                  )
                }
                value={falloff.toFixed(2)}
              />
            </View>
            <Text style={[styles.tableText, { color: theme.colors.textMuted }]}>{tableText}</Text>
          </View>
        </View>
      </SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  )
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  scrollContent: { paddingBottom: 240 },
  // Colchón del panel cuando se ancla arriba. Compite con el inset que
  // el Screen inyecta (`Math.max`) y 240 gana siempre, así que el
  // contenido arranca debajo del panel aunque la lupa esté en 3×.
  scrollContentPanelTop: { paddingTop: 240 },
  title: { fontFamily: nunitoFamily('900'), fontSize: 24, fontWeight: '900' },
  body: { fontFamily: nunitoFamily('600'), fontSize: 13, lineHeight: 19 },
  row: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 18 },
  rowText: { fontFamily: nunitoFamily('700'), fontSize: 14, fontWeight: '700' },
  // El contenido del Screen lleva 20pt de padding horizontal; los
  // fondos de peor caso lo cancelan para cruzar TODO el ancho, que es
  // donde un escalón se lee peor.
  backdropGroup: { gap: 0 },
  rowGroup: { gap: 12 },
  bleedBlock: { height: 200, marginHorizontal: -20 },
  rampBlock: { height: 480, marginHorizontal: -20 },
  bleedRow: { marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 14 },
  contrastText: { fontFamily: nunitoFamily('800'), fontSize: 18, fontWeight: '800' },
  stripes: { flexDirection: 'row', height: 56, marginHorizontal: -20 },
  stripe: { flex: 1 },
  half: { bottom: 0, overflow: 'hidden', position: 'absolute', top: 0, width: '50%' },
  halfLeft: { left: 0 },
  halfRight: { right: 0 },
  splitSeam: { left: '50%', position: 'absolute', width: StyleSheet.hairlineWidth },
  splitSeamTop: { top: 0 },
  splitSeamBottom: { bottom: 0 },
  splitLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
  },
  splitLabel: { fontFamily: nunitoFamily('700'), fontSize: 11, fontWeight: '700' },
  ruler: {
    alignItems: 'flex-end',
    height: StyleSheet.hairlineWidth,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  rulerLabel: { fontFamily: nunitoFamily('700'), fontSize: 9, fontWeight: '700', marginRight: 4 },
  panel: {
    gap: 8,
    left: 0,
    paddingHorizontal: 12,
    position: 'absolute',
    right: 0,
  },
  // El hairline va del lado por el que el panel se despega del borde, y
  // el padding grueso del lado del safe area que lo aloja.
  panelBottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    bottom: 0,
    paddingBottom: 28,
    paddingTop: 10,
  },
  panelTop: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingTop: 64,
    top: 0,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontFamily: nunitoFamily('800'), fontSize: 11, fontWeight: '800' },
  stepper: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stepperButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stepperLabel: { fontFamily: nunitoFamily('800'), fontSize: 12, fontWeight: '800' },
  tableText: { fontFamily: nunitoFamily('600'), fontSize: 10, lineHeight: 14 },
})
