// AUTO-GENERATED avatar registry. Maps DB slugs (public.avatar_animals.slug)
// to React Native Svg components. Regenerate via:
//   node scripts/generate-avatar-components.mjs
//
// If you add/remove a slug here, update the Supabase seed in the
// latest avatar-pack migration too.
//
// `AvatarAnimal` USED to be re-exported from here, but that produced a
// require cycle:
//   `assets/avatars/index.ts` → `components/ui/avatar-animal.tsx`
//   `components/ui/avatar-animal.tsx` → `assets/avatars/index.ts`
// Consumers should import the components directly from
// `@/components/ui/avatar-animal`. This module owns only the slug
// registry, labels, components map, and pure helpers — no UI.
import type { ComponentType } from 'react'
import { AlpacaAvatar } from './components/alpaca'
import { AnteaterAvatar } from './components/anteater'
import { BatAvatar } from './components/bat'
import { ButterflyAvatar } from './components/butterfly'
import { CamelAvatar } from './components/camel'
import { CatAvatar } from './components/cat'
import { CowAvatar } from './components/cow'
import { CrabAvatar } from './components/crab'
import { CrocodileAvatar } from './components/crocodile'
import { DogAvatar } from './components/dog'
import { DuckAvatar } from './components/duck'
import { ElephantAvatar } from './components/elephant'
import { ElkAvatar } from './components/elk'
import { FishAvatar } from './components/fish'
import { FrogAvatar } from './components/frog'
import { GiraffeAvatar } from './components/giraffe'
import { HippoAvatar } from './components/hippo'
import { HuskyAvatar } from './components/husky'
import { KangarooAvatar } from './components/kangaroo'
import { LionAvatar } from './components/lion'
import { MacawAvatar } from './components/macaw'
import { ManateeAvatar } from './components/manatee'
import { MianyangAvatar } from './components/mianyang'
import { MonkeyAvatar } from './components/monkey'
import { MouseAvatar } from './components/mouse'
import { OctopusAvatar } from './components/octopus'
import { OstrichAvatar } from './components/ostrich'
import { OwlAvatar } from './components/owl'
import { PandaAvatar } from './components/panda'
import { PelicanAvatar } from './components/pelican'
import { PenguinAvatar } from './components/penguin'
import { PigAvatar } from './components/pig'
import { RabbitAvatar } from './components/rabbit'
import { RaccoonAvatar } from './components/raccoon'
import { RhinoAvatar } from './components/rhino'
import { RoosterAvatar } from './components/rooster'
import { SharkAvatar } from './components/shark'
import { SquirrelAvatar } from './components/squirrel'
import { SwanAvatar } from './components/swan'
import { TigerAvatar } from './components/tiger'
import { TurtleAvatar } from './components/turtle'
import { WhaleAvatar } from './components/whale'

export type AvatarSlug =
  | 'alpaca'
  | 'anteater'
  | 'bat'
  | 'butterfly'
  | 'camel'
  | 'cat'
  | 'cow'
  | 'crab'
  | 'crocodile'
  | 'dog'
  | 'duck'
  | 'elephant'
  | 'elk'
  | 'fish'
  | 'frog'
  | 'giraffe'
  | 'hippo'
  | 'husky'
  | 'kangaroo'
  | 'lion'
  | 'macaw'
  | 'manatee'
  | 'mianyang'
  | 'monkey'
  | 'mouse'
  | 'octopus'
  | 'ostrich'
  | 'owl'
  | 'panda'
  | 'pelican'
  | 'penguin'
  | 'pig'
  | 'rabbit'
  | 'raccoon'
  | 'rhino'
  | 'rooster'
  | 'shark'
  | 'squirrel'
  | 'swan'
  | 'tiger'
  | 'turtle'
  | 'whale'

export interface AvatarComponentProps {
  size?: number
  /** Silhouette tint. */
  color?: string
}

export type AvatarComponent = ComponentType<AvatarComponentProps>

