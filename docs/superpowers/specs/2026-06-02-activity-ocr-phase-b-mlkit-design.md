# Activity OCR — Phase B: ML Kit + Image Picker + URI Pipeline Design

**Fecha:** 2026-06-02
**Branch:** `feature/activity-ocr` (off main; sigue sin mergear hasta que las 5 fases completen).
**Depende de:** Phase A (`feature/activity-ocr` ya en `cc18303` — types, patterns, normalize, group-rows, classify, parse-activity-lines, stub `parseActivity`).

## Goal

Cablear el stub `parseActivity(uri)` con OCR real on-device usando `@react-native-ml-kit/text-recognition`, agregar `expo-image-picker` para seleccionar capturas de la galería, y montar una **pantalla dev oculta** que ejercite el pipeline completo (image picker → ML Kit → normalize → parseActivityLines → ParseResult JSON) para verificar la integración antes de cualquier UI productiva.

## Non-goals (Phase B)

- No persiste nada en Supabase (Phase C).
- No mapea `Transaction → CreateExpenseInput` ni convierte USD↔ARS (Phase C).
- No deduplica (Phase C).
- No tiene UI productiva — la pantalla dev queda bajo `__DEV__` y no se ve en builds de producción (Phase D entrega la UI productiva).
- No heurística merchant→categoría (Phase E).
- No share extension / share sheet (fase futura).
- No preprocesa la imagen (rotación, contraste, crop). El usuario elige una captura "limpia" desde galería; si ML Kit falla en imágenes torcidas, lo documentamos pero no lo resolvemos.

---

## Decisiones tomadas

| Decisión | Razón |
|---|---|
| Pantalla dev oculta en `app/(app)/settings/dev/activity-ocr.tsx` + `mobile/screens/dev/activity-ocr-preview-screen.tsx` | Sigue el patrón de `cycle-wrapped.tsx` / `preview.tsx` ya en el repo (gated por `__DEV__` en el grupo "Desarrollo" de settings). |
| Botón "Copiar fixture" en la pantalla dev | Capturar el JSON crudo de `blocks` que ML Kit emite para una imagen real, copiarlo al clipboard y poder usarlo como fixture en `tests/unit/activity-ocr-normalize.test.ts` si la forma diverge de lo que Phase A asumió. |
| `getImageWidth(uri)` usa `Image.getSize` de React Native | Es API built-in (no nueva dep). Devuelve `{ width, height }` en una Promise. |
| iOS + Android desde el día 1 | `@react-native-ml-kit/text-recognition` soporta ambos nativos (Vision en iOS, ML Kit en Android). La feature no tiene sentido iOS-only para Manifiesto (apunta a usuarios es-AR con ambos OS). |
| `expo-image-picker` con `allowsMultipleSelection: false`, `mediaTypes: ['images']`, `quality: 1.0` | Una captura por flujo, sin compresión adicional (ML Kit prefiere alta resolución). |
| No `expo-image-manipulator` | YAGNI. Phase C/D verán si hace falta para crop/rotate. |
| Pantalla dev muestra el `ParseResult` formateado con `<Text>` simple + `JSON.stringify(result, null, 2)` | Es dev-only; el styling premium no aporta. Un `ScrollView` con monospace text alcanza. |
| Permisos de galería gestionados por `expo-image-picker` config plugin | iOS `NSPhotoLibraryUsageDescription` y Android `READ_MEDIA_IMAGES` los maneja el plugin. Copy del prompt: "Manifiesto necesita acceder a tus fotos para importar capturas de actividad bancaria." |
| Cuando ML Kit devuelve `blocks` con shape inesperado, no crashea: `normalize` ya es defensivo (Phase A test 3) | Si el shape diverge tan radicalmente que `normalize` retorna `[]`, la pantalla dev muestra `transactions: [], unmatched: []` con un encabezado claro — facilita debugging. |
| Sin retry automático ante errores de ML Kit | Los errores en runtime (imagen corrupta, permisos denegados, ML Kit timeout) se renderizan en la pantalla dev como un error visible. El usuario aprieta de nuevo. |

---

## Dependencias (nuevas)

