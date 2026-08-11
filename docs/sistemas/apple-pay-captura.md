# Captura de gastos con Apple Pay

> El usuario paga apoyando el iPhone; una automatización de Atajos dispara un App Intent de Manifiesto que guarda el pago (monto crudo + comercio) y avisa con una notificación local. Al abrir la app, el gasto se confirma en el mismo wizard de revisión que usa el import por OCR, con la categoría ya sugerida a partir del historial.
>
> **Estado:** ✅ código completo 2026-08-08 (branch `feat/ui-redesign`, build 15) y ✅ **verificado en device** con un pago real: la acción aparece en Atajos, la automatización dispara y el gasto entra con monto y comercio correctos.
> **Compatibilidad:** iOS 17+ y build nativa. El App Intent es código nativo: **no sale por OTA**. Android no tiene equivalente y la fila de Ajustes ni siquiera se muestra.
> **Camino principal:** el **atajo pre-armado** que se distribuye como link de iCloud (`APPLE_PAY_SHORTCUT_ICLOUD_URL`). Mientras esa constante sea `null`, la pantalla cae sola al armado manual.

---

## Qué capta y qué no

| Capta | No capta |
|---|---|
| Pagos sin contacto (NFC) hechos con el iPhone o el Apple Watch asociado, en las tarjetas que el usuario marcó en la automatización | Pagos con la tarjeta física de plástico |
| | Compras dentro de otras apps o en la web con Apple Pay (el disparador "Transacción" no las emite de forma confiable) |
| | Transferencias, débitos automáticos, efectivo |

Además, Apple documenta que el disparador es **best-effort**: con el teléfono bloqueado puede demorar o saltearse un pago. El copy de la pantalla lo dice explícitamente (`settings:applePay.expectation`) y **no puede prometer** captura perfecta — cualquier reescritura de ese texto tiene que conservar la advertencia.

---

## Por qué existe (y por qué así)

Registrar un gasto a mano justo después de pagar es el momento de mayor fricción del producto: el usuario está en la calle, con el celular en la mano y apurado. Apple no expone ninguna API para leer el Wallet ni para crear la automatización por nosotros — el único gancho disponible es el disparador **"Transacción"** de Atajos (iOS 17+; en iOS 26 se llama "Wallet"), que el usuario arma a mano.

Consecuencia de diseño: **la pantalla de Ajustes ES el producto**. Lo único que la app puede hacer es prender la captura, guiar el armado y abrir Atajos. Lo demás lo configura el usuario.

Lo que sí se puede hacer es **entregarle el atajo ya cableado**: un atajo de Atajos se comparte como link de iCloud, y al agregarlo el usuario recibe la acción de Manifiesto con las variables **Cantidad** y **Comercio** ya puestas y con su propiedad elegida. Eso borra de un saque las tres trampas del armado manual (la acción equivocada, la variable sin propiedad, los campos tipeados a mano) y deja la configuración en tres pasos sin teclado. El armado manual sigue documentado y disponible en la pantalla, colapsado, como salida de emergencia.

Descartado a propósito (ver la sección "Fuera de alcance" del [spec](../superpowers/specs/2026-08-08-apple-pay-captura-atajo-design.md)): deep link `manifiesto://` como camino alternativo, webhook a una Edge Function, modos de comportamiento configurables, monto mínimo, semilla de sinónimos comercio→categoría, y Android.

---

## Arquitectura (alto nivel)

```
[Tap NFC]  ← el usuario paga; la app está en background o cerrada
    ↓ disparador "Transacción" de Atajos (lo arma el usuario)
[ManifiestoLogExpenseIntent]            plugins/apple-pay-intent/ — TARGET PRINCIPAL
    ├─ append(merchantRaw, amountRaw)   monto como STRING CRUDO, sin parsear
    └─ notify(...)                      notificación local con url → /(app)/(tabs)/expenses
    ↓ UserDefaults.standard (no App Group: mismo proceso)
[ManifiestoCaptureStore]                cola FIFO, tope 50 entradas
    ↓ módulo Expo `ApplePayCapture` (Pod) — sólo LECTURA
[native.ts]  getPendingCaptures / clearCaptures / setNotificationCopy
    ↓ useApplePayCaptureGate            auth en `ready` + familia + foreground
[PendingCapture[]]
    ↓ mapCapturesToReviewRows           parse de monto + fecha local + categoría sugerida
[ReviewRow[]]
    ↓ ImportReviewSheet (onConfirmRows) el MISMO wizard del import por OCR
    ↓ useConfirmImport                  createExpense × N
    ↓ clearCaptures(ids confirmados)    las que fallaron quedan pendientes
[Home, Gastos, Control, rachas... refetched vía syncAllAfterMutation]
```

