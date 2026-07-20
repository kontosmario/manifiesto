// @i18n-ignore-file — SVGs del flujo de auth; sin copy.
import Svg, { Circle, Path } from 'react-native-svg'

/**
 * Íconos del rediseño de autenticación. Los paths se transcriben LITERAL
 * de los mockups (design/rediseno-2026-07/screens/4*.html). La huella
 * NO existe en el markup: se agrega para Android (el mockup asume Face
 * ID de iOS; ver auth-4c). Todos escalan con `size`.
 */

// ── Back chevron (header 44px) ───────────────────────────────────────
export function ChevronBackIcon({ color, size = 17 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 6l-6 6 6 6"
        stroke={color}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ── Ojo (mostrar contraseña) / ojo tachado (ocultar) ─────────────────
export function EyeIcon({ color, size = 18, off = false }: { color: string; size?: number; off?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
      {off ? (
        // Barra diagonal: mismo trazo, tachando el ojo (estado "ocultar").
        <Path d="M4 4l16 16" stroke={color} strokeWidth={2} strokeLinecap="round" />
      ) : null}
    </Svg>
  )
}

// ── Face ID (medallón 4c, viewBox 48, stroke 3) ──────────────────────
export function FaceIdIcon({ color, size = 62 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M6 16v-4a6 6 0 0 1 6-6h4M32 6h4a6 6 0 0 1 6 6v4M42 32v4a6 6 0 0 1-6 6h-4M16 42h-4a6 6 0 0 1-6-6v-4"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 20v3M32 20v3M24 20v7h-2.5M17.5 32.5c1.8 1.8 4 2.7 6.5 2.7s4.7-0.9 6.5-2.7"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ── Huella (Android — NO está en el mockup) ──────────────────────────
// Mismo peso visual que FaceId (viewBox 48, stroke 3, líneas redondeadas)
// para que el medallón se vea consistente cuando el sensor es huella.
export function FingerprintIcon({ color, size = 62 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M24 6c-5 0-9.5 2.5-12 6.5M36 12.5C33.5 8.5 29 6 24 6M8 22c1-4 3.5-7 7-8.8M40 22c-1-4-3.5-7-7-8.8"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M24 15c-5 0-9 4-9 9v4c0 3-.6 5.8-1.8 8.3M33 24c0-2.4-.9-4.6-2.4-6.2M31.6 38c1-2.5 1.4-5.2 1.4-8v-2"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M24 24v4c0 4-1 7.7-2.8 11M27 40c1.2-3.4 1.8-6.4 1.8-10v-6a4.8 4.8 0 0 0-9.6 0"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ── Apple (logo, fill sólido, viewBox 16×19) ─────────────────────────
export function AppleIcon({ color, size = 16 }: { color: string; size?: number }) {
  const h = (size * 19) / 16
  return (
    <Svg width={size} height={h} viewBox="0 0 16 19" fill={color}>
      <Path d="M13.1 10.1c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8C3.2 4.6 1.6 5.5.8 7c-1.8 3.1-.5 7.6 1.3 10.1.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.5.9-1.4 1.3-2.8 1.4-2.9-.1 0-2.6-1-2.6-4.1z" />
      <Path d="M10.6 2.9c.7-.9 1.2-2 1-3.2-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1.1 3 1.1.1 2.3-.5 3-1.3z" />
    </Svg>
  )
}

// ── Google (marca, viewBox 24 — botón en fila de 4b, y 4a por
//    decisión owner 2026-07-16; la variante apilada de 4a se retiró) ──
export function GoogleIcon24({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2.1 3.7-5.1 3.7-8.6z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5.1L1.3 17.2C3.3 21.2 7.3 24 12 24z"
      />
      <Path
        fill="#FBBC05"
        d="M5.1 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.8-2.9z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3 .8 3.7 1.4l2.7-2.6C16.9 1.3 14.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.8 2.9c1-3 3.7-5 6.9-5z"
      />
    </Svg>
  )
}
