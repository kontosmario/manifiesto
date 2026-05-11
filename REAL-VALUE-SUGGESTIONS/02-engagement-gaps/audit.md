# 02 · Engagement gaps — Audit detallado

> Hallazgos contrastados contra el código. Los docs estratégicos (`BRIEF_UI_UX`, `DOCUMENTO_INSTITUCIONAL`) prometen "claridad, calma y dirección" — esto es bueno pero NO es lo mismo que **adictivo**. Engagement es lo que falta.

---

## ⚡ Hallazgo crítico transversal

El sistema tiene **lógica heurística madura** para streaks, momentum, persona-aware copy (ver `mobile/features/insights/persona.ts` + `control-signals.ts`). PERO:
- **NO existe tabla `streaks` ni `achievements` en `sql/supabase.sql`** (audit Agent D confirmó)
- Las notificaciones tienen `kind = 'streak_broken' | 'streak_milestone'` pero no hay tabla que persista qué streak
- La UI muestra streaks sólo en Gastos `streak-sheet.tsx` y un chip en Control `HOY card`
- En Home NO aparece streak prominente

**Consecuencia:** el "loop diario" de Manifiesto está **inferido del cálculo en runtime cada vez** en lugar de ser un dato persistente que se pueda celebrar/compartir/recuperar.

---

## 2.1 — Streaks UI prominente + persistencia

**Status:** 🟡 PARTIAL · **Impacto:** Alto

**Hallazgo:**
- ✅ Lógica de streak existe: `mobile/features/streaks/` + uso en `gastos-v2-screen.tsx` (StreakSheet)
- ❌ No hay tabla `user_streaks` ni `streak_history` en DB → el streak se recalcula desde gastos cada vez, no es un dato celebrado independientemente
- ❌ Home no muestra streak prominente (el documento dice "una pregunta por pantalla" pero el streak es la pregunta más importante del loop diario)
- ❌ No hay "streak at risk" pulsante (cuando son 20h y todavía no cargaste el día)
- ❌ No hay levels persistidos (Arranque → Constante → Leyenda en código pero no en DB)

**Quick win:**
Crear chip prominente en Home hero: "🔥 15 días" arriba del cupo. Tap → opens StreakSheet con history visual.

---

## 2.2 — Achievements / Badges (Arranque → Leyenda)

**Status:** 🔴 TO DO · **Impacto:** Alto

**Hallazgo:**
- Levels mencionados en code (`Arranque`, `Constante`, `Leyenda`) pero no hay tabla `achievements_earned`, ni UI gallery, ni notificación al desbloquear
- Sistema sólido para construir: cycle closed under budget, no-spend day, first expense, first family invite, 100K registered, year-anniversary, etc.

**Quick win:**
Tabla `achievements` con `code`, `earned_at`, `family_id`, `user_id`. Modal full-screen al desbloquear con confetti.

---

## 2.3 — Confetti + micro-celebrations

**Status:** 🔴 TO DO · **Impacto:** Medio (delight)

**Momentos identificados sin celebración:**
- ✅ Cerrar día bajo cupo (mark-paid silencioso)
- ✅ Pagar un fijo (sólo cambio de estado, sin toast)
- ✅ Confirmar cobro mensual (acción importante, feedback flat)
- ✅ Llegar a meta de ahorro
- ✅ Primera vez que la familia carga gastos el mismo día
- ✅ Racha milestone (7, 14, 30, 100 días)

**Lib:** `react-native-confetti-cannon` ó implementación custom con Reanimated + Skia (que ya tienen).

---

## 2.4 — Manifiesto Wrapped (mes/año) ⭐

**Status:** 🔴 TO DO · **Impacto:** Alto + viralidad

**Hallazgo:**
La sección "Meses" del Control tab (`/(tabs)/insights.tsx` → sección 3) ya calcula historia mensual, pero es un **dashboard estático**, no una **experiencia narrativa compartible**.

**Spec sugerida (formato Spotify Wrapped):**
8-10 cards full-screen, swipeables, generadas automáticamente al 1° de cada mes:
1. "Cerraste el mes" + emoji mood según resultado
2. "Gastaste $X" + comparación vs anterior
3. "Tu categoría top" con icono + monto
4. "Tu día más caro" con detalle
5. "Tu racha más larga" + level
6. "Ahorraste $X" + barra de progreso
7. "Tu compañera/o de hogar más activo"
8. "Si seguís así, en 12 meses ahorrás $Y"
9. Share card (Instagram Stories style) + CTA "Compartir"

