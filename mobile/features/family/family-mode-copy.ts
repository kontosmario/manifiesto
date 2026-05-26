// Pure copy resolver for the Home hero — surfaces the family mode
// (solo vs. shared) so the screen reads as personal or shared
// depending on what the user chose in the onboarding wizard.
//
// Used by `home-hero-card.tsx`. Returned strings respect the project
// copy glossary (no "hogar"/"nuestro"/"familia" in solo mode).

export interface FamilyModeHeroInput {
  kind: 'solo' | 'shared'
  memberCount: number
  familyName: string | null
  userFirstName: string | null
}

export interface FamilyModeHeroCopy {
  eyebrow: string
  title: string
}

export function familyModeHeroCopy(input: FamilyModeHeroInput): FamilyModeHeroCopy {
  if (input.kind === 'solo') {
    return {
      eyebrow: 'Tu espacio personal',
      title: input.userFirstName ?? 'Bienvenido',
    }
  }
  return {
    eyebrow: 'Tu familia',
    title: input.familyName ?? `${input.memberCount} miembros`,
  }
}
