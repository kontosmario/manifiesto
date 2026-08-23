import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

// Mismo patrón que plugin-sources-reach-build.test.ts: el plugin es CommonJS
// (el resolver de Expo lo carga con `require` pelado) y se lee igual acá.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applyMetaSdkToAppDelegate } = require(
  resolve(root, 'plugins/with-meta-sdk-app-delegate.cjs'),
) as { applyMetaSdkToAppDelegate: (contents: string) => string }

// El AppDelegate.swift que `expo prebuild` genera para este SDK: el plugin
// se ancla a su texto, así que el test corre contra el template REAL del
// paquete instalado y no contra una copia que pueda envejecer.
function readTemplateAppDelegate(): string {
  return execSync(
    'tar -xzOf node_modules/expo/template.tgz package/ios/HelloWorld/AppDelegate.swift',
    { encoding: 'utf8' },
  )
}

describe('with-meta-sdk-app-delegate — init nativo del SDK de Meta en el AppDelegate', () => {
  it('importa FBSDKCoreKit y llama al ApplicationDelegate de Meta ANTES del return de didFinishLaunching', () => {
    const out = applyMetaSdkToAppDelegate(readTemplateAppDelegate())

    expect(out).toContain('import FBSDKCoreKit')

    const call = out.indexOf(
      'ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)',
    )
    const ret = out.indexOf(
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
    )
    expect(call).toBeGreaterThan(-1)
    expect(ret).toBeGreaterThan(call)
  })

  it('es idempotente: aplicar dos veces no duplica ni el import ni la llamada', () => {
    const once = applyMetaSdkToAppDelegate(readTemplateAppDelegate())
    const twice = applyMetaSdkToAppDelegate(once)
    expect(twice).toBe(once)
    expect(twice.match(/import FBSDKCoreKit/g)).toHaveLength(1)
    expect(twice.match(/ApplicationDelegate\.shared\.application\(/g)).toHaveLength(1)
  })

  it('los logging behaviors del SDK quedan SÓLO bajo #if DEBUG, antes de la llamada al delegate', () => {
    const out = applyMetaSdkToAppDelegate(readTemplateAppDelegate())

    const ifDebug = out.indexOf('#if DEBUG')
    const appEvents = out.indexOf('Settings.shared.enableLoggingBehavior(.appEvents)')
    const network = out.indexOf('Settings.shared.enableLoggingBehavior(.networkRequests)')
    const endif = out.indexOf('#endif', ifDebug)
    const call = out.indexOf('ApplicationDelegate.shared.application(')

    expect(ifDebug).toBeGreaterThan(-1)
    expect(appEvents).toBeGreaterThan(ifDebug)
    expect(network).toBeGreaterThan(appEvents)
    expect(endif).toBeGreaterThan(network)
    expect(call).toBeGreaterThan(endif)
    // Ninguna llamada a los logging behaviors fuera del bloque DEBUG.
    expect(out.match(/enableLoggingBehavior\(/g)).toHaveLength(2)
  })

  it('si el template cambia y el ancla desaparece, falla FUERTE en prebuild (no deja el activate mudo)', () => {
    expect(() => applyMetaSdkToAppDelegate('import Expo\n// sin didFinishLaunching')).toThrow(
      /with-meta-sdk-app-delegate/,
    )
  })

  it('el plugin está registrado en app.config.ts', () => {
    const appConfig = readFileSync('app.config.ts', 'utf8')
    expect(appConfig).toContain("'./plugins/with-meta-sdk-app-delegate.cjs'")
  })
})
