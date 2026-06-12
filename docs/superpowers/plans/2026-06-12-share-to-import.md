# Share-to-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compartir una captura desde cualquier app (share sheet iOS) hacia Manifiesto y aterrizar en el wizard de Import Review existente, con la imagen ya procesada por OCR.

**Architecture:** `expo-share-intent` (config plugin) genera la Share Extension nativa; un listener en el root mete la URI en un store puro de 1 slot; un host en el layout de tabs consume el slot cuando el auth flow está `ready` + datos listos, corre `openImportFromUri` (refactor del flujo actual sin picker) y monta su propia instancia de `ImportReviewSheet`.

**Tech Stack:** expo-share-intent ~5.1.1 (línea SDK 54 — v6=SDK55, v7=SDK56), Expo Router, React Native, vitest (node env — NO testear hooks con estado, solo módulos puros).

**Spec:** [docs/superpowers/specs/2026-06-12-share-to-import-design.md](../specs/2026-06-12-share-to-import-design.md)

**Reglas del repo que aplican a TODO el plan:**
- Tests unit en `tests/unit/`, alias `@/` → `mobile/` (ver `vitest.config.ts`).
- `npm run validate` ≠ Metro bundle: tras agregar la dep correr `npx expo export --platform ios`.
- Expo Go no ejecuta módulos nativos custom: el flujo real SOLO se prueba en dev client (`npx expo run:ios`).
- Commits en español, mensaje con scope.

---

### Task 1: Dependencia + config plugin

**Files:**
- Modify: `package.json` (vía npm install)
- Modify: `app.config.ts` (bloque `plugins`, después de `expo-image-picker`)

- [ ] **Step 1: Instalar la dep pineada a la línea SDK 54**

```bash
npm install expo-share-intent@~5.1.1
```

Expected: package.json gana `"expo-share-intent": "~5.1.1"`. Si npm resuelve >=6.0.0, ABORTAR y pinear exacto (peerDep de 6.x es expo ^55).

- [ ] **Step 2: Verificar el API instalado contra lo que asume este plan**

```bash
sed -n '1,120p' node_modules/expo-share-intent/README.md | grep -n "useShareIntent\|iosActivationRules\|androidIntentFilters\|files"
```

Expected: el README documenta `useShareIntent()` → `{ hasShareIntent, shareIntent, resetShareIntent, error }` con `shareIntent.files[].path` y `mimeType`, y las opciones de plugin `iosActivationRules` / `androidIntentFilters`. Si el shape difiere, adaptar Task 5 al API real ANTES de seguir.

- [ ] **Step 3: Registrar el plugin en `app.config.ts`**

En el array `plugins`, inmediatamente después de la entrada `['expo-image-picker', …]`:

```ts
    // Share-to-import (2026-06-12): la Share Extension de iOS y los
    // intent-filters de Android los genera este plugin en prebuild.
    // iOS activa SOLO para imágenes y máximo 1 (decisión spec: una
    // captura por share en v1). Android queda configurado pero sin QA
    // hasta el launch de Play Store. Requiere build nativa nueva — un
    // OTA no alcanza para que Manifiesto aparezca en el share sheet.
    [
      'expo-share-intent',
      {
        iosActivationRules: {
          NSExtensionActivationSupportsImageWithMaxCount: 1,
        },
        androidIntentFilters: ['image/*'],
      },
    ],
```

- [ ] **Step 4: Sanity de config y bundle**

```bash
npx tsc --noEmit && npx expo config --type prebuild 1>/dev/null && npx expo export --platform ios 1>/dev/null && echo CONFIG_OK
```

