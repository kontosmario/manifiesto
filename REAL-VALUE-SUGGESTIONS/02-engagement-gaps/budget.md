# 02 · Engagement gaps — Presupuesto 💰

> Solo items que requieren dinero. Lo demás es tiempo de developer.

---

## Tabla resumen

| # | Item | Tipo | Costo recurrente | Costo one-time | Alternativa free |
|---|------|------|-------------------|----------------|------------------|
| 2.4 | Wrapped design assets | Servicio + tipografía | $5-10/mes (fonts) | $300-500 | Hacerlo en Figma + DM Serif gratis |
| 2.7 | iOS Widget contractor | Servicio profesional | — | $1500-2500 | Aprender Swift/WidgetKit |
| 2.10 | Live Activity contractor (bundle con 2.7) | Servicio | — | incluido | idem |
| 2.12 | Apple Watch contractor | Servicio | — | $2000-3000 | Postergar a v1.5 |
| 2.15 | OCR avanzado (Google Vision) | API | $0.0015/img (~$1.50/1000) | — | iOS Vision on-device gratis |
| 2.16 | LLM smart categorization | API | ~$0.20/usuario activo/mes | — | Heurística simple gratis |
| 2.17 | AI Coach (Anthropic) | API | ~$0.30/usuario activo/mes (con caching) | — | Limitar free tier a 5 queries/mes |
| **TOTAL recomendado v1.0** | | | **~$0.50/usuario activo/mes** | **~$1800-3000 one-time** | |

---

## Detalle por item

### 2.7 · iOS Widget interactivo 💰💰💰

**Por qué importa:** el widget es el feature más visible para retención. Cada vez que el usuario desbloquea el iPhone ve "Cupo hoy: $X". Reduce dramáticamente el time-to-context.

**Costos:**

| Opción | Costo | Tiempo | Calidad |
|--------|-------|--------|---------|
| Contractor Swift senior (Upwork) | $1500-2500 USD | 1-2 semanas | Alta |
| Agencia | $4000-8000 USD | 3-4 semanas | Muy alta |
| Vos aprendiendo + tutoriales | $0 | 1 mes | Variable |
| Library tipo `react-native-targets` | $0 | 1-2 semanas | Media (limitado) |

**Mi recomendación:**
- Si **post-launch tenés tracción**: contratá contractor + sumá Live Activity (2.10) + Lock-screen (2.8) en mismo engagement. Bundle ~$2000-3000 USD por las 3 features.
- Si **estás antes del launch**: postponé widget interactivo a v1.1. Widget read-only (no interactivo, solo muestra cupo) es mucho más simple y se puede armar con `react-native-targets` en 2 días.

---

### 2.12 · Apple Watch companion 💰💰💰

**Costos:**
- Contractor WatchKit senior: $2000-3000 USD
- Bundle con iOS widgets (mismo dev): puede bajar a $1500 incremental

**Recomendación:** **POSTPONE para v1.5**. Es delight pero no diferenciante para v1.0. Decisión: lanzar primero, validar adopción, después invertir en Watch.

---

### 2.15 · OCR receipt scan 💰 (opcional)

**Opciones:**

| Servicio | Costo | Quality | Notas |
|----------|-------|---------|-------|
| **iOS Vision Framework** | **$0** | Buena para text recognition | On-device, privacy-friendly, sólo iOS |
| Google Cloud Vision | $1.50 / 1000 reqs | Excelente, multi-language | Requires server side proxy |
| AWS Textract | $1.50 / 1000 reqs | Excelente, tabular data | Más complicado de setup |
| Tesseract.js | $0 | Media-baja | Self-host, slow on mobile |
| Mindee receipt OCR | $30/mes (500 docs) | Especializada en receipts | Caro para volume bajo |

**Recomendación:**
- v1.0: **iOS Vision on-device gratis**. Suficiente.
- v1.5+: si la base es grande y querés multi-platform, Google Vision con proxy edge function (~$10/mes por 6000 OCRs).

---

### 2.16 · Smart categorization (LLM) 💰

**Modelo:** Claude Haiku 4.5 (más barato, suficiente para esta tarea).

**Costos estimados con prompt caching:**

```
Por gasto categorizado:
- Prompt: 500 tokens input (system + categories + history) — 90% cached
- Output: 50 tokens

Cost cached input: $0.08/1M tokens × 50 = $0.000004
Cost uncached input: $0.80/1M tokens × 500 = $0.0004
Cost output: $4.00/1M tokens × 50 = $0.0002
Total per call: ~$0.0006
```

