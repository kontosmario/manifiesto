import { recognizeBlocks } from './ocr.service'
import { getImageWidth } from './get-image-width'
import { normalize } from './parser/normalize'
import { parseActivityLines } from './parse-activity-lines'
import type { ParseResult } from './types'

/**
 * Public end-to-end API: uri → ParseResult.
 *
 * Phase B: real pipeline. Runs OCR and image-size lookup in parallel,
 * normalizes ML Kit's blocks into Line[], and delegates to the pure
 * orchestrator from Phase A.
 *
 * Throws if the image can't be read, if ML Kit can't process it, or
 * if Image.getSize fails. Callers (the dev screen and Phase D UI)
 * should catch and render a useful message.
 */
export async function parseActivity(uri: string): Promise<ParseResult> {
  const [blocks, imageWidth] = await Promise.all([
    recognizeBlocks(uri),
    getImageWidth(uri),
  ])
  const lines = normalize(blocks)
  return parseActivityLines(lines, imageWidth)
}
