# Tamaño de texto propio de la app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selector de tamaño de fuente en Settings (4 niveles) y desacople total del texto de la app respecto del fontScale del OS.

**Architecture:** Lib pura (`mobile/lib/font-scale.ts`) + provider espejo de `language-provider` + wrapper drop-in de `Text`/`TextInput` que fuerza `allowFontScaling={false}` y aplica la escala in-app; codemod de los ~256 imports; kill nativo de respaldo en Android (config plugin `fontScale=1`) para texto de terceros. **En iOS NO hay kill de respaldo** (ver Task 2): con la Nueva Arquitectura prendida el multiplicador sale de `RCTFontSizeMultiplier()` y `setAccessibilityContentSizeMultipliers` no lo toca.

**Tech Stack:** Expo SDK 54 / RN 0.81.5 / React 19 (sin `defaultProps`), vitest (env node, stubs en `tests/stubs/`), ESLint flat config con typescript-eslint, config plugins Expo en `plugins/*.cjs`.

**Spec:** `docs/superpowers/specs/2026-08-14-font-scale-app-design.md`

## Global Constraints

- **Principio rector:** todo el texto depende de NUESTRA config, nunca del OS. Sin opción «Sistema» en el selector.
- Factores: `sm: 0.9 · md: 1 · lg: 1.1 · xl: 1.2`. Default `md`. Labels: Chica / Normal / Grande / Muy grande.
- Key de persistencia: `manifiesto.font-scale-preference` (persistent-kv, local al device, sin sync a backend). **Con punto, no con dos puntos:** expo-secure-store valida las claves contra `/^[\w.-]+$/` y tira `Invalid key provided to SecureStore` con cualquier otra; `persistent-kv` se traga esa excepción y la preferencia jamás persistiría. (Las keys de theme/language/motion-preference sí usan `:` y arrastran ese bug: deuda pre-existente, fuera del alcance de este plan.)
- **Node por nvm:** el Bash tool no carga nvm. Prefijar TODO comando node/npm/npx/tsc/vitest con `source ~/.nvm/nvm.sh && `.
- **WIP del branch (no hace falta limpiar el árbol) — medición 2026-08-14 con la lógica EXACTA del codemod:** `feat/ui-redesign` tiene ~122 entradas sin commitear (modificados + untracked: Wrapped + ciclo extendido + fijos). Alcance real del codemod: **295** archivos importan `Text` y **25** importan `TextInput` de react-native (el conteo previo de 256/16 subestimaba: venía de un grep de una línea que se perdía los imports multilínea). De esos, **18** colisionan con el WIP en `Text` y **2** en `TextInput`.
  Además: TODOS los archivos de edición quirúrgica de este plan (`app-providers.tsx`, `app.config.ts`, `eslint.config.js`, `settings-screen.tsx`, ambos `settings.json`) están limpios.
  **Protocolo obligatorio:** al empezar la Task 4, snapshotear el WIP ajeno (modificados Y untracked) y usarlo como lista de exclusión:
  ```bash
  git status --porcelain | grep -E '^( M|MM|\?\?)' | sed 's/^...//' | sort > /tmp/wip-owner.txt
  ```
  El codemod corre sobre TODO el árbol (así lint/typecheck/bundle quedan consistentes) pero se commitean SOLO los archivos que NO están en esa lista. Los colisionados quedan modificados en el working tree y su swap de import viaja dentro del commit del owner. Listarlos en el body del commit.
  **Ojo:** hay otra sesión commiteando en este branch en paralelo (commits de `fijos`). Re-snapshotear al empezar cada task; nunca reusar una lista vieja.
- **REGLA DURA DE COMMITS:** jamás `git add -A`, `git add -u` ni `git add .` — hay WIP ajeno en el árbol. SIEMPRE paths explícitos, y verificar `git diff --cached --name-only` contra `/tmp/wip-owner.txt` antes de cada commit.
- **Sin atribución de Claude/Anthropic** en commits, comentarios o docs (regla global del usuario).
- Commits en español, estilo del repo: `tipo(área): descripción`.
- `guard:motion-tokens` de `npm run validate` ya fallaba en este branch ANTES de este trabajo (motion-tokens ajenos). Medir SIEMPRE contra ese baseline: correr validate antes de empezar una task si hay duda de qué rompiste vos.
- No usar Expo Go ni simulador iOS (excluido por ML Kit): QA visual solo en device físico, fuera del alcance de estas tasks (checklist final para el owner).

---

### Task 1: Lib pura `font-scale.ts` + tests

**Files:**
- Create: `mobile/lib/font-scale.ts`
- Test: `tests/unit/font-scale.test.ts`