| Paquete | Versión target | Por qué |
|---|---|---|
| `@react-native-ml-kit/text-recognition` | última stable compatible con RN 0.81 / Expo SDK 54 (verificar antes de instalar — probable `1.5.x` o superior) | OCR on-device. Wraps Vision (iOS) + ML Kit (Android). Gratis, offline. |
| `expo-image-picker` | versión que matchea Expo SDK 54 (verificar con `npx expo install expo-image-picker` que pinea la correcta) | Seleccionar imagen de galería. Maneja permisos iOS/Android por config plugin. |

**Sin** `expo-clipboard` para los botones "Copiar fixture". El handler hace `console.log('[activity-ocr]', JSON.stringify(payload, null, 2))` y el dev pesca el output del Metro bundler. Es dev-only, no vale agregar una dep nueva solo para acortar dos pasos del developer.

**Bundle pre-flight es OBLIGATORIO** después de instalar las dos deps. Memoria `[[feedback-validate-is-not-bundle]]`: `npm run validate` no garantiza que Metro bundle. Phase B termina solo si `npx expo export --platform ios` y `npx expo export --platform android` ambos completen sin errores Metro.

**Prebuild iOS/Android:** las dos deps son native modules con autolinking — `npx expo prebuild --clean` regenera carpetas `ios/` y `android/` con los plugins activos. El owner corre el rebuild local del dev client (`npx expo run:ios`/`run:android`) post-merge a la branch.

---

## Arquitectura

```
mobile/features/activity-ocr/
├── ocr.service.ts                # NUEVO — wrapper sobre ML Kit
├── get-image-width.ts            # NUEVO — wrapper sobre Image.getSize, promisificado
├── activity-parser.ts            # MODIFICADO — el stub se vuelve real
└── (sin cambios en types/patterns/normalize/group-rows/classify/parse-activity-lines)

mobile/screens/dev/
└── activity-ocr-preview-screen.tsx     # NUEVO — pantalla dev oculta

app/(app)/settings/dev/
└── activity-ocr.tsx                    # NUEVO — route que wrappea la pantalla en RequireAuth

mobile/screens/settings/
└── settings-screen.tsx                 # MODIFICADO — nueva fila en el grupo "Desarrollo"
```

---

## Componentes nuevos

### 1. `mobile/features/activity-ocr/ocr.service.ts`

```ts
import TextRecognition from '@react-native-ml-kit/text-recognition'

/**
 * Llama a ML Kit y devuelve los `blocks` crudos tal como vienen.
 * No los normaliza — eso lo hace `normalize()` para mantener la defensa
 * contra shapes de frame distintos entre versiones de la lib en un solo lugar.
 *
 * Aislado en su propio módulo para que los tests puedan mockear esta función
 * vía `vi.mock` sin tener que mockear la lib de ML Kit entera.
 */
export async function recognizeBlocks(uri: string): Promise<readonly unknown[]> {
  const result = await TextRecognition.recognize(uri)
  // ML Kit típicamente devuelve `{ text, blocks }`. Devolvemos solo blocks.
  // El cast a `unknown[]` deja que `normalize()` haga la validación shape-by-shape.
  return Array.isArray(result?.blocks) ? (result.blocks as unknown[]) : []
}
```

**Sin tests unit en Phase B** para este módulo: depende de un native module no mockeable trivialmente en env node. El comportamiento se valida en la pantalla dev con una imagen real.

### 2. `mobile/features/activity-ocr/get-image-width.ts`

```ts
import { Image } from 'react-native'

/**
 * Promisifica Image.getSize. Devuelve el ancho de la imagen en píxeles,
 * que es lo que `parseActivityLines(lines, imageWidth)` necesita para
 * dividir las columnas. La altura no la usamos en Phase A/B.
 */
export function getImageWidth(uri: string): Promise<number> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width) => resolve(width),
      (error) => reject(error),
    )
  })
}
```

**Sin tests unit** por la misma razón: `Image.getSize` no está en el stub de RN que usa vitest.

### 3. `mobile/features/activity-ocr/activity-parser.ts` (modificado)

```ts
import { recognizeBlocks } from './ocr.service'
import { getImageWidth } from './get-image-width'
import { normalize } from './parser/normalize'
import { parseActivityLines } from './parse-activity-lines'
import type { ParseResult } from './types'

/**
 * Pipeline completo URI → ParseResult.
 *
 * Phase B: cableado real con ML Kit + Image.getSize. Reemplaza el stub
 * que tiraba "Phase B pending" en commits anteriores.
 *
 * Throws si la imagen no se puede leer, si ML Kit no puede procesarla,
 * o si Image.getSize falla. La pantalla dev y futuras UIs deben atrapar
 * el error y mostrar copy útil al usuario.
 */
export async function parseActivity(uri: string): Promise<ParseResult> {
  const [blocks, imageWidth] = await Promise.all([
    recognizeBlocks(uri),
    getImageWidth(uri),
  ])
  const lines = normalize(blocks)
  return parseActivityLines(lines, imageWidth)
}
```

