# Visual & Motion Audit · 2026-05-12

> Auditoría pantalla-por-pantalla aplicando `/impeccable` + `/emil-design-eng` + `/ui-ux-pro-max` para llevar cada surface a "production-grade craft".
> Single source of truth para este frente. Cada pantalla tiene su sub-sección abajo; van pasando de 🔴 TO DO → 🟡 IN PROGRESS → ✅ DONE con findings + fixes.

---

## 🎯 Objetivo

Hoy cada pantalla está en su "prime" funcional. Este audit eleva visualmente cada surface a:

- **Motion smoother**: easing curves correctas, durations en banda 150-300ms, stagger consistente, spring-physics donde el caso lo pide
- **Visual impeccable**: color strategy committed, no hero-metric SaaS, no card-grid clone, AA contrast verificado
- **Interaction Emil-grade**: press-scale en todo lo tappable, halo donde hue colisiona, haptics intencionales, exit faster than enter
- **A11y solid**: accessibilityLabels, Dynamic Type, reduced motion respetado en todos los flujos

---

## 📐 Rubric (7 dimensiones)

Cada pantalla se evalúa en estos 7 ejes. Cada eje recibe ✅ pass / 🟡 mid / 🔴 fix con notas concretas (no labels vacíos).

### 1. Color discipline (impeccable)
- Color strategy explícita (restrained / committed / full palette / drenched)
- Semantic tokens vs hardcoded hex
- Sin `#fff` / `#000` puros; neutrales tinteados al hue de marca
- Light + dark mode parity (no inferido de uno solo)
- AA contrast 4.5:1 body / 3:1 large verificable

### 2. Typography (impeccable + uipro)
- Hierarchy via weight + scale ratio ≥1.25 entre niveles
- Line-length ≤65-75ch en bloques de texto
- Letter-spacing intencional (no default en displays)
- Tabular nums (`fontVariant: ['tabular-nums']`) en montos, contadores, timers
- Font scale consistente con la rest of the app

### 3. Layout & spacing (impeccable + uipro)
- 4/8pt spacing rhythm (no valores arbitrarios)
- Safe area top + bottom respetados
- Sin nested scrolls
- Cards usados solo cuando son la mejor afordancia (sin nested cards)
- Sin grid de cards idénticos (template SaaS reflex)

### 4. Motion (emil)
- Custom easing curves (no built-in `ease-in` en UI; usar `cubic-bezier(0.16, 1, 0.30, 1)` ease-out-expo o equivalente)
- Duration 150-300ms para micro-interactions
- Stagger 30-80ms en listas
- `useReducedMotion` respetado (no skip total: reducir, no apagar)
- Springs vs timing elegidos con intención
- Exit ~60-70% del enter duration

### 5. Interaction & touch (emil + uipro)
- `usePressScale(0.97)` en todo lo tappable (rows, cards, CTAs)
- Touch-target ≥44pt (con hitSlop si visual es más chico)
- Haptic en confirmations + destructive actions
- Disabled states visualmente claros (opacity 0.38-0.5 + cursor)
- Loading state visible >300ms con skeleton/shimmer

### 6. Accessibility (uipro)
- `accessibilityLabel` en icon-only buttons
- `accessibilityRole` correcto (button / header / etc)
- Focus order matches visual order
- Dynamic Type no rompe layout (largest size testeado)
- Color-not-only signaling (siempre + icon o + texto)

### 7. Anti-AI-slop (impeccable)
- Sin side-stripe borders (≥1px colored border-left/right como acento)
- Sin gradient text (`background-clip: text` + gradient)
- Sin glassmorphism como default decorativo
- Sin hero-metric SaaS template (big-number + small-label + stat grid genérico)
- Sin identical card grid (8 cards iguales con icon + heading + text)
- Sin em dashes (`—` o `--`); usar comas, dos puntos, paréntesis

---

## 📊 Status board