Expected: `CONFIG_OK`. Si `expo config` falla, el plugin no resolvió — revisar nombre/versión.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.config.ts
git commit -m "feat(share-import): expo-share-intent ~5.1.1 + config plugin (iOS imágenes ×1, Android preparado)"
```

---

### Task 2: `pending-share-store` (TDD)

**Files:**
- Create: `mobile/features/share-import/pending-share-store.ts`
- Test: `tests/unit/pending-share-store.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`tests/unit/pending-share-store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumePendingShare,
  peekPendingShare,
  setPendingShare,
  subscribePendingShare,
  __resetPendingShareForTests,
} from '@/features/share-import/pending-share-store'

describe('pending-share-store (share-to-import)', () => {
  beforeEach(() => {
    __resetPendingShareForTests()
  })

  it('un slot: set → peek no consume, consume vacía', () => {
    setPendingShare('file:///tmp/captura.png')
    expect(peekPendingShare()).toBe('file:///tmp/captura.png')
    expect(consumePendingShare()).toBe('file:///tmp/captura.png')
    expect(peekPendingShare()).toBeNull()
    expect(consumePendingShare()).toBeNull()
  })

  it('un share nuevo pisa al anterior no consumido (el último gana)', () => {
    setPendingShare('file:///a.png')
    setPendingShare('file:///b.png')
    expect(consumePendingShare()).toBe('file:///b.png')
  })

  it('notifica subscribers en set y en consume', () => {
    const listener = vi.fn()
    const unsubscribe = subscribePendingShare(listener)
    setPendingShare('file:///a.png')
    expect(listener).toHaveBeenCalledTimes(1)
    consumePendingShare()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    setPendingShare('file:///c.png')
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npx vitest run tests/unit/pending-share-store.test.ts
```

Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar el store**

`mobile/features/share-import/pending-share-store.ts`:

```ts
/**
 * Slot único para la captura compartida vía share sheet (share-to-import).
 *
 * La Share Extension despierta la app con una imagen; el listener del
 * root la deposita acá y el ShareImportHost la consume RECIÉN cuando el
 * auth flow está `ready` y los datos del wizard cargaron (decisión
 * spec 2026-06-12: unlock primero, wizard después — la imagen nunca se
 * procesa antes de autenticar; mientras espera solo existe como path).
 *
 * Módulo puro estilo toast-bus: sin React, testeable en node.
 */

type Listener = () => void

let pendingUri: string | null = null
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l()
}

/** Deposita una captura compartida. Si había una sin consumir, la pisa
 *  (el último share gana — v1 es single-slot por spec). */
export function setPendingShare(uri: string): void {
  pendingUri = uri
  notify()
}

/** Lee sin consumir — para gates que deciden si hay trabajo. */
export function peekPendingShare(): string | null {
  return pendingUri
}

/** Entrega y vacía el slot. Null si no había nada. */
export function consumePendingShare(): string | null {
  const uri = pendingUri
  pendingUri = null
  if (uri !== null) notify()
  return uri
}

export function subscribePendingShare(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Solo para tests. */
export function __resetPendingShareForTests(): void {
  pendingUri = null
  listeners.clear()
}
```

- [ ] **Step 4: Verde**

```bash
npx vitest run tests/unit/pending-share-store.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/share-import/pending-share-store.ts tests/unit/pending-share-store.test.ts
git commit -m "feat(share-import): pending-share-store — slot único con subscribe (puro, testeado)"
```

---

### Task 3: Refactor `openImportFromUri` (sin cambio de comportamiento)

**Files:**
- Modify: `mobile/features/import-review/open-import-flow.ts` (archivo completo abajo)

- [ ] **Step 1: Reemplazar el archivo con la versión refactorizada**

`mobile/features/import-review/open-import-flow.ts` queda así (la rama post-picker se extrae intacta a `openImportFromUri`):

```ts
import * as ImagePicker from 'expo-image-picker'
import { parseActivity } from '@/features/activity-ocr/activity-parser'
import { mapToReviewRows, type MapContext } from './map-to-review-rows'
import type { ReviewState } from './types'

export type OpenImportResult =
  | { kind: 'opened'; state: ReviewState }
  | { kind: 'cancelled' }
  | { kind: 'permission-denied' }
  | { kind: 'error'; message: string }

/**
 * Pipeline OCR → review state desde una URI ya conocida. Lo comparten
 * el flujo del picker (abajo) y share-to-import (la captura llega por
 * la Share Extension, sin picker). Extraído 2026-06-12.
 */
export async function openImportFromUri(
  uri: string,
  ctx: MapContext,
): Promise<OpenImportResult> {
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

  return openImportFromUri(pick.assets[0].uri, ctx)
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
```

- [ ] **Step 2: Verificar que nada se rompió**

