/**
 * SPEC compartido del flujo de autenticación del rediseño (Turno 4).
 * Valores LITERALES del design doc — extraídos de los pares
 * 3a / 4a·4ao / 4b·4bo / 4c·4co (design/rediseno-2026-07/screens/).
 *
 * Réplica bajo gate de aprobación del owner: NO "mejorar" valores.
 * Los strings CSS (gradientes, box-shadow multi-capa incl. inset) se
 * usan tal cual porque RN 0.81 New Arch los acepta vía
 * experimental_backgroundImage y boxShadow (mismo seam que el
 * onboarding: ver onb-spec.ts).
 *
 * GOTCHA de fondos: la Bienvenida (3a) usa un fondo oscuro más profundo
 * (#0F1E14) que el resto del turno 4 (#16271C). Por eso `bg` es el
 * default y `welcomeBg` el override — AuthScreenShell acepta ambos.
 */

export type AuthMode = 'light' | 'dark'

export interface AuthSpec {
  /** Fondo por defecto del turno 4 (4a/4b/4c). */
  bg: string
  /** Fondo más profundo de la Bienvenida (3a). */
  welcomeBg: string
  /** Texto primario (títulos, valores de input). */
  text: string
  /** Texto helper / subtítulos / captions. */
  helper: string
  /** Texto medio (links, "Ingresa tus datos…", sub del hero). */
  textSoft: string
  /** Punto durazno del wordmark "Manifiesto." */
  wordmarkDot: string
  /** Status bar dibujada (dev-only) + home indicator. */
  chrome: string

  // ── Back circular 44px (idéntico a onb) ────────────────────────────
  backBackground: string | undefined
  backGradientCss: string | undefined
  backShadow: string

  // ── Well de input hundido (label + valor) ──────────────────────────
  fieldLabel: string
  wellBackground: string | undefined
  wellShadow: string
  /** Hint bajo la contraseña (4a) — verde apagado, NO el helper. */
  passwordHint: string

  // ── CTA verde (4a "Crear cuenta") ──────────────────────────────────
  ctaGreenCss: string
  ctaGreenFallback: string
  ctaGreenShadow: string
  ctaGreenText: string

  // ── CTA neutro/oscuro (4b "Continuar", 4c "Activar") ───────────────
  ctaNeutralCss: string
  ctaNeutralFallback: string
  ctaNeutralShadow: string
  ctaNeutralText: string

  // ── CTA primario de la Bienvenida (3a "Empezar") ───────────────────
  // Igual que el verde/neutro pero con una capa RAISED extra (-6/-8) —
  // el mockup lo distingue del CTA plano del resto del turno.
  ctaWelcomeCss: string
  ctaWelcomeFallback: string
  ctaWelcomeShadow: string
  ctaWelcomeText: string

  // ── Secundario hundido (3a "Ya tengo cuenta") ──────────────────────
  secondaryBackground: string | undefined
  secondaryShadow: string
  secondaryText: string

  // ── Medidor de fuerza de contraseña (4a) ───────────────────────────
  strengthFill: string
  strengthIdleBackground: string | undefined
  strengthIdleShadow: string
  strengthLabel: string

  // ── Divisor "o" ────────────────────────────────────────────────────
  dividerLine: string
  dividerText: string

  // ── Botones sociales (tratamiento del login 4b/4bo — decisión owner
  //    2026-07-16: crear cuenta y login llevan LOS MISMOS botones, en
  //    columna full-width; las variantes de los mockups se retiraron) ──
  appleShadow: string
  /** Apple: pastilla oscura en claro, crema en oscuro (4bo). */
  appleBtnBackground: string
  appleBtnText: string
  /** Google: pastilla blanca con anillo fino en claro; well hundido
   *  con anillo menta en oscuro (4bo). */
  googleBtnBackground: string
  googleBtnShadow: string
  googleBtnText: string

  // ── Medallón durazno del login (4b) ────────────────────────────────
  medallionCss: string
  medallionShadow: string

  // ── Medallón Face ID (4c) ──────────────────────────────────────────
  faceMedallionCss: string
  faceMedallionFallback: string
  faceMedallionShadow: string
  faceIcon: string

