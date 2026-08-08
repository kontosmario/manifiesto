# Captura de gastos desde Apple Pay vía Atajo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un pago con Apple Pay por NFC llegue a Manifiesto con monto y comercio precargados, y que registrarlo cueste un toque.

**Architecture:** Un App Intent en Swift, inyectado al target principal de iOS por un config plugin, aparece como acción en Atajos. El usuario arma una automatización con el disparador "Transacción". Al pagar, iOS despierta la app en background: el intent guarda la captura en `UserDefaults` y postea una notificación local. No hay servidor, ni tabla, ni token — todo ocurre en el dispositivo. Del lado JS, un módulo Expo local lee las capturas, cuatro funciones puras las transforman en filas de revisión, y el sheet de Import Review (ya existente) es la pantalla de confirmación.

**Tech Stack:** Expo SDK 54 (managed, `ios/` es gitignoreado y se regenera con prebuild), React Native 0.81, Swift + AppIntents framework, `@expo/config-plugins`, Expo Modules API, vitest, expo-notifications, expo-secure-store.

**Spec:** `docs/superpowers/specs/2026-08-08-apple-pay-captura-atajo-design.md`

## Global Constraints

- **Sólo iOS.** En Android la fila de Ajustes no se muestra y el host no se monta.
- **El disparador "Transacción" existe recién en iOS 17.** El deployment target del proyecto es 15.5, así que hay usuarios reales por debajo del gate.
- **Nada se escribe en `expenses` sin confirmación explícita del usuario.**
- **El monto NO se parsea en Swift.** Viaja como `String` crudo; el parseo vive en JS con tests.
- **Todo el copy va en `mobile/lib/i18n/locales/{es,en}/*.json` con paridad ES/EN.** Los guards `guard:i18n-keys`, `guard:i18n-quality` y `guard:i18n-hardcoded` corren en `npm run validate` y fallan el build si falta una key o hay texto hardcodeado en `.ts`/`.tsx`.
- **El texto de la notificación local también sale de i18n**: JS escribe las plantillas en `UserDefaults` y Swift las interpola. Nunca hardcodear castellano en Swift.
- **Este proyecto NO corre en simulador en Apple Silicon** (ML Kit trae un fat binary con arm64 de device). Toda verificación nativa es en device físico: `npm run dev:ios`.
- **Antes de correr cualquier comando de node/npx hay que cargar nvm:** `source ~/.nvm/nvm.sh`.
- Los tests unitarios viven en `tests/unit/*.test.ts` e importan con ruta relativa (`../../mobile/...`).
- **Prohibido mencionar a Claude/Anthropic/IA** en commits, ramas, comentarios o docs.
- Esto **no sale por OTA**: requiere build nativa nueva (`buildNumber` 15).
- ⚠️ **El árbol de trabajo tiene el rediseño neumórfico SIN COMMITEAR en varios de los archivos que estas tareas tocan** (`import-review-row.tsx`, `import-review-header.tsx`, `import-review-sheet.tsx`, y `import-review-neo.ts` que además está untracked). `git add <archivo>` stagea **todo** lo que ese archivo tiene sin commitear, no sólo tu cambio. Nunca uses `git add <directorio>` ni `git add` sobre un archivo con cambios ajenos: dejá el archivo en su versión de `HEAD`, re-aplicá sólo tu cambio, commiteá, y recién ahí restaurá la versión del working tree. **Verificá siempre con `git diff --cached --stat` antes de commitear**: si un archivo que tocaste en 2 líneas muestra cientos, arrastraste trabajo ajeno.
- **Todo commit tiene que compilar solo.** Es la consecuencia dura de lo anterior: arrastrar medio rediseño mete imports a archivos que siguen untracked y el commit no levanta desde un checkout limpio. Verificalo con un worktree efímero del commit y `npx tsc --noEmit`.

---

## Estructura de archivos

**Nativo (iOS)**

| Archivo | Responsabilidad |
|---|---|
| `plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift` | El App Intent: declara los parámetros y orquesta guardar + notificar |
| `plugins/apple-pay-intent/ManifiestoCaptureStore.swift` | Persistencia en `UserDefaults` + la notificación local |
| `plugins/with-apple-pay-intent.cjs` | Config plugin: copia los `.swift` al target principal y los agrega al build phase |
| `modules/apple-pay-capture/` | Módulo Expo local: puente de lectura JS ↔ `UserDefaults` |

**Lógica pura (JS, con tests)**

| Archivo | Responsabilidad |
|---|---|
| `mobile/features/apple-pay-capture/types.ts` | `PendingCapture` |
| `mobile/features/apple-pay-capture/parse-shortcut-amount.ts` | Texto de moneda → número |
| `mobile/features/apple-pay-capture/normalize-merchant.ts` | Limpieza del nombre de comercio |
| `mobile/features/apple-pay-capture/resolve-category-for-merchant.ts` | Comercio → categoría, derivada del historial |
| `mobile/features/apple-pay-capture/map-captures-to-review-rows.ts` | Capturas → `ReviewRow[]` |

**Cableado (JS)**

| Archivo | Responsabilidad |
|---|---|
| `mobile/features/apple-pay-capture/apple-pay-enabled-store.ts` | Flag on/off persistido |
| `mobile/features/apple-pay-capture/use-apple-pay-capture-gate.ts` | Drena capturas cuando la app está lista |
| `mobile/components/apple-pay-capture/apple-pay-capture-host.tsx` | Monta el sheet de revisión |
| `app/(app)/settings/apple-pay.tsx` + `mobile/screens/settings/apple-pay-screen.tsx` | Pantalla de configuración |

**Modificados**

| Archivo | Cambio |
|---|---|
| `mobile/features/import-review/types.ts` | `imageUri` opcional, `source` como union discriminado |
| `mobile/components/import-review/import-review-header.tsx` | `imageUri` opcional (el fallback ya existe en la línea 42) |
| `mobile/components/import-review/import-review-sheet.tsx` | `onConfirm` inyectable |
| `app/(app)/(tabs)/_layout.tsx` | Montar el host |
| `mobile/screens/settings/settings-screen.tsx` | Fila de acceso |
| `app.config.ts` | Registrar el plugin + `buildNumber` 15 |

---

## Task 1: Spike nativo — que la acción aparezca en Atajos

**Este es el gate del diseño entero.** Los App Intents compilados dentro de un Pod de CocoaPods pueden no ser indexados por el `appintentsmetadataprocessor` de Apple, y los módulos Expo compilan como Pod. Por eso el `.swift` va al target principal vía config plugin. Si al terminar esta tarea la acción no aparece en Atajos, **parar y replantear** — el resto del plan no sirve.

**Files:**
- Create: `plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift`
- Create: `plugins/with-apple-pay-intent.cjs`
- Modify: `app.config.ts` (registrar el plugin)

**Interfaces:**
- Consumes: nada.
- Produces: la acción "Registrar gasto en Manifiesto" visible en Atajos, con parámetros `amount: String` y `merchant: String`.

- [ ] **Step 1: Escribir el intent mínimo**

`plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift`:

```swift
import AppIntents
import Foundation

@available(iOS 16.0, *)
struct ManifiestoLogExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Registrar gasto"
  static var description = IntentDescription(
    "Guarda un pago de Apple Pay para confirmarlo en Manifiesto."
  )
  // No abre la app: corre en background al pagar.
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Monto")
  var amount: String

  @Parameter(title: "Comercio")
  var merchant: String

  static var parameterSummary: some ParameterSummary {
    Summary("Registrar \(\.$amount) en \(\.$merchant)")
  }

  func perform() async throws -> some IntentResult {
    NSLog("[Manifiesto] capture spike: \(amount) @ \(merchant)")
    return .result()
  }
}
```

- [ ] **Step 2: Escribir el config plugin**

`plugins/with-apple-pay-intent.cjs`:

```js
const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Los App Intents tienen que compilar en el TARGET PRINCIPAL. Si vivieran
// en un Pod (que es como compilan los módulos Expo), el extractor de
// metadata de Apple puede no indexarlos y la acción nunca aparece en
// Atajos. Por eso copiamos los .swift dentro de ios/<App>/ y los sumamos
// al build phase de Sources del target de la app.
const SOURCES = ['ManifiestoLogExpenseIntent.swift']

function withApplePayIntent(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'plugins', 'apple-pay-intent')
      const dest = path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName)
      for (const file of SOURCES) {
        fs.copyFileSync(path.join(src, file), path.join(dest, file))
      }
      return cfg
    },
  ])

  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults
    const appName = cfg.modRequest.projectName
    const target = project.getFirstTarget().uuid
    const group = project.findPBXGroupKey({ name: appName })

    for (const file of SOURCES) {
      const relative = `${appName}/${file}`
      if (project.hasFile(relative)) continue
      project.addSourceFile(relative, { target }, group)
    }
    return cfg
  })

  return config
}

module.exports = withApplePayIntent
```

