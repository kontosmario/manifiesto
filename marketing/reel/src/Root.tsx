import {Composition} from 'remotion'
import {Reel} from './Reel'
import {FPS, HEIGHT, WIDTH} from './tokens'

export const Root: React.FC = () => (
  <Composition
    id="Reel"
    component={Reel}
    durationInFrames={1260}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
)