```bash
npx tsc --noEmit && npx vitest run tests/unit/ --silent 2>&1 | tail -3
```

Expected: tsc limpio; suite verde (el parser ya está cubierto; este refactor es mecánico).

- [ ] **Step 3: Commit**

```bash
git add mobile/features/import-review/open-import-flow.ts
git commit -m "refactor(import-review): extraer openImportFromUri — pipeline sin picker para share-to-import"
```

---

### Task 4: Hook compartido `useImportWizardContext`

**Files:**
- Create: `mobile/features/import-review/use-import-wizard-context.ts`
- Modify: `mobile/components/navigation/add-expense-tab-button.tsx:236-244` (función `handleOpenImport`)

- [ ] **Step 1: Crear el hook**

`mobile/features/import-review/use-import-wizard-context.ts`:

```ts
import { useCallback } from 'react'
import { useAuthSession } from '@/features/auth/use-auth-session'
import { useHomeSnapshot } from '@/features/home/use-home-snapshot'
import { useFamilyFinance } from '@/features/finance/use-family-finance'
import type { MapContext } from './map-to-review-rows'

/**
 * Cableado común del wizard de import: identidad (familyId/userId) y
 * fábrica del MapContext (fecha hoy + tipo de cambio + row ids).
 * Compartido por el tab button (picker path) y ShareImportHost
 * (share-to-import) para que la config del parser no se duplique.
 */
export function useImportWizardContext() {
  const session = useAuthSession()
  const userId = session.data?.user.id
  const homeSnapshot = useHomeSnapshot(userId)
  const familyId = homeSnapshot.data?.family?.familyId ?? undefined
  const financeQuery = useFamilyFinance(familyId)
  const usdToArsRate = financeQuery.data?.usd_exchange_rate ?? 1000

  const makeMapContext = useCallback((): MapContext => {
    const today = new Date().toISOString().slice(0, 10)
    let idCounter = 0
    return {
      today,
      usdToArsRate,
      generateRowId: () => `r-${++idCounter}`,
    }
  }, [usdToArsRate])

  return { familyId, userId, makeMapContext }
}
```

- [ ] **Step 2: Consumirlo en el tab button**

En `add-expense-tab-button.tsx`, dentro de `handleOpenImport`, reemplazar el bloque:

```ts
    const rate = financeQuery.data?.usd_exchange_rate ?? 1000
    const today = new Date().toISOString().slice(0, 10)
    let idCounter = 0
    const result = await openImportFlow({
      today,
      usdToArsRate: rate,
      generateRowId: () => `r-${++idCounter}`,
    })
```

por:

```ts
    const result = await openImportFlow(makeMapContext())
```

agregando arriba del componente (junto a los otros hooks):

```ts
  const { makeMapContext } = useImportWizardContext()
```

con su import:

```ts
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
```

> El `financeQuery = useFamilyFinance(familyId)` local del tab button
> queda SOLO si otro código del archivo lo usa — verificar con grep; si
> `handleOpenImport` era el único consumidor, eliminar el hook local y
> su import para no duplicar la query.

- [ ] **Step 3: Verificar**

```bash
grep -n "financeQuery" mobile/components/navigation/add-expense-tab-button.tsx
npx tsc --noEmit && npx eslint mobile/components/navigation/add-expense-tab-button.tsx mobile/features/import-review/use-import-wizard-context.ts
```

Expected: tsc/lint limpios; sin `financeQuery` huérfano.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/import-review/use-import-wizard-context.ts mobile/components/navigation/add-expense-tab-button.tsx
git commit -m "refactor(import-review): useImportWizardContext — cableado del wizard compartido picker/share"
```

---

### Task 5: Listener del share intent (root)

**Files:**
- Create: `mobile/features/share-import/share-import-listener.tsx`
- Modify: `mobile/components/root/root-layout-shell.tsx` (montar `<ShareImportListenerBridge />` junto a `<NotificationRouterBridge />`, línea ~150)

- [ ] **Step 1: Crear el listener con guard de entorno**

`mobile/features/share-import/share-import-listener.tsx`:

```tsx
import { useEffect } from 'react'
import { isExpoGo } from '@/lib/runtime-environment'
import { setPendingShare } from '@/features/share-import/pending-share-store'
import { toast } from '@/lib/toast-bus'

