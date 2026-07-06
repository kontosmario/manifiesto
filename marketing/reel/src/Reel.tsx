import {AbsoluteFill, Audio, staticFile} from 'remotion'
import {TransitionSeries, linearTiming} from '@remotion/transitions'
import {fade} from '@remotion/transitions/fade'
import {ColdStartScene} from './scenes/ColdStartScene'
import {ClosingScene} from './scenes/ClosingScene'
import {HookScene} from './scenes/HookScene'
import {ProductScene} from './scenes/ProductScene'
import {PRODUCT_SCENES} from './scenes'

const [home, gastos, fijos, control, jardin, wrapped, familia] = PRODUCT_SCENES

// Timeline master: 1395f de escenas − 9 transiciones × 15f = 1260f (42s).
export const Reel: React.FC = () => (
  <AbsoluteFill>
    <Audio src={staticFile('audio/music.m4a')} />
    <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={135}>
      <ColdStartScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={165}>
      <HookScene />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...home} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...gastos} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...fijos} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={105}>
      <ProductScene {...control} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...jardin} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...wrapped} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={135}>
      <ProductScene {...familia} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition
      presentation={fade()}
      timing={linearTiming({durationInFrames: 15})}
    />
    <TransitionSeries.Sequence durationInFrames={180}>
      <ClosingScene />
    </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
)
