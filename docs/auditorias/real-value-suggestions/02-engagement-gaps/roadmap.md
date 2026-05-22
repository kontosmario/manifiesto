# 02 · Engagement gaps — Roadmap

> Secuenciado por **ROI vs esfuerzo**. Cada item con DoD y dependencias.

---

## 🏁 Fase 1 — Loop diario (1-2 semanas)

> Objetivo: cuando el usuario abre la app al día siguiente, hay una razón emocional, no sólo informativa.

### TASK 2.1 · Streaks UI + persistencia

**Effort:** 2-3 días · **Depends on:** schema migration

**Pasos:**
1. **Migration**:
   ```sql
   CREATE TABLE user_streaks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     family_id UUID REFERENCES families(id) ON DELETE CASCADE,
     current_streak INT NOT NULL DEFAULT 0,
     longest_streak INT NOT NULL DEFAULT 0,
     last_activity_date DATE,
     level TEXT NOT NULL DEFAULT 'arranque',
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (user_id, family_id)
   );
   ```
2. **RPC** `recalculate_user_streak(p_user_id)` que el `useCreateExpense` invoca después de crear gasto
3. **Trigger** opcional: `AFTER INSERT ON expenses → recalculate_user_streak`
4. **UI** en Home hero card: chip "🔥 N días" arriba a la derecha
5. **Sheet** existente `streak-sheet.tsx` extender con historia visual (últimos 90 días)

**DoD:** crear gasto bumpea el contador en DB y refleja en UI sin refetch full.

---

### TASK 2.24 · Streak at-risk visual alarm

**Effort:** 4 horas · **Depends on:** 2.1

**Pasos:**
1. En el chip del Home, useEffect que recalcula `isAtRisk`:
   ```ts
   const hour = new Date().getHours()
   const isAtRisk = hour >= 20 && todayExpensesCount === 0 && currentStreak >= 3
   ```
2. Si at-risk → animación `useSharedValue` con pulse rojo cada 2s
3. Push local a las 21h via `expo-notifications.scheduleNotificationAsync`:
   ```ts
   { title: 'Tu racha está en riesgo 🔥', body: `${streak} días. ¿Cargás algo antes de que termine el día?` }
   ```
4. Persistir `last_at_risk_notification_at` para no duplicar

---

### TASK 2.19 · Daily closure recap

**Effort:** 1 día · **Depends on:** Settings notifications screen (existe)

**Pasos:**
1. En `notifications-preferences-screen.tsx` agregar toggle "Recap diario" + hora (default 22h)
2. Persistir en `family_finance.daily_recap_hour` (col nueva)
3. Schedule notification local con expo-notifications, contenido dinámico armado por:
   ```ts
   const recap = useDailyRecap(today)
   // "Hoy: $X gastado. Cupo: $Y. Estás: +/-Z. Racha: N días."
   ```
4. Tap → deep link a `/home?highlight=today`

---

### TASK 2.20 · Mark-paid celebration en fijos

**Effort:** 4 horas

**Pasos:**
1. `react-native-confetti-cannon` (o componente Skia propio):
   ```tsx
   <ConfettiCannon ref={confettiRef} count={50} origin={{x: -10, y: 0}} fadeOut autoStart={false} />
   ```
2. En `useFijosController.markPaid` post-success:
   - `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`
   - `confettiRef.current?.start()`
   - Toast bottom con mensaje contextual:
     - Si era el último fijo del mes → "Mes cubierto. Todo lo que viene es ahorro 💪"
     - Si quedan otros → "Uno menos para este mes"

---

## 🏁 Fase 2 — Diferenciadores iOS nativos (2-3 semanas)

### TASK 2.7 · iOS Widget interactivo "Add Expense" ⭐

**Effort:** 5-7 días · 💰 BUDGET requerido si tercerizás

