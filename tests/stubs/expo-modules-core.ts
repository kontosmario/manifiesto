// Minimal stub for `expo-modules-core` in the vitest environment.
// The real module loads native bindings via `globalThis.expo` which
// is undefined under node, so any transitive import (eg. expo-device
// → useReducedMotion → use-unbounded-loop-animation tests) crashes
// on `EventEmitter`. Tests only need the type surface, never the
// native behavior.

export class EventEmitter {
  addListener() {
    return { remove() {} }
  }
  removeAllListeners() {}
  emit() {}
}

export type EventSubscription = { remove: () => void }

export class NativeModule {}
export class SharedObject {}
export class SharedRef {}
export class LegacyEventEmitter extends EventEmitter {}
export class CodedError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message)
    this.code = code
  }
}
export class UnavailabilityError extends CodedError {
  constructor(moduleName: string, propertyName: string) {
    super('ERR_UNAVAILABLE', `${moduleName}.${propertyName} is not available`)
  }
}

export const Platform = { OS: 'ios', select: <T>(specifics: { ios?: T; default?: T }) => specifics.ios ?? specifics.default }
export const NativeModulesProxy = new Proxy({}, { get: () => ({}) }) as Record<string, unknown>

export function uuid() {
  return '00000000-0000-0000-0000-000000000000'
}

export function requireNativeModule(_name: string) {
  return new Proxy({}, { get: () => () => undefined })
}
export function requireOptionalNativeModule(_name: string) {
  return null
}
export function requireNativeViewManager() {
  return () => null
}
export function registerWebModule(mod: unknown) {
  return mod
}
export function reloadAppAsync() {
  return Promise.resolve()
}
