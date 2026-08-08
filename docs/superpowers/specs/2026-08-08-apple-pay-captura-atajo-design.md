# Captura de gastos desde Apple Pay vía Atajo — diseño

Fecha: 2026-08-08
Estado: aprobado por el owner, listo para plan de implementación
Antecedente: la feasibility de plataforma está **cerrada y verificada** (2026-06-29,
13 agentes + verificación adversarial). No re-investigar la parte de plataforma.

## Problema

Cuando el usuario paga con Apple Pay, Manifiesto no se entera. El gasto se
carga a mano después (o no se carga). iOS no expone ninguna API que entregue
transacciones de Apple Pay a apps de terceros: el Device Account Number vive
aislado en el Secure Element, FinanceKit sólo cubre Apple Card/Cash/Savings de
EE.UU. y bancos del Reino Unido, y leer la notificación del banco es imposible
en iOS.

La **única puerta sancionada por Apple** es el disparador "Transacción" de
Atajos (iOS 17+, renombrado "Wallet" en iOS 26), que se dispara con taps NFC
físicos y expone tarjeta, comercio y monto. El usuario arma la automatización a
mano — no existe API para crearla por código, y eso mismo funciona como
consentimiento explícito.

## Objetivo

Que un pago con NFC llegue a la app con monto y comercio ya cargados, y que
registrarlo cueste un toque. La captura **nunca** escribe en los números del
usuario sin confirmación.

Explícitamente fuera de alcance: pagos in-app, pagos web, pagos con la tarjeta
física, y todo Android. Esto capta la tajada NFC; el alta manual y el import
por OCR siguen siendo la base.

## Decisión de transporte: App Intent nativo

Se evaluaron tres caminos. El App Intent gana en las dos dimensiones de
fricción a la vez, y el costo cae del lado del desarrollo, no del usuario.

| Camino | Setup (una vez) | Uso diario |
|---|---|---|
| **App Intent nativo** | Elegir la acción "Manifiesto" de la lista de Apps + insertar 2 variables | Silencioso, instantáneo, **funciona sin internet** |
| Deep link (`manifiesto://`) | Tipear la URL a mano en el teclado del iPhone | **Abre la app** en cada pago |
| Webhook (POST a Edge Function) | URL + método + header + JSON + pegar un token | Silencioso, pero **pierde el pago si no hay señal** (Atajos no reintenta) |

El webhook era el candidato barato y resultó el peor para el usuario: único que
pide pegar un secreto y único que puede perder datos por falta de conectividad.

Referencia externa: TravelSpend, la implementación líder de esta integración,
usa exactamente un App Intent nativo. Su setup son 7 pasos con 5 campos, de los
cuales sólo 2 son inserciones de variable.

**Consecuencia arquitectónica clave: no hay servidor en este flujo.** Ni Edge
Function, ni tabla nueva, ni token por usuario. Todo ocurre en el dispositivo.
El pago queda capturado aunque el teléfono esté sin señal en un subsuelo.

## Flujo

1. El usuario paga con NFC.
2. iOS dispara la automatización y despierta a Manifiesto **en segundo plano**.
3. El App Intent guarda un registro de captura y postea una **notificación
   local**: *"Pagaste $4.500 en STARBUCKS — tocá para registrarlo"*.
4. El usuario toca la notificación. `NotificationRouterBridge` la rutea (ya
   respeta el app-lock y espera a que el viaje de auth esté en `ready`).
5. La app drena las capturas pendientes y abre la hoja de revisión con monto,
   comercio y categoría sugerida precargados.
6. El usuario confirma. Recién ahí se inserta en `expenses`.

Si el usuario ignora la notificación, la captura queda pendiente y se drena la
próxima vez que la app pasa a primer plano.

## Componentes

### 1. El App Intent (Swift, target principal)

`ManifiestoLogExpenseIntent` declara dos parámetros — Monto y Comercio — y es
lo que el usuario ve en la lista de acciones de Atajos.

- `openAppWhenRun = false`: no abre la app. Corre en background, guarda y
  notifica.