**Pasos:**
1. Configurar EAS Build con `expo-build-properties` para enable widget extension
2. Crear extension target Swift en `ios/ManifiestoWidget/`
3. Widget medium-size con SwiftUI:
   - Top: "Cupo hoy" + número grande
   - Bottom: botón "+" (App Intent button)
4. App Intent `LogExpenseIntent`:
   ```swift
   struct LogExpenseIntent: AppIntent {
     static var title: LocalizedStringResource = "Anotar gasto"
     @Parameter(title: "Monto") var amount: Double
     @Parameter(title: "Categoría") var category: CategoryEntity
     func perform() async throws -> some IntentResult {
       // Llamar a Supabase via shared keychain credentials
     }
   }
   ```
5. Bridge JS → Swift via `react-native-targets` o NSUserDefaults (App Group)
6. Widget se actualiza cuando la app refetcha home_snapshot (deep link sync)

**DoD:** Add widget en home screen iOS → muestra cupo correcto → tap "+" → mini sheet → crea expense → app principal lo refleja.

💰 **BUDGET:** si no tenés Swift dev → contractor $1500-2500 USD para esto y 2.8 + 2.10.

---

### TASK 2.8 · Lock-screen widget

**Effort:** 2 días (después de 2.7 la infra está)

Variants: `accessoryCircular` (cupo restante), `accessoryRectangular` (cupo + racha), `accessoryInline` (texto breve).

---

### TASK 2.10 · Live Activity (cupo del día)

**Effort:** 4 días · **Depends on:** 2.7 infra

**Pasos:**
1. ActivityKit framework, configurar entitlement
2. Start Live Activity al primer expense del día (o manualmente desde Settings)
3. Compact view: cupo restante
4. Expanded view: cupo + racha + última transacción
5. Update con `Activity.update()` cada vez que se crea expense
6. End automatic a las 23:59 con summary

---

### TASK 2.9 · Siri Shortcut

**Effort:** 3 días · **Depends on:** 2.7 App Intents

Re-usa `LogExpenseIntent`. Aparece en Atajos automáticamente. Marketing:
> "Hey Siri, anotá 500 pesos en supermercado"

---

### TASK 2.11 · Share Extension

**Effort:** 3 días

Target nuevo en Xcode `ManifiestoShareExtension`. Recibe text/URL/image:
- Si es text con monto detectado por regex (`/\$[\d.,]+/`) → pre-llena monto
- Si es URL (ej. email Coto) → fetch + parse
- Si es image → OCR (item 2.15 reutilizado)

---

### TASK 2.12 · Apple Watch companion

**Effort:** 7-10 días · **Postpone for v1.5**

Construir después del launch. Diferencial pero no crítico para v1.0.

💰 **BUDGET:** contractor WatchKit $2000-3000 USD si querés acelerar.

---

### TASK 2.13 · Calendar/Reminders sync

**Effort:** 2 días

`expo-calendar` ya disponible:
```ts
await Calendar.createEventAsync(defaultCalendarSource, {
  title: `Pagar ${fixedExpense.name}`,
  startDate: fixedExpense.nextDueDate,
  alarms: [{ relativeOffset: -60*24 }] // 1 day before
})
```

Settings: toggle opt-in. Solo sync los fijos con `notify_days_before > 0`.

---

### TASK 2.14 · Dynamic Island

**Effort:** 2 días · **Depends on:** 2.10 Live Activity

Compact/expanded/minimal views del Activity rendereados en Dynamic Island. Sólo iPhone 14 Pro+ — bajo reach.

---

## 🏁 Fase 3 — Features pedidas (1 semana)

### TASK 2.5 · Notes en gastos

**Effort:** 2 días

**Pasos:**
1. Migration: `ALTER TABLE expenses ADD COLUMN notes TEXT`
2. `add-expense-screen.tsx`: textarea collapsable "Agregar nota" (opcional)
3. Expense row: si tiene notes mostrar ícono 📝 + tooltip on tap con full text
4. Schema TS regenerado: `npm run supabase -- gen types typescript ...`

