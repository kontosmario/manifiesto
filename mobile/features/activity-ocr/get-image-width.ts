import { Image } from 'react-native'

/**
 * Promisifies Image.getSize. Returns the image's pixel width, which
 * is what parseActivityLines(lines, imageWidth) needs to split the
 * merchant column from the amount column. Height is intentionally
 * not exposed — Phase A/B don't use it.
 */
export function getImageWidth(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width) => resolve(width),
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
    )
  })
}
