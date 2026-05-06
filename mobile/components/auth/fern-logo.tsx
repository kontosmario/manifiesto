import { useEffect } from 'react'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

const AnimatedPath = Animated.createAnimatedComponent(Path)

export type FernPalette = 'dark' | 'light' | 'peach' | 'mono-light' | 'warm'

interface FernLogoProps {
  size?: number
  palette?: FernPalette
  animate?: boolean
  delay?: number
  /**
   * Crop the viewBox to leaves-only (no stem) for compact contexts
   * like nav bars and avatars. Stem-draw animation is suppressed in
   * this mode since the stem isn't visible.
   */
  iconMode?: boolean
}

// ─── Palette mapping ─────────────────────────────────────────────────
// v2 art has THREE colour layers: silhouette (cream halo + stem),
// big leaf, small leaf. Each named palette maps these layers to a
// concrete colour from `authTokens` / brand. Names preserved from v1
// so existing call sites keep working.
const PALETTES: Record<FernPalette, { silhouette: string; leafBig: string; leafSmall: string }> = {
  dark:         { silhouette: '#0E3A26', leafBig: '#1F7A4B', leafSmall: '#1F7A4B' },
  light:        { silhouette: '#FDFEF9', leafBig: '#A9D57F', leafSmall: '#A9D57F' },
  peach:        { silhouette: '#FDFEF9', leafBig: '#0E3A26', leafSmall: '#0E3A26' },
  'mono-light': { silhouette: '#FDFEF9', leafBig: '#FDFEF9', leafSmall: '#FDFEF9' },
  // Warm keeps the v1 spirit: peach big leaf, dark small leaf — used
  // by the post-login splash to echo brand warmth.
  warm:         { silhouette: '#FDFEF9', leafBig: '#E08E63', leafSmall: '#0E3A26' },
}

// ─── Geometry ────────────────────────────────────────────────────────
// Path data lifted directly from `assets/brand/manifiesto-fern-v2-transparent.svg`.
// All path coords live in the SVG's pre-transform space (1160×1024).
// We apply `transform="scale(0.725 0.725318)"` on each path to map
// into the 841×742 viewBox.
const D_SILHOUETTE =
  'M930.253 161.648C952.922 159.917 1062.65 162.321 1076.44 174.946C1079.49 177.73 1079.97 182.367 1080.01 186.271C1080.2 205.99 1073.97 226.042 1069.75 245.157C1050.77 331.198 1019.52 419.339 967.311 491.088C958.351 503.402 949.002 515.375 938.355 526.29C892.277 573.533 835.21 606.984 767.766 607.738C704.872 608.441 663.17 580.618 619.808 538.225C612.042 551.619 604.976 565.241 599.394 579.713C562.824 674.534 577.135 784.414 575.226 884.105C575.094 891.017 574.839 899.088 569.313 904.098C566.753 906.419 563.54 907.347 560.122 907.064C553.915 906.55 549.809 902.664 545.937 898.219C544.903 850.17 546.229 802.453 545.856 754.442C545.687 732.639 546.482 705.849 543.286 684.587C538.997 656.056 525.326 615.996 505.998 594.098C471.757 641.839 423.33 665.422 364.287 656.958C361.934 656.532 359.589 656.063 357.252 655.552C292.47 641.763 247.364 597.198 212.432 543.25C202.547 527.751 193.559 511.698 185.511 495.17C176.231 476.329 139.547 392.415 143.742 375.865C144.27 373.78 145.452 372.567 147.286 371.505C155.165 366.941 176.958 362.948 186.794 361.124C251.798 349.071 338.872 343.373 403.143 360.107C449.172 372.091 487.461 397.644 511.7 439.119C538.02 484.154 532.767 522.432 520.174 570.237C529.873 584.248 539.612 597.775 547.484 612.911C549.8 617.364 552.056 622.19 554.717 626.383C562.515 596.662 570.598 571.293 584.369 543.61C589.503 533.291 595.151 523.284 600.587 513.116C597.622 506.214 593.352 497.641 590.117 490.746C578.915 466.869 574.123 446.843 572.474 420.558C569.457 364.126 588.941 308.8 626.655 266.71C699.915 183.799 826.22 168.029 930.253 161.648Z'