### Capas y módulos

| Capa | Path | Responsabilidad |
|---|---|---|
| App Intent | [`plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift`](../../plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift) | Acción "Registrar gasto" de Atajos. Escribe la captura y notifica. `openAppWhenRun: false` |
| Config plugin | [`plugins/with-apple-pay-intent.cjs`](../../plugins/with-apple-pay-intent.cjs) | Copia el intent + el store a `ios/<App>/` y los suma al build phase de Sources en cada prebuild |
| Store nativo | [`modules/apple-pay-capture/ios/ManifiestoCaptureStore.swift`](../../modules/apple-pay-capture/ios/ManifiestoCaptureStore.swift) | Cola en `UserDefaults` + `notify()`. **Compila dos veces** (ver abajo) |
| Puente a JS | [`modules/apple-pay-capture/ios/ApplePayCaptureModule.swift`](../../modules/apple-pay-capture/ios/ApplePayCaptureModule.swift) | Módulo Expo `ApplePayCapture`: leer, borrar por id, escribir el copy |
| Wrapper JS | [`mobile/features/apple-pay-capture/native.ts`](../../mobile/features/apple-pay-capture/native.ts) | `requireOptionalNativeModule` → no-ops en web / Expo Go / builds viejas |
| Tipos | [`mobile/features/apple-pay-capture/types.ts`](../../mobile/features/apple-pay-capture/types.ts) | `PendingCapture` (`id`, `merchantRaw`, `amountRaw`, `capturedAt`) |
| Parse del monto | [`mobile/features/apple-pay-capture/parse-shortcut-amount.ts`](../../mobile/features/apple-pay-capture/parse-shortcut-amount.ts) | `$4.500,00` vs `$4,500.00` vs `(-$ 4.500,00)` → valor + flag de devolución |
| Normalización | [`mobile/features/apple-pay-capture/normalize-merchant.ts`](../../mobile/features/apple-pay-capture/normalize-merchant.ts) | Comercio crudo → tokens comparables |
| Categoría | [`mobile/features/apple-pay-capture/resolve-category-for-merchant.ts`](../../mobile/features/apple-pay-capture/resolve-category-for-merchant.ts) | Último gasto del mismo comercio → su categoría, o `null` |
| Map a UI | [`mobile/features/apple-pay-capture/map-captures-to-review-rows.ts`](../../mobile/features/apple-pay-capture/map-captures-to-review-rows.ts) | `PendingCapture[] → ReviewRow[]` con warnings (`value-zero`, `refund`, `no-merchant`, `future-date`) |
| Flag persistido | [`mobile/features/apple-pay-capture/apple-pay-enabled-store.ts`](../../mobile/features/apple-pay-capture/apple-pay-enabled-store.ts) | Store externo (`useSyncExternalStore`) sobre `persistent-kv` |
| Recibo de la última captura | [`mobile/features/apple-pay-capture/apple-pay-last-capture-store.ts`](../../mobile/features/apple-pay-capture/apple-pay-last-capture-store.ts) | Mismo patrón de store externo. Guarda la captura RECIBIDA más reciente, que es la prueba de que la automatización quedó bien armada |
| Diagnóstico | [`mobile/features/apple-pay-capture/diagnose-last-capture.ts`](../../mobile/features/apple-pay-capture/diagnose-last-capture.ts) | Función pura: qué se puede concluir de la última captura (`ok` / `same-value` / `unreadable-amount` / `missing-amount`) |
| Fase de la pantalla | [`mobile/features/apple-pay-capture/resolve-setup-phase.ts`](../../mobile/features/apple-pay-capture/resolve-setup-phase.ts) | Función pura: gate + switch + recibo + diagnóstico → `unavailable` / `off` / `waiting-first` / `working` / `broken-capture`. **Decide qué dibuja la pantalla** |
| Gate | [`mobile/features/apple-pay-capture/use-apple-pay-capture-gate.ts`](../../mobile/features/apple-pay-capture/use-apple-pay-capture-gate.ts) | Drena al montar y en cada vuelta a foreground, sólo con auth en `ready` |
| Copy de la notif | [`mobile/features/apple-pay-capture/apple-pay-notification-copy-bridge.tsx`](../../mobile/features/apple-pay-capture/apple-pay-notification-copy-bridge.tsx) | Empuja el copy i18n al nativo en el arranque |
| Host | [`mobile/components/apple-pay-capture/apple-pay-capture-host.tsx`](../../mobile/components/apple-pay-capture/apple-pay-capture-host.tsx) | Su propia instancia de `ImportReviewSheet` + limpieza de capturas |
| Link del atajo | [`mobile/features/apple-pay-capture/shortcut-link.ts`](../../mobile/features/apple-pay-capture/shortcut-link.ts) | `APPLE_PAY_SHORTCUT_ICLOUD_URL`: el link de iCloud del atajo pre-armado, o `null` mientras no esté publicado. **Es el switch entre los dos modos de la pantalla** |
| Pantalla | [`mobile/screens/settings/apple-pay-screen.tsx`](../../mobile/screens/settings/apple-pay-screen.tsx) | Dirigida por estado: resuelve el gate, calcula la fase y monta UN protagonista por fase (ver abajo) |

