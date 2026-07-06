import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion'
import {COLORS} from '../tokens'

// El recording del cold start ES la escena: fullscreen, object-fit cover.
// El clip canónico arranca en el splash real (fern trazándose ~t0-1s).
export const ColdStartScene: React.FC = () => (
  <AbsoluteFill style={{backgroundColor: COLORS.brandDeep}}>
    <OffthreadVideo
      src={staticFile('captures/01-coldstart.mp4')}
      startFrom={0}
      muted
      style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top'}}
    />
  </AbsoluteFill>
)
