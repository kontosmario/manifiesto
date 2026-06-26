# Diseño · Internacionalización de Manifiesto (ES-LATAM + EN)

> **Fecha:** 2026-06-26
> **Estado:** spec para revisión del owner (pre-plan de implementación)
> **Objetivo:** que la app soporte **2 idiomas — Español (LATAM) e Inglés** — siguiendo
> la preferencia del sistema, con override manual en Ajustes, y con **100% de coverage**:
> UI, accesibilidad, contenido en DB, copy generado en el servidor (push notifications),
> formatters de número/fecha, y plantillas de email de Supabase Auth.

---

## 0. Decisiones tomadas (owner, 2026-06-26)

| Decisión | Elección |
|---|---|
| Control de idioma | **Sistema por defecto + toggle manual ES/EN en Ajustes**, persistido (igual que el tema). |
| Traducción al inglés | **Generada por los agentes ahora** (consistente vía glossary), el owner revisa. App sale bilingüe completa. |
| Estrategia | **Por fases con gates de verificación** (no big-bang). |
| Alcance | **Todo**: UI + a11y + logros/categorías (DB) + push notifications (servidor) + errores + **emails de Supabase Auth** + pantallas dev. |
| Categorías existentes | **Retro-traducir de forma NO destructiva** (display localizado por mapeo a su template; las renombradas por el usuario se respetan). |

---

## 1. Estado actual (verificado por 3 agentes de exploración, 2026-06-26)

**La app NO tiene i18n.** Todo el copy está hardcodeado inline en español.

| Capa | Volumen medido | Detalle |
|---|---|---|
| **UI cliente** | **~2.500–3.000 strings** en 753 archivos | components ~1.300 · screens ~400 · features ~300 · lib ~25. |
| **Accesibilidad** | ~648 refs `accessibilityLabel/Hint` (~60% traducible) | extracción en la misma pasada. |
| **DB / servidor** | **~230–250 strings** | logros (36) · categorías seed (~180) · push notifications (~50) · errores `RAISE` (~13) · fallback control-advisor (~9, dormido). |
| **Formatters** | **34** usos de `'es-AR'` hardcodeado | `utils/money.ts` (6) · `utils/date-format.ts` (arrays ES) · ~16 `.toLocaleString('es-AR')` · varios `Intl.DateTimeFormat`. |
| **Auth emails** | 4 plantillas | recovery/confirm/magic-link/OTP — viven en el **dashboard de Supabase**, no en el repo. |

**Anclas que reducen el trabajo:**
- 3 módulos de copy centralizado ya existen y se vuelven namespaces base:
  - `mobile/lib/copy/glossary.ts` — terminología canónica (Gasto, Gasto fijo…), con test `tests/unit/copy-glossary.test.ts`.
  - `mobile/lib/copy/states.ts` — empty/loading/error states (hay un lint de CI que prohíbe empty-states hardcodeados).
  - `mobile/lib/copy/auth-greetings.ts` — saludos pooled por hora del día.
- **Worklets de Reanimated son seguros**: solo formateo numérico, sin copy traducible. (Regla [[feedback_reanimated_worklet_globals]]: nunca `Intl`/`t()` dentro de un worklet — precomputar en JS thread.)
- **`mobile/theme/theme-provider.tsx`** ya implementa "sistema + override + persistencia + context split por performance" → el `LanguageProvider` lo clona 1:1.
- **`mobile/features/preferences/motion-preference-provider.tsx`** + `mobile/lib/persistent-kv.ts` (SecureStore) = patrón de persistencia a reusar.

**Patrones difíciles a contemplar:**
- **Interpolación** generalizada: `` `Te quedan ${fmt(x)} y faltan ${n} días` ``.
- **Pluralización** con ternarios (~15–20): `${n} ${n===1?'mes':'meses'}`.
- **Variantes por persona** (`features/insights/control-signals-copy.ts`): 4 personas × framings (loss/gain/neutral) → ~12 bloques condicionales.
- **Copy dinámico**: saludos por hora, tiempos relativos (`hoy/mañana/en Nd`), conteos.

---

## 2. Arquitectura

