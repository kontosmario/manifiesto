import { type ReactNode } from 'react'
import Svg, { Circle, G, Path } from 'react-native-svg'

/**
 * Set de íconos de logros — botánico, 5 familias, gramática común (grid 48,
 * trazo 2.4 redondeado, verde bosque + acento coral, ADN de brote). Cada hito
 * tiene su silueta única para que NADA se confunda (antes eran emojis reusados:
 * 🔥×4, 🌱×3, etc.). Reemplaza el render `<Text>{item.icon}</Text>`.
 *
 * Color por PROPS (theming): `stroke` (verde), `accent` (coral) y `accentSoft`.
 *   - earned  → verde bosque + coral (fijos: legibles sobre el disco crema en
 *     ambos temas, igual que el emoji era mode-invariante).
 *   - locked  → todo en `muted` (silueta monocroma atenuada).
 *
 * Sólo primitivas de react-native-svg (Path/Circle/G), sin filtros ni
 * gradientes → cero dependencias raster y sin el typing gotcha de Defs/Stop.
 */

// Colores del ícono EARNED — fijos (mode-invariante) porque el ícono siempre
// se dibuja sobre un disco crema, igual en light y dark. AA sobre crema.
export const ICON_FOREST = '#256E15'
export const ICON_CORAL = '#C2521C'
export const ICON_CORAL_SOFT = '#E8976A'

export interface AchievementIconProps {
  code: string
  size?: number
  /** Trazo principal (verde bosque earned / muted locked). */
  stroke: string
  /** Acento (coral earned / muted locked). */
  accent: string
  /** Acento suave para fills decorativos (coral soft earned / muted locked). */
  accentSoft?: string
}

/** Códigos con ícono custom, en orden de sort_order (firsts → racha → meta →
 *  bajo cupo → sin gasto). El caller cae a emoji si el code no está aquí. */
export const ACHIEVEMENT_ICON_CODES = [
  'first_expense',
  'first_fixed',
  'first_paid_fixed',
  'first_goal',
  'streak_7',
  'streak_14',
  'streak_30',
  'streak_60',
  'streak_90',
  'goal_25',
  'goal_50',
  'goal_75',
  'goal_completed',
  'first_cycle_under_budget',
  'no_spend_cycle_3',
  'no_spend_cycle_7',
  'no_spend_cycle_15',
  'no_spend_lifetime_50',
] as const

const ICON_CODES = new Set<string>(ACHIEVEMENT_ICON_CODES)

export function hasAchievementIcon(code: string): boolean {
  return ICON_CODES.has(code)
}

interface Colors {
  stroke: string
  accent: string
  accentSoft: string
}

