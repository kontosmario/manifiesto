// Brot — mascota de Manifiesto, port 1:1 del web component de canvas
// (design/rediseno-2026-07/brot.js) a React Native Skia.
//
//   <BrotMascot pose="idle" size={120} animated shadow />
//
// ViewBox lógico: 84×108 (84×72 en pose "peek"); `size` es la ALTURA en dp.
//
// Enfoque de dibujo: imperativo vía SkPictureRecorder (equivalente a
// createPicture de Skia, inlineado porque el módulo se resuelve con
// getOptionalSkiaModule y no se puede importar estático). Cada frame se
// graba un SkPicture nuevo dentro de un useDerivedValue (UI thread) y un
// <Picture> declarativo lo pinta. Cero estado de React por frame: el
// clock es un shared value alimentado por useFrameCallback, así que en
// gama baja no hay commits de Fabric ni re-renders — solo Skia.
//
// Perf (gama baja Android como piso):
//   ▸ El reloj se ancla a info.timestamp con un start-timestamp persistente
//     en un shared value: re-registrar el frame callback (que resetea
//     timeSinceFirstFrame a 0) no rebobina la animación. Además el worklet
//     del callback tiene identidad estable (useMemo) para no re-registrarse
//     en cada render del padre.
//   ▸ Los objetos Skia longevos (paints, gradiente del cuerpo, path scratch)
//     se crean UNA vez por instancia y se reusan frame a frame — el canvas
//     de grabación copia paint/path al grabar cada comando, así que mutarlos
//     entre draws es seguro (mismo contrato que ya usaba el paint compartido).
//   ▸ El loop se gatea por foco de navegación (useOptionalIsFocused): las
//     pantallas tapadas de un stack quedan montadas y sin gate seguirían
//     grabando a 60fps. Al volver el foco t salta como si nunca hubiera
//     parado (reloj por timestamp) — sin rebobinado visible.
//   ▸ El SkPicture del frame anterior se libera con .dispose() al
//     reemplazarlo (en @shopify/react-native-skia 2.2.12 es no-op en native
//     — la memoria la maneja el GC vía memory pressure — pero libera en
//     web/futuras versiones y deja el ownership explícito).
//
// Desvío deliberado vs el original: los glifos de texto ('z' del zzz,
// '$'/'?' del globo de pensamiento) se dibujan con paths en vez de
// ctx.fillText con Nunito — cargar fonts adentro de Skia es frágil y el
// font manager del sistema no ve las fonts de Expo. Todo lo demás usa
// las mismas coordenadas, colores, anchos de trazo y orden de capas.

