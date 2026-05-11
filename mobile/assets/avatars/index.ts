// AUTO-GENERATED avatar registry. Maps DB slugs (public.avatar_animals.slug)
// to React Native Svg relief-style components. Regenerate via:
//   node scripts/generate-avatar-components.mjs
//
// If you add/remove a slug here, update the Supabase seed in
// migration 20260515000000_avatar_pack_argentine.sql too.
//
// `AvatarAnimal` and `AvatarAnimalRow` USED to be re-exported from
// here, but that produced a require cycle:
//   `assets/avatars/index.ts` → `components/ui/avatar-animal.tsx`
//   `components/ui/avatar-animal.tsx` → `assets/avatars/index.ts`
// Consumers should import the components directly from
// `@/components/ui/avatar-animal`. This module owns only the slug
// registry, labels, components map, and pure helpers — no UI.
import type { ComponentType } from 'react'
import { AlpacaAvatar } from './components/alpaca'
import { BallenaAvatar } from './components/ballena'
import { CapibaraAvatar } from './components/capibara'
import { CerdoAvatar } from './components/cerdo'
import { ColibriAvatar } from './components/colibri'
import { CondorAvatar } from './components/condor'
import { FlamencoAvatar } from './components/flamenco'
import { GallinaAvatar } from './components/gallina'
import { GatoAvatar } from './components/gato'
import { HorneroAvatar } from './components/hornero'
import { LechuzaAvatar } from './components/lechuza'
import { LoboGrisAvatar } from './components/lobo-gris'
import { LoboMarinoAvatar } from './components/lobo-marino'
import { MariposaAvatar } from './components/mariposa'
import { MonoAulladorAvatar } from './components/mono-aullador'
import { NanduAvatar } from './components/nandu'
import { NutriaAvatar } from './components/nutria'
import { PatoAvatar } from './components/pato'
import { PerroAvatar } from './components/perro'
import { PinguinoAvatar } from './components/pinguino'
import { PumaAvatar } from './components/puma'
import { TatuCarretaAvatar } from './components/tatu-carreta'
import { TortugaAvatar } from './components/tortuga'
import { YaguareteAvatar } from './components/yaguarete'

export type AvatarSlug =
  | 'alpaca'
  | 'ballena'
  | 'capibara'
  | 'cerdo'
  | 'colibri'
  | 'condor'
  | 'flamenco'
  | 'gallina'
  | 'gato'
  | 'hornero'
  | 'lechuza'
  | 'lobo-gris'
  | 'lobo-marino'
  | 'mariposa'
  | 'mono-aullador'
  | 'nandu'
  | 'nutria'
  | 'pato'
  | 'perro'
  | 'pinguino'
  | 'puma'
  | 'tatu-carreta'
  | 'tortuga'
  | 'yaguarete'

export interface AvatarComponentProps {
  size?: number
  /** Top-of-gradient color (highlight). */
  gradStart?: string
  /** Mid-gradient color. */
  gradMid?: string
  /** Bottom-of-gradient color (deepest). */
  gradEnd?: string
  /** Selective outline color drawn on major contour paths. */
  stroke?: string
  /** Drop shadow color. */
  shadow?: string
  /** Drop shadow opacity (0..1). */
  shadowOpacity?: number
}

export type AvatarComponent = ComponentType<AvatarComponentProps>

export const AVATAR_SLUGS: readonly AvatarSlug[] = [
  'alpaca',
  'ballena',
  'capibara',
  'cerdo',
  'colibri',
  'condor',
  'flamenco',
  'gallina',
  'gato',
  'hornero',
  'lechuza',
  'lobo-gris',
  'lobo-marino',
  'mariposa',
  'mono-aullador',
  'nandu',
  'nutria',
  'pato',
  'perro',
  'pinguino',
  'puma',
  'tatu-carreta',
  'tortuga',
  'yaguarete',
] as const

export const AVATAR_LABELS: Record<AvatarSlug, string> = {
  "alpaca": "Alpaca",
  "ballena": "Ballena",
  "capibara": "Capibara",
  "cerdo": "Cerdo",
  "colibri": "Colibrí",
  "condor": "Cóndor",
  "flamenco": "Flamenco",
  "gallina": "Gallina",
  "gato": "Gato",
  "hornero": "Hornero",
  "lechuza": "Lechuza",
  "lobo-gris": "Lobo gris",
  "lobo-marino": "Lobo marino",
  "mariposa": "Mariposa",
  "mono-aullador": "Mono aullador",
  "nandu": "Ñandú",
  "nutria": "Nutria",
  "pato": "Pato",
  "perro": "Perro",
  "pinguino": "Pingüino",
  "puma": "Puma",
  "tatu-carreta": "Tatú carreta",
  "tortuga": "Tortuga",
  "yaguarete": "Yaguareté",
}

export const AVATAR_COMPONENTS: Record<AvatarSlug, AvatarComponent> = {
  "alpaca": AlpacaAvatar,
  "ballena": BallenaAvatar,
  "capibara": CapibaraAvatar,
  "cerdo": CerdoAvatar,
  "colibri": ColibriAvatar,
  "condor": CondorAvatar,
  "flamenco": FlamencoAvatar,
  "gallina": GallinaAvatar,
  "gato": GatoAvatar,
  "hornero": HorneroAvatar,
  "lechuza": LechuzaAvatar,
  "lobo-gris": LoboGrisAvatar,
  "lobo-marino": LoboMarinoAvatar,
  "mariposa": MariposaAvatar,
  "mono-aullador": MonoAulladorAvatar,
  "nandu": NanduAvatar,
  "nutria": NutriaAvatar,
  "pato": PatoAvatar,
  "perro": PerroAvatar,
  "pinguino": PinguinoAvatar,
  "puma": PumaAvatar,
  "tatu-carreta": TatuCarretaAvatar,
  "tortuga": TortugaAvatar,
  "yaguarete": YaguareteAvatar,
}

const AVATAR_SLUG_SET = new Set<string>(AVATAR_SLUGS)

export function isAvatarSlug(value: string): value is AvatarSlug {
  return AVATAR_SLUG_SET.has(value)
}

export function randomAvatarSlug(): AvatarSlug {
  const i = Math.floor(Math.random() * AVATAR_SLUGS.length)
  return AVATAR_SLUGS[i]!
}

export function getAvatarComponent(slug: AvatarSlug): AvatarComponent {
  return AVATAR_COMPONENTS[slug]
}