### 2.1 Stack
- **`i18next` + `react-i18next` + `expo-localization`.**
  - `i18next`: interpolación `{{var}}`, pluralización por CLDR (`_one`/`_other`), `context` (para variantes por persona), namespaces, fallback.
  - `react-i18next`: hook `useTranslation()`, `<Trans>` para copy con formato embebido.
  - `expo-localization`: `getLocales()` para detectar el idioma del sistema.
- **Locales:** `es` (default + fallback) y `en`. (Explícitamente **solo 2 idiomas**; sin portugués.)
- **Archivos de traducción:** JSON por namespace en `mobile/lib/i18n/locales/{es,en}/<namespace>.json`.
- ⚠️ **Validar el bundle**: al sumar deps nativas/no-Expo correr `npx expo export --platform ios` ANTES de declarar verificado ([[feedback_validate_is_not_bundle]]). `expo-localization` es Expo-friendly, pero igual se valida.

### 2.2 `LanguageProvider` (espeja `theme-provider.tsx`)
- **Default = idioma del sistema** (`expo-localization` → `es` o `en`; cualquier otro idioma cae a `es`).
- **Override** `'system' | 'es' | 'en'` persistido en `persistent-kv` (key `manifiesto:language-preference`).
- **Sincroniza a `profiles.preferred_language`** (columna nueva) para que el **servidor** pueda localizar las push notifications cuando el usuario está offline.
- **Context split** (como theme): el locale activo cambia rara vez; los formatters se memoizan por locale.
- Montaje en `mobile/providers/app-providers.tsx`, hermano de `MotionPreferenceProvider`.
- **Toggle en Ajustes**: fila ES/EN/Sistema, mismo componente visual que el selector de tema.

### 2.3 Estructura de keys (namespaces)
Por área, para poder fan-out en paralelo sin colisiones:
```
common      (glossary + botones genéricos: Guardar, Cancelar, Volver, Reintentar…)
states      (empty / loading / error — desde states.ts)
auth        (login, signup, reset/OTP, biometría, greetings)
onboarding
home
gastos
fijos
control
settings
billing
garden
achievements (títulos+bodies de logros — migran de la DB al cliente, ver §2.6)
insights    (señales del asistente + variantes por persona vía context)
notifications (copy de push — espejo cliente para preview/Ajustes)
errors      (mapeo de errores del servidor → mensaje localizado)
a11y        (accessibilityLabel/Hint)
```
- **Glossary → namespace `common`** y se referencia desde todos lados (mantiene consistencia ES/EN).
- **Personas → i18next `context`**: `t('signals.recoveryHard', { context: framing, ...args })` con keys `recoveryHard_loss` / `_gain` / `recoveryHard`.

### 2.4 Formatters locale-aware
- Nuevo módulo `mobile/lib/i18n/formatters.ts` que centraliza los 34 sitios `es-AR`:
  - `formatMoney(amount, { currency, locale })` — la **moneda sigue siendo per-hogar** (`family_finance.local_currency`, 8 monedas), el **locale** define separadores/decimales.
  - `formatDate` / `formatRelative` / `formatWeekday` / `formatMonth` vía `Intl.DateTimeFormat(locale)` — reemplaza los arrays ES de `date-format.ts`.
- Memoización por `(locale, currency)` para no recrear `Intl.*` por render.
- Regla [[feedback_timestamptz_off_by_one]] intacta (no cambia con i18n).

### 2.5 Worklets
- Sin copy adentro hoy → seguros. Si una traducción necesita entrar a un worklet, se **precomputa en JS thread** y se pasa como string ya resuelto (regla existente).

