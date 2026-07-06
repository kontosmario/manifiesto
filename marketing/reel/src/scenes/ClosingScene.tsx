import {AbsoluteFill} from 'remotion'
import {FernMark} from '../components/FernMark'
import {Particles} from '../components/Particles'
import {RiseIn} from '../components/RiseIn'
import {Title} from '../components/Title'
import {COLORS, FONT_STACK} from '../tokens'

// Cierre 100% Remotion: helecho real (SVG del design system) + wordmark +
// copy final sobre el verde de marca con luciérnagas.
export const ClosingScene: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: COLORS.brandDeep,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 90,
    }}
  >
    <Particles count={20} />
    <RiseIn delay={4} distance={24}>
      <FernMark size={380} delay={6} />
    </RiseIn>
    <RiseIn delay={26} style={{marginTop: 8}}>
      <div
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 800,
          fontSize: 96,
          letterSpacing: -4,
          color: COLORS.cream,
          textAlign: 'center',
        }}
      >
        Manifiesto<span style={{color: COLORS.peach}}>.</span>
      </div>
    </RiseIn>
    <RiseIn delay={45} style={{marginTop: 64}}>
      <Title
        size={64}
        segments={[
          {text: 'Haz de tus finanzas un '},
          {text: 'hábito', accent: true},
          {text: '.'},
        ]}
      />
    </RiseIn>
    <RiseIn delay={62} style={{marginTop: 40}}>
      <div
        style={{
          fontFamily: FONT_STACK,
          fontWeight: 500,
          fontSize: 40,
          letterSpacing: -0.5,
          color: COLORS.creamDim,
        }}
      >
        Tus finanzas, claras.
      </div>
    </RiseIn>
  </AbsoluteFill>
)
