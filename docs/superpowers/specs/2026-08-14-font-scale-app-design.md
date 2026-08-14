# Tamaño de texto propio de la app — diseño

**Fecha:** 2026-08-14 · **Estado:** aprobado por el owner

## Objetivo

Agregar en Settings un selector de tamaño de fuente propio de la app (como los
de tema e idioma) y desacoplar TODO el texto del escalado nativo del teléfono.
El escalado del OS (Dynamic Type / fontScale de Android) rompe drásticamente la
UI; a partir de esto el tamaño de fuente responde **solo** a la configuración
de la app.

**Principio rector (pedido explícito del owner):** toda la app depende de
NUESTRA config, nunca del OS. No existe opción «Sistema» en este selector.

## Decisiones de producto

- **4 niveles:** Chica · Normal · Grande · Muy grande.
- **Factores:** 0.9 · 1.0 · 1.1 · 1.2. Default: Normal (1.0) = el diseño
  actual tal cual. 1.2 es el tope deliberado: los comentarios del código
  marcan roturas de chips/badges/calendario cerca de 130%+.
- **Local al dispositivo**, sin sync a backend (las push no tienen tamaño de
  fuente; a diferencia de `preferred_language` el servidor no lo necesita).
- Ubicación en Settings: grupo nuevo «Tamaño del texto» entre Idioma y
  Animaciones.

## Arquitectura

### 1. Lógica pura (sin React)

Módulo nuevo `mobile/lib/font-scale.ts`:

- Tipo `FontScalePreference = 'sm' | 'md' | 'lg' | 'xl'` + mapa de factores
  `{ sm: 0.9, md: 1, lg: 1.1, xl: 1.2 }`.
- Type guard `isFontScalePreference` (patrón de `isLanguagePreference`).
- `scaleTextStyle(style, factor)`: función pura que aplana el style y
  multiplica `fontSize`, `lineHeight` y `letterSpacing`. Testeable en vitest
  (env node, sin renderer — restricción conocida del proyecto).

### 2. Provider

`mobile/features/preferences/font-scale-provider.tsx`, espejo exacto de
`language-provider`:

- Estado `preference` (default `'md'`), factor resuelto derivado.
- Persistencia en `persistent-kv` con key `manifiesto.font-scale-preference`,
  hidratación async al montar. La key va con punto y no con dos puntos:
  expo-secure-store solo acepta `/^[\w.-]+$/` y `persistent-kv` se traga en
  silencio el error de las claves inválidas.
- Hooks: `useFontScale()` (preferencia + setter) y `useFontScaleFactor()`
  (solo el factor, para componentes especiales).
- Montado en el root junto a Theme/Language providers → aplica también a
  auth, onboarding y paywall.

### 3. Wrapper de Text / TextInput

`mobile/components/ui/app-text.tsx` exporta `Text` (y el equivalente para
`TextInput`) con la **misma API** que react-native, para que la barrida sea
solo swap de import. Reglas:

1. Siempre manda `allowFontScaling={false}` al componente nativo → el OS
   queda fuera de juego.
2. Si el consumidor pasó `allowFontScaling={false}` explícito → **pineado**:
   tampoco escala con la app. Respeta la curación existente (~30 lugares:
   emojis, badges, chips, layouts fijos) que se pineó justamente porque
   escalar los rompe.
3. Si no → aplica `scaleTextStyle` con el factor del contexto.
4. **Solo escala styles que declaran `fontSize`.** Un Text anidado sin
   fontSize hereda del padre ya escalado; inyectarle el default 14 de RN
   rompería la herencia.
5. Fast path: con factor 1.0, passthrough total (solo fuerza
   `allowFontScaling={false}`) — costo cero en el default.

`maxFontSizeMultiplier` / `minimumFontScale` existentes quedan como props
inocuas (el escalado nativo está apagado); no se tocan en la barrida.

### 4. Barrida + guardia ESLint

