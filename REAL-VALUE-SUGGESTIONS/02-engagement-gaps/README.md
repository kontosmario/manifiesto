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
| 2.3 | Confetti + micro-celebrations en milestones | 🟡 PARTIAL — mark-paid de fijos DONE 2026-05-12 con `ConfettiBurst` component reusable. Otros milestones (meta alcanzada, ciclo bajo cupo) quedan TODO para Bucket D | Medio | 1-2 días | — |
| 2.4 | Manifiesto Wrapped (mes/año) | 🔴 TO DO | Alto + viralidad | 5-7 días | 💰 design |
| 2.5 | Notes/comments en gastos (col + UI) | ✅ DONE (2026-05-12) — col + CHECK + 3 RPCs actualizadas + NotesRow component colapsado + display en GastoRow | Alto | 2 días | — |
| 2.6 | Reactions a gastos del partner (❤️😬👏) | 🔴 TO DO | Alto (familia) | 2 días | — |
| 2.7 | iOS Widget interactivo (Add Expense) | 🔴 TO DO | Muy alto (diferencial) | 5-7 días | 💰 dev experto |
| 2.8 | Lock-screen widget (cupo diario) | 🔴 TO DO | Alto | 2 días | — |
| 2.9 | Siri Shortcut ("Anotá 1200 supermercado") | 🔴 TO DO | Medio | 3 días | — |
| 2.10 | Live Activity (cupo del día durante el día) | 🔴 TO DO | Alto | 4 días | — |
| 2.11 | Share Extension (capturar gasto desde mail/safari) | 🔴 TO DO | Medio | 3 días | — |
| 2.12 | Apple Watch companion | 🔴 TO DO | Alto (delight) | 7-10 días | — |
| 2.13 | Apple Calendar/Reminders sync (fijos due dates) | 🔴 TO DO | Medio | 2 días | — |
| 2.14 | Dynamic Island support | 🔴 TO DO | Bajo | 2 días | — |
| 2.15 | OCR receipt scan | 🔴 TO DO | Muy alto | 3-5 días | 💰 Vision API |
| 2.16 | Smart categorization (LLM) | 🔴 TO DO | Alto | 2 días | 💰 LLM tokens |
| 2.17 | AI Coach conversacional | ⏸️ DEFERRED (owner 2026-05-12) — el "asistente" actual es 100% heurístico y bien diseñado (20+ builders, persona inference, signal fusion, super-signals). Mantenerlo así por ahora. Oportunidades de augmentation LLM documentadas en `docs/asistente-llm-augmentation-notes.md` para cuando el owner reabra la decisión (trigger: ≥500 MAU + Bucket B activo). | Muy alto | 3 días | 💰 Anthropic tokens |
| 2.18 | Recurring suggestion (12 cargas → "creá fijo?") | 🔴 TO DO | Medio | 2 días | — |
| 2.19 | Daily closure recap notification | 🔴 TO DO | Alto | 1 día | — |
| 2.20 | Mark-paid celebration en fijos | 🔴 TO DO | Bajo + delight | 4h | — |
| 2.21 | Calendar heatmap en Gastos (under/over cupo) | 🔴 TO DO | Medio | 2 días | — |
| 2.22 | Search por descripción en historial | 🔴 TO DO | Medio (utility) | 1 día | — |
| 2.23 | First-expense walkthrough | 🔴 TO DO | Alto | 1 día | — |
| 2.24 | Streak at-risk visual alarm | 🔴 TO DO | Alto | 4h | — |
| 2.25 | Bulk edit (recategorize multiple) | 🔴 TO DO | Bajo | 1 día | — |
| 2.26 | Category budget caps | 🔴 TO DO | Medio | 2 días | — |
| 2.27 | Per-category icons (no solo dots) | 🔴 TO DO | Polish | 1 día | — |
| 2.28 | Family member reactions feed | 🔴 TO DO | Alto | 2 días | — |

---

## 🎯 Foco recomendado (Top 5 ROI)

Si tuvieras que elegir SOLO 5 antes del launch, en este orden:

1. **2.1 Streaks UI + persistencia** — base de retención diaria
2. **2.17 AI Coach** (backend ya existe!) — diferencial competitivo + paywall hook
3. **2.5 Notes en gastos** — feature pedida implícitamente en docs
4. **2.7 iOS Widget** — diferencial viral + ASO halo
5. **2.4 Manifiesto Wrapped** — viralidad orgánica + ASO

---

## 🔗 Cross-refs

- AI Coach como feature paid → `../03-monetization/`
- Widget assets en marketing → `../04-aso/`
- Schema changes (streaks table, notes column) → `../05-quality-readiness/`
