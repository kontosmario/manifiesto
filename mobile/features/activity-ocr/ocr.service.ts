import TextRecognition from '@react-native-ml-kit/text-recognition'

/**
 * Calls ML Kit and returns the raw `blocks` array unchanged. Defensive
 * normalization (shape of `frame`, missing fields, etc.) lives in
 * `normalize.ts` so all OCR-shape tolerance is in one place.
 *
 * Isolated in its own module so tests can mock it with `vi.mock` without
 * pulling the native module into the unit-test env.
 */
export async function recognizeBlocks(uri: string): Promise<readonly unknown[]> {
  const result = await TextRecognition.recognize(uri)
  return Array.isArray(result?.blocks) ? (result.blocks as unknown[]) : []
}