---

## Decisiones que hay que conocer antes de tocar esto

### 1. El App Intent vive en el TARGET PRINCIPAL, no en el Pod

Los módulos Expo compilan como Pod, o sea como librería estática. Un App Intent dentro de una librería estática **puede no ser indexado** por el `appintentsmetadataprocessor` de Apple, y entonces la acción nunca aparece en Atajos. Por eso el `.swift` del intent se copia al target de la app y se suma a su build phase de Sources desde el config plugin.

### 2. `ManifiestoCaptureStore.swift` se compila DOS veces, a propósito

El intent (target principal) **escribe** y el módulo Expo (Pod) **lee**. Swift no cruza módulos hacia arriba: un Pod no puede importar el módulo de la app, así que el store no puede vivir sólo arriba. En disco hay **un solo archivo** (el de `modules/`, que es el que versiona git) y el config plugin lo copia. Si alguna vez hubiera dos archivos de verdad, las claves de `UserDefaults` se desincronizarían y la feature se rompería en silencio. Todo el store es `internal` para que el target principal no vea dos símbolos con el mismo nombre.

### 3. El monto viaja como STRING crudo

Swift no sabe con qué locale el disparador formateó el monto: `$4.500,00` (es-AR) y `$4,500.00` (en-US) son el mismo número escrito distinto, y `'25,9'` no es `259`. El parse vive entero en `parse-shortcut-amount.ts`, testeado sin device. Devuelve también `isRefund` — una devolución en formato contable (`($ 4.500,00)`) es un ingreso, no un gasto, y entra al wizard como `skip` para que el usuario decida.

### 4. La fecha se pasa al día LOCAL, no se corta el ISO

`capturedAt` es UTC. Cortar el string daba el día UTC y en Argentina (UTC−3) toda compra después de las 21:00 caía al día siguiente. `map-captures-to-review-rows` lo convierte con `formatLocalDateKey`, y ancla a hoy cualquier fecha futura (warning `future-date`).

### 5. `setNotificationCopy()` va en el arranque, no al abrir Gastos

`notify()` en Swift sale sin hacer nada si el copy todavía no fue escrito: la captura igual se guarda, pero **no notifica**. Colgado del layout de tabs, la primera captura de una instalación nueva pasaría en silencio. Por eso el bridge vive en [`root-layout-shell.tsx`](../../mobile/components/root/root-layout-shell.tsx), junto al resto de los bridges de raíz, y corre en el primer render de cada arranque — aún antes del login.

### 6. Las capturas se drenan en foreground, no por evento

El intent corre con la app en background y no hay ningún evento que lo anuncie. El gate lee la cola al montar y en cada `AppState === 'active'`. Nunca antes de que el viaje de auth llegue a `ready` (mismo criterio que el share-to-import: no procesar contenido antes de autenticar).

Si el usuario cierra el wizard sin confirmar, las capturas quedan pendientes y se re-ofrecen en la próxima vuelta a foreground — no en el mismo frame, porque volvería a abrir el sheet que acaba de cerrar. Al confirmar se borran todas las drenadas **menos las que fallaron al insertar**: ahí el usuario sí quiso registrarlas y se cayó la escritura.

---

## Runbook: cómo lo configura el usuario

Ajustes → **Gastos con Apple Pay** → prender *Capturar mis pagos*. Lo que aparece después depende de la **fase** (`resolveApplePaySetupPhase`), no del scroll. **Cuál guía** depende de `APPLE_PAY_SHORTCUT_ICLOUD_URL`.

