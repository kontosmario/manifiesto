# Activity OCR — Phase B: ML Kit + Image Picker + Dev Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install `@react-native-ml-kit/text-recognition` + `expo-image-picker`, wrap them in two pure-glue modules (`ocr.service.ts`, `get-image-width.ts`), replace the Phase A stub in `activity-parser.ts` with the real `uri → ParseResult` pipeline, and add a hidden dev screen at `(app)/settings/dev/activity-ocr` that exercises the full path so we can verify on-device that ML Kit's `frame` shape matches what `normalize.ts` expects before any production UI lands in Phase D.

**Architecture:** Two native modules added via `npx expo install` so versions match Expo SDK 54. The OCR + image-size wrappers each do one thing so they can be swapped or mocked independently. The orchestrator (`parseActivity`) does only fan-out/fan-in (`Promise.all` of `recognizeBlocks` + `getImageWidth` → `normalize` → `parseActivityLines`). The dev screen consumes the same modules end-to-end and logs raw `blocks` to Metro for capturing test fixtures.

**Tech Stack:** TypeScript strict, Expo SDK 54 + Expo Router, React Native 0.81, `@react-native-ml-kit/text-recognition` (Vision on iOS, ML Kit on Android), `expo-image-picker`.

**Spec:** `docs/superpowers/specs/2026-06-02-activity-ocr-phase-b-mlkit-design.md`

**Branch:** `feature/activity-ocr` — stay on this branch. Do NOT push to main. The branch will merge to main only after Phase E ships.

**Critical project memories that apply here:**
- `[[feedback-validate-is-not-bundle]]` — `npm run validate` is NOT a substitute for `npx expo export --platform ios|android`. After installing each native module, you MUST run the bundle pre-flight. If it fails, fix root cause before committing.
- `[[feedback-vitest-no-react-renderer]]` — No new unit tests in Phase B (the new modules touch APIs not stubbed in vitest's node env).

---

## File map

**Create:**
- `mobile/features/activity-ocr/ocr.service.ts` — `recognizeBlocks(uri): Promise<readonly unknown[]>` wrapping `TextRecognition.recognize`.
- `mobile/features/activity-ocr/get-image-width.ts` — `getImageWidth(uri): Promise<number>` promisifying `Image.getSize`.
- `mobile/screens/dev/activity-ocr-preview-screen.tsx` — Hidden dev screen with image picker + JSON view + copy-to-Metro buttons.
- `app/(app)/settings/dev/activity-ocr.tsx` — Expo Router route file that mounts the dev screen behind a `__DEV__` redirect.

**Modify:**
- `mobile/features/activity-ocr/activity-parser.ts` — Stub body replaced with the real pipeline.
- `mobile/screens/settings/settings-screen.tsx` — Add one new `SettingsRow` in the existing "Desarrollo" group (gated by `__DEV__`); shift `isLast` from the existing last row to the new one.
- `package.json` + `package-lock.json` — Two new runtime deps (resolved by `npx expo install`).

**Unchanged:**
- Everything in `mobile/features/activity-ocr/` except `activity-parser.ts` (types, patterns, normalize, group-rows, classify, parse-activity-lines stay byte-identical).
- All 5 Phase A test files.
- All other UI / migrations.

---

## Task 1: Install `expo-image-picker`

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1.1: Install via Expo's resolver**

Run: `npx expo install expo-image-picker`
Expected: a single package added at the version Expo SDK 54 has validated. Output should mention `expo-image-picker` and a version number; no peer-dep warnings.

- [ ] **Step 1.2: Confirm the install resolved a version**

Run: `node -e "console.log(require('./package.json').dependencies['expo-image-picker'])"`
Expected: prints a semver-range string (e.g. `~17.0.x` or similar — exact number depends on what `expo install` pinned).

- [ ] **Step 1.3: Bundle pre-flight on iOS**

Run: `npx expo export --platform ios --output-dir /tmp/expo-export-ocr-ios-step1`
Expected: completes without Metro errors. The export includes the new module's autolink metadata.

If it fails, do NOT commit. Read the Metro error; common cause is the new config plugin needing a different Expo version. Fix root cause (likely `npx expo install --fix`) and re-run.

- [ ] **Step 1.4: Bundle pre-flight on Android**

Run: `npx expo export --platform android --output-dir /tmp/expo-export-ocr-android-step1`
Expected: completes without Metro errors.

- [ ] **Step 1.5: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): add expo-image-picker for Phase B image selection

Pinned via `npx expo install` so the version is the one Expo SDK 54
has validated. Manages iOS NSPhotoLibraryUsageDescription and Android
READ_MEDIA_IMAGES via its config plugin — no manual native edits
needed. Bundle pre-flight green on iOS and Android.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Install `@react-native-ml-kit/text-recognition`

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 2.1: Install the latest stable version**

