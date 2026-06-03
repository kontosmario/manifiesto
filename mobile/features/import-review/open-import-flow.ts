import * as ImagePicker from 'expo-image-picker'
import { parseActivity } from '@/features/activity-ocr/activity-parser'
import { mapToReviewRows, type MapContext } from './map-to-review-rows'
import type { ReviewState } from './types'

export type OpenImportResult =
  | { kind: 'opened'; state: ReviewState }
  | { kind: 'cancelled' }
  | { kind: 'permission-denied' }
  | { kind: 'error'; message: string }

export async function openImportFlow(
  ctx: MapContext,
): Promise<OpenImportResult> {
  let permission: ImagePicker.MediaLibraryPermissionResponse
  try {
    permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) }
  }
  if (!permission.granted) return { kind: 'permission-denied' }

  let pick: ImagePicker.ImagePickerResult
  try {
    pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    })
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) }
  }

  if (pick.canceled || pick.assets.length === 0) return { kind: 'cancelled' }

  const uri = pick.assets[0].uri

  try {
    const result = await parseActivity(uri)
    const rows = mapToReviewRows(result.transactions, ctx)
    return {
      kind: 'opened',
      state: {
        rows,
        unmatched: result.unmatched.length,
        imageUri: uri,
      },
    }
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) }
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