---

### TASK 2.22 · Search en historial

**Effort:** 1 día · **Depends on:** 2.5 (notes contribuyen al search)

**Pasos:**
1. Input search en header de Gastos tab
2. Filter local sobre `description ILIKE '%query%' OR notes ILIKE '%query%'` con debounce 200ms
3. Highlighting de matches en row

---

### TASK 2.6 · Reactions a gastos

**Effort:** 2 días

**Pasos:**
1. Migration:
   ```sql
   CREATE TABLE expense_reactions (
     expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
     user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
     emoji TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (expense_id, user_id, emoji)
   );
   ```
2. RLS: read/write only family members
3. Long-press expense row → emoji picker rápido (5 opciones fijas: ❤️ 👏 😬 💸 🎯)
4. Realtime subscription para refresh
5. Push notif al autor: "María reaccionó 👏 a tu gasto en 'Café'"

---

### TASK 2.21 · Calendar heatmap

**Effort:** 2 días

Reusa el calendar component de Gastos. Coloreo via `dailyBudget vs dailyTotal` precomputed en `useGastosController`.

---

### TASK 2.23 · First-expense walkthrough

**Effort:** 1 día

**Pasos:**
1. `if (expenses.count === 0 && family.created_at < now - 24h)` mostrar coachmark
2. Component `FirstExpenseHero` con CTA gigante "Tu primer gasto ↓"
3. Al cargar 1er gasto → modal full-screen con confetti + tour de 3 cards: "Bien hecho 🎉 — esto es lo que viene"

---

## 🏁 Fase 4 — AI Coach (3-5 días) ⭐

### TASK 2.17 · AI Coach conversacional

**Effort:** 3-5 días · 💰 BUDGET tokens · **CRÍTICO — backend ya wired**

**Pasos:**
1. Cliente: extender `mobile/features/insights/use-asistente-controller.ts` para llamar a edge function `control-advisor`
2. `asistente-screen.tsx`: agregar input "Preguntá lo que quieras" + sheet de respuesta tipo chat
3. Persistir Q&A en tabla nueva `advisor_conversations`
4. Prompt template con context: family snapshot + recent expenses + savings goal
5. **Prompt caching** (Anthropic) en system prompt para reducir costos drasticamente (90% descuento en tokens cached)
6. Free tier: 5 preguntas/mes. Pro: ilimitado. Gating via `useBilling.canUseAICoach()`
7. Telemetry: track `ai_query_sent` + `ai_query_quality` (thumbs up/down después)

**Por qué es CRÍTICO:** el backend con Claude Sonnet ya existe (control-advisor edge function). El gap es sólo de UX. Es el item de mayor ROI en todo el audit.

💰 BUDGET: con prompt caching agresivo + Claude Haiku para queries simples + Sonnet para complejas → ~$0.30/usuario activo/mes. Justifica el upgrade.

---

### TASK 2.16 · Smart categorization

**Effort:** 2 días · **Depends on:** 2.17 infra

En add-expense, después de typear description, debounced llamada a LLM:
```ts
const suggestedCategory = useDebouncedSuggestion(description, categories)
```
Pre-selecciona pero permite override.

---

### TASK 2.15 · OCR receipt scan

**Effort:** 3-5 días · 💰 BUDGET (opcional, on-device free)

**Pasos:**
1. Botón cámara en add-expense
2. `expo-camera` → captura → on-device Vision API via `expo-symbols + react-native-vision-camera-text-recognition` o módulo native iOS
3. Regex + heurística para extraer total (mayor número con "$")
4. Sugerir categoría según comercio detectado
5. Upload foto opcional a Supabase Storage → guardar en `expenses.receipt_url` (col nueva)

Free path: on-device iOS Vision (gratis). Pago path: Google Cloud Vision para mejor cross-platform.

---

## 🏁 Fase 5 — Manifiesto Wrapped (1 semana) ⭐

### TASK 2.4 · Manifiesto Wrapped