### 4. `mobile/screens/dev/activity-ocr-preview-screen.tsx`

Pantalla dev. Layout:

```
┌──────────────────────────────────┐
│ ← Activity OCR Preview            │
│                                    │
│ [ 📷 Elegir captura de galería ]  │  ← botón primario
│                                    │
│ ─────────────────────────────────  │
│ Estado: idle / picking / parsing  │
│       / done / error               │
│                                    │
│ Imagen seleccionada:               │
│ [thumbnail 200x...]                │
│                                    │
│ Resumen:                           │
│   • imageWidth: 1206              │
│   • transactions: 4               │
│   • unmatched: 0                  │
│                                    │
│ ParseResult (JSON):                │
│ ╔═══════════════════════════════╗ │
│ ║ {                              ║ │
│ ║   "transactions": [             ║ │
│ ║     { "merchant": "LA…" }       ║ │
│ ║   ]                             ║ │
│ ║ }                              ║ │
│ ╚═══════════════════════════════╝ │
│                                    │
│ [ Copiar blocks crudos ]          │ ← para usar como fixture
│ [ Copiar ParseResult ]             │
└──────────────────────────────────┘
```

Estructura del componente:

```tsx
import { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Screen } from '@/components/ui/screen'
import { useAppTheme } from '@/theme/theme-provider'
import { recognizeBlocks } from '@/features/activity-ocr/ocr.service'
import { getImageWidth } from '@/features/activity-ocr/get-image-width'
import { normalize } from '@/features/activity-ocr/parser/normalize'
import { parseActivityLines } from '@/features/activity-ocr/parse-activity-lines'
import type { ParseResult } from '@/features/activity-ocr/types'

type Stage =
  | { kind: 'idle' }
  | { kind: 'picking' }
  | { kind: 'parsing'; uri: string }
  | { kind: 'done'; uri: string; imageWidth: number; rawBlocks: unknown[]; result: ParseResult }
  | { kind: 'error'; message: string }

export function ActivityOcrPreviewScreen() {
  const { theme } = useAppTheme()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })

  async function handlePick() {
    setStage({ kind: 'picking' })
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
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
      const [rawBlocks, imageWidth] = await Promise.all([recognizeBlocks(uri), getImageWidth(uri)])
      const lines = normalize(rawBlocks as readonly unknown[])
      const result = parseActivityLines(lines, imageWidth)
      setStage({ kind: 'done', uri, imageWidth, rawBlocks: [...rawBlocks] as unknown[], result })
    } catch (e) {
      setStage({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  function handleCopy(payload: unknown) {
    // Si expo-clipboard está disponible, usarlo; si no, log al Metro.
    console.log('[activity-ocr]', JSON.stringify(payload, null, 2))
  }

  return (
    <Screen canGoBack title="Activity OCR Preview">
      <View style={styles.stack}>
        <Pressable
          accessibilityRole="button"
          onPress={handlePick}
          style={[styles.cta, { backgroundColor: theme.colors.primary }]}
        >
          <Text style={styles.ctaText}>📷 Elegir captura de galería</Text>
        </Pressable>

        <Text style={[styles.status, { color: theme.colors.textMuted }]}>
          Estado: {stage.kind}
        </Text>

        {stage.kind === 'done' ? (
          <View style={styles.results}>
            <Image source={{ uri: stage.uri }} style={styles.thumb} resizeMode="contain" />
            <Text style={[styles.summary, { color: theme.colors.text }]}>
              imageWidth: {stage.imageWidth}{'\n'}
              transactions: {stage.result.transactions.length}{'\n'}
              unmatched: {stage.result.unmatched.length}
            </Text>
            <ScrollView style={styles.jsonBox} horizontal>
              <Text style={[styles.json, { color: theme.colors.text }]}>
                {JSON.stringify(stage.result, null, 2)}
              </Text>
            </ScrollView>
            <Pressable onPress={() => handleCopy(stage.rawBlocks)} style={styles.copyBtn}>
              <Text style={styles.copyText}>Copiar blocks crudos (Metro log)</Text>
            </Pressable>
            <Pressable onPress={() => handleCopy(stage.result)} style={styles.copyBtn}>
              <Text style={styles.copyText}>Copiar ParseResult (Metro log)</Text>
            </Pressable>
          </View>
        ) : null}

        {stage.kind === 'error' ? (
          <Text style={[styles.error, { color: theme.colors.danger }]}>{stage.message}</Text>
        ) : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  cta: { padding: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#0F2D06' },
  status: { fontSize: 12, fontWeight: '700' },
  results: { gap: 12 },
  thumb: { width: '100%', height: 220, borderRadius: 8, backgroundColor: '#222' },
  summary: { fontFamily: 'Menlo', fontSize: 12 },
  jsonBox: { maxHeight: 320, backgroundColor: '#0008', padding: 8, borderRadius: 8 },
  json: { fontFamily: 'Menlo', fontSize: 10 },
  copyBtn: { padding: 10, borderRadius: 8, backgroundColor: '#333' },
  copyText: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  error: { fontSize: 14, fontWeight: '700' },
})
```