### 2.6 Contenido en DB / servidor
- **Columna nueva `profiles.preferred_language text`** (nullable → resuelve `es`). El cliente la sincroniza al cambiar idioma. Recordar [[feedback_family_finance_column_needs_home_snapshot_rpc]]-style: si algún snapshot RPC seedea profile, preservar/incluir esta columna.
- **Logros (`achievements_catalog`)** → **mover la copy de display al bundle del cliente** keyed por `code`. El cliente ya lee el catálogo; deja de usar `title`/`body` de la DB para mostrar y usa `t('achievements:'+code+'.title')`. La DB conserva `code` + `icon` (+ la copy ES como referencia/fallback). **Cero tabla de traducciones para logros.** ([[project_achievements_system_map.md]] — el copy hoy se cambia por migración; pasa a vivir en el cliente.)
- **Push notifications (servidor)** — **único surface que obliga a resolver server-side** (se generan por cron con el usuario fuera de la app). Los builders (`list_pending_notifications`, `cron_emit_streak_*`, weekly insights) eligen copy según el `preferred_language` del **destinatario**. Implementación: **CASE bilingüe por locale dentro de las funciones** (volumen chico, ~50 strings) — evita una tabla de plantillas y mantiene la lógica en un solo lugar. Las variables dinámicas (montos, nombres, días) se siguen interpolando con `||`/`format()`.
- **Categorías** (retro-traducción **no destructiva**):
  - Las categorías son **datos del usuario** (`categories`, FK `family_id`, creadas en `bootstrap_family()` desde `category_templates`).
  - **No se muta el `name` guardado.** En su lugar: si una categoría conserva el vínculo a su `template_id` y su `name` sigue igual al default del template (no la renombraron), el **cliente muestra el nombre localizado** vía mapeo `template_id → t('categories:'+template_key)`. Si la renombró el usuario (no matchea el template), se muestra tal cual.
  - El **seed de familias nuevas** se localiza por el idioma del creador.
  - `quick_descriptions` (sugerencias del picker) se localizan por mapeo igual.
- **Errores (`RAISE EXCEPTION`)** — hoy mezcla ES/EN. Se **normalizan a códigos estables** y el cliente mapea código→`t('errors:'+code)`. Donde no haya código, bilingüe en SQL. (~13 mensajes.)
- **Fallback de `control-advisor`** (dormido, sin `ANTHROPIC_API_KEY`) — bilingüe cuando se prenda; no bloquea.

### 2.7 Emails de Supabase Auth (owner/dashboard)
- 4 plantillas (recovery / confirm / magic-link / OTP) en ES + EN. Viven en el **dashboard** (o SMTP propio), no en el repo.
- **Entregable:** dejo el **texto ES+EN listo** (respetando el template de recovery con `{{ .Token }}` ya aplicado, [[feedback_oauth_display_name_flow]]/OTP); el owner lo pega en el dashboard. Per-locale: Supabase puede tomar el idioma del request si se manda; si no, se documenta la limitación.

---

## 3. Traducción al inglés
- **La generan los agentes** durante la extracción, no en una pasada aparte: cada agente de área extrae ES→key y **escribe la entrada EN** en paralelo.
- **Consistencia:** el `common`/glossary se traduce PRIMERO y se pasa como referencia a todos los agentes (Gasto→Expense, Gasto fijo→Fixed expense, Cupo→Allowance, Racha→Streak, Hogar→Household, etc.) para que la terminología no derive.
- **Revisión:** el owner revisa el EN (especialmente términos de producto y tono). Quedan en los JSON `en/` para editar fácil.

---

## 4. Plan de ejecución por fases (con gates)

> Cada fase termina con: `tsc --noEmit` = 0 (regla [[feedback_bash_nvm_path]]: `source ~/.nvm/nvm.sh` primero), `npx expo export --platform ios` OK cuando hubo cambio de deps, tests existentes verdes, y **QA visual en AMBOS idiomas** (light+dark) del área tocada.

- **Fase 0 — Infraestructura**
  - Deps: `i18next`, `react-i18next`, `expo-localization`. Init en `mobile/lib/i18n/index.ts`.
  - `LanguageProvider` + montaje + toggle en Ajustes + detección de sistema.
  - Migración: `profiles.preferred_language` + sync cliente.
  - **Gate:** `expo export` OK (dep nueva) + el toggle cambia un string de prueba en vivo.
- **Fase 1 — Cimientos de copy**
  - `formatters.ts` locale-aware (refactor de los 34 `es-AR`).
  - Traducir las 3 anclas (`glossary`→common, `states`, `auth-greetings`).
  - Lint nuevo "no hardcoded user-facing string" (extiende el de empty-states) + helper `t()`.
