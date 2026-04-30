// AUTO-GENERATED avatar registry. Maps DB slugs (public.avatar_animals.slug)
// to React Native Svg components. If you add/remove an entry here,
// update the Supabase seed in migration 20260423234539 too.
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
import { AnteaterAvatar } from './components/anteater'
import { BatAvatar } from './components/bat'
import { BeetleAvatar } from './components/beetle'
import { ButterflyAvatar } from './components/butterfly'
import { CamelAvatar } from './components/camel'
import { CatAvatar } from './components/cat'
import { ChameleonAvatar } from './components/chameleon'
import { CobraAvatar } from './components/cobra'
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
import { RaccoonAvatar } from './components/raccoon'
import { RhinoAvatar } from './components/rhino'
import { RoosterAvatar } from './components/rooster'
import { SeaRayAvatar } from './components/sea-ray'
import { SharkAvatar } from './components/shark'
import { SlothAvatar } from './components/sloth'
import { SnakeAvatar } from './components/snake'
import { SparrowAvatar } from './components/sparrow'
import { SpiderAvatar } from './components/spider'
import { SquirrelAvatar } from './components/squirrel'
import { SwanAvatar } from './components/swan'
import { TigerAvatar } from './components/tiger'
import { ToucanAvatar } from './components/toucan'
import { TurkeyAvatar } from './components/turkey'
import { WhaleAvatar } from './components/whale'
import { ZebraAvatar } from './components/zebra'

export type AvatarSlug =
  | 'alpaca'
  | 'anteater'
  | 'bat'
  | 'beetle'
  | 'butterfly'
  | 'camel'
  | 'cat'
  | 'chameleon'
  | 'cobra'
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
  | 'raccoon'
  | 'rhino'
  | 'rooster'
  | 'sea-ray'
  | 'shark'
  | 'sloth'
  | 'snake'
  | 'sparrow'
  | 'spider'
  | 'squirrel'
  | 'swan'
  | 'tiger'
  | 'toucan'
  | 'turkey'
  | 'whale'
  | 'zebra'

export interface AvatarComponentProps {
  size?: number
  color?: string
}

export type AvatarComponent = ComponentType<AvatarComponentProps>

export const AVATAR_SLUGS: readonly AvatarSlug[] = [
  'alpaca',
  'anteater',
  'bat',
  'beetle',
  'butterfly',
  'camel',
  'cat',
  'chameleon',
  'cobra',
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
  'raccoon',
  'rhino',
  'rooster',
  'sea-ray',
  'shark',
  'sloth',
  'snake',
  'sparrow',
  'spider',
  'squirrel',
  'swan',
  'tiger',
  'toucan',
  'turkey',
  'whale',
  'zebra',
] as const

export const AVATAR_LABELS: Record<AvatarSlug, string> = {
  alpaca: 'Alpaca',
  anteater: 'Oso hormiguero',
  bat: 'Murciélago',
  beetle: 'Escarabajo',
  butterfly: 'Mariposa',
  camel: 'Camello',
  cat: 'Gato',
  chameleon: 'Camaleón',
  cobra: 'Cobra',
  crab: 'Cangrejo',
  crocodile: 'Cocodrilo',
  dog: 'Perro',
  duck: 'Pato',
  elephant: 'Elefante',
  elk: 'Alce',
  fish: 'Pez',
  frog: 'Rana',
  giraffe: 'Jirafa',
  hippo: 'Hipopótamo',
  husky: 'Husky',
  kangaroo: 'Canguro',
  lion: 'León',
  macaw: 'Guacamayo',
  manatee: 'Manatí',
  mianyang: 'Carnero',
  monkey: 'Mono',
  mouse: 'Ratón',
  octopus: 'Pulpo',
  ostrich: 'Avestruz',
  owl: 'Búho',
  panda: 'Panda',
  pelican: 'Pelícano',
  penguin: 'Pingüino',
  pig: 'Cerdo',
  raccoon: 'Mapache',
  rhino: 'Rinoceronte',
  rooster: 'Gallo',
  'sea-ray': 'Mantarraya',
  shark: 'Tiburón',
  sloth: 'Oso perezoso',
  snake: 'Serpiente',
  sparrow: 'Gorrión',
  spider: 'Araña',
  squirrel: 'Ardilla',
  swan: 'Cisne',
  tiger: 'Tigre',
  toucan: 'Tucán',
  turkey: 'Pavo',
  whale: 'Ballena',
  zebra: 'Cebra',
}

export const AVATAR_COMPONENTS: Record<AvatarSlug, AvatarComponent> = {
  alpaca: AlpacaAvatar,
  anteater: AnteaterAvatar,
  bat: BatAvatar,
  beetle: BeetleAvatar,
  butterfly: ButterflyAvatar,
  camel: CamelAvatar,
  cat: CatAvatar,
  chameleon: ChameleonAvatar,
  cobra: CobraAvatar,
  crab: CrabAvatar,
  crocodile: CrocodileAvatar,
  dog: DogAvatar,
  duck: DuckAvatar,
  elephant: ElephantAvatar,
  elk: ElkAvatar,
  fish: FishAvatar,
  frog: FrogAvatar,
  giraffe: GiraffeAvatar,
  hippo: HippoAvatar,
  husky: HuskyAvatar,
  kangaroo: KangarooAvatar,
  lion: LionAvatar,
  macaw: MacawAvatar,
  manatee: ManateeAvatar,
  mianyang: MianyangAvatar,
  monkey: MonkeyAvatar,
  mouse: MouseAvatar,
  octopus: OctopusAvatar,
  ostrich: OstrichAvatar,
  owl: OwlAvatar,
  panda: PandaAvatar,
  pelican: PelicanAvatar,
  penguin: PenguinAvatar,
  pig: PigAvatar,
  raccoon: RaccoonAvatar,
  rhino: RhinoAvatar,
  rooster: RoosterAvatar,
  'sea-ray': SeaRayAvatar,
  shark: SharkAvatar,
  sloth: SlothAvatar,
  snake: SnakeAvatar,
  sparrow: SparrowAvatar,
  spider: SpiderAvatar,
  squirrel: SquirrelAvatar,
  swan: SwanAvatar,
  tiger: TigerAvatar,
  toucan: ToucanAvatar,
  turkey: TurkeyAvatar,
  whale: WhaleAvatar,
  zebra: ZebraAvatar,
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

export function getAvatarLabel(slug: AvatarSlug): string {
  return AVATAR_LABELS[slug]
}
