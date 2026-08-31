// BrotClip — reproductor del Brot pre-renderizado (dirección de arte nueva).
//
// PRUEBA DE CONCEPTO. Convive con `BrotMascot` (el Brot vectorial de Skia)
// a propósito: no lo reemplaza, sólo muestra cómo se ve la dirección nueva
// sobre una superficie real de la app.
//
// ── El asset ─────────────────────────────────────────────────────────
// El .mp4 viene ALPHA-PACKED: un solo cuadro de 704×1760 donde la mitad
// de arriba (704×880) es el color y la de abajo la máscara de alpha en
// gris. Se empaqueta así porque NINGÚN formato de video con alpha real es
// portable — HEVC con alpha es sólo de Apple y VP9 con alpha no lo soporta
// Android de forma confiable. Un H.264 común sí corre en todos lados y se
// decodifica por hardware.
//
// El pipeline que lo genera (croma magenta → key → unblend → derim →
// empaquetado) vive fuera del repo; lo que importa acá es el contrato:
// mitad superior color, mitad inferior alpha, relación 0.8.
//
// ── Cómo se compone ──────────────────────────────────────────────────
// Con `<Mask mode="luminance">`, que aplica un LumaColorFilter: como la
// mitad inferior es gris (R=G=B), su luminancia ES el alpha. Evita
// escribir un RuntimeShader y usa sólo componentes declarativos.
//
// Las dos mitades se recortan dibujando la MISMA imagen al doble de alto y
// desplazándola: el color en y=0 y la máscara en y=-height. El canvas, que
// mide `height`, se queda con la mitad que corresponde en cada caso.
//
// ── Por qué Skia y no una librería de video ──────────────────────────
// `@shopify/react-native-skia` 2.2.12 ya trae `useVideo`, así que esto no
// suma NINGUNA dependencia nativa — no hay prebuild ni development client
// nuevo. `expo-video` y `react-native-video` no están instalados.

import { useEffect, useState } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Asset } from 'expo-asset'
import { BrotMascot, type BrotPose } from '@/components/brot/brot-mascot'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { getOptionalSkiaModule, useOptionalIsFocused } from '@/lib/optional-skia'

/** Relación de CADA MITAD del cuadro empaquetado (704×880). */
const CLIP_ASPECT = 704 / 880

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CLIP_MODULE = require('@/assets/brot-poc/brot-bolsillos-vacios-alpha.mp4') as number

export interface BrotClipProps {
  /** Altura en dp. El ancho sale de la relación del clip. */
  height: number
  /** Pose del `BrotMascot` que se usa mientras carga y como fallback. */
  fallbackPose?: BrotPose
  style?: StyleProp<ViewStyle>
}

export function BrotClip({ height, fallbackPose = 'worried', style }: BrotClipProps) {
  const width = Math.round(height * CLIP_ASPECT)
  const skia = getOptionalSkiaModule()
  const [uri, setUri] = useState<string | null>(null)

  // El .mp4 va como asset de Metro: en dev se resuelve a un file:// del
  // cache y en release sale del bundle. `useVideo` toma un string, así que
  // hay que materializarlo antes.
  useEffect(() => {
    let alive = true
    void Asset.fromModule(CLIP_MODULE)
      .downloadAsync()
      .then((asset) => {
        if (alive) setUri(asset.localUri ?? asset.uri)
      })
      .catch(() => {
        // Sin URI el componente se queda en el fallback vectorial.
      })
    return () => {
      alive = false
    }
  }, [])

  const canPlay = Boolean(skia) && uri !== null

  return (
    <View style={[styles.frame, { width, height }, style]}>
      {canPlay ? (
        <BrotClipCanvas height={height} uri={uri as string} width={width} />
      ) : (
        // Mismo hueco, sin salto de layout: el Brot vectorial ocupa el lugar
        // mientras el asset se materializa (y para siempre si no hay Skia).
        <BrotMascot pose={fallbackPose} shadow={false} size={height * 0.66} />
      )}
    </View>
  )
}

interface BrotClipCanvasProps {
  height: number
  uri: string
  width: number
}

/**
 * Sólo se monta cuando el módulo de Skia existe, así que adentro se puede
 * llamar a `useVideo` incondicionalmente (el hook nunca cambia de orden).
 */
function BrotClipCanvas({ height, uri, width }: BrotClipCanvasProps) {
  const skiaModule = getOptionalSkiaModule()
  const isFocused = useOptionalIsFocused()
  const reducedMotion = useReducedMotion()

  const { Canvas, Image, Mask, useVideo } = skiaModule as NonNullable<typeof skiaModule>

  // ▸ El foco de navegación pausa el decoder: las pantallas tapadas de un
  //   stack quedan MONTADAS, y un decoder de hardware corriendo invisible es
  //   el recurso más caro que se puede dejar prendido.
  // ▸ Con movimiento reducido el clip corre una sola vez y queda quieto en el
  //   último cuadro, en vez de loopear para siempre.
  const { currentFrame } = useVideo(uri, {
    looping: !reducedMotion,
    paused: !isFocused,
    volume: 0,
  })

  return (
    <Canvas style={{ width, height }}>
      <Mask
        mode="luminance"
        mask={
          // Mitad INFERIOR = alpha. Se sube `height` para que caiga en el canvas.
          <Image
            fit="fill"
            height={height * 2}
            image={currentFrame}
            width={width}
            x={0}
            y={-height}
          />
        }
      >
        {/* Mitad SUPERIOR = color. El canvas recorta lo que sobra abajo. */}
        <Image fit="fill" height={height * 2} image={currentFrame} width={width} x={0} y={0} />
      </Mask>
    </Canvas>
  )
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
