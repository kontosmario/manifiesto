# Prompt para regenerar screenshots de App Store

> **Para qué**: regenerar los 9 screenshots de `v1.0/source/` a tamaño nativo de Apple **1320×2868 px (iPhone 6.9")** sin perder el branding y la consistencia visual.
> **Cuándo usar**: cada vez que actualicen los screenshots (cambia una feature, hay una v1.1, regenerar después de un cambio de branding).
> **Herramienta sugerida**: GPT image generation (gpt-image-1 / Sora 2 image), Ideogram, o Midjourney V6+. Razones en §"Notas por herramienta" abajo.

---

## 1 · Cómo usar este doc

Para cada screenshot:
1. Sacá un **screenshot nativo de la app** desde TestFlight con la cuenta `apple.review@manifiestoapp.com` en un iPhone 16 Pro Max (1320×2868 nativo).
2. Pasalo como **reference image** al modelo + el prompt correspondiente del §3.
3. El modelo te genera el mockup + caption + background ambient blobs alrededor de tu screenshot real.
4. Output deseado: PNG a 1320×2868 px (o el más alto que el modelo soporte → upscale al final).

> 💡 Si el modelo no llega a 1320×2868 directamente, generá al máximo portrait que soporte (típicamente 1024×1792 o 1080×1920) y después upscaleá con `sips` o un servicio AI (Topaz/Real-ESRGAN). El detalle más sensible es el texto del caption y el contenido dentro del iPhone — si son nítidos en el output base, sobreviven el upscale.

---

## 2 · Style guide (consistente para los 9)

Este bloque va en **TODAS** las generaciones como prefijo. Captura el look-and-feel del template existente.

```
App Store screenshot for "Manifiesto", a personal finance app made in Argentina.

VISUAL STYLE:
- Portrait orientation, 1320×2868 px (iPhone 6.9" / iPhone 16 Pro Max native).
- Background: warm cream/off-white (#F5F1E8 base) with subtle scattered ambient blobs in soft sage green (#C8DDB8 with 30% opacity). Tiny dot particles scattered, very subtle. Calm, editorial, breathable composition. NO clutter, lots of negative space.
- Centered iPhone 16 Pro Max mockup, photorealistic, titanium frame finish, slight subtle shadow underneath. Phone occupies the center 60% of the canvas vertically.
- Title text ABOVE the phone (top 18% of canvas): bold editorial sans-serif (similar to Söhne, Inter Bold, or Helvetica Now Display), 2-3 word title where ONE key word is highlighted in warm coral/peach (#E8976A). Forest-deep green (#0F2E1F) for the rest. Tight line height, ends with a period.
- Subtitle text BELOW the phone (bottom 7%): muted forest green (#3D5A4A), regular weight, single line, descriptive, ends with a period.
- Status bar inside the iPhone: 10:57 time, full signal/wifi, battery 97%.
- The iPhone screen shows the actual Manifiesto app UI (provided as reference image).

TYPOGRAPHY:
- Title: ~80-100 px font size, tight tracking, period at end for editorial weight.
- Subtitle: ~32-36 px, comfortable reading line height.
- DO NOT add any other text, watermarks, badges, "Available on App Store", or stickers.

LIGHTING & MOOD:
- Soft natural lighting, no harsh shadows or specular highlights.
- Calm, organized, premium-but-approachable.
- NOT a stock photography style. NOT corporate. NOT "fintech bro" aggressive.
- Style references: Linear's marketing, Things 3, Cron calendar, Readwise.

OUTPUT: Single image, no border, no padding additional to what's described.
```

---

## 3 · Prompts específicos por screenshot

Para cada uno: agarrá un screenshot nativo del app desde TestFlight, lo combinás con el style guide de §2 + uno de estos prompts específicos.

### 3.1 · `01-home-hero.jpg` (Home/Inicio)

**Screenshot a capturar**: pantalla principal Home con saldo del mes, sueldo, hero card grande.

**Caption arriba**: `Tus finanzas, **claras**.` (la palabra **claras** en coral)
**Caption abajo**: `Tu saldo del mes, de un vistazo.`

```
[STYLE GUIDE FROM §2]

Title: "Tus finanzas, claras." — "claras" word highlighted in coral (#E8976A), rest in forest-deep (#0F2E1F).

Subtitle: "Tu saldo del mes, de un vistazo."

iPhone screen content: Reference image attached — Manifiesto Home screen showing hero card with monthly balance ($1.697.280), daily allowance, salary countdown, recent activity feed.
```

### 3.2 · `02-wrapped.jpg` (Wrapped al cierre de mes — 2 iPhones)

**Screenshot a capturar**: 2 escenas del Cycle Wrapped — la del título ("Edición abril 2026 / Tu mes en cifras") y la final ("Tenés $X para administrar").

**Caption arriba**: `Tu mes, en **cifras**.` (cifras en coral)
**Caption abajo**: `Cada cierre de ciclo, tu resumen estilo wrapped.`

```
[STYLE GUIDE FROM §2]

Title: "Tu mes, en cifras." — "cifras" word in coral.
Subtitle: "Cada cierre de ciclo, tu resumen estilo wrapped."

IMPORTANT: This screenshot shows TWO iPhones, slightly overlapping, both tilted ~5° toward center. Left phone is slightly behind, right phone in front, partial overlap on lower-right corner of left phone.

Left iPhone screen: Reference image 1 — Wrapped intro scene "Edición abril 2026 — Tu mes, en cifras." cream background, editorial layout.

Right iPhone screen: Reference image 2 — Wrapped final scene "El próximo arranca hoy — Tenés $6.400.000 para administrar" forest-deep background, with "Empezar el próximo →" CTA at bottom.
```

### 3.3 · `03-asistente.jpg` (Coach Mode con insights)

**Screenshot a capturar**: pantalla Asistente con 2-3 cards de insights visibles.

**Caption arriba**: `Acciones que mueven la **aguja**.` (aguja en coral)
**Caption abajo**: `Detecta hábitos y suscripciones sin uso.`

```
[STYLE GUIDE FROM §2]

Title: "Acciones que mueven la aguja." — "aguja" word in coral.
Subtitle: "Detecta hábitos y suscripciones sin uso."

iPhone screen content: Reference image — Asistente screen with header "Asistente — 4 acciones que pueden mover la aguja" and "+$4.1M /mes potencial" badge in green. Below, 3 cards showing insights: 1) "Otros +485% vs promedio" with explanation and red CTA, 2) "Quedan 10 días con $1.057.287 disponibles" with budget suggestion, 3) "Claude AI: sin uso reciente" with cancel savings. Each card has "Entendido →" button in green.
```

### 3.4 · `04-gastos-calendar.jpg` (Gastos + calendario)

**Screenshot a capturar**: pestaña Gastos con la vista del calendario mensual visible debajo de la hero card de totales.

**Caption arriba**: `Cada peso, a la **vista**.` (vista en coral)
**Caption abajo**: `Calendario y categorías de todo el ciclo.`

```
[STYLE GUIDE FROM §2]

Title: "Cada peso, a la vista." — "vista" word in coral.
Subtitle: "Calendario y categorías de todo el ciclo."

iPhone screen content: Reference image — Gastos tab. Top: header "Gastos · Ciclo 20 may → 19 jun", green hero card "TOTAL VISIBLE $4.338.240" with bars showing top categories (Otros $3.220.600 · 74%, Servicios $402.999 · 9%, Mercado $293.956 · 7%). Below: monthly calendar grid "TU MES EN UN VISTAZO" with colored cells: muted greens for "bien" days, peaches for "alerta", red for "exceso". Bottom tab bar with Inicio/Gastos/+/Fijos/Control.
```

### 3.5 · `05-fijos.jpg` (Fijos con timeline y alertas)

**Screenshot a capturar**: pestaña Fijos con la hero card de progreso del mes y la lista de avisos.

**Caption arriba**: `Lo recurrente, en **orden**.` (orden en coral)
**Caption abajo**: `Pagado, pendiente y aumentos detectados.`

```
[STYLE GUIDE FROM §2]

Title: "Lo recurrente, en orden." — "orden" word in coral.
Subtitle: "Pagado, pendiente y aumentos detectados."

iPhone screen content: Reference image — Fijos tab. Top: header "Fijos", date range chip "20 MAYO → 19 JUNIO" with peach "1 VENCIDO" badge. Big green hero card showing "Ya pagaste $1.178.960" (left, 13 pagados) / "Te falta pagar $275.520" (right, 3 pendientes), with progress bar showing 81% paid. Below: "DINERO LIBRE $4.945.600 — 23% de tu sueldo va a fijos". Next section "POR PAGAR · ESTE MES" with items (Apple espacio $15.500 EN 3D, etc.) and "AVISOS" listing detected increases (Disney + +30%, Ecogas +13%, Cochera +6%).
```

### 3.6 · `06-control.jpg` (Control con proyección)

**Screenshot a capturar**: pestaña Control con la card del veredicto y la proyección de días.

**Caption arriba**: `Sabé cuándo **frenar**.` (frenar en coral)
**Caption abajo**: `Proyección diaria hasta el próximo sueldo.`

```
[STYLE GUIDE FROM §2]

Title: "Sabé cuándo frenar." — "frenar" word in coral.
Subtitle: "Proyección diaria hasta el próximo sueldo."

iPhone screen content: Reference image — Control tab. Header "Control — El estado de tus finanzas, día a día" with "70" score badge. Chip "Mi meta · $104k/día". Big green verdict card: "HOY · MIÉRCOLES 10 — Te quedás sin plata en 9 días. Bajá el ritmo o llegás justo al cobro." with "9" big number. Stats row: Racha 3d / VS MES +27% / SIN GASTOS 1 / AL COBRO 10d. Below: cream alert card "HASTA CUÁNDO TE ALCA... Saldo insuficiente — Al ritmo actual, el presupuesto se agota el día 31 del mes. RITMO $111k/día · CUPO $174k/día · SOBRANTE +$1.9M al cierre" with timeline bar.
```

### 3.7 · `07-quick-add.jpg` (Quick action menu)

**Screenshot a capturar**: el menú modal de quick add (Gasto / Importar / Día sin gasto / Ingreso / Gasto fijo) con la home blurreada de fondo.

**Caption arriba**: `Cargá en **segundos**.` (segundos en coral)
**Caption abajo**: `Gasto, ingreso o captura importada.`

```
[STYLE GUIDE FROM §2]

Title: "Cargá en segundos." — "segundos" word in coral.
Subtitle: "Gasto, ingreso o captura importada."

iPhone screen content: Reference image — bottom sheet "¿QUÉ CARGÁS?" with primary green CTA "+ Gasto →" then list of options below (each with icon): "Importar captura" (purple receipt icon), "Día sin gasto" (green leaf), "Ingreso" (blue trending up), "Gasto fijo" (calendar). The background of the screen is the Home view, BLURRED OUT for emphasis on the bottom sheet.
```

### 3.8 · `08-add-expense.jpg` (Agregar gasto con categorías)

**Screenshot a capturar**: formulario "Agregar gasto" con grid de 12 categorías de íconos.

**Caption arriba**: `Categorías que **entendés**.` (entendés en coral)
**Caption abajo**: `Montos rápidos y notas opcionales.`

```
[STYLE GUIDE FROM §2]

Title: "Categorías que entendés." — "entendés" word in coral.
Subtitle: "Montos rápidos y notas opcionales."

iPhone screen content: Reference image — "Agregar gasto" screen. Top: back arrow + "Agregar gasto" header. White card "MONTO $0 (Tap para editar)". Quick amount pills row: +$5k +$15k +$30k +$50k +$100k. Section "CATEGORÍA" with grid 4 columns × 3 rows: Mercado (cart), Ocio (cinema), Transporte (subway), Belleza (red dot), Otros (box), Regalos (gift), Mascotas (paw), Deporte (soccer), Restaurant (utensils), Ropa (shirt), Tecnología (computer), Viajes (plane). Below: "DESCRIPCIÓN" input "Ej: Supermercado" + "Agregar nota OPCIONAL" button. Bottom: muted "Guardar gasto" CTA with helper text "Completá monto, descripción y categoría para continuar".
```

### 3.9 · `09-splash.jpg` (Splash con logo — opcional/backup)

**Screenshot a capturar**: pantalla splash con leaf logo + "Manifiesto" wordmark.

**Caption arriba**: `Tus finanzas, **claras**.` (claras en coral)
**Caption abajo**: `Control de gastos, hecho simple.`

```
[STYLE GUIDE FROM §2 — pero con dos diferencias importantes]

OVERRIDE: Background is DEEP FOREST GREEN (#0F2E1F), not cream. Title text in white/cream with "claras" in light lime green (#A6EF8F). Subtitle in muted off-white.

Title: "Tus finanzas, claras." — "claras" word in light lime green (#A6EF8F), rest in soft cream.
Subtitle: "Control de gastos, hecho simple."

iPhone screen content: Reference image — splash screen, forest-deep background matching the surrounding canvas (almost edge-to-edge dark green), centered leaf icon (light lime green) above "Manifiesto." wordmark in bold white sans serif with small coral dot for the period. Subtle scattered green glow particles around the phone (the bloom effect).

This is a HERO ESTABLISHMENT shot, less info-dense than the others. Use it as opening or closing screenshot.
```

---

## 4 · Notas por herramienta

### GPT-4o / Sora image gen (recomendado)

- ✅ Excelente text rendering (las captions van a salir crisp)
- ✅ Soporta reference images
- ⚠️ Max output ~1024×1792 — vas a tener que upscale al final
- Prompt: pegá §2 + §3.x literal. Adjuntá el screenshot nativo del app como reference.

### Midjourney V6+

- ✅ Estilo editorial / minimal sale bien
- ⚠️ Text rendering todavía es flaky — puede que tengas que hacer 3-4 generations para uno que tenga el texto correcto
- Prompt: agregá `--ar 9:19.55 --v 6 --style raw --s 50` al final. `--s 50` mantiene fidelidad al prompt.

### Ideogram (mejor para text-in-image)

- ✅ El más confiable para que el texto salga correctamente
- ✅ Excelente con tipografías editoriales
- ⚠️ Resolución base más baja, requiere upscaler
- Aspect ratio: usá "Tall" (9:16) o el más cercano a 9:19.5 que ofrezca.

### Krea AI / Replicate (custom)

- Acceso a múltiples modelos (Flux, SDXL, etc.)
- ✅ Más control sobre upscale (Real-ESRGAN, 4x-UltraSharp)
- Workflow: generación inicial en cualquier modelo + upscale x2 con Real-ESRGAN

---

## 5 · Post-procesado a 1320×2868

Si el output del AI sale en un tamaño menor:

```bash
# Si la imagen sale a aspect ratio correcto pero tamaño menor:
sips --resampleHeightWidth 2868 1320 input.png --out output.png

# Si la imagen sale a aspect ratio distinto (e.g. 9:16):
# Hay que re-canvasear: rellenar el background o re-encuadrar el iPhone
# Esto se hace mejor en Figma/Photoshop manualmente que via script
```

> ⚠️ `sips` hace bicubic upscale — para AI-quality upscale usá Topaz Photo, Magnific, o `nightmareai/real-esrgan` en Replicate (USD 0-2 por batch).

---

## 6 · Validación final antes de upload

Antes de subir a App Store Connect, verificá:

```bash
sips -g pixelWidth -g pixelHeight final/01-home-hero.png
```

Tiene que decir:
```
pixelWidth: 1320
pixelHeight: 2868
```

**Un solo pixel de diferencia rechaza el upload** (Apple es estricto con dimensiones).

---

## 7 · Carpeta final

Cuando estén regenerados a 1320×2868:

```
docs/marketing/screenshots/v1.0/
├── source/       (los 768×1376 originales, mantener como referencia)
└── final/        (los 1320×2868 listos para App Store)
    ├── 01-home-hero.png
    ├── 02-wrapped.png
    ├── 03-asistente.png
    ├── 04-gastos-calendar.png
    ├── 05-fijos.png
    ├── 06-control.png
    ├── 07-quick-add.png
    ├── 08-add-expense.png
    └── 09-splash.png
```

Después → upload a App Store Connect → H8 (submit for review).
