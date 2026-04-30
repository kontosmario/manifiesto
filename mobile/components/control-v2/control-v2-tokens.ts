// Shared color + text tokens for the Control v2 screen.
// Kept separate from `theme/palette` so the Control visuals can
// evolve without churning the global theme — if a token graduates,
// we promote it up.

export const controlV2Tokens = {
  // Status tones — map directly onto the screenshot palette.
  good: {
    solid: '#6FE09A',
    solidDeep: '#2E7D5B',
    tint: '#C7EE9C',
    light: '#9EE0B2',
    bg: 'rgba(199,238,156,0.18)',
    border: 'rgba(199,238,156,0.35)',
    glow: 'rgba(199,238,156,0.45)',
  },
  warn: {
    solid: '#F2B58A',
    solidDeep: '#D96A4F',
    tint: '#E88A70',
    light: '#F1D690',
    bg: 'rgba(242,181,138,0.18)',
    border: 'rgba(242,181,138,0.35)',
    glow: 'rgba(242,181,138,0.45)',
  },
  info: {
    solid: '#8FB8E0',
    solidDeep: '#6B9AD6',
    tint: '#AFCDE8',
  },
} as const

export const controlV2Copy = {
  title: 'Control',
  subtitle: 'El estado de tus finanzas, día a día.',
} as const
