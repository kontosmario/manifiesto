import { useState } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/app-text'
import * as ImagePicker from 'expo-image-picker'
import { Screen } from '@/components/ui/screen'
import { useAppTheme } from '@/theme/theme-provider'
import { recognizeBlocks } from '@/features/activity-ocr/ocr.service'
import { getImageWidth } from '@/features/activity-ocr/get-image-width'
import { normalize } from '@/features/activity-ocr/parser/normalize'
import { parseActivityLines } from '@/features/activity-ocr/parse-activity-lines'
import type { ParseResult } from '@/features/activity-ocr/types'
import { nunitoFamily } from '@/theme/typography'

type Stage =
  | { kind: 'idle' }
  | { kind: 'picking' }
  | { kind: 'parsing'; uri: string }
  | {
      kind: 'done'
      uri: string
      imageWidth: number
      rawBlocks: unknown[]
      result: ParseResult
    }
  | { kind: 'error'; message: string }

export function ActivityOcrPreviewScreen() {
  const { theme } = useAppTheme()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })

  async function handlePick() {
    setStage({ kind: 'picking' })
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      // @i18n-ignore (dev-only: pantalla de preview de OCR gated por __DEV__, copy interno de tooling)
      setStage({ kind: 'error', message: 'Permiso denegado a galería.' })
      return
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
    })
    if (pick.canceled || pick.assets.length === 0) {
      setStage({ kind: 'idle' })
      return
    }
    const uri = pick.assets[0].uri
    setStage({ kind: 'parsing', uri })
    try {
      const [rawBlocks, imageWidth] = await Promise.all([
        recognizeBlocks(uri),
        getImageWidth(uri),
      ])
      const blocksArr = [...rawBlocks] as unknown[]
      const lines = normalize(rawBlocks)
      const result = parseActivityLines(lines, imageWidth)
      setStage({ kind: 'done', uri, imageWidth, rawBlocks: blocksArr, result })
    } catch (e) {
      setStage({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  function handleCopy(label: string, payload: unknown) {
    if (__DEV__) {
      console.log(`[activity-ocr] ${label}`, JSON.stringify(payload, null, 2))
    }
  }

  return (
    <Screen canGoBack title="Activity OCR · preview">
      <View style={styles.stack}>
        <Pressable
          accessibilityRole="button"
          onPress={handlePick}
          disabled={stage.kind === 'picking' || stage.kind === 'parsing'}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: theme.colors.primary,
              opacity:
                stage.kind === 'picking' || stage.kind === 'parsing'
                  ? 0.6
                  : pressed
                    ? 0.9
                    : 1,
            },
          ]}
        >
          <Text style={styles.ctaText}>📷 Elegir captura de galería</Text>
        </Pressable>

        <Text style={[styles.status, { color: theme.colors.textMuted }]}>
          Estado: {stage.kind}
        </Text>

        {stage.kind === 'done' ? (
          <View style={styles.results}>
            <Image
              source={{ uri: stage.uri }}
              style={styles.thumb}
              resizeMode="contain"
            />
            <Text style={[styles.summary, { color: theme.colors.text }]}>
              imageWidth: {stage.imageWidth}
              {'\n'}transactions: {stage.result.transactions.length}
              {'\n'}unmatched: {stage.result.unmatched.length}
            </Text>
            {/* JSON box: sin ScrollView interno (horizontal bloqueaba el
                scroll vertical). El Screen ya envuelve todo en scroll
                vertical; el Text wrappea las líneas largas
                naturalmente. */}
            <View style={styles.jsonBox}>
              <Text style={[styles.json, { color: theme.colors.text }]}>
                {JSON.stringify(stage.result, null, 2)}
              </Text>
            </View>
            <Pressable
              onPress={() => handleCopy('rawBlocks', stage.rawBlocks)}
              style={styles.copyBtn}
            >
              <Text style={styles.copyText}>
                Logear blocks crudos (Metro)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleCopy('ParseResult', stage.result)}
              style={styles.copyBtn}
            >
              <Text style={styles.copyText}>Logear ParseResult (Metro)</Text>
            </Pressable>
          </View>
        ) : null}

        {stage.kind === 'error' ? (
          <Text style={[styles.error, { color: theme.colors.danger }]}>
            {stage.message}
          </Text>
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  cta: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { fontSize: 16, fontWeight: '800', fontFamily: nunitoFamily('800'), color: '#0F2D06' },
  status: { fontSize: 12, fontWeight: '700', fontFamily: nunitoFamily('700') },
  results: { gap: 12 },
  thumb: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  summary: { fontFamily: 'Menlo', fontSize: 12 },
  jsonBox: {
    backgroundColor: '#0008',
    padding: 8,
    borderRadius: 8,
  },
  json: { fontFamily: 'Menlo', fontSize: 10 },
  copyBtn: { padding: 10, borderRadius: 8, backgroundColor: '#333' },
  copyText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: nunitoFamily('700'),
    textAlign: 'center',
  },
  error: { fontSize: 14, fontWeight: '700', fontFamily: nunitoFamily('700') },
})
