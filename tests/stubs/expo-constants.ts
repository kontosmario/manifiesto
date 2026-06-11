/**
 * Minimal stub for expo-constants used in vitest (Node environment).
 * `runtime-environment.ts` lee `executionEnvironment` para derivar
 * `isExpoGo` — en tests simulamos un build standalone ('bare').
 */
export enum ExecutionEnvironment {
  Bare = 'bare',
  Standalone = 'standalone',
  StoreClient = 'storeClient',
}

const Constants = {
  executionEnvironment: ExecutionEnvironment.Bare,
  expoConfig: null as unknown,
}

export default Constants