### 5. `app/(app)/settings/dev/activity-ocr.tsx` (route)

```tsx
import { RequireAuth } from '@/components/auth/require-auth'
import { ActivityOcrPreviewScreen } from '@/screens/dev/activity-ocr-preview-screen'

export default function ActivityOcrDevRoute() {
  if (!__DEV__) return null
  return (
    <RequireAuth>
      <ActivityOcrPreviewScreen />
    </RequireAuth>
  )
}
```

`if (!__DEV__) return null` garantiza que aunque alguien navegue manualmente al path en producción no encuentre nada — defensa en profundidad. La entry visible solo aparece en `__DEV__` (siguiente cambio).

### 6. Entry en `mobile/screens/settings/settings-screen.tsx`

Dentro del grupo "Desarrollo" ya existente (línea ~1175, gated por `__DEV__`), agregar una `<SettingsRow>` con el ícono `text-fields` y un handler que navega a la ruta:

```tsx
<SettingsRow
  helper="Selecciona una captura de actividad bancaria/wallet. Corre OCR on-device + parser. Muestra el ParseResult en JSON. Pensado para validar el pipeline antes de la UI productiva."
  icon="text-fields"
  label="Activity OCR · preview"
  onPress={() => router.push('/(app)/settings/dev/activity-ocr')}
/>
```

---

## Modificaciones

- `mobile/features/activity-ocr/activity-parser.ts` — body del stub reemplazado por el pipeline real.
- `mobile/screens/settings/settings-screen.tsx` — fila nueva en el grupo Desarrollo (gated por `__DEV__`).
- `package.json` + `package-lock.json` — dos deps nuevas.

---

## Sin tocar

- `mobile/features/activity-ocr/types.ts`, `parser/patterns.ts`, `parser/normalize.ts`, `parser/group-rows.ts`, `parser/classify.ts`, `parse-activity-lines.ts` — Phase A queda intacta.
- Tests existentes — los 43 tests de Phase A siguen pasando exactamente igual.
- Cualquier archivo de Phase D (billing UI / add-expense / home).

---

## Testing

### Unit (vitest, env node)

**Sin tests unit nuevos en Phase B.** Las dos funciones nuevas tocan APIs nativas que no están stubbed:
- `recognizeBlocks` llama `TextRecognition.recognize` (native module).
- `getImageWidth` llama `Image.getSize` (no está en el stub de `tests/stubs/react-native.ts`).

Mockear ambas para "probar que llaman lo que dicen" agrega cero valor (sería tautológico). El comportamiento se valida en device.

### Device (manual smoke)

Owner ejecuta en dev build (iOS y Android):
1. Settings → grupo Desarrollo → "Activity OCR · preview".
2. Permitir acceso a galería (primera vez).
3. Seleccionar la captura de referencia del brief (4 transacciones).
4. Verificar:
   - `Estado: done`
   - `imageWidth` razonable (~1170-1290 para iPhone)
   - `transactions: 4` con LA EUROPEA, USDc → ARS (con secondaryAmount), Cashback, A RASCHI SANTIAGO
   - `unmatched: 0`
5. Apretar "Copiar blocks crudos" → ver log en Metro y verificar que cada line tenga `{ text, frame: { top, left, width, height } }`.
6. Probar imagen no-bancaria (foto random) → debería terminar con `transactions: 0, unmatched: N`. No crash.
7. Probar denegar permiso de galería → `Estado: error, Permiso denegado`. No crash.

