import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guardia del parche `patches/@react-navigation+bottom-tabs+7.15.9.patch`
 * (backport de react-navigation 9bfc8d0f65, bottom-tabs 7.18.8, fixes #12755).
 *
 * Bug en producción (iOS, 2026-08-23): al cambiar entre Home / Gastos / Fijos /
 * Control, a veces la tab entraba EN BLANCO (sólo la barra) hasta volver a
 * otra tab. Causa: con `animation: 'fade'` bottom-tabs 7.15.9 derivaba el
 * `activityState` de cada escena de una interpolación `Animated` con native
 * driver; al enfocar una escena desacoplada, JS escribía 2 pero el hilo
 * nativo seguía sosteniendo 0 y ganaba la carrera → react-native-screens
 * nunca la volvía a acoplar. El fix mueve ese estado a JS plano
 * (`lastUpdate.animating`) y deja el native driver sólo para la opacidad.
 *
 * El race es nativo y no se reproduce acá; este test garantiza que el parche
 * esté aplicado en lo que Metro bundlea (`lib/module`) y en el fuente, y que
 * la interpolación peligrosa no vuelva (un `npm install` sin postinstall o un
 * bump de bottom-tabs a una versión sin el fix lo rompen a propósito).
 */
const root = process.cwd()
const pkg = resolve(root, 'node_modules/@react-navigation/bottom-tabs')

function read(rel: string): string {
  return readFileSync(resolve(pkg, rel), 'utf8')
}

describe('bottom-tabs — activityState de las escenas sale de estado JS, no del Animated nativo', () => {
  it.each([
    ['lib/module/views/BottomTabView.js', 'lo que bundlea Metro'],
    ['src/views/BottomTabView.tsx', 'el fuente'],
  ])('%s (%s) tiene el backport aplicado', (rel) => {
    const src = read(rel)
    // El estado plano que reemplaza a la interpolación.
    expect(src).toContain('lastUpdate.animating')
    expect(src).toContain('isAnimatingRoute')
    // La escena saliente queda acoplada 32 ms después del fade, para que la
    // lógica nativa termine antes de desacoplarla.
    expect(src).toMatch(/setTimeout\([\s\S]{0,200}animating: false[\s\S]{0,80}\}, 32\)/)
    // La interpolación con native driver del activityState NO puede volver.
    expect(src).not.toContain('tabAnims[route.key].interpolate(')
    expect(src).not.toContain('EPSILON')
  })

  it('el parche está versionado para que postinstall lo reaplique', () => {
    const patch = readFileSync(
      resolve(root, 'patches/@react-navigation+bottom-tabs+7.15.9.patch'),
      'utf8',
    )
    expect(patch).toContain('lib/module/views/BottomTabView.js')
    expect(patch).toContain('+        const isAnimatingRoute')
    // Si bottom-tabs se bumpea, este nombre de archivo deja de coincidir y
    // patch-package falla: revisar si la versión nueva (≥ 7.18.8) ya trae el
    // fix y borrar el parche + este test.
    const version = JSON.parse(read('package.json')).version as string
    expect(version).toBe('7.15.9')
  })
})