**Interfaces:**
- Consumes: nada (módulo hoja, solo `import type` de react-native — se borra en runtime, vitest ni lo resuelve).
- Produces: `FontScalePreference = 'sm' | 'md' | 'lg' | 'xl'`, `FONT_SCALE_FACTORS: Record<FontScalePreference, number>`, `isFontScalePreference(value: unknown): value is FontScalePreference`, `scaledTextOverrides(style: StyleProp<TextStyle>, factor: number): TextStyle | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/font-scale.test.ts
import { describe, expect, it } from 'vitest'
import {
  FONT_SCALE_FACTORS,
  isFontScalePreference,
  scaledTextOverrides,
} from '@/lib/font-scale'

describe('FONT_SCALE_FACTORS', () => {
  it('define los 4 niveles del spec con md=1 como default de diseño', () => {
    expect(FONT_SCALE_FACTORS).toEqual({ sm: 0.9, md: 1, lg: 1.1, xl: 1.2 })
  })
})

describe('isFontScalePreference', () => {
  it('acepta los 4 niveles', () => {
    for (const p of ['sm', 'md', 'lg', 'xl']) {
      expect(isFontScalePreference(p)).toBe(true)
    }
  })
  it('rechaza lo demás (incluye null del storage y valores viejos)', () => {
    for (const v of [null, undefined, '', 'system', 'MD', 1, {}]) {
      expect(isFontScalePreference(v)).toBe(false)
    }
  })
})

describe('scaledTextOverrides', () => {
  it('con factor 1 devuelve null (fast path: ni aplana)', () => {
    expect(scaledTextOverrides({ fontSize: 14 }, 1)).toBeNull()
  })

  it('sin fontSize declarado devuelve null: un Text anidado hereda del padre ya escalado', () => {
    expect(scaledTextOverrides({ color: 'red', lineHeight: 20 }, 1.2)).toBeNull()
    expect(scaledTextOverrides(undefined, 1.2)).toBeNull()
    expect(scaledTextOverrides(null, 1.2)).toBeNull()
  })

  it('escala fontSize, lineHeight y letterSpacing; no toca el resto', () => {
    const overrides = scaledTextOverrides(
      { fontSize: 20, lineHeight: 28, letterSpacing: -1, color: 'red' },
      1.1,
    )
    expect(overrides).toEqual({ fontSize: 22, lineHeight: 30.8, letterSpacing: -1.1 })
  })

  it('aplana arrays anidados con la semántica de RN: el último gana, falsy se ignora', () => {
    const style = [
      { fontSize: 14, lineHeight: 20 },
      false as const,
      [undefined, { fontSize: 22 }],
    ]
    expect(scaledTextOverrides(style, 1.2)).toEqual({ fontSize: 26.4, lineHeight: 24 })
  })

  it('redondea a 1 decimal (sin ruido flotante)', () => {
    expect(scaledTextOverrides({ fontSize: 13 }, 1.1)).toEqual({ fontSize: 14.3 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/font-scale.test.ts`
Expected: FAIL — `Cannot find module '@/lib/font-scale'` (o equivalente de resolución).

- [ ] **Step 3: Write minimal implementation**

```ts
// mobile/lib/font-scale.ts
import type { StyleProp, TextStyle } from 'react-native'

/**
 * Escala de texto propia de la app — ver spec
 * docs/superpowers/specs/2026-08-14-font-scale-app-design.md.
 *
 * El tamaño del texto responde SOLO a esta preferencia, nunca al
 * fontScale del OS (que rompía la UI). Sin nivel «Sistema» a propósito.
 * Módulo puro sin imports de runtime: testeable en vitest env node.
 */
export type FontScalePreference = 'sm' | 'md' | 'lg' | 'xl'

export const FONT_SCALE_FACTORS: Record<FontScalePreference, number> = {
  sm: 0.9,
  md: 1,
  lg: 1.1,
  xl: 1.2,
}

export function isFontScalePreference(value: unknown): value is FontScalePreference {
  return value === 'sm' || value === 'md' || value === 'lg' || value === 'xl'
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function flattenTextStyle(style: StyleProp<TextStyle>): TextStyle | null {
  if (!style || typeof style !== 'object') return null
  if (Array.isArray(style)) {
    let merged: TextStyle | null = null
    for (const entry of style) {
      const flat = flattenTextStyle(entry as StyleProp<TextStyle>)
      if (flat) merged = merged ? { ...merged, ...flat } : { ...flat }
    }
    return merged
  }
  return style as TextStyle
}

/**
 * Overrides escalados para componer como `[style, overrides]` — así el
 * style original queda intacto y solo se pisan las métricas de fuente.
 *
 * Devuelve null cuando no hay nada que escalar: factor 1 (default), o
 * un style sin `fontSize` declarado (un Text anidado sin fontSize
 * hereda del padre ya escalado; inyectar el default 14 de RN rompería
 * esa herencia).
 */
export function scaledTextOverrides(
  style: StyleProp<TextStyle>,
  factor: number,
): TextStyle | null {
  if (factor === 1) return null
  const flat = flattenTextStyle(style)
  if (typeof flat?.fontSize !== 'number') return null
  const overrides: TextStyle = { fontSize: round1(flat.fontSize * factor) }
  if (typeof flat.lineHeight === 'number') overrides.lineHeight = round1(flat.lineHeight * factor)
  if (typeof flat.letterSpacing === 'number') overrides.letterSpacing = round1(flat.letterSpacing * factor)
  return overrides
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && npx vitest run tests/unit/font-scale.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/font-scale.ts tests/unit/font-scale.test.ts
git commit -m "feat(settings): lib pura de la escala de texto propia — 4 niveles y overrides de estilo"
```

---

### Task 2: `FontScaleProvider`

> **Corrección aplicada (revisión adversaria):** este task nació como
> «FontScaleProvider + kill de Dynamic Type en iOS» y el kill se cayó. La app
> tiene la Nueva Arquitectura prendida (`app.config.ts` → `newArchEnabled:
> true`) y bajo Fabric el multiplicador de fuente sale de
> `RCTFontSizeMultiplier()` (React/Base/RCTUtils.mm), una tabla estática sobre
> `preferredContentSizeCategory` que nunca consulta a RCTAccessibilityManager
> — en RN 0.81.5 no hay una sola referencia al módulo en `React/Fabric` ni en
> `ReactCommon`. `setAccessibilityContentSizeMultipliers` solo lograba que
> `PixelRatio.getFontScale()` y `Dimensions.get('window').fontScale`
> devolvieran 1 mientras el texto se seguía dibujando a la escala del OS.
> El bloque `neutralizeIosDynamicType` del snippet de abajo NO va: el archivo
> lleva en su lugar el comentario que documenta el porqué. La contraparte iOS
> del plugin de Android (Task 8) sería un override nativo de la categoría de
> contenido y queda como trabajo aparte, no hecho.

