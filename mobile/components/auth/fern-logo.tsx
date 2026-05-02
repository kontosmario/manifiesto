import { useEffect } from 'react'
import { View } from 'react-native'
import Svg, { Path, G } from 'react-native-svg'
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

const AnimatedPath = Animated.createAnimatedComponent(Path)

const AnimatedG = Animated.createAnimatedComponent(G)

type Palette = 'dark' | 'light' | 'mono-dark' | 'mono-light' | 'duotone'

interface FernLogoProps {
  size?: number
  palette?: Palette
  animate?: boolean
  delay?: number
  iconMode?: boolean
}

const PALETTES: Record<Palette, { leafA: string; leafB: string; structure: string }> = {
  dark: {
    leafA: '#1F7A4B',
    leafB: '#1F7A4B',
    structure: '#0E3A26',
  },
  light: {
    leafA: '#9FD97A',
    leafB: '#9FD97A',
    structure: '#FFFBF2',
  },
  'mono-dark': {
    leafA: '#0E3A26',
    leafB: '#0E3A26',
    structure: '#0E3A26',
  },
  'mono-light': {
    leafA: '#FFFBF2',
    leafB: '#FFFBF2',
    structure: '#FFFBF2',
  },
  duotone: {
    leafA: '#0E3A26',
    leafB: '#E08E63',
    structure: '#0E3A26',
  },
}

// Tight crop around the canonical SVG (assets/brand/manifiesto-fern.svg):
// leaves top ≈ y=113, pill bottom ≈ y=384. We add a small margin so the
// art doesn't kiss the edges (looks better as a brand mark on its own).
//   normal: includes the bottom pill (full mark for hero use)
//   icon:   excludes the pill, focuses on bowl + stem (compact navbar icon)
const VIEWBOX_NORMAL = '0 100 502 295'
const VIEWBOX_ICON = '15 110 472 215'
const ASPECT_NORMAL = 295 / 502
const ASPECT_ICON = 215 / 472

const D_BIG_LEAF = `M337.1,254.779c-34.545,5.548-67.046-17.959-72.594-52.504
  s17.959-67.046,52.504-72.594
  C417.26,113.581,492,261.545,492,261.545
  S413.358,242.533,337.1,254.779z`

const D_SMALL_LEAF = `M111.366,249.668c22.606,3.63,43.875-11.752,47.505-34.358
  s-11.752-43.875-34.358-47.505
  C58.91,157.269,10,254.096,10,254.096
  S61.463,241.654,111.366,249.668z`

const D_STRUCTURE = `M500.926,257.036c-0.787-1.559-19.642-38.57-51.366-74.119
  c-18.881-21.157-38.428-37.369-58.096-48.187
  c-25.338-13.936-50.919-18.958-76.04-14.923
  c-19.345,3.106-36.321,13.561-47.804,29.437
  c-7.96,11.006-12.612,23.705-13.685,36.905
  c-14.89,4.115-27.968,9.962-38.457,17.275
  c-6.814,4.751-12.31,10.029-16.389,15.628
  c-7.313-7.048-17.71-12.946-30.119-16.851
  c-2.833-22.038-19.845-40.571-42.872-44.27
  C54.103,146.367,3.206,245.368,1.074,249.587
  c-1.758,3.479-1.333,7.664,1.088,10.72
  c1.923,2.426,4.826,3.789,7.838,3.789
  c0.781,0,1.569-0.092,2.35-0.28
  c0.496-0.119,50.059-11.879,97.431-4.274
  c13.573,2.182,27.178-1.056,38.314-9.11
  c9.486-6.861,16.199-16.524,19.331-27.622
  c15.11,5.769,23.256,14.539,23.256,20.116
  l-0.085,82.058
  c-0.006,5.523,4.467,10.005,9.989,10.011
  c0.004,0,0.007,0,0.011,0
  c5.518,0,9.994-4.471,10-9.989
  l0.085-82.068
  c0-12.153,15.442-27.405,44.459-36.331
  c3.621,18.201,13.808,34.125,28.926,45.06
  c15.874,11.481,35.271,16.099,54.617,12.987
  c73.286-11.767,150.2,6.43,150.965,6.612
  c0.78,0.188,1.568,0.28,2.35,0.28
  c3.012,0,5.915-1.363,7.837-3.789
  C502.259,264.7,502.684,260.517,500.926,257.036z
  M136.374,234.225c-6.809,4.925-15.124,6.898-23.422,5.57
  c-31.319-5.031-62.832-2.406-83.126,0.52
  c15.812-24.062,47.327-63.308,84.686-63.308
  c2.772,0,5.583,0.217,8.415,0.671
  c11.54,1.854,20.607,9.805,24.457,20.032
  c-11.101-1.384-22.205-1.709-33.09-0.938
  c-5.509,0.39-9.659,5.172-9.269,10.681
  c0.39,5.51,5.168,9.684,10.681,9.269
  c10.601-0.749,21.456-0.317,32.302,1.254
  C146.019,224.494,141.991,230.162,136.374,234.225z
  M335.514,244.906c-14.064,2.259-28.178-1.096-39.725-9.447
  c-11.182-8.087-18.651-19.929-21.165-33.448
  c0.667-0.115,1.324-0.236,2.001-0.344
  c24.446-3.926,48.841-4.08,72.503-0.46
  c5.45,0.836,10.562-2.912,11.397-8.372
  s-2.913-10.563-8.372-11.397
  c-25.307-3.874-51.347-3.77-77.421,0.29
  c1.482-7.401,4.538-14.464,9.094-20.763
  c8.351-11.548,20.699-19.151,34.77-21.411
  c71.229-11.429,130.472,70.104,153.813,107.941
  C443.222,242.571,389.167,236.289,335.514,244.906z`