function shapes(code: string, c: Colors): ReactNode {
  const S = c.stroke
  const A = c.accent
  const AS = c.accentSoft
  switch (code) {
    // ── PRIMEROS ──────────────────────────────────────────────────
    case 'first_expense':
      return (
        <>
          <Path d="M9 37 Q24 33 39 37" stroke={S} />
          <Path d="M24 37 V23" stroke={S} />
          <Path d="M24 27 C18 27 14 23 13 18 C19 18 23 22 24 27 Z" fill={A} stroke="none" />
          <Path d="M24 25 C30 25 34 21 35 16 C29 16 25 20 24 25 Z" fill={S} stroke="none" />
          <Circle cx={24} cy={39.5} r={1.7} fill={A} stroke="none" />
        </>
      )
    case 'first_fixed':
      return (
        <>
          <Path d="M11 13 H37 a3 3 0 0 1 3 3 V34 a3 3 0 0 1 -3 3 H11 a3 3 0 0 1 -3 -3 V16 a3 3 0 0 1 3 -3 Z" stroke={S} />
          <Path d="M8 20 H40" stroke={S} />
          <Path d="M16 10 V15 M32 10 V15" stroke={S} />
          <Path d="M24 34 V26" stroke={S} />
          <Path d="M24 32 C21 32 19 29 19 26 C23 26 24 29 24 32 Z" fill={A} stroke="none" />
        </>
      )
    case 'first_paid_fixed':
      return (
        <>
          <Circle cx={24} cy={24} r={13} stroke={S} />
          <Path d="M18 24.5 L22.5 29 C26 23 28 20 31 18" stroke={A} />
          <Path d="M31 18 C33 17 35 17 36 17 C35.5 19 34 20.5 32 21 Z" fill={S} stroke="none" />
        </>
      )
    case 'first_goal':
      return (
        <>
          <Path d="M14 38 V12" stroke={S} />
          <Path d="M14 12 H31 L27 17 L31 22 H14 Z" fill={A} stroke="none" />
          <Path d="M14 38 Q24 35 34 38" stroke={S} />
          <Path d="M30 33 C33 33 35 30 35 27 C31 27 30 30 30 33 Z" fill={S} stroke="none" />
        </>
      )
    // ── RACHA (planta que crece) ──────────────────────────────────
    case 'streak_7':
      return (
        <>
          <Path d="M24 39 V21" stroke={S} />
          <Path d="M24 30 C18 30 14 26 13 21 C19 21 23 25 24 30 Z" fill={A} stroke="none" />
          <Path d="M24 27 C30 27 34 23 35 18 C29 18 25 22 24 27 Z" fill={S} stroke="none" />
        </>
      )
    case 'streak_14':
      return (
        <>
          <Path d="M24 39 V16" stroke={S} />
          <Path d="M24 33 C19 33 15 30 14 26 C19 26 23 29 24 33 Z" fill={A} stroke="none" />
          <Path d="M24 30 C29 30 33 27 34 23 C29 23 25 26 24 30 Z" fill={S} stroke="none" />
          <Path d="M24 24 C20 24 17 21 16 18 C20 18 23 21 24 24 Z" fill={A} stroke="none" />
          <Path d="M24 22 C28 22 31 19 32 16 C28 16 25 19 24 22 Z" fill={S} stroke="none" />
        </>
      )
    case 'streak_30':
      return (
        <>
          <Path d="M24 39 V24" stroke={S} />
          <Path d="M24 28 C19 26 16 21 16 17" stroke={S} />
          <Path d="M24 26 C29 24 32 19 32 15" stroke={S} />
          <Path d="M16 17 C12 17 10 14 9.5 11 C13 11 16 14 16 17 Z" fill={A} stroke="none" />
          <Path d="M32 15 C36 15 38 12 38.5 9 C35 9 32 12 32 15 Z" fill={S} stroke="none" />
          <Path d="M24 25 C21 23 20 19 20 16 C24 18 25 22 24 25 Z" fill={A} stroke="none" />
        </>
      )
    case 'streak_60':
      return (
        <>
          <Path d="M22 39 H26" stroke={S} />
          <Path d="M24 39 V27" stroke={S} />
          <Circle cx={24} cy={18} r={9} stroke={S} />
          <Circle cx={24} cy={18} r={2.4} fill={A} stroke="none" />
          <Path d="M24 9 C24 6 26 4 29 3.5 C29 6.5 27 9 24 9 Z" fill={S} stroke="none" />
        </>
      )
    case 'streak_90':
      return (
        <>
          <Path d="M24 40 C13 36 9 26 10 16 C16 18 22 24 24 33" stroke={A} />
          <Path d="M24 40 C35 36 39 26 38 16 C32 18 26 24 24 33" stroke={S} />
          <Path d="M24 33 V14" stroke={S} />
          <Circle cx={24} cy={11} r={2.6} fill={A} stroke="none" />
        </>
      )
    // ── META (flor que se abre) ───────────────────────────────────
    case 'goal_25':
      return (
        <>
          <Path d="M24 39 V22" stroke={S} />
          <Path d="M24 30 C19 30 16 27 15 23 C20 23 23 26 24 30 Z" fill={A} stroke="none" />
          <Path d="M24 22 C21 22 19 18 19 14 C20 11 24 10 24 10 C24 10 28 11 29 14 C29 18 27 22 24 22 Z" fill={S} stroke="none" />
        </>
      )
    case 'goal_50':
      return (
        <>
          <Path d="M24 39 V24" stroke={S} />
          <Path d="M24 31 C20 31 17 28 16 25 C20 25 23 27 24 31 Z" fill={A} stroke="none" />
          <Path d="M24 24 C20 24 18 19 19 14 C22 16 24 19 24 24 Z" fill={S} stroke="none" />
          <Path d="M24 24 C28 24 30 19 29 14 C26 16 24 19 24 24 Z" fill={AS} stroke="none" />
        </>
      )
    case 'goal_75':
      return (
        <>
          <Path d="M24 40 V28" stroke={S} />
          <Path d="M24 28 C20 28 16 24 16 19 C20 19 24 23 24 28 Z" fill={S} stroke="none" />
          <Path d="M24 28 C28 28 32 24 32 19 C28 19 24 23 24 28 Z" fill={S} stroke="none" />
          <Path d="M24 27 C22 23 22 18 24 14 C26 18 26 23 24 27 Z" fill={AS} stroke="none" />
          <Circle cx={24} cy={22} r={2.2} fill={A} stroke="none" />
        </>
      )
    case 'goal_completed':
      return (
        <>
          {[0, 72, 144, 216, 288].map((deg) => (
            <G key={deg} rotation={deg} origin="24, 24">
              <Path d="M24 24 C24 17 21 13 18 11 C20 16 21 20 24 24 Z" fill={S} stroke="none" />
            </G>
          ))}
          <Circle cx={24} cy={24} r={4.4} fill={A} stroke="none" />
        </>
      )
    // ── BAJO CUPO (moneda que brota) ──────────────────────────────
    case 'first_cycle_under_budget':
      return (
        <>
          <Circle cx={24} cy={30} r={11} stroke={S} />
          <Path d="M24 25 V35.5" stroke={A} />
          <Path d="M27 27 Q22 24.5 21.5 28.5 Q21.5 31 25 31.5 Q28 32 27.5 34.5 Q27 37 22 35" stroke={A} fill="none" />
          <Path d="M24 19 C19 19 16 16 15 12 C20 12 23 15 24 19 Z" fill={A} stroke="none" />
          <Path d="M24 17 C28 17 31 14 32 11 C28 11 25 14 24 17 Z" fill={S} stroke="none" />
        </>
      )
    // ── SIN GASTO (agua / quietud) ────────────────────────────────
    case 'no_spend_cycle_3':
      return (
        <>
          <Path d="M14 31 C14 31 19 21 24 13 C29 21 34 31 34 31 A10 10 0 0 1 14 31 Z" stroke={S} />
          <Path d="M19.5 31 A4.5 4.5 0 0 0 24 35.5" stroke={A} />
        </>
      )
    case 'no_spend_cycle_7':
      return (
        <>
          <Path d="M24 30 C20 30 17 27 16 24 C20 24 23 26 24 30 Z" fill={A} stroke="none" />
          <Path d="M24 30 C28 30 31 27 32 24 C28 24 25 26 24 30 Z" fill={S} stroke="none" />
          <Path d="M24 30 V24" stroke={S} />
          <Path d="M9 34 Q14 31 19 34 T29 34 T39 34" stroke={S} />
          <Path d="M9 39 Q14 36 19 39 T29 39 T39 39" stroke={A} />
        </>
      )
    case 'no_spend_cycle_15':
      return (
        <>
          <Path d="M34 14 A14 14 0 1 0 37 27" stroke={S} />
          <Path d="M31 24 C27 24 24 21 23 17 C28 17 31 20 31 24 Z" fill={A} stroke="none" />
          <Path d="M31 24 V17" stroke={S} />
        </>
      )
    case 'no_spend_lifetime_50':
      return (
        <>
          <Path d="M24 40 V27" stroke={S} />
          <Path d="M24 33 L18 38 M24 33 L30 38" stroke={S} />
          <Circle cx={24} cy={17} r={10} stroke={S} />
          <Path d="M24 17 C24 12 21 9 18 8 C20 12 21 15 24 17 Z" fill={S} stroke="none" />
          <Circle cx={24} cy={17} r={3} fill={A} stroke="none" />
        </>
      )
    default:
      return null
  }
}

export function AchievementIcon({
  code,
  size = 40,
  stroke,
  accent,
  accentSoft,
}: AchievementIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <G strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {shapes(code, { stroke, accent, accentSoft: accentSoft ?? accent })}
      </G>
    </Svg>
  )
}