**Files:**
- Create: `mobile/features/preferences/font-scale-provider.tsx`
- Modify: `mobile/providers/app-providers.tsx` (import + envolver dentro de `<LanguageProvider>`)

**Interfaces:**
- Consumes: `FONT_SCALE_FACTORS`, `isFontScalePreference`, `FontScalePreference` de `@/lib/font-scale`; `getPersistentValue`/`setPersistentValue` de `@/lib/persistent-kv`.
- Produces: `FontScaleProvider` (PropsWithChildren), `useFontScale(): { preference, factor, setPreference }` (throwing, para Settings), `useFontScaleFactor(): number` (NO throwing, default 1 — para el wrapper y componentes animados; un Text montado fuera del provider no puede crashear la app).

- [ ] **Step 1: Write the provider**

Espejo de `mobile/features/preferences/language-provider.tsx` (mismo patrón: default + hidratación async + persistencia en el setter):

```tsx
// mobile/features/preferences/font-scale-provider.tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { NativeModules, Platform } from 'react-native'
import {
  FONT_SCALE_FACTORS,
  isFontScalePreference,
  type FontScalePreference,
} from '@/lib/font-scale'
import { getPersistentValue, setPersistentValue } from '@/lib/persistent-kv'

const FONT_SCALE_PREFERENCE_KEY = 'manifiesto.font-scale-preference'

interface FontScaleContextValue {
  /** Lo que el usuario eligió en Settings. Default 'md' (= diseño actual). */
  preference: FontScalePreference
  /** Factor resuelto (0.9 · 1 · 1.1 · 1.2). */
  factor: number
  setPreference: (value: FontScalePreference) => void
}

const FontScaleContext = createContext<FontScaleContextValue | null>(null)

/**
 * iOS: pisa el multiplicador de Dynamic Type mapeando TODAS las
 * categorías del OS a 1.0. Cubre el texto que rendericen libs de
 * terceros fuera del wrapper de app-text (el texto propio ya viaja con
 * allowFontScaling=false). `RCTAccessibilityManager` es un módulo
 * legacy accesible vía interop bridgeless en RN 0.81; si el interop no
 * lo expone, el guard evita el crash y el wrapper sigue cubriendo el
 * 100% del texto propio.
 */
function neutralizeIosDynamicType(): void {
  if (Platform.OS !== 'ios') return
  try {
    NativeModules?.AccessibilityManager?.setAccessibilityContentSizeMultipliers?.({
      extraSmall: 1,
      small: 1,
      medium: 1,
      large: 1,
      extraLarge: 1,
      extraExtraLarge: 1,
      extraExtraExtraLarge: 1,
      accessibilityMedium: 1,
      accessibilityLarge: 1,
      accessibilityExtraLarge: 1,
      accessibilityExtraExtraLarge: 1,
      accessibilityExtraExtraExtraLarge: 1,
    })
  } catch {
    // Sin módulo (interop apagado): el wrapper cubre el texto propio.
  }
}

/**
 * Escala de texto propia de la app — espejo de `language-provider`.
 * El tamaño del texto responde SOLO a esta preferencia, nunca al
 * fontScale del OS. Ver spec 2026-08-14-font-scale-app-design.md.
 */
export function FontScaleProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<FontScalePreference>('md')

  useEffect(() => {
    neutralizeIosDynamicType()
  }, [])

  // Hidratar la preferencia guardada (async, settle tras el primer render —
  // mismo trade-off aceptado que tema e idioma).
  useEffect(() => {
    let isMounted = true
    void (async () => {
      const stored = await getPersistentValue(FONT_SCALE_PREFERENCE_KEY)
      if (!isMounted) return
      if (isFontScalePreference(stored)) {
        setPreferenceState(stored)
      }
    })()
    return () => {
      isMounted = false
    }
  }, [])

  const setPreference = useCallback((next: FontScalePreference) => {
    setPreferenceState(next)
    void setPersistentValue(FONT_SCALE_PREFERENCE_KEY, next)
  }, [])

  const value = useMemo<FontScaleContextValue>(
    () => ({ preference, factor: FONT_SCALE_FACTORS[preference], setPreference }),
    [preference, setPreference],
  )

  return <FontScaleContext.Provider value={value}>{children}</FontScaleContext.Provider>
}

export function useFontScale(): FontScaleContextValue {
  const value = useContext(FontScaleContext)
  if (!value) {
    throw new Error('useFontScale must be used within FontScaleProvider.')
  }
  return value
}

/**
 * Solo el factor, SIN throw: el wrapper de Text es el primitivo más
 * caliente de la app y un Text montado fuera del provider (overlay
 * exótico, error boundary raíz) debe renderizar a escala 1, no crashear.
 */
export function useFontScaleFactor(): number {
  return useContext(FontScaleContext)?.factor ?? 1
}
```

- [ ] **Step 2: Mount in app-providers**

En `mobile/providers/app-providers.tsx`: agregar el import y envolver inmediatamente adentro de `<LanguageProvider>` (así cubre auth, onboarding y paywall igual que idioma):

```tsx
import { FontScaleProvider } from '@/features/preferences/font-scale-provider'
```

```tsx
<LanguageProvider>
{/* FontScaleProvider: escala de texto propia de la app (4 niveles,
    persistida). También neutraliza Dynamic Type en iOS al montar:
    el tamaño del texto responde SOLO a la config de la app. */}
<FontScaleProvider>
<MotionPreferenceProvider>
```

y el cierre correspondiente `</FontScaleProvider>` entre `</MotionPreferenceProvider>` y `</LanguageProvider>` (mismo estilo de indentación plana que usan los providers existentes en ese archivo).

