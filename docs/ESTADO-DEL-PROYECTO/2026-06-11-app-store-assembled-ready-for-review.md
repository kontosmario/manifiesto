# App Store v1.0 · Listo para Submit · ASSEMBLED

> **Fecha**: 2026-06-11
> **Tipo**: milestone — todo el material para App Store Review está cargado y guardado en App Store Connect. Solo falta el click "Añadir a revisión".
> **Decisión owner**: el submit (H8) lo hace cuando esté listo, no automáticamente.

## TL;DR

| Item | Status |
|---|---|
| H1 Privacy + Terms hosteados | ✅ DONE (2026-06-10) |
| H2 Soporte email | ✅ DONE (2026-06-10) |
| H3 Screenshots App Store (9 uploads) | ✅ DONE (hoy) |
| H4 Privacy Nutrition Labels | ✅ DONE (2026-06-10) |
| H5 Listing copy + datos de review | ✅ DONE (hoy) |
| H6 Age Rating | ✅ DONE (2026-06-10) |
| H7 App Preview video (opcional) | 🟡 skipped (decisión owner: arrancar sin video, agregar en v1.1 si conversion no es buena) |
| **H8 Submit for Review** | 🔵 **Próximo click — owner decide cuándo** |

**Estado en App Store Connect**: la versión 1.0 está completamente armada. El botón "Añadir a revisión" arriba derecha está habilitado (asumiendo que no quedó nada incompleto). Apple va a hacer 4-6 preguntas finales (export compliance, IDFA, contenido de terceros, DSA UE) — respuestas correctas ya documentadas.

## Lo que se hizo hoy (2026-06-11)

### 1. Seed account para Apple Review

Migration `20260611000000_seed_apple_review_account.sql` aplicada en remote. Cuenta `apple.review@manifiestoapp.com` con password **rotado out-of-band** (ver `docs/operaciones/runbook-release-automation.md` §"Apple Review credentials"), 85 gastos seedeados, 5 fijos, 1 meta de ahorro. Apple reviewers pueden loguearse y testear el flujo completo sin que el owner tenga que exponer su cuenta personal.

Fixes técnicos vs el template del seed previo (`home.test@manifiesto.app`):
- `families.code` columna removida en post-Sprint B → `insert ... default values`
- `gen_salt` está en schema `extensions` (no `public`) → fully qualified call
- `family_finance` creado por trigger `recompute_family_income` → UPSERT

### 2. H5 — Listing copy cargado en App Store Connect

6 campos pegados desde `docs/marketing/app-store-listing-source.md` §7:

- **Nombre**: `Manifiesto`
- **Subtítulo**: `Gastos claros, ahorro simple` (28 chars)
- **Descripción**: ~2250 chars editorial con anti-shame hook + secciones VER GASTOS / AHORRAR / POR TU CUENTA O EN FAMILIA / FIJOS / IMPORTAR DEL BANCO / PESOS Y DÓLARES / WRAPPED / PRIVACIDAD / QUÉ NO SOMOS
- **Palabras clave**: `ahorro,gastos,finanzas,familia,presupuesto,metas,fijos,pareja,dinero,simple,hogar,facil,USD` (91/100 chars)
- **Texto promocional**: 143/170 chars de lanzamiento
- **Qué hay nuevo**: release notes v1.0

Además:
- URL de soporte + URL de marketing → `https://manifiestoapp.com`
- Copyright → `© 2026 Mario Kontos`
- Build atada → 1.0 (1) (EAS Submit del 2026-06-09)
- Información para el equipo de revisión: datos de contacto + login con la seed account `apple.review@manifiestoapp.com` + notas con sugerencia de recorrido
- Publicación → automática post-aprobación

### 3. H3 — Screenshots App Store (workflow completo)

Pipeline de 3 pasos resuelto end-to-end:

#### 3.1 — Source assets del owner (batch 1)

Owner preparó 11 imágenes a 768×1376 con AI image gen. **Problema**: aspect ratio 5.5" iPhone, Apple rechaza el upload (necesita 6.9" o 6.5"). Importados al repo como source de referencia (`docs/marketing/screenshots/v1.0/source/`).

#### 3.2 — Prompt de regeneración + batch 2

Doc `docs/marketing/screenshots/PROMPT.md` con prompt parametrizado para regenerar a 1408×3040 (aspect nativo iPhone 6.9"). Owner regeneró con **Nano Banana / Flow** (Gemini Image Gen) usando ese prompt. Output: 10 imágenes (9 App Store + 1 marketing scene con 3 phones).

#### 3.3 — Resize a Apple specs

App Store Connect del owner muestra slot **iPhone 6.5"** que acepta `1284×2778` (no `1320×2868` del 6.9"). Resize con `sips -z 2778 1284` desde el source de Nano Banana directamente. Aspect ratio difference: 0.4622 vs 0.4632 = 0.2%, sin distorsión perceptible.

Final: 10 PNGs en `docs/marketing/screenshots/v1.0/final-6.5/` (~40 MB total).

#### 3.4 — Upload a App Store Connect

9 screenshots subidos (el owner saltó el splash). Orden final:

