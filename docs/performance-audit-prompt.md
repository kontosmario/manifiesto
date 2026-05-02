# Prompt — Performance audit con `expo` skill

Pegar este prompt en una sesión nueva de Claude Code (con la skill
`pproenca/dot-skills@expo` instalada) para correr una auditoría completa
de performance sobre Manifiesto.

---

## Prompt

> **Activá la skill `expo`** (`pproenca/dot-skills@expo`,
> 54 reglas Expo + React Native priorizadas por impacto) y usala como
> guía durante todo el trabajo. Si una regla aplica al código que
> estás revisando, citala por su prefijo (`launch-`, `bundle-`,
> `list-`, `image-`, `data-`, `nav-`, `rerender-`, `anim-`, `mem-`).
>
> Hacé una **auditoría de performance end-to-end de Manifiesto**
> (Expo + React Native + Reanimated v4 + Supabase). El producto es
> una app de finanzas familiares para Argentina; el equipo prioriza
> tiempo de arranque, fluidez de animaciones, y consumo de batería en
> sesiones largas.
>
> ### Reglas duras
>
> - **No cambies UI ni copy** sin justificación clara de performance.
> - **No agregues dependencias** sin pedirme aprobación primero.
> - **No edites código todavía** — primero entregame un reporte
>   priorizado. Después de mi OK aplicás los fixes en fases.
> - **Respetá los patterns ya establecidos** en CLAUDE.md y en
>   `~/.claude/projects/-Users-mario-apps-manifiesto/memory/`
>   (worklets sin Intl, freezeOnBlur en tabs, modal pattern de
>   savings-goal, etc.). Si una regla de la skill choca con una
>   memoria del proyecto, la memoria gana — flagealo.
> - **Reanimated v4** está en uso. Si recomendás cambios de
>   animación, deben ser compatibles con v4 (no v2/v3).
> - **No toques migraciones SQL** en este audit (es scope frontend).
>
> ### Alcance
>
> Recorrer estos surfaces críticos en orden:
>
> 1. **App startup** — `app/_layout.tsx`, `mobile/components/root/*`,
>    splash, fuentes, asset preload, providers.
> 2. **Tab bar / navegación** — `mobile/components/navigation/*`,
>    `app/(app)/(tabs)/*`. Re-renders, freezeOnBlur, native stack.
> 3. **Home dashboard** — `mobile/components/home/*`, animaciones,
>    listas, cards.
> 4. **Gastos** — `mobile/components/gastos/*`, `mobile/screens/gastos/*`.
>    Lista virtualizada, filtros, animated transitions.
> 5. **Fijos** — `mobile/components/fijos/*`. Hero card, listas por
>    categoría, smart alerts.
> 6. **Asesor / Control** — `mobile/components/control-v2/*`,
>    `mobile/features/insights/*`. Hooks que computan signals,
>    re-renders al recibir data fresca.
> 7. **Settings + forms** — `mobile/screens/settings/*`,
>    `mobile/components/settings/*`. Inputs, numpads, sheets.
> 8. **Animaciones globales** — `mobile/components/ui/*`
>    (CardParticles, ShineOverlay, RiseView, CountUpText), tokens de
>    motion.
>
> ### Deliverables (en este orden)
>
> 1. **Reporte priorizado** (NO código todavía):
>
>    | Severidad | Significado |
>    |---|---|
>    | 🔴 Critical | Impacto medible en arranque, jank visible, o leak |
>    | 🟠 High | Re-render evitable en hot path, bundle bloat >200KB |
>    | 🟡 Medium | Optimización ahorra <16ms o <100KB |
>    | 🟢 Polish | Buena práctica sin impacto medible aún |
>
>    Cada hallazgo debe incluir:
>    - **Regla de la skill** que aplica (ej. `list-use-flashlist`)
>    - **Archivo + línea** (`mobile/.../foo.tsx:42`)
>    - **Por qué** es un problema (no solo "viola la regla")
>    - **Fix propuesto** en 1-2 líneas
>    - **Costo** (XS / S / M / L) y **riesgo** (low/med/high)
>
>    Subagrupá por categoría de la skill (Launch / Bundle / List /
>    Image / Data / Nav / Re-render / Animation / Memory).
>
> 2. **Top 10 quick wins** — los hallazgos con mejor ratio
>    impacto/costo. Acá quiero la lista corta para discutir antes de
>    aplicar.
>
> 3. **Riesgos / no-go zones** — cosas que la skill recomendaría
>    pero que NO conviene hacer en Manifiesto, con justificación
>    (ej. "no migrar a FlashList en X porque la lista es <20 items
>    y ya está estable").
>
> 4. **Plan de fases** propuesto (cuántos PRs, qué entra en cada
>    uno, qué se mide después de cada uno).
>
> ### Cómo verificar el impacto (sin instalar herramientas nuevas)
>
> - **Bundle**: `npx expo export --platform ios` y mirar tamaños
>   del output, antes/después.
> - **Re-renders**: identificá visualmente con `console.log` en
>   componentes sospechosos durante el reporte; medir antes/después
>   solo en los fixes que aplicamos.
> - **Animation jank**: el sistema de `tokens.ts` ya tiene
>   `prefers-reduced-motion`; aprovechalo para A/B mental.
> - **Startup**: si tenés acceso a `console.time`, marcá puntos
>   clave en root layout. Si no, comentar como "to-measure" en el
>   plan de fases.
>
> ### Output esperado de esta primera pasada
>
> Solo el **reporte + top 10 + riesgos + plan**. Sin código.
> Después yo apruebo y arrancamos por fases (igual que el audit del
> asesor financiero).
>
> Empezá por leer:
> - `~/.agents/skills/expo/SKILL.md` y los archivos en
>   `~/.agents/skills/expo/references/` que correspondan a las
>   categorías que vayas tocando.
> - `CLAUDE.md` del repo si existe, y la `MEMORY.md` global.
> - `package.json` para ver el stack instalado y versiones.

---

## Notas de uso

- Esta auditoría es **solo frontend / mobile**. La parte SQL/Supabase
  ya tuvo su pasada (ver `velocity_snapshot` migration de 2026-05-05).
- Si más adelante querés un audit de animaciones puro, repetí esta
  estructura pero limitando alcance a `mobile/components/ui/*` y
  `mobile/lib/motion/*`.
- La skill se actualiza con `npx skills update`. Si pasa más de
  3 meses entre audits, conviene correrlo antes para tener las
  reglas más nuevas (ej. cuando New Architecture estabilice o
  React Compiler madure).