  // ── Links de texto ─────────────────────────────────────────────────
  /** "Usar un PIN" (4c) — verde acento. */
  linkAccent: string
  /** "Ahora no" (4c) — helper apagado. */
  linkMuted: string
  /** "¿Olvidaste tu contraseña?" (4b) — texto medio. */
  linkSoft: string
  /** Legal con spans subrayados (3a/4a). */
  legalText: string

  // ── Partículas de la Bienvenida (3a, count 18 full-screen) ─────────
  particleColors: readonly string[]

  /** Paleta del FernLogo (brote de marca) para este tema. */
  fernPalette: 'dark' | 'light'
}

export const AUTH_SPEC: Record<AuthMode, AuthSpec> = {
  light: {
    bg: '#DCDFCD',
    welcomeBg: '#E9EBE0',
    text: '#24382A',
    helper: '#54644F',
    textSoft: '#3E5A44',
    wordmarkDot: '#D97E4F',
    chrome: '#24382A',

    backBackground: '#E9EBE0',
    backGradientCss: undefined,
    backShadow: '6px 6px 12px rgba(151,160,136,0.4), -6px -6px 12px rgba(255,255,255,0.9)',

    fieldLabel: '#54644F',
    wellBackground: undefined,
    wellShadow: 'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    passwordHint: '#8FA089',

    ctaGreenCss: 'radial-gradient(circle at 32% 28%, #489350, #2E7434 85%)',
    ctaGreenFallback: '#489A4E',
    ctaGreenShadow: '0 12px 24px rgba(46,116,52,0.4), inset 0 2px 3px rgba(255,255,255,0.3)',
    ctaGreenText: '#F5F2E1',

    ctaNeutralCss: 'radial-gradient(circle at 32% 28%, #3A5A44, #1D3023 85%)',
    ctaNeutralFallback: '#2A4432',
    ctaNeutralShadow: '0 12px 24px rgba(23,40,28,0.35), inset 0 2px 3px rgba(255,255,255,0.18)',
    ctaNeutralText: '#F5F2E1',

    ctaWelcomeCss: 'radial-gradient(circle at 32% 28%, #489350, #2E7434 85%)',
    ctaWelcomeFallback: '#489A4E',
    ctaWelcomeShadow:
      '0 14px 28px rgba(46,116,52,0.4), -6px -6px 14px rgba(255,255,255,0.85), inset 0 2px 3px rgba(255,255,255,0.3)',
    ctaWelcomeText: '#F5F2E1',

    secondaryBackground: undefined,
    secondaryShadow:
      'inset 4px 4px 9px rgba(151,160,136,0.4), inset -4px -4px 9px rgba(255,255,255,0.95)',
    secondaryText: '#3E5A44',

    strengthFill: '#E08A5E',
    strengthIdleBackground: undefined,
    strengthIdleShadow:
      'inset 2px 2px 5px rgba(151,160,136,0.4), inset -2px -2px 5px rgba(255,255,255,0.9)',
    strengthLabel: '#C96F3F',

    dividerLine: 'rgba(151,160,136,0.35)',
    dividerText: '#8FA089',

    appleShadow: '0 10px 20px rgba(10,15,10,0.3)',
    appleBtnBackground: '#101512',
    appleBtnText: '#FFFFFF',
    googleBtnBackground: '#FFFFFF',
    googleBtnShadow: '0 10px 20px rgba(60,80,60,0.18), 0 0 0 1.5px rgba(151,160,136,0.35)',
    googleBtnText: '#24382A',

    medallionCss: 'radial-gradient(circle at 34% 28%, #F2B183, #E08A5E 82%)',
    medallionShadow:
      '10px 10px 22px rgba(151,160,136,0.45), -10px -10px 22px rgba(255,255,255,0.95), inset 0 2px 4px rgba(255,255,255,0.4)',

    faceMedallionCss: 'linear-gradient(145deg, #F3F4E9, #E0E3D4)',
    faceMedallionFallback: '#ECEDE1',
    faceMedallionShadow:
      '12px 12px 26px rgba(151,160,136,0.45), -12px -12px 26px rgba(255,255,255,0.95)',
    faceIcon: '#1F5429',

    linkAccent: '#2E7C39',
    linkMuted: '#8FA089',
    linkSoft: '#3E5A44',
    legalText: '#9AA694',

    particleColors: ['#7FB069', '#E8A87C', '#9BB894'],
    fernPalette: 'dark',
  },
  dark: {
    bg: '#0F1A13',
    welcomeBg: '#0F1E14',
    text: '#F1EEDD',
    helper: '#93A78F',
    textSoft: '#B9CCB2',
    wordmarkDot: '#F2A87E',
    chrome: '#F1EEDD',

    backBackground: undefined,
    backGradientCss: 'linear-gradient(145deg, #1F3527, #14241A)',
    backShadow: '6px 6px 12px rgba(0,0,0,0.5), -6px -6px 12px rgba(101,152,113,0.1)',

    fieldLabel: '#93A78F',
    wellBackground: '#142519',
    wellShadow: 'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.08)',
    passwordHint: '#7C917A',

    ctaGreenCss: 'radial-gradient(circle at 32% 28%, #9FDC9F, #3E7D46 85%)',
    ctaGreenFallback: '#3E7D46',
    ctaGreenShadow: '0 0 26px rgba(140,225,150,0.3), inset 0 2px 3px rgba(255,255,255,0.35)',
    ctaGreenText: '#0F1E14',

    ctaNeutralCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaNeutralFallback: '#EDEAD8',
    ctaNeutralShadow: '0 12px 24px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,255,255,0.6)',
    ctaNeutralText: '#1F3A26',

    ctaWelcomeCss: 'linear-gradient(145deg, #F7F4E6, #E2DEC8)',
    ctaWelcomeFallback: '#EDEAD8',
    ctaWelcomeShadow:
      '0 14px 28px rgba(0,0,0,0.45), -8px -8px 18px rgba(101,152,113,0.1), inset 0 2px 3px rgba(255,255,255,0.6)',
    ctaWelcomeText: '#1F3A26',

    secondaryBackground: '#142519',
    secondaryShadow:
      'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.1)',
    secondaryText: '#B9CCB2',

    strengthFill: '#E08A5E',
    strengthIdleBackground: '#142519',
    strengthIdleShadow:
      'inset 2px 2px 5px rgba(0,0,0,0.5), inset -2px -2px 5px rgba(101,152,113,0.08)',
    strengthLabel: '#F2A87E',

    dividerLine: 'rgba(101,152,113,0.25)',
    dividerText: '#7C917A',

    appleShadow: '0 10px 20px rgba(0,0,0,0.5)',
    appleBtnBackground: '#F1EEDD',
    appleBtnText: '#0F1E14',
    googleBtnBackground: '#142519',
    googleBtnShadow:
      'inset 4px 4px 9px rgba(0,0,0,0.5), inset -4px -4px 9px rgba(101,152,113,0.08), 0 0 0 1.5px rgba(164,227,166,0.25)',
    googleBtnText: '#F1EEDD',

    medallionCss: 'radial-gradient(circle at 34% 28%, #F2B183, #E08A5E 82%)',
    medallionShadow:
      '10px 10px 22px rgba(0,0,0,0.55), -10px -10px 22px rgba(101,152,113,0.12), inset 0 2px 4px rgba(255,255,255,0.4)',

    faceMedallionCss: 'linear-gradient(145deg, #1D3426, #132318)',
    faceMedallionFallback: '#182A1F',
    faceMedallionShadow: '12px 12px 26px rgba(0,0,0,0.6), -12px -12px 26px rgba(101,152,113,0.12)',
    faceIcon: '#A4E3A6',

    linkAccent: '#A4E3A6',
    linkMuted: '#7C917A',
    linkSoft: '#B9CCB2',
    legalText: '#7C917A',

    particleColors: ['#A4E3A6', '#F2A87E', '#F1EEDD'],
    fernPalette: 'light',
  },
}

/**
 * Home indicator: opacidad por modo. Default 0.75 (4a/4b/4c en ambos
 * temas). EXCEPCIÓN: 3a oscuro usa 0.7 — la pasa como override por
 * pantalla (AuthHomeIndicator acepta `opacity`), no se cambia el default.
 */
export const AUTH_HOME_INDICATOR_OPACITY: Record<AuthMode, number> = {
  light: 0.75,
  dark: 0.75,
}