### Camino principal — con el atajo pre-armado (3 pasos, verificado en device)

1. Tocar **"Agregar el atajo listo"**: abre el link de iCloud, iOS muestra la vista previa y el usuario confirma con **"Agregar atajo"**. El atajo **"Manifiesto"** queda en su biblioteca con la acción y las variables Cantidad/Comercio ya cableadas.
2. Atajos → **Automatización** → **+** → disparador **"Transacción"** (en iOS 26, **"Wallet"**) → marcar las tarjetas → **"Ejecutar de inmediato"** — ⚠️ y **apagar "Preguntar antes de ejecutar"**. La pantalla trae el botón **Abrir Atajos** (`shortcuts://create-automation`).
3. En la pantalla **"Siguiente"**, elegir el atajo **"Manifiesto"** de la lista de atajos existentes.

Cero teclado, cero variables. La única trampa que sobrevive es la del paso 2 ("Ejecutar de inmediato"), porque esa decisión es de la automatización, no del atajo.

### Camino manual — sin atajo publicado, o por elección del usuario

Con la constante en `null` estos cinco pasos **son** la guía de la pantalla, sin fila de plegado. Con el atajo publicado quedan detrás de la fila **"Prefiero armarlo a mano"**.

1. Crea una automatización nueva (Atajos → Automatización → +). El botón **Abrir Atajos** vive dentro de este paso.
2. Elige el disparador **"Transacción"** (en iOS 26 se llama **"Wallet"**).
3. Marca las tarjetas y elige **"Ejecutar de inmediato"** — ⚠️ y **apaga "Preguntar antes de ejecutar"**.
4. Agrega la acción **de Manifiesto** "Registrar gasto" — ⚠️ si aparece un paso **"Ejecutar atajo"**, está mal.
5. Llena **Monto** y **Comercio** con la variable **"Entrada del atajo"** y elige su propiedad (**Cantidad** en el monto, **Comercio** en el otro) — ⚠️ nunca tipeándolos a mano.

### La pantalla es DIRIGIDA POR ESTADO (rediseño 2026-08-11)

La versión anterior era **estática**: mostraba la guía, los avisos, el bloque de estado y el diagnóstico **siempre**, sin importar en qué momento del camino estaba quien la abría. Quien venía a descubrir la función leía advertencias de fallas que no le pasaban, y quien venía porque le faltaba un gasto tenía que bajar cuatro bloques para encontrar la suya.

La evidencia de que eso era un problema **no** salió de una prueba con usuarios —no hubo ninguna—: salió del uso del owner en su propio iPhone, entre el 2026-08-09 y el 2026-08-11, configurando la captura de punta a punta y tropezando con las tres trampas de Atajos que hoy están advertidas paso por paso.

`resolveApplePaySetupPhase` (función pura, con tests en `tests/unit/apple-pay-resolve-setup-phase.test.ts`) resuelve la fase a partir de cuatro entradas —gate, switch, último recibo y diagnóstico— y la pantalla monta **un solo protagonista** por fase:

| Fase | Cuándo | Qué muestra |
|---|---|---|
| `unavailable` | `gate != 'ok'` | El switch deshabilitado + el motivo en el footer. **Nada más** |
| `off` | switch apagado | Tarjeta de una línea que vende la idea + el switch. Sin guía ni avisos |
| `waiting-first` | prendida, jamás llegó una captura | La guía desplegada como protagonista (3 pasos con el atajo publicado, 5 en el modo manual) + una línea sutil "Esperando tu primer pago…". Manual y síntomas, plegados |
| `working` | prendida, última captura sana | Héroe de éxito: tilde grande en un pozo + el recibo (comercio, monto formateado, "hace X"). La guía se pliega detrás de "Volver a ver la configuración" |
| `broken-capture` | prendida, la última captura llegó mal | El diagnóstico al frente con su arreglo puntual y el botón que lo resuelve (re-agregar el atajo cableado). La guía también se pliega: el héroe YA trae ese botón, y desplegarla repetiría la misma CTA en el paso 1 |

Precedencias, todas deliberadas: `unavailable` gana a todo (manda el gate y no el flag persistido, porque sin plataforma no hay guía que se pueda completar ni captura que pueda llegar; el flag vive en el keychain de ese mismo teléfono con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, así que no migra por backup), `off` gana a un recibo viejo, sin recibo manda `waiting-first` (no hay nada roto que arreglar) y **`broken-capture` gana a `working`** — el dato llegó, así que un tilde verde dejaría al usuario tranquilo mientras sus gastos entran en $0.