- [ ] **Step 3: Registrarlo en `app.config.ts`**

Agregar al final del array `plugins`, después de `'./plugins/with-android-backup-rules.cjs'`:

```ts
    // Apple Pay → Atajos (2026-08-08). El App Intent tiene que vivir en el
    // target PRINCIPAL, no en un Pod: los intents dentro de una librería
    // estática pueden no ser indexados por Apple y la acción no aparecería
    // en Atajos. Este plugin copia los .swift a ios/<App>/ y los agrega al
    // build phase en cada prebuild. Requiere build nativa (no sale por OTA).
    './plugins/with-apple-pay-intent.cjs',
```

- [ ] **Step 4: Prebuild y verificar que el archivo entró al proyecto**

```bash
source ~/.nvm/nvm.sh && npx expo prebuild -p ios --clean
```

Verificar:

```bash
grep -c "ManifiestoLogExpenseIntent.swift" ios/*.xcodeproj/project.pbxproj
```

Esperado: un número ≥ 2 (la referencia del archivo y su entrada en el build phase). Si da `0`, el `findPBXGroupKey`/`addSourceFile` no matcheó — inspeccionar `ios/` para ver el nombre real del grupo antes de seguir.

- [ ] **Step 5: Correr en device y verificar en Atajos**

```bash
source ~/.nvm/nvm.sh && npm run dev:ios
```

Con la app instalada, en el iPhone: abrir **Atajos** → **+** → buscar "Manifiesto". Tiene que aparecer la acción **"Registrar gasto"** con dos campos, Monto y Comercio.

Prueba de humo: agregar la acción a un atajo suelto, escribir `$1.234,50` y `SPIKE`, ejecutarlo, y confirmar en la consola de Xcode (o `npx react-native log-ios`) que sale la línea `[Manifiesto] capture spike: $1.234,50 @ SPIKE`.

**Si la acción NO aparece: parar acá y replantear el diseño.** No seguir con las tareas siguientes.

- [ ] **Step 6: Commit**

```bash
git add plugins/apple-pay-intent plugins/with-apple-pay-intent.cjs app.config.ts
git commit -m "feat(apple-pay): App Intent en el target principal, visible en Atajos"
```

---

## Task 2: `parseShortcutAmount` — el monto de Atajos a número ✅ HECHA (2026-08-08)

El monto llega como texto de moneda con signo. Es la pieza más frágil de todo el flujo: los separadores argentinos (`$4.500,00`) y los estadounidenses (`$4,500.00`) usan los mismos caracteres con significado invertido.

**Files:**
- Create: `mobile/features/apple-pay-capture/parse-shortcut-amount.ts`
- Test: `tests/unit/apple-pay-parse-shortcut-amount.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `parseShortcutAmount(raw: string): { value: number; isRefund: boolean } | null`. Devuelve `null` cuando no hay ningún dígito. `value` es siempre positivo; `isRefund` marca los montos negativos.

- [ ] **Step 1: Escribir el test que falla**

`tests/unit/apple-pay-parse-shortcut-amount.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseShortcutAmount } from '../../mobile/features/apple-pay-capture/parse-shortcut-amount'

