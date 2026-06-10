# Screenshots & Marketing Assets

> **Owner-prepared assets**, importados al repo 2026-06-10.
> Para el contexto de uso ver [`docs/marketing/app-store-listing-source.md`](../app-store-listing-source.md) §11.

## Estructura

```
docs/marketing/screenshots/
├── README.md                    (este archivo)
├── PROMPT.md                    (prompt usado para regenerar a Apple specs)
├── v1.0/
│   ├── source/                  (assets crudos del owner — 768×1376 px, batch 1)
│   │   ├── 01-home-hero.jpg
│   │   ├── 02-wrapped.jpg
│   │   ├── ...
│   │   └── 09-splash.jpg
│   └── final/                   ✅ READY FOR UPLOAD — 1320×2868 px (Apple 6.9")
│       ├── 01-home-hero.png
│       ├── 02-wrapped.png
│       ├── 03-asistente.png
│       ├── 04-gastos-calendar.png
│       ├── 05-fijos.png
│       ├── 06-control.png
│       ├── 07-quick-add.png
│       ├── 08-add-expense.png
│       └── 09-splash.png
└── marketing-scenes/            (composiciones para redes/sitio, NO App Store)
    ├── composite-3-phones.jpg      (v1, 1376×768 landscape)
    ├── composite-3-phones-v2.png   (v2 regenerado, 1408×3040 portrait)
    └── landscape-collage.jpg       (5 iPhones, sirve para OG image)
```

## ✅ Estado actual: READY for App Store upload

Owner regeneró los 9 screenshots con **Nano Banana / Flow** (Gemini Image Gen) a 1408×3040 (aspect ratio 0.4632 — esencialmente nativo iPhone 6.9"). Los downscaleamos 6% a **1320×2868 exact** y están en `v1.0/final/`. **Listos para subir a App Store Connect.**

### Tamaños verificados

| File | Dimensions | OK |
|---|---|---|
| `01-home-hero.png` → `09-splash.png` | 1320×2868 px | ✅ matches Apple iPhone 6.9" requirement |

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

## Historial del gap de specs (RESUELTO ✅)

**Cómo se resolvió** (timeline 2026-06-10):

1. **Batch 1 (768×1376)**: owner generó los primeros 9 assets con AI image gen, pero quedaron en aspect ratio 5.5" iPhone (no native 6.9"). NO uploadeable a App Store.
2. **Decisión**: Opción A del README anterior — re-renderizar a tamaño nativo.
3. **Batch 2 (1408×3040)**: owner regeneró con **Nano Banana / Flow** (Gemini Image Gen) usando el prompt de `PROMPT.md`. Output 1408×3040 (aspect ratio 0.4632 vs Apple 0.4603 — 0.6% off, esencialmente nativo).
4. **Downscale a 1320×2868**: con `sips -z 2868 1320` para exact match Apple requirement.
5. ✅ **9 PNGs en `final/`**, dimensiones verificadas, listos para upload.

### Comando usado para downscale

```bash
sips -z 2868 1320 input.png --out output.png
```

> 💡 Para futuras regeneraciones: si Nano Banana sigue dando 1408×3040, el comando arriba sirve idéntico. Si cambia el output size, ajustar el `-z` o usar `--resampleHeightWidth`.

## Referencias

- [Listing source doc §11](../app-store-listing-source.md#11--screenshots--app-preview-item-h3-del-ready-pendientes)
- [Apple HIG App Store Marketing](https://developer.apple.com/design/human-interface-guidelines/app-store-marketing-and-promotion)