const D_INNER = `M414.567,199.57c-10.438-4.554-21.218-8.425-32.042-11.508
  c-5.307-1.509-10.844,1.567-12.356,6.88
  c-1.512,5.312,1.568,10.844,6.88,12.356
  c9.968,2.838,19.899,6.405,29.521,10.604
  c1.302,0.567,2.659,0.837,3.994,0.837
  c3.855,0,7.53-2.244,9.171-6.004
  C421.942,207.674,419.63,201.779,414.567,199.57z`

// Bottom pill — the small vertical capsule centered around x=200, y≈356.
const D_PILL = `M200.578,347
  c-0.004,0-0.008,0-0.012,0
  c-5.518,0-9.993,4.47-10,9.988
  l-0.02,16.544
  c-0.007,5.522,4.466,10.005,9.988,10.012
  c0.004,0,0.008,0,0.012,0
  c5.518,0,9.993-4.47,10-9.988
  l0.02-16.544
  C210.573,351.489,206.101,347.007,200.578,347z`

export function FernLogo({
  size = 200,
  palette = 'dark',
  animate = false,
  delay = 0,
  iconMode = false,
}: FernLogoProps) {
  const reducedMotion = useReducedMotion()
  const isAnimated = animate && !reducedMotion

  const c = PALETTES[palette]
  const vb = iconMode ? VIEWBOX_ICON : VIEWBOX_NORMAL
  const aspect = iconMode ? ASPECT_ICON : ASPECT_NORMAL
  const height = size * aspect

  const bigLeafProgress = useSharedValue(isAnimated ? 0 : 1)
  const smallLeafProgress = useSharedValue(isAnimated ? 0 : 1)
  const structureProgress = useSharedValue(isAnimated ? 0 : 1)
  const pillProgress = useSharedValue(isAnimated ? 0 : 1)

  useEffect(() => {
    if (!isAnimated) {
      bigLeafProgress.value = 1
      smallLeafProgress.value = 1
      structureProgress.value = 1
      pillProgress.value = 1
      return
    }

    const easeOutSoft = Easing.bezier(0.2, 0.85, 0.2, 1)
    const easeInOut = Easing.bezier(0.4, 0, 0.2, 1)

    bigLeafProgress.value = 0
    smallLeafProgress.value = 0
    structureProgress.value = 0
    pillProgress.value = 0

    bigLeafProgress.value = withDelay(delay, withTiming(1, { duration: 1400, easing: easeOutSoft }))
    smallLeafProgress.value = withDelay(delay + 200, withTiming(1, { duration: 1400, easing: easeOutSoft }))
    structureProgress.value = withDelay(delay + 400, withTiming(1, { duration: 1100, easing: easeInOut }))
    pillProgress.value = withDelay(delay + 900, withTiming(1, { duration: 600, easing: easeInOut }))
  }, [isAnimated, delay, bigLeafProgress, smallLeafProgress, structureProgress, pillProgress])

  // For react-native-svg, animated transforms must be applied via animatedProps
  // (transform / opacity are SVG attributes on <g>/<circle>), not via View styles.
  // We build each transform string with the appropriate origin so the scale pivots
  // around the visual center of each element.

  const bigLeafProps = useAnimatedProps(() => {
    const s = 0.6 + bigLeafProgress.value * 0.4
    const ox = 380
    const oy = 200
    return {
      opacity: bigLeafProgress.value,
      transform: `translate(${ox}, ${oy}) scale(${s}) translate(${-ox}, ${-oy})`,
    } as Record<string, unknown>
  })
  const smallLeafProps = useAnimatedProps(() => {
    const s = 0.6 + smallLeafProgress.value * 0.4
    const ox = 90
    const oy = 210
    return {
      opacity: smallLeafProgress.value,
      transform: `translate(${ox}, ${oy}) scale(${s}) translate(${-ox}, ${-oy})`,
    } as Record<string, unknown>
  })
  const structureProps = useAnimatedProps(() => ({
    opacity: structureProgress.value,
  }))
  // Path-drawing overlay for the structure: a stroke that draws the
  // silhouette outline of `D_STRUCTURE` ahead of the fill fade-in.
  // Visual effect: as the bowl + stem appear, you see the contour
  // line trace itself first (during the first ~60% of the structure
  // phase), then it fades as the solid fill takes over (last ~40%).
  // STROKE_PATH_LENGTH is a generous overshoot — the actual path
  // length is well below this; SVG dasharray accepts any value ≥
  // path-length and behaves correctly. We avoid `getTotalLength()`
  // because it's not exposed by react-native-svg.
  const STROKE_PATH_LENGTH = 2000
  const structureStrokeProps = useAnimatedProps(() => {
    const p = structureProgress.value
    // Phase 1 (0 → 0.6): stroke draws (dashoffset full → 0).
    const drawPhase = Math.min(1, p / 0.6)
    // Phase 2 (0.6 → 1): stroke fades out as fill takes over.
    const settlePhase = Math.max(0, (p - 0.6) / 0.4)
    return {
      strokeDashoffset: STROKE_PATH_LENGTH * (1 - drawPhase),
      strokeOpacity: 1 - settlePhase,
    } as Record<string, unknown>
  })
  const pillProps = useAnimatedProps(() => {
    const ox = 200
    const oy = 365
    const s = 0.6 + pillProgress.value * 0.4
    return {
      opacity: pillProgress.value,
      transform: `translate(${ox}, ${oy}) scale(${s}) translate(${-ox}, ${-oy})`,
    } as Record<string, unknown>
  })


  // Inline initial props matching the worklet's value at progress=0.
  // First-paint protection: without these, the SVG renders ONCE with
  // its default props (no opacity attr → opacity 1, no transform →
  // scale 1) before Reanimated's `animatedProps` apply on frame 2.
  // On native this caused a visible "placeholder" flash of the fully-
  // drawn fern, then a snap to invisible/scaled-down, then the
  // animation. Web didn't show this because the browser merges styles
  // before first paint; cold-start on native didn't either because
  // the JS thread is saturated long enough that Reanimated catches
  // up before the first frame paints. Post-login (JS warm) made the
  // flicker visible. The inline values below are overridden by
  // `animatedProps` on every subsequent frame, so the animation
  // itself is unchanged.
  //
  // When NOT animated (reduced motion or `animate=false`), the worklet
  // sits at the final state (opacity 1, scale 1) — which matches the
  // SVG defaults, so no inline override needed.
  const initialBigLeaf = isAnimated
    ? { opacity: 0, transform: 'translate(380,200) scale(0.6) translate(-380,-200)' }
    : null
  const initialSmallLeaf = isAnimated
    ? { opacity: 0, transform: 'translate(90,210) scale(0.6) translate(-90,-210)' }
    : null
  const initialStructure = isAnimated ? { opacity: 0 } : null
  const initialPill = isAnimated
    ? { opacity: 0, transform: 'translate(200,365) scale(0.6) translate(-200,-365)' }
    : null

  return (
    <View style={{ width: size, height }}>
      <Svg width={size} height={height} viewBox={vb}>
        {/* Big leaf */}
        <AnimatedG {...initialBigLeaf} animatedProps={bigLeafProps}>
          <Path d={D_BIG_LEAF} fill={c.leafA} />
        </AnimatedG>

        {/* Small leaf */}
        <AnimatedG {...initialSmallLeaf} animatedProps={smallLeafProps}>
          <Path d={D_SMALL_LEAF} fill={c.leafB} />
        </AnimatedG>

        {/* Structure (bowl + integrated stem + branch detail).
            The group's wrapper opacity (structureProps) handles the
            overall fade-in. Inside, we layer the solid fill UNDER an
            animated stroke overlay that path-draws the silhouette
            during the first 60% of the phase, then fades as the fill
            takes over. The stroke is `fill="none"` so it doesn't
            double the silhouette — just traces the contour.
            For non-animated mounts (reduced motion or animate=false),
            the stroke overlay sits at strokeDashoffset=0 and
            strokeOpacity=0, so it's invisible — the fill alone
            renders, identical to the previous behavior. */}
        <AnimatedG {...initialStructure} animatedProps={structureProps}>
          <Path d={D_STRUCTURE} fill={c.structure} />
          <Path d={D_INNER} fill={c.structure} />
          {isAnimated ? (
            <AnimatedPath
              d={D_STRUCTURE}
              fill="none"
              stroke={c.structure}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={STROKE_PATH_LENGTH}
              strokeDashoffset={STROKE_PATH_LENGTH}
              animatedProps={structureStrokeProps}
            />
          ) : null}
        </AnimatedG>

        {/* Bottom pill — small vertical capsule under the stem */}
        <AnimatedG {...initialPill} animatedProps={pillProps}>
          <Path d={D_PILL} fill={c.structure} />
        </AnimatedG>
      </Svg>
    </View>
  )
}

export default FernLogo