import { memo, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import {
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated'
import type {
  PaintStyle,
  SkCanvas,
  SkPaint,
  SkPath,
  SkPicture,
  StrokeCap,
  StrokeJoin,
  TileMode,
} from '@shopify/react-native-skia'
import {
  getOptionalSkiaModule,
  useOptionalIsFocused,
  type SkiaModule,
} from '@/lib/optional-skia'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

// ─── API pública ─────────────────────────────────────────────────────

export const BROT_POSES = [
  'idle',
  'wave',
  'cheer',
  'coach',
  'sleep',
  'peek',
  'laugh',
  'love',
  'wow',
  'worried',
  'sad',
  'dizzy',
  'shy',
  'think',
  'zen',
  'magic',
  'seed',
  'wilted',
  'cool',
] as const

export type BrotPose = (typeof BROT_POSES)[number]

export interface BrotMascotProps {
  pose?: BrotPose
  /** Altura en dp. El ancho se deriva del viewBox (84/108, o 84/72 en peek). */
  size?: number
  animated?: boolean
  shadow?: boolean
}

// ─── Aire de dibujo alrededor del viewBox ────────────────────────────
//
// El viewBox 84×108 NO alcanza para contener el dibujo animado: todas
// las transforms del grupo están ancladas en el PIE (rotate del tilt y
// respiro en (42,96)) mientras la tinta más alta —las hojas— vive a ~93
// unidades de ese pivote, así que tilt y respiro la amplifican; y el
// estado `perk` de las hojas define tipR=[65,-2], una coordenada
// NEGATIVA. Resultado: el brote se guillotina al saltar (feedback owner
// 2026-07-16, pose `cheer`).
//
// El componente web original (design/rediseno-2026-07/brot.js) recorta
// EXACTAMENTE igual — su canvas mide el viewBox y `_draw` hace
// setTransform(scale,0,0,scale,0,0), escala pura sin translate. O sea
// que los mockups aprobados muestran a Brot recortado. Acá se diverge a
// propósito: se es fiel al DIBUJO, no al recorte. Ni una coordenada de
// drawBrot() cambia — solo se agranda el papel.
//
// Los valores salen de medir, no de estimar: barrido de un ciclo
// completo por pose acumulando todos los frames y sacando la caja
// envolvente de alpha (sobre el brot.js original), contrastado contra un
// cálculo analítico de la pila de matrices del port. Los dos métodos
// coinciden dentro de 0.2u. Peores casos (unidades de viewBox):
//   arriba  cheer 9.67 · zen 9.33 · wow 6.67
//   izq     coach 2.33
//   der     sleep 0.33 (analítico 0.60: el port dibuja la `z` con paths
//           y el original con fillText, así que acá manda el analítico)
//   abajo   nada llega a 108 (la sombra del piso muere en ~106)
// `cool` (mismo método, chequeo analítico vía barrido numérico de la pila
// de transforms): combina leaves='perk' —ya el peor caso de arriba,
// cheer 9.67— con un tilt+sway de cuerpo entero que cheer no tiene; aun
// así da MENOS excursión que cheer, así que no cambia el peor caso ni el
// presupuesto de PAD_TOP/PAD_X.
const PAD_TOP = 12
const PAD_X = 6
/**
 * LOAD-BEARING en 0: `peek` NO es una pose recortada por accidente — su
 * viewBox de 72 ES el recorte que deja solo cabeza y manitos asomando
 * sobre el borde de una card (el cuerpo se dibuja hasta y=97). Aire
 * abajo le mostraría el cuerpo y destruiría la pose. Da la casualidad
 * de que ninguna pose se sale por abajo, así que 0 global sirve para
 * las dos cosas.
 */
const PAD_BOTTOM = 0

// ─── Paleta (tabla C del original) ───────────────────────────────────

const C = {
  body: '#A9CB80',
  body2: '#9CC172',
  outline: '#4E7A44',
  dull: '#B7C4A0',
  dull2: '#ACBA92',
  dullOut: '#7A8669',
  leafL: '#8FBE72',
  leafR: '#6FA35C',
  stem: '#5E8F4C',
  leafDullL: '#A8B694',
  leafDullR: '#93A383',
  stemDull: '#7A8A6C',
  face: '#3D5B36',
  // El original usa rgba(224,138,110,0.38) + globalAlpha; acá separamos
  // base rgb y alpha efectivo para poder multiplicarlos en setAlphaf.
  blushBase: 'rgb(224,138,110)',
  shadow: 'rgba(60,90,50,0.16)',
  heart: '#E0705F',
  seed: '#DCC58F',
  seedOut: '#8A7648',
} as const

const BLUSH_ALPHA = 0.38

// ─── Tabla de poses ──────────────────────────────────────────────────

type EyeType =
  | 'dot'
  | 'closed'
  | 'happy'
  | 'heart'
  | 'x'
  | 'wide'
  | 'scan'
  | 'shy'
  | 'think'
  | 'up'
  | 'worry'
  | 'sad'

type MouthType =
  | 'smile'
  | 'open'
  | 'o'
  | 'wavy'
  | 'frown'
  | 'small'
  | 'smirk'
  | 'hmm'
  | 'hmm2'
  | 'oo'

type LeavesState = 'normal' | 'perk' | 'droop' | 'wilt'

type ExtraKind = 'zzz' | 'hearts' | 'bang' | 'sweat' | 'dots' | 'thought' | 'sparkles'

interface PoseSpec {
  eyes?: EyeType
  mouth?: MouthType
  leaves?: LeavesState
  extras?: readonly ExtraKind[]
  custom?: 'shy' | 'think' | 'zen' | 'cool'
  legs?: 'pigeon' | 'cross'
  tilt?: number
  bounce?: number
  blush?: 1 | 2
  wobble?: boolean
  sway?: boolean
  float?: boolean
  halo?: boolean
  deep?: boolean
  dull?: boolean
  noArms?: boolean
  seed?: boolean
  /** Ángulo fijo de brazo (radianes). Los brazos animados en el tiempo
   *  (wave/cheer/coach/magic) se resuelven en armAngles() para mantener
   *  la tabla serializable (sin closures en shared values). */
  aL?: number
  aR?: number
}

// Nota: el original define P.custom='peek', pero solo consulta el nombre
// de la pose (isPeek); P.armsFront y P.chin se chequean sin que ninguna
// pose los defina, así que no se portan.
const POSES: Record<BrotPose, PoseSpec> = {
  idle: {},
  wave: { tilt: -0.02 }, // aR animado en armAngles
  cheer: { mouth: 'open', bounce: 1, blush: 1, leaves: 'perk' }, // aL/aR animados
  coach: { tilt: -0.035 }, // aL animado
  sleep: { eyes: 'closed', mouth: 'oo', tilt: 0.09, extras: ['zzz'] },
  peek: { eyes: 'scan' },
  laugh: { eyes: 'happy', mouth: 'open', blush: 1, bounce: 0.5 },
  love: { eyes: 'heart', blush: 1, extras: ['hearts'], aL: 0.35, aR: 0.35 },
  wow: { eyes: 'wide', mouth: 'o', leaves: 'perk', extras: ['bang'], aL: 0.6, aR: 0.6 },
  worried: { eyes: 'worry', mouth: 'wavy', extras: ['sweat'], tilt: 0.02 },
  sad: { eyes: 'sad', mouth: 'frown', leaves: 'droop', tilt: 0.035 },
  dizzy: { eyes: 'x', mouth: 'wavy', leaves: 'droop', wobble: true },
  shy: {
    mouth: 'small',
    blush: 2,
    eyes: 'shy',
    legs: 'pigeon',
    custom: 'shy',
    sway: true,
    noArms: true,
  },
  think: {
    eyes: 'think',
    mouth: 'hmm2',
    extras: ['thought'],
    custom: 'think',
    noArms: true,
    tilt: -0.045,
  },
  zen: {
    eyes: 'closed',
    mouth: 'small',
    float: true,
    legs: 'cross',
    custom: 'zen',
    noArms: true,
    halo: true,
    deep: true,
  },
  magic: { extras: ['sparkles'] }, // aR animado en armAngles
  seed: { seed: true },
  wilted: { eyes: 'sad', mouth: 'frown', leaves: 'wilt', tilt: 0.055, dull: true },
  cool: { eyes: 'closed', mouth: 'smirk', custom: 'cool', tilt: -0.05, leaves: 'perk', sway: true }, // aL/aR animados en armAngles
}

// ─── Infraestructura de dibujo ───────────────────────────────────────

type SkiaApi = SkiaModule['Skia']

/** Subconjunto worklet-safe del módulo (host object + enums), para no
 *  capturar componentes de React adentro del worklet. */
interface SkiaEnv {
  Skia: SkiaApi
  psFill: PaintStyle
  psStroke: PaintStyle
  capRound: StrokeCap
  joinRound: StrokeJoin
  tileClamp: TileMode
}

/** Objetos Skia longevos: UNA creación por instancia montada (JS thread),
 *  reusados frame a frame por el worklet de grabación. */
interface SkiaObjectCache {
  fill: SkPaint
  stroke: SkPaint
  /** Paint del cuerpo con su gradiente (invariante en el tiempo). */
  bodyPaint: SkPaint
  /** Variante dull (pose wilted) del paint del cuerpo. */
  bodyPaintDull: SkPaint
  /** Paints del gradiente de los lentes de la pose 'cool' (izq/der):
   *  pose-específicos pero invariantes en el tiempo (cx/gy/sep/w/h son
   *  constantes), se arman una vez acá. */
  coolLensPaintLeft: SkPaint
  coolLensPaintRight: SkPaint
  /** Path scratch: cada figura lo resetea, lo construye y lo dibuja.
   *  El uso es estrictamente secuencial (construir → dibujar → siguiente)
   *  y el canvas de grabación copia el path al grabar, así que un único
   *  scratch alcanza para todo el frame. */
  path: SkPath
}

interface Tools {
  env: SkiaEnv
  canvas: SkCanvas
  /** Paint compartido style=Fill (se muta entre draws; Skia copia el
   *  paint al grabar cada comando, así que es seguro). */
  fill: SkPaint
  /** Paint compartido style=Stroke, cap/join round (como queda el ctx
   *  del original después del primer frame). */
  stroke: SkPaint
  /** Paints del cuerpo pre-armados con su gradiente (ver SkiaObjectCache). */
  bodyPaint: SkPaint
  bodyPaintDull: SkPaint
  /** Paints del gradiente de los lentes de 'cool' (ver SkiaObjectCache). */
  coolLensPaintLeft: SkPaint
  coolLensPaintRight: SkPaint
  /** Path scratch compartido (ver SkiaObjectCache.path). */
  path: SkPath
  shadowOn: boolean
}

const R2D = 180 / Math.PI
const ARM_L = 15
const ARM_W = 8.5
const STATIC_T = 0.4

// Gafas wayfarer de la pose 'cool' (design/fijos-2026-07/brot.js, bloque
// `if (P.custom === 'cool')`) — geometría copiada tal cual del original.
const COOL_GLASSES_CX = 42
const COOL_GLASSES_GY = 55.4
const COOL_GLASSES_SEP = 9.7
const COOL_GLASSES_W = 12.2
const COOL_GLASSES_H = 8.8
const COOL_GLASSES_RAD = 2.8
const COOL_GLASSES_CL = COOL_GLASSES_CX - COOL_GLASSES_SEP
const COOL_GLASSES_CR = COOL_GLASSES_CX + COOL_GLASSES_SEP

function rot(canvas: SkCanvas, rad: number, px: number, py: number) {
  'worklet'
  canvas.rotate(rad * R2D, px, py)
}

/** Devuelve el path scratch reseteado (reemplazo de Skia.Path.Make() por
 *  frame: cero allocations de path por dibujo). */
function freshPath(tools: Tools) {
  'worklet'
  tools.path.reset()
  return tools.path
}

function ovalRect(env: SkiaEnv, cx: number, cy: number, rx: number, ry: number) {
  'worklet'
  return env.Skia.XYWHRect(cx - rx, cy - ry, rx * 2, ry * 2)
}

function setFill(tools: Tools, color: string, alpha?: number) {
  'worklet'
  tools.fill.setColor(tools.env.Skia.Color(color))
  if (alpha !== undefined) {
    tools.fill.setAlphaf(alpha)
  }
}

function setStroke(tools: Tools, color: string, width: number, alpha?: number) {
  'worklet'
  tools.stroke.setColor(tools.env.Skia.Color(color))
  tools.stroke.setStrokeWidth(width)
  if (alpha !== undefined) {
    tools.stroke.setAlphaf(alpha)
  }
}

function fillEllipse(
  tools: Tools,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  alpha?: number,
) {
  'worklet'
  setFill(tools, color, alpha)
  tools.canvas.drawOval(ovalRect(tools.env, cx, cy, rx, ry), tools.fill)
}

function strokeEllipse(
  tools: Tools,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  width: number,
) {
  'worklet'
  setStroke(tools, color, width)
  tools.canvas.drawOval(ovalRect(tools.env, cx, cy, rx, ry), tools.stroke)
}

// _capsule: trazo grueso de contorno + trazo de relleno sobre la misma línea.
function capsule(
  tools: Tools,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  fillColor: string,
  outColor: string,
) {
  'worklet'
  setStroke(tools, outColor, w + 4.4)
  tools.canvas.drawLine(x1, y1, x2, y2, tools.stroke)
  setStroke(tools, fillColor, w)
  tools.canvas.drawLine(x1, y1, x2, y2, tools.stroke)
}

// _leaf: hoja de dos curvas cuadráticas + nervadura central.
function leaf(
  tools: Tools,
  bx: number,
  by: number,
  tx: number,
  ty: number,
  fillColor: string,
  outColor: string,
  alpha: number,
) {
  'worklet'
  const mx = (bx + tx) / 2
  const my = (by + ty) / 2
  const dx = tx - bx
  const dy = ty - by
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const k = len * 0.3
  const p = freshPath(tools)
  p.moveTo(bx, by)
  p.quadTo(mx + nx * k, my + ny * k, tx, ty)
  p.quadTo(mx - nx * k, my - ny * k, bx, by)
  p.close()
  setFill(tools, fillColor, alpha)
  tools.canvas.drawPath(p, tools.fill)
  setStroke(tools, outColor, 2.2, alpha)
  tools.canvas.drawPath(p, tools.stroke)
  const vein = freshPath(tools)
  vein.moveTo(bx, by)
  vein.quadTo(mx + nx * k * 0.25, my + ny * k * 0.25, bx + dx * 0.72, by + dy * 0.72)
  // 0.55 ABSOLUTO, no 0.55*alpha: el original setea globalAlpha=0.55 para
  // la nervadura (brot.js:112), y eso PISA el alpha del caller en vez de
  // componerlo. Solo se nota en el único caller que pasa alpha≠1 —la hoja
  // que orbita en `zen`—, donde la nervadura queda MÁS opaca que la hoja
  // que la contiene. Es un artefacto del original, y lo replicamos.
  setStroke(tools, outColor, 1.4, 0.55)
  tools.canvas.drawPath(vein, tools.stroke)
}

// _heart: dos lóbulos (círculos en un path) + triángulo, fills separados
// como en el original (con alpha < 1 el solape se dobla igual que allá).
function heart(tools: Tools, x: number, y: number, s: number, color: string, alpha: number) {
  'worklet'
  setFill(tools, color, alpha)
  const lobes = freshPath(tools)
  lobes.addCircle(x - s * 0.35, y - s * 0.22, s * 0.42)
  lobes.addCircle(x + s * 0.35, y - s * 0.22, s * 0.42)
  tools.canvas.drawPath(lobes, tools.fill)
  const tip = freshPath(tools)
  tip.moveTo(x - s * 0.72, y - s * 0.05)
  tip.lineTo(x, y + s * 0.62)
  tip.lineTo(x + s * 0.72, y - s * 0.05)
  tip.close()
  tools.canvas.drawPath(tip, tools.fill)
}

// _star: destello de 4 puntas con curvas cuadráticas.
function star(tools: Tools, x: number, y: number, s: number, color: string) {
  'worklet'
  const p = freshPath(tools)
  p.moveTo(x, y - s)
  p.quadTo(x + s * 0.22, y - s * 0.22, x + s, y)
  p.quadTo(x + s * 0.22, y + s * 0.22, x, y + s)
  p.quadTo(x - s * 0.22, y + s * 0.22, x - s, y)
  p.quadTo(x - s * 0.22, y - s * 0.22, x, y - s)
  setFill(tools, color)
  tools.canvas.drawPath(p, tools.fill)
}

// _leaves: tallo + dos hojas, con vaivén alrededor de (42,28).
function drawLeaves(tools: Tools, state: LeavesState, t: number, dull: boolean) {
  'worklet'
  const sway =
    Math.sin(t * 1.15) *
    (state === 'perk' ? 0.08 : state === 'droop' ? 0.025 : state === 'wilt' ? 0.015 : 0.05)
  const wilted = dull || state === 'wilt'
  const lL = wilted ? C.leafDullL : C.leafL
  const lR = wilted ? C.leafDullR : C.leafR
  const st = wilted ? C.stemDull : C.stem
  const out = wilted ? C.dullOut : C.outline
  let tipL: readonly [number, number] = [22, 5]
  let tipR: readonly [number, number] = [63, 3]
  if (state === 'perk') {
    tipL = [20, 0]
    tipR = [65, -2]
  }
  if (state === 'droop') {
    tipL = [21, 15]
    tipR = [64, 13]
  }
  if (state === 'wilt') {
    tipL = [25, 19]
    tipR = [61, 18]
  }
  const { canvas } = tools
  canvas.save()
  rot(canvas, sway, 42, 28)
  const stemPath = freshPath(tools)
  stemPath.moveTo(42, 29)
  stemPath.quadTo(41, 20, 42, 15)
  setStroke(tools, st, 2.4)
  canvas.drawPath(stemPath, tools.stroke)
  leaf(tools, 42, 16, tipL[0], tipL[1], lL, out, 1)
  leaf(tools, 42, 15, tipR[0], tipR[1], lR, out, 1)
  canvas.restore()
}

// _drawSeed: pose semilla completa (cuerpo aparte del huevo).
function drawSeed(tools: Tools, t: number) {
  'worklet'
  const blink = t % 3.7 < 0.12 ? 0.15 : 1
  const { canvas } = tools
  if (tools.shadowOn) {
    fillEllipse(tools, 42, 100, 15, 2.8, C.shadow)
  }
  canvas.save()
  canvas.translate(42, 84)
  rot(canvas, Math.sin(t * 1.2) * 0.04, 0, 0)
  fillEllipse(tools, 0, 0, 12, 15, C.seed)
  strokeEllipse(tools, 0, 0, 12, 15, C.seedOut, 2.4)
  // brillo
  canvas.save()
  canvas.translate(-4, -8)
  rot(canvas, -0.5, 0, 0)
  fillEllipse(tools, 0, 0, 3.6, 1.8, 'rgba(255,255,255,0.75)')
  canvas.restore()
  // ojos
  const eyeXs = [-4.2, 4.2]
  for (const ex of eyeXs) {
    canvas.save()
    canvas.translate(ex, -2)
    canvas.scale(1, blink)
    fillEllipse(tools, 0, 0, 1.9, 2.5, C.face)
    canvas.restore()
  }
  // boca
  const m = freshPath(tools)
  m.moveTo(-2.8, 3)
  m.quadTo(0, 5.6, 2.8, 3)
  setStroke(tools, C.face, 1.9)
  canvas.drawPath(m, tools.stroke)
  // brotecito arriba
  const sprout = freshPath(tools)
  sprout.moveTo(0, -14)
  sprout.quadTo(-0.5, -18, 0, -21)
  setStroke(tools, C.stem, 2)
  canvas.drawPath(sprout, tools.stroke)
  leaf(tools, 0, -20, -8, -25, C.leafL, C.outline, 1)
  leaf(tools, 0, -20.5, 7, -26, C.leafR, C.outline, 1)
  canvas.restore()
}

// _eyes
function drawEyes(tools: Tools, type: EyeType, t: number) {
  'worklet'
  const blink = t % 3.7 < 0.12 ? 0.15 : 1
  const y = 56
  const L = 33.5
  const R = 50.5
  const both = [L, R]
  const { canvas } = tools
  if (type === 'closed') {
    setStroke(tools, C.face, 2.2)
    for (const ex of both) {
      const p = freshPath(tools)
      p.moveTo(ex - 3, y)
      p.quadTo(ex, y + 2.6, ex + 3, y)
      canvas.drawPath(p, tools.stroke)
    }
  } else if (type === 'happy') {
    setStroke(tools, C.face, 2.2)
    for (const ex of both) {
      const p = freshPath(tools)
      p.moveTo(ex - 3, y + 0.5)
      p.quadTo(ex, y - 3, ex + 3, y + 0.5)
      canvas.drawPath(p, tools.stroke)
    }
  } else if (type === 'heart') {
    const pulse = 1 + 0.12 * Math.sin(t * 5)
    for (const ex of both) {
      heart(tools, ex, y, 4.4 * pulse, C.heart, 1)
    }
  } else if (type === 'x') {
    setStroke(tools, C.face, 2.2)
    for (const ex of both) {
      const p = freshPath(tools)
      p.moveTo(ex - 2.4, y - 2.4)
      p.lineTo(ex + 2.4, y + 2.4)
      p.moveTo(ex + 2.4, y - 2.4)
      p.lineTo(ex - 2.4, y + 2.4)
      canvas.drawPath(p, tools.stroke)
    }
  } else if (type === 'wide') {
    for (const ex of both) {
      fillEllipse(tools, ex, y, 3.5, 4.4, C.face)
      fillEllipse(tools, ex + 1, y - 1.4, 1.1, 1.4, '#F4F8EC')
    }
  } else if (type === 'scan') {
    const px = Math.sin(t * 0.9) * 2.2
    for (const ex of both) {
      canvas.save()
      canvas.translate(ex + px, y)
      canvas.scale(1, blink)
      fillEllipse(tools, 0, 0, 2.6, 3.4, C.face)
      canvas.restore()
    }
  } else if (type === 'shy') {
    const glance = Math.pow(Math.max(0, Math.sin(t * 0.5)), 8)
    const px = -1.4 + glance * 1.2
    const py = 1.6 - glance * 3.2
    for (const ex of both) {
      canvas.save()
      canvas.translate(ex + px, y + py)
      canvas.scale(1, blink * 0.85)
      fillEllipse(tools, 0, 0, 2.3, 3, C.face)
      canvas.restore()
    }
  } else if (type === 'think') {
    const px = Math.tanh(Math.sin(t * 0.55) * 3) * 2
    for (const ex of both) {
      canvas.save()
      canvas.translate(ex + px, y - 3)
      canvas.scale(1, blink)
      fillEllipse(tools, 0, 0, 2.3, 3, C.face)
      canvas.restore()
    }
    setStroke(tools, C.face, 2)
    canvas.drawLine(R - 3.5, y - 8, R + 3, y - 7, tools.stroke)
  } else if (type === 'up') {
    const raised = [L + 1, R + 1]
    for (const ex of raised) {
      canvas.save()
      canvas.translate(ex, y - 3)
      canvas.scale(1, blink)
      fillEllipse(tools, 0, 0, 2.3, 3, C.face)
      canvas.restore()
    }
  } else {
    // dot (default) + variantes con cejas (worry/sad)
    for (const ex of both) {
      canvas.save()
      canvas.translate(ex, y)
      canvas.scale(1, blink * (type === 'sad' ? 0.75 : 1))
      fillEllipse(tools, 0, 0, 2.6, 3.4, C.face)
      canvas.restore()
    }
    if (type === 'worry') {
      setStroke(tools, C.face, 2)
      const p = freshPath(tools)
      p.moveTo(L - 3.5, y - 6.5)
      p.lineTo(L + 2.5, y - 5)
      p.moveTo(R + 3.5, y - 6.5)
      p.lineTo(R - 2.5, y - 5)
      canvas.drawPath(p, tools.stroke)
    }
    if (type === 'sad') {
      setStroke(tools, C.face, 2)
      const p = freshPath(tools)
      p.moveTo(L + 3.5, y - 6.5)
      p.lineTo(L - 2.5, y - 5)
      p.moveTo(R - 3.5, y - 6.5)
      p.lineTo(R + 2.5, y - 5)
      canvas.drawPath(p, tools.stroke)
    }
  }
}

// _mouth
function drawMouth(tools: Tools, type: MouthType, br: number) {
  'worklet'
  const { canvas } = tools
  if (type === 'open') {
    // semicírculo inferior (arc 0→π + closePath)
    const p = freshPath(tools)
    p.addArc(ovalRect(tools.env, 42, 63.5, 4.4, 4.4), 0, 180)
    p.close()
    setFill(tools, C.face)
    canvas.drawPath(p, tools.fill)
    // lengua: media elipse inferior
    const tongue = freshPath(tools)
    tongue.addArc(ovalRect(tools.env, 42, 66.2, 2.3, 1.3), 0, 180)
    tongue.close()
    setFill(tools, '#D98A76')
    canvas.drawPath(tongue, tools.fill)
  } else if (type === 'o') {
    fillEllipse(tools, 42, 64.5, 2.4, 3.1, C.face)
  } else if (type === 'wavy') {
    const p = freshPath(tools)
    p.moveTo(37, 64)
    p.quadTo(39.5, 62, 42, 64)
    p.quadTo(44.5, 66, 47, 64)
    setStroke(tools, C.face, 2.1)
    canvas.drawPath(p, tools.stroke)
  } else if (type === 'frown') {
    const p = freshPath(tools)
    p.moveTo(37.5, 65.3)
    p.quadTo(42, 61.6, 46.5, 65.3)
    setStroke(tools, C.face, 2.2)
    canvas.drawPath(p, tools.stroke)
  } else if (type === 'small') {
    const p = freshPath(tools)
    p.moveTo(39.6, 63.4)
    p.quadTo(42, 65.4, 44.4, 63.4)
    setStroke(tools, C.face, 2.1)
    canvas.drawPath(p, tools.stroke)
  } else if (type === 'smirk') {
    const p = freshPath(tools)
    p.moveTo(37.6, 64.4)
    p.quadTo(42.5, 67.6, 47.4, 61.8)
    setStroke(tools, C.face, 2.3)
    canvas.drawPath(p, tools.stroke)
  } else if (type === 'hmm') {
    setStroke(tools, C.face, 2.1)
    canvas.drawLine(38.6, 64, 45, 63.2, tools.stroke)
  } else if (type === 'hmm2') {
    const p = freshPath(tools)
    p.moveTo(36.5, 64.3)
    p.quadTo(39.5, 63.1, 42.5, 63.6)
    setStroke(tools, C.face, 2.1)
    canvas.drawPath(p, tools.stroke)
  } else if (type === 'oo') {
    canvas.save()
    canvas.translate(42, 64.5)
    const s = 1 + br * 0.12
    canvas.scale(s, s)
    strokeEllipse(tools, 0, 0, 1.7, 2.1, C.face, 1.8)
    canvas.restore()
  } else {
    // smile (default)
    const p = freshPath(tools)
    p.moveTo(37, 63)
    p.quadTo(42, 67.5, 47, 63)
    setStroke(tools, C.face, 2.2)
    canvas.drawPath(p, tools.stroke)
  }
}

// Glifo 'z' con path (reemplaza fillText '700 Nunito'); (x, y) = origen
// baseline-izquierda como en fillText.
function zGlyph(tools: Tools, x: number, y: number, fs: number, alpha: number) {
  'worklet'
  const w = fs * 0.44
  const h = fs * 0.52
  const x0 = x + fs * 0.05
  const p = freshPath(tools)
  p.moveTo(x0, y - h)
  p.lineTo(x0 + w, y - h)
  p.lineTo(x0, y)
  p.lineTo(x0 + w, y)
  setStroke(tools, C.face, fs * 0.16, alpha)
  tools.canvas.drawPath(p, tools.stroke)
}

// Glifo '?' con paths (reemplaza fillText '800 9.5px Nunito' centrado
// en (0, 0.5) con textAlign center / baseline middle).
function questionGlyph(tools: Tools) {
  'worklet'
  const { canvas } = tools
  canvas.save()
  canvas.translate(0, 0.5)
  const p = freshPath(tools)
  p.moveTo(-1.9, -1.6)
  p.quadTo(-1.9, -3.5, 0, -3.5)
  p.quadTo(1.9, -3.5, 1.9, -1.7)
  p.quadTo(1.9, -0.5, 0.15, -0.15)
  p.lineTo(0.15, 0.9)
  setStroke(tools, C.face, 1.5)
  canvas.drawPath(p, tools.stroke)
  setFill(tools, C.face)
  canvas.drawCircle(0.15, 3, 0.9, tools.fill)
  canvas.restore()
}

// Glifo '$' con paths (mismo reemplazo que questionGlyph).
function dollarGlyph(tools: Tools) {
  'worklet'
  const { canvas } = tools
  canvas.save()
  canvas.translate(0, 0.5)
  setStroke(tools, C.face, 1)
  canvas.drawLine(0, -4.1, 0, 4.1, tools.stroke)
  const s = freshPath(tools)
  s.moveTo(1.7, -2.3)
  s.quadTo(1.1, -3.2, 0, -3.2)
  s.quadTo(-1.8, -3.2, -1.8, -1.65)
  s.quadTo(-1.8, -0.3, 0, 0)
  s.quadTo(1.8, 0.3, 1.8, 1.65)
  s.quadTo(1.8, 3.2, 0, 3.2)
  s.quadTo(-1.1, 3.2, -1.7, 2.3)
  setStroke(tools, C.face, 1.5)
  canvas.drawPath(s, tools.stroke)
  canvas.restore()
}

// _extras: accesorios flotantes por pose.
function drawExtras(tools: Tools, list: readonly ExtraKind[] | undefined, t: number) {
  'worklet'
  if (list === undefined) {
    return
  }
  const { canvas } = tools
  for (const ex of list) {
    if (ex === 'zzz') {
      const fl = (Math.sin(t * 1.4) + 1) / 2
      const alpha = 0.5 + fl * 0.4
      zGlyph(tools, 68, 30 - fl * 4, 8, alpha)
      zGlyph(tools, 74, 22 - fl * 6, 5.5, alpha)
    } else if (ex === 'hearts') {
      for (let i = 0; i < 3; i++) {
        const yy = (t * 0.45 + i * 0.33) % 1
        heart(tools, 60 + i * 6 - yy * 5, 32 - yy * 20, 3 + i * 0.7, C.heart, (1 - yy) * 0.95)
      }
    } else if (ex === 'bang') {
      const pop = 1 + 0.12 * Math.sin(t * 5)
      canvas.save()
      canvas.translate(68, 16)
      canvas.scale(pop, pop)
      canvas.translate(-68, -16)
      setStroke(tools, '#D97E4F', 3.6)
      canvas.drawLine(68, 6, 68, 17, tools.stroke)
      setFill(tools, '#D97E4F')
      canvas.drawCircle(68, 23.5, 2, tools.fill)
      canvas.restore()
    } else if (ex === 'sweat') {
      const sy = 36 + ((t * 0.55) % 1) * 6
      canvas.save()
      canvas.translate(64, sy)
      const p = freshPath(tools)
      p.moveTo(0, -4)
      p.quadTo(3.4, 1.6, 0, 3.9)
      p.quadTo(-3.4, 1.6, 0, -4)
      p.close()
      setFill(tools, '#A8CFEA', 0.92)
      canvas.drawPath(p, tools.fill)
      setStroke(tools, '#7FAECF', 1.6, 0.92)
      canvas.drawPath(p, tools.stroke)
      canvas.restore()
    } else if (ex === 'dots') {
      for (let i = 0; i < 3; i++) {
        const a = (Math.sin(t * 2.4 - i * 0.9) + 1) / 2
        setFill(tools, C.face, 0.25 + a * 0.75)
        canvas.drawCircle(61 + i * 6.5, 26 - i * 4.5, 1.6 + i * 0.3, tools.fill)
      }
    } else if (ex === 'thought') {
      setFill(tools, C.face)
      canvas.drawCircle(57.5, 33, 1.4, tools.fill)
      canvas.drawCircle(62.5, 26, 2.1, tools.fill)
      const bob = Math.sin(t * 1.8) * 1.2
      canvas.save()
      canvas.translate(70, 14 + bob)
      setFill(tools, 'rgba(252,252,246,0.95)')
      canvas.drawCircle(0, 0, 8, tools.fill)
      setStroke(tools, C.outline, 1.8)
      canvas.drawCircle(0, 0, 8, tools.stroke)
      if (Math.floor(t * 0.35) % 2) {
        dollarGlyph(tools)
      } else {
        questionGlyph(tools)
      }
      canvas.restore()
    } else if (ex === 'sparkles') {
      const pts = [
        [20, 18],
        [66, 8],
        [72, 34],
      ] as const
      for (let i = 0; i < pts.length; i++) {
        const tw = (Math.sin(t * 3 + i * 2.1) + 1) / 2
        star(tools, pts[i][0], pts[i][1], 1.8 + tw * 2.6, i % 2 ? '#E8C46E' : '#7FB069')
      }
    }
  }
}

// rr() del original: rounded-rect simétrico vía moveTo/lineTo/quadTo (path
// manual, no un RRect nativo) para calcar el contorno exacto del original.
function coolLensPath(tools: Tools, x0: number) {
  'worklet'
  const l = x0 - COOL_GLASSES_W / 2
  const r = x0 + COOL_GLASSES_W / 2
  const tp = COOL_GLASSES_GY - COOL_GLASSES_H / 2
  const bt = COOL_GLASSES_GY + COOL_GLASSES_H / 2
  const rad = COOL_GLASSES_RAD
  const p = freshPath(tools)
  p.moveTo(l + rad, tp)
  p.lineTo(r - rad, tp)
  p.quadTo(r, tp, r, tp + rad)
  p.lineTo(r, bt - rad)
  p.quadTo(r, bt, r - rad, bt)
  p.lineTo(l + rad, bt)
  p.quadTo(l, bt, l, bt - rad)
  p.lineTo(l, tp + rad)
  p.quadTo(l, tp, l + rad, tp)
  p.close()
  return p
}

// lens() del original: relleno con gradiente (paint pre-armado del cache,
// ver createSkiaObjectCache) + dos trazos de reflejo + borde, para un
// lente centrado en x0.
//
// El original hace `rr(x0,w,h); ctx.clip()` antes de los reflejos; se
// omite acá porque con estas coordenadas exactas es un no-op geométrico
// (verificado analítica y numéricamente: los dos trazos de reflejo quedan
// siempre a >1.4u del arco de la esquina más cercana, radio 2.8) — no
// recortarían nada aunque se portara, así que portarlo no cambiaría un
// solo píxel.
function drawCoolLens(tools: Tools, x0: number, lensPaint: SkPaint) {
  'worklet'
  const { canvas } = tools
  const gy = COOL_GLASSES_GY
  canvas.drawPath(coolLensPath(tools, x0), lensPaint)
  const glintA = freshPath(tools)
  glintA.moveTo(x0 - 3.6, gy - 2.9)
  glintA.lineTo(x0 + 1.2, gy + 3.4)
  setStroke(tools, 'rgba(255,255,255,0.7)', 2.1)
  canvas.drawPath(glintA, tools.stroke)
  const glintB = freshPath(tools)
  glintB.moveTo(x0 - 0.6, gy - 3.2)
  glintB.lineTo(x0 + 2.6, gy + 0.8)
  setStroke(tools, 'rgba(255,255,255,0.3)', 1.1)
  canvas.drawPath(glintB, tools.stroke)
  setStroke(tools, '#040704', 1.8)
  canvas.drawPath(coolLensPath(tools, x0), tools.stroke)
}

// Bloque `if (P.custom === 'cool')` del original: gafas de sol wayfarer
// (patillas + lentes con gradiente + barra superior + puente arqueado).
// `ctx.lineJoin='round'; ctx.lineCap='round'` del original no se porta:
// tools.stroke ya queda cap/join round desde createSkiaObjectCache y
// nada en el archivo lo cambia, así que es el estado ambiente de siempre.
function drawCoolShades(tools: Tools) {
  'worklet'
  const { canvas } = tools
  const gy = COOL_GLASSES_GY
  const w = COOL_GLASSES_W
  const h = COOL_GLASSES_H
  const cL = COOL_GLASSES_CL
  const cR = COOL_GLASSES_CR

  // patillas simétricas hacia las hojas
  setStroke(tools, '#0B0F09', 3.1)
  const templeL = freshPath(tools)
  templeL.moveTo(cL - w / 2 + 0.4, gy - h / 2 + 2.2)
  templeL.lineTo(cL - w / 2 - 9, gy - 6.2)
  canvas.drawPath(templeL, tools.stroke)
  const templeR = freshPath(tools)
  templeR.moveTo(cR + w / 2 - 0.4, gy - h / 2 + 2.2)
  templeR.lineTo(cR + w / 2 + 9, gy - 6.2)
  canvas.drawPath(templeR, tools.stroke)

  // lentes oscuros con reflejo limpio
  drawCoolLens(tools, cL, tools.coolLensPaintLeft)
  drawCoolLens(tools, cR, tools.coolLensPaintRight)

  // barra superior gruesa continua (la seña "chad")
  setStroke(tools, '#0B0F09', 3.8)
  const topBar = freshPath(tools)
  topBar.moveTo(cL - w / 2 + 0.4, gy - h / 2 - 0.3)
  topBar.lineTo(cR + w / 2 - 0.4, gy - h / 2 - 0.3)
  canvas.drawPath(topBar, tools.stroke)

  // puente arqueado centrado — mismo strokeStyle '#0B0F09' que la barra de
  // arriba (el original no resetea strokeStyle entre las dos, solo el
  // lineWidth; acá se deja explícito en vez de heredado)
  setStroke(tools, '#0B0F09', 3.1)
  const bridge = freshPath(tools)
  bridge.moveTo(cL + w / 2 - 0.4, gy - h / 2 + 2.2)
  bridge.quadTo(COOL_GLASSES_CX, gy - h / 2 - 0.4, cR - w / 2 + 0.4, gy - h / 2 + 2.2)
  canvas.drawPath(bridge, tools.stroke)
}

// Brazos con ángulo dependiente del tiempo (las funciones de la tabla
// POSES original, expresadas como switch worklet-safe).
function armAngles(pose: BrotPose, spec: PoseSpec, t: number): { aL: number; aR: number } {
  'worklet'
  const hang = 0.1 + Math.sin(t * 1.9) * 0.05
  switch (pose) {
    case 'wave':
      return { aL: hang, aR: 2.45 + Math.sin(t * 4.2) * 0.22 }
    case 'cheer':
      return { aL: 2.5 + Math.sin(t * 3.1 + 0.4) * 0.12, aR: 2.5 + Math.sin(t * 3.1) * 0.12 }
    case 'coach':
      return { aL: 2.15 + Math.sin(t * 2.2) * 0.06, aR: hang }
    case 'magic':
      return { aL: hang, aR: 2.3 + Math.sin(t * 2.6) * 0.1 }
    case 'cool':
      return { aL: 0.16 + Math.sin(t * 1.5) * 0.04, aR: 0.9 + Math.sin(t * 1.5 + 0.5) * 0.05 }
    default:
      return { aL: spec.aL ?? hang, aR: spec.aR ?? hang }
  }
}

// _draw: frame completo. Orden de capas idéntico al original:
// sombra → transformaciones → halo → patas → brazos traseros → cuerpo
// (gradiente) → brillo → rubor → ojos → boca → hojas → detalles custom
// → manos de peek → extras.
function drawBrot(tools: Tools, pose: BrotPose, t: number) {
  'worklet'
  const spec: PoseSpec = POSES[pose] ?? {}
  const { canvas } = tools

  if (spec.seed === true) {
    drawSeed(tools, t)
    return
  }

  const cx = 42
  const isPeek = pose === 'peek'
  const br = Math.sin(t * 1.9)
  const bounce =
    spec.bounce !== undefined ? -3.2 * spec.bounce * Math.abs(Math.sin(t * 3.1)) : 0
  const floatY = spec.float === true ? Math.sin(t * 1.6) * 3 - 4 : 0
  const tilt =
    (spec.tilt ?? 0) +
    (spec.wobble === true ? Math.sin(t * 2.8) * 0.06 : 0) +
    (spec.sway === true ? 0.02 + Math.sin(t * 1.3) * 0.03 : 0)
  const bodyFill = spec.dull === true ? C.dull : C.body
  const out = spec.dull === true ? C.dullOut : C.outline

  if (!isPeek && tools.shadowOn) {
    const rx = 19 - bounce * 0.8 + floatY * 1.0
    fillEllipse(tools, cx, 103, Math.max(rx, 10), 3, C.shadow)
  }

  canvas.save()
  if (isPeek) {
    const duck = Math.pow(Math.max(0, Math.sin(t * 0.55)), 10) * 11 + Math.sin(t * 2.1) * 0.8
    canvas.translate(0, duck)
    rot(canvas, -0.04 + Math.sin(t * 0.5) * 0.035, cx, 72)
  }
  canvas.translate(0, bounce + floatY)
  rot(canvas, tilt, cx, 96)
  // respiración: escala anclada en (cx, 96)
  const brA = spec.deep === true ? Math.sin(t * 1.05) * 2.1 : br
  canvas.translate(cx, 96)
  canvas.scale(1 - 0.008 * brA, 1 + 0.016 * brA)
  canvas.translate(-cx, -96)

  // halo zen
  // Este 1.05 es el MISMO argumento de fase que el brA de arriba, y es
  // deliberado: el original acopla las dos frecuencias (brot.js:408 y
  // :413), así que el halo late en fase con el respiro del cuerpo.
  // Desacoplarlos rompe la fidelidad 1:1 — no recorta nada (con PAD_X el
  // canvas llega hasta x=90 y el peor caso del halo es 84.7).
  if (spec.halo === true) {
    const pr = 33 + Math.sin(t * 1.05) * 2
    setFill(tools, 'rgba(159,220,159,0.08)')
    canvas.drawCircle(cx, 58, pr + 7, tools.fill)
    setFill(tools, 'rgba(159,220,159,0.13)')
    canvas.drawCircle(cx, 58, pr, tools.fill)
  }

  // patas
  if (!isPeek && spec.legs !== 'cross') {
    if (spec.legs === 'pigeon') {
      const tw = Math.sin(t * 2.6) * 1.2
      capsule(tools, 32, 92, 34.5 + tw, 97.5, 8.5, bodyFill, out)
      capsule(tools, 52, 92, 49.5, 97.5, 8.5, bodyFill, out)
    } else {
      capsule(tools, 32, 92, 32, 97.5, 8.5, bodyFill, out)
      capsule(tools, 52, 92, 52, 97.5, 8.5, bodyFill, out)
    }
  }

  // brazos traseros
  if (!isPeek && spec.noArms !== true) {
    const { aL, aR } = armAngles(pose, spec, t)
    capsule(tools, 19, 62, 19 - Math.sin(aL) * ARM_L, 62 + Math.cos(aL) * ARM_L, ARM_W, bodyFill, out)
    capsule(tools, 65, 62, 65 + Math.sin(aR) * ARM_L, 62 + Math.cos(aR) * ARM_L, ARM_W, bodyFill, out)
  }

  // cuerpo (huevo) con gradiente vertical bodyFill → bodyFill2 (y 26→98).
  // El paint con el gradiente es invariante en el tiempo: viene pre-armado
  // del cache (variante normal o dull según la pose).
  const egg = freshPath(tools)
  egg.moveTo(cx, 27)
  egg.cubicTo(cx + 20, 27, cx + 27, 48, cx + 27, 66)
  egg.cubicTo(cx + 27, 84, cx + 16, 97, cx, 97)
  egg.cubicTo(cx - 16, 97, cx - 27, 84, cx - 27, 66)
  egg.cubicTo(cx - 27, 48, cx - 20, 27, cx, 27)
  egg.close()
  canvas.drawPath(egg, spec.dull === true ? tools.bodyPaintDull : tools.bodyPaint)
  setStroke(tools, out, 2.4)
  canvas.drawPath(egg, tools.stroke)

  // brillo
  canvas.save()
  canvas.translate(30, 37)
  rot(canvas, -0.5, 0, 0)
  fillEllipse(tools, 0, 0, 7, 3.6, 'rgba(255,255,255,0.85)')
  fillEllipse(tools, 9, 4, 2, 1.1, 'rgba(255,255,255,0.7)')
  canvas.restore()

  // rubor
  if (spec.blush !== undefined) {
    const a = BLUSH_ALPHA * (spec.blush === 2 ? 1 : 0.8)
    canvas.save()
    rot(canvas, 0.1, 28.5, 62.5)
    fillEllipse(tools, 28.5, 62.5, 3.8, 2.1, C.blushBase, a)
    canvas.restore()
    canvas.save()
    rot(canvas, -0.1, 55.5, 62.5)
    fillEllipse(tools, 55.5, 62.5, 3.8, 2.1, C.blushBase, a)
    canvas.restore()
  }

  // cara
  drawEyes(tools, spec.eyes ?? 'dot', t)
  drawMouth(tools, spec.mouth ?? 'smile', br)

  // hojas
  drawLeaves(tools, spec.leaves ?? 'normal', t, spec.dull === true)

  // detalles por pose (frente)
  if (spec.custom === 'shy') {
    const press = Math.sin(t * 2.6) * 0.9
    capsule(tools, 19, 63, 38.2 + press, 81, ARM_W, bodyFill, out)
    capsule(tools, 65, 63, 45.8 - press, 81, ARM_W, bodyFill, out)
  }
  if (spec.custom === 'think') {
    capsule(tools, 19, 63, 44, 76, ARM_W, bodyFill, out)
    capsule(tools, 65, 63, 51, 71.5, ARM_W, bodyFill, out)
    canvas.save()
    canvas.translate(49.5, 69.5)
    rot(canvas, -0.35, 0, 0)
    fillEllipse(tools, 0, 0, 4.6, 3.4, bodyFill)
    strokeEllipse(tools, 0, 0, 4.6, 3.4, out, 2.2)
    canvas.restore()
  }
  if (spec.custom === 'zen') {
    capsule(tools, 31, 90.5, 47, 95, 8, bodyFill, out)
    capsule(tools, 53, 90.5, 37, 95, 8, bodyFill, out)
    capsule(tools, 19, 63, 25, 81, ARM_W, bodyFill, out)
    capsule(tools, 65, 63, 59, 81, ARM_W, bodyFill, out)
    const hands = [
      [25.5, 82.5],
      [58.5, 82.5],
    ] as const
    for (const h of hands) {
      fillEllipse(tools, h[0], h[1], 4.4, 3.2, bodyFill)
      strokeEllipse(tools, h[0], h[1], 4.4, 3.2, out, 2.2)
    }
    // hoja orbitando
    const oa = t * 0.7
    const ox = cx + Math.cos(oa) * 31
    const oy = 56 + Math.sin(oa) * 13
    const orbitAlpha = 0.35 + 0.4 * (0.5 - Math.sin(oa) / 2)
    leaf(tools, ox, oy, ox + Math.sin(oa) * 7, oy - 5, C.leafL, C.outline, orbitAlpha)
  }

  // manitos con deditos agarrados al borde (peek)
  if (isPeek) {
    const handXs = [26, 58]
    for (let i = 0; i < handXs.length; i++) {
      canvas.save()
      canvas.translate(handXs[i], 68.8 + Math.sin(t * 2 + i) * 0.35)
      fillEllipse(tools, 0, 1.2, 5.6, 3.4, bodyFill)
      strokeEllipse(tools, 0, 1.2, 5.6, 3.4, out, 2.2)
      for (let f = -1; f <= 1; f++) {
        setFill(tools, bodyFill)
        canvas.drawCircle(f * 3.1, -2.2, 1.75, tools.fill)
        setStroke(tools, out, 1.9)
        canvas.drawCircle(f * 3.1, -2.2, 1.75, tools.stroke)
      }
      canvas.restore()
    }
  }

  // gafas de sol de la pose 'cool'
  if (spec.custom === 'cool') {
    drawCoolShades(tools)
  }

  // accesorios
  drawExtras(tools, spec.extras, t)

  canvas.restore()
}

// ─── Componente ──────────────────────────────────────────────────────

/** Crea los objetos Skia longevos de una instancia (JS thread, una vez por
 *  mount). El canvas de grabación copia paint/path al grabar cada comando,
 *  así que reusarlos y mutarlos frame a frame es seguro. */
function createSkiaObjectCache(env: SkiaEnv): SkiaObjectCache {
  const { Skia } = env
  const fill = Skia.Paint()
  fill.setAntiAlias(true)
  fill.setStyle(env.psFill)
  const stroke = Skia.Paint()
  stroke.setAntiAlias(true)
  stroke.setStyle(env.psStroke)
  stroke.setStrokeCap(env.capRound)
  stroke.setStrokeJoin(env.joinRound)
  const makeBodyPaint = (c1: string, c2: string) => {
    const p = Skia.Paint()
    p.setAntiAlias(true)
    p.setStyle(env.psFill)
    p.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: 0, y: 26 },
        { x: 0, y: 98 },
        [Skia.Color(c1), Skia.Color(c2)],
        null,
        env.tileClamp,
      ),
    )
    return p
  }
  // lens() del original: gradiente diagonal de 3 stops por lente de la
  // pose 'cool' (x0 = centro del lente — COOL_GLASSES_CL/CR — es la única
  // diferencia entre el izquierdo y el derecho).
  const makeLensPaint = (x0: number) => {
    const p = Skia.Paint()
    p.setAntiAlias(true)
    p.setStyle(env.psFill)
    p.setShader(
      Skia.Shader.MakeLinearGradient(
        { x: x0 - COOL_GLASSES_W / 2, y: COOL_GLASSES_GY - COOL_GLASSES_H / 2 },
        { x: x0 + COOL_GLASSES_W / 2, y: COOL_GLASSES_GY + COOL_GLASSES_H / 2 },
        [Skia.Color('#33472A'), Skia.Color('#111C0D'), Skia.Color('#070C06')],
        [0, 0.5, 1],
        env.tileClamp,
      ),
    )
    return p
  }
  return {
    fill,
    stroke,
    bodyPaint: makeBodyPaint(C.body, C.body2),
    bodyPaintDull: makeBodyPaint(C.dull, C.dull2),
    coolLensPaintLeft: makeLensPaint(COOL_GLASSES_CL),
    coolLensPaintRight: makeLensPaint(COOL_GLASSES_CR),
    path: Skia.Path.Make(),
  }
}