| # | Pantalla | Ruta | Tier | Estado | Score antes | Score después |
|---|---------|------|------|--------|-------------|---------------|
| 1 | Home | `/(tabs)/home` | T1 | ✅ DONE | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 2 | Gastos v2 | `/(tabs)/expenses` | T1 | 🔴 TO DO | — | — |
| 3 | Fijos v2 | `/(tabs)/fixed-expenses` | T1 | 🔴 TO DO | — | — |
| 4 | Control v2 | `/(tabs)/insights` | T1 | 🔴 TO DO | — | — |
| 5 | Add expense | `/add-expense` (modal) | T1 | 🔴 TO DO | — | — |
| 6 | Asistente | `/asistente` (modal) | T2 | 🔴 TO DO | — | — |
| 7 | Notificaciones | `/notifications` | T2 | 🔴 TO DO | — | — |
| 8 | Historial gastos | `/expenses-history` | T2 | 🔴 TO DO | — | — |
| 9 | Filtros gastos | `/expense-filters` (modal) | T2 | 🔴 TO DO | — | — |
| 10 | Categorías gastos | `/expense-categories` (modal) | T2 | 🔴 TO DO | — | — |
| 11 | Coach signal | `/coach/[signalId]` (modal) | T2 | 🔴 TO DO | — | — |
| 12 | Add fijo | `/add-fixed-expense` (modal) | T2 | 🔴 TO DO | — | — |
| 13 | Add income | `/add-income` (modal) | T2 | 🔴 TO DO | — | — |
| 14 | Settings root | `/settings` | T3 | 🔴 TO DO | — | — |
| 15 | Logros gallery | `/settings/achievements` | T3 | 🟢 LIKELY OK (polished 2026-05-12) | — | — |
| 16 | Ediciones | `/settings/editions` | T3 | 🟢 LIKELY OK (built 2026-05-12) | — | — |
| 17 | Savings goal | `/savings-goal` | T3 | 🔴 TO DO | — | — |
| 18 | Family admin | `/settings/family-admin` | T3 | 🔴 TO DO | — | — |
| 19 | Asistente prefs | `/settings/asistente` | T3 | 🔴 TO DO | — | — |
| 20 | Notifs prefs | `/settings/notifications` | T3 | 🔴 TO DO | — | — |
| 21 | Household setup | `/household-setup` (modal) | T3 | 🔴 TO DO | — | — |
| 22 | Plan / Billing | `/settings/plan` | T3 | 🔴 TO DO | — | — |
| 23 | Welcome | `/(auth)/welcome` | T4 | 🔴 TO DO | — | — |
| 24 | Login | `/(auth)/login` | T4 | 🔴 TO DO | — | — |
| 25 | Signup | `/(auth)/signup` | T4 | 🔴 TO DO | — | — |
| 26 | Forgot/Reset/Join/Callback | varios | T4 | 🔴 TO DO | — | — |
| 27 | Onboarding | `/onboarding` (modal) | T4 | 🔴 TO DO | — | — |
| 28 | Blocking screen | shared | T5 | 🔴 TO DO | — | — |

**Tiers**:
- **T1** (5): core daily-use (tabs + add-expense modal). Mayor visibilidad → audit primero.
- **T2** (8): high-engagement secondary modals + screens.
- **T3** (9): settings tree.
- **T4** (5): auth + onboarding (first impression, no revisited).
- **T5** (1): shared / edge screens.

**Excluidos del audit** (internal-only): `dev-health`, `achievements-streak-preview`, `cycle-wrapped-preview`. Su valor es de iteración interna, no UX final.

---

## 🛠️ Workflow por pantalla

Para cada pantalla:

1. **Read pass** — leer el código completo de la screen + componentes principales
2. **Score antes** — gut score 1-5 estrellas sin tocar nada
3. **Findings por eje** — completar las 7 dimensiones con notas concretas (no "puede mejorar")
4. **Priorizar fixes** — máximo 3 fixes por pantalla por iteración (S/M/L tamaño). Más que eso es scope creep.
5. **Implement** — los 3 fixes en commit dedicado
6. **Score después** — re-score
7. **Update tracker** — cambiar 🔴 → ✅ en status board, llenar sub-sección de la pantalla

**Regla de oro**: si una pantalla necesita >3 fixes para llegar a ⭐⭐⭐⭐, vale más rediseñarla parcialmente en otro hito que parchearla.

---

## 📚 Subsecciones por pantalla

Cada sub-sección se llena cuando esa pantalla pasa de 🔴 → 🟡 → ✅. Hasta entonces queda como `<!-- TODO -->`.

<!-- ────────────────────────────────────────────────────────── -->

### 1. Home `/(tabs)/home`

**Estado**: ✅ DONE (2026-05-12)
**Score antes**: ⭐⭐⭐⭐ · **Score después**: ⭐⭐⭐⭐⭐

#### Findings

