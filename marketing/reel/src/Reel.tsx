import {AbsoluteFill} from 'remotion'
import {COLORS, FONT_STACK} from './tokens'

export const Reel: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: COLORS.brandDeep,
      justifyContent: 'center',
      alignItems: 'center',
    }}
  >
    <div style={{fontFamily: FONT_STACK, fontWeight: 800, fontSize: 92, color: COLORS.cream, letterSpacing: -4}}>
      Manifiesto<span style={{color: COLORS.peach}}>.</span>
    </div>
  </AbsoluteFill>
)