**Effort:** 5-7 días · 💰 BUDGET design assets

**Pasos:**
1. **Backend:**
   - Cron mensual día 1 a las 6am calcula `family_wrapped` para el mes anterior
   - Edge function `generate-monthly-wrapped` calcula stats y deja JSON en tabla `monthly_wrapped`
2. **UI:**
   - Modal full-screen al abrir app el día 1 de cada mes (skippable)
   - 10 cards swipeables tipo Spotify Wrapped
   - Cada card es un Skia composition con gradientes brand-aligned
   - Card final: share button → genera image (`react-native-view-shot`) → `Share.share()`
3. **Share image:** 1080×1920 con watermark `manifiesto.app`. Versión Stories-friendly.
4. **Permisos:** opcional opt-in en Settings, opt-out por user

💰 BUDGET: diseño plantilla cards $300-500 (Figma). Tipografía editorial pago $50-100 (DM Serif Display ó similar).

**Por qué importa:** vehículo #1 de growth orgánico. Spotify Wrapped genera más installs que la mayoría de campañas pagas.

---

## 🏁 Fase 6 — Achievements + Bulk + Caps (2 semanas, post-launch)

### TASK 2.2 · Achievements / Badges

**Effort:** 3 días

**Schema:**
```sql
CREATE TABLE achievement_definitions (code TEXT PRIMARY KEY, name TEXT, icon TEXT, ...);
CREATE TABLE achievements_earned (user_id, code, earned_at, ...);
```

Lista inicial: `first_expense`, `first_family`, `first_month_under_budget`, `streak_7`, `streak_30`, `streak_100`, `savings_goal_met`, `no_spend_day`, `year_anniversary`, `100_expenses`.

Settings → "Mis logros" galería + share por logro.

---

### TASK 2.3 · Confetti micro-celebrations

**Effort:** 1-2 días · post-2.2

Unificar helper `useCelebrate(type: 'milestone' | 'streak' | 'achievement')` que dispara confetti + haptic + toast según contexto.

---

### TASK 2.25 · Bulk edit
**Effort:** 1 día

### TASK 2.26 · Category budget caps
**Effort:** 2 días

### TASK 2.27 · Per-category icons
**Effort:** 1 día

### TASK 2.28 · Family reactions feed
**Effort:** 2 días (depends on 2.6)

### TASK 2.18 · Recurring suggestion
**Effort:** 2 días

---

## 📅 Cronograma sugerido

| Semana | Foco | Tasks |
|--------|------|-------|
| **W1** | Loop diario | 2.1 · 2.24 · 2.19 · 2.20 |
| **W2** | Features pedidas | 2.5 · 2.22 · 2.6 · 2.23 |
| **W3** | AI Coach + smart cat | 2.17 · 2.16 |
| **W4** | iOS Widget + Live Activity | 2.7 · 2.8 · 2.9 |
| **W5** | OCR + Share Ext | 2.15 · 2.11 |
| **W6** | Wrapped + assets | 2.4 |
| **W7-8** | Achievements + delight | 2.2 · 2.3 · resto |
| **Post-v1.0** | Watch + Dynamic Island | 2.12 · 2.14 · 2.10 |

---

## ⚠️ Riesgos y dependencias

- **iOS Widgets requieren Swift**: si vos sólo manejás RN/JS, esto cuesta $$$$ o tiempo. Considerá si v1.0 puede salir sin widget interactivo (sí puede) y postponerlo a v1.1.
- **AI Coach token costs**: monitoreá agresivamente. Limit queries free tier. Cache aggressive. Si un usuario sale $5/mes en tokens te come el margen.
- **Apple Live Activity rate limits**: max 16 updates/hora. Si tenés familia muy activa, batching obligatorio.
- **Wrapped storage**: imágenes share pueden ser pesadas. Generarlas on-device, no en servidor.

---

**Próximo doc:** `budget.md` con los costos 💰.