export const AVATAR_SLUGS: readonly AvatarSlug[] = [
  'alpaca',
  'anteater',
  'bat',
  'butterfly',
  'camel',
  'cat',
  'cow',
  'crab',
  'crocodile',
  'dog',
  'duck',
  'elephant',
  'elk',
  'fish',
  'frog',
  'giraffe',
  'hippo',
  'husky',
  'kangaroo',
  'lion',
  'macaw',
  'manatee',
  'mianyang',
  'monkey',
  'mouse',
  'octopus',
  'ostrich',
  'owl',
  'panda',
  'pelican',
  'penguin',
  'pig',
  'rabbit',
  'raccoon',
  'rhino',
  'rooster',
  'shark',
  'squirrel',
  'swan',
  'tiger',
  'turtle',
  'whale',
] as const

export const AVATAR_LABELS: Record<AvatarSlug, string> = {
  "alpaca": "Alpaca",
  "anteater": "Oso hormiguero",
  "bat": "Murciélago",
  "butterfly": "Mariposa",
  "camel": "Camello",
  "cat": "Gato",
  "cow": "Vaca",
  "crab": "Cangrejo",
  "crocodile": "Cocodrilo",
  "dog": "Perro",
  "duck": "Pato",
  "elephant": "Elefante",
  "elk": "Alce",
  "fish": "Pez",
  "frog": "Rana",
  "giraffe": "Jirafa",
  "hippo": "Hipopótamo",
  "husky": "Husky",
  "kangaroo": "Canguro",
  "lion": "León",
  "macaw": "Guacamayo",
  "manatee": "Manatí",
  "mianyang": "Carnero",
  "monkey": "Mono",
  "mouse": "Ratón",
  "octopus": "Pulpo",
  "ostrich": "Avestruz",
  "owl": "Búho",
  "panda": "Panda",
  "pelican": "Pelícano",
  "penguin": "Pingüino",
  "pig": "Cerdo",
  "rabbit": "Conejo",
  "raccoon": "Mapache",
  "rhino": "Rinoceronte",
  "rooster": "Gallo",
  "shark": "Tiburón",
  "squirrel": "Ardilla",
  "swan": "Cisne",
  "tiger": "Tigre",
  "turtle": "Tortuga",
  "whale": "Ballena",
}

export const AVATAR_COMPONENTS: Record<AvatarSlug, AvatarComponent> = {
  "alpaca": AlpacaAvatar,
  "anteater": AnteaterAvatar,
  "bat": BatAvatar,
  "butterfly": ButterflyAvatar,
  "camel": CamelAvatar,
  "cat": CatAvatar,
  "cow": CowAvatar,
  "crab": CrabAvatar,
  "crocodile": CrocodileAvatar,
  "dog": DogAvatar,
  "duck": DuckAvatar,
  "elephant": ElephantAvatar,
  "elk": ElkAvatar,
  "fish": FishAvatar,
  "frog": FrogAvatar,
  "giraffe": GiraffeAvatar,
  "hippo": HippoAvatar,
  "husky": HuskyAvatar,
  "kangaroo": KangarooAvatar,
  "lion": LionAvatar,
  "macaw": MacawAvatar,
  "manatee": ManateeAvatar,
  "mianyang": MianyangAvatar,
  "monkey": MonkeyAvatar,
  "mouse": MouseAvatar,
  "octopus": OctopusAvatar,
  "ostrich": OstrichAvatar,
  "owl": OwlAvatar,
  "panda": PandaAvatar,
  "pelican": PelicanAvatar,
  "penguin": PenguinAvatar,
  "pig": PigAvatar,
  "rabbit": RabbitAvatar,
  "raccoon": RaccoonAvatar,
  "rhino": RhinoAvatar,
  "rooster": RoosterAvatar,
  "shark": SharkAvatar,
  "squirrel": SquirrelAvatar,
  "swan": SwanAvatar,
  "tiger": TigerAvatar,
  "turtle": TurtleAvatar,
  "whale": WhaleAvatar,
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
