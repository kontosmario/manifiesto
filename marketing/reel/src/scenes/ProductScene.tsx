import {AbsoluteFill} from 'remotion'
import {DeviceClip} from '../components/DeviceClip'
import {RiseIn} from '../components/RiseIn'
import {Segment, Title} from '../components/Title'
import {COLORS, FONT_STACK} from '../tokens'

export const ProductScene: React.FC<{
  clip: string
  startFrom?: number
  title: Segment[]
  caption?: string
}> = ({clip, startFrom = 0, title, caption}) => (
  <AbsoluteFill style={{backgroundColor: COLORS.creamWarm, alignItems: 'center'}}>
    <RiseIn style={{marginTop: 150, paddingInline: 90}}>
      <Title segments={title} size={72} color={COLORS.inkDark} accentColor={COLORS.clay} />
    </RiseIn>
    {caption ? (
      <RiseIn delay={12}>
        <div
          style={{
            marginTop: 28,
            fontFamily: FONT_STACK,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: COLORS.clay,
          }}
        >
          {caption}
        </div>
      </RiseIn>
    ) : null}
    <RiseIn delay={8} distance={60} style={{marginTop: 70}}>
      <DeviceClip src={clip} startFrom={startFrom} />
    </RiseIn>
  </AbsoluteFill>
)