**Viralidad:** la share card debe tener watermark `manifiesto.app` y diseño memorable. Es el #1 vehículo de growth orgánico.

💰 BUDGET: design (~$300-500 para plantillas + tipografía editorial), tu tiempo en assembly.

---

## 2.5 — Notes/comments en gastos

**Status:** 🔴 TO DO · **Impacto:** Alto

**Hallazgo:**
- `fixed_expenses` tiene columna `notes` ✅
- `expenses` NO tiene columna `notes` ❌
- BRIEF doc menciona "una imagen identifica tus movimientos" pero ni la imagen ni las notas existen

**Fix:**
1. Migration: `ALTER TABLE expenses ADD COLUMN notes TEXT`
2. UI: textarea opcional en add-expense form (collapsed por default, expandable)
3. UI: mostrar en expense row (truncado a 1 línea) si tiene notes
4. Search por contenido de notes (item 2.22)

---

## 2.6 — Reactions a gastos del partner

**Status:** 🔴 TO DO · **Impacto:** Alto (engagement de familia)

**Spec:**
- Nueva tabla `expense_reactions (expense_id, user_id, emoji, created_at)`
- Long-press en expense row → emoji picker rápido (❤️👏😬💸🎯)
- Push notification al autor del gasto: "María reaccionó 👏 a tu gasto"
- Muestra emoji + iniciales en expense row

**Por qué importa:**
Hoy la app es un sistema solitario aunque compartido — María carga, vos ves, fin. Reactions transforma cada gasto en una mini-conversación, dispara push, retorna a la app.

---

## 2.7 — iOS Widget interactivo "Add Expense" ⭐

**Status:** 🔴 TO DO · **Impacto:** Muy alto (diferencial)

**Hallazgo:**
Cero widgets configurados. iOS 17+ permite **widgets interactivos** (App Intents). El #1 producto que falta para hacer la app "atrapante":

**Spec:**
- Widget medium-size en home screen con:
  - Cupo del día actual (número grande)
  - Botón "+" → abre quick-add sheet sin entrar a la app
  - Indicador racha
- App Intent `LogExpenseIntent(amount: Decimal, categoryName: String)` para integrar con Siri también