La pantalla **no monta nada** hasta que hidraten **los dos** stores del keychain (flag + recibo). Sin esa espera, alguien que lleva semanas capturando vería "Esperando tu primer pago…" durante un frame — y además los delays del stagger se eligen por fase, así que con una fase provisoria el orden de entrada dependería de cuánto tardó el keychain.

Las dos fallas de la primera prueba en device siguen cubiertas, pero ahora cada una aparece **sólo cuando toca**:

- **Se enteró tarde y por casualidad.** Configuró el atajo, hizo una compra real y no pasó nada; la pantalla no tenía forma de decir "esto anda" ni "todavía no me llegó nada". Hoy eso es la diferencia entre `waiting-first` y `working`, y el recibo del héroe es la única prueba de que la automatización quedó bien.
- **Las dos trampas de Atajos.** Dejó *"Preguntar antes de ejecutar"* prendido (la automatización pedía confirmación en vez de correr sola), y su automatización terminó ejecutando **un atajo suelto con valores fijos** en vez de tener la acción de Manifiesto adentro: una compra de $8.160 en Merpago se registró como "$4.400 en STARBUCKS", los valores de prueba. Las dos siguen advertidas **en el paso donde ocurren** (aviso compacto con tratamiento `ink.warn`, dentro del paso, no en una nota al pie) y repetidas como síntoma en **"Si no te funciona"**, ahora plegado.

Cada paso lleva su botón **adentro** (agregar el atajo en el 1, abrir Atajos en el 2 del camino corto y en el 1 del manual): antes flotaban al pie de la lista y no se sabía a qué paso pertenecían. El paso 3 no tiene botón y en cambio muestra el nombre del atajo como **chip** — es lo único que el usuario tiene que reconocer en la lista de la pantalla "Siguiente".

El recibo se guarda **al recibir** la captura, no al confirmarla (`recordApplePayCaptures` se llama en `handleCaptures` del host, antes de abrir el sheet): la pregunta que la pantalla responde es *"¿llega el dato?"*, no *"¿lo registraste?"*. Una captura salteada o descartada prueba igual que Atajos quedó bien armado. El registro es **monótono** — una captura sin resolver se re-ofrece en cada foreground, y sin esa guarda la pantalla retrocedería a un pago viejo justo después de pagar.

El copy del bloque `settings:applePay` está en **tuteo neutro Latam** (el estándar de la app desde 2026-06); quedaba en voseo hasta el rediseño, y se neutralizó entero junto con las dos keys de `gastos:applePay` (incluida la notificación "¿Registras este gasto?").

El gate de la pantalla distingue tres motivos de indisponibilidad, porque cada uno pide una acción distinta del usuario:

| Valor | Cuándo | Qué le decimos |
|---|---|---|
| `not-ios` | Android / web | "Por ahora esto sólo funciona en iPhone." |
| `needs-app-update` | iOS pero el módulo nativo no existe (build vieja) | "Actualiza Manifiesto para usar esta función." |
| `needs-ios-17` | iOS < 17 | El disparador "Transacción" no existe todavía |

---

## Runbook de mantenimiento: el atajo canónico

El atajo "Manifiesto" que se distribuye es un **artefacto de producto**: no vive en el repo, vive en la biblioteca de Atajos del owner y se publica como link de iCloud. Este es el procedimiento completo.

### Cómo se crea (y por qué no se puede armar de cero)

Un atajo suelto **no deja elegir "Transacción" como tipo de entrada**: esa opción no está en la UI de Atajos: sólo aparece cuando el atajo la trae horneada en su archivo. Sin ese tipo de entrada, las variables Cantidad/Comercio no existen y no hay nada que cablear.

La salida es partir de un atajo que ya lo tenga:

1. Importar el **Transaction Handler** público de gluebyte: `icloud.com/shortcuts/510c6d15f4d844d69f64180c69f54589`. Trae el tipo de entrada "Transacción" ya definido.
2. Vaciarle las acciones propias y dejar una sola: **Manifiesto → Registrar gasto**.
3. Llenar sus dos campos con la variable **"Entrada del atajo"** y elegir la propiedad de cada uno: **Cantidad** en el campo Monto, **Comercio** en el campo Comercio. (Apple al monto lo llama **Cantidad**, no "Monto" — nombrarlo mal en la guía fue un bug real.)
4. Renombrar el atajo a **"Manifiesto"**. Ese nombre es el que el usuario busca en la pantalla "Siguiente" de la automatización, y es el que nombra la guía de Ajustes.
5. Verificarlo con un pago real antes de compartirlo.