- **El monto se recibe y se guarda como `String`, sin parsear en Swift.** Llega
  como texto de moneda con signo (`$4.500,00`) y los separadores argentinos son
  el lugar clásico donde esto se rompe. El parseo vive en JS, en una función
  pura con tests.
- Postea un `UNNotificationRequest` con `data.url` apuntando a la ruta de
  Gastos. **La notificación sólo trae la app al frente; no navega a una
  pantalla propia.** El drenaje y la apertura del sheet los hace el host al
  detectar foreground, igual que el share-to-import. Así el bridge de
  notificaciones existente funciona sin un solo cambio en su lógica, y una
  captura entra por el mismo camino haya llegado por tap en la notificación o
  por abrir la app a mano.

**Ubicación: el `.swift` va en el target principal de la app, inyectado por un
config plugin — NO dentro de un módulo Expo.** Los módulos Expo compilan como
Pod de CocoaPods, y los App Intents que viven en una librería estática pueden
no ser indexados por el `appintentsmetadataprocessor`, con lo cual la acción
nunca aparecería en Atajos. Ver Riesgos.

### 2. Almacenamiento de capturas

`UserDefaults.standard`, clave `manifiesto.applePay.pendingCaptures`, con un
array JSON de:

```
{ id: string, merchantRaw: string, amountRaw: string, capturedAt: string }
```

`id` es un UUID generado en Swift (idempotencia al drenar). `capturedAt` es
ISO-8601 y representa el **instante** del pago: el mapper lo pasa al día LOCAL
del usuario (`formatLocalDateKey`), nunca corta el string, porque en Argentina
(UTC-3) toda compra después de las 21:00 cae en el día UTC siguiente. **Tope de
50 registros, descartando los más viejos**, para que la lista no crezca sin
límite si el usuario nunca abre la app.

`UserDefaults.standard` alcanza porque el intent corre en el proceso de la app
principal. Si Apple llegara a moverlo a un proceso de extensión, haría falta un
App Group (entitlement + reprovisioning) — anotado como plan B, no se
implementa ahora.

### 3. El puente a JS (módulo Expo local)

`modules/apple-pay-capture/` expone tres cosas:

- `isSupported: boolean` — **sólo responde "¿existe el módulo nativo?"**, es
  decir si la build es lo bastante nueva y no estamos en Expo Go. La versión de
  iOS es un gate distinto: el intent compila y corre desde iOS 16, pero el
  disparador "Transacción" existe recién en iOS 17. Se resuelven por separado
  porque los mensajes al usuario son distintos ("actualizá la app" vs
  "actualizá iOS").
- `getPendingCaptures(): PendingCapture[]`
- `clearCaptures(ids: string[]): void` — por id, no un `clear()` ciego, para no
  perder una captura que entró entre la lectura y el borrado.

El módulo **sólo hace de puente de lectura**. No contiene el intent.

### 4. La bandeja: reuso del sheet de Import Review

No se inventa pantalla nueva. El wizard de revisión del OCR ya es una capa de
revisión genérica; su punto de corte natural es `ReviewState`, que el sheet
recibe como prop `initialState`. El share-to-import ya demostró que se lo puede
alimentar desde otra fuente.

Tres retoques acotados en código existente:

1. `ReviewState.imageUri` pasa a **opcional** (`mobile/features/import-review/types.ts:40`).
   Hoy es obligatorio y el header lo pinta como thumbnail 44×44; necesita
   fallback cuando no hay imagen.
2. `ReviewRow.source` se **generaliza** (`types.ts:30`). Hoy tipa duro contra
   `Transaction` de `activity-ocr`, aunque el sheet nunca lee ese campo para
   renderizar. Pasa a un union discriminado por origen (`ocr` | `apple-pay`).
3. `useConfirmImport` se vuelve **inyectable** (`mobile/components/import-review/import-review-sheet.tsx:78`).
   Hoy está hardcodeado adentro del sheet. El escape hatch `previewMode`
   (línea 234) ya cortocircuita ese confirm, así que el punto de extensión
   existe conceptualmente pero está tipado como booleano en vez de callback.

