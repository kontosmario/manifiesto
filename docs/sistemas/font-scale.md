# Escala de texto propia de la app

> Sistema: de dónde sale el tamaño del texto. Responde SOLO a la preferencia
> in-app (Ajustes → **Tamaño del texto**), nunca al `fontScale` del OS. Doc
> vivo — actualizar al tocar el wrapper, el provider, el plugin de Android o
> cualquiera de las dos guardias (ESLint y `guard:font-scale`).

Diseño y decisiones: [`docs/superpowers/specs/2026-08-14-font-scale-app-design.md`](../superpowers/specs/2026-08-14-font-scale-app-design.md).
Plan de implementación: [`docs/superpowers/plans/2026-08-14-font-scale-app.md`](../superpowers/plans/2026-08-14-font-scale-app.md).

Archivos clave:
- `mobile/lib/font-scale.ts` — lógica pura (tipos, factores, `scaledTextOverrides`). Tests en `tests/unit/font-scale.test.ts`.
- `mobile/features/preferences/font-scale-provider.tsx` — preferencia persistida + hooks.
- `mobile/components/ui/app-text.tsx` — `Text`, `AnimatedText` y `TextInput` drop-in.
- `plugins/with-fixed-font-scale.cjs` — kill nativo de Android (`fontScale = 1f`).
- `eslint.config.js` — guardia `@typescript-eslint/no-restricted-imports`.
- `scripts/guard-font-scale.mjs` — guardia de lo que ESLint no ve
  (`Animated.Text` crudo + el contrato del wrapper). `npm run guard:font-scale`.
- `mobile/screens/settings/settings-screen.tsx` (bloque 9c) + `mobile/lib/i18n/locales/{es,en}/settings.json` (`fontSize.*`).

---

## 1. El modelo

Cuatro niveles, un factor cada uno. Sin opción «Sistema» **a propósito**: el
escalado del OS rompía la UI y quedó fuera de juego.

| Nivel | Factor | es | en |
|---|---|---|---|
| `sm` | 0.9 | Chica | Small |
| `md` | **1.0** (default) | Normal | Default |
| `lg` | 1.1 | Grande | Large |
| `xl` | 1.2 | Máxima | Largest |

`md = 1.0` es el diseño actual tal cual: con factor 1 el wrapper es
passthrough puro (`scaledTextOverrides` devuelve `null` sin aplanar nada), así
que el default no paga nada. 1.2 es el tope deliberado — los comentarios del
código marcan roturas de chips/badges/calendario cerca de 130%.

La preferencia es **local al dispositivo** (no viaja al backend: las push no
tienen tamaño de fuente) y se persiste en `persistent-kv` con la key
`manifiesto.font-scale-preference`.

> **La key va con PUNTO, no con dos puntos.** `expo-secure-store` valida las
> claves contra `/^[\w.-]+$/` y tira `Invalid key provided to SecureStore` con
> cualquier otra; `persistent-kv` se traga esa excepción en silencio, así que
> una key con `:` nunca llegaría a persistir entre lanzamientos. Las keys de
> tema/idioma/motion sí usan `:` y arrastran ese bug: deuda pre-existente,
> fuera del alcance de este sistema.

Hidratación async al montar (settle después del primer render): arrancar con
una escala guardada ≠ Normal muestra un salto de fuente en el primer frame.
Es el mismo **patrón** de tema e idioma (default + settle async), pero **no el
mismo síntoma**: ellos, con la key rota, siempre hidratan al default y por eso
nunca saltan. Corolario para QA: la escala de texto es hoy la única
preferencia que sobrevive a matar la app (§9.5).

## 2. Las piezas

### `mobile/lib/font-scale.ts` (puro, testeable)

`FontScalePreference`, `FONT_SCALE_FACTORS`, `isFontScalePreference` y
`scaledTextOverrides(style, factor)`. Sin imports de runtime (solo
`import type` de react-native, que se borra al compilar) → corre en vitest
`env node`, que es el único entorno de test del repo (no hay renderer).

`scaledTextOverrides` aplana el style con la semántica de RN (arrays anidados,
el último gana, los falsy se ignoran) y devuelve **solo** las métricas
escaladas —`fontSize`, `lineHeight`, `letterSpacing`, redondeadas a 1
decimal— para componer como `[style, overrides]`. Devuelve `null` en dos
casos, y los dos importan:

- **factor 1** → fast path, ni aplana.
- **style sin `fontSize` declarado** → un `Text` anidado sin `fontSize` hereda
  del padre, que ya viene escalado. Inyectarle el default 14 de RN rompería
  esa herencia.

### `font-scale-provider.tsx`

Espejo de `language-provider`. Expone dos hooks:

- `useFontScale()` → `{ preference, factor, setPreference }`. **Tira** fuera
  del provider. Es el que usa Ajustes.
- `useFontScaleFactor()` → solo el número, **sin throw**, default 1. Es el que
  usa el wrapper: `Text` es el primitivo más caliente de la app y un texto
  montado por encima del provider (el `root-error-boundary`, por ejemplo) tiene
  que renderizar a escala 1, no crashear.

Montado en `mobile/providers/app-providers.tsx` justo adentro de
`<LanguageProvider>` → cubre también auth, onboarding y paywall.

### `app-text.tsx` — el wrapper

Reemplazo drop-in con la misma API que react-native. Exporta **tres**
componentes: `Text`, `TextInput` y `AnimatedText`. Contrato idéntico en los
tres:

1. Siempre manda `allowFontScaling={false}` al nativo → **este es el desacople
   real del OS para el texto propio**, en las dos plataformas.
2. Aplica la escala in-app multiplicando las métricas del style.
3. `allowFontScaling={false}` explícito del consumidor = **pineado**: tampoco
   escala con la app. Respeta la curación existente (emojis, badges, chips,
   layouts fijos que se rompen al escalar).
4. Solo escala styles con `fontSize` declarado (ver arriba).

`AnimatedText` envuelve `Animated.Text` de Reanimated, no `RNText`: el texto
que anima no puede pasar por el wrapper común porque `entering`, `exiting` y
los estilos de `useAnimatedStyle` los consume el componente que crea
Reanimated. La capa es transparente para esos props (viajan por `...rest`) y
los overrides se componen últimos sin pisar ninguna animación: **ningún sitio
del repo anima métricas de fuente** (anima color, opacidad y transform), y el
objeto que devuelve `useAnimatedStyle` es un `{ initial, viewDescriptors }`
plano, así que aplanarlo para leer el `fontSize` es inocuo.

`maxFontSizeMultiplier` / `minimumFontScale` que ya existían llegan por
`...rest`. Ninguno se limpió, pero **no son el mismo caso**:

- `maxFontSizeMultiplier` **queda inocuo**: RN solo lo lee con
  `allowFontScaling` prendido (`Text.d.ts`: «largest possible scale a font can
  reach when allowFontScaling is enabled») y el wrapper lo apaga siempre.
- `minimumFontScale` **sigue vivo**: no cuelga de `allowFontScaling` sino de
  `adjustsFontSizeToFit` (`Text.d.ts`: «smallest possible scale a font can
  reach when adjustsFontSizeToFit is enabled»), que sigue activo en el árbol.
  El auto-shrink corre en las **dos** plataformas — el tipado lo declara en
  `TextPropsIOS`, pero Android lo implementa igual
  (`ReactBaseTextShadowNode.setMinimumFontScale` + `ReactTextView`).

**La consecuencia se ve en device:** donde hay `adjustsFontSizeToFit`, el
wrapper sube el `fontSize` y el sistema lo vuelve a encoger para que la línea
entre en la caja — mover la preferencia ahí puede no cambiar nada visible.
Es **esperado, no un bug**: ese flag existe justamente para eso. El inventario
sitio por sitio está en el checklist de QA (§9).

## 3. El desacople del OS, plataforma por plataforma

El wrapper cubre el 100% del texto propio. El **kill nativo** existe solo para
lo que rendericen libs de terceros por fuera del wrapper.

### Android — sí hay kill (`plugins/with-fixed-font-scale.cjs`)

Config plugin que inyecta un `attachBaseContext` con
`configuration.fontScale = 1f` en **MainApplication y MainActivity**, no solo
en la Activity. `android/` es gitignored (prebuild continuo), por eso va como
plugin y no como edición del proyecto nativo.