/**
 * Puente root → pending-share-store. Envuelve useShareIntent() de
 * expo-share-intent, que SOLO existe en builds nativas (dev client /
 * TestFlight). En Expo Go el módulo nativo no está linkeado: el guard
 * de require + isExpoGo convierte todo en no-op para que la app bootee
 * (mismo trato que ML Kit en activity-ocr).
 */

type ShareIntentModule = {
  useShareIntent: (options?: { debug?: boolean }) => {
    hasShareIntent: boolean
    shareIntent: {
      files:
        | Array<{ path: string; mimeType: string | null }>
        | null
    } | null
    resetShareIntent: () => void
    error: string | null
  }
}

const shareIntentModule: ShareIntentModule | null = (() => {
  if (isExpoGo) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-share-intent') as ShareIntentModule
  } catch {
    return null
  }
})()

export function ShareImportListenerBridge() {
  if (!shareIntentModule) return null
  return <ShareImportListenerNative mod={shareIntentModule} />
}

function ShareImportListenerNative({ mod }: { mod: ShareIntentModule }) {
  const { hasShareIntent, shareIntent, resetShareIntent, error } =
    mod.useShareIntent()

  useEffect(() => {
    if (!hasShareIntent || !shareIntent) return
    const files = shareIntent.files ?? []
    const images = files.filter((f) =>
      (f.mimeType ?? '').startsWith('image/'),
    )
    if (images.length === 0) {
      // Android puede dejar pasar tipos no-imagen (filter laxo).
      toast.error('Solo puedo importar capturas de pantalla.')
      resetShareIntent()
      return
    }
    if (images.length > 1) {
      toast.info('Procesamos la primera captura — de a una por ahora.')
    }
    const raw = images[0].path
    const uri = raw.startsWith('file://') ? raw : `file://${raw}`
    setPendingShare(uri)
    resetShareIntent()
  }, [hasShareIntent, shareIntent, resetShareIntent])

  useEffect(() => {
    if (error) toast.error('No pude recibir esa captura. Probá de nuevo.')
  }, [error])

  return null
}
```

- [ ] **Step 2: Montarlo en el root shell**

En `mobile/components/root/root-layout-shell.tsx`, junto a `<NotificationRouterBridge />`:

```tsx
          <NotificationRouterBridge />
          <ShareImportListenerBridge />
```

con import:

```tsx
import { ShareImportListenerBridge } from '@/features/share-import/share-import-listener'
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint mobile/features/share-import/share-import-listener.tsx mobile/components/root/root-layout-shell.tsx
```

Expected: limpio.

- [ ] **Step 4: Commit**

```bash
git add mobile/features/share-import/share-import-listener.tsx mobile/components/root/root-layout-shell.tsx
git commit -m "feat(share-import): listener root — share intent → pending store (no-op en Expo Go)"
```

---

### Task 6: Gate de consumo

**Files:**
- Create: `mobile/features/share-import/use-share-import-gate.ts`

- [ ] **Step 1: Crear el hook**

`mobile/features/share-import/use-share-import-gate.ts`:

```ts
import { useEffect } from 'react'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import {
  consumePendingShare,
  peekPendingShare,
  subscribePendingShare,
} from '@/features/share-import/pending-share-store'
import { useSyncExternalStore } from 'react'

/**
 * Entrega la captura compartida al callback RECIÉN cuando:
 *  · auth flow en fase `ready` (sesión + unlock + reveal terminado —
 *    decisión spec: nunca procesar contenido antes de autenticar),
 *  · familyId/userId presentes (datos del wizard),
 *  · el wizard NO está ya abierto (`busy` — la captura espera y se
 *    re-chequea cuando el host la libera).
 */