- Codemod mecánico de los **256 archivos** que importan `Text` de
  react-native (y 16 de `TextInput`) → wrapper. Split del import cuando trae
  otras cosas de RN. Verificación con `tsc`.
- Regla ESLint que prohíbe importar `Text`/`TextInput` crudos de
  react-native (precedente: la regla del `useReducedMotion`). Allowlist: el
  propio wrapper y los casos animated documentados.

### 5. Texto animado (fuera del wrapper)

`Animated.Text` de Reanimated y `CountUpText` (TextInput animado) no pasan
por el wrapper: multiplican su `fontSize` a mano con `useFontScaleFactor()`,
con la misma semántica de pineado (los que hoy están `allowFontScaling=false`
quedan fijos). El sweep de estos casos se hace en la implementación; QA por
pantalla decide excepciones.

### 6. Kill nativo de respaldo (texto de terceros)

Cubre lo que rendericen libs fuera del wrapper:

- **Android:** config plugin local (patrón `plugins/android-backup-rules`)
  que fija `configuration.fontScale = 1` en MainActivity. Estático — nunca
  hay que recrear la Activity.
- **iOS: NO HAY kill de respaldo** (corregido durante la implementación). El
  diseño original llamaba a
  `AccessibilityManager.setAccessibilityContentSizeMultipliers` con todas las
  categorías en 1.0. El método existe y se ejecuta, pero es inerte sobre el
  texto con la Nueva Arquitectura prendida (`newArchEnabled: true`): bajo
  Fabric el multiplicador sale de `RCTFontSizeMultiplier()`
  (React/Base/RCTUtils.mm), una tabla estática sobre
  `preferredContentSizeCategory` que nunca consulta a RCTAccessibilityManager
  — en RN 0.81.5 no hay una sola referencia al módulo en `React/Fabric` ni en
  `ReactCommon`. Peor: sí cambia lo que RCTDeviceInfo reporta, así que
  `PixelRatio.getFontScale()` y `Dimensions.get('window').fontScale` pasan a
  mentir 1 mientras el texto se dibuja a la escala del OS. Se sacó del
  provider. La contraparte real del plugin de Android sería un override
  nativo de la categoría de contenido; queda pendiente y sin implementar.
  Consecuencia asumida: en iOS el texto de libs de terceros que no pasa por
  el wrapper sigue escalando con Dynamic Type.

Nota: `Text.defaultProps.allowFontScaling = false` NO es opción — React 19
ignora defaultProps en function components.

### 7. Settings UI

Grupo «Tamaño del texto» con `SettingsGroup` + `SegmentedControl` skin neo,
4 opciones (Chica / Normal / Grande / Muy grande), footer dinámico. Copy
es/en en los locales (correr la suite de tests: los cambios de copy la
requieren). Sin preview dedicado: el cambio es en vivo y la propia pantalla
de Settings es el preview.

## Testing y QA

- **Unit (vitest, env node):** `scaleTextStyle` (identidad referencial a
  factor 1; no toca styles sin fontSize; escala los tres campos; redondeos),
  type guard, mapa de factores.
- **Gates del repo:** `npm run validate` + suite completa +
  `npx expo export --platform ios` (validate no es bundle).
- **QA en device** a 120% sobre los puntos sensibles ya conocidos: hero del
  Home (contador fluido), badges/calendario de Gastos, tab bar, wizards de
  alta, Jardín/Logros.

## Riesgos asumidos

- Texto de libs de terceros no escala con la app: queda fijo a 100% (el kill
  nativo lo desacopla del OS). Aceptable — todo lo visible es custom.
- Arranque con escala guardada ≠ Normal: settle async con salto de fuente en
  el primer frame, igual que hoy tema e idioma.
- Gates existentes tipo `PixelRatio.getFontScale() === 1` quedan siempre-true
  (fósiles inocuos); se limpian o anotan en la barrida.
- Accesibilidad: ignorar Dynamic Type es una regresión para usuarios que
  dependen del escalado del OS; se mitiga con el nivel «Muy grande» in-app.
