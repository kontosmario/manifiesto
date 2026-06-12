# Share-to-Import — compartir una captura al share sheet de iOS y aterrizar en el wizard OCR

> **Fecha**: 2026-06-12 · **Estado**: aprobado por owner (brainstorm 2026-06-12)
> **Objetivo**: además de elegir una captura desde la galería DENTRO de la app,
> el usuario puede compartir una captura DESDE cualquier app (Fotos, banco,
> Mercado Pago) hacia Manifiesto vía el share sheet del sistema. La imagen
> entra al mismo pipeline Activity OCR → Import Review existente.

## Decisiones de producto (Q&A con owner)

| Pregunta | Decisión |
|---|---|
| Plataformas | **iOS ahora** (TestFlight); Android queda configurado por la misma lib pero sin testear hasta el launch de Play Store |
| App bloqueada (Face ID/PIN) | **Unlock primero, wizard después** — la imagen espera en cola; nunca se procesa contenido antes de autenticar |
| Cantidad de imágenes | **Una sola** en v1. Si llegan varias, se toma la primera + toast "Procesamos la primera captura". Multi-captura en cola = iteración futura |

## Approach elegido

**`expo-share-intent@~5.1.1`** (config plugin; la línea 5.x es la compatible
con Expo SDK 54 — v6=SDK 55, v7=SDK 56; pinear con `~`).

- El plugin genera en prebuild la **Share Extension nativa de iOS** (target
  separado + App Group `group.com.manifiesto.mobile.ZKYQF7UNYA` que maneja
  EAS) y los **intent-filters de Android** (`image/*`).
- Del lado JS, `useShareIntent()` entrega `{ files: [{ path, mimeType }] }`
  cuando la app despierta por un share.

Descartados: share extension artesanal en Swift (esfuerzo 5-10× sin beneficio
para este caso) y Atajos de iOS (UX con saltos visibles, archivo por URL
scheme frágil, no es "Manifiesto en el share sheet").

## Arquitectura

```
[Otra app] → Compartir → [Share Extension nativa]
                              │  guarda imagen en App Group
                              ▼  relanza/foreground Manifiesto
[App root] useShareImportListener (guard Expo Go)
                              │  push URI
                              ▼
            pending-share-store  (módulo puro, 1 slot)
                              │  consume cuando:
                              │   · auth flow en fase `app` (desbloqueado)
                              │   · familyId + categorías listos
                              ▼
            ShareImportHost (tabs layout)
                              │  overlay "Leyendo tu captura…"
                              ▼
            openImportFromUri(uri, ctx)   ← refactor de open-import-flow
                              │  parseActivity + mapToReviewRows
                              ▼
            ImportReviewSheet (wizard existente, sin cambios)
                              ▼
            useConfirmImport → createExpense×N / createIncomeEvent×M
```

## Módulos

### Nuevos — `mobile/features/share-import/`

| Archivo | Responsabilidad | Depende de |
|---|---|---|
| `pending-share-store.ts` | Estado puro de 1 slot: `setPending(uri)`, `consumePending(): string \| null`, `subscribe(listener)`. Patrón module-store (como `toast-bus`). Sin React | nada |
| `use-share-import-listener.ts` | Hook montado UNA vez en el root layout. Envuelve `useShareIntent()` con guard de entorno (Expo Go / módulo ausente → no-op). Al recibir share: toma la PRIMERA imagen (`mimeType image/*`), `setPending(path)`, `resetShareIntent()`. Si había >1 archivo → `toast.info('Procesamos la primera captura')` | expo-share-intent (lazy require), pending-share-store, toast-bus |
| `use-share-import-gate.ts` | Hook del host: `subscribe` al store + espera compuertas (`useAuthFlow` fase `app`, familyId definido, categorías cargadas). Cuando todo está listo → `consumePending()` y dispara el callback con la URI. Si el wizard ya está abierto, espera a que cierre (re-chequea on close) | pending-share-store, auth-flow, session |

### Nuevos — componentes

