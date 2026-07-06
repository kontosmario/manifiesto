import type {CSSProperties, ReactNode} from 'react'
import {Easing, interpolate, useCurrentFrame} from 'remotion'
import {EASE_ENTER} from '../tokens'

const ease = Easing.bezier(...EASE_ENTER)

export const RiseIn: React.FC<{
  delay?: number
  duration?: number
  distance?: number
  style?: CSSProperties
  children: ReactNode
}> = ({delay = 0, duration = 28, distance = 40, style, children}) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })
  // La opacity externa (style.opacity) se multiplica, no se pisa — HookScene
  // la usa para atenuar el beat A mientras la entrada sigue viva.
  const baseOpacity = typeof style?.opacity === 'number' ? style.opacity : 1
  return (
    <div style={{...style, opacity: p * baseOpacity, transform: `translateY(${(1 - p) * distance}px)`}}>
      {children}
    </div>
  )
}