- [ ] **Step 3: Typecheck**

Run: `source ~/.nvm/nvm.sh && npm run typecheck`
Expected: PASS (sin errores nuevos — no hay renderer en vitest, el ciclo de test de este task es tsc).

- [ ] **Step 4: Commit**

```bash
git add mobile/features/preferences/font-scale-provider.tsx mobile/providers/app-providers.tsx
git commit -m "feat(settings): FontScaleProvider — preferencia persistida + neutralización de Dynamic Type en iOS"
```

---

### Task 3: Wrapper drop-in `app-text.tsx`

**Files:**
- Create: `mobile/components/ui/app-text.tsx`

**Interfaces:**
- Consumes: `useFontScaleFactor()` (Task 2), `scaledTextOverrides` (Task 1).
- Produces: `Text` (misma API que RN `Text`, ref al nativo) y `TextInput` (misma API que RN `TextInput`, ref al nativo). Contrato: (1) SIEMPRE manda `allowFontScaling={false}` al nativo; (2) `allowFontScaling={false}` explícito del consumidor = pineado, tampoco escala con la app; (3) solo escala styles que declaran `fontSize`; (4) factor 1 = passthrough.

- [ ] **Step 1: Write the wrapper**

```tsx
// mobile/components/ui/app-text.tsx
import { forwardRef, type ComponentRef } from 'react'
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native'
import { useFontScaleFactor } from '@/features/preferences/font-scale-provider'
import { scaledTextOverrides } from '@/lib/font-scale'

/**
 * Text/TextInput de la app — reemplazo drop-in de los de react-native.
 *
 * 1. SIEMPRE apaga `allowFontScaling`: el fontScale del OS rompía la UI
 *    y quedó fuera de juego (spec 2026-08-14-font-scale-app-design.md).
 * 2. Aplica la escala elegida en Settings multiplicando fontSize /
 *    lineHeight / letterSpacing del style.
 * 3. `allowFontScaling={false}` explícito del consumidor = PINEADO:
 *    tampoco escala con la app. Respeta la curación existente (emojis,
 *    badges, chips que se rompen al escalar).
 * 4. Solo escala styles con `fontSize` declarado: un Text anidado sin
 *    fontSize hereda del padre ya escalado.
 *
 * Con factor 1 (default) es passthrough puro. La regla ESLint
 * no-restricted-imports fuerza que todo el código nuevo pase por acá.
 */
export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function AppText(props, ref) {
  const factor = useFontScaleFactor()
  const { allowFontScaling, style, ...rest } = props
  const pinned = allowFontScaling === false
  const overrides = pinned ? null : scaledTextOverrides(style, factor)
  return (
    <RNText
      ref={ref}
      {...rest}
      allowFontScaling={false}
      style={overrides ? [style, overrides] : style}
    />
  )
})

export const TextInput = forwardRef<ComponentRef<typeof RNTextInput>, TextInputProps>(
  function AppTextInput(props, ref) {
    const factor = useFontScaleFactor()
    const { allowFontScaling, style, ...rest } = props
    const pinned = allowFontScaling === false
    const overrides = pinned ? null : scaledTextOverrides(style, factor)
    return (
      <RNTextInput
        ref={ref}
        {...rest}
        allowFontScaling={false}
        style={overrides ? [style, overrides] : style}
      />
    )
  },
)
```

Notas para el implementador:
- Este archivo NO necesita eslint-disable: la Task 7 lo exime con un override de config (regla `off` para `app-text.tsx`).
- `maxFontSizeMultiplier` / `minimumFontScale` llegan por `...rest` y quedan inocuos con el escalado nativo apagado. NO limpiarlos acá ni en la barrida.

- [ ] **Step 2: Typecheck**

Run: `source ~/.nvm/nvm.sh && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ui/app-text.tsx
git commit -m "feat(ui): wrapper Text/TextInput con escala propia y allowFontScaling apagado"
```

---

### Task 4: Codemod — barrida de `Text` (≈256 archivos)

**Files:**
- Create (temporal, en el scratchpad de la sesión, NO en el repo): `codemod-app-text.mjs`
- Modify: ~256 archivos bajo `mobile/` y `app/` que importan `Text` de react-native.

**Interfaces:**
- Consumes: `Text` de `@/components/ui/app-text` (Task 3).
- Produces: cero imports de valor de `Text` desde `'react-native'` fuera de `app-text.tsx` (los `import type` y `TextStyle`/`TextProps` quedan como están).

- [ ] **Step 0: Snapshot del WIP ajeno (para no commitearlo)**

```bash
git status --porcelain | grep -E '^( M|MM)' | awk '{print $2}' | sort > /tmp/wip-before.txt
wc -l < /tmp/wip-before.txt
```
Guardar esa lista: son los archivos del owner que este plan NO puede commitear. Ver «WIP del branch» en Global Constraints — el codemod corre sobre todo el árbol igual.

- [ ] **Step 1: Write the codemod script** (en el scratchpad de la sesión)

