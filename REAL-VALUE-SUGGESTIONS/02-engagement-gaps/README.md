# 02 · Engagement gaps

> Por qué Manifiesto no es **atrapante** todavía. La app es operativa y funcional, pero le faltan los loops emocionales que retienen al usuario: celebraciones, streaks visibles, recaps, reactions sociales, afordancias iOS-nativas.

📂 **Documentos:**
- `audit.md` — gaps de engagement vista-por-vista
- `roadmap.md` — implementación priorizada
- `budget.md` — items con costo 💰

---

## 📊 Status board

| # | Item | Estado | Impacto retención | Esfuerzo | 💰 |
|---|------|--------|-------------------|----------|-----|
| 2.1 | ~~Streaks UI prominente en Home~~ | ⛔ NOT APPLICABLE — decisión owner 2026-05-12: el streak queda solo en Gastos (donde ya está prominente vía `StreakFlameIcon` en el header). Web parity también arreglado el mismo día. Audit claim "table missing" era falso: `user_streaks` SÍ existe en producción | — | — | — |
| 2.2 | Achievements / badges (Arranque → Leyenda) | ✅ DONE (2026-05-12) — catálogo DB de 11 codes + 7 triggers de detección + lockdown service-role + galería en Settings → Tu progreso → Logros + unlock modal realtime con confetti | Alto | 3 días | — |
| 2.3 | Confetti + micro-celebrations en milestones | ✅ DONE (2026-05-12) — `ConfettiBurst` reusable + cubre mark-paid fijos + unlock achievements + Wrapped positive. Goal milestones (25/50/75) también disparan confetti vía modal de unlock | Medio | 1-2 días | — |
| 2.4 | Manifiesto Wrapped (mes/año) | ✅ DONE (2026-05-12) — editorial scenes player (5 escenas, tap-to-advance, progress bars). Disparo automático post-cobro + dev preview. **Bonus: archivo persistente en Settings → Tu progreso → Ediciones** (tap revive cualquier ciclo cerrado) | Alto + viralidad | 5-7 días | — |
| 2.5 | Notes/comments en gastos (col + UI) | ✅ DONE (2026-05-12) — col + CHECK + 3 RPCs actualizadas + NotesRow component colapsado + display en GastoRow | Alto | 2 días | — |
| 2.6 | Reactions a gastos del partner (❤️😬👏) | ⛔ SKIP (decisión owner 2026-05-12) — el producto es utilitario, no social. Reaccionar al alquiler de tu pareja genera fricción doméstica | Alto (familia) | 2 días | — |
| 2.7 | iOS Widget interactivo (Add Expense) | 🔴 TO DO | Muy alto (diferencial) | 5-7 días | 💰 dev experto |
| 2.8 | Lock-screen widget (cupo diario) | 🔴 TO DO | Alto | 2 días | — |
| 2.9 | Siri Shortcut ("Anotá 1200 supermercado") | 🔴 TO DO | Medio | 3 días | — |
| 2.10 | Live Activity (cupo del día durante el día) | 🔴 TO DO | Alto | 4 días | — |
| 2.11 | Share Extension (capturar gasto desde mail/safari) | 🔴 TO DO | Medio | 3 días | — |
| 2.12 | Apple Watch companion | 🔴 TO DO | Alto (delight) | 7-10 días | — |
| 2.13 | Apple Calendar/Reminders sync (fijos due dates) | 🔴 TO DO | Medio | 2 días | — |
| 2.14 | Dynamic Island support | 🔴 TO DO | Bajo | 2 días | — |
| 2.15 | OCR receipt scan | 🟡 QUEUED — owner confirma uso de **Gemini 2.5 Flash**. Pendiente: tokens + edge function `ocr-proxy` + UI en add-expense | Muy alto | 3-5 días | 💰 Gemini tokens |
| 2.16 | Smart categorization (LLM) | ⏸️ DEFERRED — parte del mapa de augmentation del Asistente (Tier 2 punto 5). Trigger: ≥500 MAU + Bucket B activo | Alto | 2 días | 💰 LLM tokens |
| 2.17 | AI Coach conversacional | ⏸️ DEFERRED (owner 2026-05-12) — el "asistente" actual es 100% heurístico y bien diseñado (20+ builders, persona inference, signal fusion, super-signals). Mantenerlo así por ahora. Oportunidades de augmentation LLM documentadas en `docs/asistente-llm-augmentation-notes.md` para cuando el owner reabra la decisión (trigger: ≥500 MAU + Bucket B activo). | Muy alto | 3 días | 💰 Anthropic tokens |
| 2.18 | Recurring suggestion (12 cargas → "creá fijo?") | 🔴 TO DO | Medio | 2 días | — |
| 2.19 | Daily closure recap notification | 🔴 TO DO | Alto | 1 día | — |
| 2.20 | Mark-paid celebration en fijos | 🔴 TO DO | Bajo + delight | 4h | — |
| 2.21 | Calendar heatmap en Gastos (under/over cupo) | 🔴 TO DO | Medio | 2 días | — |
| 2.22 | Search por descripción en historial | ⛔ SKIP (decisión owner 2026-05-12) — ya existe búsqueda contextual en `expense-filters-screen` (searchQuery persistido). Pagination + filtros por período/categoría colapsan 90% del dataset. Global search sería redundancia | Medio (utility) | 1 día | — |
| 2.23 | First-expense walkthrough | 🔴 TO DO | Alto | 1 día | — |
| 2.24 | Streak at-risk visual alarm | 🔴 TO DO | Alto | 4h | — |
| 2.25 | Bulk edit (recategorize multiple) | 🔴 TO DO | Bajo | 1 día | — |
| 2.26 | Category budget caps | 🔴 TO DO | Medio | 2 días | — |
| 2.27 | Per-category icons (no solo dots) | 🔴 TO DO | Polish | 1 día | — |
| 2.28 | Family member reactions feed | 🔴 TO DO | Alto | 2 días | — |

---

## 🎯 Foco recomendado (Top 5 ROI) — refresh 2026-05-12

Estado al 2026-05-12: **4 de los 5 cerrados**.

1. ✅ **2.1 Streaks UI + persistencia** — base de retención diaria (ya estaba + web parity fixed)
2. ⏸️ **2.17 AI Coach LLM** — deferred hasta ≥500 MAU + Bucket B. Asistente heurístico actual cubre el caso. Mapa de augmentation listo en `docs/asistente-llm-augmentation-notes.md`
3. ✅ **2.5 Notes en gastos** — DONE 2026-05-12
4. ⏸️ **2.7 iOS Widget** — bloqueado por Apple Developer Program
5. ✅ **2.4 Manifiesto Wrapped** — DONE 2026-05-12 + bonus de archivo persistente (Ediciones)

**Próximo foco propuesto (post Top 5)**: OCR con Gemini 2.5 Flash, cuando el owner configure tokens.

---

## 🔗 Cross-refs

- AI Coach como feature paid → `../03-monetization/`
- Widget assets en marketing → `../04-aso/`
- Schema changes (streaks table, notes column) → `../05-quality-readiness/`
