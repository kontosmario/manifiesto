import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion'
import {Particles} from '../components/Particles'
import {RiseIn} from '../components/RiseIn'
import {Title} from '../components/Title'
import {COLORS, FONT_STACK} from '../tokens'

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame()
  // Beat A se atenúa cuando entra beat B
  const beatAOpacity = interpolate(frame, [65, 90], [1, 0.35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.4, 0, 0.2, 1),
  })
  return (
    <AbsoluteFill style={{backgroundColor: COLORS.brandDeep, justifyContent: 'center', alignItems: 'center', padding: 96}}>
      <Particles count={24} />
      <RiseIn style={{opacity: beatAOpacity}}>
        <div
          style={{
            fontFamily: FONT_STACK,
            fontWeight: 600,
            fontSize: 52,
            letterSpacing: -1,
            color: COLORS.creamDim,
            textAlign: 'center',
          }}
        >
          Anotar gastos no cambia nada.
        </div>
      </RiseIn>
      <RiseIn delay={70} style={{marginTop: 56}}>
        <Title
          size={110}
          segments={[{text: 'Un '}, {text: 'hábito', accent: true}, {text: ', sí.'}]}
        />
      </RiseIn>
    </AbsoluteFill>
  )
}