- **MainApplication es el que cubre el texto de RN.** RN no dimensiona el
  texto contra los Resources de la View: todo `<Text>` sale por
  `PixelUtil.toPixelFromSP()` sobre el singleton `DisplayMetricsHolder`, que
  se siembra siempre desde el contexto de **aplicación** (en bridgeless,
  `ReactInstance` lo inicializa con el `BridgelessReactContext`, que es
  `ReactContext(context.applicationContext)`). Es también el que hace que
  `PixelRatio.getFontScale()` y `Dimensions.get('window').fontScale` devuelvan
  1, porque `DeviceInfoModule` lee la configuration del react context.
- **MainActivity** cubre solo lo que se infla con su contexto: diálogos,
  pickers, títulos de Toolbar. Marginal en una app RN, pero es el único camino
  para esos widgets.

**La `Configuration` del override va vacía salvo `fontScale`.**
`createConfigurationContext` la aplica como delta con
`Configuration.updateFrom()`, que copia todo campo seteado; pasar una copia de
la configuration del momento del attach congelaba `uiMode`, `locale`,
`orientation` y `densityDpi` para siempre (esos cambios están declarados en
`android:configChanges`, no recrean la Activity ni vuelven a correr
`attachBaseContext`). Síntoma observado: con el tema en «Sistema», prender el
modo oscuro con la app en foreground no hacía nada hasta matar el proceso.
El plugin además **borra cualquier override previo antes de reinyectar**, para
que un `android/` ya generado con una variante vieja no se quede con el bug.

### iOS — NO hay kill

El diseño original llamaba a
`AccessibilityManager.setAccessibilityContentSizeMultipliers` con todas las
categorías en 1.0. **Se sacó: es inerte.** Con la Nueva Arquitectura prendida
(`newArchEnabled: true`), bajo Fabric el multiplicador sale de
`RCTFontSizeMultiplier()` (`React/Base/RCTUtils.mm`), una tabla estática sobre
`preferredContentSizeCategory` que nunca consulta a `RCTAccessibilityManager`
— en RN 0.81.5 no queda una sola referencia al módulo en `React/Fabric` ni en
`ReactCommon`. Sus únicos lectores son ViewManagers de la arquitectura vieja y
`RCTDeviceInfo`, así que la llamada solo lograba que `PixelRatio.getFontScale()`
y `Dimensions.get('window').fontScale` **mintieran 1** mientras el texto se
seguía dibujando a la escala del OS: un valor falso, sin ganancia.

El porqué largo está en el comentario de bloque de `font-scale-provider.tsx`.

**Consecuencia asumida:** en iOS el texto de libs de terceros que no pasa por
el wrapper sigue escalando con Dynamic Type. Todo lo visible de la app es
custom, así que es aceptable. La contraparte real del plugin de Android sería
un override nativo de la categoría de contenido: **pendiente, no implementado**.

**Corolario para gates:** `PixelRatio.getFontScale() === 1` es siempre-true
**solo en Android**. En iOS ese gate sigue devolviendo el valor del OS. No
escribir lógica nueva que asuma 1 en las dos plataformas.

`Text.defaultProps.allowFontScaling = false` tampoco era opción: React 19
ignora `defaultProps` en function components.

## 4. Campos de formulario: se DESPINEARON

Los `TextInput` de la app venían con `allowFontScaling={false}` de antes, por
un motivo concreto: con el Texto más grande de iOS el campo descuadraba la
caja. **Ese motivo ya no existe** — el escalado del OS está apagado y el
nuestro topea en 1.2×, mientras que el de iOS llegaba a 3.57×. Peor: pineados
solo ellos, a «Máxima» el label y el helper del campo terminaban más grandes
que lo que el usuario tipea, con la jerarquía invertida.

Así que escalan: `ui/text-field` (14 → 16.8pt), `ui/neo-text-field` y
`control-v2/neo-field` (16 → 19.2pt) y la búsqueda de
`screens/home/expense-filters-screen`. Se despineó junto el **overlay de
placeholder** que le hace juego a cada uno, para que no se desincronicen.

Los tres campos conservan su `height` explícito: es lo que hace que iOS centre
texto y placeholder con el mismo rect (bug de `RCTUITextField`). A 1.2× el
contenido entra con sobra, no hace falta pasarlo a `minHeight`.