```js
// codemod-app-text.mjs — swap de `Text` de react-native al wrapper.
// Reglas: toca SOLO el primer import de valor `import { ... } from 'react-native'`
// (no matchea `import type {`); identifica `Text` por token exacto (no toca
// TextStyle/TextProps/TextInput); inserta el import del wrapper en el mismo
// lugar. Verificado: no existen alias `Text as X` en el repo.
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const WRAPPER_IMPORT = "import { Text } from '@/components/ui/app-text'"
const SKIP = new Set(['mobile/components/ui/app-text.tsx'])

const files = execSync(
  `grep -rl "from 'react-native'" mobile app --include='*.tsx' --include='*.ts'`,
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean)

let touched = 0
for (const file of files) {
  if (SKIP.has(file)) continue
  const src = fs.readFileSync(file, 'utf8')
  const m = /import\s*\{([^}]*)\}\s*from\s*'react-native'/.exec(src)
  if (!m) continue
  const names = m[1].split(',').map((s) => s.trim()).filter(Boolean)
  if (!names.includes('Text')) continue
  const kept = names.filter((n) => n !== 'Text')
  let replacement
  if (kept.length === 0) {
    replacement = WRAPPER_IMPORT
  } else {
    const rnImport = m[0].includes('\n')
      ? `import {\n  ${kept.join(',\n  ')},\n} from 'react-native'`
      : `import { ${kept.join(', ')} } from 'react-native'`
    replacement = `${rnImport}\n${WRAPPER_IMPORT}`
  }
  fs.writeFileSync(
    file,
    src.slice(0, m.index) + replacement + src.slice(m.index + m[0].length),
  )
  touched += 1
}
console.log(`touched ${touched} files`)
```

- [ ] **Step 2: Run codemod**

Run: `source ~/.nvm/nvm.sh && node <scratchpad>/codemod-app-text.mjs` (desde la raíz del repo)
Expected: `touched ~256 files` (el número exacto puede variar unos pocos por el WIP recién commiteado).

- [ ] **Step 3: Verify — cero imports de valor restantes + typecheck**

Re-correr el codemod (es idempotente y es la verificación más robusta — los greps con `\b`/`\s` no son portables en el grep BSD de macOS):

Run: `source ~/.nvm/nvm.sh && node <scratchpad>/codemod-app-text.mjs`
Expected: `touched 0 files`.

Run: `source ~/.nvm/nvm.sh && npm run typecheck`
Expected: PASS. Si aparecen errores: casos borde del regex (p. ej. dos imports de valor de react-native en un archivo) — arreglar a mano ese archivo, NO complejizar el script.

Casos especiales conocidos que el codemod deja bien y NO hay que "arreglar":
- `mobile/components/wrapped/wrapped-primitives.tsx` (línea ~91): su Text local pasa `allowFontScaling={false}` al wrapper → queda pineado, mismo comportamiento que hoy. Correcto.
- Archivos con `Animated.createAnimatedComponent(Text)`: después del swap estarían animando el wrapper (function component sin host ref directa para animated props). Revisarlos en el Step 4: si el archivo hace `createAnimatedComponent(Text)`, revertir SOLO ese import a react-native con su `eslint-disable-next-line` (ver Task 6, que los trata uno a uno).

- [ ] **Step 4: Detect createAnimatedComponent(Text) sites**

```bash
grep -rln "createAnimatedComponent(Text)" mobile app --include='*.tsx'
```
Para cada archivo listado: restaurar `Text` al import de react-native (además del wrapper si el archivo también renderiza `<Text>` plano) y anotar:

```tsx
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- createAnimatedComponent necesita el componente nativo crudo; la escala se aplica a mano (Task 6 del plan font-scale)
```

- [ ] **Step 5: Sanity run del bundle**

Run: `source ~/.nvm/nvm.sh && npx expo export --platform ios --output-dir /tmp/font-scale-bundle-check 2>&1 | tail -5`
Expected: bundle OK (validate no es bundle — regla del repo). Borrar `/tmp/font-scale-bundle-check` después.

- [ ] **Step 6: Commit — solo los archivos que NO son del WIP ajeno**

```bash
git status --porcelain | grep -E '^( M|MM)' | awk '{print $2}' | sort > /tmp/wip-after.txt
comm -13 /tmp/wip-before.txt /tmp/wip-after.txt > /tmp/codemod-only.txt
wc -l < /tmp/codemod-only.txt   # esperado: ~246
xargs git add < /tmp/codemod-only.txt
git commit -m "refactor(ui): barrida de Text al wrapper de app-text — la escala del texto pasa a ser de la app"
```

Verificar que NADA del WIP quedó staged: `git diff --cached --name-only | sort | comm -12 - /tmp/wip-before.txt` debe salir vacío ANTES del commit. Los 10 archivos colisionados quedan modificados en el árbol a propósito (Global Constraints).

---

### Task 5: `TextInput` al wrapper (16 archivos, manual)

**Files:**
- Modify: los archivos que lista `grep -rln "import {[^}]*TextInput" mobile app --include='*.tsx' | xargs grep -ln "from 'react-native'"` (~16; incluye `mobile/components/ui/text-field.tsx`, `neo-text-field.tsx`, `numeric-edit-sheet.tsx`, `numpad-field.tsx`, `password-field.tsx`, `mobile/components/control-v2/neo-field.tsx`, `mobile/components/home/animated/count-up-text.tsx`).

**Interfaces:**
- Consumes: `TextInput` de `@/components/ui/app-text` (Task 3).
- Produces: cero imports de VALOR de `TextInput` desde react-native fuera de `app-text.tsx` y de los sitios `createAnimatedComponent` anotados.

- [ ] **Step 1: Swap manual por archivo**

Receta (a mano, son ~16 — el codemod no distingue uso-como-tipo de uso-como-valor):

1. Si el archivo usa `TextInput` SOLO como componente JSX: sacar `TextInput` del import de react-native y agregar `import { TextInput } from '@/components/ui/app-text'`.
2. Si además lo usa como TIPO de instancia (`useRef<TextInput>`, params): agregar `import type { TextInput as RNTextInput } from 'react-native'` y renombrar esos usos de tipo a `RNTextInput`. El ref sigue siendo del nativo (el wrapper forwardea), así que el tipo es correcto.
3. Si el archivo hace `Animated.createAnimatedComponent(TextInput)` (hoy solo `count-up-text.tsx`): dejar el import de react-native con `eslint-disable-next-line` y el mismo comentario del Task 4 Step 4. Se escala a mano en la Task 6.

Ejemplo trabajado — `mobile/components/ui/text-field.tsx` (usa ambos: componente y tipo):

```tsx
// antes
import { TextInput, View, ... } from 'react-native'
...
const inputRef = useRef<TextInput>(null)

// después
import { View, ... } from 'react-native'
import type { TextInput as RNTextInput } from 'react-native'
import { TextInput } from '@/components/ui/app-text'
...
const inputRef = useRef<RNTextInput>(null)
```

Nota: la mayoría de estos campos ya pasan `allowFontScaling={false}` → quedan pineados (el texto tipeado no escala con la app). Decisión del spec: se respeta la curación; revisable campo a campo después.

- [ ] **Step 2: Verify + typecheck**

```bash
grep -rnw "TextInput" mobile app --include='*.tsx' | grep "from 'react-native'" | grep -v "app-text.tsx" | grep -v "import type"
```
Expected: solo los sitios `createAnimatedComponent` anotados con eslint-disable (las líneas de import multilínea no las caza este grep — la verificación autoritativa es el lint de la Task 7).

Run: `source ~/.nvm/nvm.sh && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit — paths explícitos de los archivos tocados**

```bash
git add <cada archivo que tocaste, listado a mano>
git commit -m "refactor(ui): TextInput al wrapper de app-text — campos pineados conservan su curación"
```
Si alguno de los archivos tocados está en `/tmp/wip-before.txt`, NO lo agregues: queda en el árbol y viaja con el commit del owner (anotarlo en el body del commit).

---

### Task 6: Texto animado — escala manual con `useFontScaleFactor()`

**Files:**
- Modify: los archivos de `grep -rln "Animated.Text\|createAnimatedComponent(Text" mobile app --include='*.tsx'` (~20; los centrales: `mobile/components/home/animated/count-up-text.tsx`, `mobile/components/home/amount-card.tsx`, `mobile/components/redesign/home/home-screen.tsx`, `mobile/components/redesign/gastos/gastos-screen.tsx`).

**Interfaces:**
- Consumes: `useFontScaleFactor()` (Task 2).
- Produces: los contadores/números animados legibles escalan con la preferencia; lo decorativo/pineado queda fijo.

- [ ] **Step 1: Sweep con regla de decisión**

Para CADA usage de `Animated.Text` (Reanimated) o `createAnimatedComponent(Text|TextInput)`:

- **¿Está pineado hoy** (`allowFontScaling={false}` en el elemento o en el wrapper local que lo monta)? → dejar como está. Ya quedó desacoplado del OS por el kill nativo (Tasks 2 y 7); pineado es pineado.
- **¿Es texto legible que HOY escalaba con el OS** (sin `allowFontScaling={false}`)? → aplicar la escala a mano: `const factor = useFontScaleFactor()` y multiplicar el `fontSize`/`lineHeight` numérico que el componente compone en su style (en JS, fuera del worklet — los worklets no llaman funciones JS no-worklet; el factor entra como número ya resuelto, igual que hoy entra el fontSize).

Ejemplo trabajado — `count-up-text.tsx` (AnimatedTextInput, línea ~156): el componente resuelve su `fontSize` por largo del string final (trampa de ancho conocida). Multiplicar ESE número resuelto:

```tsx
const factor = useFontScaleFactor()
// donde hoy se calcula el fontSize final por largo del string:
const scaledFontSize = Math.round(resolvedFontSize * factor * 10) / 10
```
y usar `scaledFontSize` (y su `lineHeight` proporcional si el componente lo fija) en el style que ya compone. El `format` worklet no se toca.

- [ ] **Step 2: Registrar decisiones**

Dejar en el mensaje de commit (body) la lista `archivo → escala | pineado` de cada sitio tocado o deliberadamente dejado, para el QA en device.

- [ ] **Step 3: Typecheck + tests**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npx vitest run`
Expected: PASS (contra el baseline conocido del branch).

- [ ] **Step 4: Commit — paths explícitos de los archivos tocados**

```bash
git add <cada archivo que tocaste, listado a mano>
git commit -m "feat(ui): escala propia en texto animado — contadores legibles escalan, decorativos quedan pineados"
```
Si alguno está en `/tmp/wip-before.txt` (p. ej. `count-up-text.tsx`, `home-screen.tsx`), NO lo agregues: queda en el árbol y viaja con el commit del owner. Anotarlo en el body.

---

### Task 7: Guardia ESLint

**Files:**
- Modify: `eslint.config.js`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `@typescript-eslint/no-restricted-imports` vetando `Text`/`TextInput` de valor desde react-native app-wide (type imports permitidos); `app-text.tsx` exento.

- [ ] **Step 1: Add the rule**

En `eslint.config.js` (flat config con `tseslint`), en el bloque de reglas que aplica a `app`/`mobile` agregar:

```js
'@typescript-eslint/no-restricted-imports': [
  'error',
  {
    paths: [
      {
        name: 'react-native',
        importNames: ['Text', 'TextInput'],
        allowTypeImports: true,
        message:
          'Usá Text/TextInput de @/components/ui/app-text: escalan con la preferencia de la app y apagan el fontScale del OS. Excepción única: createAnimatedComponent necesita el nativo crudo (eslint-disable con justificación + escala manual vía useFontScaleFactor).',
      },
    ],
  },
],
```

y un bloque de override que exima al wrapper:

```js
{
  files: ['mobile/components/ui/app-text.tsx'],
  rules: { '@typescript-eslint/no-restricted-imports': 'off' },
},
```

Si el config no tiene registrado el plugin bajo ese namespace en el bloque donde cae la regla, registrarlo: `plugins: { '@typescript-eslint': tseslint.plugin }`.

- [ ] **Step 2: Run lint**

Run: `source ~/.nvm/nvm.sh && npm run lint`
Expected: PASS — los únicos imports crudos restantes son los `eslint-disable-next-line` justificados de las Tasks 4–6. Si aparece un archivo olvidado, migrarlo al wrapper (no agregarlo a la allowlist).

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(lint): prohibir Text/TextInput crudos de react-native — todo pasa por app-text"
```

---

### Task 8: Config plugin Android — `fontScale = 1`

**Files:**
- Create: `plugins/with-fixed-font-scale.cjs`
- Modify: `app.config.ts` (registrar el plugin en el array `plugins`)

**Interfaces:**
- Consumes: nada del código de la app.
- Produces: MainActivity con `attachBaseContext` que fija `configuration.fontScale = 1f` en cada prebuild (android/ es gitignored — prebuild continuo, igual que `with-android-backup-rules`).

- [ ] **Step 1: Write the plugin**

```js
// @ts-check
/**
 * Expo config plugin: fija configuration.fontScale = 1 en MainActivity.
 *
 * El fontScale del OS rompía la UI; el tamaño del texto lo gobierna la
 * preferencia in-app (font-scale-provider). Cubre también el texto de
 * libs de terceros que no pasa por el wrapper de app-text (en iOS ese
 * respaldo no existe: ver la corrección de la Task 2).
 * Ver docs/superpowers/specs/2026-08-14-font-scale-app-design.md.
 *
 * android/ es gitignored (prebuild continuo): sin este plugin el
 * override se borraría en cada regeneración. CommonJS .cjs por la misma
 * razón que with-android-backup-rules (el resolver de Expo usa require
 * pelado y package.json declara "type": "module").
 */
const { withMainActivity } = require('@expo/config-plugins')

const OVERRIDE = `
  // Manifiesto: el fontScale del OS queda neutralizado; el tamaño del
  // texto lo gobierna la preferencia in-app (font-scale-provider).
  override fun attachBaseContext(newBase: android.content.Context) {
    val config = android.content.res.Configuration(newBase.resources.configuration)
    config.fontScale = 1f
    super.attachBaseContext(newBase.createConfigurationContext(config))
  }
`

/** @param {import('@expo/config-plugins').ExportedConfig} config */
function withFixedFontScale(config) {
  return withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') {
      throw new Error('with-fixed-font-scale: MainActivity no es Kotlin — revisar template de Expo')
    }
    const src = mod.modResults.contents
    if (!src.includes('config.fontScale = 1f')) {
      const anchor = 'class MainActivity : ReactActivity() {'
      if (!src.includes(anchor)) {
        throw new Error('with-fixed-font-scale: no encontré el anchor de MainActivity — revisar template de Expo')
      }
      mod.modResults.contents = src.replace(anchor, `${anchor}\n${OVERRIDE}`)
    }
    return mod
  })
}