Run: `npm install @react-native-ml-kit/text-recognition`
Expected: installs the latest published version. (We use `npm install` here instead of `npx expo install` because this package is not in Expo's compatibility table; Expo would warn but defer to npm anyway.)

- [ ] **Step 2.2: Confirm the install**

Run: `node -e "console.log(require('./package.json').dependencies['@react-native-ml-kit/text-recognition'])"`
Expected: prints a semver-range string.

- [ ] **Step 2.3: Bundle pre-flight on iOS**

Run: `npx expo export --platform ios --output-dir /tmp/expo-export-ocr-ios-step2`
Expected: completes without Metro errors. The text-recognition module autolinks into the iOS bundle.

If it fails with a missing CocoaPods complaint, this is expected during JS-bundle export (which doesn't run CocoaPods) only if the lib pulls a JS-side native-config module that's broken. Real autolinking happens at `npx expo run:ios` time, which the owner does locally after this task. Document the error and proceed only if it's a true JS-bundle error (not a CocoaPods one).

- [ ] **Step 2.4: Bundle pre-flight on Android**

Run: `npx expo export --platform android --output-dir /tmp/expo-export-ocr-android-step2`
Expected: completes without Metro errors.

- [ ] **Step 2.5: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(deps): add @react-native-ml-kit/text-recognition for OCR

On-device OCR (Vision framework on iOS, ML Kit on Android). Gratis,
offline, no network. Phase A's parser library is designed to consume
this lib's output via the defensive normalize() helper. Bundle pre-
flight green on iOS and Android. Owner will need to rebuild the dev
client locally (npx expo run:ios / run:android) to pick up the new
native module before the dev screen can run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `ocr.service.ts` — ML Kit wrapper

**Files:** `mobile/features/activity-ocr/ocr.service.ts`

No unit test for this module: it forwards to a native module that vitest's node env can't load.

- [ ] **Step 3.1: Create the file**

Create `mobile/features/activity-ocr/ocr.service.ts`:

```ts
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
```

- [ ] **Step 3.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. The TextRecognition import resolves; no implicit-any complaints.

- [ ] **Step 3.3: Lint**

Run: `npm run lint -- mobile/features/activity-ocr/ocr.service.ts`
Expected: PASS.

- [ ] **Step 3.4: Commit**

```bash
git add mobile/features/activity-ocr/ocr.service.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): recognizeBlocks wraps ML Kit text-recognition

One-line forward to TextRecognition.recognize plus an Array.isArray
guard so a malformed response from the native module doesn't crash
the parser. Tolerance for individual block/line shapes stays in
normalize.ts — one place to update if the lib version changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `get-image-width.ts` — `Image.getSize` promisified

**Files:** `mobile/features/activity-ocr/get-image-width.ts`

No unit test: `Image.getSize` isn't in vitest's RN stub.

- [ ] **Step 4.1: Create the file**

Create `mobile/features/activity-ocr/get-image-width.ts`:

```ts
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
```

- [ ] **Step 4.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4.3: Lint**

Run: `npm run lint -- mobile/features/activity-ocr/get-image-width.ts`
Expected: PASS.

- [ ] **Step 4.4: Commit**

```bash
git add mobile/features/activity-ocr/get-image-width.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): getImageWidth promisifies Image.getSize

Image.getSize uses a callback API that pre-dates Promises. Wrapping
it lets parseActivity await it alongside ML Kit via Promise.all.
The reject path always passes a real Error so callers can show a
useful message without typechecking unknowns.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Replace `parseActivity` stub with the real pipeline

**Files:** `mobile/features/activity-ocr/activity-parser.ts`

- [ ] **Step 5.1: Read the current stub**

Run: `cat mobile/features/activity-ocr/activity-parser.ts`
Expected: shows the Phase A stub that throws "parseActivity requires Phase B".

- [ ] **Step 5.2: Replace the file content**

Overwrite `mobile/features/activity-ocr/activity-parser.ts` with:

```ts
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
```

- [ ] **Step 5.3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5.4: Lint**

Run: `npm run lint -- mobile/features/activity-ocr/activity-parser.ts`
Expected: PASS. The `uri` parameter is now consumed (no unused-vars complaint that motivated the previous `_uri` rename).

- [ ] **Step 5.5: Vitest sanity**

Run: `npm test -- tests/unit/activity-ocr-`
Expected: PASS — all 43 Phase A tests still green. They import only the pure modules; the rewrite of `activity-parser.ts` doesn't touch them.

- [ ] **Step 5.6: Commit**

```bash
git add mobile/features/activity-ocr/activity-parser.ts
git commit -m "$(cat <<'EOF'
feat(activity-ocr): parseActivity uri → ParseResult real pipeline

Replaces the Phase A stub. Promise.all of recognizeBlocks +
getImageWidth runs OCR and dimension lookup in parallel, then
normalize + parseActivityLines stay byte-identical to Phase A. Any
caller can now await parseActivity(uri) and get back a typed
ParseResult — the dev screen lands in the next task to exercise it
on-device for the first time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Dev preview screen

**Files:** `mobile/screens/dev/activity-ocr-preview-screen.tsx`

This screen has no unit test — it's a manual smoke harness for on-device verification.

- [ ] **Step 6.1: Create the file**

Create `mobile/screens/dev/activity-ocr-preview-screen.tsx`:

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
    console.log(`[activity-ocr] ${label}`, JSON.stringify(payload, null, 2))
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
            <ScrollView style={styles.jsonBox} horizontal>
              <Text style={[styles.json, { color: theme.colors.text }]}>
                {JSON.stringify(stage.result, null, 2)}
              </Text>
            </ScrollView>
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
  ctaText: { fontSize: 16, fontWeight: '800', color: '#0F2D06' },
  status: { fontSize: 12, fontWeight: '700' },
  results: { gap: 12 },
  thumb: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  summary: { fontFamily: 'Menlo', fontSize: 12 },
  jsonBox: {
    maxHeight: 320,
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
    textAlign: 'center',
  },
  error: { fontSize: 14, fontWeight: '700' },
})
```

- [ ] **Step 6.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

If `theme.colors.danger` does not exist on the theme, replace it with `theme.colors.text` and continue — the dev screen does not need exact brand colors.

- [ ] **Step 6.3: Lint**

Run: `npm run lint -- mobile/screens/dev/activity-ocr-preview-screen.tsx`
Expected: PASS.

- [ ] **Step 6.4: Commit**

```bash
git add mobile/screens/dev/activity-ocr-preview-screen.tsx
git commit -m "$(cat <<'EOF'
feat(activity-ocr): dev preview screen exercises the OCR pipeline

Hidden dev-only screen. User picks an image from gallery, the screen
runs recognizeBlocks + getImageWidth in parallel, normalizes, calls
parseActivityLines, and renders the ParseResult JSON. Two buttons
log the raw ML Kit blocks and the parsed result to the Metro
bundler so a dev can grab them as fixtures for the Phase A test
suite if the live shape diverges from our defensive parser.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Expo Router route file

**Files:** `app/(app)/settings/dev/activity-ocr.tsx`

- [ ] **Step 7.1: Create the route**

Create `app/(app)/settings/dev/activity-ocr.tsx`:

```tsx
import { Redirect } from 'expo-router'
import { ActivityOcrPreviewScreen } from '@/screens/dev/activity-ocr-preview-screen'

export default function Page() {
  if (!__DEV__) return <Redirect href="/(app)/settings" />
  return <ActivityOcrPreviewScreen />
}
```

This mirrors the existing `app/(app)/settings/dev/cycle-wrapped.tsx` pattern exactly. The `(app)` group's `_layout.tsx` already enforces auth, so no `RequireAuth` wrapper is needed.

- [ ] **Step 7.2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7.3: Commit**

```bash
git add "app/(app)/settings/dev/activity-ocr.tsx"
git commit -m "$(cat <<'EOF'
feat(activity-ocr): route gate for the dev preview screen

Mirrors the cycle-wrapped dev route exactly: a __DEV__ check that
redirects production builds back to settings, then mounts the
preview screen. No RequireAuth here because the (app) group
already enforces auth at the layout level.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Settings entry row

**Files:** `mobile/screens/settings/settings-screen.tsx`

- [ ] **Step 8.1: Locate the existing "Desarrollo" group**

Run: `grep -n 'Preview · Cierre de ciclo' mobile/screens/settings/settings-screen.tsx`
Expected: one match around line 1222 (the `label="Preview · Cierre de ciclo"` line inside the `__DEV__` SettingsGroup).

- [ ] **Step 8.2: Edit the file**

In `mobile/screens/settings/settings-screen.tsx`, locate this block:

```tsx
                  <SettingsRow
                    helper="Dispara el Manifiesto Wrapped (recap del ciclo cerrado) con datos sintéticos: cerraste con margen / empatado / excedido."
                    icon="auto-stories"
                    isLast
                    label="Preview · Cierre de ciclo"
                    onPress={() => router.push('/(app)/settings/dev/cycle-wrapped' as never)}
                  />
                </SettingsGroup>
```

Replace it with:

```tsx
                  <SettingsRow
                    helper="Dispara el Manifiesto Wrapped (recap del ciclo cerrado) con datos sintéticos: cerraste con margen / empatado / excedido."
                    icon="auto-stories"
                    label="Preview · Cierre de ciclo"
                    onPress={() => router.push('/(app)/settings/dev/cycle-wrapped' as never)}
                  />
                  <SettingsRow
                    helper="Selecciona una captura de actividad bancaria/wallet. Corre OCR on-device + parser. Muestra el ParseResult en JSON. Pensado para validar el pipeline antes de la UI productiva."
                    icon="text-fields"
                    isLast
                    label="Activity OCR · preview"
                    onPress={() => router.push('/(app)/settings/dev/activity-ocr' as never)}
                  />
                </SettingsGroup>
```

Two changes: `isLast` moved from "Cierre de ciclo" to the new row; new `SettingsRow` for Activity OCR inserted just before the closing `</SettingsGroup>`.

- [ ] **Step 8.3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8.4: Lint**

Run: `npm run lint -- mobile/screens/settings/settings-screen.tsx`
Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add mobile/screens/settings/settings-screen.tsx
git commit -m "$(cat <<'EOF'
feat(activity-ocr): settings entry row for the dev preview

Added inside the existing __DEV__ 'Desarrollo' group, after the
Cierre de ciclo preview. Same SettingsRow pattern as the rest of
the dev rows. isLast moves to the new row so the divider styling
stays correct.

Production builds never see this row (the parent group is gated by
__DEV__) and even direct navigation falls back to the redirect in
the route file.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final gate + push

**Files:** none modified.

- [ ] **Step 9.1: Full validate**

Run: `npm run validate`
Expected: typecheck + lint + tests (435 pass, 0 fail) + guards all green.

- [ ] **Step 9.2: Final iOS bundle pre-flight**

Run: `npx expo export --platform ios --output-dir /tmp/expo-export-ocr-ios-final`
Expected: completes without Metro errors. The bundle now includes the dev screen + both native modules.

- [ ] **Step 9.3: Final Android bundle pre-flight**

Run: `npx expo export --platform android --output-dir /tmp/expo-export-ocr-android-final`
Expected: completes without Metro errors.

- [ ] **Step 9.4: Push branch**

Run: `git push origin feature/activity-ocr`
Expected: push succeeds. Remote branch at the final commit of Task 8 + an empty validate confirmation.

- [ ] **Step 9.5: Verify main is untouched**

Run: `git log --oneline main origin/main | head -3`
Expected: both point to `76c62fa docs(estado): plans UI redesign shipped 2026-06-02`. Phase B work is fully isolated on `feature/activity-ocr`.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| Install `expo-image-picker` | Task 1 ✓ |
| Install `@react-native-ml-kit/text-recognition` | Task 2 ✓ |
| Bundle pre-flight iOS + Android (mandatory) | Tasks 1, 2, 9 ✓ |
| `ocr.service.ts` wrapper | Task 3 ✓ |
| `get-image-width.ts` wrapper | Task 4 ✓ |
| `parseActivity(uri)` real pipeline | Task 5 ✓ |
| Dev preview screen | Task 6 ✓ |
| Route file with `__DEV__` redirect | Task 7 ✓ |
| Settings entry row in "Desarrollo" group | Task 8 ✓ |
| No unit tests for Phase B (native APIs not stubbed) | Implicit — no test step in tasks 3-7 ✓ |
| Console.log copy buttons (no expo-clipboard dep) | Task 6 ✓ |
| Phase A files untouched | Tasks 3-8 don't touch them ✓ |
| Stay on `feature/activity-ocr` branch | Task 9.4 + 9.5 ✓ |

**2. Placeholder scan:** No "TBD", "TODO", "handle error", or "similar to Task N" anywhere. Each Task has the full code/command.

**3. Type consistency:**
- `recognizeBlocks(uri: string): Promise<readonly unknown[]>` — same signature in Task 3 source and Task 5/6 callers ✓
- `getImageWidth(uri: string): Promise<number>` — same signature in Task 4 and Task 5/6 callers ✓
- `parseActivity(uri: string): Promise<ParseResult>` — same signature in Task 5 source and Phase A spec ✓
- `Stage` discriminated union in Task 6 — all 5 variants reachable in `handlePick` ✓
- `ImagePicker.launchImageLibraryAsync` options — `mediaTypes: ['images']` matches SDK 17+ format ✓
- `Redirect href="/(app)/settings"` matches existing `cycle-wrapped.tsx` ✓
- `router.push('/(app)/settings/dev/activity-ocr' as never)` matches existing dev rows ✓

**4. Project memory respected:**
- Native modules added → bundle pre-flight in iOS and Android after each install (Tasks 1.3, 1.4, 2.3, 2.4) and at the final gate (9.2, 9.3). `[[feedback-validate-is-not-bundle]]` ✓
- No new vitest tests for code that touches native APIs. `[[feedback-vitest-no-react-renderer]]` ✓
- No Reanimated worklets in this work → easing/Intl/runOnJS memories don't apply.
- Frequent commits — one per concrete change (9 commits across 8 task groups). ✓
- Branch policy: never push to main; final push goes to `origin/feature/activity-ocr`. ✓
