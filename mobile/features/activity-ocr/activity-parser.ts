import type { ParseResult } from './types'

/**
 * Public end-to-end API: uri → ParseResult.
 *
 * STUB in Phase A — the implementation lives in Phase B once
 * @react-native-ml-kit/text-recognition + expo-image-picker are
 * installed and the dev build can run ML Kit on-device.
 *
 * For Phase-A-style isolated tests of the parser logic, call
 * `parseActivityLines(lines, imageWidth)` directly with a fixture.
 */
export async function parseActivity(uri: string): Promise<ParseResult> {
  throw new Error(
    `parseActivity(${uri}) requires Phase B (ML Kit wiring). Use parseActivityLines for unit tests.`,
  )
}
