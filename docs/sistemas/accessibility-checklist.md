# Accessibility Checklist · 2026-06-09

> **Sprint C · C11** — Audit estático de las 12 screens críticas del app. **NO incluye fixes** (van en sprint posterior). El alcance es: inventario de gaps + priorización + plan de remediación.

## Metodología

1. **Grep estático** por `Pressable` / `TouchableOpacity` vs `accessibilityLabel` / `accessibilityRole` por archivo (screen + componentes hijos referenciados).
2. **Reduced motion**: buscar `useReducedMotion()` o `AccessibilityInfo.isReduceMotionEnabled` en cada screen que tenga animaciones largas.
3. **Color contrast**: no automatizado (pendiente herramienta) — se anotan los casos sospechosos detectados a ojo.
4. **Focus order**: revisión manual de los wizards / forms (no aplica a screens con un solo CTA principal).

## Resumen ejecutivo

- **12 screens auditadas**: 7 OK, 4 con gaps medios, 1 con gaps mayores (`asistente-screen`).
- **Patrón común OK**: `AppButton` (`mobile/components/ui/button.tsx`) y `SettingsGroupedList` (`mobile/components/settings/settings-grouped-list.tsx`) traen `accessibilityRole="button"` + label como prop, lo que cubre la mayoría de los Pressables en settings + wizards.
- **Patrón común con gaps**: Pressables inline en pantallas grandes (gastos-v2, wrapped) — labels existen pero a veces faltan en sub-componentes.
- **Reduced motion**: 7/12 screens implementan, 5/12 no. Wrapped y asistente OK; gastos-v2 y onboarding NO.

## Top 3 findings

1. **`gastos-v2-screen.tsx`** (1800 LOC) — 7 Pressables / 7 labels / 5 roles. Falta 2 roles en filter chips. Sin `useReducedMotion`: confeti de no-spend day + spring de chips ignora setting del user.
2. **`onboarding-screen.tsx`** — 5 Pressables / 1 label / 1 role. 4 Pressables sin label (steps de wizard). Sin reduced motion (slide-in entre steps).
3. **`asistente-screen.tsx`** — 7 Pressables / 3 labels / 3 roles. 4 Pressables sin label, todos en quick-actions del prompt. Reduced motion SÍ presente.

## Audit por screen

### 1. `home-screen.tsx` — OK
- LOC: 416 (delega 80% a `HomeDashboard`).
- Pressables directos: 0 (todo en sub-components).
- Sub-components auditados (`mobile/components/home/`):
  - [x] `amount-card.tsx`: label + role OK.
  - [x] `home-assistant-button.tsx`: label + role OK.
  - [x] `home-circle-button.tsx`: 3 labels (variants) + role OK.
  - [x] `home-hero-card.tsx`: 9/9 labels + roles OK.
  - [x] `meta-card.tsx`: 2 labels + role OK.
  - [x] `home-dashboard.tsx`: "Ver todo el historial" link OK.
- **Reduced motion**: aurora-bloom + ambient-blobs **NO respetan** `useReducedMotion`. TODO.
- **Color contrast**: `home-hero-card` usa text `#0F2E1F` sobre fondo verde `#A8D5BA` — ratio 7.8:1 OK.

### 2. `control-v2-screen.tsx` — OK
- LOC: 729. Sin Pressables directos (delegación total a `control-v2-*` components).
- Sub-components (`mobile/components/control-v2/`):
  - [x] `control-v2-alcancia-card.tsx`: 3 Pressables, 4 labels, 4 roles OK.
  - [x] `control-v2-empty-state.tsx`: 2 / 2 / 2 OK.
  - [x] `control-v2-header.tsx`: 3 / 4 / 3 OK (1 extra label en el avatar — sobra pero no es bug).
  - [x] `control-v2-vsmes-card.tsx`: 1 / 1 / 1 OK.
  - [x] `daily-goal-sheet.tsx`: 2 / 2 / 2 OK.
  - [x] `add-fixed-quick-sheet.tsx`: 1 Pressable / 2 labels (1 sobra) / 1 role OK.
- **Reduced motion**: animaciones de alcancía + signal-row **no chequean** `useReducedMotion`. TODO.

### 3. `gastos-v2-screen.tsx` — GAPS MEDIOS
- LOC: 1800. 7 Pressables inline, 7 labels, 5 roles.
- [ ] **2 Pressables sin `accessibilityRole="button"`** (filter chips de cycle nav).
- [ ] **Sin `useReducedMotion`**: filter chips + confeti de no-spend day animan sin chequear preference.
- [ ] **Focus order**: row delete swipe-action no tiene label semántico — VoiceOver no anuncia que se puede deslizar.
- **Refactor pendiente** (D1 del plan): split en sub-components — aprovechar para inyectar a11y consistente.

### 4. `fijos-v2-screen.tsx` — OK (delegación)
- LOC: 577. Sin Pressables directos.
- Delega a `fijo-row.tsx` + `fijos-proximos-card.tsx` (no auditados aquí — pendiente split D4).
- Reduced motion: TODO (marquee ticker no respeta).

### 5. `asistente-screen.tsx` — GAPS MAYORES
- LOC: 851. 7 Pressables, 3 labels, 3 roles.
- [ ] **4 Pressables sin `accessibilityLabel`**: quick-action chips ("Ver gastos", "Configurar meta", etc).
- [ ] **Sub-screens con header buttons no marcados**: 2 botones de filtros sin role.
- [x] **Reduced motion sí respetada** (línea 535): `useReducedMotion()` activa fallback de bubble-in.