// Props = primitivas: memo evita re-grabar el frame estático y re-correr
// el body por re-renders del padre (p.ej. por keystroke en un form).
export const BrotMascot = memo(function BrotMascot({
  pose = 'idle',
  size = 120,
  animated = true,
  shadow = true,
}: BrotMascotProps) {
  const skiaModule = getOptionalSkiaModule()

  // Subconjunto worklet-safe del módulo (estable para toda la vida de la
  // app: getOptionalSkiaModule cachea el require).
  const skiaEnv = useMemo<SkiaEnv | null>(() => {
    if (!skiaModule) {
      return null
    }
    return {
      Skia: skiaModule.Skia,
      psFill: skiaModule.PaintStyle.Fill,
      psStroke: skiaModule.PaintStyle.Stroke,
      capRound: skiaModule.StrokeCap.Round,
      joinRound: skiaModule.StrokeJoin.Round,
      tileClamp: skiaModule.TileMode.Clamp,
    }
  }, [skiaModule])

  // Objetos Skia longevos por instancia (paints, gradientes, path scratch).
  const skiaCache = useMemo<SkiaObjectCache | null>(
    () => (skiaEnv === null ? null : createSkiaObjectCache(skiaEnv)),
    [skiaEnv],
  )

  // Fase random por instancia (como this._phase del original) para que
  // varios Brots no respiren sincronizados.
  const phase = useMemo(() => Math.random() * 10, [])

  const viewH = pose === 'peek' ? 72 : 108
  const scale = size / viewH
  // Caja de LAYOUT: sigue siendo exactamente el viewBox, así que ningún
  // call site se mueve. El canvas es más grande y sobresale de ella.
  const boxH = size
  const boxW = size * (84 / viewH)
  const canvasW = (84 + PAD_X * 2) * scale
  const canvasH = (viewH + PAD_TOP + PAD_BOTTOM) * scale

  // Reloj en segundos (t = "segundos desde el mount" + phase) en el UI
  // thread. Anclado a info.timestamp (reloj absoluto de frames) con el
  // primer timestamp persistido en un shared value: re-registrar el frame
  // callback resetea timeSinceFirstFrame a 0 pero NO este ancla, así que
  // la animación nunca rebobina. El worklet además tiene identidad estable
  // (useMemo sobre valores estables) para que useFrameCallback no se
  // re-registre en cada render del padre.
  const clock = useSharedValue(phase)
  const clockStart = useSharedValue(-1)
  const onFrame = useMemo(
    () => (info: FrameInfo) => {
      'worklet'
      if (clockStart.value < 0) {
        clockStart.value = info.timestamp
      }
      clock.value = (info.timestamp - clockStart.value) / 1000 + phase
    },
    [clock, clockStart, phase],
  )
  const frameCallback = useFrameCallback(onFrame, false)

  // Gate por foco: pantallas de stack tapadas quedan montadas; sin esto el
  // loop seguiría grabando SkPictures a 60fps invisible. Con el reloj por
  // timestamp, al recuperar foco t salta como si nunca hubiera parado.
  const isFocused = useOptionalIsFocused()
  // Reduce Motion del sistema + hardware débil (deviceYearClass): la pose
  // queda en su frame estático — la emoción se lee igual, sin loop por
  // frame (review r1 del cableado: el flujo viejo gateaba TODO con este
  // hook; gatearlo acá cubre a todos los consumidores de una vez).
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (!animated || reducedMotion || skiaEnv === null || !isFocused) {
      return
    }
    frameCallback.setActive(true)
    return () => {
      frameCallback.setActive(false)
    }
  }, [animated, reducedMotion, frameCallback, skiaEnv, isFocused])

  // Un SkPicture nuevo por frame, grabado en el UI thread. Con
  // animated=false el clock nunca cambia y esto corre una sola vez
  // (frame estático en t=STATIC_T, sin loop). OJO: este worklet no debe
  // escribir shared values capturados — serían inputs del mapper y cada
  // escritura lo re-dispararía (por eso el dispose vive en la reaction
  // de abajo y el cache se crea en el JS thread).
  const picture = useDerivedValue<SkPicture | null>(() => {
    const env = skiaEnv
    const cache = skiaCache
    if (env === null || cache === null) {
      return null
    }
    // reducedMotion incluido (review r2): con animated=true pero
    // reducedMotion=true el frameCallback no corre y clock.value quedaría
    // clavado en `phase` (Math.random) — un instante ALEATORIO (Brot
    // podría congelarse con los ojos cerrados o a mitad del duck). El
    // frame estático canónico es STATIC_T.
    const t = animated && !reducedMotion ? clock.value : STATIC_T
    const { Skia } = env
    const recorder = Skia.PictureRecorder()
    // El rect del recorder VA JUNTO con el tamaño del <Canvas>: es un
    // cull rect (Skia lo declara advisory — "lo de afuera puede o no
    // dibujarse"), y rn-skia arma un RTree con esos bounds, así que las
    // ops de afuera son candidatas a cullearse en playback. Dejarlo en
    // la caja vieja sería comportamiento indefinido: anda en un device
    // y recorta en otro.
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, canvasW, canvasH))
    canvas.scale(scale, scale)
    // Corre el origen al del viewBox dentro del papel más grande, así
    // drawBrot() sigue dibujando en las coordenadas originales.
    canvas.translate(PAD_X, PAD_TOP)
    const tools: Tools = {
      env,
      canvas,
      fill: cache.fill,
      stroke: cache.stroke,
      bodyPaint: cache.bodyPaint,
      bodyPaintDull: cache.bodyPaintDull,
      coolLensPaintLeft: cache.coolLensPaintLeft,
      coolLensPaintRight: cache.coolLensPaintRight,
      path: cache.path,
      shadowOn: shadow,
    }
    drawBrot(tools, pose, t)
    const result = recorder.finishRecordingAsPicture()
    recorder.dispose()
    return result
  })

  // Libera el picture anterior al reemplazarlo. Va en una reaction aparte
  // (inputs = solo `picture`) y no dentro del worklet de arriba, para no
  // re-disparar el mapper que lo produce. En rn-skia 2.2.12 dispose() es
  // no-op en native (la memoria la maneja el GC vía memory pressure), pero
  // deja el ownership explícito y libera en web/futuras versiones.
  useAnimatedReaction(
    () => picture.value,
    (current, previous) => {
      if (previous !== null && previous !== current) {
        previous.dispose()
      }
    },
  )

  if (!skiaModule || skiaEnv === null) {
    // Sin Skia (web / test env): placeholder que preserva el layout.
    return <View style={{ width: boxW, height: boxH }} />
  }

  const { Canvas, Picture } = skiaModule
  return (
    // El wrapper mide el viewBox (layout intacto) y el <Canvas> sobresale
    // con offsets negativos. OJO: cualquier ancestro con overflow:'hidden'
    // vuelve a recortar a Brot — el default de RN es 'visible' en las dos
    // plataformas (Android además fuerza clipChildren=false), y un
    // borderRadius sin overflow NO recorta.
    // pointerEvents none: Brot es decorativo en los 11 call sites, y sin
    // esto el área que sobresale (que en iOS no está clipeada) se comería
    // taps de lo que tenga al lado.
    <View pointerEvents="none" style={{ width: boxW, height: boxH }}>
      <Canvas
        style={{
          position: 'absolute',
          left: -PAD_X * scale,
          top: -PAD_TOP * scale,
          width: canvasW,
          height: canvasH,
        }}
      >
        {/* El worklet solo devuelve null cuando skiaEnv es null, y en ese
            caso no llegamos acá — el cast es seguro. */}
        <Picture picture={picture as SharedValue<SkPicture>} />
      </Canvas>
    </View>
  )
})
