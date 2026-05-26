import { describe, expect, it } from 'vitest'
import { onboardingSuccessCopy } from '@/features/onboarding/success-copy'

describe('onboardingSuccessCopy', () => {
  it('modo solo con nombre', () => {
    expect(
      onboardingSuccessCopy({ kind: 'solo', firstName: 'Mario' }),
    ).toEqual({
      eyebrow: 'Bienvenido a Manifiesto',
      title: '¡Listo, Mario!',
      subtitle: 'Tu espacio personal ya está armado. Vamos a Home.',
      ctaLabel: 'Empezar',
    })
  })

  it('modo solo sin nombre → saludo neutral', () => {
    expect(
      onboardingSuccessCopy({ kind: 'solo', firstName: '' }),
    ).toEqual({
      eyebrow: 'Bienvenido a Manifiesto',
      title: '¡Listo!',
      subtitle: 'Tu espacio personal ya está armado. Vamos a Home.',
      ctaLabel: 'Empezar',
    })
  })

  it('modo shared con nombre', () => {
    expect(
      onboardingSuccessCopy({ kind: 'shared', firstName: 'Mario' }),
    ).toEqual({
      eyebrow: 'Bienvenido a Manifiesto',
      title: '¡Listo, Mario!',
      subtitle: 'Tu familia ya está armada. Vamos a Home.',
      ctaLabel: 'Empezar',
    })
  })

  it('modo shared sin nombre', () => {
    expect(
      onboardingSuccessCopy({ kind: 'shared', firstName: '' }),
    ).toEqual({
      eyebrow: 'Bienvenido a Manifiesto',
      title: '¡Listo!',
      subtitle: 'Tu familia ya está armada. Vamos a Home.',
      ctaLabel: 'Empezar',
    })
  })
})