El controller, el reducer y toda la UI se reusan tal cual. Para Apple Pay las
filas entran siempre con `kind: 'expense'` (un tap NFC nunca es un ingreso).

### 5. Categoría que aprende del historial

Sin tabla nueva y sin lista de sinónimos que mantener. La sugerencia se
**deriva del historial que ya existe**: se busca el gasto más reciente cuya
descripción normalizada coincida con el comercio normalizado y se hereda su
`category_id`. La primera vez de cada comercio la elige el usuario; de ahí en
más viene presugerida.

Esto cierra el ítem de backlog ya documentado en `docs/sistemas/activity-ocr.md:325`.

Tres funciones puras, todas con tests de vitest:

- `parseShortcutAmount(raw): number | null` — resuelve `$4.500,00`,
  `4.500,00`, `$4,500.00`, `ARS 4.500`, `US$ 25.00`, `4.500,5`. Se valida la
  **forma completa** del monto contra las gramáticas de moneda (miles
  agrupados de a 3 con un separador consistente, y 1 o 2 decimales detrás del
  otro separador); lo que no encaja devuelve `null` en vez de adivinar. Un
  separador único seguido de 3 dígitos (`$4.500`) es de miles. Casos
  ambiguos de verdad (`1.234,567`, `4.500.00`) → `null`. Monto negativo =
  devolución: el signo se detecta por posición (menos antes del primer dígito
  o paréntesis envolventes al estilo contable, `($ 4.500,00)`), y la fila
  entra marcada como `skip` con warning, no se descarta en silencio.
- `normalizeMerchant(raw): string` — mayúsculas, NFD sin acentos, se eliminan
  los `#1234` de sucursal y los tokens puramente numéricos, se colapsan
  espacios. `STARBUCKS COFFEE #4521 CABA` tiene que matchear con `Starbucks`.
- `resolveCategoryForMerchant(expenses, merchantRaw): string | null` — match por
  conjunto de tokens (uno contenido en el otro), desempate por recencia.
  Devuelve `null` sin dudar cuando no hay match: preseleccionar una categoría
  equivocada es peor que no preseleccionar ninguna, que es exactamente la razón
  por la que el OCR deja `categoryId: null` a propósito
  (`mobile/features/import-review/map-to-review-rows.ts:76`).

### 6. Configuración en Ajustes

**Un solo switch de prender/apagar.** El comportamiento es siempre el mismo:
notificación local y bandeja. Sin modos, sin monto mínimo.

La pantalla contiene además:
- Los pasos ilustrados de cómo armar la automatización.
- Un botón que abre `shortcuts://create-automation` directo.
- Gate de **iOS 17+**: por debajo, el disparador no existe. El deployment
  target del proyecto es 15.5, así que hay usuarios reales del otro lado del
  gate y la pantalla tiene que explicarlo, no romperse.
- **Sólo iOS.** Android no tiene equivalente; la fila no se muestra.

El flag se persiste en `persistent-kv`. Con el switch apagado, el drenaje ni
siquiera corre.

## Archivos

**Nuevos**

| Archivo | Qué es |
|---|---|
| `plugins/apple-pay-intent/ManifiestoLogExpenseIntent.swift` | El App Intent |
| `plugins/with-apple-pay-intent.cjs` | Config plugin: copia el `.swift` al target principal y lo agrega al build phase de Sources |
| `modules/apple-pay-capture/` | Módulo Expo local (puente de lectura) |
| `mobile/features/apple-pay-capture/parse-shortcut-amount.ts` | + test |
| `mobile/features/apple-pay-capture/normalize-merchant.ts` | + test |
| `mobile/features/apple-pay-capture/resolve-category-for-merchant.ts` | + test |
| `mobile/features/apple-pay-capture/map-captures-to-review-rows.ts` | + test |
| `mobile/features/apple-pay-capture/use-apple-pay-capture-gate.ts` | Drenaje en foreground; espeja `use-share-import-gate.ts` |
| `mobile/features/apple-pay-capture/apple-pay-enabled-store.ts` | Flag persistido |
| `mobile/components/apple-pay-capture/apple-pay-capture-host.tsx` | Host; espeja `share-import-host.tsx` |
| `app/(app)/settings/apple-pay.tsx` + `mobile/screens/settings/apple-pay-screen.tsx` | Pantalla de configuración |