| # | Asset | Caption |
|---|---|---|
| 1 | `00-brand-cover.png` | "Manifiesto." + "Tus finanzas, claras." (cover con 3 phones) |
| 2 | `01-home-hero.png` | "Tus finanzas, claras." |
| 3 | `04-gastos-calendar.png` | "Cada peso, a la vista." |
| 4 | `05-fijos.png` | "Lo recurrente, en orden." |
| 5 | `06-control.png` | "Sabé cuándo frenar." |
| 6 | `07-quick-add.png` | "Cargá en segundos." |
| 7 | `08-add-expense.png` | "Categorías que entendés." |
| 8 | `03-asistente.png` | "Acciones que mueven la aguja." |
| 9 | `02-wrapped.png` | "Tu mes, en cifras." |

**Decisión documentada del owner**: cover como #1 a pesar de la advertencia sobre hallucinated text dentro de las phones del cover. Trade-off aceptado: branding fuerte vs riesgo bajo de bounce. Si Apple flagea, fácil mover a slot 10 o remover.

## Riesgos conocidos para review

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Apple rechaza el brand cover (#1) por text hallucinated en las phones | Baja-media | Owner mueve el cover al final o lo quita, los otros 8 quedan sin volver a editar |
| Apple pide más info sobre la seed account | Baja | La cuenta funciona end-to-end + las notas explican el flujo |
| Export compliance (encryption) flag | Cero | `ios.config.usesNonExemptEncryption: false` ya está en `app.config.ts` |
| DSA UE (comerciante) | Cero | v1.0 sin monetización = NO comerciante, declarar correctamente |
| IDFA tracking | Cero | NO usamos IDFA, declarar correctamente |
| Privacy Policy URL no carga | Cero | `https://manifiestoapp.com/privacy/` verificada en device + curl |

## Próximos pasos (post-submit)

Ver `docs/ESTADO-DEL-PROYECTO/2026-06-08-estado-ready-pendientes.md` actualizado.

### Inmediato (cuando owner clickea submit)

1. Owner clickea **"Añadir a revisión"** en App Store Connect → versión 1.0
2. Apple muestra 4-6 preguntas finales — respuestas correctas:
   - **Export compliance**: No (con `usesNonExemptEncryption: false`)
   - **IDFA**: No
   - **Contenido de terceros**: No
   - **DSA UE comerciante**: No (sin monetización en v1.0)
   - **User-generated content distribuido**: No
3. Apple recibe → estado pasa a "Waiting for Review" → "In Review" → "Pending Developer Release" o "Ready for Sale" (depende de "Publicar automáticamente")
4. Tiempo esperado: **1-3 días hábiles** para review de Apple

### Si Apple aprueba

- App live en App Store (versión 1.0 con publicación automática activada)
- Owner monitorea Conversion Rate + Storefront breakdown en App Store Analytics (ver §10 del listing source doc)
- Empezamos a recoger user feedback real

### Si Apple rechaza

Causas probables (en orden de probabilidad):
1. Test account no funciona o no tiene contenido relevante → ya cubierto con seed account
2. Brand cover con text hallucinated → mover/remover, resubmit en 5 min
3. Description menciona feature no disponible → audit copy
4. Privacy URL no carga → ya verificada
5. Algún issue de IPv6 / accesibilidad → fix técnico

El loop suele ser: rechazo → fix → re-submit → 1-2 días más de review. Total: típicamente <1 semana incluso con 1-2 rebotes.

## Lo que NO está pendiente (sin acción del owner)

- Sprint A-D ya completos (incluido refactor + CR fixes)
- Apple Developer + EAS + GitHub Secrets wireados (milestone 2026-06-09)
- Dominio + Privacy + Terms LIVE (milestone 2026-06-10)
- Email forwarding LIVE
- OTA Update channel activo

## Lo que queda como follow-up (post-launch)

1. **Sitio público inclusivity pass**: aplicar el mismo pulido lingüístico del listing copy al `manifiestoapp.com` (sacar masculino default, ampliar a hogares no-nucleares).
2. **Per-storefront copy localization (v1.1)**: copy distinto por país AR vs MX/CO/CL cuando haya data de qué países traen instalación.
3. **App Preview video (v1.1)**: si conversion rate < 20% en App Store Analytics, considerar agregar video.
4. **Screenshots iteración**: si Apple recomienda otro tamaño además del 6.5", regenerar batch en 6.9" (1320×2868) con el mismo prompt de PROMPT.md.

## Referencias

- [Listing source doc](../marketing/app-store-listing-source.md)
- [Screenshots README](../marketing/screenshots/README.md)
- [Prompt para regeneración](../marketing/screenshots/PROMPT.md)
- [Milestone Apple Dev (2026-06-09)](2026-06-09-apple-dev-setup-completed.md)
- [Milestone dominio + sitio (2026-06-10)](2026-06-10-domain-and-legal-site-completed.md)
- [Ready vs pendientes (actualizado)](2026-06-08-estado-ready-pendientes.md)
- App Store Connect: https://appstoreconnect.apple.com/apps/6776033487