const D_LEAF_BIG =
  'M940.001 190.008C976.452 189.436 1012.9 191.405 1049.08 195.901C1047.96 206.133 1046.52 216.328 1044.75 226.468C1039.09 258.278 1028.32 293.779 1017.85 324.454C990.198 405.487 949.024 493.189 876.722 543.311C840.482 568.434 786.505 586.1 742.513 577.238C698.365 568.346 662.384 548.669 636.588 511.375C651.629 486.891 667.932 470.004 688.321 449.745C700.69 437.455 710.432 427.807 724.066 416.835C740.014 403.518 756.623 391.011 773.828 379.362C778.29 376.362 782.793 373.335 787.494 370.523C795.451 365.757 804.841 362.059 811.563 355.592C814.02 353.139 814.386 349.645 812.82 346.623C807.626 336.598 797.538 342.155 790.071 345.557C782.881 348.832 776.098 352.422 769.25 356.208C724.897 380.222 684.913 411.546 650.981 448.86C639.941 460.912 629.717 473.591 619.353 486.222C607.842 463.542 601.504 438.592 600.793 413.168C599.721 364.873 617.657 318.089 650.74 282.886C701.833 229.232 768.24 210.12 839.336 199.1C872.689 194.145 906.299 191.11 940.001 190.008Z'

const D_LEAF_SMALL =
  'M299.425 371.216C325.942 368.849 368.616 375.554 394.913 381.185C431.308 388.979 467.255 411.085 487.374 442.889C509.898 478.492 511.072 511.978 502.224 551.543C466.873 522.344 431.932 496.886 387.985 482.014C381.25 479.735 358.193 468.482 352.419 475.503C344.307 485.366 373.887 494.667 379.659 497.195C386.443 500.186 393.14 503.367 399.744 506.736C426.763 520.381 446.339 534.016 469.306 553.437C477.807 560.605 483.531 567.102 491.042 575.382C476.584 600.7 453.484 619.958 425.978 629.626C395.077 640.598 358.147 637.769 328.735 623.233C253.52 586.058 210.161 502.676 181.261 427.685C176.412 415.103 172.678 401.625 168.179 388.882C202.606 377.39 262.485 373.148 299.425 371.216Z'

// Stem-tracer overlay path — coords in POST-transform viewBox space
// (does NOT need the scale transform). Centerline + width measured
// from the silhouette directly via `scripts/measure-fern-stem.mjs`.
// Direction matters: starts at the BOTTOM and curves UP to the V so
// stroke-dashoffset draws it bottom→top like a sprout rising.
const D_STEM_TRACE = 'M 406 648.5 C 405.9 593.42, 405.45 539.96, 405.25 486.5'
const STEM_TRACE_LENGTH = 175 // path length + small buffer for clean off-screen state
const STEM_STROKE_WIDTH = 21 // matches silhouette stem width

const VIEWBOX_FULL = '0 0 841 742'
const ASPECT_FULL = 742 / 841 // ≈ 0.882
// Leaves-only crop. Tight bbox around both leaf shapes; excludes the
// stem so a small icon doesn't waste pixels on a thin vertical line.
const VIEWBOX_ICON = '85 105 690 380'
const ASPECT_ICON = 380 / 690 // ≈ 0.551