### Bundle pre-flight (mandatorio)

Después de instalar deps + escribir código:
```bash
npx expo export --platform ios --output-dir /tmp/expo-export-ocr-ios
npx expo export --platform android --output-dir /tmp/expo-export-ocr-android
```

Ambos deben completar sin errores Metro. Si `@react-native-ml-kit/text-recognition` falta autolink en alguna plataforma, sale acá. Memoria `[[feedback-validate-is-not-bundle]]` cumplida.

### Validate gate

`npm run validate` — typecheck + lint + tests + guards. Debe seguir pasando (435+ tests, 0 fallas).

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **ML Kit emite shape de `frame` distinto al esperado** (la razón principal de existir la pantalla dev). | `normalize.ts` ya tolera flat y nested. Si la realidad diverge, los tests de Phase A se actualizan con una fixture real copiada del Metro log. |
| **`expo-image-picker` o ML Kit rompen autolinking en Android.** | Bundle pre-flight en ambas plataformas atrapa esto. Si falla, el owner corre `npx expo prebuild --clean` y rebuild del dev client. |
| **Permisos Android 14+ (`READ_MEDIA_IMAGES`) cambian flujo.** | `expo-image-picker` ya lo cubre en SDK 17+ vía config plugin. Si emite warning, lo capturamos en device smoke. |
| **`Image.getSize` falla para URI que `expo-image-picker` devuelve (formato `file://...`)** | Es un caso bien soportado. Si falla, fallback a `expo-image-manipulator` para leer dimensions — pero solo si Phase B device smoke lo necesita. YAGNI inicial. |
| **Native module no disponible en development client actual.** | El owner debe rebuild el dev client localmente después de instalar deps. Documentado en el plan. |
| **El stub anterior tiraba `Error("parseActivity requires Phase B...")`. Si algo lo importa antes de este merge, runtime error visible — bueno.** | Phase A's test no llamaba el stub; nada productivo lo importa. Después del merge de Phase B la primera invocación viene de la pantalla dev. |

---

## Out of scope explícito (sigue en Phase C/D/E)

- Persistencia en Supabase (`expenses` insert)
- Mapeo `Transaction → CreateExpenseInput` con conversión USD/USDc → ARS
- Decisión de qué hacer con cashback (ingresos), swaps de moneda
- Deduplicación contra expenses existentes
- UI productiva de revisión editable
- Categorización por merchant
- Fallback LLM para `unmatched`
- Migración para columna `origin` / `import_metadata`
- Share extension / share sheet entrypoint

---

## Files summary

```
NEW:
  mobile/features/activity-ocr/ocr.service.ts
  mobile/features/activity-ocr/get-image-width.ts
  mobile/screens/dev/activity-ocr-preview-screen.tsx
  app/(app)/settings/dev/activity-ocr.tsx

MODIFIED:
  mobile/features/activity-ocr/activity-parser.ts  (stub → pipeline real)
  mobile/screens/settings/settings-screen.tsx     (nueva SettingsRow gated por __DEV__)
  package.json + package-lock.json                (2 deps nuevas)

UNCHANGED:
  mobile/features/activity-ocr/types.ts
  mobile/features/activity-ocr/parser/patterns.ts
  mobile/features/activity-ocr/parser/normalize.ts
  mobile/features/activity-ocr/parser/group-rows.ts
  mobile/features/activity-ocr/parser/classify.ts
  mobile/features/activity-ocr/parse-activity-lines.ts
  tests/unit/activity-ocr-*.test.ts (los 5)
```

Cero migraciones, cero cambios en flows productivos, cero changes en UI de billing/home/add-expense.

## Aceptación

- [ ] Las 2 deps instaladas con la versión que `npx expo install` pinea.
- [ ] `npm run validate` verde end-to-end.
- [ ] `npx expo export --platform ios` y `--platform android` ambos completan sin errores Metro.
- [ ] La pantalla dev existe, gated por `__DEV__`, no aparece en builds de producción.
- [ ] En device dev, la captura de referencia del brief produce 4 transactions correctas (mismo assert que el fixture end-to-end de Phase A, pero esta vez desde imagen real).
- [ ] `recognizeBlocks` aísla la dep nativa para que Phase A siga testeable sin tocar nada.
