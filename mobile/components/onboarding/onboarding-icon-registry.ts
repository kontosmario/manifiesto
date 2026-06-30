// AUTO-GENERADO por scripts/gen-onboarding-icons.mjs — NO editar a mano.
// Íconos del onboarding (stickers multicolor del owner) como PNG assets.
/* eslint-disable @typescript-eslint/no-require-imports -- los PNG entran por el require() del asset pipeline de Metro (no son imports JS). */
import type { ImageSourcePropType } from 'react-native'

export const ONBOARDING_ICONS = {
  "casa": require("../../assets/onboarding-icons/casa.png") as ImageSourcePropType,
  "compartir": require("../../assets/onboarding-icons/compartir.png") as ImageSourcePropType,
  "familia": require("../../assets/onboarding-icons/familia.png") as ImageSourcePropType,
  "solo": require("../../assets/onboarding-icons/solo.png") as ImageSourcePropType,
} satisfies Record<string, ImageSourcePropType>

export type OnboardingIconKey = keyof typeof ONBOARDING_ICONS