Usuario activo carga ~200 gastos/mes → **$0.12/mes/usuario**. Trivial.

**Alternativa free:** heurística por palabras clave ("café" → bebidas, "uber" → transporte, etc.) en `mobile/features/expenses/category-suggestions.ts`. Menos preciso pero $0.

---

### 2.17 · AI Coach conversacional 💰💰

**Modelo:** Claude Sonnet 4.6 para queries complejas, Haiku 4.5 para simples.

**Costos estimados con prompt caching agresivo:**

```
Por query conversacional típica:
- System prompt: 3000 tokens (cached 90% → $0.27/1M cached)
- Family context: 1500 tokens (cached 80%)
- User question: 100 tokens
- Output: 400 tokens

Cost cached: ~$0.0008
Cost output: $15/1M × 400 = $0.006
Total per query: ~$0.007
```

Usuario activo paid hace ~40 queries/mes → **$0.28/mes/usuario en costo variable**.

Con price $4.99/mes → margen ~94%. Súper rentable.

**Gating recomendado:**
- Free: 5 queries/mes
- Pro: ilimitado pero con rate-limit "soft" (max 100/mes) para evitar abuse

**Alternativa:** mantener todo heurístico (como hoy). Costo $0 pero perdés el diferencial de "conversación real".

---

### 2.4 · Manifiesto Wrapped — assets 💰

**Costos:**

| Item | Costo | Notas |
|------|-------|-------|
| Diseño plantillas cards (Figma) | $300-500 (Fiverr/Upwork) ó $0 (vos mismo) | Una vez, reutilizable |
| Tipografía editorial | $50-100 ó $0 (Google Fonts) | Adobe Fonts incluido si tenés CC |
| Animaciones extra (Lottie) | $0-100 si curás de [LottieFiles](https://lottiefiles.com/) free | |
| Ilustraciones custom | $200-500 si querés diferenciar | Opcional |

**Mi recomendación:** $300-500 + tu tiempo en Figma. Tu rol es el copy y la estructura narrativa; el visual lo puede hacer un diseñador junior con dirección clara.

---

## 🎯 Presupuesto recomendado por fase

### Fase 1 — Pre-launch absolutamente mínimo:
- Sólo features sin presupuesto: streaks, notes, search, reactions, walkthrough
- $0 incremental

### Fase 2 — AI Coach (alta prioridad):
- Anthropic tokens: ~$0.30/usuario activo
- Si tenés 1000 MAU paid → $300/mes en costos variables
- Justificable: el feature es paid, margen alto

### Fase 3 — iOS Widget bundle (alta prioridad):
- Contractor: $2000-3000 one-time para widget + lock-screen + Live Activity + Siri
- ROI: cada usuario que use widget tiene 3-5x más sesiones según data de productos similares

### Fase 4 — Wrapped (vehículo de growth):
- $300-500 one-time
- ROI: cada usuario que comparte genera ~2-5 installs orgánicos según Spotify-style funnels

### Fase 5 — OCR profesional + Watch (post-PMF):
- $2000-3000 contractor Watch
- ~$10-50/mes OCR cloud si lo querés más preciso

---

## 💸 Total realista

**Pre-launch indispensable:** $0 incremental (todo es tiempo)

**Pre-launch deseable:** ~$500 (Wrapped design + AI Coach prompt engineering)

**Post-launch primer trimestre:** $2500-3500 one-time (Widget bundle) + ~$300/mes en API costs si tenés tracción

**Año 1 total estimado:** $3000-5000 one-time + $50-500/mes recurrente según base

---

## ⚠️ Trampas a evitar

1. **No contratar Watch antes del launch.** Lanzá v1.0 sin Watch, validá retención, después invertí. Caso contrario gastás $3K en algo que nadie usa.
2. **AI Coach sin caching = ruina.** Prompt caching de Anthropic es 90% off — si no lo configurás, los costos explotan rápido.
3. **OCR cloud sin uso → desperdicio.** Empezá con on-device iOS Vision gratis. Cuando tengas data de que el feature se usa, considerá upgrade.
4. **Widget complicado: arrancar simple.** Widget read-only en v1.1 antes que widget interactivo. Simpler = menos bugs en App Review.
