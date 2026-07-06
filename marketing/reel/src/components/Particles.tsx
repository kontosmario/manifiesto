import {useCurrentFrame} from 'remotion'
import {COLORS, FPS} from '../tokens'

// Roberts R2 low-discrepancy — mismas constantes que card-particles.tsx de la app
const R2X = 0.7548776662466927
const R2Y = 0.5698402909980532

export const Particles: React.FC<{count?: number; opacity?: number}> = ({
  count = 24,
  opacity = 1,
}) => {
  const t = useCurrentFrame() / FPS
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden', opacity}}>
      {Array.from({length: count}, (_, i) => {
        const x = ((0.5 + R2X * (i + 1)) % 1) * 100
        const y = ((0.5 + R2Y * (i + 1)) % 1) * 100
        const peach = i % 5 === 0
        const size = peach ? 13 : 6 + (i % 3) * 2
        const color = peach
          ? COLORS.fireflyPeach
          : i % 3 === 0
            ? COLORS.fireflyGreenA
            : COLORS.fireflyGreenB
        const durS = 10 + (i % 5) * 1.5
        const th = (2 * Math.PI * t) / durS + i * 0.7
        const dx = Math.sin((1 + (i % 3)) * th) * (peach ? 50 : 28)
        const dy = Math.cos((2 + (i % 2)) * th) * (peach ? 40 : 22)
        const glow = 0.18 + 0.72 * (0.5 - 0.5 * Math.cos((2 + (i % 2)) * th))
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: color,
              opacity: glow,
              transform: `translate(${dx}px, ${dy}px)`,
              boxShadow: `0 0 ${size * 2.5}px ${color}`,
            }}
          />
        )
      })}
    </div>
  )
}