- **Fase 2 — Fan-out de UI (agentes en paralelo por área)**
  - Un agente por área: `auth`, `onboarding`, `home`, `gastos`, `fijos`, `control`, `settings`, `billing`, `garden`, `achievements`(UI), `insights`(+personas), componentes `common`, `a11y`.
  - Cada agente: extrae ES→keys, **escribe EN**, reemplaza inline por `t()`, respeta interpolación/plurales/worklets. Termina con su gate (tsc + QA visual EN).
  - Batching según el cap de concurrencia; áreas de alta densidad primero (login, settings, home-hero, control cards, insights).
- **Fase 3 — Servidor / DB**
  - Logros → bundle cliente. Notifications → CASE bilingüe por `preferred_language`. Categorías → display localizado no destructivo. Errores → códigos + `errors` namespace.
  - **Gate:** probar una push en EN (mock locale) + un logro en EN + categorías en EN.
- **Fase 4 — Emails de Auth (owner)**
  - Texto ES+EN entregado; el owner lo aplica en el dashboard.
- **Fase 5 — Verificación de 100%**
  - Auditoría de cobertura: extracción de keys + el lint reportan **0 strings user-facing hardcodeados**.
  - QA full en EN y ES, light+dark, en device/dev build. tsc + tests + `expo export`.

---

## 5. Verificación de "100% coverage"
- **Lint/AST sweep**: script que falla si hay literales user-facing fuera de `t()` (lista blanca para logs/keys/no-copy). Corre en cada fase y en CI.
- **Audit de keys huérfanas/faltantes**: comparar keys usadas vs definidas en `es/` y `en/` (faltantes en EN = falla).
- **Glossary test** existente + extender a EN.
- **QA visual por área** en ambos idiomas (el método de [[feedback_headless_screenshot_qa]] no aplica al device; se hace en dev build).

---

## 6. Riesgos y mitigaciones
- **Escala (753 archivos, ~2.700 strings):** regresiones de JSX/interpolación. → Gates por fase + tsc + QA por área + lint; nunca un solo barrido sin checkpoints.
- **Terminología derivando** entre agentes. → Glossary EN primero, pasado como referencia obligatoria a cada agente.
- **Pluralización/género en EN** distinta del ternario ES. → Usar plural CLDR de i18next, no portar el ternario.
- **Push offline localizadas** dependen de `preferred_language` poblado. → Default a `es` si null; backfill por sync al primer login post-update.
- **OTA bloqueada:** este trabajo es JS+1 dep nativa (`expo-localization`) → **requiere build nativo** para llegar a usuarios (no OTA). Se alinea con que igual hace falta **build 8** (ver §7).
- **`expo-localization` en el bundle:** validar con `expo export` (no alcanza `npm run validate`).

---

## 7. Relación con el lanzamiento (a decidir al armar el plan)
Este es un esfuerzo grande (multi-día) y **mueve el timing del submit v1.0**. Hay que elegir, al pasar al plan:
- **(A) v1.0 bilingüe**: sostener el submit hasta terminar i18n + cortar **build 8** con ES+EN. App sale internacional de entrada.
- **(B) v1.0 en ES ahora + i18n en v1.1**: lanzar lo que ya está (build 8 ES) y meter EN en la próxima.
- El doc canónico de lanzamiento es `docs/PRE-DEPLOY-2026-06-26.md` (build 7 quedó viejo → build 8 obligatorio de todos modos; el barrido de voseo ya está commiteado). **Recomendación:** decidir A vs B antes de la Fase 2 (es donde se vuelve irreversible el costo).

---

## 8. Fuera de alcance
- Idiomas más allá de ES y EN.
- Cambiar la moneda a per-usuario (sigue per-hogar).
- RTL.
- Traducción de los términos legales con cambio de jurisdicción (privacy/terms mantienen jurisdicción; solo se localiza la presentación si aplica).

---

## 9. Archivos/superficies tocadas (mapa rápido)
- **Nuevo:** `mobile/lib/i18n/` (index, formatters, locales/{es,en}/*), `LanguageProvider`, fila de idioma en Ajustes, migración `profiles.preferred_language`, lint de hardcoded strings.
- **Refactor:** 753 archivos de UI (inline→`t()`), 34 sitios de formatters, builders de notificaciones SQL, `bootstrap_family()`/categorías (display no destructivo), `achievements_catalog` consumo cliente.
- **Owner:** plantillas de email en el dashboard de Supabase.