| Archivo | Responsabilidad |
|---|---|
| `mobile/components/import-review/share-import-host.tsx` | Montado en el layout de tabs. Usa `use-share-import-gate` + `useImportWizardContext` (abajo). Al recibir URI: overlay de loading ("Leyendo tu captura…" con spinner, estilo del design system) → `openImportFromUri` → monta su propia instancia de `ImportReviewSheet` con el `ReviewState` resultante. Errores → toast + overlay fuera |

### Refactors (quirúrgicos, sin cambio de comportamiento)

| Archivo | Cambio |
|---|---|
| `mobile/features/import-review/open-import-flow.ts` | Extraer `openImportFromUri(uri: string, ctx: MapContext): Promise<OpenImportResult>` (parse + map — el bloque post-picker actual). `openImportFlow` (picker) la llama. Export de ambas |
| `mobile/components/navigation/add-expense-tab-button.tsx` | El cableado de contexto del wizard (MapContext: categorías + usd_exchange_rate; props de confirm) se extrae a un hook compartido `mobile/features/import-review/use-import-wizard-context.ts` para que el tab button y `ShareImportHost` no lo dupliquen. El tab button mantiene su propia instancia del sheet (picker path) |
| `app.config.ts` | Plugin `expo-share-intent` con `iosActivationRules: { NSExtensionActivationSupportsImageWithMaxCount: 1 }` y `androidIntentFilters: ['image/*']`. Comentario con el porqué (estilo del archivo) |

## Gating de seguridad (decisión owner)

La URI compartida NO se procesa (ni OCR ni parse) hasta que el auth flow está
en fase `app` (sesión + unlock completos). El share con app bloqueada hace:
cold start → splash → Face ID → fase `app` → recién ahí `consumePending()` →
overlay → wizard. La imagen vive solo como path del App Group mientras espera;
no se lee su contenido.

## Casos borde

| Caso | Comportamiento |
|---|---|
| OCR no encuentra movimientos | Empty state existente del wizard ("No encontramos movimientos") — sin trabajo nuevo |
| Share sin sesión (logged out) | URI espera en el store; tras login + datos listos aterriza el wizard |
| Share con wizard ya abierto | La nueva captura espera; al cerrar el wizard actual el gate re-chequea y la procesa. Toast "Tenés una captura esperando" al recibirla |
| Varias imágenes compartidas | Primera + `toast.info` |
| Tipo no-imagen (PDF, texto) | iOS: la activation rule evita que Manifiesto aparezca para esos tipos. Si igual llega un file no-imagen (Android laxa), se ignora con toast de error |
| Expo Go | `use-share-import-listener` detecta módulo ausente (try/catch en require + `Constants.appOwnership === 'expo'`) → no-op total. La app bootea normal |
| Share repetido de la misma imagen | Sin dedupe en v1 — el wizard igual pide confirmación humana por movimiento |

## Testing

- **Unit (vitest, node env)**: `pending-share-store` (set/consume/subscribe);
  reducer del gate si queda lógica pura extraíble; `openImportFromUri` NO se
  testea directo (depende de ML Kit nativo) — ya cubierto vía parser tests.
- **Tipos/lint**: `npm run validate` (recordar: NO bundlea — ver abajo).
- **Bundle**: `npx expo export --platform ios` tras agregar la dep
  (lección pbkdf2: validate verde ≠ Metro feliz).
- **Device (obligatorio, nativo)**: `npx expo prebuild --clean` +
  `npx expo run:ios` en device del owner → compartir desde Fotos →
  verificar: aparece en share sheet, cold start + Face ID + wizard,
  warm start con app abierta, share con wizard abierto.
- **Expo Go regression**: la app bootea y los dev journeys corren.

## Release

- Requiere **build nativa nueva** (share extension + App Group) → bump
  `buildNumber`, EAS build + TestFlight. **NO sale por OTA.**
- Provisioning: EAS registra el App Group y el perfil de la extensión
  automáticamente (puede pedir re-sync de credenciales — owner presente).
- Android queda compilado con sus intent-filters pero sin QA — se prueba
  cuando haya device/launch Android.

## Fuera de scope (v1)

- Multi-captura en cola.
- Compartir PDFs de resumen bancario (parser no los soporta).
- Procesamiento dentro de la share extension (preview sin abrir la app).
- Dedupe de imágenes ya importadas.