module.exports = withFixedFontScale
```

(Los tipos Android van fully-qualified adentro del override para no editar la lista de imports del template — un anchor menos que se puede romper.)

- [ ] **Step 2: Register in app.config.ts**

En el array `plugins` (línea ~67), junto a los otros plugins locales:

```ts
'./plugins/with-fixed-font-scale.cjs',
```

- [ ] **Step 3: Verify via prebuild**

Run: `source ~/.nvm/nvm.sh && npx expo prebuild --platform android --no-install 2>&1 | tail -3 && grep -n "fontScale" android/app/src/main/java/com/manifiesto/mobile/MainActivity.kt`
Expected: prebuild OK y el grep muestra `config.fontScale = 1f` dentro de `attachBaseContext`.

- [ ] **Step 4: Commit**

```bash
git add plugins/with-fixed-font-scale.cjs app.config.ts
git commit -m "feat(android): config plugin que fija fontScale=1 — el texto responde solo a la config de la app"
```

---

### Task 9: Settings UI + copy es/en

**Files:**
- Modify: `mobile/screens/settings/settings-screen.tsx` (hook + grupo nuevo tras el bloque 9b de Idioma, línea ~1415)
- Modify: `mobile/lib/i18n/locales/es/settings.json`, `mobile/lib/i18n/locales/en/settings.json`

**Interfaces:**
- Consumes: `useFontScale()` (Task 2), `SettingsGroup`/`SegmentedControl`/`RiseView` ya importados en el screen.
- Produces: grupo «Tamaño del texto» con 4 segmentos, cambio en vivo (la propia pantalla es el preview).

- [ ] **Step 1: Copy en locales**

`es/settings.json` — agregar al nivel raíz, junto a `language`:

```json
"fontSize": {
  "groupTitle": "Tamaño del texto",
  "footer": "El tamaño del texto lo controla la app, no el ajuste del teléfono.",
  "sm": "Chica",
  "md": "Normal",
  "lg": "Grande",
  "xl": "Muy grande"
}
```

`en/settings.json` — misma estructura:

```json
"fontSize": {
  "groupTitle": "Text size",
  "footer": "Text size is controlled by the app, not by your phone's setting.",
  "sm": "Small",
  "md": "Default",
  "lg": "Large",
  "xl": "Extra large"
}
```

- [ ] **Step 2: Wire the screen**

En `settings-screen.tsx`, junto a los otros hooks de preferencias (línea ~137):

```tsx
import { useFontScale } from '@/features/preferences/font-scale-provider'
```

```tsx
const { preference: fontScalePreference, setPreference: setFontScalePreference } = useFontScale()
```

Después del cierre del bloque 9b (Idioma, `</RiseView>` línea ~1415), nuevo grupo:

```tsx
{/* 9c. TAMAÑO DEL TEXTO — escala propia de la app, desacoplada del
    fontScale del OS (el escalado nativo rompía la UI). Sin opción
    «Sistema» a propósito: el texto responde SOLO a esta preferencia.
    Ver spec 2026-08-14-font-scale-app-design.md. */}