// Animation keyframes (ms, relative to delay):
//   0   → stem trace begins drawing
//   700 → silhouette fade-in begins
//   850 → stem trace fade-out begins (silhouette is taking over)
//  1000 → small leaf fade-in begins
//  1140 → big leaf fade-in begins (closes the entrance)
//  1640 → final frame
const STEM_DRAW_MS = 900
const STEM_FADE_DELAY_MS = 850
const STEM_FADE_MS = 350
const SIL_DELAY_MS = 700
const SIL_FADE_MS = 450
const LEAF_SMALL_DELAY_MS = 1000
const LEAF_BIG_DELAY_MS = 1140
const LEAF_FADE_MS = 500

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
  const viewBox = iconMode ? VIEWBOX_ICON : VIEWBOX_FULL
  const aspect = iconMode ? ASPECT_ICON : ASPECT_FULL
  const height = size * aspect

  // Five shared values — one per animated layer.
  const stemDraw = useSharedValue(isAnimated ? 0 : 1)
  const stemFade = useSharedValue(isAnimated ? 0 : 1)
  const silOpacity = useSharedValue(isAnimated ? 0 : 1)
  const leafSmall = useSharedValue(isAnimated ? 0 : 1)
  const leafBig = useSharedValue(isAnimated ? 0 : 1)

  useEffect(() => {
    if (!isAnimated) {
      stemDraw.value = 1
      stemFade.value = 1
      silOpacity.value = 1
      leafSmall.value = 1
      leafBig.value = 1
      return
    }

    // Reset to off-screen / hidden states for a clean replay on remount.
    stemDraw.value = 0
    stemFade.value = 0
    silOpacity.value = 0
    leafSmall.value = 0
    leafBig.value = 0

    // Easing curves chosen to match the web prototype exactly:
    //   ▸ stem draw: cubic-bezier(0.16, 1, 0.3, 1) → expo-out, fast
    //     start, slow finish (sap rising ease).
    //   ▸ silhouette / leaves: cubic-bezier(0.22, 0.61, 0.36, 1) →
    //     standard ease-out, organic entrance.
    const stemEase = Easing.bezier(0.16, 1, 0.3, 1)
    const fadeEase = Easing.bezier(0.22, 0.61, 0.36, 1)

    stemDraw.value = withDelay(delay, withTiming(1, { duration: STEM_DRAW_MS, easing: stemEase }))
    stemFade.value = withDelay(
      delay + STEM_FADE_DELAY_MS,
      withTiming(1, { duration: STEM_FADE_MS, easing: Easing.out(Easing.quad) }),
    )
    silOpacity.value = withDelay(
      delay + SIL_DELAY_MS,
      withTiming(1, { duration: SIL_FADE_MS, easing: fadeEase }),
    )
    leafSmall.value = withDelay(
      delay + LEAF_SMALL_DELAY_MS,
      withTiming(1, { duration: LEAF_FADE_MS, easing: fadeEase }),
    )
    leafBig.value = withDelay(
      delay + LEAF_BIG_DELAY_MS,
      withTiming(1, { duration: LEAF_FADE_MS, easing: fadeEase }),
    )

    return () => {
      // Tear down in-flight tweens if the component unmounts mid-animation.
      cancelAnimation(stemDraw)
      cancelAnimation(stemFade)
      cancelAnimation(silOpacity)
      cancelAnimation(leafSmall)
      cancelAnimation(leafBig)
    }
  }, [isAnimated, delay, stemDraw, stemFade, silOpacity, leafSmall, leafBig])

  const silhouetteProps = useAnimatedProps(() => ({
    opacity: silOpacity.value,
  }))
  const stemTraceProps = useAnimatedProps(() => ({
    // strokeDashoffset goes from STEM_TRACE_LENGTH (fully off-screen)
    // to 0 (fully drawn) as stemDraw progresses 0→1.
    strokeDashoffset: (1 - stemDraw.value) * STEM_TRACE_LENGTH,
    opacity: 1 - stemFade.value,
  }))
  const leafSmallProps = useAnimatedProps(() => ({
    opacity: leafSmall.value,
  }))
  const leafBigProps = useAnimatedProps(() => ({
    opacity: leafBig.value,
  }))

  return (
    <Svg width={size} height={height} viewBox={viewBox}>
      {/* Cream silhouette — leaves' halo + stem fill. Fades in BEHIND
          the trace overlay so the handoff is invisible. */}
      <AnimatedPath
        d={D_SILHOUETTE}
        fill={c.silhouette}
        transform="scale(0.725 0.725318)"
        animatedProps={silhouetteProps}
      />
      {/* Stem trace — only rendered in full mode. iconMode crops the
          stem out of the viewBox anyway, so drawing it would just
          waste cycles. */}
      {!iconMode ? (
        <AnimatedPath
          d={D_STEM_TRACE}
          fill="none"
          stroke={c.silhouette}
          strokeWidth={STEM_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={STEM_TRACE_LENGTH}
          animatedProps={stemTraceProps}
        />
      ) : null}
      {/* Small leaf — fades in first to start the bloom from the
          visually lighter element. */}
      <AnimatedPath
        d={D_LEAF_SMALL}
        fill={c.leafSmall}
        transform="scale(0.725 0.725318)"
        animatedProps={leafSmallProps}
      />
      {/* Big leaf — closes the entrance with the heavier element. */}
      <AnimatedPath
        d={D_LEAF_BIG}
        fill={c.leafBig}
        transform="scale(0.725 0.725318)"
        animatedProps={leafBigProps}
      />
    </Svg>
  )
}