💰 BUDGET: requiere conocimiento Swift/WidgetKit. Si no lo tenés, contratar contractor 1 semana ~$1000-2000 USD. O librería [react-native-targets](https://github.com/gtokman/react-native-targets) y aprenderlo.

---

## 2.8 — Lock-screen widget (cupo)

**Status:** 🔴 TO DO · **Impacto:** Alto

iOS 16+ permite widgets en lock screen. Versión circular o rectangular con el cupo del día. No requiere unlock para ver. Reduce fricción de "abrir app sólo para chequear cuánto puedo gastar".

---

## 2.9 — Siri Shortcut

**Status:** 🔴 TO DO · **Impacto:** Medio

**Spec:**
- App Intent `AddExpenseIntent` con parámetros `amount` + `description`
- Frase trigger: "Anotá ${monto} en ${descripción}"
- Resultado: confirmation dialog → si OK, crea expense con categoría inferida
- Aparece en Siri Suggestions después de uso repetido

---

## 2.10 — Live Activity (cupo en curso)

**Status:** 🔴 TO DO · **Impacto:** Alto

iOS 16.1+ Live Activities permite mostrar info "en vivo" en lock screen + Dynamic Island.

**Spec:**
- Iniciar Live Activity al inicio del día (o cuando user lo activa)
- Mostrar: cupo restante + racha + última carga
- Update cada vez que se carga un gasto
- Termina automáticamente a las 23:59 con summary

Diferencial fuerte: Manifiesto sería de las primeras finanzas-de-hogar latinas con Live Activity.

---

## 2.11 — Share Extension

**Status:** 🔴 TO DO · **Impacto:** Medio

iOS Share Sheet permite que otras apps compartan a la tuya. Caso de uso:
- User recibe email de Naranja con "Compraste $5400 en Coto"
- Long-press → Share → Manifiesto
- Pre-llena gasto con monto detectado + categoría sugerida (Supermercado)

Reduce dramáticamente la fricción de carga.

---

## 2.12 — Apple Watch companion

**Status:** 🔴 TO DO · **Impacto:** Alto (delight)

**MVP spec:**
- Glance: cupo + racha
- Complication para watch face (cupo actual)
- "Add" button → dictado de Siri ("$200 café")

💰 BUDGET: dev WatchKit ~$2000-3000 USD si tercerizás, varias semanas si lo aprendés.

---

## 2.13 — Calendar/Reminders sync

**Status:** 🔴 TO DO · **Impacto:** Medio

`expo-calendar` permite leer/escribir Apple Calendar.
- Crear event en Apple Calendar por cada fijo con su due date
- Reminder 1 día antes
- Permission priming opcional

---

## 2.14 — Dynamic Island

**Status:** 🔴 TO DO · **Impacto:** Bajo (delight pero limited reach: solo iPhone 14 Pro+)

Visual fancy del cupo restante / progress racha durante el uso de la app. Bonus si se integra con Live Activity (2.10).

---

## 2.15 — OCR receipt scan ⭐

**Status:** 🔴 TO DO · **Impacto:** Muy alto

**Hallazgo:**
`expo-camera` está disponible. iOS Vision Framework (gratis, on-device) puede extraer texto de tickets. Combinado con un parser simple → autocompletar monto y categoría.

**Spec:**
- Botón cámara en add-expense screen
- Captura foto → on-device Vision Text Recognition (gratis, privacy-friendly)
- Parser para extraer total + nombre de comercio
- Sugerir categoría según comercio
- Subir foto a Supabase Storage si user opta (column `expenses.receipt_url`)

💰 BUDGET: $0 si usás Vision iOS native. Si querés multi-plataforma + mejor precisión: Google Cloud Vision $1.50/1000 imágenes, AWS Textract similar.

**Por qué importa:** killer feature. Reduce fricción de carga a < 5 segundos. Vale por sí solo el upgrade a Pro.

---

## 2.16 — Smart categorization (LLM)

**Status:** 🔴 TO DO · **Impacto:** Alto

**Spec:**
- En add-expense, después de typear descripción, llamar LLM con: `descripción + lista de categorías activas → categoría sugerida + confidence`
- Pre-seleccionar la sugerida; user puede override
- Cache local de aprendizajes ("Maxi Kiosko" → "Almacén" siempre)

💰 BUDGET: Claude Haiku ~$0.25/1M input tokens, $1.25/1M output. Costo estimado < $0.001 por carga. Si la familia carga 200 gastos/mes → $0.20/mes. Trivial.

---

## 2.17 — AI Coach conversacional ⭐⭐⭐

**Status:** 🟡 PARTIAL · **Impacto:** Muy alto

**Hallazgo crítico:**
La edge function `supabase/functions/control-advisor/` **ya está usando Claude Sonnet** (Agent D confirmó). El backend tiene auth + JWT + family membership + ephemeral cache. PERO:
- `mobile/features/insights/` (43 archivos) es **100% heurístico** (Agent B confirmó: cero imports de SDK Anthropic en mobile)
- La pantalla `asistente.tsx` muestra señales heurísticas, no llama al edge function de Claude
- El feature backend está construido pero NO está expuesto en UI ❗

**Esto es la oportunidad más grande del audit.**

**Spec mínima:**
- En `asistente-screen.tsx` agregar input "Preguntale al asistente"
- Backend ya está → solo cablear cliente
- Caching de respuestas con `tanstack/query` por pregunta-hash
- Free tier: 5 preguntas/mes. Paid: ilimitado
- Caching de prompt system + family context para reducir costos

💰 BUDGET: tokens Anthropic. Con prompt caching agresivo: < $0.50/usuario activo/mes. Justifica el upgrade a Pro.

---

## 2.18 — Recurring suggestion

**Status:** 🔴 TO DO · **Impacto:** Medio

**Spec:**
- Background job (cron weekly) detecta: ¿descripción X aparece 4+ veces en 30 días con monto similar?
- Si sí, push: "Cargaste 'Naranja Card' 4 veces. ¿Querés convertirlo en gasto fijo?"
- Action button en notif crea el fijo pre-poblado

---

## 2.19 — Daily closure recap

**Status:** 🔴 TO DO · **Impacto:** Alto

**Spec:**
A las 22h (configurable), push local:
> "Hoy gastaste $4500. Cupo era $5200 ✅. Mañana arrancás con $6800. Racha: 12 días 🔥"

Tap → abre Home con highlight del día. Crea ritual nocturno.

---

## 2.20 — Mark-paid celebration en fijos

**Status:** 🔴 TO DO · **Impacto:** Bajo (delight)

Hoy: tap → estado cambia, fin.
Spec: tap → confetti corto + haptic success + toast "Uno menos para este mes 💪". Si era el último del mes → confetti grande + "Mes cubierto. Todo lo que viene es ahorro."

---

## 2.21 — Calendar heatmap (Gastos)

**Status:** 🔴 TO DO · **Impacto:** Medio

Hoy el calendar de Gastos muestra qué días hubo gastos. Spec: colorear cada día según `total_diario vs cupo_diario`:
- 🟢 Verde: < 70% cupo
- 🟡 Amarillo: 70-100%
- 🔴 Rojo: > 100%
- ⚪ Gris: sin gastos

Heatmap mes a la vista da inmediata intuición del comportamiento.

---

## 2.22 — Search en historial

**Status:** 🔴 TO DO · **Impacto:** Medio (utility)

Hoy se filtra por categoría/fecha/estado. Spec: buscar por texto en `description + notes`. Util cuando el historial supera ~100 gastos.

---

## 2.23 — First-expense walkthrough

**Status:** 🔴 TO DO · **Impacto:** Alto

**Hallazgo:**
Onboarding termina en Home vacío. El usuario nuevo NO recibe guía de "¿qué hago ahora?"

**Spec:**
- Si `expenses.count = 0` para esta familia → mostrar coachmark / hero card en Home: "Tu primer gasto te toma 10 segundos"
- Confetti + toast al cargar el primer gasto
- Tour de 3 pantallas: Home → Gastos → Control con highlights

---

## 2.24 — Streak at-risk visual alarm

**Status:** 🔴 TO DO · **Impacto:** Alto

**Hallazgo:**
Control HOY card muestra streak pero si son 22h y no cargaste nada del día NO hay alarma visual.

**Spec:**
- Si hora > 20h Y `today.expenses.count = 0` Y `streak > 3` → pulsar el chip del streak en rojo
- Push local a las 21h: "Tu racha de X días está en riesgo. ¿Día sin gastos?"

---

## 2.25 — Bulk edit en Gastos

**Status:** 🔴 TO DO · **Impacto:** Bajo

Multi-select rows + acción "Cambiar categoría a..." / "Eliminar". Útil para limpiar primer mes de uso.

---

## 2.26 — Category budget caps

**Status:** 🔴 TO DO · **Impacto:** Medio

**Spec:**
- Por categoría, opcionalmente: `monthly_cap_amount`
- Hero card de la categoría muestra barra de progreso
- Push al cruzar 70% / 100%
- Insight en Control: "Estás por pasarte en Restaurantes (85% mes)"

**Schema:** `ALTER TABLE categories ADD COLUMN monthly_cap_amount NUMERIC(12,2)`

---

## 2.27 — Per-category icons

**Status:** 🔴 TO DO · **Impacto:** Polish

Hoy las categorías se distinguen por color dot. Spec: lib icons (SF Symbols vía `expo-symbols` ya está instalado) por categoría. Detección automática por nombre + override manual.

---

## 2.28 — Family member reactions feed

**Status:** 🔴 TO DO · **Impacto:** Alto

Notifications screen es timeline pasiva. Spec: reactions a notifs (mark-paid, racha, etc.) + thread agrupado por día. Convierte la pantalla en "feed familiar" tipo BeReal.

---

## 📊 Métricas para validar engagement

Una vez que algunos de estos shippeen, medir en PostHog/Sentry:

- D7 retention (target > 30%)
- Average expenses per day per active user (target > 1.2)
- Streak length distribution (median > 7 días)
- Widget tap-through rate (target > 10% de installs)
- AI Coach query/session (target > 0.4 después de paywall)
- Wrapped share rate (target > 5% de usuarios activos)

---

**Próximo doc:** `roadmap.md` con secuenciación.