<RiseView delay={420}>
  <SettingsGroup
    footer={t('settings:fontSize.footer')}
    title={t('settings:fontSize.groupTitle')}
  >
    <View style={styles.appearanceInner}>
      <SegmentedControl
        onChange={setFontScalePreference}
        options={[
          { label: t('settings:fontSize.sm'), value: 'sm' },
          { label: t('settings:fontSize.md'), value: 'md' },
          { label: t('settings:fontSize.lg'), value: 'lg' },
          { label: t('settings:fontSize.xl'), value: 'xl' },
        ]}
        skin="neo"
        value={fontScalePreference}
      />
    </View>
  </SettingsGroup>
</RiseView>
```

- [ ] **Step 3: Run suite + guards**

Run: `source ~/.nvm/nvm.sh && npx vitest run && npm run guard:i18n-keys && npm run guard:i18n-quality && npm run guard:i18n-hardcoded`
Expected: PASS contra baseline — es cambio de copy, la regla del repo exige la suite (tsc/bundle no cazan copy).

- [ ] **Step 4: Commit**

```bash
git add mobile/screens/settings/settings-screen.tsx mobile/lib/i18n/locales/es/settings.json mobile/lib/i18n/locales/en/settings.json
git commit -m "feat(settings): selector de tamaño del texto — 4 niveles con cambio en vivo"
```

---

### Task 10: Doc del sistema + gates finales

**Files:**
- Create: `docs/sistemas/font-scale.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: doc del sistema en sync con el código (regla del repo: docs en el mismo cuerpo de trabajo) + verificación completa.