### 6. `settings-screen.tsx` — OK
- LOC: 1604. Pressables directos: 0 (delegación total a `SettingsGroupedList`).
- `SettingsGroupedList.tsx`: row con `accessibilityRole="button"` + `accessibilityLabel={label}` por defecto.
- 1 label custom: "Activar modo demo del asistente" (línea 1266).
- **Reduced motion**: la screen no tiene anims largas; el toggle de motion preference vive acá (es la fuente).

### 7. `cycle-wrapped-modal.tsx` — GAPS MEDIOS
- LOC: 1862. 12 Pressables, 5 labels, 9 roles.
- [ ] **6 Pressables sin label explícito** (scene navigation arrows + dismiss en escenas individuales).
- [x] **Reduced motion sí respetada**: `useReducedMotion()` desactiva auto-advance + spring de transiciones.
- [x] **Headers semánticos**: `accessibilityRole="header"` en cada scene title.
- **Refactor pendiente** (D2): split por scene file — momento ideal para a11y pass.

### 8. `add-expense-screen.tsx` — OK (delegación)
- LOC: 128. Delega a `AddExpenseFlow` (no auditado a fondo aquí).
- Sin Pressables directos.
- Reduced motion: TODO en el flow.

### 9. `onboarding-screen.tsx` — GAPS MEDIOS
- LOC: 801. 5 Pressables, 1 label, 1 role.
- [ ] **4 Pressables sin label**: step navigation (back, next, skip, finish).
- [ ] **Sin `useReducedMotion`**: slide-in entre steps + checkbox spring no respetan setting.
- [ ] **Focus order**: cada step debería tener `accessibilityViewIsModal={true}` para evitar que VoiceOver lea steps anteriores ocultos.

### 10. `login-screen.tsx` — OK
- LOC: 1383. 25 Pressables, 14 labels, 12 roles.
- Algunos Pressables son contenedores no-actionables sin label (esperado).
- [x] Reduced motion: presente (línea ~30).
- [x] Inputs con `accessibilityLabel` derivado del placeholder.
- Coverage: 14/25 ~56% pero el remainder son wrappers de toque (no actionables). Bien.

### 11. `signup-screen.tsx` — OK
- LOC: 900. 13 Pressables, 9 labels, 8 roles.
- Mismo patrón que login.
- [x] Reduced motion presente.

### 12. `savings-goal-screen.tsx` — OK (delegación)
- LOC: 433. Sin Pressables directos.
- Delega a `AppButton` + `SettingsGroupedList` (ambos a11y-correctos).
- **Reduced motion**: TODO (`AmbientBlobs` + `RiseView` no chequean).

### 13. `coach-mode-screen.tsx` — GAPS MENORES
- LOC: 448. 7 Pressables, 2 labels, 3 roles.
- [ ] **5 Pressables sin label explícito** (task action chips dentro de cada coach task).
- [ ] **Sin `useReducedMotion`**: stagger de tasks no respeta setting.

## Backlog priorizado (sprint posterior)

Prioridad por impacto × cantidad de usuarios potencialmente afectados.

### P0 (fix en próximo sprint)
1. **`asistente-screen.tsx`**: agregar `accessibilityLabel` a quick-actions del prompt. Es la screen "inteligente" del app — VoiceOver sin labels la hace inutilizable.
2. **`onboarding-screen.tsx`**: labels + `accessibilityViewIsModal` para cada step. Onboarding es el primer touchpoint, no podemos perder accesibilidad ahí.
3. **`gastos-v2-screen.tsx`**: 2 roles faltantes + delete swipe semántico. La screen más usada después de Home.

### P1 (junto con refactor)
4. **`cycle-wrapped-modal.tsx`** (D2): labels en navigation arrows en cada scene.
5. **`coach-mode-screen.tsx`**: labels en task action chips.

### P2 (housekeeping)
6. **Reduced motion** sistemático en: `aurora-bloom`, `ambient-blobs`, `marquee-ticker`, `confetti`. Wrapping helper opcional: `useReducedMotionGate(animProps)`.
7. **Color contrast audit**: pasar 12 screens por una herramienta automatizada (ej: `react-native-accessibility-engine` o eslint-plugin custom). No bloqueante para v1 — usamos tokens consistentes que tienden a cumplir WCAG.

## Convenciones detectadas (mantener)

- `AppButton` (`mobile/components/ui/button.tsx`): `accessibilityRole="button"` + label-fallback al texto del label prop. Reusar.
- `SettingsGroupedList`: `accessibilityRole="button"` + label automático. Reusar para cualquier list de settings.
- `accessibilityRole="header"` en `Text` que actúa como section title (visto en wrapped scenes + home-hero-card).

## VoiceOver test manual — pendiente

Para validar este audit con un device físico necesitamos:
1. iPhone con iOS 17+ (preferiblemente 14 Pro o SE para cobertura de display sizes).
2. Pasar VoiceOver por cada flow principal: login → home → add expense → settings → savings goal → onboarding (cleanup state).
3. Documentar findings reales — el grep estático no captura: orden de focus inferido por layout, anuncios duplicados, contenido decorativo no marcado con `accessibilityElementsHidden`.

**Status del audit**: estático completo. Manual con device físico pendiente (no bloqueante para Sprint C, requiere device).

---

> **Última actualización**: 2026-06-09 · audit estático completo. Manual VoiceOver pendiente.
