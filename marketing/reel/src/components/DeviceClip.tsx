import {Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion'
import {COLORS} from '../tokens'

// Los clips canónicos vienen transcodificados a 1206×2482 (status bar
// recortada en el ffmpeg de ingesta), 30fps CFR, sin audio.
const CLIP_W = 1206
const CLIP_H = 2447

export const DeviceClip: React.FC<{
  src: string
  startFrom?: number
  width?: number
}> = ({src, startFrom = 0, width = 780}) => {
  const frame = useCurrentFrame()
  const {durationInFrames} = useVideoConfig()
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.03], {
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  })
  const height = width * (CLIP_H / CLIP_W)
  return (
    <div
      style={{
        width,
        height,
        borderRadius: width * 0.14,
        overflow: 'hidden',
        border: `10px solid ${COLORS.inkDark}`,
        boxShadow: '0 60px 120px -40px rgba(15,58,38,0.45)',
        transform: `scale(${scale})`,
      }}
    >
      <OffthreadVideo
        src={staticFile(src)}
        startFrom={startFrom}
        muted
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
    </div>
  )
}