| Eje | Estado | Notas |
|---|---|---|
| 1. Color discipline | ✅ | Theme tokens semánticos. Hardcodes (`#F2A78C`, `#F8D1C3`, `#F2EAD3`) son del brand palette en `palette.ts`. Light/dark parity. |
| 2. Typography | ✅ | `CountUpText` ya aplica `TABULAR` internamente (verificado en `count-up-text.tsx:83`). Hierarchy 14pt→34pt (2.4× ratio). Letter-spacing -1.2 en hero name. |
| 3. Layout & spacing | ✅ | Gap-based stack 8dp. Safe area por `Screen`. Sin nested cards. |
| 4. Motion | 🟡→✅ | Stagger excelente en hero (60/80/120/140/160/240 ms internals). **Fix aplicado**: activity rows arrancaban a 400ms (último a 700ms) — ahora `Math.min(180 + index * 40, 360)`. |
| 5. Interaction & touch | 🟡→✅ | Hero setup CTA + "Ver todos" link tenían opacity-only feedback. **Fix aplicado**: ambos con `usePressScale(0.96-0.98)` + spring. |
| 6. A11y | ✅ | Hero `accessibilityRole="summary"` + composed label. Greeting con header role. Circle buttons con labels. Trend % composed para screen readers. |
| 7. Anti-AI-slop | ✅ | Sin side-stripes, gradient text, glass default, hero-metric template, card-grid clone, em dashes en copy. |

#### Fixes aplicados

1. **[S] Press scale en Hero setup CTA** — wrapped el `Pressable` interno con `Animated.View` + `usePressScale(0.98)`. Reemplazó el `opacity: 0.92` viejo. ([home-hero-card.tsx](../mobile/components/home/home-hero-card.tsx))
2. **[S] Press scale en "Ver todos" link** — `usePressScale(0.96)` + `Animated.View` wrapping el Text. Antes era Pressable default (opacity). ([home-dashboard.tsx](../mobile/components/home/home-dashboard.tsx))
3. **[S] Activity stagger faster start** — delay `400 + index * 60` → `Math.min(180 + index * 40, 360)`. Primer row entra -55% más rápido (180ms vs 400ms), cap total 360ms vs 700ms anterior. ([home-activity-section.tsx](../mobile/components/home/home-activity-section.tsx))

#### Comments

Home ya estaba en su prime visual (gradient + aurora + shine + particles + breathing dot + day chip + pulse warning). Los 3 fixes son refinamientos de feel responsivo. La pantalla pasó de "muy buena" a "Emil-grade" con cambios totales <30 LOC.

<!-- ────────────────────────────────────────────────────────── -->

### 2. Gastos v2 `/(tabs)/expenses`

**Estado**: 🔴 TO DO

<!-- Pendiente. -->

<!-- ────────────────────────────────────────────────────────── -->

### 3. Fijos v2 `/(tabs)/fixed-expenses`

**Estado**: 🔴 TO DO

<!-- Pendiente. -->

<!-- ────────────────────────────────────────────────────────── -->

### 4. Control v2 `/(tabs)/insights`

**Estado**: 🔴 TO DO

<!-- Pendiente. -->

<!-- ────────────────────────────────────────────────────────── -->

### 5. Add expense `/add-expense`

**Estado**: 🔴 TO DO

<!-- Pendiente. -->

<!-- (Tier 2-5 subsecciones se agregan inline a medida que avanzamos) -->

---

## 🚦 Reglas de ejecución (anti-spaghetti)

- **Una pantalla por commit** (excepto si dos comparten un fix raíz)
- **Cada commit termina con typecheck + lint verdes**
- **Mover el status board ANTES del commit final** así el doc nunca queda desfasado
- **No mezclar audit con features nuevas** — si en el camino aparece algo que merece feature, abrir issue/queue en STATUS-2026-05-11.md y seguir con el audit
- **Si una pantalla pide >3 fixes**, partir en sprints: audit doc nota "Sprint 1: A/B/C" + "Sprint 2: D/E/F" en su sub-sección

---

## 🔗 Referencias

- Sistemas vivos cuya estética sirve de norte: `docs/cycle-wrapped-system.md` (Wrapped editorial scenes), `docs/achievements-system.md`, `docs/editions-system.md`
- Tokens de motion: `mobile/lib/motion.ts`
- Paleta: `mobile/theme/palette.ts`
- Skills: `/impeccable`, `/emil-design-eng`, `/ui-ux-pro-max`

---

## 📝 Log de cambios

- **2026-05-12** — Doc creado. 28 pantallas catalogadas, rubric establecido, status board inicializado.
- **2026-05-12** — Pantalla 1/28 (Home) auditada + 3 fixes aplicados. Score ⭐⭐⭐⭐ → ⭐⭐⭐⭐⭐.