- [ ] **Step 1: Write the system doc**

```markdown
# Escala de texto propia de la app

El tamaño del texto responde SOLO a la preferencia in-app (Settings →
Tamaño del texto: Chica 0.9 · Normal 1.0 · Grande 1.1 · Muy grande 1.2),
nunca al fontScale del OS. Spec: docs/superpowers/specs/2026-08-14-font-scale-app-design.md.

## Piezas

- `mobile/lib/font-scale.ts` — tipos, factores, `scaledTextOverrides`
  (pura, con tests en tests/unit/font-scale.test.ts).
- `mobile/features/preferences/font-scale-provider.tsx` — preferencia
  persistida (`manifiesto.font-scale-preference`; sin `:`, que
  expo-secure-store rechaza). Sin kill nativo en iOS: bajo la Nueva
  Arquitectura el multiplicador sale de `RCTFontSizeMultiplier()` y
  `setAccessibilityContentSizeMultipliers` no lo toca (detalle en el
  comentario del archivo).
- `mobile/components/ui/app-text.tsx` — Text/TextInput drop-in: fuerza
  `allowFontScaling={false}` al nativo y aplica la escala in-app.
  `allowFontScaling={false}` del consumidor = pineado (tampoco escala
  con la app). Solo escala styles con `fontSize` declarado.
- `plugins/with-fixed-font-scale.cjs` — Android: `fontScale = 1f` en
  MainActivity vía prebuild (android/ es gitignored).
- ESLint `@typescript-eslint/no-restricted-imports` — prohíbe Text/
  TextInput crudos de react-native; excepción única documentada:
  `createAnimatedComponent` (escala manual vía `useFontScaleFactor()`).

## Reglas para código nuevo

- Texto nuevo: importar Text/TextInput de `@/components/ui/app-text`.
- Emojis/badges/chips que se rompen al escalar: `allowFontScaling={false}`
  (pineado para el OS Y para la app).
- Texto animado (`Animated.Text`, `createAnimatedComponent`): multiplicar
  el fontSize resuelto por `useFontScaleFactor()` fuera del worklet.
- Los gates viejos tipo `PixelRatio.getFontScale() === 1` son siempre-true
  ahora: no escribir gates nuevos sobre el fontScale del OS.
```

- [ ] **Step 2: Full gates**

Run: `source ~/.nvm/nvm.sh && npm run validate`
Expected: mismo resultado que el baseline del branch (la falla pre-existente de `guard:motion-tokens` NO es de este trabajo; ninguna falla nueva).

Run: `source ~/.nvm/nvm.sh && npx expo export --platform ios --output-dir /tmp/font-scale-bundle-final 2>&1 | tail -3 && rm -rf /tmp/font-scale-bundle-final`
Expected: bundle OK.

- [ ] **Step 3: Commit**

```bash
git add docs/sistemas/font-scale.md
git commit -m "docs(sistemas): escala de texto propia de la app — piezas y reglas para código nuevo"
```

- [ ] **Step 4: Checklist de QA en device (owner, fuera del plan)**

En device físico (dev client, nunca Expo Go):
1. Settings → cambiar entre los 4 niveles → toda la pantalla cambia en vivo.
2. Con el font size del TELÉFONO al máximo (iOS Dynamic Type / Android): la app NO cambia en ninguna pantalla (incluido texto de libs).
3. A «Muy grande» (1.2): Home (hero + contador fluido), Gastos (badges, calendario, filas), tab bar, wizard de alta, Jardín/Logros, Settings — sin recortes ni desbordes.
4. Matar y reabrir la app con «Muy grande»: la preferencia persiste (settle async con salto de fuente en el primer frame, mismo trade-off aceptado que tema/idioma).
5. Android viejo (gama baja de QA): pasada rápida de los mismos puntos.
```
