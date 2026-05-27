import { describe, expect, it } from 'vitest'
import { familyModeHeroCopy } from '@/features/family/family-mode-copy'

describe('familyModeHeroCopy', () => {
  it('modo solo → "Tu espacio personal" + título del usuario', () => {
    expect(
      familyModeHeroCopy({
        kind: 'solo',
        memberCount: 1,
        familyName: null,
        userFirstName: 'Mario',
      }),
    ).toEqual({
      eyebrow: 'Tu espacio personal',
      title: 'Mario',
    })
  })

  it('modo solo sin nombre → fallback', () => {
    expect(
      familyModeHeroCopy({
        kind: 'solo',
        memberCount: 1,
        familyName: null,
        userFirstName: null,
      }),
    ).toEqual({
      eyebrow: 'Tu espacio personal',
      title: '¡Hola!',
    })
  })

  it('modo shared con nombre de familia → "Tu familia" + nombre', () => {
    expect(
      familyModeHeroCopy({
        kind: 'shared',
        memberCount: 3,
        familyName: 'Los Pérez',
        userFirstName: 'Mario',
      }),
    ).toEqual({
      eyebrow: 'Tu familia',
      title: 'Los Pérez',
    })
  })

  it('modo shared sin nombre de familia → fallback "{N} miembros"', () => {
    expect(
      familyModeHeroCopy({
        kind: 'shared',
        memberCount: 2,
        familyName: null,
        userFirstName: 'Mario',
      }),
    ).toEqual({
      eyebrow: 'Tu familia',
      title: '2 miembros',
    })
  })
})