describe('parseShortcutAmount', () => {
  it('parsea formato argentino con miles y decimales', () => {
    expect(parseShortcutAmount('$4.500,00')).toEqual({ value: 4500, isRefund: false })
  })

  it('parsea formato estadounidense con miles y decimales', () => {
    expect(parseShortcutAmount('$4,500.00')).toEqual({ value: 4500, isRefund: false })
  })

  it('parsea sin decimales, tratando el separador como miles', () => {
    expect(parseShortcutAmount('$4.500')).toEqual({ value: 4500, isRefund: false })
    expect(parseShortcutAmount('$4,500')).toEqual({ value: 4500, isRefund: false })
  })

  it('parsea decimales sin separador de miles', () => {
    expect(parseShortcutAmount('1.234,56')).toEqual({ value: 1234.56, isRefund: false })
    expect(parseShortcutAmount('25,90')).toEqual({ value: 25.9, isRefund: false })
    expect(parseShortcutAmount('25.90')).toEqual({ value: 25.9, isRefund: false })
  })

  it('ignora código de moneda y espacios', () => {
    expect(parseShortcutAmount('ARS 4.500,00')).toEqual({ value: 4500, isRefund: false })
    expect(parseShortcutAmount('US$ 25.00')).toEqual({ value: 25, isRefund: false })
    expect(parseShortcutAmount('  $ 1.000  ')).toEqual({ value: 1000, isRefund: false })
  })

  it('marca los negativos como devolución y devuelve el valor positivo', () => {
    expect(parseShortcutAmount('-$4.500,00')).toEqual({ value: 4500, isRefund: true })
    expect(parseShortcutAmount('$-4.500,00')).toEqual({ value: 4500, isRefund: true })
  })

  it('trata varios separadores de miles', () => {
    expect(parseShortcutAmount('$1.234.567,89')).toEqual({ value: 1234567.89, isRefund: false })
    expect(parseShortcutAmount('$1,234,567.89')).toEqual({ value: 1234567.89, isRefund: false })
  })

  it('devuelve null cuando no hay dígitos', () => {
    expect(parseShortcutAmount('')).toBeNull()
    expect(parseShortcutAmount('   ')).toBeNull()
    expect(parseShortcutAmount('$')).toBeNull()
    expect(parseShortcutAmount('sin monto')).toBeNull()
  })

  it('acepta cero', () => {
    expect(parseShortcutAmount('$0,00')).toEqual({ value: 0, isRefund: false })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit/apple-pay-parse-shortcut-amount.test.ts
```

Esperado: FAIL — `Failed to resolve import ".../parse-shortcut-amount"`.

- [ ] **Step 3: Implementar**

`mobile/features/apple-pay-capture/parse-shortcut-amount.ts`:

```ts
export interface ParsedShortcutAmount {
  value: number
  isRefund: boolean
}

/**
 * El disparador "Transacción" de Atajos entrega el monto como TEXTO de
 * moneda, no como número: `$4.500,00` en Argentina, `$4,500.00` en
 * EE.UU. Los dos usan `.` y `,` con el significado invertido, así que no
 * alcanza con borrar puntos.
 *
 * Regla: el ÚLTIMO separador es el decimal sólo si lo siguen exactamente
 * dos dígitos y no hay separadores después. En cualquier otro caso todos
 * los separadores son de miles. Esto resuelve bien `$4.500` (=4500) y
 * `$25,90` (=25.9), que es donde un parser ingenuo se rompe.
 *
 * El signo se devuelve aparte en vez de como número negativo: un gasto
 * negativo es una DEVOLUCIÓN, y quien llama decide qué hacer con eso.
 */
export function parseShortcutAmount(raw: string): ParsedShortcutAmount | null {
  const isRefund = raw.includes('-')

  // Nos quedamos sólo con dígitos y separadores; se van símbolo de
  // moneda, código ISO, espacios (incluido el no-rompible de iOS) y signo.
  const cleaned = raw.replace(/[^\d.,]/g, '')
  if (!/\d/.test(cleaned)) return null

  const lastDot = cleaned.lastIndexOf('.')
  const lastComma = cleaned.lastIndexOf(',')
  const lastSeparator = Math.max(lastDot, lastComma)

  let integerPart = cleaned
  let decimalPart = ''

  if (lastSeparator !== -1) {
    const tail = cleaned.slice(lastSeparator + 1)
    if (tail.length === 2 && /^\d{2}$/.test(tail)) {
      integerPart = cleaned.slice(0, lastSeparator)
      decimalPart = tail
    }
  }

  const digits = integerPart.replace(/[.,]/g, '')
  const normalized = `${digits === '' ? '0' : digits}.${decimalPart === '' ? '0' : decimalPart}`
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null

  return { value, isRefund }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit/apple-pay-parse-shortcut-amount.test.ts
```

Esperado: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add mobile/features/apple-pay-capture/parse-shortcut-amount.ts tests/unit/apple-pay-parse-shortcut-amount.test.ts
git commit -m "feat(apple-pay): parseo del monto de Atajos (separadores AR y US)"
```

---

## Task 3: Comercio → categoría, aprendida del historial ✅ HECHA (2026-08-08)

Sin tabla nueva ni lista de sinónimos: la sugerencia sale del historial de gastos que ya existe. La primera vez de cada comercio la elige el usuario; de ahí en más viene presugerida.

**Files:**
- Create: `mobile/features/apple-pay-capture/normalize-merchant.ts`
- Create: `mobile/features/apple-pay-capture/resolve-category-for-merchant.ts`
- Test: `tests/unit/apple-pay-merchant-category.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizeMerchant(raw: string): string` — mayúsculas, sin acentos, sin tokens numéricos ni de sucursal.
  - `resolveCategoryForMerchant(history, merchantRaw): string | null` donde `history` es `readonly { description: string; categoryId: string; createdAt: string }[]`.

- [ ] **Step 1: Escribir el test que falla**

`tests/unit/apple-pay-merchant-category.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeMerchant } from '../../mobile/features/apple-pay-capture/normalize-merchant'
import { resolveCategoryForMerchant } from '../../mobile/features/apple-pay-capture/resolve-category-for-merchant'

describe('normalizeMerchant', () => {
  it('pasa a mayúsculas y saca acentos', () => {
    expect(normalizeMerchant('Almacén Doña Rosa')).toBe('ALMACEN DONA ROSA')
  })

  it('saca el número de sucursal', () => {
    expect(normalizeMerchant('STARBUCKS COFFEE #4521')).toBe('STARBUCKS COFFEE')
  })

  it('saca tokens puramente numéricos', () => {
    expect(normalizeMerchant('COTO 1234 CABA')).toBe('COTO CABA')
  })

  it('colapsa espacios y puntuación', () => {
    expect(normalizeMerchant('  MC.DONALDS   S.A.  ')).toBe('MC DONALDS S A')
  })

  it('devuelve cadena vacía cuando no queda nada', () => {
    expect(normalizeMerchant('   ')).toBe('')
    expect(normalizeMerchant('#123')).toBe('')
  })
})

describe('resolveCategoryForMerchant', () => {
  const history = [
    { description: 'Starbucks', categoryId: 'cafe', createdAt: '2026-08-01T12:00:00Z' },
    { description: 'Coto', categoryId: 'super', createdAt: '2026-08-05T12:00:00Z' },
    { description: 'Starbucks Palermo', categoryId: 'salidas', createdAt: '2026-08-07T12:00:00Z' },
  ]

  it('hereda la categoría de la entrada cuyos tokens están contenidos', () => {
    // "STARBUCKS COFFEE" contiene a "Starbucks" → matchea.
    // NO matchea "Starbucks Palermo", aunque sea más reciente: COFFEE no
    // está ahí. El match es por subconjunto, a propósito.
    expect(resolveCategoryForMerchant(history, 'STARBUCKS COFFEE #4521')).toBe('cafe')
  })

  it('el sufijo distinto NO alcanza para matchear', () => {
    // Semántica conservadora: relajarla a "comparten el primer token"
    // haría matchear BANCO NACION con BANCO GALICIA. Preferimos no
    // sugerir antes que sugerir mal.
    expect(resolveCategoryForMerchant(history, 'STARBUCKS COFFEE')).not.toBe('salidas')
  })

  it('gana el más reciente entre los que sí matchean', () => {
    // "Starbucks" está contenido tanto en "Starbucks" como en
    // "Starbucks Palermo" → desempata la recencia.
    expect(resolveCategoryForMerchant(history, 'Starbucks')).toBe('salidas')
  })

  it('matchea exacto ignorando acentos y mayúsculas', () => {
    expect(resolveCategoryForMerchant(history, 'coto')).toBe('super')
  })

  it('devuelve null cuando no hay match', () => {
    expect(resolveCategoryForMerchant(history, 'FARMACITY')).toBeNull()
  })

  it('devuelve null con historial vacío', () => {
    expect(resolveCategoryForMerchant([], 'Starbucks')).toBeNull()
  })

  it('devuelve null con comercio vacío', () => {
    expect(resolveCategoryForMerchant(history, '   ')).toBeNull()
  })

  it('no matchea por un token genérico compartido', () => {
    const noisy = [
      { description: 'Kiosco de la esquina', categoryId: 'varios', createdAt: '2026-08-01T12:00:00Z' },
    ]
    expect(resolveCategoryForMerchant(noisy, 'Bar de la esquina')).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit/apple-pay-merchant-category.test.ts
```

Esperado: FAIL — no resuelven los dos imports.

- [ ] **Step 3: Implementar el normalizador**

`mobile/features/apple-pay-capture/normalize-merchant.ts`:

```ts
/**
 * El nombre de comercio que entrega Apple Pay viene sucio y no coincide
 * literal con lo que el usuario escribió alguna vez como descripción:
 * `STARBUCKS COFFEE #4521` contra `Starbucks`.
 *
 * Normalizamos a mayúsculas sin acentos, sacamos los números de sucursal
 * (`#4521`) y los tokens que son sólo dígitos (códigos de local, CP), y
 * colapsamos toda la puntuación a espacios.
 */
export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/#\s*\d+/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token !== '' && !/^\d+$/.test(token))
    .join(' ')
}
```

- [ ] **Step 4: Implementar la resolución de categoría**

`mobile/features/apple-pay-capture/resolve-category-for-merchant.ts`:

```ts
import { normalizeMerchant } from './normalize-merchant'

export interface MerchantHistoryEntry {
  description: string
  categoryId: string
  createdAt: string
}

// Palabras demasiado comunes para sostener un match por sí solas. Sin
// esto, "Bar de la esquina" heredaría la categoría de "Kiosco de la
// esquina" por compartir "DE LA ESQUINA".
const STOPWORDS: ReadonlySet<string> = new Set([
  'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y', 'EN', 'SA', 'SRL', 'S', 'A',
  'ESQUINA', 'LOCAL', 'SUCURSAL', 'STORE', 'SHOP', 'THE', 'OF',
])

function significantTokens(normalized: string): string[] {
  return normalized.split(' ').filter((token) => token !== '' && !STOPWORDS.has(token))
}

function isMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  const longerSet = new Set(longer)
  return shorter.every((token) => longerSet.has(token))
}

/**
 * Devuelve la categoría del gasto más reciente cuya descripción matchea
 * el comercio, o `null` si no hay ninguno.
 *
 * `null` es una respuesta legítima y frecuente, no un fallo: preseleccionar
 * una categoría equivocada es peor que no preseleccionar ninguna. Es la
 * misma decisión que ya toma el import por OCR
 * (`features/import-review/map-to-review-rows.ts:76`).
 */
export function resolveCategoryForMerchant(
  history: readonly MerchantHistoryEntry[],
  merchantRaw: string,
): string | null {
  const merchantTokens = significantTokens(normalizeMerchant(merchantRaw))
  if (merchantTokens.length === 0) return null

  let best: MerchantHistoryEntry | null = null
  for (const entry of history) {
    const entryTokens = significantTokens(normalizeMerchant(entry.description))
    if (!isMatch(merchantTokens, entryTokens)) continue
    if (best === null || entry.createdAt > best.createdAt) best = entry
  }

  return best?.categoryId ?? null
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit/apple-pay-merchant-category.test.ts
```

Esperado: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add mobile/features/apple-pay-capture tests/unit/apple-pay-merchant-category.test.ts
git commit -m "feat(apple-pay): categoria sugerida por comercio, derivada del historial"
```

---

## Task 4: Generalizar `ReviewRow` y mapear capturas a filas

El sheet de Import Review ya es una capa de revisión genérica; sólo su tipado la ata al OCR. `ReviewRow.source` tipa duro contra `Transaction` aunque el sheet nunca lee ese campo para renderizar, y `imageUri` es obligatorio aunque el header ya tiene el fallback para cadena vacía (`import-review-header.tsx:42`).

**Files:**
- Modify: `mobile/features/import-review/types.ts:30-41`
- Modify: `mobile/features/import-review/map-to-review-rows.ts:84-88`
- Modify: `mobile/components/import-review/import-review-header.tsx:14`
- Modify: `mobile/components/import-review/import-review-sheet.tsx:379`
- Create: `mobile/features/apple-pay-capture/types.ts`
- Create: `mobile/features/apple-pay-capture/map-captures-to-review-rows.ts`
- Test: `tests/unit/apple-pay-map-captures-to-review-rows.test.ts`

**Interfaces:**
- Consumes: `parseShortcutAmount` (Task 2), `resolveCategoryForMerchant` + `MerchantHistoryEntry` (Task 3).
- Produces:
  - `PendingCapture { id: string; merchantRaw: string; amountRaw: string; capturedAt: string }`
  - `mapCapturesToReviewRows(captures, ctx): ReviewRow[]` con `ctx: { today: string; history: readonly MerchantHistoryEntry[]; noDescriptionLabel: string }`
  - `ReviewRow.source` pasa a ser `ReviewRowSource = { origin: 'ocr'; transaction: Transaction; originalCurrency: string; appliedRate: number | null } | { origin: 'apple-pay'; capture: PendingCapture }`
  - `ReviewState.imageUri` pasa a `imageUri?: string`

- [ ] **Step 1: Escribir el test que falla**

`tests/unit/apple-pay-map-captures-to-review-rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapCapturesToReviewRows } from '../../mobile/features/apple-pay-capture/map-captures-to-review-rows'

const ctx = {
  today: '2026-08-08',
  history: [
    { description: 'Starbucks', categoryId: 'cafe', createdAt: '2026-08-01T12:00:00Z' },
  ],
  noDescriptionLabel: 'Sin descripción',
}

describe('mapCapturesToReviewRows', () => {
  it('mapea una captura normal a una fila de gasto lista', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c1', merchantRaw: 'STARBUCKS #12', amountRaw: '$4.500,00', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'c1',
      kind: 'expense',
      amount: 4500,
      description: 'STARBUCKS #12',
      date: '2026-08-08',
      categoryId: 'cafe',
      warnings: [],
    })
    expect(rows[0].source).toEqual({
      origin: 'apple-pay',
      capture: { id: 'c1', merchantRaw: 'STARBUCKS #12', amountRaw: '$4.500,00', capturedAt: '2026-08-08T10:00:00Z' },
    })
  })

  it('deja categoryId en null cuando el comercio es nuevo', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c2', merchantRaw: 'FARMACITY', amountRaw: '$1.000', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].categoryId).toBeNull()
  })

  it('marca las devoluciones como skip', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c3', merchantRaw: 'COTO', amountRaw: '-$500,00', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].kind).toBe('skip')
    expect(rows[0].warnings).toContain('refund')
    expect(rows[0].amount).toBe(500)
  })

  it('avisa cuando el monto no se pudo parsear y deja el campo en cero', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c4', merchantRaw: 'COTO', amountRaw: 'sin monto', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].amount).toBe(0)
    expect(rows[0].warnings).toContain('value-zero')
  })

  it('avisa cuando no hay comercio y usa la etiqueta de fallback', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c5', merchantRaw: '   ', amountRaw: '$100', capturedAt: '2026-08-08T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].description).toBe('Sin descripción')
    expect(rows[0].warnings).toContain('no-merchant')
  })

  it('ancla a hoy una captura con fecha futura', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c6', merchantRaw: 'COTO', amountRaw: '$100', capturedAt: '2026-09-01T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].date).toBe('2026-08-08')
    expect(rows[0].warnings).toContain('future-date')
  })

  it('usa la fecha de la captura cuando es pasada', () => {
    const rows = mapCapturesToReviewRows(
      [{ id: 'c7', merchantRaw: 'COTO', amountRaw: '$100', capturedAt: '2026-08-06T10:00:00Z' }],
      ctx,
    )
    expect(rows[0].date).toBe('2026-08-06')
    expect(rows[0].warnings).toEqual([])
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit/apple-pay-map-captures-to-review-rows.test.ts
```

Esperado: FAIL — no resuelve el import.

- [ ] **Step 3: Generalizar los tipos de import-review**

En `mobile/features/import-review/types.ts`, agregar el warning nuevo al union de `ReviewRowWarning` (después de `'future-date'`):

```ts
  // Apple Pay: monto negativo = devolución, no un gasto. La fila entra
  // en `skip` y el usuario decide.
  | 'refund'
```

Reemplazar `ReviewRow.source` (líneas 30-34) y `ReviewState.imageUri` (línea 40):

```ts
export type ReviewRowSource =
  | {
      origin: 'ocr'
      transaction: Transaction
      originalCurrency: string
      appliedRate: number | null
    }
  | {
      origin: 'apple-pay'
      capture: PendingCapture
    }

export interface ReviewRow {
  id: string
  kind: ReviewRowKind
  amount: number
  description: string
  date: string
  notes: string | null
  categoryId: string | null
  incomeKind: IncomeKind
  warnings: ReviewRowWarning[]
  source: ReviewRowSource
}

export interface ReviewState {
  rows: ReviewRow[]
  unmatched: number
  /** Ausente cuando el origen no es una imagen (p. ej. Apple Pay). */
  imageUri?: string
}
```

Y agregar el import arriba del archivo:

```ts
import type { PendingCapture } from '@/features/apple-pay-capture/types'
```

- [ ] **Step 4: Actualizar los tres consumidores**

En `mobile/features/import-review/map-to-review-rows.ts`, el objeto `source` del return (líneas 84-88) pasa a llevar el discriminante:

```ts
    source: {
      origin: 'ocr',
      transaction: tx,
      originalCurrency: currency,
      appliedRate,
    },
```

En `mobile/components/import-review/import-review-header.tsx:14`, el prop pasa a opcional:

```ts
  imageUri?: string
```

y la guarda de la línea 42 pasa de `imageUri !== ''` a:

```tsx
      {imageUri !== undefined && imageUri !== '' ? (
```

En `mobile/components/import-review/import-review-sheet.tsx:379`, `controller.state.imageUri` ya puede ser `undefined` y el header ahora lo acepta — no requiere cambio, pero verificar con `npm run typecheck`.

- [ ] **Step 5: Implementar el mapper**

`mobile/features/apple-pay-capture/types.ts`:

```ts
export interface PendingCapture {
  id: string
  merchantRaw: string
  amountRaw: string
  /** ISO-8601 estampado por el intent nativo al momento del pago. */
  capturedAt: string
}
```

`mobile/features/apple-pay-capture/map-captures-to-review-rows.ts`:

```ts
import type { ReviewRow, ReviewRowKind, ReviewRowWarning } from '@/features/import-review/types'
import { parseShortcutAmount } from './parse-shortcut-amount'
import {
  resolveCategoryForMerchant,
  type MerchantHistoryEntry,
} from './resolve-category-for-merchant'
import type { PendingCapture } from './types'

export interface CaptureMapContext {
  /** Hoy en YYYY-MM-DD local. */
  today: string
  history: readonly MerchantHistoryEntry[]
  /** Copy i18n para cuando Apple Pay no entrega comercio. */
  noDescriptionLabel: string
}

// Un tap NFC nunca es un ingreso; el campo existe sólo porque `ReviewRow`
// lo comparte con el import por OCR.
const DEFAULT_INCOME_KIND = 'other' as const

export function mapCapturesToReviewRows(
  captures: readonly PendingCapture[],
  ctx: CaptureMapContext,
): ReviewRow[] {
  return captures.map((capture) => mapOne(capture, ctx))
}

function mapOne(capture: PendingCapture, ctx: CaptureMapContext): ReviewRow {
  const warnings: ReviewRowWarning[] = []

  const parsed = parseShortcutAmount(capture.amountRaw)
  const amount = parsed?.value ?? 0
  if (parsed === null || parsed.value === 0) warnings.push('value-zero')
  if (parsed?.isRefund === true) warnings.push('refund')

  const merchant = capture.merchantRaw.trim()
  const hasMerchant = merchant !== ''
  if (!hasMerchant) warnings.push('no-merchant')

  // `capturedAt` es ISO-8601 en UTC; nos quedamos con la parte de fecha.
  // Un reloj adelantado o un viaje de zona horaria puede dejarla en el
  // futuro, y un gasto futuro no existe: la anclamos a hoy y avisamos.
  const rawDate = capture.capturedAt.slice(0, 10)
  const date = rawDate > ctx.today ? ctx.today : rawDate
  if (date !== rawDate) warnings.push('future-date')

  // Una devolución no es un gasto. Entra en `skip` para que el usuario
  // decida en vez de que la app la registre como consumo.
  const kind: ReviewRowKind = parsed?.isRefund === true ? 'skip' : 'expense'

  return {
    id: capture.id,
    kind,
    amount,
    description: hasMerchant ? merchant : ctx.noDescriptionLabel,
    date,
    notes: null,
    categoryId: hasMerchant ? resolveCategoryForMerchant(ctx.history, merchant) : null,
    incomeKind: DEFAULT_INCOME_KIND,
    warnings,
    source: { origin: 'apple-pay', capture },
  }
}
```

- [ ] **Step 6: Correr los tests y el typecheck**

```bash
source ~/.nvm/nvm.sh && npx vitest run tests/unit/apple-pay-map-captures-to-review-rows.test.ts && npm run typecheck
```

Esperado: 7 tests PASS y typecheck limpio. Si el typecheck se queja de `source.transaction` en algún lugar que no revisamos, agregar el guard `source.origin === 'ocr'` ahí.

- [ ] **Step 7: Correr la suite entera**

```bash
source ~/.nvm/nvm.sh && npm run test
```

Esperado: los tests existentes de import-review siguen verdes. Baseline conocido del proyecto: 3 fallas de infraestructura sin relación (ver `feedback_vitest_no_react_renderer`).

- [ ] **Step 8: Commit**

```bash
# Archivos EXPLÍCITOS. Ver la advertencia de árbol sucio en Global Constraints.
git add mobile/features/apple-pay-capture/types.ts \
        mobile/features/apple-pay-capture/map-captures-to-review-rows.ts \
        mobile/features/import-review/types.ts \
        mobile/features/import-review/map-to-review-rows.ts \
        mobile/components/import-review/import-review-header.tsx \
        mobile/components/import-review/import-review-row.tsx \
        mobile/lib/i18n/locales/es/gastos.json \
        mobile/lib/i18n/locales/en/gastos.json \
        tests/unit/apple-pay-map-captures-to-review-rows.test.ts
git diff --cached --stat   # los .tsx deben mostrar POCAS líneas, no cientos
git commit -m "feat(apple-pay): ReviewRow generico por origen + mapeo de capturas a filas"
```

---

## Task 5: Persistencia nativa, notificación local y puente a JS

Completa el intent del spike: ahora guarda y avisa. Y suma el módulo Expo que deja leer las capturas desde JS.

**Files:**
- Create: `plugins/apple-pay-intent/ManifiestoCaptureStore.swift`
- Modify: `plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift`
- Modify: `plugins/with-apple-pay-intent.cjs` (agregar el archivo nuevo a `SOURCES`)
- Create: `modules/apple-pay-capture/expo-module.config.json`
- Create: `modules/apple-pay-capture/ios/ApplePayCaptureModule.swift`
- Create: `mobile/features/apple-pay-capture/native.ts`

**Nota sobre dónde vive el wrapper JS:** `tsconfig.json` sólo declara el alias `@/*` → `./mobile/*`; `modules/` no tiene alias. Por eso el wrapper de JS va en `mobile/features/apple-pay-capture/native.ts` y la carpeta `modules/` queda **sólo con código Swift**. `requireOptionalNativeModule` resuelve por el nombre registrado (`ApplePayCapture`), no por ruta de archivo, así que no hace falta importar nada desde `modules/`.

**Interfaces:**
- Consumes: `PendingCapture` (Task 4).
- Produces (JS): `isApplePayCaptureSupported(): boolean`, `getPendingCaptures(): PendingCapture[]`, `clearCaptures(ids: string[]): void`, `setNotificationCopy(copy: { title: string; bodyTemplate: string }): void`.

- [ ] **Step 1: Escribir el store nativo**

`plugins/apple-pay-intent/ManifiestoCaptureStore.swift`:

```swift
import Foundation
import UserNotifications

/// Persistencia de las capturas de Apple Pay y la notificación local que
/// avisa al usuario.
///
/// Usa `UserDefaults.standard` (no un App Group) porque el App Intent vive
/// en el target principal y corre en el proceso de la app. Si Apple algún
/// día lo moviera a un proceso de extensión, haría falta un App Group con
/// su entitlement.
enum ManifiestoCaptureStore {
  static let capturesKey = "manifiesto.applePay.pendingCaptures"
  static let copyKey = "manifiesto.applePay.notificationCopy"
  /// Tope para que la lista no crezca sin límite si el usuario nunca
  /// abre la app. Se descartan las más viejas.
  static let maxEntries = 50

  static func read() -> [[String: String]] {
    guard let json = UserDefaults.standard.string(forKey: capturesKey),
          let data = json.data(using: .utf8),
          let list = try? JSONSerialization.jsonObject(with: data) as? [[String: String]]
    else { return [] }
    return list
  }

  static func write(_ list: [[String: String]]) {
    guard let data = try? JSONSerialization.data(withJSONObject: list),
          let json = String(data: data, encoding: .utf8)
    else { return }
    UserDefaults.standard.set(json, forKey: capturesKey)
  }

  static func append(merchantRaw: String, amountRaw: String) {
    var list = read()
    let formatter = ISO8601DateFormatter()
    list.append([
      "id": UUID().uuidString,
      "merchantRaw": merchantRaw,
      "amountRaw": amountRaw,
      "capturedAt": formatter.string(from: Date()),
    ])
    if list.count > maxEntries {
      list.removeFirst(list.count - maxEntries)
    }
    write(list)
  }

  /// El copy lo escribe el lado JS desde los archivos de i18n, así el
  /// idioma de la notificación sigue al de la app y no queda castellano
  /// hardcodeado en Swift. Si todavía no se escribió, no notificamos:
  /// la captura igual quedó guardada y se drena al abrir la app.
  static func notify(merchant: String, amount: String) {
    guard let raw = UserDefaults.standard.string(forKey: copyKey),
          let data = raw.data(using: .utf8),
          let copy = try? JSONSerialization.jsonObject(with: data) as? [String: String],
          let title = copy["title"],
          let template = copy["bodyTemplate"]
    else { return }

    let content = UNMutableNotificationContent()
    content.title = title
    content.body = template
      .replacingOccurrences(of: "{amount}", with: amount)
      .replacingOccurrences(of: "{merchant}", with: merchant)
    content.sound = .default
    // Lo lee `NotificationRouterBridge`: trae la app al frente en Gastos.
    // El drenaje y la apertura del sheet los hace el host en foreground.
    content.userInfo = ["url": "/(app)/(tabs)/expenses"]

    let request = UNNotificationRequest(
      identifier: UUID().uuidString,
      content: content,
      trigger: nil
    )
    UNUserNotificationCenter.current().add(request)
  }
}
```

- [ ] **Step 2: Completar el intent**

Reemplazar el cuerpo de `perform()` en `plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift`:

```swift
  func perform() async throws -> some IntentResult {
    ManifiestoCaptureStore.append(merchantRaw: merchant, amountRaw: amount)
    ManifiestoCaptureStore.notify(merchant: merchant, amount: amount)
    return .result()
  }
```

Y en `plugins/with-apple-pay-intent.cjs`, agregar el archivo al array:

```js
const SOURCES = ['ManifiestoLogExpenseIntent.swift', 'ManifiestoCaptureStore.swift']
```

- [ ] **Step 3: Crear el módulo Expo local**

```bash
mkdir -p modules/apple-pay-capture/ios
```

`modules/apple-pay-capture/expo-module.config.json`:

```json
{
  "platforms": ["ios"],
  "ios": {
    "modules": ["ApplePayCaptureModule"]
  }
}
```

`modules/apple-pay-capture/ios/ApplePayCaptureModule.swift`:

```swift
import ExpoModulesCore
import Foundation

// Puente de LECTURA nada más. El App Intent no vive acá a propósito:
// los módulos Expo compilan como Pod y un App Intent dentro de una
// librería estática puede no ser indexado por Apple.
public class ApplePayCaptureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ApplePayCapture")

    Function("getPendingCaptures") { () -> [[String: String]] in
      return ManifiestoCaptureStore.read()
    }

    Function("clearCaptures") { (ids: [String]) -> Void in
      // Borrado por id, no un clear() ciego: una captura que entre
      // entre la lectura y el borrado tiene que sobrevivir.
      let removing = Set(ids)
      let remaining = ManifiestoCaptureStore.read().filter { entry in
        guard let id = entry["id"] else { return false }
        return !removing.contains(id)
      }
      ManifiestoCaptureStore.write(remaining)
    }

    Function("setNotificationCopy") { (copy: [String: String]) -> Void in
      guard let data = try? JSONSerialization.data(withJSONObject: copy),
            let json = String(data: data, encoding: .utf8)
      else { return }
      UserDefaults.standard.set(json, forKey: ManifiestoCaptureStore.copyKey)
    }
  }
}
```

`mobile/features/apple-pay-capture/native.ts`:

```ts
import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'
import type { PendingCapture } from './types'

interface ApplePayCaptureNativeModule {
  getPendingCaptures: () => PendingCapture[]
  clearCaptures: (ids: string[]) => void
  setNotificationCopy: (copy: { title: string; bodyTemplate: string }) => void
}

// `requireOptionalNativeModule` devuelve null en vez de tirar cuando el
// módulo no está: Expo Go, web, y builds viejas anteriores a esta feature.
const native = requireOptionalNativeModule<ApplePayCaptureNativeModule>('ApplePayCapture')

/**
 * Sólo responde "¿existe el módulo nativo?" — es decir, si la build es lo
 * bastante nueva. La versión de iOS es un gate DISTINTO: el intent corre
 * desde iOS 16 pero el disparador "Transacción" existe recién en iOS 17,
 * y los dos casos le dicen cosas distintas al usuario ("actualizá la app"
 * contra "actualizá iOS").
 */
export function isApplePayCaptureSupported(): boolean {
  return Platform.OS === 'ios' && native !== null
}

export function getPendingCaptures(): PendingCapture[] {
  return native?.getPendingCaptures() ?? []
}

export function clearCaptures(ids: string[]): void {
  if (ids.length === 0) return
  native?.clearCaptures(ids)
}

export function setNotificationCopy(copy: { title: string; bodyTemplate: string }): void {
  native?.setNotificationCopy(copy)
}
```

- [ ] **Step 4: Prebuild y correr en device**

```bash
source ~/.nvm/nvm.sh && npx expo prebuild -p ios --clean && npm run dev:ios
```

- [ ] **Step 5: Verificar el ciclo completo a mano en el iPhone**

1. En Atajos, ejecutar el atajo del spike con `$4.500,00` y `STARBUCKS`.
2. **No** tiene que aparecer notificación todavía (el copy aún no se escribió desde JS) — pero la captura sí tiene que quedar guardada.
3. En la app, verificar por consola que `getPendingCaptures()` devuelve un elemento con `merchantRaw: "STARBUCKS"`.
4. Llamar a `setNotificationCopy({ title: 'Prueba', bodyTemplate: 'Pagaste {amount} en {merchant}' })`, ejecutar el atajo de nuevo, y confirmar que **llega la notificación local** con el texto interpolado.
5. Llamar a `clearCaptures([id])` y confirmar que `getPendingCaptures()` ya no lo trae.

- [ ] **Step 6: Commit**

```bash
git add plugins modules
git commit -m "feat(apple-pay): persistencia nativa, notificacion local y puente a JS"
```

---

## Task 6: `onConfirm` inyectable en el sheet de revisión

Hoy `useConfirmImport` está hardcodeado adentro del sheet (`import-review-sheet.tsx:78`). El punto de extensión existe conceptualmente — `previewMode` ya cortocircuita el confirm en la línea 234 — pero está tipado como booleano en vez de callback. Apple Pay necesita el mismo destino que el OCR pero con su propia limpieza posterior (borrar las capturas drenadas).

**Files:**
- Modify: `mobile/components/import-review/import-review-sheet.tsx:36-49, 78, 234-241`

**Interfaces:**
- Consumes: `ConfirmResult` de `mobile/features/import-review/types.ts`.
- Produces: prop `onConfirmRows?: (rows: ReviewRow[]) => Promise<ConfirmResult>`. Cuando se omite, el sheet usa `useConfirmImport` como hasta ahora.

- [ ] **Step 1: Agregar el prop**

En la interfaz `Props` (después de `previewMode`):

```ts
  /**
   * Destino de la confirmación. Por defecto escribe con `useConfirmImport`
   * (el camino del import por OCR). Apple Pay inyecta el suyo para poder
   * limpiar las capturas nativas drenadas después de insertar.
   */
  onConfirmRows?: (rows: ReviewRow[]) => Promise<ConfirmResult>
```

Y sumar los imports de tipo:

```ts
import type { ConfirmResult, ReviewRow, ReviewState } from '@/features/import-review/types'
```

- [ ] **Step 2: Cablearlo**

En la firma del componente, agregar `onConfirmRows` a los parámetros desestructurados. Y en la línea 78:

```ts
  const defaultConfirm = useConfirmImport({ familyId, userId })
  const confirm = onConfirmRows ?? defaultConfirm
```

`useConfirmImport` es un hook y no puede llamarse condicionalmente, así que se llama siempre y sólo se elige cuál usar. La línea 241 (`await confirm(controller.state.rows)`) no cambia.

- [ ] **Step 3: Verificar que no rompimos nada**

```bash
source ~/.nvm/nvm.sh && npm run typecheck && npm run lint && npm run test
```

Esperado: todo verde salvo el baseline conocido de 3 fallas de infraestructura.

- [ ] **Step 4: Verificar los tres puntos de montaje existentes en device**

El sheet se monta en tres lugares y ninguno pasa `onConfirmRows`, así que los tres tienen que seguir comportándose igual: el FAB (`add-expense-tab-button.tsx:841`), el share sheet (`share-import-host.tsx:64`) y el preview de Ajustes (`settings-screen.tsx:1869`). Importar una captura por el FAB y confirmarla, verificando que el gasto entra.

- [ ] **Step 5: Commit**

⚠️ **`import-review-sheet.tsx` tiene el rediseño neumórfico sin commitear** (ver Global Constraints). Un `git add` directo arrastra todo eso y el commit deja de compilar solo, porque el rediseño importa archivos que siguen untracked. Dejá el archivo en su versión de `HEAD`, re-aplicá sólo tu cambio, commiteá, y después restaurá la versión del working tree.

```bash
git add mobile/components/import-review/import-review-sheet.tsx
git diff --cached --stat   # debe mostrar ~10 líneas, NO cientos
git commit -m "refactor(import-review): confirmacion inyectable en el sheet"
```

Y confirmá que el commit compila solo:

```bash
git worktree add /tmp/verif-t6 HEAD
cd /tmp/verif-t6 && ln -s /Users/mario/apps/manifiesto/node_modules node_modules
source ~/.nvm/nvm.sh && npx tsc --noEmit
git worktree remove --force /tmp/verif-t6
```

---

## Task 7: Gate, host y montaje

**Files:**
- Create: `mobile/features/apple-pay-capture/apple-pay-enabled-store.ts`
- Create: `mobile/features/apple-pay-capture/use-apple-pay-capture-gate.ts`
- Create: `mobile/components/apple-pay-capture/apple-pay-capture-host.tsx`
- Modify: `app/(app)/(tabs)/_layout.tsx`
- Modify: `mobile/lib/i18n/locales/{es,en}/gastos.json`

**Interfaces:**
- Consumes: `mapCapturesToReviewRows` (Task 4), el módulo (Task 5), `onConfirmRows` (Task 6).
- Produces: `useApplePayCaptureEnabled(): { enabled: boolean; setEnabled: (v: boolean) => void }`, `<ApplePayCaptureHost />`.

- [ ] **Step 1: El flag persistido**

`mobile/features/apple-pay-capture/apple-pay-enabled-store.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const KEY = 'apple_pay_capture_enabled'

export function useApplePayCaptureEnabled() {
  const [enabled, setEnabledState] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const value = await getPersistentValue(KEY)
      if (alive) {
        setEnabledState(value === '1')
        setLoaded(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    void setPersistentValue(KEY, next ? '1' : '0')
  }, [])

  return { enabled, setEnabled, loaded }
}
```

- [ ] **Step 2: El gate**

`mobile/features/apple-pay-capture/use-apple-pay-capture-gate.ts`:

```ts
import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useAuthFlowState } from '@/features/auth-flow/use-auth-flow'
import { getPendingCaptures, isApplePayCaptureSupported } from './native'
import type { PendingCapture } from './types'

/**
 * Entrega las capturas de Apple Pay RECIÉN cuando el viaje de auth está
 * en `ready` (sesión + unlock + reveal terminado) y hay familia. Mismo
 * criterio que `use-share-import-gate`: nunca procesar contenido antes
 * de autenticar.
 *
 * Drena al montar y en cada vuelta a foreground, porque el intent corre
 * mientras la app está en background y no hay evento que lo anuncie.
 */
export function useApplePayCaptureGate(args: {
  enabled: boolean
  familyId: string | undefined
  userId: string | undefined
  busy: boolean
  onCaptures: (captures: PendingCapture[]) => void
}) {
  const { enabled, familyId, userId, busy, onCaptures } = args
  const authState = useAuthFlowState()
  const busyRef = useRef(busy)
  busyRef.current = busy

  const ready =
    enabled &&
    isApplePayCaptureSupported() &&
    authState.phase === 'ready' &&
    Boolean(familyId) &&
    Boolean(userId)

  const drain = useCallback(() => {
    if (!ready || busyRef.current) return
    const captures = getPendingCaptures()
    if (captures.length > 0) onCaptures(captures)
  }, [ready, onCaptures])

  useEffect(() => {
    drain()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') drain()
    })
    return () => subscription.remove()
  }, [drain])
}
```

- [ ] **Step 3: El host**

`mobile/components/apple-pay-capture/apple-pay-capture-host.tsx`:

```tsx
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InteractionManager } from 'react-native'
import { ImportReviewSheet } from '@/components/import-review/import-review-sheet'
import { useImportWizardContext } from '@/features/import-review/use-import-wizard-context'
import { useConfirmImport } from '@/features/import-review/use-confirm-import'
import { formatISO } from '@/features/import-review/cycle-date-math'
import { useApplePayCaptureEnabled } from '@/features/apple-pay-capture/apple-pay-enabled-store'
import { useApplePayCaptureGate } from '@/features/apple-pay-capture/use-apple-pay-capture-gate'
import { mapCapturesToReviewRows } from '@/features/apple-pay-capture/map-captures-to-review-rows'
import { useRecentExpenses } from '@/features/expenses/use-expenses'
import type { PendingCapture } from '@/features/apple-pay-capture/types'
import type { ConfirmResult, ReviewRow, ReviewState } from '@/features/import-review/types'
import { clearCaptures, setNotificationCopy } from '@/features/apple-pay-capture/native'

/**
 * Host de la captura de Apple Pay. Vive en el layout de tabs (sólo existe
 * con sesión y app desbloqueada) y es dueño de SU instancia del sheet —
 * el share-import y el FAB conservan las suyas, no comparten estado.
 */
export function ApplePayCaptureHost() {
  const { t } = useTranslation()
  const { familyId, userId } = useImportWizardContext()
  const { enabled } = useApplePayCaptureEnabled()
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)
  const [draining, setDraining] = useState<string[]>([])
  const recent = useRecentExpenses(familyId)
  const confirmToDb = useConfirmImport({ familyId: familyId ?? '', userId: userId ?? '' })

  const busy = reviewState !== null

  const history = useMemo(
    () =>
      (recent.data ?? []).map((expense) => ({
        description: expense.description,
        categoryId: expense.category_id,
        createdAt: expense.created_at,
      })),
    [recent.data],
  )

  const handleCaptures = useCallback(
    (captures: PendingCapture[]) => {
      const rows = mapCapturesToReviewRows(captures, {
        today: formatISO(new Date()),
        history,
        noDescriptionLabel: t('gastos:import.noDescription'),
      })
      setDraining(captures.map((capture) => capture.id))
      void (async () => {
        // Mismo cuidado que el share-import: iOS descarta en silencio un
        // <Modal> presentado mientras otro se está dismisseando.
        await new Promise<void>((resolve) => {
          InteractionManager.runAfterInteractions(() => resolve())
        })
        setReviewState({ rows, unmatched: 0 })
      })()
    },
    [history, t],
  )

  useApplePayCaptureGate({ enabled, familyId, userId, busy, onCaptures: handleCaptures })

  const handleConfirm = useCallback(
    async (rows: ReviewRow[]): Promise<ConfirmResult> => {
      const result = await confirmToDb(rows)
      // Se limpian TODAS las capturas drenadas, incluidas las que el
      // usuario marcó como skip: ya las vio y decidió. Dejarlas volvería
      // a ofrecérselas en cada foreground.
      clearCaptures(draining)
      return result
    },
    [confirmToDb, draining],
  )

  if (!enabled) return null

  return (
    <ImportReviewSheet
      visible={reviewState !== null}
      initialState={reviewState}
      familyId={familyId ?? ''}
      userId={userId ?? ''}
      onConfirmRows={handleConfirm}
      onClose={() => setReviewState(null)}
    />
  )
}
```

- [ ] **Step 4: Montarlo y escribir el copy de la notificación**

En `app/(app)/(tabs)/_layout.tsx`, junto a `<ShareImportHost />`:

```tsx
      <ApplePayCaptureHost />
```

con su import (`@/components/apple-pay-capture/apple-pay-capture-host`). Y en el mismo layout, con `setNotificationCopy` importado de `@/features/apple-pay-capture/native`, un efecto que mantenga el copy nativo sincronizado con el idioma:

```tsx
  const { t, i18n } = useTranslation()
  useEffect(() => {
    setNotificationCopy({
      title: t('gastos:applePay.notificationTitle'),
      bodyTemplate: t('gastos:applePay.notificationBody'),
    })
  }, [t, i18n.language])
```

- [ ] **Step 5: Agregar el copy en los dos idiomas**

En `mobile/lib/i18n/locales/es/gastos.json`, dentro del objeto raíz:

```json
  "applePay": {
    "notificationTitle": "¿Registrás este gasto?",
    "notificationBody": "Pagaste {amount} en {merchant}"
  },
```

En `mobile/lib/i18n/locales/en/gastos.json`:

```json
  "applePay": {
    "notificationTitle": "Log this expense?",
    "notificationBody": "You paid {amount} at {merchant}"
  },
```

Las llaves `{amount}` y `{merchant}` las interpola **Swift**, no i18next — por eso van con llave simple y no con la sintaxis `{{var}}` de i18next.

- [ ] **Step 6: Verificar**

```bash
source ~/.nvm/nvm.sh && npm run typecheck && npm run lint && npm run guard:i18n-keys && npm run guard:i18n-quality
```

Esperado: todo verde. Si `useRecentExpenses` tiene otra firma o los campos del gasto se llaman distinto, ajustar el `useMemo` del historial — el typecheck lo va a marcar.

- [ ] **Step 7: Commit**

```bash
git add mobile/features/apple-pay-capture mobile/components/apple-pay-capture \
        app/\(app\)/\(tabs\)/_layout.tsx \
        mobile/lib/i18n/locales/es/gastos.json mobile/lib/i18n/locales/en/gastos.json
git diff --cached --stat   # `_layout.tsx` puede traer cambios ajenos: revisalo
git commit -m "feat(apple-pay): gate, host y drenaje de capturas al sheet de revision"
```

---

## Task 8: Pantalla de configuración y build 15

Un solo switch de prender/apagar. La pantalla es, en los hechos, el producto: la automatización la arma el usuario a mano y Apple no expone API para crearla.

**Files:**
- Create: `app/(app)/settings/apple-pay.tsx`
- Create: `mobile/screens/settings/apple-pay-screen.tsx`
- Modify: `mobile/screens/settings/settings-screen.tsx`
- Modify: `mobile/lib/i18n/locales/{es,en}/settings.json`
- Modify: `app.config.ts`

**Interfaces:**
- Consumes: `useApplePayCaptureEnabled` (Task 7), `isApplePayCaptureSupported` (Task 5).
- Produces: la ruta `/(app)/settings/apple-pay`.

- [ ] **Step 1: La ruta**

`app/(app)/settings/apple-pay.tsx`:

```tsx
import { ApplePayScreen } from '@/screens/settings/apple-pay-screen'

export default function ApplePayRoute() {
  return <ApplePayScreen />
}
```

- [ ] **Step 2: La pantalla**

`mobile/screens/settings/apple-pay-screen.tsx` — seguir el vocabulario neumórfico de las demás pantallas de Ajustes (`neoInk()` / `neoMaterial()`, cero `theme.colors`), montarla dentro de `Screen` sin anidar un `ScrollView` propio. Estructura:

1. **Encabezado**: título y una línea explicando que capta pagos con NFC, no todos los gastos.
2. **Gate de plataforma.** Los tres casos dicen cosas distintas al usuario, así que se resuelven por separado y en este orden:

```ts
import { Platform } from 'react-native'
import { isApplePayCaptureSupported } from '@/features/apple-pay-capture/native'

type ApplePayGate = 'ok' | 'not-ios' | 'needs-app-update' | 'needs-ios-17'

export function resolveApplePayGate(): ApplePayGate {
  if (Platform.OS !== 'ios') return 'not-ios'
  // `isApplePayCaptureSupported` sólo dice si el módulo nativo existe,
  // o sea si la build es lo bastante nueva.
  if (!isApplePayCaptureSupported()) return 'needs-app-update'
  // El disparador "Transacción" existe recién en iOS 17, aunque el
  // intent compile y corra desde iOS 16.
  if (Number.parseInt(String(Platform.Version), 10) < 17) return 'needs-ios-17'
  return 'ok'
}
```

Cada valor distinto de `'ok'` pinta su propio mensaje (`t('settings:applePay.gate.<valor>')`) y deja el switch deshabilitado.

3. **El switch**, cableado a `useApplePayCaptureEnabled()`:

```tsx
const gate = resolveApplePayGate()
const { enabled, setEnabled, loaded } = useApplePayCaptureEnabled()

<Switch
  value={enabled}
  disabled={gate !== 'ok' || !loaded}
  onValueChange={setEnabled}
/>
```

`loaded` evita que el switch parpadee de apagado a prendido mientras se lee el valor persistido del keychain.
4. **Los pasos**, visibles sólo con el switch prendido:
   1. Abrí Atajos → Automatización → Nueva.
   2. Elegí "Transacción" (en iOS 26 se llama "Wallet").
   3. Marcá las tarjetas que quieras seguir y poné "Ejecutar de inmediato".
   4. Agregá la acción **Manifiesto → Registrar gasto**.
   5. En Monto y Comercio, insertá las variables de **Entrada del atajo**.
5. **Botón** que abre Atajos: `Linking.openURL('shortcuts://create-automation')`, con `catch` que muestre un toast si el esquema no resuelve.
6. **Nota de expectativa**, obligatoria: Apple documenta que el disparador falla de vez en cuando y es best-effort con el teléfono bloqueado. El copy **no puede prometer** captura perfecta.

Todo el texto vía `t('settings:applePay.*')` con paridad ES/EN — `guard:i18n-hardcoded` falla el build si queda una cadena suelta en el `.tsx`.

- [ ] **Step 3: La fila en Ajustes**

En `mobile/screens/settings/settings-screen.tsx`, dentro del `SettingsGroup` de gastos, usando el mismo `SettingsRow` que las vecinas (ver líneas 1472-1484 para los props reales: `helper`, `icon`, `label`, `onPress`, `isLast`):

```tsx
{Platform.OS === 'ios' ? (
  <SettingsRow
    helper={t('settings:applePay.rowHelper')}
    icon="contactless-payment"
    label={t('settings:applePay.rowLabel')}
    onPress={() => router.push('/(app)/settings/apple-pay' as never)}
  />
) : null}
```

Verificar que `contactless-payment` exista en el set de íconos que usa `SettingsRow` (es MaterialIcons); si no, usar `credit-card`. El guard de plataforma es necesario porque Android no tiene equivalente.

- [ ] **Step 4: El copy, en los dos idiomas**

En `mobile/lib/i18n/locales/es/settings.json`:

```json
  "applePay": {
    "rowLabel": "Gastos con Apple Pay",
    "rowHelper": "Registrá lo que pagás con el celular",
    "title": "Gastos con Apple Pay",
    "intro": "Cuando pagues apoyando el celular, Manifiesto te avisa con el monto y el comercio para que lo registres de un toque.",
    "toggleLabel": "Capturar mis pagos",
    "gate": {
      "not-ios": "Por ahora esto sólo funciona en iPhone.",
      "needs-app-update": "Actualizá Manifiesto para usar esta función.",
      "needs-ios-17": "Necesitás iOS 17 o más nuevo: los atajos de pago no existen en versiones anteriores."
    },
    "stepsTitle": "Cómo configurarlo",
    "step1": "Abrí Atajos y andá a Automatización → Nueva.",
    "step2": "Elegí «Transacción» (en iOS 26 se llama «Wallet»).",
    "step3": "Marcá las tarjetas que quieras seguir y poné «Ejecutar de inmediato».",
    "step4": "Agregá la acción Manifiesto → Registrar gasto.",
    "step5": "En Monto y Comercio, insertá las variables de «Entrada del atajo».",
    "openShortcuts": "Abrir Atajos",
    "openShortcutsError": "No pudimos abrir Atajos. Buscalo a mano en tu iPhone.",
    "expectation": "Esto capta los pagos sin contacto con el celular. No llega a los pagos con la tarjeta física, ni a los que hacés dentro de otras apps o en la web, y alguna vez puede saltearse uno."
  },
```

En `mobile/lib/i18n/locales/en/settings.json`:

```json
  "applePay": {
    "rowLabel": "Apple Pay expenses",
    "rowHelper": "Log what you pay with your phone",
    "title": "Apple Pay expenses",
    "intro": "When you pay by tapping your phone, Manifiesto shows you the amount and the merchant so you can log it in one tap.",
    "toggleLabel": "Capture my payments",
    "gate": {
      "not-ios": "This only works on iPhone for now.",
      "needs-app-update": "Update Manifiesto to use this feature.",
      "needs-ios-17": "You need iOS 17 or newer: payment automations don't exist in earlier versions."
    },
    "stepsTitle": "How to set it up",
    "step1": "Open Shortcuts and go to Automation → New.",
    "step2": "Pick \"Transaction\" (called \"Wallet\" on iOS 26).",
    "step3": "Select the cards you want to track and choose \"Run Immediately\".",
    "step4": "Add the Manifiesto → Log expense action.",
    "step5": "For Amount and Merchant, insert the \"Shortcut Input\" variables.",
    "openShortcuts": "Open Shortcuts",
    "openShortcutsError": "We couldn't open Shortcuts. Look for it on your iPhone.",
    "expectation": "This captures contactless payments made with your phone. It doesn't cover physical card payments or purchases inside other apps or the web, and it may occasionally miss one."
  },
```

El copy de `expectation` es **obligatorio** y no puede prometer captura perfecta: Apple documenta que el disparador falla de vez en cuando y es best-effort con el teléfono bloqueado.

- [ ] **Step 5: Bump del build**

En `app.config.ts`, cambiar `buildNumber: '14'` por `'15'` y sumar el comentario, siguiendo el formato del historial que ya está en el archivo:

```ts
    // Build 15 (2026-08-08): captura de gastos desde Apple Pay vía Atajo de
    // iOS. App Intent nativo en el target principal (no sale por OTA: el
    // intent es código nativo). Al pagar con NFC la app guarda la captura en
    // background y avisa con una notificación local; el gasto se confirma en
    // el sheet de revisión, con la categoría sugerida a partir del historial.
```

- [ ] **Step 6: Validación completa**

```bash
source ~/.nvm/nvm.sh && npm run validate
```

Esperado: typecheck, lint, tests y los seis guards en verde (salvo el baseline conocido de 3 fallas de infraestructura de vitest).

Y el bundle, porque `validate` no lo cubre y hay dependencias nativas nuevas:

```bash
source ~/.nvm/nvm.sh && npx expo export --platform ios
```

- [ ] **Step 7: Verificación de punta a punta en device**

```bash
source ~/.nvm/nvm.sh && npx expo prebuild -p ios --clean && npm run dev:ios
```

En el iPhone, el recorrido real y completo:

1. Ajustes → Apple Pay → prender el switch.
2. Tocar el botón que abre Atajos y armar la automatización siguiendo los pasos de la pantalla.
3. **Pagar algo real con NFC.**
4. Confirmar que llega la notificación local con el monto y el comercio correctos.
5. Tocarla → la app abre en Gastos y sube el sheet con monto y comercio precargados.
6. Elegir categoría y confirmar → el gasto aparece en el feed con el monto exacto.
7. **Pagar de nuevo en el mismo comercio** → esta vez la categoría tiene que venir presugerida sola. Éste es el criterio de aceptación de la parte "inteligente".
8. Volver a foreground y confirmar que **no reaparece** una captura ya confirmada.
9. Apagar el switch, pagar, y confirmar que no llega notificación ni se abre nada.

- [ ] **Step 8: Actualizar la documentación**

Crear `docs/sistemas/apple-pay-captura.md` siguiendo el formato de `docs/sistemas/activity-ocr.md`: qué capta y qué no, el pipeline nativo → JS, la decisión del target principal contra el Pod, y el runbook de configuración del usuario. Sumar el enlace en el índice de `docs/ESTADO-DEL-PROYECTO/`.

- [ ] **Step 9: Commit**

```bash
git add app/\(app\)/settings/apple-pay.tsx mobile/screens/settings mobile/lib/i18n/locales app.config.ts docs
git commit -m "feat(apple-pay): pantalla de configuracion del atajo + build 15"
```

---

## Notas de cierre

**Antes de submitear a App Store Connect:** revisar las Privacy Nutrition Labels. Comercio y monto son datos financieros; no cambia la categoría de datos que la app ya declara (los gastos ya viven en el servidor), pero el consentimiento in-app ahora es el switch y conviene que la declaración lo refleje.

**Lo que este plan NO hace, a propósito:** deep link `manifiesto://` como camino alternativo, webhook a una Edge Function, modos de comportamiento configurables, monto mínimo, semilla de sinónimos comercio→categoría, y Android. Todo eso está descartado con su razón en la sección "Fuera de alcance" del spec.
