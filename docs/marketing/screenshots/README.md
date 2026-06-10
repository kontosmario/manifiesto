# Screenshots & Marketing Assets

> **Owner-prepared assets**, importados al repo 2026-06-10.
> Para el contexto de uso ver [`docs/marketing/app-store-listing-source.md`](../app-store-listing-source.md) §11.

## Estructura

```
docs/marketing/screenshots/
├── README.md                    (este archivo)
├── v1.0/
│   └── source/                  (assets crudos del owner — 768×1376 px)
│       ├── 01-home-hero.jpg
│       ├── 02-wrapped.jpg
│       ├── 03-asistente.jpg
│       ├── 04-gastos-calendar.jpg
│       ├── 05-fijos.jpg
│       ├── 06-control.jpg
│       ├── 07-quick-add.jpg
│       ├── 08-add-expense.jpg
│       └── 09-splash.jpg
└── marketing-scenes/            (composiciones para redes/sitio, NO App Store)
    ├── composite-3-phones.jpg
    └── landscape-collage.jpg
```

## Inventario y captions

### App Store screenshots (9 portrait)

Todos diseñados con el mismo template: title editorial arriba (en forest-deep + naranja para el énfasis), mockup de iPhone 16 Pro Max en el centro mostrando la app, subtítulo descriptivo abajo. Aspect ratio 768×1376 (~5.5" iPhone, **no native 6.9"** — ver § "Issue de specs" abajo).

| # | Filename | Caption arriba | Caption abajo | Pantalla mostrada |
|---|---|---|---|---|
| 01 | `01-home-hero.jpg` | "Tus finanzas, claras." | "Tu saldo del mes, de un vistazo." | Home/Inicio con hero card |
| 02 | `02-wrapped.jpg` | "Tu mes, en cifras." | "Cada cierre de ciclo, tu resumen estilo wrapped." | 2 iPhones con Cycle Wrapped |
| 03 | `03-asistente.jpg` | "Acciones que mueven la aguja." | "Detecta hábitos y suscripciones sin uso." | Asistente con insights |
| 04 | `04-gastos-calendar.jpg` | "Cada peso, a la vista." | "Calendario y categorías de todo el ciclo." | Gastos con calendario mensual |
| 05 | `05-fijos.jpg` | "Lo recurrente, en orden." | "Pagado, pendiente y aumentos detectados." | Fijos con timeline + alertas |
| 06 | `06-control.jpg` | "Sabé cuándo frenar." | "Proyección diaria hasta el próximo sueldo." | Control con proyección de saldo |
| 07 | `07-quick-add.jpg` | "Cargá en segundos." | "Gasto, ingreso o captura importada." | Quick action menu (Gasto / Importar / Día sin gasto / Ingreso / Fijo) |
| 08 | `08-add-expense.jpg` | "Categorías que entendés." | "Montos rápidos y notas opcionales." | Formulario "Agregar gasto" con categorías |
| 09 | `09-splash.jpg` | "Tus finanzas, claras." | "Control de gastos, hecho simple." | Splash con logo (low-info, secundario) |

### Marketing scenes (2 — para redes / sitio público)

Composiciones con múltiples iPhones — **NO sirven para App Store screenshots** (Apple quiere pantallas con device frame único). Útiles para:
- Posts de Twitter / Instagram / LinkedIn de lanzamiento
- Hero del sitio web (eventualmente reemplazar el actual)
- OG image para social sharing

| Filename | Composición | Uso recomendado |
|---|---|---|
| `composite-3-phones.jpg` | 3 iPhones portrait con "Manifiesto" + "Tus finanzas, claras." | Hero alternativo del sitio, post de anuncio en redes |
| `landscape-collage.jpg` | 5 iPhones landscape mostrando todas las pantallas + logo | OG image para share en redes, banner de blog |

## Orden recomendado para App Store Connect

Según §11 del [source doc del listing](../app-store-listing-source.md#11--screenshots--app-preview-item-h3-del-ready-pendientes), los 3 primeros screenshots se llevan el peso de la decisión de install (Apple solo muestra esos en la página de búsqueda). Orden propuesto para los 5-7 primeros:

| Slot | Asset | Por qué en esta posición |
|---|---|---|
| **1** | `01-home-hero.jpg` | Hero. Comunica el dolor principal (entender en qué se va la plata) en el primer scan |
| **2** | `02-wrapped.jpg` | Asset único + compartible en redes. Le habla al 18-30 que comparte Wrapped. Refuerza diferenciador |
| **3** | `03-asistente.jpg` | Cierra el hook ("ahorrar sin saber de finanzas") — el Asistente es el equivalente al coach |
| **4** | `04-gastos-calendar.jpg` | Demuestra densidad de info sin sobrecargar (refuerza "calmo") |
| **5** | `05-fijos.jpg` | Feature alto valor para target principal: "lo recurrente, en orden" |
| 6 (opcional) | `06-control.jpg` | Para el segmento que quiere proyección / "sabé cuándo frenar" |
| 7 (opcional) | `07-quick-add.jpg` | Refuerza simplicidad ("cargás en segundos") |

> 📝 `08-add-expense.jpg` y `09-splash.jpg` quedan como **backup**. El splash es low-info, va último o se omite. El add-expense es útil pero redundante con `07-quick-add.jpg`.

## ⚠️ Issue de specs: 768×1376 vs Apple required 1320×2868

**Los assets actuales NO entran directamente en App Store Connect.**

Apple requiere screenshots de iPhone 6.9" en **exactamente 1320×2868 px** (portrait). Los assets están en **768×1376 px** (~aspect ratio 5.5" iPhone, equivalente a iPhone 8 Plus).

| | 768×1376 (actual) | 1320×2868 (required) |
|---|---|---|
| Megapixels | 1.06 MP | 3.78 MP |
| Diferencia | — | **3.57× más grande, factor de upscale 1.72×** |
| Aspect ratio | 0.558 | 0.460 |

### Opciones para resolver

| Opción | Esfuerzo | Calidad | Recomendado |
|---|---|---|---|
| **A) Re-renderizar en el tool original a tamaño nativo 1320×2868** | Bajo (si tenés acceso al source en Figma/Sketch/etc.) | ⭐⭐⭐⭐⭐ Excelente | ✅ **Mejor opción** |
| B) Upscale 1.72× con AI (Topaz, ESRGAN, Replicate API) | Medio | ⭐⭐⭐⭐ Buena, texto puede tener artifacts | Si A no es viable |
| C) Upscale con `sips`/`convert` bicúbico | Bajo | ⭐⭐ Borroso, NO recomendado para producción | Solo emergencia |
| D) Capturar screenshots nativos desde iPhone 16 Pro Max + re-componer con captions | Alto | ⭐⭐⭐⭐⭐ Perfecto | Solo si A/B no funcionan |

**Adicional**: el aspect ratio (0.558 → 0.460) significa que hay que **recortar o re-flow el layout** además de upscale. Un upscale puro distorsionaría las proporciones.

### Estado actual

Los 9 assets están commiteados como **source** (no listos para App Store). Antes del submit a Apple (H8) hay que:
1. Decidir cuál de A/B/C/D usar
2. Generar la versión final a 1320×2868
3. Guardar en `docs/marketing/screenshots/v1.0/final/` (carpeta a crear cuando estén listos)

## Referencias

- [Listing source doc §11](../app-store-listing-source.md#11--screenshots--app-preview-item-h3-del-ready-pendientes)
- [Apple HIG App Store Marketing](https://developer.apple.com/design/human-interface-guidelines/app-store-marketing-and-promotion)
