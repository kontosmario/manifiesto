import { Easing } from 'react-native-reanimated'

export const motionDurations = {
  micro: 120,
  quick: 180,
  standard: 240,
  deliberate: 320,
  slow: 480,
} as const

export type MotionDurationKey = keyof typeof motionDurations

export const motionSprings = {
  press:     { damping: 18, stiffness: 380, mass: 0.9 },
  enter:     { damping: 22, stiffness: 210, mass: 1.0 },
  exit:      { damping: 24, stiffness: 260, mass: 1.0 },
  value:     { damping: 24, stiffness: 180, mass: 1.0 },
  celebrate: { damping: 14, stiffness: 260, mass: 0.8 },
  sheet:     { damping: 22, stiffness: 200, mass: 1.0 },
} as const

export type MotionSpringKey = keyof typeof motionSprings

export const motionEasings = {
  standard:   Easing.bezier(0.22, 0.9, 0.3, 1),
  accelerate: Easing.bezier(0.4, 0.0, 1.0, 1.0),
  decelerate: Easing.bezier(0.0, 0.0, 0.2, 1.0),
} as const

export const motionStagger = {
  listItem: 40,
  section:  60,
} as const
