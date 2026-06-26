// Shared color + text tokens for the Control v2 screen.
//
// V1 Mint Saturado migration: status tones now derive from the
// canonical V1 scales (primaryScale / accentScale) instead of
// duplicating splash hexes. The local export stays self-documenting
// (good/warn/info naming) but values point at the global system.
//
// `info` is a local-only blue family — V1 has no info-blue scale yet.
// If a second product surface needs blue, promote it to a global
// scale instead of copying the literals here.

export const controlV2Tokens = {
  good: {
    solid:     '#49D61F',  // V1 primary-500
    solidDeep: '#329315',  // V1 primary-700
    tint:      '#A6EF8F',  // V1 primary-300
    light:     '#D1F7C5',  // V1 primary-200
    bg:        'rgba(166,239,143,0.18)',  // primary-300 alpha
    border:    'rgba(166,239,143,0.35)',
    glow:      'rgba(166,239,143,0.45)',
  },
  warn: {
    solid:     '#EC7A51',  // V1 accent-400
    solidDeep: '#B84014',  // V1 accent-600
    tint:      '#F2A78C',  // V1 accent-300
    light:     '#F1D690',  // butter (kept — yellow warning core)
    bg:        'rgba(242,167,140,0.18)',  // accent-300 alpha
    border:    'rgba(242,167,140,0.35)',
    glow:      'rgba(242,167,140,0.45)',
  },
  // Teal on-brand: el "neutral info" distinto de good=verde / warn=peach.
  // Era un azul ajeno (#6B9AD6) que la auditoria marco off-brand + sub-AA.
  info: {
    solid:     '#7FC4B0',
    solidDeep: '#2E6E5E',
    tint:      '#9FD8C8',
  },
} as const

// Title/subtitle copy migrated to i18n (`control:header.title` /
// `control:header.subtitle`) — see control-v2-header.tsx.