Lo que sigue pineado es geometría fija de verdad: `freq-tile`, la píldora de
cuotas y el chip de delta de `add-fijo-parts`. El desglose completo sitio por
sitio está en el body del commit `daa09991`.

## 5. Texto animado

Regla: **todo `Animated.Text` va por `AnimatedText` del wrapper**, los 21 sitios
de la app. La **única excepción legítima** es la rama fluida de
`mobile/components/home/animated/count-up-text.tsx`: hace
`Animated.createAnimatedComponent(TextInput)` y necesita el componente nativo
crudo (el wrapper es un function component y perdería la ref que
`animatedProps` requiere). Conserva el import de react-native con su
`eslint-disable-next-line` justificado y **escala a mano** con
`useFontScaleFactor()`, resolviendo el factor en JS **fuera del worklet** — los
worklets no pueden llamar funciones JS no-worklet. Su rama de conteo JS usa
`AnimatedText` como el resto.

> **ESLint no caza esto.** La guardia de §6 restringe imports de
> `'react-native'`; `Animated.Text` viene de `react-native-reanimated` y ningún
> lint lo toca. Un `<Animated.Text>` crudo conserva el default
> `allowFontScaling={true}`, así que en iOS ese texto sigue escalando con
> Dynamic Type (hasta 3.571× según la tabla de `RCTUtils.mm`) e ignora la
> preferencia in-app — exactamente la rotura que este sistema existe para
> impedir. El gate es `npm run guard:font-scale` (§6), no el lint.

**Estado transitorio (mismo motivo que §6):** en un checkout limpio de este
branch quedan **tres** sitios con `Animated.Text` crudo — `count-up-text.tsx`
(rama de conteo JS), `redesign/gastos/gastos-screen.tsx` y
`wrapped/scenes/closing-scene.tsx`. Los tres caen encima del trabajo ajeno en
curso (Wrapped, ciclo extendido, fijos) y su migración viaja dentro de ese
commit, igual que la cola de imports.

## 6. Las guardias (ESLint + `guard:font-scale`) y su bloque transitorio

### ESLint — solo ve imports

`@typescript-eslint/no-restricted-imports` prohíbe importar `Text`/`TextInput`
de valor desde `'react-native'` en todo `app/` + `mobile/`, con
`allowTypeImports: true` (los `import type { TextInput }` para tipar refs son
legítimos y siguen permitidos). Exento: el propio `app-text.tsx`.

### `scripts/guard-font-scale.mjs` — lo que ESLint no puede ver

`npm run guard:font-scale`, encadenado en `npm run validate` y con step propio
en `.github/workflows/mobile-ci.yml`. Ataja las tres regresiones que dejan el
sistema roto en silencio:

1. **`Animated.Text` / `Animated.TextInput` crudos.** Vienen de
   `react-native-reanimated`: ESLint no los toca ni podría (§5). Cuenta el tag
   de apertura una sola vez y no cae en menciones dentro de comentarios ni de
   strings. Cubre el alias real del import (`import Rea from
   'react-native-reanimated'` + `<Rea.Text>`) y el acceso por namespace a
   react-native (`import * as RN from 'react-native'` + `<RN.Text>`), que
   esquiva a ESLint porque la regla restringe los **nombres importados**, no
   el módulo.
2. **El contrato del wrapper.** Los tres exports (`Text`, `AnimatedText`,
   `TextInput`) tienen que existir, sacar `allowFontScaling` por destructuring
   —si viaja en el `...rest`, el valor del consumidor pisa el del wrapper— y
   mandarle `allowFontScaling={false}` al nativo. Si alguien lo saca, **todo**
   el sistema se cae sin que nada lo cace: vitest corre en `env node`, sin
   renderer, así que no hay test posible.
3. **Imports crudos de `Text`/`TextInput`.** Redundante con ESLint app-wide,
   pero para los archivos del bloque transitorio de abajo la regla está en
   `warn`: ahí el guard es la única señal dura de que la lista no crezca.