**Modificados**

| Archivo | Cambio |
|---|---|
| `mobile/features/import-review/types.ts` | `imageUri` opcional, `source` genérico |
| `mobile/components/import-review/import-review-sheet.tsx` | `onConfirm` inyectable |
| `mobile/components/import-review/import-review-header.tsx` | Fallback sin thumbnail |
| `app/(app)/(tabs)/_layout.tsx` | Montar el host |
| `mobile/screens/settings/settings-screen.tsx` | Fila de acceso |
| `app.config.ts` | Registrar el plugin + `buildNumber` 15 |
| `mobile/lib/i18n/locales/{es,en}/settings.json` y `notifications.json` | Copy nuevo, paridad ES/EN |

## Manejo de errores

- **Monto no parseable**: la fila entra con warning y monto vacío. El usuario
  lo completa a mano. Nunca se adivina un número.
- **Comercio vacío**: warning `no-merchant`, descripción vacía, el usuario la
  escribe. El sheet ya valida que la descripción no sea vacía.
- **Devolución (monto negativo)**: fila en `skip` con warning visible.
- **Duplicados**: `clearCaptures(ids)` borra por id sólo lo efectivamente
  drenado. Una captura que entre durante el drenaje sobrevive.
- **Módulo nativo ausente** (Expo Go, build vieja): `isSupported` en `false`;
  la pantalla de Ajustes explica que hace falta actualizar. Nada revienta.
- **Bandeja desbordada**: tope de 50, se descartan las más viejas.

## Testing

- **Vitest** para las cuatro funciones puras. `parse-shortcut-amount` es la más
  crítica: casos ARS, USD, negativos, sin decimales, con símbolo pegado y
  separado.
- **El Intent se prueba a mano en device.** Este proyecto **no corre en
  simulador en Apple Silicon** — ML Kit trae un fat binary con arm64 de device
  y `excluded_archs` lo bloquea. No hay atajo acá.
- El sheet reusado ya tiene su cobertura; los tests existentes de import-review
  tienen que seguir verdes tras generalizar `source` e `imageUri`.

## Riesgos

**1 — App Intents dentro de un Pod pueden no indexarse.** Es el riesgo que
puede cambiar la forma del diseño. Mitigación ya incorporada: el `.swift` va al
target principal vía config plugin. **Primer paso de implementación: spike en
device con un intent mínimo, confirmando que aparece en Atajos, antes de
construir nada encima.**

**2 — El disparador es *flaky*.** Apple lo documenta en sus propios foros. Se
pierden capturas ocasionalmente, y es best-effort si el teléfono está bloqueado.
El copy de la pantalla de Ajustes no puede prometer captura perfecta.

**3 — No sale por OTA.** Es build nativa nueva (15) y pasa por review de Apple.

**4 — Fricción de onboarding alta.** Cada usuario arma su automatización a
mano. Es irreductible: Apple no expone API para crearla. La pantalla de
configuración es, en los hechos, el producto.

**5 — Privacy labels.** Comercio y monto son datos financieros. No cambia la
categoría de datos que la app ya declara (los gastos ya viven en el servidor),
pero el consentimiento in-app es el switch, y la declaración de App Store
Connect hay que revisarla antes de submitear.

## Fuera de alcance

- Deep link `manifiesto://` como camino alternativo. Descartado: peor en uso
  diario y el App Intent lo cubre entero.
- Webhook / Edge Function. Descartado por fricción de token y pérdida de datos
  sin señal.
- Modos de comportamiento y monto mínimo configurable. Decisión del owner:
  un solo switch.
- Semilla de sinónimos comercio→categoría para el arranque en frío. Decisión
  del owner: sólo aprendizaje del historial.
- Android.
