import {COLORS, FONT_STACK} from '../tokens'

export type Segment = {text: string; accent?: boolean}

export const Title: React.FC<{
  segments: Segment[]
  size?: number
  align?: 'center' | 'left'
  color?: string
  accentColor?: string
}> = ({segments, size = 84, align = 'center', color = COLORS.cream, accentColor = COLORS.peach}) => (
  <div
    style={{
      fontFamily: FONT_STACK,
      fontWeight: 900,
      fontSize: size,
      lineHeight: 1.12,
      letterSpacing: size * -0.03,
      color,
      textAlign: align,
    }}
  >
    {segments.map((s, i) => (
      <span key={i} style={s.accent ? {color: accentColor} : undefined}>
        {s.text}
      </span>
    ))}
  </div>
)