**Cómo parsea:** con el **AST de `typescript`**, no con un tokenizer propio. El
primer intento blanqueaba strings y comentarios a mano y no conocía los
literales de expresión regular ni el texto JSX: una `'` adentro de un
`/[^\p{L}' -]/u` —o el apóstrofo de un copy— abría un string fantasma y
blanqueaba el resto del archivo, dejando el chequeo 1 **ciego de ahí al EOF**,
justo el único chequeo sin red de contención. Si `typescript` no resuelve, el
guard **falla fuerte**: nunca pasa en verde por no haber podido mirar.

Excepciones: `// @font-scale-allow: <razón>` en la línea (o la de arriba). Para
imports vale también el `eslint-disable-next-line …no-restricted-imports` que
ya se usa, para no escribir dos comentarios para la misma excepción (la rama
fluida de `count-up-text.tsx`).

### El bloque transitorio (está DOS veces, en espejo)

Hay **un bloque de override transitorio** que baja la regla a `warn` para una
lista cerrada de **26 archivos**. Por qué existe: la barrida migró todo el
árbol, pero esos archivos caían encima de un cuerpo de trabajo ajeno en curso
(Wrapped, ciclo extendido, fijos) — unos modificados, otros directamente
borrados por ese trabajo—, así que su swap de import no se podía commitear sin
llevárselo puesto y viaja dentro de ese commit. En un checkout limpio del
branch esos archivos todavía importan los primitivos crudos, y con la regla en
`error` app-wide eso dejaba `npm run lint` —y con él el job `verify` de
`.github/workflows/mobile-ci.yml`— en rojo por 27 imports que nadie podía
arreglar desde ahí.

El guard arrastra el **mismo criterio y los mismos paths**, en dos listas
(`TRANSITIONAL_RAW_IMPORTS`, las mismas 26 entradas que ESLint, y
`TRANSITIONAL_ANIMATED_TEXT`, los tres `Animated.Text` de §5). Un guard que
deja CI en rojo por trabajo en vuelo se termina desactivando, y ahí no sirve
para nada. Sobre un checkout limpio de HEAD reporta **0 blocking / 30
transitorias**; sobre el árbol con el trabajo aterrizado, 0 y 0.

**Las dos listas gatean por CUENTA, no por archivo** (mismo patrón que
`scripts/motion-tokens-baseline.json`): el valor de cada entrada es el número
exacto de hallazgos de ese archivo en un checkout limpio de HEAD —1 en todas
salvo `delete-account-screen.tsx`, que importa `Text` **y** `TextInput`— y el
hallazgo número tope+1 **bloquea**. Sin eso la lista no sería una señal dura
sino un agujero: un `Animated.Text` nuevo en `redesign/gastos/gastos-screen.tsx`
—pantalla viva, en las dos listas— no tendría **ninguna** señal, porque ESLint
ahí no ve nada por definición (§5). Los topes solo **bajan**: al migrar un
callsite se baja el número o se borra la entrada; nunca se sube.

> `wrapped/scenes/closing-scene.tsx` está en las **dos** listas, y no es
> redundante: en HEAD importa `Text` crudo (línea 2 — eso lo ve ESLint) **y**
> monta un `Animated.Text` (eso no lo ve nadie más que el guard). Verificado:
> sacándolo del bloque de ESLint, `npx eslint` sobre ese archivo pasa de
> `warning` a `error`.

**Cómo se cierra:** cuando ese trabajo aterrice, borrar el bloque de
`eslint.config.js` y las dos listas del guard, y verificar **las dos** cosas:

1. `npm run lint` sin warnings de `no-restricted-imports`.
2. `npm run guard:font-scale` en verde y sin la línea de «las listas
   transitorias ya no cazan nada» (esa línea es justamente el aviso de que se
   pueden borrar). El lint no ve el texto animado (§5), así que sin el guard se
   puede declarar cerrado el sistema con labels animados todavía colgados del
   Dynamic Type del OS.

Son **listas cerradas, no allowlists**: no agregar archivos nuevos. Si aparece
un archivo con el import crudo, se migra al wrapper.

## 7. Ajustes

Grupo «Tamaño del texto» (`SettingsGroup` + `SegmentedControl` skin neo, bloque
9c) entre Idioma y Animaciones. Cambio en vivo; la propia pantalla de Ajustes
es el preview, sin preview dedicado.

