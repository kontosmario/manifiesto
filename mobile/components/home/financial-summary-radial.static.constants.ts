export const TRACK_START = 0
export const TRACK_LENGTH = 1
export const SEGMENT_GAP = 0.008
export const MIN_SEGMENT_SHARE = 0.08
export const SEGMENT_OVERLAP = 0.0012
export const SEGMENT_TRANSITION_SPAN = 0.012
export const LOOP_CLOSURE_SPAN = 0.024
export const LOOP_CLOSURE_CORE = 0.008
export const INLINE_LABEL_BOX_WIDTH = 28
export const INLINE_LABEL_BOX_HEIGHT = 28
export const INLINE_LABEL_START_INSET = 0.018
export const INLINE_LABEL_END_INSET = 0.012
export const BADGE_HEIGHT = 30
export const BADGE_MARGIN = 8
export const BADGE_THETA_BY_LABEL: Record<string, number> = {
  Ahorro: Math.PI * 1.24,
  Disponible: Math.PI * 1.72,
  Fijos: Math.PI * 0.22,
  Gastado: Math.PI * 0.76,
}