### Cómo se publica

Compartir el atajo → **Copiar enlace de iCloud** → pegar el link en `APPLE_PAY_SHORTCUT_ICLOUD_URL` (`mobile/features/apple-pay-capture/shortcut-link.ts`). Con la constante distinta de `null`, la pantalla de Ajustes cambia sola de modo.

### ⚠️ El link de iCloud es un snapshot INMUTABLE

Compartir un atajo sube una **copia congelada** en ese instante. Editar el atajo de la biblioteca **no** actualiza el link ya publicado, y quien lo agregó antes se queda con la versión vieja para siempre.

Consecuencias operativas:

- Cambiar el atajo canónico obliga a **compartirlo de nuevo** y a **actualizar la constante**, y hoy eso significa **build nueva**: el OTA está bloqueado en este branch.
- Los usuarios que ya lo agregaron **no se enteran**. Un cambio incompatible los deja rotos en silencio, exactamente el modo de falla que la fase `broken-capture` de la pantalla existe para atrapar.
- Por eso: **mantener el atajo canónico estable**. Es una sola acción con dos campos; no hay razón para tocarlo salvo que cambie el propio App Intent, y eso ya exige build nueva de todos modos.

### Qué pasa si el usuario lo borra o lo renombra

La automatización guarda una **referencia** al atajo, no una copia. Borrado o renombrado, la automatización queda apuntando a la nada y los pagos dejan de registrarse **sin ningún error visible**. Está documentado como síntoma en "Si no te funciona" (`settings:applePay.trouble.missingShortcut*`): volver a agregar el atajo desde la pantalla de Ajustes y re-elegirlo en la automatización.

---

## Gotchas operativos

- **No sale por OTA.** El intent es código nativo: cualquier cambio en `plugins/apple-pay-intent/` o `modules/apple-pay-capture/` exige build nativa y un envío a App Store. `APPLE_PAY_SHORTCUT_ICLOUD_URL` sí es JS, pero con el OTA bloqueado también viaja en una build.
- **El link de iCloud del atajo es inmutable.** Editar el atajo canónico no actualiza el link ya compartido: hay que volver a compartirlo y actualizar la constante (ver el runbook de mantenimiento).
- **`ios/build-device` rompe `pod install`.** El hook de React Native parsea plists binarios de ahí. Hay que sacarlo del camino antes de un prebuild (son ~3 GB de caché del usuario: moverlo, no borrarlo a ciegas).
- **El `.podspec` es obligatorio.** Sin él, el autolinking descarta el módulo entero y `isApplePayCaptureSupported()` devuelve `false` en una build que debería soportarlo.
- **El `.gitignore` se comía `modules/apple-pay-capture/ios/`** porque el patrón `ios` no estaba anclado. Si aparecen archivos nativos "que nadie borró", chequear eso primero.
- **Privacy Nutrition Labels:** comercio y monto son datos financieros. No cambia la categoría de datos que la app ya declara (los gastos ya viven en el servidor), pero el consentimiento in-app ahora es este switch y conviene que la declaración lo refleje antes de submitear.

---

## Verificación en device

El recorrido se corrió en un iPhone real con un pago de verdad (2026-08-08). Verificado:

1. La acción **Manifiesto → Registrar gasto** aparece en Atajos (el gate de la decisión #1). ✅
2. Pagar con NFC → llega la notificación local con monto y comercio correctos. ✅
3. Tocarla → la app abre en Gastos y sube el sheet precargado. ✅
4. Confirmar → el gasto aparece en el feed con el monto exacto. ✅
5. El armado con el **atajo pre-armado** (agregar el link → automatización → elegir "Manifiesto") deja los dos campos bien cableados sin tocar el teclado. ✅

Sigue sin correrse en device:

- Pagar de nuevo en el **mismo comercio** → la categoría presugerida.
- Volver a foreground → una captura ya confirmada **no reaparece**.
- Apagar el switch, pagar → no llega notificación ni se abre nada.
- La pantalla **dirigida por estado** (rediseño 2026-08-11): las cinco fases se cubren con tests de la función pura, pero ninguna se miró todavía en device — es 100% JS, así que entra por reload.