Dos cosas que se ajustaron por ancho y conviene no revertir:

- **`xl` se llama «Máxima» / «Largest»**, una sola palabra. Es el primer
  control de **4** segmentos de la pantalla (tema, idioma y animaciones tienen
  3) y su etiqueta también escala con la preferencia. Medido sobre
  `Nunito_700Bold.ttf` con la cadena de anchos real (Screen 20 +
  `appearanceInner` 14 + pista neo 4 + gap 4 + inset del item), en un teléfono
  de 360dp quedan 44pt de texto por segmento: «Muy grande» medía 71.7pt ya a
  13pt, o sea que se partía en dos líneas **en el default**.
- **Inset denso en `SegmentedControl` a partir de 4 opciones**
  (`paddingHorizontal` del item 12 → 4, `styles.itemDense`): con 12 no entraba
  ni «Normal» (54.0pt a ×1.2). No se ve —la píldora ocupa el item entero y el
  texto va centrado—, solo le devuelve ancho a la etiqueta. Ordena también el
  control de 4 opciones del bloque dev, que ya envolvía.

Resultado: de 360dp para arriba las 4 etiquetas entran en una línea a los
cuatro factores (peor holgura 3.2pt). A 320dp la más larga envuelve a dos
líneas desde ×1.1 y entra igual en los 44pt de `MIN_TOUCH_TARGET`, sin
recortarse.

## 8. Reglas para código nuevo

- Texto nuevo: importar `Text` / `TextInput` de `@/components/ui/app-text`.
  Texto animado: `AnimatedText` del mismo módulo.
- Emojis, badges, chips y layouts de geometría fija que se rompen al escalar:
  `allowFontScaling={false}` → pineado para el OS **y** para la app.
- `createAnimatedComponent` sobre texto (única excepción a la guardia):
  `eslint-disable` con justificación + escala a mano con `useFontScaleFactor()`,
  con el factor resuelto en JS fuera del worklet.
- No escribir gates nuevos sobre el `fontScale` del OS: en Android es siempre 1
  y en iOS no lo es.
- Al agregar un `SegmentedControl` de 4+ opciones, chequear el ancho de la
  etiqueta más larga a ×1.2 (§7).
- Al tocar `app-text.tsx`: correr `npm run guard:font-scale`. El contrato de
  los tres exports (destructurar `allowFontScaling` + mandar
  `allowFontScaling={false}`) no lo cubre ningún test — vitest corre sin
  renderer, ese guard es todo lo que hay.
- ¿Un texto no crece al mover la preferencia? Antes de abrir bug, fijarse si
  tiene `adjustsFontSizeToFit`: ahí es esperado (§2 y §9.4).

## 9. QA en device (pendiente — dev client, nunca Expo Go)

1. Ajustes → cambiar entre los 4 niveles: toda la pantalla cambia en vivo.
2. **Eje del OS** (distinto de mover la preferencia in-app): poner el tamaño de
   fuente del teléfono al máximo. La app no cambia. En Android incluye el texto
   de terceros (bottom sheets, headers de navegación, toasts) y
   `PixelRatio.getFontScale()` debe dar 1; en iOS el texto propio queda fijo y
   el de terceros escala — eso es lo esperado (§3). **Mirar los textos
   animados** en esta pasada (contador fluido del hero, label animado de
   Gastos, escenas de Wrapped): si alguno crece en iOS, quedó un
   `Animated.Text` crudo (§5) — el lint no lo caza.
   > Antes de abrir bug por un texto **no** animado que crece en iOS: fijarse
   > si el archivo está en el bloque transitorio de §6. Esos 26 todavía
   > importan el primitivo crudo en un checkout limpio, no pasan por el
   > wrapper y por eso siguen colgados del OS — el caso visible es el nombre
   > del saludo del Home neo (§9.4). Es deuda conocida, no un hallazgo nuevo.
3. A «Máxima» (1.2): Home (hero + contador fluido), Gastos (badges, calendario,
   filas), tab bar, wizards de alta, Jardín/Logros, Ajustes — sin recortes ni
   desbordes. Campos de formulario: label, input y placeholder coherentes.