export function useShareImportGate(args: {
  familyId: string | undefined
  userId: string | undefined
  busy: boolean
  onShare: (uri: string) => void
}) {
  const { familyId, userId, busy, onShare } = args
  const authState = useAuthFlowState()
  const pending = useSyncExternalStore(
    subscribePendingShare,
    peekPendingShare,
    peekPendingShare,
  )

  useEffect(() => {
    if (pending === null) return
    if (busy) return
    if (authState.phase !== 'ready') return
    if (!familyId || !userId) return
    const uri = consumePendingShare()
    if (uri !== null) onShare(uri)
  }, [pending, busy, authState.phase, familyId, userId, onShare])
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit && npx eslint mobile/features/share-import/use-share-import-gate.ts
```

Expected: limpio. (Sin unit test: vitest corre en node sin renderer — los hooks con estado no se testean acá; la lógica con peso vive en el store, ya cubierto.)

- [ ] **Step 3: Commit**

```bash
git add mobile/features/share-import/use-share-import-gate.ts
git commit -m "feat(share-import): gate de consumo — ready + datos + wizard libre"
```

---

### Task 7: `ShareImportHost` + montaje en tabs

**Files:**
- Create: `mobile/components/import-review/share-import-host.tsx`
- Modify: `app/(app)/(tabs)/_layout.tsx` (envolver `<AppTabs />` en fragment con el host)

- [ ] **Step 1: Crear el host**

`mobile/components/import-review/share-import-host.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import { openImportFromUri } from '@/features/import-review/open-import-flow'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import { useShareImportGate } from '@/features/share-import/use-share-import-gate'
import type { ReviewState } from '@/features/import-review/types'
import { toast } from '@/lib/toast-bus'
import { useAppTheme } from '@/theme/theme-provider'

/**
 * Host del flujo share-to-import. Vive en el layout de tabs (solo
 * existe con sesión + app desbloqueada) y es dueño de SU instancia de
 * ImportReviewSheet — el tab button conserva la suya para el path del
 * picker; no comparten estado.
 *
 * Ciclo: gate entrega URI → overlay "Leyendo tu captura…" → OCR+parse
 * (openImportFromUri) → wizard. Cualquier error → toast y a idle.
 */
export function ShareImportHost() {
  const { theme } = useAppTheme()
  const { familyId, userId, makeMapContext } = useImportWizardContext()
  const [phase, setPhase] = useState<'idle' | 'parsing'>('idle')
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)

  const busy = phase === 'parsing' || reviewState !== null

  const handleShare = useCallback(
    (uri: string) => {
      setPhase('parsing')
      void (async () => {
        const result = await openImportFromUri(uri, makeMapContext())
        setPhase('idle')
        if (result.kind === 'opened') {
          setReviewState(result.state)
          return
        }
        if (result.kind === 'error') {
          toast.error(`No pude leer esa captura: ${result.message}`)
        }
      })()
    },
    [makeMapContext],
  )

  useShareImportGate({ familyId, userId, busy, onShare: handleShare })

  return (
    <>
      {phase === 'parsing' ? (
        <View style={styles.overlay} pointerEvents="auto">
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.isDark
                  ? theme.colors.surfaceMuted
                  : theme.colors.creamCard,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={[styles.label, { color: theme.colors.text }]}>
              Leyendo tu captura…
            </Text>
          </View>
        </View>
      ) : null}

      <ImportReviewSheet
        visible={reviewState !== null}
        initialState={reviewState}
        familyId={familyId ?? ''}
        userId={userId ?? ''}
        onClose={() => setReviewState(null)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
})
```

- [ ] **Step 2: Montar en el layout de tabs**

`app/(app)/(tabs)/_layout.tsx` — el `return <AppTabs />` pasa a:

```tsx
  return (
    <>
      <AppTabs />
      <ShareImportHost />
    </>
  )
```

con import:

```tsx
import { ShareImportHost } from '@/components/import-review/share-import-host'
```

- [ ] **Step 3: Verificar**

```bash
npx tsc --noEmit && npx eslint mobile/components/import-review/share-import-host.tsx "app/(app)/(tabs)/_layout.tsx"
```

Expected: limpio.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/import-review/share-import-host.tsx "app/(app)/(tabs)/_layout.tsx"
git commit -m "feat(share-import): ShareImportHost — overlay + wizard propio montado en tabs"
```

---

### Task 8: Validación integral + docs

**Files:**
- Modify: `docs/sistemas/activity-ocr.md` (nueva sección "Entradas al flujo")

- [ ] **Step 1: Suite completa + bundle**

```bash
npm run validate 2>&1 | tail -5
npx expo export --platform ios 1>/dev/null && echo BUNDLE_OK
```

Expected: unit verde (baseline conocida: 3 archivos de integración fallan sin stack local — OK), `BUNDLE_OK`.

- [ ] **Step 2: Documentar en activity-ocr.md**

Agregar sección después de "Pipeline detallado":

```markdown
## Entradas al flujo (2026-06-12)

| Entrada | Path | Detalle |
|---|---|---|
| Picker in-app | tab button → `openImportFlow` | flujo original (permiso + galería) |
| **Share sheet** | Share Extension → `pending-share-store` → `ShareImportHost` → `openImportFromUri` | `expo-share-intent` (~5.1.1, línea SDK 54). iOS solo imágenes ×1; Android configurado sin QA. La captura espera en el store hasta auth `ready` + datos (spec [2026-06-12-share-to-import](../superpowers/specs/2026-06-12-share-to-import-design.md)). Requiere build nativa |
```

- [ ] **Step 3: Commit**

```bash
git add docs/sistemas/activity-ocr.md
git commit -m "docs(activity-ocr): share-to-import como segunda entrada al flujo"
```

---

### Task 9: Prebuild + device test (manual, owner presente)

**Files:** ninguno (verificación en device)

- [ ] **Step 1: Prebuild limpio + dev client en device**

```bash
npx expo prebuild --clean
npx expo run:ios --device
```

Expected: build OK; Xcode genera el target `ShareExtension`. Si EAS/Xcode pide registrar el App Group `group.com.manifiesto.mobile.ZKYQF7UNYA` en el portal de Apple, aceptar (owner logueado).

- [ ] **Step 2: Matriz de pruebas en device**

| # | Escenario | Esperado |
|---|---|---|
| 1 | Fotos → captura de actividad → Compartir | "Manifiesto" aparece en el share sheet |
| 2 | Share con app CERRADA | cold start → splash → Face ID → overlay "Leyendo tu captura…" → wizard con movimientos |
| 3 | Share con app ABIERTA (foreground/background) | overlay → wizard, sin re-lock raro |
| 4 | Share con wizard YA abierto (del picker) | la captura espera; al cerrar el wizard se procesa |
| 5 | Compartir 2 imágenes (select múltiple en Fotos) | toast "Procesamos la primera captura" |
| 6 | Captura sin movimientos (foto random) | wizard empty state existente |
| 7 | Expo Go (`npx expo start`) | app bootea, journeys dev OK, sin crash del listener |

- [ ] **Step 3: Commit de cierre (ajustes que hayan salido del device test)**

```bash
git add -A && git commit -m "fix(share-import): ajustes post device-test"
```

(Solo si hubo ajustes; si no, skip.)

- [ ] **Step 4: Release**

Bump `buildNumber` en `app.config.ts` (ios.buildNumber) + EAS build production + TestFlight — coordinado con el owner. Recordatorio: esta feature NO llega por OTA.

---

## Self-review (hecho al escribir)

- **Cobertura del spec**: dep+plugin (T1), store (T2), refactor URI (T3), contexto compartido (T4), listener+guard ExpoGo (T5), gating unlock/datos/busy (T6), host+overlay+wizard (T7), docs (T8), device matrix + release nativo (T9). Casos borde del spec mapeados: multi-imagen→T5, no-imagen→T5, wizard abierto→T6 (`busy`), sin sesión→T6 (familyId gate), Expo Go→T5+T9.7, empty OCR→sheet existente (T9.6).
- **Placeholders**: ninguno — todo paso con código lo trae completo.
- **Consistencia de tipos**: `setPendingShare/peekPendingShare/consumePendingShare/subscribePendingShare` idénticos en T2/T5/T6; `openImportFromUri(uri, ctx)` idéntico en T3/T7; `useImportWizardContext → { familyId, userId, makeMapContext }` idéntico en T4/T7; props del sheet copiadas del código real (visible/initialState/familyId/userId/onClose).
- **Riesgo conocido**: el shape exacto de `useShareIntent` se verifica contra el README instalado en T1.2 ANTES de escribir el listener.