4. **Los sitios con `adjustsFontSizeToFit`: si el texto no crece, es ESPERADO,
   no un bug.** El wrapper sube el `fontSize` y el auto-shrink lo vuelve a
   encoger para que la línea entre en su caja; `minimumFontScale` sigue vivo
   ahí (§2) y es el piso de ese encogido. No abrir bug, no «arreglarlo»
   sacando el flag: el flag es lo que impide que la fila se parta o que el
   monto desborde. Inventario verificado con
   `grep -rn '^\s*adjustsFontSizeToFit' mobile app` — **17 sitios**, de los
   cuales **12 declaran `minimumFontScale`** (los otros 5 caen en el piso
   default de RN):

   | Sitio | `minimumFontScale` | Qué se mira |
   |---|---|---|
   | `components/control-v2/control-v2-vsmes-card.tsx:502` | 0.8 | valor de la barra |
   | `components/control-v2/daily-goal-sheet.tsx:252` | 0.7 | monto del hero (`AnimatedText`) |
   | `components/gastos/add-income-parts/step2-summary.tsx:166` | 0.7 | importe del resumen |
   | `components/home/amount-card.tsx:270` | — | monto de la card |
   | `components/home/category-horizontal-rail.tsx:542` | 0.6 | label del tile (**pineado**, ver abajo) |
   | `components/home/control-signal-tile.tsx:75` | 0.7 | valor de la señal |
   | `components/home/greeting-header.tsx:49` | 0.72 | nombre del saludo |
   | `components/home/quick-add-savings-sheet.tsx:275` | 0.7 | monto del aporte |
   | `components/import-review/import-review-receipt.tsx:133` | — | monto del recibo |
   | `components/redesign/home/home-screen.tsx:309` | 0.72 | nombre del saludo (neo) (**crudo**, ver abajo) |
   | `components/savings-goals/wizard-steps/step-4-summary.tsx:64` | — | monto de la meta |
   | `components/savings-goals/wizard-steps/wizard-value-well.tsx:88` | — | valor del pozo |
   | `components/settings/settings-primitives.tsx:59` | 0.75 | valor del hero stat |
   | `components/ui/numeric-edit-sheet.tsx:378` | — | valor del display |
   | `components/wizard/parts/impact-columns.tsx:62` | 0.75 | las dos cifras del impacto |
   | `screens/home/asistente-screen.tsx:694` | 0.7 | impacto de la tarea |
   | `screens/settings/settings-screen.tsx:1208` | 0.7 | monto de la reserva |

   Dos filas de la tabla no responden a la preferencia, y en ninguna de las dos
   la causa es el auto-shrink:

   - **Pineado** — el label del rail de categorías lleva
     `allowFontScaling={false}` explícito: la preferencia no lo toca por
     decisión propia (§8).
   - **Crudo (transitorio)** — `components/redesign/home/home-screen.tsx`
     importa `Text` de `'react-native'` en un checkout limpio (es una de las 26
     entradas del bloque transitorio de §6), así que **no pasa por el
     wrapper**: su `fontSize` no sube con la preferencia y, al revés que el
     resto de la app, ese texto **sí escala con el fontScale del OS**. Cuando
     el archivo aterrice migrado, la fila se comporta como las otras 15.

   En las otras 15 el `fontSize` sí sube; lo que se ve depende de cuánto lugar
   sobre en la caja.
5. Matar y reabrir con «Máxima»: la preferencia persiste (con el salto de
   fuente del primer frame, §1).
   > **No comparar contra tema/idioma/animaciones: esas HOY no persisten en
   > native.** Sus keys usan `:` (`manifiesto:theme-preference`,
   > `manifiesto:language-preference`, `manifiesto:motion-preference`),
   > `expo-secure-store` las rechaza (`/^[\w.-]+$/`) y `persistent-kv` se
   > traga la excepción en silencio (§1). O sea que la escala de texto va a
   > ser la **única** preferencia que sobreviva a matar la app: si el tema
   > vuelve al default y la escala no, las dos cosas están bien. Deuda
   > pre-existente, fuera del alcance de este sistema.
6. **Regresión del override de Android:** con el tema en «Sistema», prender el
   modo oscuro del sistema con la app en foreground → cambia al toque, sin
   matar el proceso.
7. Android de gama baja: pasada rápida de los mismos puntos.
